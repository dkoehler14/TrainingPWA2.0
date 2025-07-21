/**
 * Core seeding functionality
 * 
 * This module contains the main logic for seeding test data into Firebase emulators.
 * It orchestrates the seeding process for different data types and provides progress feedback.
 */

const { seedExercises } = require('./data/exercises');
const { seedUsers } = require('./data/users');
const { seedPrograms } = require('./data/programs');
const { seedWorkoutLogs } = require('./data/workout-logs');
const { seedQuickWorkouts } = require('./data/quick-workouts');
const { 
  logProgress, 
  logStep, 
  logSummary, 
  logUserCredentials, 
  logTiming,
  logError
} = require('./utils/logger');
const { 
  createErrorHandler, 
  SeedingError,
  handleValidationErrors 
} = require('./utils/error-handling');
const { validateSeedingConfig } = require('./utils/validation');

/**
 * Seed all test data into Firebase emulators
 * @param {Object} options - Seeding options
 * @param {string|Array<string>} options.scenarios - Scenario selection (scenario ID, group name, or array)
 * @param {boolean} options.verbose - Whether to show detailed progress
 * @param {boolean} options.includeHistoricalData - Whether to generate historical workout logs
 * @returns {Promise<Object>} Seeding result with success status and summary
 */
async function seedAll(options = {}) {
  const startTime = Date.now();
  const { scenarios = 'basic', verbose = false, includeHistoricalData = true } = options;
  const totalSteps = includeHistoricalData ? 5 : 3;
  
  // Validate seeding configuration
  const configValidation = validateSeedingConfig({ scenarios, ...options });
  if (!configValidation.isValid) {
    const validationError = handleValidationErrors(configValidation.errors, 'seeding configuration');
    throw validationError;
  }
  
  // Create error handler with recovery enabled
  const errorHandler = createErrorHandler({
    maxRetries: 3,
    retryDelay: 1000,
    enableRecovery: true,
    verbose
  });
  
  logProgress('Starting scenario-based test data seeding process', 'start');
  
  if (verbose) {
    logSummary('Seeding Configuration', {
      scenarios: Array.isArray(scenarios) ? scenarios.join(', ') : scenarios,
      includeHistoricalData: includeHistoricalData,
      verboseLogging: verbose,
      totalSteps: totalSteps,
      errorHandling: 'Enabled with recovery'
    });
  }
  
  try {
    // Step 1: Seed exercise database with error handling
    logStep(1, totalSteps, 'Seeding exercise database');
    const exerciseResults = await errorHandler.executeWithRetry(
      'seedExercises',
      async () => {
        const exerciseStepStart = Date.now();
        const result = await seedExercises({ ...options, verbose });
        logTiming('Exercise database seeding', exerciseStepStart);
        return result;
      },
      { step: 1, totalSteps }
    );
    
    // Step 2: Seed test users with scenario-based configuration
    logStep(2, totalSteps, 'Creating scenario-based test users');
    const users = await errorHandler.executeWithRetry(
      'seedUsers',
      async () => {
        const userStepStart = Date.now();
        const result = await seedUsers({ scenarios, verbose });
        logTiming('User creation', userStepStart);
        
        if (verbose) {
          logUserCredentials(result);
        }
        
        return result;
      },
      { step: 2, totalSteps, scenarios }
    );
    
    // Step 3: Seed workout programs with scenario-specific patterns
    logStep(3, totalSteps, 'Creating scenario-specific workout programs');
    const programResults = await errorHandler.executeWithRetry(
      'seedPrograms',
      async () => {
        const programStepStart = Date.now();
        const result = await seedPrograms(users, { ...options, verbose });
        logTiming('Program creation', programStepStart);
        return result;
      },
      { step: 3, totalSteps, userCount: users.length }
    );
    
    // Step 4: Seed workout logs with scenario-based patterns (optional)
    let logResults = null;
    if (includeHistoricalData) {
      logStep(4, totalSteps, 'Generating scenario-based workout logs');
      logResults = await errorHandler.executeWithRetry(
        'seedWorkoutLogs',
        async () => {
          const logStepStart = Date.now();
          const result = await seedWorkoutLogs(users, programResults.createdPrograms, exerciseResults.createdExercises, { ...options, verbose });
          logTiming('Workout log generation', logStepStart);
          return result;
        },
        { step: 4, totalSteps, userCount: users.length }
      );
    } else {
      logProgress('Skipping historical workout log generation', 'warning');
    }
    
    // Step 5: Seed quick workouts with scenario-based patterns (optional)
    let quickWorkoutResults = null;
    if (includeHistoricalData) {
      logStep(5, totalSteps, 'Generating scenario-based quick workouts');
      quickWorkoutResults = await errorHandler.executeWithRetry(
        'seedQuickWorkouts',
        async () => {
          const quickWorkoutStepStart = Date.now();
          const result = await seedQuickWorkouts(users, exerciseResults.createdExercises, { ...options, verbose });
          logTiming('Quick workout generation', quickWorkoutStepStart);
          return result;
        },
        { step: 5, totalSteps, userCount: users.length }
      );
    } else {
      logProgress('Skipping historical quick workout generation', 'warning');
    }
    
    // Final summary
    logTiming('Complete seeding process', startTime);
    
    const summary = {
      exercises: exerciseResults.totalExercises,
      users: users.length,
      programs: programResults?.totalPrograms || users.length,
      workoutLogs: logResults?.totalWorkoutLogs || 0,
      quickWorkouts: quickWorkoutResults?.totalQuickWorkouts || 0,
      historicalData: includeHistoricalData,
      duration: parseFloat(((Date.now() - startTime) / 1000).toFixed(2)),
      operationsSummary: errorHandler.getTracker().getSummary()
    };
    
    if (verbose) {
      logSummary('Seeding Results', {
        exerciseDatabase: `${summary.exercises} exercises`,
        testUsers: `${summary.users} users`,
        workoutPrograms: `${summary.programs} programs`,
        workoutLogs: includeHistoricalData ? `${summary.workoutLogs} workout logs` : 'Skipped',
        quickWorkouts: includeHistoricalData ? `${summary.quickWorkouts} quick workouts` : 'Skipped',
        historicalData: summary.historicalData ? 'Generated' : 'Skipped',
        totalDuration: `${summary.duration}s`,
        completedOperations: summary.operationsSummary.completedOperations,
        failedOperations: summary.operationsSummary.failedOperations
      });
    }
    
    return { 
      success: true,
      summary,
      users // Include users for credential display
    };
    
  } catch (error) {
    logError(error, 'Seeding Process', verbose);
    
    // Handle partial failure with recovery
    try {
      const recoveryResult = await errorHandler.handlePartialFailure(error, {
        forceCleanup: options.forceCleanup,
        skipConfirmation: options.skipConfirmation
      });
      
      // Create enhanced error with recovery information
      const enhancedError = new SeedingError(
        `Seeding failed: ${error.message}\n\nRecovery: ${recoveryResult.recovered ? 'Successful cleanup performed' : 'Cleanup failed or skipped'}`,
        'seedAll',
        { 
          originalError: error.message,
          recoveryResult,
          operationsSummary: errorHandler.getTracker().getSummary()
        },
        error
      );
      
      throw enhancedError;
      
    } catch (recoveryError) {
      // If recovery also fails, throw the recovery error
      logError(recoveryError, 'Recovery Process', verbose);
      throw recoveryError;
    }
  }
}

