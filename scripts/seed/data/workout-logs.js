/**
 * Workout log generation module
 * 
 * This module generates realistic historical workout logs for test users,
 * including progressive overload patterns, missed workouts, and performance variations.
 */

const { getFirestore, getAuth } = require('../utils/firebase-config');
const { logProgress } = require('../utils/logger');

/**
 * Configuration for workout log generation
 */
const LOG_GENERATION_CONFIG = {
  // Historical data timeframe
  historyWeeks: 12,
  
  // Workout completion patterns
  completionRate: 0.85, // 85% of planned workouts completed
  
  // Progressive overload patterns
  progressionRate: 0.02, // 2% weight increase per week on average
  plateauChance: 0.15, // 15% chance of plateau/deload
  
  // Performance variation
  repVariation: 0.1, // 10% variation in reps completed
  missedRepChance: 0.2, // 20% chance of missing some reps
  
  // Starting weights by experience level (in LB)
  startingWeights: {
    beginner: {
      'Barbell Back Squat': 95,
      'Conventional Deadlift': 135,
      'Barbell Bench Press': 85,
      'Overhead Press': 65,
      'Barbell Row': 75,
      'Incline Barbell Press': 75,
      'Front Squat': 75,
      'Sumo Deadlift': 115
    },
    intermediate: {
      'Barbell Back Squat': 185,
      'Conventional Deadlift': 225,
      'Barbell Bench Press': 155,
      'Overhead Press': 105,
      'Barbell Row': 135,
      'Incline Barbell Press': 135,
      'Front Squat': 155,
      'Sumo Deadlift': 205
    },
    advanced: {
      'Barbell Back Squat': 275,
      'Conventional Deadlift': 315,
      'Barbell Bench Press': 225,
      'Overhead Press': 155,
      'Barbell Row': 185,
      'Incline Barbell Press': 185,
      'Front Squat': 225,
      'Sumo Deadlift': 285
    }
  }
};

/**
 * Generate realistic workout logs for a user using scenario-specific patterns
 * @param {Object} user - User object with profile information and data patterns
 * @param {Array} programs - User's workout programs
 * @param {Array} exercises - Available exercises
 * @param {Object} options - Generation options
 * @returns {Promise<Array>} Generated workout logs
 */
async function generateWorkoutLogs(user, programs, exercises, options = {}) {
  const { verbose = false } = options;
  
  if (!programs || programs.length === 0) {
    if (verbose) {
      logProgress(`No programs found for user ${user.scenario}, skipping workout log generation`, 'warning');
    }
    return [];
  }

  const db = getFirestore();
  const generatedLogs = [];
  
  // Use the user's current program for log generation
  const program = programs[0];
  
  // Get scenario-specific data patterns
  const dataPatterns = user.dataPatterns || {};
  const weeksBack = dataPatterns.historyWeeks || LOG_GENERATION_CONFIG.historyWeeks;
  const completionRate = dataPatterns.workoutConsistency || LOG_GENERATION_CONFIG.completionRate;
  const progressionRate = dataPatterns.progressionRate || LOG_GENERATION_CONFIG.progressionRate;
  
  if (verbose) {
    logProgress(`Generating ${weeksBack} weeks of workout logs for ${user.scenarioName || user.scenario} user`, 'info');
    logProgress(`  - Completion rate: ${(completionRate * 100).toFixed(0)}%`, 'info');
    logProgress(`  - Progression rate: ${(progressionRate * 100).toFixed(1)}% per week`, 'info');
  }

  // Create exercise name to ID mapping
  const exerciseMap = createExerciseMap(exercises);
  
  // Generate logs going backwards from current date
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (weeksBack * 7));

  // Track progression for each exercise with scenario-specific patterns
  const exerciseProgression = initializeExerciseProgression(program, exerciseMap, user.profile.experienceLevel);
  
  // Generate logs week by week
  for (let weekOffset = weeksBack - 1; weekOffset >= 0; weekOffset--) {
    const weekLogs = await generateWeekLogs(
      user,
      program,
      exerciseMap,
      exerciseProgression,
      weekOffset,
      endDate,
      verbose
    );
    
    generatedLogs.push(...weekLogs);
  }

  if (verbose) {
    logProgress(`Generated ${generatedLogs.length} workout logs for ${user.scenario} user`, 'success');
  }

  return generatedLogs;
}

