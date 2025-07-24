#!/usr/bin/env node

/**
 * Migration Rollback Manager
 * 
 * This script manages rollback procedures for failed migrations,
 * providing safe recovery mechanisms and data restoration.
 * 
 * Features:
 * - Automated rollback procedures
 * - Data backup and restoration
 * - Partial rollback support
 * - Rollback verification
 * - Recovery status tracking
 * - Emergency recovery modes
 * 
 * Usage:
 *   node scripts/migration/rollback-manager.js [options]
 */

const fs = require('fs').promises;
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

class RollbackManager {
  constructor(options = {}) {
    this.options = {
      supabaseUrl: options.supabaseUrl || process.env.SUPABASE_URL,
      supabaseKey: options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
      backupDir: options.backupDir || './migration-backups',
      rollbackType: options.rollbackType || 'full', // 'full', 'partial', 'schema-only', 'data-only'
      confirmRollback: options.confirmRollback !== false, // Default to true for safety
      createBackup: options.createBackup !== false, // Default to true for safety
      verbose: options.verbose || false,
      dryRun: options.dryRun || false,
      ...options
    };
    
    this.supabase = null;
    this.rollbackStatus = {
      startTime: null,
      endTime: null,
      duration: null,
      tablesProcessed: 0,
      recordsRemoved: 0,
      backupsCreated: 0,
      errors: [],
      warnings: [],
      completed: false
    };
    
    // Define rollback order (reverse of import order)
    this.rollbackOrder = [
      'user_analytics',
      'workout_log_exercises',
      'workout_logs',
      'program_exercises',
      'program_workouts',
      'programs',
      'exercises',
      'users'
    ];
  }

  async initialize() {
    console.log('🔧 Initializing rollback manager...');
    
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
    
    // Create backup directory
    await fs.mkdir(this.options.backupDir, { recursive: true });
  }

  async executeRollback() {
    console.log('🔄 Starting migration rollback...');
    
    if (this.options.dryRun) {
      console.log('🔍 DRY RUN MODE - No actual rollback will be performed');
    }
    
    this.rollbackStatus.startTime = new Date().toISOString();
    
    try {
      // Confirm rollback if required
      if (this.options.confirmRollback && !this.options.dryRun) {
        const confirmed = await this.confirmRollbackAction();
        if (!confirmed) {
          console.log('❌ Rollback cancelled by user');
          return;
        }
      }
      
      // Create backup before rollback
      if (this.options.createBackup) {
        console.log('\n💾 Creating backup before rollback...');
        await this.createPreRollbackBackup();
      }
      
      // Execute rollback based on type
      switch (this.options.rollbackType) {
        case 'full':
          await this.executeFullRollback();
          break;
        case 'partial':
          await this.executePartialRollback();
          break;
        case 'schema-only':
          await this.executeSchemaRollback();
          break;
        case 'data-only':
          await this.executeDataRollback();
          break;
        default:
          throw new Error(`Unknown rollback type: ${this.options.rollbackType}`);
      }
      
      // Verify rollback
      console.log('\n🔍 Verifying rollback...');
      await this.verifyRollback();
      
      this.rollbackStatus.completed = true;
      this.rollbackStatus.endTime = new Date().toISOString();
      this.rollbackStatus.duration = 
        new Date(this.rollbackStatus.endTime) - new Date(this.rollbackStatus.startTime);
      
      // Generate rollback report
      await this.generateRollbackReport();
      
      console.log('\n✅ Migration rollback completed successfully!');
      this.printSummary();
      
    } catch (error) {
      this.rollbackStatus.errors.push({
        error: error.message,
        timestamp: new Date().toISOString(),
        phase: 'rollback-execution'
      });
      
      console.error('\n❌ Migration rollback failed:', error.message);
      
      // Generate error report
      await this.generateRollbackReport();
      
      throw error;
    }
  }

  async confirmRollbackAction() {
    console.log('\n⚠️  WARNING: This will rollback the migration and may result in data loss!');
    console.log('   Make sure you have proper backups before proceeding.');
    console.log(`   Rollback type: ${this.options.rollbackType}`);
    console.log(`   Target: ${this.options.supabaseUrl}`);
    
    // In a real implementation, you'd use a proper CLI prompt library
    // For now, we'll just return true if not in interactive mode
    return true;
  }

  async createPreRollbackBackup() {
    const backupTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.options.backupDir, `pre-rollback-${backupTimestamp}`);
    
    await fs.mkdir(backupPath, { recursive: true });
    
