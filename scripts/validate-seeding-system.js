#!/usr/bin/env node

/**
 * Seeding System Validation Script
 * 
 * Validates the complete seeding system by running actual seeding operations
 * and verifying data integrity, relationships, and application compatibility.
 */

const { seedAll, resetAll } = require('./seed/seeder');
const { getFirestore, getAuth } = require('./seed/utils/firebase-config');
const { validateEmulators } = require('./seed/utils/emulator-helpers');
const { UserValidator, ExerciseValidator, ProgramValidator, WorkoutLogValidator } = require('./seed/utils/validation');

// Validation configuration
const VALIDATION_CONFIG = {
  verbose: process.argv.includes('--verbose') || process.argv.includes('-v'),
  skipEmulatorCheck: process.argv.includes('--skip-emulator-check'),
  testScenarios: process.argv.includes('--test-scenarios') ? 
    process.argv[process.argv.indexOf('--test-scenarios') + 1]?.split(',') || ['basic'] : 
    ['basic'],
  includeHistoricalData: !process.argv.includes('--no-history'),
  performanceTest: process.argv.includes('--performance'),
  cleanupAfter: !process.argv.includes('--no-cleanup')
};

/**
 * Colors for console output
 */
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Log with color and formatting
 */
function log(message, color = 'reset', prefix = '') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors[color]}${prefix}[${timestamp}] ${message}${colors.reset}`);
}

/**
 * Log section header
 */
function logSection(title) {
  const border = '='.repeat(60);
  console.log(`\n${colors.cyan}${border}`);
  console.log(`${colors.bright}${colors.cyan}  ${title}`);
  console.log(`${border}${colors.reset}\n`);
}

/**
 * Validation result tracker
 */
class ValidationTracker {
  constructor() {
    this.results = [];
    this.startTime = Date.now();
  }

  addResult(category, test, success, details = null, error = null) {
    this.results.push({
      category,
      test,
      success,
      details,
      error,
      timestamp: new Date()
    });

    const status = success ? '✅' : '❌';
    const color = success ? 'green' : 'red';
    log(`${test}: ${success ? 'PASS' : 'FAIL'}`, color, `${status} `);
    
    if (!success && error && VALIDATION_CONFIG.verbose) {
      console.log(`    Error: ${error}`);
    }
    
    if (success && details && VALIDATION_CONFIG.verbose) {
      console.log(`    Details: ${details}`);
    }
  }

  getSummary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const duration = Date.now() - this.startTime;

    return {
      total,
      passed,
      failed,
      duration,
      categories: this.getCategorySummary(),
      allPassed: failed === 0
    };
  }

  getCategorySummary() {
    const categories = {};
    this.results.forEach(result => {
      if (!categories[result.category]) {
        categories[result.category] = { total: 0, passed: 0, failed: 0 };
      }
      categories[result.category].total++;
      if (result.success) {
        categories[result.category].passed++;
      } else {
        categories[result.category].failed++;
      }
    });
    return categories;
  }

  logSummary() {
    const summary = this.getSummary();
    
    logSection('Validation Results Summary');
    
    console.log(`${colors.bright}Total Validations: ${summary.total}${colors.reset}`);
    console.log(`${colors.green}Passed: ${summary.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${summary.failed}${colors.reset}`);
    console.log(`${colors.blue}Duration: ${summary.duration}ms${colors.reset}`);
    
    console.log(`\n${colors.bright}Results by Category:${colors.reset}`);
    Object.entries(summary.categories).forEach(([category, stats]) => {
      const status = stats.failed === 0 ? colors.green : colors.red;
      console.log(`  ${status}${category}: ${stats.passed}/${stats.total} passed${colors.reset}`);
    });
    
    console.log(`\n${colors.bright}Overall Result: ${summary.allPassed ? 
      `${colors.green}PASS` : `${colors.red}FAIL`}${colors.reset}\n`);

    if (!summary.allPassed) {
      console.log(`${colors.red}${colors.bright}Failed Validations:${colors.reset}`);
      this.results.filter(r => !r.success).forEach(result => {
        console.log(`${colors.red}  ✗ ${result.category}: ${result.test}${colors.reset}`);
        if (result.error) {
          console.log(`    ${result.error}`);
        }
      });
    }
  }
}

/**
 * Validate emulator connectivity
 */
async function validateEmulatorConnectivity(tracker) {
  logSection('Emulator Connectivity Validation');
  
  if (VALIDATION_CONFIG.skipEmulatorCheck) {
    log('Skipping emulator connectivity check', 'yellow', '⚠️  ');
    return true;
  }

  try {
    await validateEmulators();
    tracker.addResult('Connectivity', 'Emulator Validation', true, 'All emulators are running and accessible');
    return true;
  } catch (error) {
    tracker.addResult('Connectivity', 'Emulator Validation', false, null, error.message);
    return false;
  }
}

/**
 * Validate seeding functionality
 */
async function validateSeedingFunctionality(tracker) {
  logSection('Seeding Functionality Validation');

  try {
    // Test basic seeding
    const startTime = Date.now();
    const result = await seedAll({
      scenarios: VALIDATION_CONFIG.testScenarios,
      verbose: false,
      includeHistoricalData: VALIDATION_CONFIG.includeHistoricalData
    });
    const duration = Date.now() - startTime;

    tracker.addResult('Seeding', 'Basic Seeding Operation', result.success, 
      `Completed in ${duration}ms with ${result.summary.users} users, ${result.summary.programs} programs`);

    if (!result.success) {
      return false;
    }

    // Validate seeding results
    tracker.addResult('Seeding', 'User Creation', result.summary.users > 0, 
      `Created ${result.summary.users} users`);
    
    tracker.addResult('Seeding', 'Exercise Database', result.summary.exercises > 0, 
      `Seeded ${result.summary.exercises} exercises`);
    
    tracker.addResult('Seeding', 'Program Creation', result.summary.programs > 0, 
      `Created ${result.summary.programs} programs`);

    if (VALIDATION_CONFIG.includeHistoricalData) {
      tracker.addResult('Seeding', 'Historical Data Generation', result.summary.historicalData, 
        'Historical workout logs generated');
    }

    return true;

  } catch (error) {
    tracker.addResult('Seeding', 'Basic Seeding Operation', false, null, error.message);
    return false;
  }
}

/**
 * Validate data integrity
 */
async function validateDataIntegrity(tracker) {
  logSection('Data Integrity Validation');

  try {
    const db = getFirestore();
    const auth = getAuth();

    // Validate users
    const usersSnapshot = await db.collection('users').get();
    const userCount = usersSnapshot.size;
    
    tracker.addResult('Data Integrity', 'User Documents', userCount > 0, 
      `Found ${userCount} user documents`);

    // Validate user data structure
    const userValidator = new UserValidator();
    let validUserCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const mockUser = {
        uid: userDoc.id,
        email: userData.email,
        scenario: userData.experienceLevel || 'unknown'
      };
      
      if (userValidator.validateCreatedUser(mockUser)) {
        validUserCount++;
      }
      userValidator.clearErrors();
    }

    tracker.addResult('Data Integrity', 'User Data Structure', validUserCount === userCount, 
      `${validUserCount}/${userCount} users have valid structure`);

    // Validate exercises
    const exercisesSnapshot = await db.collection('exercises').get();
    const exerciseCount = exercisesSnapshot.size;
    
    tracker.addResult('Data Integrity', 'Exercise Documents', exerciseCount > 0, 
      `Found ${exerciseCount} exercise documents`);

    // Validate exercise data structure
    const exerciseValidator = new ExerciseValidator();
    let validExerciseCount = 0;
    
    for (const exerciseDoc of exercisesSnapshot.docs) {
      const exerciseData = exerciseDoc.data();
      if (exerciseValidator.validateExercise(exerciseData)) {
        validExerciseCount++;
      }
      exerciseValidator.clearErrors();
    }

    tracker.addResult('Data Integrity', 'Exercise Data Structure', validExerciseCount === exerciseCount, 
      `${validExerciseCount}/${exerciseCount} exercises have valid structure`);

    // Validate programs
    const programsSnapshot = await db.collection('programs').get();
    const programCount = programsSnapshot.size;
    
    tracker.addResult('Data Integrity', 'Program Documents', programCount > 0, 
      `Found ${programCount} program documents`);

    // Validate program data structure
    const programValidator = new ProgramValidator();
    let validProgramCount = 0;
    
    for (const programDoc of programsSnapshot.docs) {
      const programData = programDoc.data();
      if (programValidator.validateProgramDocument(programData)) {
        validProgramCount++;
      }
      programValidator.clearErrors();
    }

    tracker.addResult('Data Integrity', 'Program Data Structure', validProgramCount === programCount, 
      `${validProgramCount}/${programCount} programs have valid structure`);

    // Validate workout logs if historical data was included
    if (VALIDATION_CONFIG.includeHistoricalData) {
      const logsSnapshot = await db.collection('workoutLogs').get();
      const logCount = logsSnapshot.size;
      
      tracker.addResult('Data Integrity', 'Workout Log Documents', logCount > 0, 
        `Found ${logCount} workout log documents`);

      // Validate workout log data structure
      const logValidator = new WorkoutLogValidator();
      let validLogCount = 0;
      
      for (const logDoc of logsSnapshot.docs) {
        const logData = logDoc.data();
        if (logValidator.validateWorkoutLog(logData)) {
          validLogCount++;
        }
        logValidator.clearErrors();
      }

      tracker.addResult('Data Integrity', 'Workout Log Data Structure', validLogCount === logCount, 
        `${validLogCount}/${logCount} workout logs have valid structure`);
    }

    return true;

  } catch (error) {
    tracker.addResult('Data Integrity', 'Data Integrity Check', false, null, error.message);
    return false;
  }
}

/**
 * Validate data relationships
 */
async function validateDataRelationships(tracker) {
  logSection('Data Relationship Validation');

  try {
    const db = getFirestore();

    // Get all collections
    const [usersSnapshot, programsSnapshot, exercisesSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('programs').get(),
      db.collection('exercises').get()
    ]);

    const userIds = usersSnapshot.docs.map(doc => doc.id);
    const exerciseIds = exercisesSnapshot.docs.map(doc => doc.id);

    // Validate user-program relationships
    let validUserProgramRelations = 0;
    for (const programDoc of programsSnapshot.docs) {
      const programData = programDoc.data();
      if (userIds.includes(programData.userId)) {
        validUserProgramRelations++;
      }
    }

    tracker.addResult('Relationships', 'User-Program Relations', 
      validUserProgramRelations === programsSnapshot.size,
      `${validUserProgramRelations}/${programsSnapshot.size} programs have valid user references`);

    // Validate program-exercise relationships
    let validProgramExerciseRelations = 0;
    for (const programDoc of programsSnapshot.docs) {
      const programData = programDoc.data();
      let hasValidExercises = true;
      
      if (programData.weeklyConfigs) {
        for (const [configKey, config] of Object.entries(programData.weeklyConfigs)) {
          if (config.exercises) {
            for (const exercise of config.exercises) {
              if (exercise.exerciseId && !exerciseIds.includes(exercise.exerciseId)) {
                hasValidExercises = false;
                break;
              }
            }
          }
          if (!hasValidExercises) break;
        }
      }
      
      if (hasValidExercises) {
        validProgramExerciseRelations++;
      }
    }

    tracker.addResult('Relationships', 'Program-Exercise Relations', 
      validProgramExerciseRelations === programsSnapshot.size,
      `${validProgramExerciseRelations}/${programsSnapshot.size} programs have valid exercise references`);

    // Validate workout log relationships if historical data exists
    if (VALIDATION_CONFIG.includeHistoricalData) {
      const logsSnapshot = await db.collection('workoutLogs').get();
      const programIds = programsSnapshot.docs.map(doc => doc.id);

      let validLogRelations = 0;
      for (const logDoc of logsSnapshot.docs) {
        const logData = logDoc.data();
        const hasValidUser = userIds.includes(logData.userId);
        const hasValidProgram = programIds.includes(logData.programId);
        
        if (hasValidUser && hasValidProgram) {
          validLogRelations++;
        }
      }

      tracker.addResult('Relationships', 'Workout Log Relations', 
        validLogRelations === logsSnapshot.size,
        `${validLogRelations}/${logsSnapshot.size} workout logs have valid references`);
    }

    return true;

  } catch (error) {
    tracker.addResult('Relationships', 'Relationship Validation', false, null, error.message);
    return false;
  }
}

/**
 * Validate reset functionality
 */
async function validateResetFunctionality(tracker) {
  logSection('Reset Functionality Validation');

  try {
    const db = getFirestore();

    // Get counts before reset
    const [usersBefore, programsBefore, exercisesBefore] = await Promise.all([
      db.collection('users').get(),
      db.collection('programs').get(),
      db.collection('exercises').get()
    ]);

    const beforeCounts = {
      users: usersBefore.size,
      programs: programsBefore.size,
      exercises: exercisesBefore.size
    };

    tracker.addResult('Reset', 'Pre-Reset Data Count', 
      beforeCounts.users > 0 && beforeCounts.programs > 0 && beforeCounts.exercises > 0,
      `Before reset: ${beforeCounts.users} users, ${beforeCounts.programs} programs, ${beforeCounts.exercises} exercises`);

    // Perform reset
    const resetResult = await resetAll({
      force: true,
      verbose: false
    });

    tracker.addResult('Reset', 'Reset Operation', resetResult.success, 
      `Reset completed successfully`);

    // Verify data was cleared
    const [usersAfter, programsAfter, exercisesAfter] = await Promise.all([
      db.collection('users').get(),
      db.collection('programs').get(),
      db.collection('exercises').get()
    ]);

    const afterCounts = {
      users: usersAfter.size,
      programs: programsAfter.size,
      exercises: exercisesAfter.size
    };

    tracker.addResult('Reset', 'Data Cleanup Verification', 
      afterCounts.users === 0 && afterCounts.programs === 0 && afterCounts.exercises === 0,
      `After reset: ${afterCounts.users} users, ${afterCounts.programs} programs, ${afterCounts.exercises} exercises`);

    return true;

  } catch (error) {
    tracker.addResult('Reset', 'Reset Functionality', false, null, error.message);
    return false;
  }
}

/**
 * Performance validation
 */
async function validatePerformance(tracker) {
  if (!VALIDATION_CONFIG.performanceTest) {
    return true;
  }

  logSection('Performance Validation');

  try {
    // Test seeding performance with larger dataset
    const startTime = Date.now();
    
    const result = await seedAll({
      scenarios: ['beginner', 'intermediate', 'advanced'],
      verbose: false,
      includeHistoricalData: true
    });

    const duration = Date.now() - startTime;
    const performanceThreshold = 30000; // 30 seconds

    tracker.addResult('Performance', 'Seeding Performance', 
      duration < performanceThreshold && result.success,
      `Completed comprehensive seeding in ${duration}ms (threshold: ${performanceThreshold}ms)`);

    // Test reset performance
    const resetStartTime = Date.now();
    
    const resetResult = await resetAll({
      force: true,
      verbose: false
    });

    const resetDuration = Date.now() - resetStartTime;
    const resetThreshold = 10000; // 10 seconds

    tracker.addResult('Performance', 'Reset Performance', 
      resetDuration < resetThreshold && resetResult.success,
      `Completed reset in ${resetDuration}ms (threshold: ${resetThreshold}ms)`);

    return true;

  } catch (error) {
    tracker.addResult('Performance', 'Performance Test', false, null, error.message);
    return false;
  }
}

/**
 * Main validation function
 */
async function runValidation() {
  const tracker = new ValidationTracker();
  
  logSection('Seeding System Validation');
  
  log(`Testing scenarios: ${VALIDATION_CONFIG.testScenarios.join(', ')}`, 'blue', '🎯 ');
  log(`Include historical data: ${VALIDATION_CONFIG.includeHistoricalData}`, 'blue', '📊 ');
  log(`Performance testing: ${VALIDATION_CONFIG.performanceTest}`, 'blue', '⚡ ');
  log(`Cleanup after: ${VALIDATION_CONFIG.cleanupAfter}`, 'blue', '🧹 ');

  try {
    // Step 1: Validate emulator connectivity
    const emulatorValid = await validateEmulatorConnectivity(tracker);
    if (!emulatorValid && !VALIDATION_CONFIG.skipEmulatorCheck) {
      log('Emulator validation failed. Cannot proceed with seeding validation.', 'red', '❌ ');
      tracker.logSummary();
      process.exit(1);
    }

    // Step 2: Validate seeding functionality
    const seedingValid = await validateSeedingFunctionality(tracker);
    if (!seedingValid) {
      log('Seeding functionality validation failed.', 'red', '❌ ');
      tracker.logSummary();
      process.exit(1);
    }

    // Step 3: Validate data integrity
    await validateDataIntegrity(tracker);

    // Step 4: Validate data relationships
    await validateDataRelationships(tracker);

    // Step 5: Validate performance (optional)
    await validatePerformance(tracker);

    // Step 6: Validate reset functionality
    if (VALIDATION_CONFIG.cleanupAfter) {
      await validateResetFunctionality(tracker);
    }

    // Final summary
    tracker.logSummary();
    
    const summary = tracker.getSummary();
    process.exit(summary.allPassed ? 0 : 1);

  } catch (error) {
    log(`Validation failed with unexpected error: ${error.message}`, 'red', '💥 ');
    if (VALIDATION_CONFIG.verbose) {
      console.error(error);
    }
    tracker.logSummary();
    process.exit(1);
  }
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
${colors.cyan}${colors.bright}Seeding System Validation${colors.reset}
${colors.cyan}===============================${colors.reset}

${colors.bright}DESCRIPTION:${colors.reset}
  Validates the complete seeding system by running actual seeding operations
  and verifying data integrity, relationships, and application compatibility.

${colors.bright}USAGE:${colors.reset}
  node scripts/validate-seeding-system.js [options]

${colors.bright}OPTIONS:${colors.reset}
  -v, --verbose              Show detailed validation output
  --skip-emulator-check      Skip emulator connectivity validation
  --test-scenarios <list>    Comma-separated list of scenarios to test
  --no-history              Skip historical data generation
  --performance              Include performance validation tests
  --no-cleanup               Skip cleanup/reset validation
  -h, --help                 Show this help message

${colors.bright}EXAMPLES:${colors.reset}
  # Basic validation
  node scripts/validate-seeding-system.js
  
  # Verbose validation with specific scenarios
  node scripts/validate-seeding-system.js --verbose --test-scenarios beginner,advanced
  
  # Performance testing without cleanup
  node scripts/validate-seeding-system.js --performance --no-cleanup
  
  # Skip emulator check (for CI environments)
  node scripts/validate-seeding-system.js --skip-emulator-check

${colors.bright}VALIDATION CATEGORIES:${colors.reset}
  • Connectivity     - Emulator availability and connectivity
  • Seeding          - Core seeding operations and functionality
  • Data Integrity   - Data structure and validation compliance
  • Relationships    - Referential integrity between data types
  • Performance      - Seeding and reset operation performance
  • Reset            - Data cleanup and reset functionality

${colors.bright}REQUIREMENTS:${colors.reset}
  • Firebase emulators must be running (unless --skip-emulator-check)
  • Sufficient disk space for test data
  • Network connectivity for Firebase operations
  `);
}

// Execute if run directly
if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    runValidation();
  }
}

module.exports = {
  runValidation,
  ValidationTracker
};