/**
 * Generate workout logs for a specific week
 * @param {Object} user - User object
 * @param {Object} program - Workout program
 * @param {Object} exerciseMap - Exercise name to ID mapping
 * @param {Object} exerciseProgression - Current progression state
 * @param {number} weekOffset - Weeks back from current date
 * @param {Date} endDate - End date for generation
 * @param {boolean} verbose - Verbose logging
 * @returns {Promise<Array>} Week's workout logs
 */
async function generateWeekLogs(user, program, exerciseMap, exerciseProgression, weekOffset, endDate, verbose) {
  const weekLogs = [];
  const weekStartDate = new Date(endDate);
  weekStartDate.setDate(weekStartDate.getDate() - (weekOffset * 7));
  
  // Determine which week of the program this represents
  // For historical data, we cycle through the program weeks
  const programWeek = weekOffset % Math.max(1, getMaxWeekInProgram(program));
  
  // Get the workout configuration for this week
  const weekConfig = getWeekConfiguration(program, programWeek);
  
  if (!weekConfig || weekConfig.length === 0) {
    return weekLogs;
  }

  // Generate logs for each day of the week
  for (let dayIndex = 0; dayIndex < weekConfig.length; dayIndex++) {
    const dayConfig = weekConfig[dayIndex];
    
    if (!dayConfig || !dayConfig.exercises || dayConfig.exercises.length === 0) {
      continue;
    }

    // Determine if this workout was completed (based on user's scenario-specific completion rate)
    const completionRate = user.dataPatterns?.workoutConsistency || LOG_GENERATION_CONFIG.completionRate;
    const isCompleted = Math.random() < completionRate;
    
    if (!isCompleted) {
      continue; // Skip this workout - user didn't complete it
    }

    // Calculate the date for this workout
    const workoutDate = new Date(weekStartDate);
    workoutDate.setDate(workoutDate.getDate() + (dayIndex * 2)); // Space workouts 2 days apart
    
    // Generate the workout log
    const workoutLog = generateWorkoutLog(
      user,
      program,
      dayConfig,
      exerciseMap,
      exerciseProgression,
      programWeek,
      dayIndex,
      workoutDate
    );
    
    if (workoutLog) {
      weekLogs.push(workoutLog);
      
      // Update exercise progression after each workout
      updateExerciseProgression(exerciseProgression, workoutLog.exercises);
    }
  }

  return weekLogs;
}

/**
 * Generate a single workout log
 * @param {Object} user - User object
 * @param {Object} program - Workout program
 * @param {Object} dayConfig - Day configuration from program
 * @param {Object} exerciseMap - Exercise mapping
 * @param {Object} exerciseProgression - Current progression state
 * @param {number} weekIndex - Week index in program
 * @param {number} dayIndex - Day index in week
 * @param {Date} workoutDate - Date of the workout
 * @returns {Object} Workout log document
 */