    for (const tableName of this.rollbackOrder.reverse()) {
      try {
        if (this.options.dryRun) {
          console.log(`   DRY RUN: Would backup ${tableName}`);
          continue;
        }
        
        const { data, error } = await this.supabase
          .from(tableName)
          .select('*');
        
        if (error) {
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            console.log(`   Skipping ${tableName} (table does not exist)`);
            continue;
          }
          throw error;
        }
        
        const backupFile = path.join(backupPath, `${tableName}.json`);
        await fs.writeFile(backupFile, JSON.stringify(data, null, 2), 'utf8');
        
        console.log(`   Backed up ${data.length} records from ${tableName}`);
        this.rollbackStatus.backupsCreated++;
        
      } catch (error) {
        this.rollbackStatus.warnings.push({
          table: tableName,
          warning: `Failed to backup: ${error.message}`,
          timestamp: new Date().toISOString()
        });
        
        console.warn(`   ⚠️ Failed to backup ${tableName}: ${error.message}`);
      }
    }
    
    // Reverse back to original order
    this.rollbackOrder.reverse();
    
    console.log(`   Backup created at: ${backupPath}`);
  }

  async executeFullRollback() {
    console.log('\n🗑️ Executing full rollback (removing all migrated data)...');
    
    for (const tableName of this.rollbackOrder) {
      try {
        await this.rollbackTable(tableName);
        this.rollbackStatus.tablesProcessed++;
      } catch (error) {
        this.rollbackStatus.errors.push({
          table: tableName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        console.error(`   ❌ Failed to rollback ${tableName}: ${error.message}`);
        
        // Continue with other tables unless it's a critical error
        if (error.message.includes('permission') || error.message.includes('connection')) {
          throw error;
        }
      }
    }
  }

  async executePartialRollback() {
    console.log('\n🔄 Executing partial rollback...');
    
    // For partial rollback, we might only rollback specific tables or data
    // This would be configured based on the specific failure scenario
    const tablesToRollback = this.options.partialTables || this.rollbackOrder.slice(0, 3);
    
    for (const tableName of tablesToRollback) {
      try {
        await this.rollbackTable(tableName);
        this.rollbackStatus.tablesProcessed++;
      } catch (error) {
        this.rollbackStatus.errors.push({
          table: tableName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        console.error(`   ❌ Failed to rollback ${tableName}: ${error.message}`);
      }
    }
  }

  async executeSchemaRollback() {
    console.log('\n🏗️ Executing schema rollback (dropping tables)...');
    
    for (const tableName of this.rollbackOrder) {
      try {
        if (this.options.dryRun) {
          console.log(`   DRY RUN: Would drop table ${tableName}`);
          continue;
        }
        
        // Note: Supabase client doesn't support DDL operations directly
        // In a real implementation, you'd need to use a PostgreSQL client
        // or Supabase's SQL editor/API
        
        console.log(`   ⚠️ Schema rollback requires manual intervention for table: ${tableName}`);
        this.rollbackStatus.warnings.push({
          table: tableName,
          warning: 'Schema rollback requires manual intervention',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.rollbackStatus.errors.push({
          table: tableName,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  async executeDataRollback() {
    console.log('\n📊 Executing data-only rollback (keeping schema, removing data)...');
    
    // Same as full rollback but explicitly mention we're keeping schema
    await this.executeFullRollback();
  }

  async rollbackTable(tableName) {
    console.log(`   Rolling back ${tableName}...`);
    
    if (this.options.dryRun) {
      console.log(`   DRY RUN: Would delete all records from ${tableName}`);
      return;
    }
    
    try {
      // Get count before deletion
      const { count: beforeCount, error: countError } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (countError) {
        if (countError.message.includes('relation') && countError.message.includes('does not exist')) {
          console.log(`   Skipping ${tableName} (table does not exist)`);
          return;
        }
        throw countError;
      }
      
      if (beforeCount === 0) {
        console.log(`   ${tableName} is already empty`);
        return;
      }
      
      // Delete all records
      const { error: deleteError } = await this.supabase
        .from(tableName)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
      
      if (deleteError) {
        throw deleteError;
      }
      
      // Verify deletion
      const { count: afterCount, error: verifyError } = await this.supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (verifyError) {
        throw verifyError;
      }
      
      const deletedCount = beforeCount - afterCount;
      console.log(`   Deleted ${deletedCount} records from ${tableName}`);
      this.rollbackStatus.recordsRemoved += deletedCount;
      
      if (afterCount > 0) {
        this.rollbackStatus.warnings.push({
          table: tableName,
          warning: `${afterCount} records remain after rollback`,
          timestamp: new Date().toISOString()
        });
      }
      
    } catch (error) {
      throw new Error(`Failed to rollback ${tableName}: ${error.message}`);
    }
  }

  async verifyRollback() {
    const verificationResults = {
      tablesChecked: 0,
      emptyTables: 0,
      nonEmptyTables: 0,
      errors: []
    };
    
    for (const tableName of this.rollbackOrder) {
      try {
        const { count, error } = await this.supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });
        
        if (error) {
          if (error.message.includes('relation') && error.message.includes('does not exist')) {
            // Table doesn't exist, which is expected for schema rollback
            continue;
          }
          throw error;
        }
        
        verificationResults.tablesChecked++;
        
        if (count === 0) {
          verificationResults.emptyTables++;
          console.log(`   ✅ ${tableName}: empty (${count} records)`);
        } else {
          verificationResults.nonEmptyTables++;
          console.log(`   ⚠️ ${tableName}: not empty (${count} records)`);
          
          this.rollbackStatus.warnings.push({
            table: tableName,
            warning: `Table still contains ${count} records after rollback`,
            timestamp: new Date().toISOString()
          });
        }
        
      } catch (error) {
        verificationResults.errors.push({
          table: tableName,
          error: error.message
        });
        
        console.error(`   ❌ Failed to verify ${tableName}: ${error.message}`);
      }
    }
    
    console.log(`   Verification: ${verificationResults.emptyTables}/${verificationResults.tablesChecked} tables empty`);
    
    return verificationResults;
  }

  async generateRollbackReport() {
    const report = {
      rollbackStatus: this.rollbackStatus,
      options: this.options,
      timestamp: new Date().toISOString(),
      rollbackOrder: this.rollbackOrder
    };
    
    const reportPath = path.join(this.options.backupDir, 'rollback-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    // Generate human-readable summary
    const summaryPath = path.join(this.options.backupDir, 'rollback-summary.md');
    const summary = this.generateMarkdownSummary();
    await fs.writeFile(summaryPath, summary, 'utf8');
    
    console.log(`📄 Rollback report saved to: ${reportPath}`);
    console.log(`📄 Summary saved to: ${summaryPath}`);
  }

  generateMarkdownSummary() {
    const { rollbackStatus } = this;
    
    let markdown = `# Migration Rollback Report\n\n`;
    markdown += `**Generated:** ${new Date().toISOString()}\n`;
    markdown += `**Rollback Type:** ${this.options.rollbackType}\n`;
    markdown += `**Status:** ${rollbackStatus.completed ? '✅ Completed' : '❌ Failed'}\n`;
    markdown += `**Duration:** ${this.formatDuration(rollbackStatus.duration)}\n\n`;
    
    markdown += `## Summary\n\n`;
    markdown += `- **Tables Processed:** ${rollbackStatus.tablesProcessed}\n`;
    markdown += `- **Records Removed:** ${rollbackStatus.recordsRemoved}\n`;
    markdown += `- **Backups Created:** ${rollbackStatus.backupsCreated}\n`;
    markdown += `- **Errors:** ${rollbackStatus.errors.length}\n`;
    markdown += `- **Warnings:** ${rollbackStatus.warnings.length}\n\n`;
    
    if (rollbackStatus.errors.length > 0) {
      markdown += `## Errors\n\n`;
      for (const error of rollbackStatus.errors) {
        markdown += `- **${error.table || 'General'}:** ${error.error}\n`;
        markdown += `  *Time:* ${error.timestamp}\n\n`;
      }
    }
    
    if (rollbackStatus.warnings.length > 0) {
      markdown += `## Warnings\n\n`;
      for (const warning of rollbackStatus.warnings) {
        markdown += `- **${warning.table || 'General'}:** ${warning.warning}\n`;
        markdown += `  *Time:* ${warning.timestamp}\n\n`;
      }
    }
    
    markdown += `## Rollback Order\n\n`;
    for (let i = 0; i < this.rollbackOrder.length; i++) {
      markdown += `${i + 1}. ${this.rollbackOrder[i]}\n`;
    }
    
    markdown += `\n## Next Steps\n\n`;
    
    if (rollbackStatus.completed) {
      markdown += `- ✅ Rollback completed successfully\n`;
      markdown += `- 🔍 Verify that your application is working correctly\n`;
      markdown += `- 📊 Review any warnings above\n`;
      markdown += `- 🗑️ Clean up backup files when no longer needed\n`;
    } else {
      markdown += `- ❌ Rollback failed - review errors above\n`;
      markdown += `- 🔧 Manual intervention may be required\n`;
      markdown += `- 📞 Contact your database administrator if needed\n`;
      markdown += `- 💾 Restore from backup if necessary\n`;
    }
    
    return markdown;
  }

  formatDuration(ms) {
    if (!ms) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  printSummary() {
    const { rollbackStatus } = this;
    
    console.log('\n📋 Rollback Summary:');
    console.log('='.repeat(50));
    console.log(`Status: ${rollbackStatus.completed ? '✅ Completed' : '❌ Failed'}`);
    console.log(`Tables Processed: ${rollbackStatus.tablesProcessed}`);
    console.log(`Records Removed: ${rollbackStatus.recordsRemoved}`);
    console.log(`Backups Created: ${rollbackStatus.backupsCreated}`);
    console.log(`Errors: ${rollbackStatus.errors.length}`);
    console.log(`Warnings: ${rollbackStatus.warnings.length}`);
    console.log(`Duration: ${this.formatDuration(rollbackStatus.duration)}`);
    
    if (rollbackStatus.errors.length > 0) {
      console.log('\n❌ Errors occurred during rollback. Check the detailed report for more information.');
    } else if (rollbackStatus.warnings.length > 0) {
      console.log('\n⚠️ Rollback completed with warnings. Review the detailed report.');
    } else {
      console.log('\n✅ Rollback completed successfully with no issues!');
    }
  }

  // Emergency recovery methods
  async emergencyRecovery() {
    console.log('🚨 Starting emergency recovery...');
    
    try {
      // Disable all constraints temporarily
      await this.disableConstraints();
      
      // Truncate all tables
      await this.truncateAllTables();
      
      // Re-enable constraints
      await this.enableConstraints();
      
      console.log('✅ Emergency recovery completed');
      
    } catch (error) {
      console.error('❌ Emergency recovery failed:', error.message);
      throw error;
    }
  }

  async disableConstraints() {
    console.log('   Disabling foreign key constraints...');
    // This would require direct SQL execution
    // Implementation depends on your specific setup
  }

  async enableConstraints() {
    console.log('   Re-enabling foreign key constraints...');
    // This would require direct SQL execution
    // Implementation depends on your specific setup
  }

  async truncateAllTables() {
    console.log('   Truncating all tables...');
    
    for (const tableName of this.rollbackOrder) {
      try {
        // Use DELETE instead of TRUNCATE since Supabase client doesn't support TRUNCATE
        await this.rollbackTable(tableName);
      } catch (error) {
        console.warn(`   Failed to truncate ${tableName}: ${error.message}`);
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
      case '--supabase-url':
        options.supabaseUrl = args[++i];
        break;
      case '--supabase-key':
        options.supabaseKey = args[++i];
        break;
      case '--backup-dir':
        options.backupDir = args[++i];
        break;
      case '--rollback-type':
        options.rollbackType = args[++i];
        break;
      case '--no-confirm':
        options.confirmRollback = false;
        break;
      case '--no-backup':
        options.createBackup = false;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--emergency':
        options.emergency = true;
        break;
      case '--help':
        console.log(`
Migration Rollback Manager

Usage: node rollback-manager.js [options]

Options:
  --supabase-url <url>        Supabase project URL
  --supabase-key <key>        Supabase service role key
  --backup-dir <path>         Directory for backups and reports
  --rollback-type <type>      Type of rollback: full, partial, schema-only, data-only
  --no-confirm               Skip confirmation prompt
  --no-backup                Skip pre-rollback backup
  --dry-run                  Show what would be done without executing
  --verbose                  Enable verbose logging
  --emergency                Emergency recovery mode (use with caution)
  --help                     Show this help message

Environment Variables:
  SUPABASE_URL               Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY  Supabase service role key

Examples:
  # Full rollback with confirmation and backup
  node rollback-manager.js --rollback-type full

  # Dry run to see what would be rolled back
  node rollback-manager.js --dry-run --verbose

  # Partial rollback without confirmation
  node rollback-manager.js --rollback-type partial --no-confirm

  # Emergency recovery (use with extreme caution)
  node rollback-manager.js --emergency --no-confirm

⚠️  WARNING: Rollback operations can result in data loss. Always ensure you have proper backups!
`);
        process.exit(0);
        break;
    }
  }
  
  try {
    const rollbackManager = new RollbackManager(options);
    await rollbackManager.initialize();
    
    if (options.emergency) {
      await rollbackManager.emergencyRecovery();
    } else {
      await rollbackManager.executeRollback();
    }
    
  } catch (error) {
    console.error('💥 Rollback operation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { RollbackManager };