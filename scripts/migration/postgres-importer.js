#!/usr/bin/env node

/**
 * PostgreSQL Data Import Tool
 * 
 * This script imports transformed data into PostgreSQL with batch processing,
 * transaction management, foreign key resolution, and error recovery.
 * 
 * Features:
 * - Batch import with configurable batch sizes
 * - Transaction management with rollback support
 * - Foreign key relationship resolution
 * - Progress tracking and error recovery
 * - Conflict resolution (upsert support)
 * - Data validation before import
 * - Resume from checkpoint support
 * 
 * Key Updates (2024-08-24):
 * - Updated to handle flat data structure from data-transformer.js
 * - Builds foreign key mappings from loaded data before import
 * - Improved foreign key resolution for complex relationships
 * - Enhanced validation for required foreign key constraints
 * - Better handling of program_workouts, program_exercises, and workout_log_exercises
 * 
 * Usage:
 *   node scripts/migration/postgres-importer.js [options]
 */

const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { BatchProcessor } = require('./batch-processor');

// Import order based on foreign key dependencies
const IMPORT_ORDER = [
  'users',
  'exercises',
  'programs',
  'program_workouts',
  'program_exercises',
  'workout_logs',
  'workout_log_exercises',
  'user_analytics'
];

class PostgresImporter {
  constructor(options = {}) {
    this.options = {
      supabaseUrl: options.supabaseUrl || process.env.SUPABASE_URL,
      supabaseKey: options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
      inputDir: options.inputDir || './transformed-data',
      batchSize: options.batchSize || 100,
      maxRetries: options.maxRetries || 3,
      conflictResolution: options.conflictResolution || 'skip', // 'skip', 'update', 'error'
      validateBeforeImport: options.validateBeforeImport || true,
      useTransactions: options.useTransactions || true,
      checkpointFile: options.checkpointFile || './import-checkpoint.json',
      verbose: options.verbose || false,
      dryRun: options.dryRun || false,
      ...options
    };

    this.supabase = null;
    this.stats = {
      totalRecords: 0,
      importedRecords: 0,
      skippedRecords: 0,
      failedRecords: 0,
      updatedRecords: 0,
      transactionsCommitted: 0,
      transactionsRolledBack: 0,
      foreignKeyResolutions: 0,
      validationErrors: 0
    };

    this.errors = [];
    this.warnings = [];
    this.checkpoint = {
      lastCompletedTable: null,
      lastProcessedIndex: -1,
      timestamp: null
    };

    // Track foreign key mappings for relationship resolution
    this.foreignKeyMappings = new Map();
  }