function generateWorkoutLog(user, program, dayConfig, exerciseMap, exerciseProgression, weekIndex, dayIndex, workoutDate) {
  const exercises = [];
  
  // Generate exercise data for each exercise in the day
  for (const exerciseConfig of dayConfig.exercises) {
    const exerciseId = exerciseConfig.exerciseId;
    
    if (!exerciseId || !exerciseMap[exerciseId]) {
      continue; // Skip exercises that don't exist
    }

    const exerciseName = exerciseMap[exerciseId];
    const progression = exerciseProgression[exerciseName];
    
    if (!progression) {
      continue; // Skip exercises without progression data
    }

    // Generate sets, reps, and weights for this exercise
    const exerciseData = generateExerciseData(
      exerciseConfig,
      progression,
      user.profile.experienceLevel
    );
    
    exercises.push({
      exerciseId: exerciseId,
      sets: exerciseData.sets,
      reps: exerciseData.reps,
      weights: exerciseData.weights,
      completed: exerciseData.completed,
      notes: exerciseData.notes,
      bodyweight: exerciseData.bodyweight,
      isAdded: false,
      addedType: null,
      originalIndex: -1
    });
  }

  // Create the workout log document
  return {
    userId: user.uid,
    programId: program.id,
    weekIndex: weekIndex,
    dayIndex: dayIndex,
    exercises: exercises,
    date: workoutDate,
    completedDate: workoutDate, // Same as date for historical logs
    isWorkoutFinished: true,
    weightUnit: program.weightUnit || user.profile.preferredUnits,
    duration: generateWorkoutDuration(exercises.length, user.profile.experienceLevel),
    notes: generateWorkoutNotes(user.profile.experienceLevel)
  };
}

/**
 * Generate exercise data with realistic performance patterns
 * @param {Object} exerciseConfig - Exercise configuration from program
 * @param {Object} progression - Current progression state for exercise
 * @param {string} experienceLevel - User's experience level
 * @returns {Object} Exercise performance data
 */
function generateExerciseData(exerciseConfig, progression, experienceLevel) {
  const targetSets = exerciseConfig.sets;
  const targetReps = typeof exerciseConfig.reps === 'number' ? exerciseConfig.reps : 5;
  const currentWeight = progression.currentWeight;
  
  const sets = targetSets;
  const reps = [];
  const weights = [];
  const completed = [];
  
  // Generate performance for each set
  for (let setIndex = 0; setIndex < sets; setIndex++) {
    const setWeight = currentWeight;
    weights.push(setWeight);
    
    // Determine if this set was completed successfully
    const setCompleted = Math.random() > LOG_GENERATION_CONFIG.missedRepChance;
    completed.push(setCompleted);
    
    if (setCompleted) {
      // Full reps completed with possible slight variation
      const repVariation = Math.random() < 0.1 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      reps.push(Math.max(1, targetReps + repVariation));
    } else {
      // Missed some reps (typically 1-2 less than target)
      const missedReps = Math.floor(Math.random() * 2) + 1;
      reps.push(Math.max(1, targetReps - missedReps));
    }
  }
  
  // Generate notes based on performance
  const notes = generateExerciseNotes(reps, targetReps, experienceLevel);
  
  return {
    sets,
    reps,
    weights,
    completed,
    notes,
    bodyweight: null // Only set for bodyweight exercises
  };
}

/**
 * Initialize exercise progression tracking
 * @param {Object} program - Workout program
 * @param {Object} exerciseMap - Exercise name to ID mapping
 * @param {string} experienceLevel - User's experience level
 * @returns {Object} Exercise progression state
 */
function initializeExerciseProgression(program, exerciseMap, experienceLevel) {
  const progression = {};
  const startingWeights = LOG_GENERATION_CONFIG.startingWeights[experienceLevel] || LOG_GENERATION_CONFIG.startingWeights.beginner;
  
  // Initialize progression for each exercise in the program
  Object.values(program.weeklyConfigs).forEach(dayConfig => {
    if (dayConfig.exercises) {
      dayConfig.exercises.forEach(exercise => {
        const exerciseId = exercise.exerciseId;
        const exerciseName = exerciseMap[exerciseId];
        
        if (exerciseName && !progression[exerciseName]) {
          progression[exerciseName] = {
            currentWeight: startingWeights[exerciseName] || 45, // Default to empty barbell
            sessionsCompleted: 0,
            lastIncrease: 0,
            plateauCount: 0,
            deloadCount: 0
          };
        }
      });
    }
  });
  
  return progression;
}

