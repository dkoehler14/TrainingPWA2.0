#!/usr/bin/env node

/**
 * Enhanced Database Reset and Cleanup Utilities
 * 
 * This tool provides comprehensive database reset capabilities with
 * selective cleanup options, backup functionality, and verification.
 */

const { getSupabaseClient } = require('../utils/supabase-helpers');
const { logProgress, logSection, logSummary, logError } = require('../utils/logger');

/**
 * Comprehensive database reset with multiple options
 */
async function resetDatabase(options = {}) {
  const {
    mode = 'full', // 'full', 'user-data', 'selective'
    preserveExercises = true,
    preserveUsers = false,
    createBackup = false,
    verbose = false,
    force = false
  } = options;
  
  const supabase = getSupabaseClient(true); // Use service role for reset operations
  const startTime = Date.now();
  
  if (verbose) {
    logSection('Database Reset Operation');
    logProgress(`Reset mode: ${mode}`, 'info');
  }
  
  try {
    // Create backup if requested
    let backupResult = null;
    if (createBackup) {
      backupResult = await createDatabaseBackup(supabase, { verbose });
    }
    
    // Confirm operation unless forced
    if (!force) {
      const confirmed = await confirmResetOperation(mode);
      if (!confirmed) {
        return {
          success: true,
          cancelled: true,
          message: 'Reset operation cancelled by user'
        };
      }
    }
    
    // Perform reset based on mode
    let resetResult;
    switch (mode) {
      case 'full':
        resetResult = await performFullReset(supabase, { preserveExercises, verbose });
        break;
      case 'user-data':
        resetResult = await performUserDataReset(supabase, { verbose });
        break;
      case 'selective':
        resetResult = await performSelectiveReset(supabase, options);
        break;
      default:
        throw new Error(`Unknown reset mode: ${mode}`);
    }
    
    // Verify reset completion
    const verification = await verifyResetCompletion(supabase, mode);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return {
      success: true,
      mode,
      statistics: resetResult.statistics,
      backup: backupResult,
      verification,
      duration
    };
  } catch (error) {
    logError(error, 'Database reset operation', verbose);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create a backup of current database state
 */
async function createDatabaseBackup(supabase, options = {}) {
  const { verbose = false } = options;
  
  if (verbose) {
    logProgress('Creating database backup...', 'info');
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupData = {};
  
  try {
    // Backup all tables
    const tables = [
      'users', 'programs', 'program_workouts', 'program_exercises',
      'workout_logs', 'workout_log_exercises', 'user_analytics', 'exercises'
    ];
    
    for (const table of tables) {
      if (verbose) {
        logProgress(`  Backing up ${table}...`, 'info');
      }
      
      const { data, error } = await supabase
        .from(table)
        .select('*');
      
      if (error) {
        console.warn(`Warning: Could not backup ${table}: ${error.message}`);
        backupData[table] = [];
      } else {
        backupData[table] = data || [];
      }
    }
    
    // Save backup to file
    const fs = require('fs');
    const path = require('path');
    
    const backupDir = path.join(process.cwd(), 'migration-backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupFile = path.join(backupDir, `database-backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    
    if (verbose) {
      logProgress(`✅ Backup created: ${backupFile}`, 'success');
    }
    
    return {
      success: true,
      file: backupFile,
      timestamp,
      recordCounts: Object.fromEntries(
        Object.entries(backupData).map(([table, data]) => [table, data.length])
      )
    };
  } catch (error) {
    console.warn('Warning: Could not create backup:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Perform full database reset
 */
async function performFullReset(supabase, options = {}) {
  const { preserveExercises = true, verbose = false } = options;
  
  if (verbose) {
    logProgress('Performing full database reset...', 'info');
  }
  
  const statistics = {};
  
  // Define reset order to respect foreign key constraints
  const resetOperations = [
    { table: 'user_analytics', description: 'user analytics' },
    { table: 'workout_log_exercises', description: 'workout log exercises' },
    { table: 'workout_logs', description: 'workout logs' },
    { table: 'program_exercises', description: 'program exercises' },
    { table: 'program_workouts', description: 'program workouts' },
    { table: 'programs', description: 'programs' },
    { table: 'users', description: 'users' }
  ];
  
  // Add exercises to reset if not preserving them
  if (!preserveExercises) {
    resetOperations.push({ table: 'exercises', description: 'exercises' });
  } else {
    // Only delete custom exercises, preserve global ones
    resetOperations.push({ 
      table: 'exercises', 
      description: 'custom exercises',
      condition: { column: 'is_global', value: false }
    });
  }
  
  for (const { table, description, condition } of resetOperations) {
    if (verbose) {
      logProgress(`  Clearing ${description}...`, 'info');
    }
    
    try {
      let query = supabase.from(table).delete();
      
      if (condition) {
        query = query.eq(condition.column, condition.value);
      } else {
        // Delete all records using a valid UUID that doesn't exist
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }
      
      const { error, count } = await query;
      
      if (error) {
        console.warn(`Warning: Could not clear ${description}: ${error.message}`);
        statistics[table] = 0;
      } else {
        statistics[table] = count || 0;
        if (verbose) {
          logProgress(`    ✅ Cleared ${count || 0} ${description}`, 'info');
        }
      }
    } catch (error) {
      console.warn(`Warning: Error clearing ${description}:`, error.message);
      statistics[table] = 0;
    }
  }
  
  return { statistics };
}

/**
 * Perform user data reset (preserve exercises and system data)
 */
async function performUserDataReset(supabase, options = {}) {
  const { verbose = false } = options;
  
  if (verbose) {
    logProgress('Performing user data reset...', 'info');
  }
  
  const statistics = {};
  
  // Only reset user-generated data
  const resetOperations = [
    { table: 'user_analytics', description: 'user analytics' },
    { table: 'workout_log_exercises', description: 'workout log exercises' },
    { table: 'workout_logs', description: 'workout logs' },
    { table: 'program_exercises', description: 'program exercises' },
    { table: 'program_workouts', description: 'program workouts' },
    { table: 'programs', description: 'programs' },
    { table: 'users', description: 'users' },
    { 
      table: 'exercises', 
      description: 'custom exercises',
      condition: { column: 'is_global', value: false }
    }
  ];
  
  for (const { table, description, condition } of resetOperations) {
    if (verbose) {
      logProgress(`  Clearing ${description}...`, 'info');
    }
    
    try {
      let query = supabase.from(table).delete();
      
      if (condition) {
        query = query.eq(condition.column, condition.value);
      } else {
        query = query.neq('id', '00000000-0000-0000-0000-000000000000');
      }
      
      const { error, count } = await query;
      
      if (error) {
        console.warn(`Warning: Could not clear ${description}: ${error.message}`);
        statistics[table] = 0;
      } else {
        statistics[table] = count || 0;
        if (verbose) {
          logProgress(`    ✅ Cleared ${count || 0} ${description}`, 'info');
        }
      }
    } catch (error) {
      console.warn(`Warning: Error clearing ${description}:`, error.message);
      statistics[table] = 0;
    }
  }
  
  return { statistics };
}

/**
 * Perform selective reset based on specific criteria
 */
async function performSelectiveReset(supabase, options = {}) {
  const { 
    tables = [],
    userIds = [],
    dateRange = null,
    verbose = false 
  } = options;
  
  if (verbose) {
    logProgress('Performing selective reset...', 'info');
  }
  
  const statistics = {};
  
  // Reset specific tables
  if (tables.length > 0) {
    for (const table of tables) {
      if (verbose) {
        logProgress(`  Clearing ${table}...`, 'info');
      }
      
      try {
        const { error, count } = await supabase
          .from(table)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (error) {
          console.warn(`Warning: Could not clear ${table}: ${error.message}`);
          statistics[table] = 0;
        } else {
          statistics[table] = count || 0;
          if (verbose) {
            logProgress(`    ✅ Cleared ${count || 0} records from ${table}`, 'info');
          }
        }
      } catch (error) {
        console.warn(`Warning: Error clearing ${table}:`, error.message);
        statistics[table] = 0;
      }
    }
  }
  
  // Reset data for specific users
  if (userIds.length > 0) {
    const userTables = ['user_analytics', 'workout_logs', 'programs'];
    
    for (const table of userTables) {
      if (verbose) {
        logProgress(`  Clearing ${table} for specific users...`, 'info');
      }
      
      try {
        const { error, count } = await supabase
          .from(table)
          .delete()
          .in('user_id', userIds);
        
        if (error) {
          console.warn(`Warning: Could not clear ${table} for users: ${error.message}`);
          statistics[`${table}_users`] = 0;
        } else {
          statistics[`${table}_users`] = count || 0;
          if (verbose) {
            logProgress(`    ✅ Cleared ${count || 0} records from ${table}`, 'info');
          }
        }
      } catch (error) {
        console.warn(`Warning: Error clearing ${table} for users:`, error.message);
        statistics[`${table}_users`] = 0;
      }
    }
  }
  
  return { statistics };
}

/**
 * Verify reset completion
 */
async function verifyResetCompletion(supabase, mode) {
  try {
    const counts = {};
    const tables = ['users', 'programs', 'workout_logs', 'exercises', 'user_analytics'];
    
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('count', { count: 'exact', head: true });
      
      if (error) {
        counts[table] = 'error';
      } else {
        counts[table] = count || 0;
      }
    }
    
    return {
      success: true,
      counts,
      isEmpty: mode === 'full' ? 
        Object.values(counts).every(count => count === 0 || count === 'error') :
        counts.users === 0 && counts.programs === 0 && counts.workout_logs === 0
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Confirm reset operation with user
 */
async function confirmResetOperation(mode) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const messages = {
    full: '⚠️  This will delete ALL data including users, programs, and workout logs. Continue? (y/N): ',
    'user-data': '⚠️  This will delete all user data but preserve global exercises. Continue? (y/N): ',
    selective: '⚠️  This will delete selected data based on your criteria. Continue? (y/N): '
  };
  
  const message = messages[mode] || messages.full;
  
  const answer = await new Promise(resolve => {
    rl.question(message, resolve);
  });
  
  rl.close();
  
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * Get current database statistics
 */
async function getDatabaseStatistics(options = {}) {
  const { verbose = false } = options;
  const supabase = getSupabaseClient(true); // Use service role for statistics
  
  if (verbose) {
    logProgress('Gathering database statistics...', 'info');
  }
  
  try {
    const tables = [
      'users', 'programs', 'program_workouts', 'program_exercises',
      'workout_logs', 'workout_log_exercises', 'user_analytics', 'exercises'
    ];
    
    const statistics = {};
    
    for (const table of tables) {
      const { count, error } = await supabase
        .from(table)
        .select('count', { count: 'exact', head: true });
      
      if (error) {
        statistics[table] = { count: 'error', error: error.message };
      } else {
        statistics[table] = { count: count || 0 };
      }
    }
    
    // Calculate additional metrics
    const totalRecords = Object.values(statistics)
      .filter(stat => typeof stat.count === 'number')
      .reduce((sum, stat) => sum + stat.count, 0);
    
    return {
      success: true,
      statistics,
      totalRecords,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

// Export functions for use in other modules
module.exports = {
  resetDatabase,
  createDatabaseBackup,
  performFullReset,
  performUserDataReset,
  performSelectiveReset,
  verifyResetCompletion,
  getDatabaseStatistics
};

// Allow running directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'reset';
  
  const options = {
    mode: args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'full',
    verbose: args.includes('--verbose') || args.includes('-v'),
    force: args.includes('--force') || args.includes('-f'),
    createBackup: args.includes('--backup'),
    preserveExercises: !args.includes('--no-preserve-exercises')
  };
  
  switch (command) {
    case 'reset':
      resetDatabase(options)
        .then(result => {
          if (result.success) {
            if (result.cancelled) {
              console.log('Reset operation cancelled');
            } else {
              console.log('✅ Database reset completed successfully');
              logSummary('Reset Results', result.statistics);
            }
          } else {
            console.error('❌ Database reset failed:', result.error);
            process.exit(1);
          }
        })
        .catch(error => {
          console.error('❌ Database reset failed:', error.message);
          process.exit(1);
        });
      break;
    
    case 'stats':
      getDatabaseStatistics(options)
        .then(result => {
          if (result.success) {
            console.log('📊 Current Database Statistics');
            console.log('─'.repeat(50));
            Object.entries(result.statistics).forEach(([table, stat]) => {
              console.log(`  ${table}: ${stat.count}`);
            });
            console.log('─'.repeat(50));
            console.log(`  Total Records: ${result.totalRecords}`);
          } else {
            console.error('❌ Could not gather statistics:', result.error);
            process.exit(1);
          }
        })
        .catch(error => {
          console.error('❌ Statistics gathering failed:', error.message);
          process.exit(1);
        });
      break;
    
    default:
      console.log(`
🧹 Database Reset and Cleanup Tool

USAGE:
  node database-reset.js [command] [options]

COMMANDS:
  reset     Reset database (default)
  stats     Show current database statistics

RESET OPTIONS:
  --mode=<mode>           Reset mode: full, user-data, selective (default: full)
  --backup                Create backup before reset
  --no-preserve-exercises Delete global exercises too
  -f, --force             Skip confirmation prompt
  -v, --verbose           Show detailed progress

EXAMPLES:
  node database-reset.js reset --mode=user-data --backup --verbose
  node database-reset.js stats --verbose
      `);
      break;
  }
}