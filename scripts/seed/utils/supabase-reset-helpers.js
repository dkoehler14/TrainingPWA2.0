/**
 * Supabase Reset Helper Functions
 * 
 * This module provides functions for resetting and cleaning up
 * test data in the Supabase PostgreSQL database.
 */

const { getSupabaseClient } = require('./supabase-helpers');

/**
 * Get statistics about current data in Supabase database
 */
async function getSupabaseResetStatistics(supabase = null) {
  if (!supabase) {
    supabase = getSupabaseClient();
  }
  
  try {
    const [usersResult, programsResult, workoutLogsResult, exercisesResult] = await Promise.all([
      supabase.from('users').select('count', { count: 'exact', head: true }),
      supabase.from('programs').select('count', { count: 'exact', head: true }),
      supabase.from('workout_logs').select('count', { count: 'exact', head: true }),
      supabase.from('exercises').select('count', { count: 'exact', head: true })
    ]);
    
    return {
      users: usersResult.count || 0,
      programs: programsResult.count || 0,
      workoutLogs: workoutLogsResult.count || 0,
      exercises: exercisesResult.count || 0
    };
  } catch (error) {
    console.warn('Could not retrieve reset statistics:', error.message);
    return {
      users: 0,
      programs: 0,
      workoutLogs: 0,
      exercises: 0
    };
  }
}

/**
 * Clear all user-generated data while preserving global exercises
 */
async function clearSupabaseUserData(options = {}) {
  const supabase = getSupabaseClient();
  const { verbose = false } = options;
  
  if (verbose) {
    console.log('🧹 Clearing user data from Supabase...');
  }
  
  const results = {};
  
  try {
    // Clear in order to respect foreign key constraints
    const clearOperations = [
      {
        table: 'user_analytics',
        description: 'user analytics',
        condition: null
      },
      {
        table: 'workout_log_exercises',
        description: 'workout log exercises',
        condition: null
      },
      {
        table: 'workout_logs',
        description: 'workout logs',
        condition: null
      },
      {
        table: 'program_exercises',
        description: 'program exercises',
        condition: null
      },
      {
        table: 'program_workouts',
        description: 'program workouts',
        condition: null
      },
      {
        table: 'programs',
        description: 'programs',
        condition: null
      },
      {
        table: 'users',
        description: 'users',
        condition: null
      },
      {
        table: 'exercises',
        description: 'custom exercises',
        condition: { column: 'is_global', value: false }
      }
    ];
    
    for (const { table, description, condition } of clearOperations) {
      if (verbose) {
        console.log(`  Clearing ${description}...`);
      }
      
      let query = supabase.from(table).delete();
      
      if (condition) {
        query = query.eq(condition.column, condition.value);
      } else {
        // Delete all records by using a condition that's always true
        query = query.neq('id', 'impossible-id-that-never-exists');
      }
      
      const { error, count } = await query;
      
      if (error) {
        console.warn(`Warning: Could not clear ${description}: ${error.message}`);
        results[table] = 0;
      } else {
        results[table] = count || 0;
        if (verbose) {
          console.log(`    ✅ Cleared ${count || 0} ${description}`);
        }
      }
    }
    
    return {
      success: true,
      statistics: results
    };
  } catch (error) {
    console.error('Error clearing user data:', error);
    return {
      success: false,
      error: error.message,
      statistics: results
    };
  }
}

/**
 * Reset database to initial state with only global exercises
 */
async function resetSupabaseToInitialState(options = {}) {
  const { verbose = false, force = false } = options;
  
  if (!force) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise(resolve => {
      rl.question('⚠️  This will delete ALL test data. Continue? (y/N): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      return {
        success: true,
        cancelled: true,
        message: 'Reset cancelled by user'
      };
    }
  }
  
  const startTime = Date.now();
  const result = await clearSupabaseUserData({ verbose });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (result.success) {
    result.statistics.duration = duration;
  }
  
  return result;
}

/**
 * Verify database is in clean state
 */
async function verifySupabaseCleanState() {
  const stats = await getSupabaseResetStatistics();
  
  const isClean = stats.users === 0 && 
                  stats.programs === 0 && 
                  stats.workoutLogs === 0;
  
  return {
    isClean,
    stats,
    message: isClean ? 'Database is in clean state' : 'Database contains user data'
  };
}

module.exports = {
  getSupabaseResetStatistics,
  clearSupabaseUserData,
  resetSupabaseToInitialState,
  verifySupabaseCleanState
};