/**
 * Update exercise progression after a workout
 * @param {Object} exerciseProgression - Current progression state
 * @param {Array} exerciseData - Completed exercise data
 */
function updateExerciseProgression(exerciseProgression, exerciseData) {
  exerciseData.forEach(exercise => {
    const exerciseName = Object.keys(exerciseProgression).find(name => 
      exerciseProgression[name] && exercise.exerciseId
    );
    
    if (!exerciseName || !exerciseProgression[exerciseName]) {
      return;
    }
    
    const progression = exerciseProgression[exerciseName];
    progression.sessionsCompleted++;
    
    // Check if all sets were completed successfully
    const allSetsCompleted = exercise.completed.every(completed => completed);
    const targetRepsHit = exercise.reps.every((reps, index) => 
      reps >= (typeof exercise.sets === 'number' ? 5 : exercise.reps[index])
    );
    
    if (allSetsCompleted && targetRepsHit) {
      // Successful workout - consider progression
      progression.lastIncrease++;
      
      // Progressive overload logic based on experience level
      const progressionFrequency = getProgressionFrequency(exerciseName);
      
      if (progression.lastIncrease >= progressionFrequency) {
        // Time to increase weight
        const shouldPlateau = Math.random() < LOG_GENERATION_CONFIG.plateauChance;
        
        if (shouldPlateau && progression.plateauCount < 2) {
          // Plateau - no weight increase
          progression.plateauCount++;
        } else if (progression.plateauCount >= 2) {
          // Deload after plateau
          progression.currentWeight *= 0.9; // 10% deload
          progression.deloadCount++;
          progression.plateauCount = 0;
          progression.lastIncrease = 0;
        } else {
          // Normal progression
          const increase = getWeightIncrease(exerciseName);
          progression.currentWeight += increase;
          progression.lastIncrease = 0;
          progression.plateauCount = 0;
        }
      }
    } else {
      // Failed workout - reset progression counter
      progression.lastIncrease = Math.max(0, progression.lastIncrease - 1);
    }
  });
}

/**
 * Get progression frequency for an exercise (sessions between weight increases)
 * @param {string} exerciseName - Name of the exercise
 * @returns {number} Sessions between increases
 */
function getProgressionFrequency(exerciseName) {
  // Different exercises progress at different rates
  const frequencies = {
    'Barbell Back Squat': 2, // Every 2 sessions
    'Conventional Deadlift': 3, // Every 3 sessions
    'Barbell Bench Press': 2,
    'Overhead Press': 3, // Slower progression
    'Barbell Row': 2
  };
  
  return frequencies[exerciseName] || 2;
}

/**
 * Get weight increase amount for an exercise
 * @param {string} exerciseName - Name of the exercise
 * @returns {number} Weight increase in pounds
 */
function getWeightIncrease(exerciseName) {
  // Different exercises have different increase amounts
  const increases = {
    'Barbell Back Squat': 5, // 5 lbs
    'Conventional Deadlift': 10, // 10 lbs
    'Barbell Bench Press': 5,
    'Overhead Press': 2.5, // Smaller increases
    'Barbell Row': 5
  };
  
  return increases[exerciseName] || 5;
}

/**
 * Get week configuration from program
 * @param {Object} program - Workout program
 * @param {number} weekIndex - Week index
 * @returns {Array} Week configuration
 */
function getWeekConfiguration(program, weekIndex) {
  const weekConfigs = [];
  
  // Find all day configurations for this week
  Object.keys(program.weeklyConfigs).forEach(configKey => {
    const match = configKey.match(/week(\d+)_day(\d+)/);
    if (match) {
      const week = parseInt(match[1]) - 1; // Convert to 0-based
      const day = parseInt(match[2]) - 1;
      
      // Use modulo to cycle through program weeks if history is longer than program
      const programWeekIndex = weekIndex % program.duration;
      
      if (week === programWeekIndex) {
        weekConfigs[day] = program.weeklyConfigs[configKey];
      }
    }
  });
  
  return weekConfigs.filter(config => config); // Remove empty slots
}

