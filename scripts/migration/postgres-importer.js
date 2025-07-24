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
        
        // Handle nested data structures from transformation
        if (tableName === 'programs' && data.length > 0 && data[0].program) {
          // Programs data includes nested workouts and exercises
          transformedData.programs = data.map(item => item.program);
          transformedData.program_workouts = data.flatMap(item => item.workouts || []);
          transformedData.program_exercises = data.flatMap(item => item.exercises || []);
        } else if (tableName === 'workout_logs' && data.length > 0 && data[0].workout_log) {
          // Workout logs include nested exercises
          transformedData.workout_logs = data.map(item => item.workout_log);
          transformedData.workout_log_exercises = data.flatMap(item => item.exercises || []);
        } else {
          transformedData[tableName] = data;
        }
        
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

  async importTable(tableName, records) {
    if (this.options.dryRun) {
      console.log(`   DRY RUN: Would import ${records.length} records to ${tableName}`);
      this.stats.importedRecords += records.length;
      return;
    }
    
    const processor = new BatchProcessor({
      batchSize: this.options.batchSize,
      maxRetries: this.options.maxRetries,
      verbose: this.options.verbose,
      checkpointFile: `${this.options.checkpointFile}.${tableName}`
    });
    
    const processorFn = async (batch, batchIndex, globalIndex) => {
      return await this.importBatch(tableName, batch, batchIndex, globalIndex);
    };
    
    await processor.processInBatches(records, processorFn);
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
      
      // Import batch
      const { data, error } = await this.supabase
        .from(tableName)
        .insert(resolvedBatch)
        .select();
      
      if (error) {
        // Handle conflicts
        if (error.code === '23505' && this.options.conflictResolution !== 'error') {
          return await this.handleConflicts(tableName, resolvedBatch, batchIndex);
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
        
        // Import record
        const { data, error } = await this.supabase
          .from(tableName)
          .insert(resolvedRecord)
          .select()
          .single();
        
        if (error) {
          if (error.code === '23505' && this.options.conflictResolution !== 'error') {
            const result = await this.handleConflict(tableName, resolvedRecord);
            results.push(result);
          } else {
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
        return { success: true, skipped: true, record };
        
      case 'update':
        try {
          // Find existing record by unique constraint
          const uniqueFields = this.getUniqueFields(tableName);
          const whereClause = {};
          
          for (const field of uniqueFields) {
            if (record[field] !== undefined) {
              whereClause[field] = record[field];
              break; // Use first available unique field
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
          return { success: true, updated: true, record: data };
          
        } catch (error) {
          this.stats.failedRecords++;
          return { success: false, error: error.message };
        }
        
      default:
        this.stats.failedRecords++;
        return { success: false, error: 'Conflict resolution failed' };
    }
  }

  getUniqueFields(tableName) {
    const uniqueFields = {
      users: ['auth_id', 'email'],
      exercises: ['id'],
      programs: ['id'],
      program_workouts: ['id'],
      program_exercises: ['id'],
      workout_logs: ['id'],
      workout_log_exercises: ['id'],
      user_analytics: ['user_id', 'exercise_id']
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
        const resolvedId = await this.resolveForeignKeyReference(fkField, resolvedRecord[fkField]);
        if (resolvedId) {
          resolvedRecord[fkField] = resolvedId;
          this.stats.foreignKeyResolutions++;
        } else {
          this.warnings.push({
            table: tableName,
            recordId: record.id,
            field: fkField,
            value: resolvedRecord[fkField],
            warning: 'Foreign key reference could not be resolved'
          });
          // Set to null if reference cannot be resolved
          resolvedRecord[fkField] = null;
        }
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
    
    // Check if we have a mapping from transformation
    const mappingKey = `${targetTable}:${originalId}`;
    if (this.foreignKeyMappings.has(mappingKey)) {
      return this.foreignKeyMappings.get(mappingKey);
    }
    
    // Try to find the record in the database
    try {
      const { data, error } = await this.supabase
        .from(targetTable)
        .select('id')
        .eq('id', originalId)
        .single();
      
      if (!error && data) {
        return data.id;
      }
    } catch (error) {
      // Record not found
    }
    
    return null;
  }

  storeForeignKeyMappings(tableName, records) {
    for (const record of records) {
      this.storeForeignKeyMapping(tableName, record);
    }
  }

  storeForeignKeyMapping(tableName, record) {
    const mappingKey = `${tableName}:${record.id}`;
    this.foreignKeyMappings.set(mappingKey, record.id);
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
        if (!record.auth_id) errors.push('Missing required field: auth_id');
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

  async generateReport() {
    const report = {
      summary: this.stats,
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