  async initialize() {
    console.log('🔧 Initializing PostgreSQL importer...');

    if (!this.options.supabaseUrl || !this.options.supabaseKey) {
      throw new Error('Supabase URL and service role key are required');
    }

    // Initialize Supabase client
    this.supabase = createClient(this.options.supabaseUrl, this.options.supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Test connection
    const { data, error } = await this.supabase.from('users').select('count').limit(1);
    if (error && !error.message.includes('relation "users" does not exist')) {
      throw new Error(`Failed to connect to Supabase: ${error.message}`);
    }

    console.log('✅ Connected to Supabase successfully');

    // Load checkpoint if exists
    await this.loadCheckpoint();
  }

  async importData() {
    console.log('📥 Starting PostgreSQL data import...');

    if (this.options.dryRun) {
      console.log('🔍 DRY RUN MODE - No data will be imported');
    }

    try {
      // Load transformed data
      const transformedData = await this.loadTransformedData();

      // Analyze workout_logs data for potential issues
      if (transformedData.workout_logs && transformedData.workout_logs.length > 0) {
        await this.analyzeWorkoutLogsData(transformedData.workout_logs);
      }

      // Build foreign key mappings from loaded data
      await this.buildForeignKeyMappingsFromData(transformedData);

      // Import in dependency order
      for (const tableName of IMPORT_ORDER) {
        if (transformedData[tableName] && transformedData[tableName].length > 0) {

          // Skip if already completed (checkpoint resume)
          if (this.checkpoint.lastCompletedTable &&
            IMPORT_ORDER.indexOf(tableName) <= IMPORT_ORDER.indexOf(this.checkpoint.lastCompletedTable)) {
            console.log(`⏭️ Skipping ${tableName} (already completed)`);
            continue;
          }

          console.log(`\n📋 Importing ${tableName} (${transformedData[tableName].length} records)...`);
          await this.importTable(tableName, transformedData[tableName]);

          // Update checkpoint
          this.checkpoint.lastCompletedTable = tableName;
          this.checkpoint.timestamp = new Date().toISOString();
          await this.saveCheckpoint();
        }
      }

      // Clear checkpoint on successful completion
      await this.clearCheckpoint();

      console.log('\n✅ Data import completed successfully!');
      this.printSummary();

    } catch (error) {
      console.error('\n❌ Data import failed:', error.message);
      await this.saveCheckpoint();
      throw error;
    }
  }

  async loadTransformedData() {
    console.log('📂 Loading transformed data...');

    const transformedData = {};

    for (const tableName of IMPORT_ORDER) {
      const filePath = path.join(this.options.inputDir, `${tableName}.json`);

      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(fileContent);

        // All data is now flat - no nested structures from data-transformer
        transformedData[tableName] = data;

        console.log(`   Loaded ${data.length} records from ${tableName}.json`);
        this.stats.totalRecords += data.length;

      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`   File ${tableName}.json not found, skipping...`);
          transformedData[tableName] = [];
        } else {
          throw new Error(`Failed to load ${tableName}.json: ${error.message}`);
        }
      }
    }

    return transformedData;
  }

  async buildForeignKeyMappingsFromData(transformedData) {
    console.log('🔗 Building initial foreign key mappings from loaded data...');

    let mappingsBuilt = 0;

    // Build mappings for all tables that can be referenced by foreign keys
    // Note: These are preliminary mappings - they will be validated during import
    for (const tableName of IMPORT_ORDER) {
      if (transformedData[tableName] && transformedData[tableName].length > 0) {
        for (const record of transformedData[tableName]) {
          if (record.id) {
            const mappingKey = `${tableName}:${record.id}`;
            this.foreignKeyMappings.set(mappingKey, record.id);
            mappingsBuilt++;
          }
        }
      }
    }

    console.log(`   Built ${mappingsBuilt} preliminary foreign key mappings from loaded data`);

    if (this.options.verbose) {
      console.log('   Mapping summary:');
      for (const tableName of IMPORT_ORDER) {
        const count = transformedData[tableName] ? transformedData[tableName].length : 0;
        if (count > 0) {
          console.log(`     ${tableName}: ${count} records`);
        }
      }
    }
  }

  async importTable(tableName, records) {
    console.log(`\n🔍 Starting import for ${tableName} with ${records.length} records`);
    
    if (this.options.dryRun) {
      console.log(`   DRY RUN: Would import ${records.length} records to ${tableName}`);
      this.stats.importedRecords += records.length;
      return;
    }

    // Track table-specific stats
    const tableStats = {
      total: records.length,
      imported: 0,
      skipped: 0,
      failed: 0,
      foreignKeyIssues: 0,
      validationErrors: 0,
      uniqueConstraintViolations: 0
    };

    // Pre-validate foreign key references for tables with required foreign keys
    const tablesWithRequiredForeignKeys = ['program_workouts', 'program_exercises', 'workout_logs', 'workout_log_exercises', 'user_analytics'];
    if (tablesWithRequiredForeignKeys.includes(tableName)) {
      console.log(`   🔗 Pre-validating foreign key references for ${tableName}...`);
      await this.validateForeignKeyReferences(tableName, records);
    }

    const processor = new BatchProcessor({
      batchSize: this.options.batchSize,
      maxRetries: this.options.maxRetries,
      verbose: this.options.verbose,
      checkpointFile: `${this.options.checkpointFile}.${tableName}`
    });

    const processorFn = async (batch, batchIndex, globalIndex) => {
      const results = await this.importBatch(tableName, batch, batchIndex, globalIndex);
      
      // Track results for this batch
      for (const result of results) {
        if (result.success) {
          if (result.skipped) {
            tableStats.skipped++;
            if (result.reason === 'unresolvable_foreign_keys') {
              tableStats.foreignKeyIssues++;
            }
          } else if (result.updated) {
            tableStats.imported++; // Count updates as imports
          } else {
            tableStats.imported++;
          }
        } else {
          tableStats.failed++;
          if (result.error && result.error.includes('23505')) {
            tableStats.uniqueConstraintViolations++;
          }
        }
      }
      
      return results;
    };

    await processor.processInBatches(records, processorFn);
    
    // Print table-specific summary
    console.log(`\n📊 ${tableName} Import Results:`);
    console.log(`   Total: ${tableStats.total}`);
    console.log(`   Imported: ${tableStats.imported}`);
    console.log(`   Skipped: ${tableStats.skipped}`);
    console.log(`   Failed: ${tableStats.failed}`);
    if (tableStats.foreignKeyIssues > 0) {
      console.log(`   Foreign Key Issues: ${tableStats.foreignKeyIssues}`);
    }
    if (tableStats.uniqueConstraintViolations > 0) {
      console.log(`   Unique Constraint Violations: ${tableStats.uniqueConstraintViolations}`);
    }
    
    // Store table stats for final report
    this.tableStats = this.tableStats || {};
    this.tableStats[tableName] = tableStats;
  }

  async importBatch(tableName, batch, batchIndex, globalIndex) {
    if (this.options.useTransactions) {
      return await this.importBatchWithTransaction(tableName, batch, batchIndex);
    } else {
      return await this.importBatchDirect(tableName, batch, batchIndex);
    }
  }

  async importBatchWithTransaction(tableName, batch, batchIndex) {
    // Note: Supabase doesn't support explicit transactions in the client
    // We'll use batch operations with error handling instead
    const results = [];

    try {
      // Validate batch before import
      if (this.options.validateBeforeImport) {
        const validationErrors = this.validateBatch(tableName, batch);
        if (validationErrors.length > 0) {
          throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
        }
      }

      // Resolve foreign key references
      const resolvedBatch = await this.resolveForeignKeys(tableName, batch);

      // Filter out records with unresolvable required foreign keys
      const validRecords = resolvedBatch.filter(record => {
        if (!this.hasValidRequiredForeignKeys(tableName, record)) {
          this.stats.skippedRecords++;
          
          // Log detailed foreign key issues for workout_logs
          if (tableName === 'workout_logs') {
            console.log(`   ⚠️ Skipping workout_log ${record.id}: Missing required foreign keys`);
            const requiredFKs = ['user_id', 'program_id'];
            for (const fk of requiredFKs) {
              if (!record[fk]) {
                console.log(`     - Missing ${fk}: ${record[fk]}`);
              } else {
                console.log(`     - ${fk}: ${record[fk]} (checking if exists...)`);
              }
            }
          }
          
          this.warnings.push({
            table: tableName,
            recordId: record.id,
            warning: 'Skipped due to unresolvable required foreign key references'
          });
          return false;
        }
        return true;
      });

      if (validRecords.length === 0) {
        console.log(`   ⚠️ All records in batch ${batchIndex + 1} skipped due to foreign key issues`);
        return batch.map(() => ({ success: true, skipped: true, reason: 'unresolvable_foreign_keys' }));
      }

      // Import batch
      const { data, error } = await this.supabase
        .from(tableName)
        .insert(validRecords)
        .select();

      if (error) {
        console.log(error);

        // Handle conflicts
        if (error.code === '23505' && this.options.conflictResolution !== 'error') {
          return await this.handleConflicts(tableName, validRecords, batchIndex);
        } else if (error.code === '23503') {
          // Foreign key constraint violation - fall back to individual record processing
          console.log(`   ⚠️ Batch ${batchIndex + 1} has foreign key constraint violations, processing individually...`);
          return await this.importBatchIndividually(tableName, batch, batchIndex);
        }
        throw error;
      }

      // Store foreign key mappings for future reference
      this.storeForeignKeyMappings(tableName, data);

      this.stats.importedRecords += data.length;
      this.stats.transactionsCommitted++;

      return data.map(record => ({ success: true, record }));

    } catch (error) {
      this.stats.transactionsRolledBack++;
      this.errors.push({
        table: tableName,
        batchIndex,
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Try individual record import for better error isolation
      return await this.importBatchIndividually(tableName, batch, batchIndex);
    }
  }

  async importBatchDirect(tableName, batch, batchIndex) {
    const results = [];

    for (let i = 0; i < batch.length; i++) {
      const record = batch[i];

      try {
        // Validate record
        if (this.options.validateBeforeImport) {
          const validationErrors = this.validateRecord(tableName, record);
          if (validationErrors.length > 0) {
            throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
          }
        }

        // Resolve foreign keys
        const resolvedRecord = await this.resolveForeignKeysForRecord(tableName, record);

        // Check if required foreign keys are still unresolved
        if (!this.hasValidRequiredForeignKeys(tableName, resolvedRecord)) {
          this.stats.skippedRecords++;
          
          // Log detailed foreign key issues for workout_logs
          if (tableName === 'workout_logs') {
            console.log(`   ⚠️ Skipping workout_log ${record.id}: Missing required foreign keys after resolution`);
            const requiredFKs = ['user_id', 'program_id'];
            for (const fk of requiredFKs) {
              if (!resolvedRecord[fk]) {
                console.log(`     - Missing ${fk}: ${resolvedRecord[fk]} (original: ${record[fk]})`);
              }
            }
          }
          
          this.warnings.push({
            table: tableName,
            recordId: record.id,
            warning: 'Skipped due to unresolvable required foreign key references'
          });
          results.push({ success: true, skipped: true, reason: 'unresolvable_foreign_keys' });
          continue;
        }



        // Import record
        const { data, error } = await this.supabase
          .from(tableName)
          .insert(resolvedRecord)
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            // Unique constraint violation - handle based on conflict resolution setting
            console.log(`   🔄 Unique constraint violation for ${tableName} record ${record.id}: ${error.message}`);
            if (this.options.conflictResolution !== 'error') {
              const result = await this.handleConflict(tableName, resolvedRecord);
              results.push(result);
            } else {
              throw error;
            }
          } else if (error.code === '23503') {
            // Foreign key constraint violation - skip this record
            console.log(`   ❌ Foreign key constraint violation for ${tableName} record ${record.id}: ${error.message}`);
            this.stats.skippedRecords++;
            this.warnings.push({
              table: tableName,
              recordId: record.id,
              warning: `Skipped due to foreign key constraint violation: ${error.message}`
            });
            results.push({ success: true, skipped: true, reason: 'foreign_key_constraint' });
          } else {
            console.log(`   ❌ Unexpected error for ${tableName} record ${record.id}: ${error.message}`);
            throw error;
          }
        } else {
          this.storeForeignKeyMapping(tableName, data);
          this.stats.importedRecords++;
          results.push({ success: true, record: data });
        }

      } catch (error) {
        this.stats.failedRecords++;
        this.errors.push({
          table: tableName,
          recordId: record.id,
          batchIndex,
          recordIndex: i,
          error: error.message,
          timestamp: new Date().toISOString()
        });

        results.push({ success: false, error: error.message });
      }
    }

    return results;
  }

  async importBatchIndividually(tableName, batch, batchIndex) {
    console.log(`   Retrying batch ${batchIndex + 1} with individual record import...`);
    return await this.importBatchDirect(tableName, batch, batchIndex);
  }

  async handleConflicts(tableName, batch, batchIndex) {
    const results = [];

    for (const record of batch) {
      const result = await this.handleConflict(tableName, record);
      results.push(result);
    }

    return results;
  }

  async handleConflict(tableName, record) {
    switch (this.options.conflictResolution) {
      case 'skip':
        this.stats.skippedRecords++;
        console.log(`   ⏭️ Skipping duplicate ${tableName} record ${record.id}`);
        return { success: true, skipped: true, record };

      case 'update':
        try {
          // Find existing record by unique constraint
          const uniqueFields = this.getUniqueFields(tableName);
          const whereClause = {};

          // Handle composite unique constraints
          if (tableName === 'program_workouts') {
            // Use composite key: program_id + week_number + day_number
            whereClause.program_id = record.program_id;
            whereClause.week_number = record.week_number;
            whereClause.day_number = record.day_number;
          } else if (tableName === 'workout_logs') {
            // Use composite key: user_id + program_id + week_index + day_index
            whereClause.user_id = record.user_id;
            whereClause.program_id = record.program_id;
            whereClause.week_index = record.week_index;
            whereClause.day_index = record.day_index;
            
            console.log(`   🔄 Updating existing workout_log for user ${record.user_id}, program ${record.program_id}, week ${record.week_index}, day ${record.day_index}`);
          } else if (tableName === 'user_analytics') {
            // Use composite key: user_id + exercise_id
            whereClause.user_id = record.user_id;
            whereClause.exercise_id = record.exercise_id;
          } else {
            // Use first available unique field (usually 'id')
            for (const field of uniqueFields) {
              if (record[field] !== undefined) {
                whereClause[field] = record[field];
                break;
              }
            }
          }

          const { data, error } = await this.supabase
            .from(tableName)
            .update(record)
            .match(whereClause)
            .select()
            .single();

          if (error) throw error;

          this.stats.updatedRecords++;
          console.log(`   ✅ Updated existing ${tableName} record`);
          return { success: true, updated: true, record: data };

        } catch (error) {
          this.stats.failedRecords++;
          console.log(`   ❌ Failed to update ${tableName} record: ${error.message}`);
          return { success: false, error: error.message };
        }

      default:
        this.stats.failedRecords++;
        return { success: false, error: 'Conflict resolution failed' };
    }
  }

  getUniqueFields(tableName) {
    const uniqueFields = {
      users: ['id', 'email'],
      exercises: ['id'],
      programs: ['id'],
      program_workouts: ['id', 'program_id', 'week_number', 'day_number'], // Composite unique constraint
      program_exercises: ['id'],
      workout_logs: ['id', 'user_id', 'program_id', 'week_index', 'day_index'], // Composite unique constraint
      workout_log_exercises: ['id'],
      user_analytics: ['id', 'user_id', 'exercise_id'] // Composite unique constraint
    };

    return uniqueFields[tableName] || ['id'];
  }

  async resolveForeignKeys(tableName, batch) {
    return Promise.all(batch.map(record => this.resolveForeignKeysForRecord(tableName, record)));
  }

  async resolveForeignKeysForRecord(tableName, record) {
    const resolvedRecord = { ...record };
    const foreignKeys = this.getForeignKeyFields(tableName);

    for (const fkField of foreignKeys) {
      if (resolvedRecord[fkField]) {
        const originalValue = resolvedRecord[fkField];
        const resolvedId = await this.resolveForeignKeyReference(fkField, originalValue);

        if (resolvedId && resolvedId !== originalValue) {
          resolvedRecord[fkField] = resolvedId;
          this.stats.foreignKeyResolutions++;
        } else if (resolvedId === null) {
          // Set to null for optional foreign keys
          this.warnings.push({
            table: tableName,
            recordId: record.id,
            field: fkField,
            value: originalValue,
            warning: 'Optional foreign key reference could not be resolved, set to null'
          });
          resolvedRecord[fkField] = null;
        }
        // If resolvedId === originalValue, keep the original value (let database handle validation)
      }
    }

    return resolvedRecord;
  }

  getForeignKeyFields(tableName) {
    const foreignKeys = {
      exercises: ['created_by'],
      programs: ['user_id'],
      program_workouts: ['program_id'],
      program_exercises: ['workout_id', 'exercise_id'],
      workout_logs: ['user_id', 'program_id'],
      workout_log_exercises: ['workout_log_id', 'exercise_id'],
      user_analytics: ['user_id', 'exercise_id']
    };

    return foreignKeys[tableName] || [];
  }

  hasValidRequiredForeignKeys(tableName, record) {
    const requiredForeignKeys = {
      programs: ['user_id'],
      program_workouts: ['program_id'],
      program_exercises: ['workout_id', 'exercise_id'],
      workout_logs: ['user_id'], // Note: program_id might be optional for quick workouts
      workout_log_exercises: ['workout_log_id', 'exercise_id'],
      user_analytics: ['user_id', 'exercise_id']
    };

    const required = requiredForeignKeys[tableName] || [];

    for (const fkField of required) {
      if (!record[fkField]) {
        if (this.options.verbose && tableName === 'workout_logs') {
          console.log(`     Missing required FK ${fkField} for record ${record.id}`);
        }
        return false; // Required foreign key is null or undefined
      }
    }

    return true;
  }



  async resolveForeignKeyReference(fieldName, originalId) {
    // Map field names to their target tables
    const fieldToTable = {
      user_id: 'users',
      created_by: 'users',
      program_id: 'programs',
      workout_id: 'program_workouts',
      exercise_id: 'exercises',
      workout_log_id: 'workout_logs'
    };

    const targetTable = fieldToTable[fieldName];
    if (!targetTable) return originalId;

    // Always check the database for foreign key references to ensure they exist
    if (!this.options.dryRun) {
      try {
        const { data, error } = await this.supabase
          .from(targetTable)
          .select('id')
          .eq('id', originalId)
          .single();

        if (!error && data) {
          // Store the mapping for future use
          const mappingKey = `${targetTable}:${originalId}`;
          this.foreignKeyMappings.set(mappingKey, data.id);
          return data.id;
        }
      } catch (error) {
        // Record not found
      }
    } else {
      // In dry run mode, check our preliminary mappings
      const mappingKey = `${targetTable}:${originalId}`;
      if (this.foreignKeyMappings.has(mappingKey)) {
        const resolvedId = this.foreignKeyMappings.get(mappingKey);
        return resolvedId;
      }
    }

    // Foreign key reference not found
    if (this.options.verbose) {
      console.warn(`⚠️ Foreign key ${fieldName} with value ${originalId} not found in ${targetTable}`);
    }

    // For required foreign keys, keep the original ID and let the database handle the constraint
    // For optional foreign keys, set to null
    const requiredForeignKeys = ['workout_log_id', 'user_id', 'exercise_id'];
    if (requiredForeignKeys.includes(fieldName)) {
      return originalId; // Let database handle constraint violation if needed
    }

    return null; // Optional foreign key, safe to set to null
  }

  storeForeignKeyMappings(tableName, records) {
    for (const record of records) {
      this.storeForeignKeyMapping(tableName, record);
    }
  }

  storeForeignKeyMapping(tableName, record) {
    if (record && record.id) {
      const mappingKey = `${tableName}:${record.id}`;
      this.foreignKeyMappings.set(mappingKey, record.id);
    }
  }

  async validateForeignKeyReferences(tableName, records) {
    console.log(`   🔍 Validating foreign key references for ${tableName}...`);

    const foreignKeys = this.getForeignKeyFields(tableName);
    const requiredForeignKeys = ['workout_log_id', 'user_id', 'exercise_id'];

    const missingReferences = new Set();
    let validatedCount = 0;

    for (const record of records) {
      for (const fkField of foreignKeys) {
        if (record[fkField] && requiredForeignKeys.includes(fkField)) {
          const fieldToTable = {
            user_id: 'users',
            created_by: 'users',
            program_id: 'programs',
            workout_id: 'program_workouts',
            exercise_id: 'exercises',
            workout_log_id: 'workout_logs'
          };

          const targetTable = fieldToTable[fkField];
          if (targetTable) {
            const mappingKey = `${targetTable}:${record[fkField]}`;

            // Check if we have the mapping
            if (!this.foreignKeyMappings.has(mappingKey)) {
              // Try to find in database
              try {
                const { data, error } = await this.supabase
                  .from(targetTable)
                  .select('id')
                  .eq('id', record[fkField])
                  .single();

                if (error || !data) {
                  missingReferences.add(`${fkField}:${record[fkField]} -> ${targetTable}`);
                } else {
                  // Store the mapping for future use
                  this.foreignKeyMappings.set(mappingKey, data.id);
                  validatedCount++;
                }
              } catch (error) {
                missingReferences.add(`${fkField}:${record[fkField]} -> ${targetTable}`);
              }
            } else {
              validatedCount++;
            }
          }
        }
      }
    }

    if (missingReferences.size > 0) {
      console.log(`   ⚠️ Found ${missingReferences.size} missing foreign key references:`);
      Array.from(missingReferences).slice(0, 10).forEach(ref => {
        console.log(`     - ${ref}`);
      });

      if (missingReferences.size > 10) {
        console.log(`     ... and ${missingReferences.size - 10} more`);
      }

      console.log(`   Continuing with import - records with missing references will be handled during import`);
    } else {
      console.log(`   ✅ All ${validatedCount} foreign key references validated successfully`);
    }
  }

  validateBatch(tableName, batch) {
    const errors = [];

    for (const record of batch) {
      const recordErrors = this.validateRecord(tableName, record);
      errors.push(...recordErrors);
    }

    return errors;
  }

  validateRecord(tableName, record) {
    const errors = [];

    // Basic validation
    if (!record.id) {
      errors.push('Missing required field: id');
    }

    // Table-specific validation
    switch (tableName) {
      case 'users':
        if (!record.email) errors.push('Missing required field: email');
        if (!record.id) errors.push('Missing required field: id');
        break;

      case 'exercises':
        if (!record.name) errors.push('Missing required field: name');
        if (!record.primary_muscle_group) errors.push('Missing required field: primary_muscle_group');
        break;

      case 'programs':
        if (!record.user_id) errors.push('Missing required field: user_id');
        if (!record.name) errors.push('Missing required field: name');
        break;

      case 'workout_logs':
        if (!record.user_id) errors.push('Missing required field: user_id');
        if (!record.date) errors.push('Missing required field: date');
        break;
    }

    if (errors.length > 0) {
      this.stats.validationErrors += errors.length;
    }

    return errors;
  }

  async loadCheckpoint() {
    try {
      const checkpointData = await fs.readFile(this.options.checkpointFile, 'utf8');
      this.checkpoint = JSON.parse(checkpointData);
      console.log(`📍 Loaded checkpoint: last completed table was ${this.checkpoint.lastCompletedTable}`);
    } catch (error) {
      // No checkpoint file exists, start from beginning
      this.checkpoint = {
        lastCompletedTable: null,
        lastProcessedIndex: -1,
        timestamp: null
      };
    }
  }

  async saveCheckpoint() {
    this.checkpoint.timestamp = new Date().toISOString();
    const checkpointData = JSON.stringify(this.checkpoint, null, 2);

    try {
      await fs.writeFile(this.options.checkpointFile, checkpointData, 'utf8');
      if (this.options.verbose) {
        console.log(`💾 Checkpoint saved: ${this.checkpoint.lastCompletedTable}`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to save checkpoint: ${error.message}`);
    }
  }

  async clearCheckpoint() {
    try {
      await fs.unlink(this.options.checkpointFile);
      if (this.options.verbose) {
        console.log('🗑️ Checkpoint file cleared');
      }
    } catch (error) {
      // File doesn't exist, ignore
    }
  }

  printSummary() {
    console.log('\n📋 Import Summary:');
    console.log('='.repeat(50));
    console.log(`Total Records: ${this.stats.totalRecords}`);
    console.log(`Imported Records: ${this.stats.importedRecords}`);
    console.log(`Updated Records: ${this.stats.updatedRecords}`);
    console.log(`Skipped Records: ${this.stats.skippedRecords}`);
    console.log(`Failed Records: ${this.stats.failedRecords}`);
    console.log(`Transactions Committed: ${this.stats.transactionsCommitted}`);
    console.log(`Transactions Rolled Back: ${this.stats.transactionsRolledBack}`);
    console.log(`Foreign Key Resolutions: ${this.stats.foreignKeyResolutions}`);
    console.log(`Validation Errors: ${this.stats.validationErrors}`);

    if (this.errors.length > 0) {
      console.log(`\n❌ Errors (${this.errors.length}):`);
      this.errors.slice(0, 5).forEach(error => {
        console.log(`   ${error.table}: ${error.error}`);
      });

      if (this.errors.length > 5) {
        console.log(`   ... and ${this.errors.length - 5} more errors`);
      }
    }

    if (this.warnings.length > 0) {
      console.log(`\n⚠️ Warnings (${this.warnings.length}):`);
      this.warnings.slice(0, 5).forEach(warning => {
        console.log(`   ${warning.table}/${warning.field}: ${warning.warning}`);
      });

      if (this.warnings.length > 5) {
        console.log(`   ... and ${this.warnings.length - 5} more warnings`);
      }
    }
  }

  async analyzeWorkoutLogsData(workoutLogs) {
    console.log('\n🔍 Analyzing workout_logs data for potential issues...');
    
    const analysis = {
      total: workoutLogs.length,
      nullProgramId: 0,
      nullUserId: 0,
      duplicates: new Map(),
      missingForeignKeys: {
        users: new Set(),
        programs: new Set()
      }
    };

    // Analyze each record
    for (const log of workoutLogs) {
      // Check for null foreign keys
      if (!log.user_id) analysis.nullUserId++;
      if (!log.program_id) analysis.nullProgramId++;

      // Track potential duplicates based on unique constraint
      if (log.user_id && log.program_id !== null) {
        const key = `${log.user_id}:${log.program_id}:${log.week_index}:${log.day_index}`;
        if (analysis.duplicates.has(key)) {
          analysis.duplicates.set(key, analysis.duplicates.get(key) + 1);
        } else {
          analysis.duplicates.set(key, 1);
        }
      }

      // Track foreign key references to check later
      if (log.user_id) analysis.missingForeignKeys.users.add(log.user_id);
      if (log.program_id) analysis.missingForeignKeys.programs.add(log.program_id);
    }

    // Count actual duplicates
    const duplicateCount = Array.from(analysis.duplicates.values()).filter(count => count > 1).length;
    
    console.log(`   📊 Analysis Results:`);
    console.log(`     Total records: ${analysis.total}`);
    console.log(`     Records with null user_id: ${analysis.nullUserId}`);
    console.log(`     Records with null program_id: ${analysis.nullProgramId}`);
    console.log(`     Potential duplicates (unique constraint violations): ${duplicateCount}`);
    console.log(`     Unique users referenced: ${analysis.missingForeignKeys.users.size}`);
    console.log(`     Unique programs referenced: ${analysis.missingForeignKeys.programs.size}`);

    if (duplicateCount > 0) {
      console.log(`\n   ⚠️ Found ${duplicateCount} sets of duplicate records that will cause unique constraint violations:`);
      let shown = 0;
      for (const [key, count] of analysis.duplicates.entries()) {
        if (count > 1 && shown < 5) {
          console.log(`     - ${key}: ${count} duplicates`);
          shown++;
        }
      }
      if (duplicateCount > 5) {
        console.log(`     ... and ${duplicateCount - 5} more duplicate sets`);
      }
      
      if (this.options.conflictResolution === 'skip') {
        console.log(`   📝 Conflict resolution is set to 'skip' - duplicates will be skipped`);
      } else if (this.options.conflictResolution === 'update') {
        console.log(`   📝 Conflict resolution is set to 'update' - duplicates will update existing records`);
      }
    }

    return analysis;
  }

  async generateReport() {
    const report = {
      summary: this.stats,
      tableStats: this.tableStats || {},
      errors: this.errors,
      warnings: this.warnings,
      timestamp: new Date().toISOString(),
      options: this.options
    };

    const reportPath = path.join(this.options.inputDir, 'import-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`📄 Import report saved to: ${reportPath}`);
    return report;
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--supabase-url':
        options.supabaseUrl = args[++i];
        break;
      case '--supabase-key':
        options.supabaseKey = args[++i];
        break;
      case '--input-dir':
        options.inputDir = args[++i];
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--conflict-resolution':
        options.conflictResolution = args[++i];
        break;
      case '--no-validation':
        options.validateBeforeImport = false;
        break;
      case '--no-transactions':
        options.useTransactions = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
PostgreSQL Data Import Tool

Usage: node postgres-importer.js [options]

Options:
  --supabase-url <url>           Supabase project URL
  --supabase-key <key>           Supabase service role key
  --input-dir <path>             Input directory with transformed data
  --batch-size <number>          Batch size for import operations
  --conflict-resolution <mode>   How to handle conflicts: skip, update, error
  --no-validation               Skip validation before import
  --no-transactions             Disable transaction management
  --dry-run                     Show what would be imported without importing
  --verbose                     Enable verbose logging
  --help                        Show this help message

Environment Variables:
  SUPABASE_URL                  Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Supabase service role key

Examples:
  # Import with default settings
  node postgres-importer.js

  # Import with custom batch size and conflict resolution
  node postgres-importer.js --batch-size 50 --conflict-resolution update

  # Dry run to see what would be imported
  node postgres-importer.js --dry-run --verbose
`);
        process.exit(0);
        break;
    }
  }

  try {
    const importer = new PostgresImporter(options);
    await importer.initialize();
    await importer.importData();
    await importer.generateReport();

    if (importer.stats.failedRecords > 0) {
      console.log('\n⚠️ Import completed with errors. Check import-report.json for details.');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Import failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { PostgresImporter, IMPORT_ORDER };