/**
 * Create exercise ID to name mapping
 * @param {Array} exercises - Array of exercise documents
 * @returns {Object} Map of exercise IDs to names
 */
function createExerciseMap(exercises) {
  const exerciseMap = {};
  exercises.forEach(exercise => {
    exerciseMap[exercise.id] = exercise.name;
  });
  return exerciseMap;
}

/**
 * Generate realistic workout duration based on exercise count and experience
 * @param {number} exerciseCount - Number of exercises in workout
 * @param {string} experienceLevel - User's experience level
 * @returns {number} Workout duration in minutes
 */
function generateWorkoutDuration(exerciseCount, experienceLevel) {
  const baseTime = {
    beginner: 8, // 8 minutes per exercise
    intermediate: 10, // 10 minutes per exercise
    advanced: 12 // 12 minutes per exercise
  };
  
  const timePerExercise = baseTime[experienceLevel] || baseTime.beginner;
  const totalTime = exerciseCount * timePerExercise;
  
  // Add some random variation (±15%)
  const variation = totalTime * 0.15 * (Math.random() - 0.5) * 2;
  
  return Math.round(totalTime + variation);
}

/**
 * Generate workout notes based on experience level
 * @param {string} experienceLevel - User's experience level
 * @returns {string} Workout notes
 */
