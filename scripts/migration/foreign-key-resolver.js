#!/usr/bin/env node

/**
 * Foreign Key Relationship Resolver
 * 
 * This utility resolves foreign key relationships during data migration,
 * ensuring referential integrity and handling orphaned records.
 * 
 * Features:
 * - Automatic foreign key mapping
 * - Orphaned record detection
 * - Circular dependency resolution
 * - Reference validation
 * - Relationship graph analysis
 */

const fs = require('fs').promises;
const path = require('path');

class ForeignKeyResolver {
  constructor(options = {}) {
    this.options = {
      inputDir: options.inputDir || './transformed-data',
      outputDir: options.outputDir || './resolved-data',
      handleOrphans: options.handleOrphans || 'warn', // 'warn', 'remove', 'create'
      validateReferences: options.validateReferences || true,
      verbose: options.verbose || false,
      ...options
    };
    
    this.relationships = new Map();
    this.idMappings = new Map();
    this.orphanedRecords = [];
    this.circularDependencies = [];
    this.stats = {
      totalRecords: 0,
      resolvedReferences: 0,
      orphanedRecords: 0,
      createdReferences: 0,
      removedRecords: 0,
      validationErrors: 0
    };
  }

  // Define the relationship schema
  getRelationshipSchema() {
    return {
      users: {
        table: 'users',
        primaryKey: 'id',
        references: [],
        referencedBy: [
          { table: 'exercises', field: 'created_by' },
          { table: 'programs', field: 'user_id' },
          { table: 'workout_logs', field: 'user_id' },
          { table: 'user_analytics', field: 'user_id' }
        ]
      },
      
      exercises: {
        table: 'exercises',
        primaryKey: 'id',
        references: [
          { field: 'created_by', table: 'users', targetField: 'id', nullable: true }
        ],
        referencedBy: [
          { table: 'program_exercises', field: 'exercise_id' },
          { table: 'workout_log_exercises', field: 'exercise_id' },
          { table: 'user_analytics', field: 'exercise_id' }
        ]
      },
      
      programs: {
        table: 'programs',
        primaryKey: 'id',
        references: [
          { field: 'user_id', table: 'users', targetField: 'id', nullable: false }
        ],
        referencedBy: [
          { table: 'program_workouts', field: 'program_id' },
          { table: 'workout_logs', field: 'program_id' }
        ]
      },
      
      program_workouts: {
        table: 'program_workouts',
        primaryKey: 'id',
        references: [
          { field: 'program_id', table: 'programs', targetField: 'id', nullable: false }
        ],
        referencedBy: [
          { table: 'program_exercises', field: 'workout_id' }
        ]
      },
      
      program_exercises: {
        table: 'program_exercises',
        primaryKey: 'id',
        references: [
          { field: 'workout_id', table: 'program_workouts', targetField: 'id', nullable: false },
          { field: 'exercise_id', table: 'exercises', targetField: 'id', nullable: false }
        ],
        referencedBy: []
      },
      
      workout_logs: {
        table: 'workout_logs',
        primaryKey: 'id',
        references: [
          { field: 'user_id', table: 'users', targetField: 'id', nullable: false },
          { field: 'program_id', table: 'programs', targetField: 'id', nullable: true }
        ],
        referencedBy: [
          { table: 'workout_log_exercises', field: 'workout_log_id' }
        ]
      },
      
      workout_log_exercises: {
        table: 'workout_log_exercises',
        primaryKey: 'id',
        references: [
          { field: 'workout_log_id', table: 'workout_logs', targetField: 'id', nullable: false },
          { field: 'exercise_id', table: 'exercises', targetField: 'id', nullable: false }
        ],
        referencedBy: []
      },
      
      user_analytics: {
        table: 'user_analytics',
        primaryKey: 'id',
        references: [
          { field: 'user_id', table: 'users', targetField: 'id', nullable: false },
          { field: 'exercise_id', table: 'exercises', targetField: 'id', nullable: false }
        ],
        referencedBy: []
      }
    };
  }

