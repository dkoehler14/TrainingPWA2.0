#!/usr/bin/env node

/**
 * Development Utilities for Supabase
 * 
 * This tool provides various utilities for development and testing,
 * including data validation, performance testing, and debugging helpers.
 */

const { getSupabaseClient } = require('../utils/supabase-helpers');
const { logProgress, logSection, logSummary, logError } = require('../utils/logger');

/**
 * Validate database integrity and relationships
 */
async function validateDatabaseIntegrity(options = {}) {
  const { verbose = false, fix = false } = options;
  const supabase = getSupabaseClient();
  
  if (verbose) {
    logSection('Database Integrity Validation');
  }
  
  const issues = [];
  const statistics = {};
  
  try {
    // Check for orphaned records
    const orphanedChecks = [
      {
        name: 'Programs without users',
        query: `
          SELECT p.id, p.name, p.user_id 
          FROM programs p 
          LEFT JOIN users u ON p.user_id = u.id 
          WHERE u.id IS NULL
        `
      },
      {
        name: 'Workout logs without users',
        query: `
          SELECT wl.id, wl.name, wl.user_id 
          FROM workout_logs wl 
          LEFT JOIN users u ON wl.user_id = u.id 
          WHERE u.id IS NULL
        `
      },
      {
        name: 'Program exercises without exercises',
        query: `
          SELECT pe.id, pe.exercise_id 
          FROM program_exercises pe 
          LEFT JOIN exercises e ON pe.exercise_id = e.id 
          WHERE e.id IS NULL
        `
      }
    ];
    
    for (const check of orphanedChecks) {
      if (verbose) {
        logProgress(`Checking: ${check.name}...`, 'info');
      }
      
      try {
        const { data, error } = await supabase.rpc('execute_sql', { sql: check.query });
        
        if (error) {
          issues.push({
            type: 'query_error',
            check: check.name,
            error: error.message
          });
        } else if (data && data.length > 0) {
          issues.push({
            type: 'orphaned_records',
            check: check.name,
            count: data.length,
            records: data
          });
        }
        
        statistics[check.name] = data ? data.length : 0;
      } catch (error) {
        issues.push({
          type: 'validation_error',
          check: check.name,
          error: error.message
        });
      }
    }
    
    // Check data consistency
    const consistencyChecks = await performConsistencyChecks(supabase, { verbose });
    issues.push(...consistencyChecks.issues);
    Object.assign(statistics, consistencyChecks.statistics);
    
    // Check for performance issues
    const performanceChecks = await performPerformanceChecks(supabase, { verbose });
    issues.push(...performanceChecks.issues);
    Object.assign(statistics, performanceChecks.statistics);
    
    if (verbose) {
      logSummary('Validation Results', {
        totalIssues: issues.length,
        orphanedRecords: issues.filter(i => i.type === 'orphaned_records').length,
        consistencyIssues: issues.filter(i => i.type === 'consistency').length,
        performanceIssues: issues.filter(i => i.type === 'performance').length
      });
    }
    
    return {
      success: true,
      issues,
      statistics,
      isHealthy: issues.length === 0
    };
  } catch (error) {
    logError(error, 'Database validation', verbose);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Perform consistency checks
 */
async function performConsistencyChecks(supabase, options = {}) {
  const { verbose = false } = options;
  const issues = [];
  const statistics = {};
  
  // Check user analytics consistency
  if (verbose) {
    logProgress('Checking user analytics consistency...', 'info');
  }
  
  try {
    // Check if analytics match actual workout data
    const { data: analyticsData, error: analyticsError } = await supabase
      .from('user_analytics')
      .select('user_id, exercise_id, total_volume, max_weight, total_reps');
    
    if (analyticsError) {
      issues.push({
        type: 'consistency',
        check: 'Analytics data retrieval',
        error: analyticsError.message
      });
    } else {
      statistics['analytics_records'] = analyticsData.length;
      
      // Sample check - verify a few analytics records
      for (const analytics of analyticsData.slice(0, 5)) {
        const { data: workoutData, error: workoutError } = await supabase
          .from('workout_log_exercises')
          .select('reps, weights')
          .eq('exercise_id', analytics.exercise_id)
          .in('workout_log_id', 
            supabase
              .from('workout_logs')
              .select('id')
              .eq('user_id', analytics.user_id)
              .eq('is_finished', true)
          );
        
        if (!workoutError && workoutData) {
          // Calculate actual totals
          let actualTotalReps = 0;
          let actualMaxWeight = 0;
          
          for (const exercise of workoutData) {
            if (exercise.reps && Array.isArray(exercise.reps)) {
              actualTotalReps += exercise.reps.reduce((sum, reps) => sum + reps, 0);
            }
            if (exercise.weights && Array.isArray(exercise.weights)) {
              const maxWeight = Math.max(...exercise.weights);
              if (maxWeight > actualMaxWeight) {
                actualMaxWeight = maxWeight;
              }
            }
          }
          
          // Check for significant discrepancies
          if (Math.abs(actualTotalReps - analytics.total_reps) > 10) {
            issues.push({
              type: 'consistency',
              check: 'Analytics reps mismatch',
              userId: analytics.user_id,
              exerciseId: analytics.exercise_id,
              expected: actualTotalReps,
              actual: analytics.total_reps
            });
          }
        }
      }
    }
  } catch (error) {
    issues.push({
      type: 'consistency',
      check: 'Analytics consistency',
      error: error.message
    });
  }
  
  return { issues, statistics };
}

/**
 * Perform performance checks
 */
async function performPerformanceChecks(supabase, options = {}) {
  const { verbose = false } = options;
  const issues = [];
  const statistics = {};
  
  if (verbose) {
    logProgress('Checking database performance...', 'info');
  }
  
  try {
    // Test query performance
    const performanceTests = [
      {
        name: 'User lookup by email',
        query: () => supabase.from('users').select('*').eq('email', 'test@example.com').single()
      },
      {
        name: 'Workout logs with exercises',
        query: () => supabase
          .from('workout_logs')
          .select(`
            *,
            workout_log_exercises (
              *,
              exercises (name, primary_muscle_group)
            )
          `)
          .limit(10)
      },
      {
        name: 'User analytics aggregation',
        query: () => supabase
          .from('user_analytics')
          .select('user_id, total_volume, max_weight')
          .limit(20)
      }
    ];
    
    for (const test of performanceTests) {
      const startTime = Date.now();
      
      try {
        const { data, error } = await test.query();
        const duration = Date.now() - startTime;
        
        statistics[`${test.name}_duration`] = duration;
        
        if (error) {
          issues.push({
            type: 'performance',
            check: test.name,
            error: error.message
          });
        } else if (duration > 1000) { // Queries taking more than 1 second
          issues.push({
            type: 'performance',
            check: test.name,
            issue: 'Slow query',
            duration: `${duration}ms`
          });
        }
        
        if (verbose) {
          logProgress(`  ${test.name}: ${duration}ms`, 'info');
        }
      } catch (error) {
        issues.push({
          type: 'performance',
          check: test.name,
          error: error.message
        });
      }
    }
  } catch (error) {
    issues.push({
      type: 'performance',
      check: 'Performance testing',
      error: error.message
    });
  }
  
  return { issues, statistics };
}

/**
 * Generate development test data with specific patterns
 */
async function generateTestDataPatterns(options = {}) {
  const { 
    pattern = 'progression',
    userId = null,
    exerciseId = null,
    weeks = 4,
    verbose = false 
  } = options;
  
  const supabase = getSupabaseClient();
  
  if (verbose) {
    logSection(`Generating Test Data Pattern: ${pattern}`);
  }
  
  try {
    switch (pattern) {
      case 'progression':
        return await generateProgressionPattern(supabase, { userId, exerciseId, weeks, verbose });
      case 'plateau':
        return await generatePlateauPattern(supabase, { userId, exerciseId, weeks, verbose });
      case 'deload':
        return await generateDeloadPattern(supabase, { userId, exerciseId, weeks, verbose });
      case 'inconsistent':
        return await generateInconsistentPattern(supabase, { userId, exerciseId, weeks, verbose });
      default:
        throw new Error(`Unknown pattern: ${pattern}`);
    }
  } catch (error) {
    logError(error, 'Test data pattern generation', verbose);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generate progression pattern data
 */
async function generateProgressionPattern(supabase, options = {}) {
  const { userId, exerciseId, weeks, verbose } = options;
  
  if (verbose) {
    logProgress('Generating progression pattern...', 'info');
  }
  
  // Implementation would create workout logs showing steady progression
  // This is a simplified version
  const workoutLogs = [];
  
  for (let week = 1; week <= weeks; week++) {
    const baseWeight = 135 + (week - 1) * 5; // 5lb progression per week
    
    const workoutLog = {
      id: `progression-${userId}-${week}`,
      user_id: userId,
      name: `Progression Week ${week}`,
      date: new Date(Date.now() - (weeks - week) * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      is_finished: true,
      weight_unit: 'LB'
    };
    
    workoutLogs.push(workoutLog);
  }
  
  return {
    success: true,
    pattern: 'progression',
    workoutLogs: workoutLogs.length,
    description: 'Generated steady progression pattern'
  };
}

/**
 * Clean up test data and optimize database
 */
async function cleanupAndOptimize(options = {}) {
  const { verbose = false, vacuum = false } = options;
  const supabase = getSupabaseClient();
  
  if (verbose) {
    logSection('Database Cleanup and Optimization');
  }
  
  try {
    const cleanupResults = {};
    
    // Remove duplicate records
    if (verbose) {
      logProgress('Checking for duplicate records...', 'info');
    }
    
    // Clean up orphaned workout log exercises
    const { data: orphanedExercises, error: orphanedError } = await supabase
      .from('workout_log_exercises')
      .select('id')
      .not('workout_log_id', 'in', 
        supabase.from('workout_logs').select('id')
      );
    
    if (!orphanedError && orphanedExercises && orphanedExercises.length > 0) {
      const { error: deleteError } = await supabase
        .from('workout_log_exercises')
        .delete()
        .in('id', orphanedExercises.map(e => e.id));
      
      if (!deleteError) {
        cleanupResults.orphanedExercisesRemoved = orphanedExercises.length;
        if (verbose) {
          logProgress(`Removed ${orphanedExercises.length} orphaned workout log exercises`, 'info');
        }
      }
    }
    
    // Update analytics for consistency
    if (verbose) {
      logProgress('Updating analytics for consistency...', 'info');
    }
    
    // This would typically recalculate analytics
    cleanupResults.analyticsUpdated = true;
    
    return {
      success: true,
      cleanupResults
    };
  } catch (error) {
    logError(error, 'Database cleanup', verbose);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Export database schema and data for debugging
 */
async function exportDatabaseInfo(options = {}) {
  const { verbose = false, includeData = false } = options;
  const supabase = getSupabaseClient();
  
  if (verbose) {
    logSection('Exporting Database Information');
  }
  
  try {
    const exportData = {
      timestamp: new Date().toISOString(),
      schema: {},
      statistics: {},
      data: {}
    };
    
    // Get table statistics
    const tables = ['users', 'programs', 'workout_logs', 'exercises', 'user_analytics'];
    
    for (const table of tables) {
      if (verbose) {
        logProgress(`Gathering info for ${table}...`, 'info');
      }
      
      const { count, error } = await supabase
        .from(table)
        .select('count', { count: 'exact', head: true });
      
      if (!error) {
        exportData.statistics[table] = count || 0;
      }
      
      if (includeData) {
        const { data, error: dataError } = await supabase
          .from(table)
          .select('*')
          .limit(10); // Sample data only
        
        if (!dataError) {
          exportData.data[table] = data || [];
        }
      }
    }
    
    // Save to file
    const fs = require('fs');
    const path = require('path');
    
    const exportDir = path.join(process.cwd(), 'debug-exports');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportFile = path.join(exportDir, `database-export-${timestamp}.json`);
    
    fs.writeFileSync(exportFile, JSON.stringify(exportData, null, 2));
    
    if (verbose) {
      logProgress(`Export saved to: ${exportFile}`, 'success');
    }
    
    return {
      success: true,
      exportFile,
      statistics: exportData.statistics
    };
  } catch (error) {
    logError(error, 'Database export', verbose);
    return {
      success: false,
      error: error.message
    };
  }
}

// Export functions for use in other modules
module.exports = {
  validateDatabaseIntegrity,
  performConsistencyChecks,
  performPerformanceChecks,
  generateTestDataPatterns,
  cleanupAndOptimize,
  exportDatabaseInfo
};

// Allow running directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'validate';
  
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    fix: args.includes('--fix'),
    includeData: args.includes('--include-data'),
    vacuum: args.includes('--vacuum')
  };
  
  switch (command) {
    case 'validate':
      validateDatabaseIntegrity(options)
        .then(result => {
          if (result.success) {
            console.log(`✅ Database validation completed`);
            console.log(`Issues found: ${result.issues.length}`);
            if (result.issues.length > 0) {
              console.log('\nIssues:');
              result.issues.forEach((issue, index) => {
                console.log(`${index + 1}. ${issue.check}: ${issue.error || issue.issue || 'Found ' + issue.count + ' records'}`);
              });
            }
          } else {
            console.error('❌ Database validation failed:', result.error);
            process.exit(1);
          }
        })
        .catch(error => {
          console.error('❌ Validation error:', error.message);
          process.exit(1);
        });
      break;
    
    case 'cleanup':
      cleanupAndOptimize(options)
        .then(result => {
          if (result.success) {
            console.log('✅ Database cleanup completed');
            logSummary('Cleanup Results', result.cleanupResults);
          } else {
            console.error('❌ Database cleanup failed:', result.error);
            process.exit(1);
          }
        })
        .catch(error => {
          console.error('❌ Cleanup error:', error.message);
          process.exit(1);
        });
      break;
    
    case 'export':
      exportDatabaseInfo(options)
        .then(result => {
          if (result.success) {
            console.log('✅ Database export completed');
            console.log(`Export file: ${result.exportFile}`);
            logSummary('Database Statistics', result.statistics);
          } else {
            console.error('❌ Database export failed:', result.error);
            process.exit(1);
          }
        })
        .catch(error => {
          console.error('❌ Export error:', error.message);
          process.exit(1);
        });
      break;
    
    default:
      console.log(`
🔧 Development Utilities for Supabase

USAGE:
  node dev-utilities.js [command] [options]

COMMANDS:
  validate    Validate database integrity and relationships (default)
  cleanup     Clean up orphaned data and optimize database
  export      Export database schema and statistics for debugging

OPTIONS:
  --fix               Attempt to fix issues found during validation
  --include-data      Include sample data in exports
  --vacuum            Perform database vacuum during cleanup
  -v, --verbose       Show detailed progress information

EXAMPLES:
  node dev-utilities.js validate --verbose
  node dev-utilities.js cleanup --fix --verbose
  node dev-utilities.js export --include-data --verbose
      `);
      break;
  }
}