function generateWorkoutNotes(experienceLevel) {
  const noteOptions = {
    beginner: [
      'Felt good today, focusing on form',
      'Getting stronger each week!',
      'Form felt solid throughout',
      'Challenging but manageable',
      ''
    ],
    intermediate: [
      'Good session, hit all target reps',
      'Felt strong on the main lifts',
      'Ready to increase weight next session',
      'Form breaking down on last set',
      'Solid workout, good progression',
      ''
    ],
    advanced: [
      'Excellent session, PRs incoming',
      'Technique felt dialed in',
      'Speed off chest was good today',
      'Depth looked consistent',
      'Competition prep going well',
      'Accessory work felt productive',
      ''
    ]
  };
  
  const options = noteOptions[experienceLevel] || noteOptions.beginner;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate exercise-specific notes
 * @param {Array} reps - Reps completed per set
 * @param {number} targetReps - Target reps per set
 * @param {string} experienceLevel - User's experience level
 * @returns {string} Exercise notes
 */
function generateExerciseNotes(reps, targetReps, experienceLevel) {
  const allSetsHit = reps.every(rep => rep >= targetReps);
  const someSetsMissed = reps.some(rep => rep < targetReps);
  
  if (allSetsHit && Math.random() < 0.3) {
    const goodNotes = [
      'Felt strong',
      'Good form',
      'Ready for more weight',
      'Smooth reps',
      ''
    ];
    return goodNotes[Math.floor(Math.random() * goodNotes.length)];
  }
  
  if (someSetsMissed && Math.random() < 0.4) {
    const strugglingNotes = [
      'Last set was tough',
      'Form broke down',
      'Need more rest',
      'Challenging today',
      ''
    ];
    return strugglingNotes[Math.floor(Math.random() * strugglingNotes.length)];
  }
  
  return ''; // Most exercises don't have notes
}

/**
 * Get the maximum week number in a program
 * @param {Object} program - Workout program
 * @returns {number} Maximum week number
 */
function getMaxWeekInProgram(program) {
  let maxWeek = 1;
  
  Object.keys(program.weeklyConfigs).forEach(configKey => {
    const match = configKey.match(/week(\d+)_day(\d+)/);
    if (match) {
      const week = parseInt(match[1]);
      maxWeek = Math.max(maxWeek, week);
    }
  });
  
  return maxWeek;
}

/**
 * Seed workout logs for multiple users
 * @param {Array} users - Array of test users
 * @param {Array} programs - Array of user programs
 * @param {Array} exercises - Array of exercises
 * @param {Object} options - Seeding options
 * @returns {Promise<Object>} Seeding results
 */
async function seedWorkoutLogs(users, programs, exercises, options = {}) {
  const { verbose = false, weeksBack = LOG_GENERATION_CONFIG.historyWeeks } = options;
  
  try {
    const db = getFirestore();
    
    if (verbose) {
      logProgress('Starting workout log generation...', 'info');
    }

    const allGeneratedLogs = [];
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 400; // Stay under Firestore's 500 limit

    // Generate logs for each user
    for (const user of users) {
      if (verbose) {
        logProgress(`Generating workout logs for ${user.scenario} user: ${user.profile.name}`, 'info');
      }

      // Find programs for this user
      const userPrograms = programs.filter(program => program.userId === user.uid);
      
      if (userPrograms.length === 0) {
        if (verbose) {
          logProgress(`No programs found for user ${user.scenario}, skipping`, 'warning');
        }
        continue;
      }

      // Generate workout logs for this user
      const userLogs = await generateWorkoutLogs(user, userPrograms, exercises, { verbose, weeksBack });
      
      // Add logs to batch
      for (const log of userLogs) {
        const logRef = db.collection('workoutLogs').doc();
        
        // Convert Date objects to Firestore Timestamps
        const logData = {
          ...log,
          date: admin.firestore.Timestamp.fromDate(log.date),
          completedDate: admin.firestore.Timestamp.fromDate(log.completedDate)
        };
        
        batch.set(logRef, logData);
        batchCount++;
        
        // Commit batch if it's getting large
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batchCount = 0;
          
          if (verbose) {
            logProgress(`Committed batch of ${BATCH_SIZE} workout logs`, 'info');
          }
        }
        
        allGeneratedLogs.push({
          id: logRef.id,
          userId: user.uid,
          userScenario: user.scenario,
          ...log
        });
      }

      if (verbose) {
        logProgress(`  ✅ Generated ${userLogs.length} workout logs for ${user.scenario} user`, 'success');
      }
    }

    // Commit any remaining logs
    if (batchCount > 0) {
      await batch.commit();
      
      if (verbose) {
        logProgress(`Committed final batch of ${batchCount} workout logs`, 'info');
      }
    }

    // Calculate results summary
    const results = {
      totalLogs: allGeneratedLogs.length,
      logsByUser: {},
      averageLogsPerUser: 0,
      timespan: `${weeksBack} weeks`,
      completionRate: LOG_GENERATION_CONFIG.completionRate
    };

    // Group logs by user scenario
    users.forEach(user => {
      const userLogs = allGeneratedLogs.filter(log => log.userId === user.uid);
      results.logsByUser[user.scenario] = {
        count: userLogs.length,
        userName: user.profile.name,
        userId: user.uid
      };
    });

    results.averageLogsPerUser = Math.round(results.totalLogs / users.length);

    if (verbose) {
      logProgress(`Workout logs seeded successfully:`, 'success');
      logProgress(`  - Total logs: ${results.totalLogs}`, 'info');
      logProgress(`  - Average per user: ${results.averageLogsPerUser}`, 'info');
      logProgress(`  - Timespan: ${results.timespan}`, 'info');
      logProgress(`  - Completion rate: ${(results.completionRate * 100).toFixed(0)}%`, 'info');
      
      Object.entries(results.logsByUser).forEach(([scenario, data]) => {
        logProgress(`  - ${scenario}: ${data.count} logs (${data.userName})`, 'info');
      });
    }

    return results;

  } catch (error) {
    logProgress(`Workout log seeding failed: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Get all workout logs from the database (for testing/validation)
 * @param {string} userId - Optional user ID to filter logs
 * @returns {Promise<Array>} Array of workout log documents
 */
async function getAllWorkoutLogs(userId = null) {
  const db = getFirestore();
  let query = db.collection('workoutLogs');
  
  if (userId) {
    query = query.where('userId', '==', userId);
  }
  
  const snapshot = await query.orderBy('date', 'desc').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Clear all workout log data (for reset functionality)
 * @returns {Promise<void>}
 */
async function clearWorkoutLogData() {
  const db = getFirestore();
  
  const logsSnapshot = await db.collection('workoutLogs').get();
  const batch = db.batch();
  
  logsSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
}

/**
 * Validate workout log data integrity
 * @param {Array} logs - Array of workout logs to validate
 * @returns {Object} Validation results
 */
function validateWorkoutLogs(logs) {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    stats: {
      totalLogs: logs.length,
      completedLogs: 0,
      averageExercisesPerLog: 0,
      dateRange: null
    }
  };

  if (logs.length === 0) {
    validation.warnings.push('No workout logs to validate');
    return validation;
  }

  let totalExercises = 0;
  const dates = [];

  logs.forEach((log, index) => {
    // Check required fields
    if (!log.userId) {
      validation.errors.push(`Log ${index}: Missing userId`);
      validation.isValid = false;
    }
    
    if (!log.programId) {
      validation.errors.push(`Log ${index}: Missing programId`);
      validation.isValid = false;
    }
    
    if (!log.exercises || !Array.isArray(log.exercises)) {
      validation.errors.push(`Log ${index}: Missing or invalid exercises array`);
      validation.isValid = false;
    } else {
      totalExercises += log.exercises.length;
      
      // Validate exercise structure
      log.exercises.forEach((exercise, exIndex) => {
        if (!exercise.exerciseId) {
          validation.errors.push(`Log ${index}, Exercise ${exIndex}: Missing exerciseId`);
          validation.isValid = false;
        }
        
        if (!Array.isArray(exercise.reps) || !Array.isArray(exercise.weights)) {
          validation.errors.push(`Log ${index}, Exercise ${exIndex}: Invalid reps or weights array`);
          validation.isValid = false;
        }
      });
    }
    
    if (log.isWorkoutFinished) {
      validation.stats.completedLogs++;
    }
    
    if (log.date) {
      dates.push(log.date);
    }
  });

  // Calculate stats
  validation.stats.averageExercisesPerLog = Math.round(totalExercises / logs.length);
  
  if (dates.length > 0) {
    const sortedDates = dates.sort();
    validation.stats.dateRange = {
      earliest: sortedDates[0],
      latest: sortedDates[sortedDates.length - 1]
    };
  }

  return validation;
}

// Import admin for Firestore Timestamp
const admin = require('firebase-admin');

/**
 * Reset all workout log data and return count of cleared items
 * @param {Object} options - Reset options
 * @returns {Promise<number>} Number of workout logs cleared
 */
async function resetWorkoutLogs(options = {}) {
  const db = getFirestore();
  
  try {
    // Get count before deletion
    const logsSnapshot = await db.collection('workoutLogs').get();
    const logCount = logsSnapshot.size;
    
    if (logCount === 0) {
      if (options.verbose) {
        logProgress('No workout log data found to clear', 'info');
      }
      return 0;
    }
    
    // Use existing clear function
    await clearWorkoutLogData();
    
    if (options.verbose) {
      logProgress(`Cleared ${logCount} workout logs`, 'info');
    }
    
    return logCount;
  } catch (error) {
    throw new Error(`Failed to reset workout logs: ${error.message}`);
  }
}

module.exports = {
  seedWorkoutLogs,
  generateWorkoutLogs,
  getAllWorkoutLogs,
  clearWorkoutLogData,
  resetWorkoutLogs,
  validateWorkoutLogs,
  LOG_GENERATION_CONFIG
};