  async resolveRelationships() {
    console.log('🔗 Starting foreign key relationship resolution...');
    
    // Load all data
    const data = await this.loadData();
    
    // Build ID mappings
    this.buildIdMappings(data);
    
    // Analyze relationships
    this.analyzeRelationships(data);
    
    // Resolve foreign keys
    const resolvedData = await this.resolveForeignKeys(data);
    
    // Validate relationships
    if (this.options.validateReferences) {
      this.validateRelationships(resolvedData);
    }
    
    // Handle orphaned records
    const finalData = this.handleOrphanedRecords(resolvedData);
    
    // Save resolved data
    await this.saveResolvedData(finalData);
    
    // Generate report
    await this.generateReport();
    
    console.log('\n✅ Foreign key resolution completed!');
    this.printSummary();
    
    return finalData;
  }

  async loadData() {
    console.log('📂 Loading data for relationship resolution...');
    
    const data = {};
    const schema = this.getRelationshipSchema();
    
    for (const tableName of Object.keys(schema)) {
      const filePath = path.join(this.options.inputDir, `${tableName}.json`);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        data[tableName] = JSON.parse(fileContent);
        console.log(`   Loaded ${data[tableName].length} records from ${tableName}`);
        this.stats.totalRecords += data[tableName].length;
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`   File ${tableName}.json not found, skipping...`);
          data[tableName] = [];
        } else {
          throw new Error(`Failed to load ${tableName}: ${error.message}`);
        }
      }
    }
    
    return data;
  }

  buildIdMappings(data) {
    console.log('🗺️ Building ID mappings...');
    
    for (const [tableName, records] of Object.entries(data)) {
      const tableMap = new Map();
      
      for (const record of records) {
        if (record.id) {
          tableMap.set(record.id, record);
        }
      }
      
      this.idMappings.set(tableName, tableMap);
      
      if (this.options.verbose) {
        console.log(`   Built mapping for ${tableName}: ${tableMap.size} records`);
      }
    }
  }

  analyzeRelationships(data) {
    console.log('🔍 Analyzing relationships...');
    
    const schema = this.getRelationshipSchema();
    
    for (const [tableName, tableSchema] of Object.entries(schema)) {
      const records = data[tableName] || [];
      
      for (const reference of tableSchema.references) {
        this.analyzeReference(tableName, records, reference);
      }
    }
  }

  analyzeReference(tableName, records, reference) {
    const { field, table: targetTable, targetField, nullable } = reference;
    
    for (const record of records) {
      const foreignKeyValue = record[field];
      
      if (foreignKeyValue === null || foreignKeyValue === undefined) {
        if (!nullable) {
          this.orphanedRecords.push({
            table: tableName,
            recordId: record.id,
            field,
            reason: 'Required foreign key is null',
            targetTable
          });
        }
        continue;
      }
      
      // Check if referenced record exists
      const targetTableMap = this.idMappings.get(targetTable);
      if (!targetTableMap || !targetTableMap.has(foreignKeyValue)) {
        this.orphanedRecords.push({
          table: tableName,
          recordId: record.id,
          field,
          foreignKeyValue,
          reason: 'Referenced record does not exist',
          targetTable
        });
      }
    }
  }

  async resolveForeignKeys(data) {
    console.log('🔧 Resolving foreign key references...');
    
    const resolvedData = {};
    const schema = this.getRelationshipSchema();
    
    for (const [tableName, records] of Object.entries(data)) {
      const tableSchema = schema[tableName];
      if (!tableSchema) {
        resolvedData[tableName] = records;
        continue;
      }
      
      const resolvedRecords = [];
      
      for (const record of records) {
        const resolvedRecord = await this.resolveRecordReferences(record, tableSchema);
        if (resolvedRecord) {
          resolvedRecords.push(resolvedRecord);
        }
      }
      
      resolvedData[tableName] = resolvedRecords;
      
      console.log(`   Resolved ${resolvedRecords.length}/${records.length} records in ${tableName}`);
    }
    
    return resolvedData;
  }

  async resolveRecordReferences(record, tableSchema) {
    const resolvedRecord = { ...record };
    let isValid = true;
    
    for (const reference of tableSchema.references) {
      const { field, table: targetTable, targetField, nullable } = reference;
      const foreignKeyValue = record[field];
      
      if (foreignKeyValue === null || foreignKeyValue === undefined) {
        if (!nullable) {
          if (this.options.handleOrphans === 'remove') {
            return null; // Remove this record
          }
        }
        continue;
      }
      
      // Try to resolve the reference
      const targetTableMap = this.idMappings.get(targetTable);
      const targetRecord = targetTableMap?.get(foreignKeyValue);
      
      if (!targetRecord) {
        // Handle missing reference
        const handled = await this.handleMissingReference(
          resolvedRecord, 
          field, 
          foreignKeyValue, 
          targetTable, 
          nullable
        );
        
        if (!handled) {
          if (this.options.handleOrphans === 'remove') {
            return null; // Remove this record
          }
          isValid = false;
        }
      } else {
        // Reference is valid
        this.stats.resolvedReferences++;
      }
    }
    
    return isValid ? resolvedRecord : null;
  }

  async handleMissingReference(record, field, foreignKeyValue, targetTable, nullable) {
    switch (this.options.handleOrphans) {
      case 'warn':
        console.warn(`⚠️ Missing reference: ${record.id}.${field} -> ${targetTable}.${foreignKeyValue}`);
        if (nullable) {
          record[field] = null;
          return true;
        }
        return false;
        
      case 'remove':
        this.stats.removedRecords++;
        return false;
        
      case 'create':
        // Create a placeholder record
        const placeholderRecord = await this.createPlaceholderRecord(targetTable, foreignKeyValue);
        if (placeholderRecord) {
          this.stats.createdReferences++;
          return true;
        }
        return false;
        
      default:
        return false;
    }
  }

  async createPlaceholderRecord(targetTable, id) {
    const placeholders = {
      users: {
        id,
        auth_id: id,
        email: `placeholder-${id}@example.com`,
        name: `Placeholder User ${id}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      
      exercises: {
        id,
        name: `Placeholder Exercise ${id}`,
        primary_muscle_group: 'Unknown',
        exercise_type: 'Unknown',
        is_global: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      
      programs: {
        id,
        user_id: null, // This would need to be resolved
        name: `Placeholder Program ${id}`,
        duration: 1,
        days_per_week: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };
    
    const placeholder = placeholders[targetTable];
    if (!placeholder) {
      return null;
    }
    
    // Add to ID mappings
    const targetTableMap = this.idMappings.get(targetTable);
    if (targetTableMap) {
      targetTableMap.set(id, placeholder);
    }
    
    console.log(`🔧 Created placeholder record: ${targetTable}.${id}`);
    return placeholder;
  }

  validateRelationships(data) {
    console.log('✅ Validating resolved relationships...');
    
    const schema = this.getRelationshipSchema();
    
    for (const [tableName, records] of Object.entries(data)) {
      const tableSchema = schema[tableName];
      if (!tableSchema) continue;
      
      for (const record of records) {
        for (const reference of tableSchema.references) {
          const isValid = this.validateReference(record, reference, data);
          if (!isValid) {
            this.stats.validationErrors++;
          }
        }
      }
    }
  }

  validateReference(record, reference, data) {
    const { field, table: targetTable, nullable } = reference;
    const foreignKeyValue = record[field];
    
    if (foreignKeyValue === null || foreignKeyValue === undefined) {
      return nullable;
    }
    
    const targetRecords = data[targetTable] || [];
    const targetExists = targetRecords.some(target => target.id === foreignKeyValue);
    
    if (!targetExists) {
      console.error(`❌ Invalid reference: ${record.id}.${field} -> ${targetTable}.${foreignKeyValue}`);
      return false;
    }
    
    return true;
  }

  handleOrphanedRecords(data) {
    if (this.orphanedRecords.length === 0) {
      return data;
    }
    
    console.log(`🔍 Handling ${this.orphanedRecords.length} orphaned records...`);
    
    const finalData = { ...data };
    
    if (this.options.handleOrphans === 'remove') {
      // Remove orphaned records
      const orphanedByTable = new Map();
      
      for (const orphan of this.orphanedRecords) {
        if (!orphanedByTable.has(orphan.table)) {
          orphanedByTable.set(orphan.table, new Set());
        }
        orphanedByTable.get(orphan.table).add(orphan.recordId);
      }
      
      for (const [tableName, orphanedIds] of orphanedByTable) {
        const originalCount = finalData[tableName].length;
        finalData[tableName] = finalData[tableName].filter(record => 
          !orphanedIds.has(record.id)
        );
        const removedCount = originalCount - finalData[tableName].length;
        
        console.log(`   Removed ${removedCount} orphaned records from ${tableName}`);
        this.stats.removedRecords += removedCount;
      }
    }
    
    this.stats.orphanedRecords = this.orphanedRecords.length;
    
    return finalData;
  }

  async saveResolvedData(data) {
    console.log('💾 Saving resolved data...');
    
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
    for (const [tableName, records] of Object.entries(data)) {
      if (records.length > 0) {
        const filePath = path.join(this.options.outputDir, `${tableName}.json`);
        const jsonData = JSON.stringify(records, null, 2);
        
        await fs.writeFile(filePath, jsonData, 'utf8');
        console.log(`   Saved ${records.length} resolved records to ${tableName}.json`);
      }
    }
  }

  async generateReport() {
    const report = {
      summary: this.stats,
      orphanedRecords: this.orphanedRecords,
      circularDependencies: this.circularDependencies,
      relationshipAnalysis: this.analyzeRelationshipHealth(),
      timestamp: new Date().toISOString()
    };
    
    const reportPath = path.join(this.options.outputDir, 'foreign-key-resolution-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    console.log(`📄 Foreign key resolution report saved to: ${reportPath}`);
  }

  analyzeRelationshipHealth() {
    const schema = this.getRelationshipSchema();
    const health = {};
    
    for (const [tableName, tableSchema] of Object.entries(schema)) {
      const tableMap = this.idMappings.get(tableName);
      const recordCount = tableMap ? tableMap.size : 0;
      
      health[tableName] = {
        recordCount,
        references: tableSchema.references.length,
        referencedBy: tableSchema.referencedBy.length,
        orphanedCount: this.orphanedRecords.filter(o => o.table === tableName).length
      };
    }
    
    return health;
  }

  printSummary() {
    console.log('\n📋 Foreign Key Resolution Summary:');
    console.log('='.repeat(50));
    console.log(`Total Records: ${this.stats.totalRecords}`);
    console.log(`Resolved References: ${this.stats.resolvedReferences}`);
    console.log(`Orphaned Records: ${this.stats.orphanedRecords}`);
    console.log(`Created References: ${this.stats.createdReferences}`);
    console.log(`Removed Records: ${this.stats.removedRecords}`);
    console.log(`Validation Errors: ${this.stats.validationErrors}`);
    
    if (this.orphanedRecords.length > 0) {
      console.log(`\n🔍 Orphaned Records by Table:`);
      const orphansByTable = new Map();
      
      for (const orphan of this.orphanedRecords) {
        if (!orphansByTable.has(orphan.table)) {
          orphansByTable.set(orphan.table, 0);
        }
        orphansByTable.set(orphan.table, orphansByTable.get(orphan.table) + 1);
      }
      
      for (const [table, count] of orphansByTable) {
        console.log(`   ${table}: ${count} orphaned records`);
      }
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input-dir':
        options.inputDir = args[++i];
        break;
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--handle-orphans':
        options.handleOrphans = args[++i];
        break;
      case '--no-validation':
        options.validateReferences = false;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
        console.log(`
Foreign Key Relationship Resolver

Usage: node foreign-key-resolver.js [options]

Options:
  --input-dir <path>        Input directory with transformed data
  --output-dir <path>       Output directory for resolved data
  --handle-orphans <mode>   How to handle orphaned records: warn, remove, create
  --no-validation          Skip relationship validation
  --verbose                Enable verbose logging
  --help                   Show this help message

Examples:
  # Resolve relationships with warnings for orphans
  node foreign-key-resolver.js --handle-orphans warn

  # Remove orphaned records
  node foreign-key-resolver.js --handle-orphans remove --verbose

  # Create placeholder records for missing references
  node foreign-key-resolver.js --handle-orphans create
`);
        process.exit(0);
        break;
    }
  }
  
  try {
    const resolver = new ForeignKeyResolver(options);
    await resolver.resolveRelationships();
    
    if (resolver.stats.validationErrors > 0) {
      console.log('\n⚠️ Foreign key resolution completed with validation errors.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('💥 Foreign key resolution failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ForeignKeyResolver };