/**
 * Reset all test data in Firebase emulators
 * @param {Object} options - Reset options
 * @param {boolean} options.verbose - Whether to show detailed progress
 * @param {boolean} options.force - Skip confirmation prompt
 * @returns {Promise<void>}
 */
async function resetAll(options = {}) {
  const startTime = Date.now();
  const { verbose = false } = options;
  const totalSteps = 5;
  
  logProgress('Starting test data reset process', 'start');
  
  try {
    // Import reset functions and helpers
    const { resetExercises } = require('./data/exercises');
    const { resetUsers } = require('./data/users');
    const { resetPrograms } = require('./data/programs');
    const { resetWorkoutLogs } = require('./data/workout-logs');
    const { resetQuickWorkouts } = require('./data/quick-workouts');
    const { confirmReset, getResetStatistics, reportResetCompletion } = require('./utils/reset-helpers');
    const { getFirestore } = require('./utils/firebase-config');
    
    // Get statistics before reset
    const db = getFirestore();
    const beforeStats = await getResetStatistics(db);
    
    if (verbose) {
      logSummary('Current Data Before Reset', {
        workoutLogs: beforeStats.workoutLogs,
        quickWorkouts: beforeStats.quickWorkouts || 0,
        programs: beforeStats.programs,
        users: beforeStats.users,
        exercises: beforeStats.exercises
      });
    }
    
    // Get confirmation before proceeding
    const confirmed = await confirmReset(options);
    if (!confirmed) {
      logProgress('Reset operation cancelled by user', 'warning');
      return { success: false, cancelled: true };
    }
    
    // Step 1: Reset quick workouts (dependent on users)
    logStep(1, totalSteps, 'Clearing quick workouts');
    const quickWorkoutStepStart = Date.now();
    const quickWorkoutCount = await resetQuickWorkouts(options);
    if (quickWorkoutCount > 0) {
      logTiming(`Cleared ${quickWorkoutCount} quick workouts`, quickWorkoutStepStart);
    } else {
      logProgress('No quick workouts to clear', 'info');
    }
    
    // Step 2: Reset workout logs (dependent on users and programs)
    logStep(2, totalSteps, 'Clearing workout logs');
    const logStepStart = Date.now();
    const workoutLogCount = await resetWorkoutLogs(options);
    if (workoutLogCount > 0) {
      logTiming(`Cleared ${workoutLogCount} workout logs`, logStepStart);
    } else {
      logProgress('No workout logs to clear', 'info');
    }
    
    // Step 3: Reset programs (dependent on users and exercises)
    logStep(3, totalSteps, 'Clearing workout programs');
    const programStepStart = Date.now();
    const programCount = await resetPrograms(options);
    if (programCount > 0) {
      logTiming(`Cleared ${programCount} workout programs`, programStepStart);
    } else {
      logProgress('No workout programs to clear', 'info');
    }
    
    // Step 4: Reset users (Auth and Firestore)
    logStep(4, totalSteps, 'Clearing test users');
    const userStepStart = Date.now();
    const userCount = await resetUsers(options);
    if (userCount > 0) {
      logTiming(`Cleared ${userCount} test users`, userStepStart);
    } else {
      logProgress('No test users to clear', 'info');
    }
    
    // Step 5: Reset exercises (independent)
    logStep(5, totalSteps, 'Clearing exercise database');
    const exerciseStepStart = Date.now();
    const exerciseCount = await resetExercises(options);
    if (exerciseCount > 0) {
      logTiming(`Cleared ${exerciseCount} exercises`, exerciseStepStart);
    } else {
      logProgress('No exercises to clear', 'info');
    }
    
    // Get statistics after reset
    const afterStats = await getResetStatistics(db);
    
    // Final summary
    logTiming('Complete reset process', startTime);
    
    const statistics = {
      quickWorkouts: quickWorkoutCount,
      workoutLogs: workoutLogCount,
      programs: programCount,
      users: userCount,
      exercises: exerciseCount,
      duration: parseFloat(((Date.now() - startTime) / 1000).toFixed(2))
    };
    
    if (verbose) {
      logSummary('Reset Results', {
        quickWorkoutsCleared: statistics.quickWorkouts,
        workoutLogsCleared: statistics.workoutLogs,
        programsCleared: statistics.programs,
        usersCleared: statistics.users,
        exercisesCleared: statistics.exercises,
        totalDuration: `${statistics.duration}s`
      });
    }
    
    // Report completion with statistics
    reportResetCompletion(beforeStats, afterStats, options);
    
    return { 
      success: true,
      statistics
    };
  } catch (error) {
    logProgress(`Reset failed: ${error.message}`, 'error');
    throw error;
  }
}

module.exports = {
  seedAll,
  resetAll
};