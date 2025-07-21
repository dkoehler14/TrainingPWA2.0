/**
 * Quick workout generation module
 * 
 * This module generates realistic historical quick workout logs for test users,
 * including varied exercise combinations, workout patterns, and performance data.
 */

const { getFirestore } = require('../utils/firebase-config');
const { logProgress } = require('../utils/logger');

/**
 * Configuration for quick workout generation
 */
const QUICK_WORKOUT_CONFIG = {
  // Historical data timeframe
  historyWeeks: 12,
  
  // Quick workout patterns by experience level
  patterns: {
    beginner: {
      workoutsPerWeek: 2.5, // Average workouts per week
      exercisesPerWorkout: [2, 3, 4], // Range of exercises per workout
      workoutTypes: ['Upper Body', 'Lower Body', 'Full Body', 'Core & Cardio'],
      consistency: 0.7, // 70% consistency in completing workouts
      progressionRate: 0.03 // 3% weight increase over time
    },
    intermediate: {
      workoutsPerWeek: 3.5,
      exercisesPerWorkout: [4, 5, 6],
      workoutTypes: ['Push Day', 'Pull Day', 'Leg Day', 'Upper Body', 'Lower Body', 'Full Body'],
      consistency: 0.8,
      progressionRate: 0.02
    },
    advanced: {
      workoutsPerWeek: 4.5,
      exercisesPerWorkout: [5, 6, 7, 8],
      workoutTypes: ['Chest & Triceps', 'Back & Biceps', 'Shoulders & Arms', 'Legs & Glutes', 'Push Day', 'Pull Day', 'Competition Prep'],
      consistency: 0.9,
      progressionRate: 0.015
    }
  },

  // Exercise combinations by workout type
  workoutTemplates: {
    'Upper Body': {
      compound: ['Barbell Bench Press', 'Barbell Row', 'Overhead Press', 'Pull-ups'],
      isolation: ['Dumbbell Bicep Curl', 'Tricep Extensions', 'Lateral Raises', 'Hammer Curls']
    },
    'Lower Body': {
      compound: ['Barbell Back Squat', 'Conventional Deadlift', 'Front Squat', 'Sumo Deadlift'],
      isolation: ['Leg Curls', 'Leg Extensions', 'Calf Raises', 'Hip Thrust Machine']
    },
    'Full Body': {
      compound: ['Barbell Back Squat', 'Barbell Bench Press', 'Barbell Row', 'Overhead Press'],
      isolation: ['Dumbbell Bicep Curl', 'Tricep Dips', 'Plank', 'Mountain Climbers']
    },
    'Push Day': {
      compound: ['Barbell Bench Press', 'Overhead Press', 'Incline Barbell Press'],
      isolation: ['Lateral Raises', 'Tricep Extensions', 'Cable Flyes', 'Tricep Dips']
    },
    'Pull Day': {
      compound: ['Barbell Row', 'Pull-ups', 'Conventional Deadlift'],
      isolation: ['Dumbbell Bicep Curl', 'Hammer Curls', 'Lat Pulldown', 'Seated Cable Row']
    },
    'Leg Day': {
      compound: ['Barbell Back Squat', 'Conventional Deadlift', 'Front Squat'],
      isolation: ['Leg Curls', 'Leg Extensions', 'Calf Raises', 'Leg Press']
    },
    'Chest & Triceps': {
      compound: ['Barbell Bench Press', 'Incline Barbell Press'],
      isolation: ['Cable Flyes', 'Tricep Extensions', 'Tricep Dips', 'Chest Press Machine']
    },
    'Back & Biceps': {
      compound: ['Barbell Row', 'Pull-ups', 'Lat Pulldown'],
      isolation: ['Dumbbell Bicep Curl', 'Hammer Curls', 'Seated Cable Row']
    },
    'Shoulders & Arms': {
      compound: ['Overhead Press'],
      isolation: ['Lateral Raises', 'Dumbbell Bicep Curl', 'Tricep Extensions', 'Cable Lateral Raises']
    },
    'Legs & Glutes': {
      compound: ['Barbell Back Squat', 'Sumo Deadlift'],
      isolation: ['Hip Thrust Machine', 'Leg Curls', 'Leg Extensions', 'Calf Raises']
    },
    'Core & Cardio': {
      compound: ['Burpees'],
      isolation: ['Plank', 'Mountain Climbers', 'Push-ups', 'Bodyweight Squats']
    },
    'Competition Prep': {
      compound: ['Barbell Back Squat', 'Conventional Deadlift', 'Barbell Bench Press'],
      isolation: ['Barbell Row', 'Overhead Press', 'Front Squat']
    }
  },

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
      'Sumo Deadlift': 115,
      'Dumbbell Bicep Curl': 20,
      'Tricep Extensions': 25,
      'Lateral Raises': 15,
      'Hammer Curls': 20
    },
    intermediate: {
      'Barbell Back Squat': 185,
      'Conventional Deadlift': 225,
      'Barbell Bench Press': 155,
      'Overhead Press': 105,
      'Barbell Row': 135,
      'Incline Barbell Press': 135,
      'Front Squat': 155,
      'Sumo Deadlift': 205,
      'Dumbbell Bicep Curl': 35,
      'Tricep Extensions': 40,
      'Lateral Raises': 25,
      'Hammer Curls': 35
    },
    advanced: {
      'Barbell Back Squat': 275,
      'Conventional Deadlift': 315,
      'Barbell Bench Press': 225,
      'Overhead Press': 155,
      'Barbell Row': 185,
      'Incline Barbell Press': 185,
      'Front Squat': 225,
      'Sumo Deadlift': 285,
      'Dumbbell Bicep Curl': 50,
      'Tricep Extensions': 60,
      'Lateral Raises': 35,
      'Hammer Curls': 50
    }
  }
};

/**
 * Generate realistic quick workout logs for a user
 * @param {Object} user - User object with profile information and data patterns
 * @param {Array} exercises - Available exercises
 * @param {Object} options - Generation options
 * @returns {Promise<Array>} Generated quick workout logs
 */
async function generateQuickWorkouts(user, exercises, options = {}) {
  const { verbose = false } = options;
  
  const generatedWorkouts = [];
  const experienceLevel = user.profile.experienceLevel;
  const patterns = QUICK_WORKOUT_CONFIG.patterns[experienceLevel] || QUICK_WORKOUT_CONFIG.patterns.beginner;
  
  // Use scenario-specific data patterns if available
  const weeksBack = user.dataPatterns?.historyWeeks || QUICK_WORKOUT_CONFIG.historyWeeks;
  const workoutsPerWeek = user.dataPatterns?.quickWorkoutFrequency || patterns.workoutsPerWeek;
  const consistency = user.dataPatterns?.workoutConsistency || patterns.consistency;
  
  if (verbose) {
    logProgress(`Generating ${weeksBack} weeks of quick workouts for ${user.scenarioName || user.scenario} user`, 'info');
    logProgress(`  - Workouts per week: ${workoutsPerWeek}`, 'info');
    logProgress(`  - Consistency: ${(consistency * 100).toFixed(0)}%`, 'info');
  }

  // Create exercise name to ID mapping
  const exerciseMap = createExerciseMap(exercises);
  
  // Initialize exercise progression tracking
  const exerciseProgression = initializeQuickWorkoutProgression(exerciseMap, experienceLevel);
  
  // Generate workouts going backwards from current date
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (weeksBack * 7));

  // Generate workouts week by week
  for (let weekOffset = weeksBack - 1; weekOffset >= 0; weekOffset--) {
    const weekWorkouts = generateWeekQuickWorkouts(
      user,
      exerciseMap,
      exerciseProgression,
      weekOffset,
      endDate,
      workoutsPerWeek,
      consistency,
      patterns,
      verbose
    );
    
    generatedWorkouts.push(...weekWorkouts);
  }

  if (verbose) {
    logProgress(`Generated ${generatedWorkouts.length} quick workouts for ${user.scenario} user`, 'success');
  }

  return generatedWorkouts;
}

/**
 * Generate quick workouts for a specific week
 * @param {Object} user - User object
 * @param {Object} exerciseMap - Exercise name to ID mapping
 * @param {Object} exerciseProgression - Current progression state
 * @param {number} weekOffset - Weeks back from current date
 * @param {Date} endDate - End date for generation
 * @param {number} workoutsPerWeek - Target workouts per week
 * @param {number} consistency - Workout consistency rate
 * @param {Object} patterns - Experience level patterns
 * @param {boolean} verbose - Verbose logging
 * @returns {Array} Week's quick workouts
 */
function generateWeekQuickWorkouts(user, exerciseMap, exerciseProgression, weekOffset, endDate, workoutsPerWeek, consistency, patterns, verbose) {
  const weekWorkouts = [];
  const weekStartDate = new Date(endDate);
  weekStartDate.setDate(weekStartDate.getDate() - (weekOffset * 7));
  
  // Determine number of workouts for this week (with some randomness)
  const baseWorkouts = Math.floor(workoutsPerWeek);
  const extraWorkout = Math.random() < (workoutsPerWeek - baseWorkouts) ? 1 : 0;
  const targetWorkouts = baseWorkouts + extraWorkout;
  
  // Generate workouts for the week
  for (let workoutIndex = 0; workoutIndex < targetWorkouts; workoutIndex++) {
    // Check if this workout was completed (based on consistency)
    if (Math.random() > consistency) {
      continue; // Skip this workout - user didn't complete it
    }
    
    // Calculate workout date (spread throughout the week)
    const workoutDate = new Date(weekStartDate);
    const dayOffset = Math.floor((workoutIndex / targetWorkouts) * 7) + Math.floor(Math.random() * 2);
    workoutDate.setDate(workoutDate.getDate() + dayOffset);
    
    // Generate the quick workout
    const quickWorkout = generateSingleQuickWorkout(
      user,
      exerciseMap,
      exerciseProgression,
      patterns,
      workoutDate
    );
    
    if (quickWorkout) {
      weekWorkouts.push(quickWorkout);
      
      // Update exercise progression after each workout
      updateQuickWorkoutProgression(exerciseProgression, quickWorkout.exercises);
    }
  }

  return weekWorkouts;
}

/**
 * Generate a single quick workout
 * @param {Object} user - User object
 * @param {Object} exerciseMap - Exercise mapping
 * @param {Object} exerciseProgression - Current progression state
 * @param {Object} patterns - Experience level patterns
 * @param {Date} workoutDate - Date of the workout
 * @returns {Object} Quick workout document
 */
function generateSingleQuickWorkout(user, exerciseMap, exerciseProgression, patterns, workoutDate) {
  // Select workout type
  const workoutType = patterns.workoutTypes[Math.floor(Math.random() * patterns.workoutTypes.length)];
  
  // Determine number of exercises
  const exerciseCount = patterns.exercisesPerWorkout[Math.floor(Math.random() * patterns.exercisesPerWorkout.length)];
  
  // Select exercises for this workout
  const selectedExercises = selectExercisesForWorkout(workoutType, exerciseCount, exerciseMap);
  
  if (selectedExercises.length === 0) {
    return null; // Skip if no exercises could be selected
  }
  
  // Generate exercise data
  const exercises = selectedExercises.map(exerciseId => {
    const exerciseName = Object.keys(exerciseMap).find(name => exerciseMap[name] === exerciseId);
    const progression = exerciseProgression[exerciseName];
    
    return generateQuickWorkoutExerciseData(exerciseId, progression, user.profile.experienceLevel);
  });
  
  // Generate workout name with some variation
  const workoutName = generateWorkoutName(workoutType, workoutDate);
  
  return {
    userId: user.uid,
    name: workoutName,
    type: 'quick_workout',
    exercises: exercises,
    date: workoutDate,
    completedDate: workoutDate,
    isWorkoutFinished: true,
    weightUnit: user.profile.preferredUnits || 'LB',
    duration: generateQuickWorkoutDuration(exercises.length, user.profile.experienceLevel),
    notes: generateQuickWorkoutNotes(user.profile.experienceLevel)
  };
}

/**
 * Select exercises for a workout based on type
 * @param {string} workoutType - Type of workout
 * @param {number} exerciseCount - Number of exercises to select
 * @param {Object} exerciseMap - Exercise name to ID mapping
 * @returns {Array} Selected exercise IDs
 */
function selectExercisesForWorkout(workoutType, exerciseCount, exerciseMap) {
  const template = QUICK_WORKOUT_CONFIG.workoutTemplates[workoutType];
  if (!template) {
    return [];
  }
  
  const availableExercises = [...template.compound, ...template.isolation];
  const selectedExercises = [];
  
  // Prioritize compound movements
  const compoundCount = Math.min(Math.ceil(exerciseCount * 0.6), template.compound.length);
  const isolationCount = exerciseCount - compoundCount;
  
  // Select compound exercises
  const shuffledCompound = [...template.compound].sort(() => Math.random() - 0.5);
  for (let i = 0; i < compoundCount && i < shuffledCompound.length; i++) {
    const exerciseName = shuffledCompound[i];
    if (exerciseMap[exerciseName]) {
      selectedExercises.push(exerciseMap[exerciseName]);
    }
  }
  
  // Select isolation exercises
  const shuffledIsolation = [...template.isolation].sort(() => Math.random() - 0.5);
  for (let i = 0; i < isolationCount && i < shuffledIsolation.length; i++) {
    const exerciseName = shuffledIsolation[i];
    if (exerciseMap[exerciseName]) {
      selectedExercises.push(exerciseMap[exerciseName]);
    }
  }
  
  return selectedExercises;
}

/**
 * Generate exercise data for quick workout
 * @param {string} exerciseId - Exercise ID
 * @param {Object} progression - Current progression state
 * @param {string} experienceLevel - User's experience level
 * @returns {Object} Exercise performance data
 */
function generateQuickWorkoutExerciseData(exerciseId, progression, experienceLevel) {
  const sets = Math.floor(Math.random() * 3) + 2; // 2-4 sets
  const targetReps = Math.floor(Math.random() * 8) + 5; // 5-12 reps
  const currentWeight = progression ? progression.currentWeight : 45;
  
  const reps = [];
  const weights = [];
  const completed = [];
  
  // Generate performance for each set
  for (let setIndex = 0; setIndex < sets; setIndex++) {
    weights.push(currentWeight);
    
    // Determine if this set was completed successfully (90% success rate)
    const setCompleted = Math.random() > 0.1;
    completed.push(setCompleted);
    
    if (setCompleted) {
      // Full reps completed with possible slight variation
      const repVariation = Math.random() < 0.2 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      reps.push(Math.max(1, targetReps + repVariation));
    } else {
      // Missed some reps
      const missedReps = Math.floor(Math.random() * 2) + 1;
      reps.push(Math.max(1, targetReps - missedReps));
    }
  }
  
  return {
    exerciseId: exerciseId,
    sets: sets,
    reps: reps,
    weights: weights,
    completed: completed,
    notes: Math.random() < 0.3 ? generateExerciseNotes(experienceLevel) : '',
    bodyweight: null, // Will be set for bodyweight exercises if needed
    isAdded: false,
    addedType: null,
    originalIndex: -1
  };
}

/**
 * Generate workout name with variation
 * @param {string} workoutType - Base workout type
 * @param {Date} workoutDate - Date of workout
 * @returns {string} Workout name
 */
function generateWorkoutName(workoutType, workoutDate) {
  const variations = [
    workoutType,
    `${workoutType} Session`,
    `Quick ${workoutType}`,
    `${workoutType} - ${workoutDate.toLocaleDateString()}`
  ];
  
  return variations[Math.floor(Math.random() * variations.length)];
}

/**
 * Generate realistic workout duration
 * @param {number} exerciseCount - Number of exercises
 * @param {string} experienceLevel - User's experience level
 * @returns {number} Duration in minutes
 */
function generateQuickWorkoutDuration(exerciseCount, experienceLevel) {
  const baseTime = {
    beginner: 6, // 6 minutes per exercise
    intermediate: 8, // 8 minutes per exercise
    advanced: 10 // 10 minutes per exercise
  };
  
  const timePerExercise = baseTime[experienceLevel] || baseTime.beginner;
  const totalTime = exerciseCount * timePerExercise;
  
  // Add some random variation (±20%)
  const variation = totalTime * 0.2 * (Math.random() - 0.5) * 2;
  
  return Math.round(totalTime + variation);
}

/**
 * Generate workout notes
 * @param {string} experienceLevel - User's experience level
 * @returns {string} Workout notes
 */
function generateQuickWorkoutNotes(experienceLevel) {
  const noteOptions = {
    beginner: [
      'Great quick session!',
      'Felt good today',
      'Quick but effective',
      'Short and sweet',
      ''
    ],
    intermediate: [
      'Solid quick workout',
      'Hit all the main movements',
      'Good intensity today',
      'Efficient session',
      'Quick but productive',
      ''
    ],
    advanced: [
      'High intensity quick session',
      'Perfect for time crunch',
      'Maintained good form throughout',
      'Efficient and effective',
      'Quality over quantity',
      ''
    ]
  };
  
  const options = noteOptions[experienceLevel] || noteOptions.beginner;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Generate exercise-specific notes
 * @param {string} experienceLevel - User's experience level
 * @returns {string} Exercise notes
 */
function generateExerciseNotes(experienceLevel) {
  const noteOptions = [
    'Felt strong',
    'Good form',
    'Challenging',
    'Smooth reps',
    'Need more weight next time',
    'Perfect range of motion'
  ];
  
  return noteOptions[Math.floor(Math.random() * noteOptions.length)];
}

/**
 * Create exercise name to ID mapping
 * @param {Array} exercises - Array of exercise documents
 * @returns {Object} Map of exercise names to IDs
 */
function createExerciseMap(exercises) {
  const exerciseMap = {};
  exercises.forEach(exercise => {
    exerciseMap[exercise.name] = exercise.id;
  });
  return exerciseMap;
}

/**
 * Initialize exercise progression tracking for quick workouts
 * @param {Object} exerciseMap - Exercise name to ID mapping
 * @param {string} experienceLevel - User's experience level
 * @returns {Object} Exercise progression state
 */
function initializeQuickWorkoutProgression(exerciseMap, experienceLevel) {
  const progression = {};
  const startingWeights = QUICK_WORKOUT_CONFIG.startingWeights[experienceLevel] || QUICK_WORKOUT_CONFIG.startingWeights.beginner;
  
  // Initialize progression for exercises that have starting weights
  Object.keys(startingWeights).forEach(exerciseName => {
    if (exerciseMap[exerciseName]) {
      progression[exerciseName] = {
        currentWeight: startingWeights[exerciseName],
        sessionsCompleted: 0,
        lastIncrease: 0
      };
    }
  });
  
  return progression;
}

/**
 * Update exercise progression after a quick workout
 * @param {Object} exerciseProgression - Current progression state
 * @param {Array} exerciseData - Completed exercise data
 */
function updateQuickWorkoutProgression(exerciseProgression, exerciseData) {
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
    
    if (allSetsCompleted) {
      progression.lastIncrease++;
      
      // Progressive overload every 3-4 sessions for quick workouts
      const progressionFrequency = 3 + Math.floor(Math.random() * 2);
      
      if (progression.lastIncrease >= progressionFrequency) {
        // Increase weight (smaller increments for quick workouts)
        const increase = getQuickWorkoutWeightIncrease(exerciseName);
        progression.currentWeight += increase;
        progression.lastIncrease = 0;
      }
    }
  });
}

/**
 * Get weight increase amount for quick workout exercises
 * @param {string} exerciseName - Name of the exercise
 * @returns {number} Weight increase in pounds
 */
function getQuickWorkoutWeightIncrease(exerciseName) {
  const increases = {
    'Barbell Back Squat': 5,
    'Conventional Deadlift': 5,
    'Barbell Bench Press': 2.5,
    'Overhead Press': 2.5,
    'Barbell Row': 2.5,
    'Dumbbell Bicep Curl': 2.5,
    'Tricep Extensions': 2.5,
    'Lateral Raises': 2.5
  };
  
  return increases[exerciseName] || 2.5;
}

/**
 * Seed quick workouts for multiple users
 * @param {Array} users - Array of test users
 * @param {Array} exercises - Array of exercises
 * @param {Object} options - Seeding options
 * @returns {Promise<Object>} Seeding results
 */
async function seedQuickWorkouts(users, exercises, options = {}) {
  const { verbose = false } = options;
  
  try {
    const db = getFirestore();
    
    if (verbose) {
      logProgress('Starting quick workout generation...', 'info');
    }

    const allGeneratedWorkouts = [];
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 400; // Stay under Firestore's 500 limit

    // Generate quick workouts for each user
    for (const user of users) {
      if (verbose) {
        logProgress(`Generating quick workouts for ${user.scenario} user: ${user.profile.name}`, 'info');
      }

      // Generate quick workouts for this user
      const userWorkouts = await generateQuickWorkouts(user, exercises, { verbose });
      
      // Add workouts to batch
      for (const workout of userWorkouts) {
        const workoutRef = db.collection('workoutLogs').doc();
        
        // Convert Date objects to Firestore Timestamps
        const admin = require('firebase-admin');
        const workoutData = {
          ...workout,
          date: admin.firestore.Timestamp.fromDate(workout.date),
          completedDate: admin.firestore.Timestamp.fromDate(workout.completedDate)
        };
        
        batch.set(workoutRef, workoutData);
        batchCount++;
        
        // Commit batch if it's getting large
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batchCount = 0;
          
          if (verbose) {
            logProgress(`Committed batch of ${BATCH_SIZE} quick workouts`, 'info');
          }
        }
        
        allGeneratedWorkouts.push({
          id: workoutRef.id,
          userId: user.uid,
          userScenario: user.scenario,
          ...workout
        });
      }

      if (verbose) {
        logProgress(`  ✅ Generated ${userWorkouts.length} quick workouts for ${user.scenario} user`, 'success');
      }
    }

    // Commit any remaining workouts
    if (batchCount > 0) {
      await batch.commit();
      
      if (verbose) {
        logProgress(`Committed final batch of ${batchCount} quick workouts`, 'info');
      }
    }

    // Calculate results summary
    const results = {
      totalQuickWorkouts: allGeneratedWorkouts.length,
      workoutsByUser: {},
      averageWorkoutsPerUser: 0,
      timespan: `${QUICK_WORKOUT_CONFIG.historyWeeks} weeks`,
      workoutTypes: [...new Set(allGeneratedWorkouts.map(w => w.name.split(' ')[0]))]
    };

    // Group workouts by user scenario
    users.forEach(user => {
      const userWorkouts = allGeneratedWorkouts.filter(workout => workout.userId === user.uid);
      results.workoutsByUser[user.scenario] = {
        count: userWorkouts.length,
        userName: user.profile.name,
        userId: user.uid
      };
    });

    results.averageWorkoutsPerUser = Math.round(results.totalQuickWorkouts / users.length);

    if (verbose) {
      logProgress(`Quick workouts seeded successfully:`, 'success');
      logProgress(`  - Total quick workouts: ${results.totalQuickWorkouts}`, 'info');
      logProgress(`  - Average per user: ${results.averageWorkoutsPerUser}`, 'info');
      logProgress(`  - Timespan: ${results.timespan}`, 'info');
      logProgress(`  - Workout types: ${results.workoutTypes.join(', ')}`, 'info');
      
      Object.entries(results.workoutsByUser).forEach(([scenario, data]) => {
        logProgress(`  - ${scenario}: ${data.count} workouts (${data.userName})`, 'info');
      });
    }

    return results;

  } catch (error) {
    logProgress(`Quick workout seeding failed: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Reset all quick workout data and return count of cleared items
 * @param {Object} options - Reset options
 * @returns {Promise<number>} Number of quick workouts cleared
 */
async function resetQuickWorkouts(options = {}) {
  const db = getFirestore();
  
  try {
    // Get count before deletion
    const quickWorkoutsSnapshot = await db.collection('workoutLogs')
      .where('type', '==', 'quick_workout')
      .get();
    const quickWorkoutCount = quickWorkoutsSnapshot.size;
    
    if (quickWorkoutCount === 0) {
      if (options.verbose) {
        logProgress('No quick workout data found to clear', 'info');
      }
      return 0;
    }
    
    // Delete quick workouts in batches
    const batch = db.batch();
    quickWorkoutsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    if (options.verbose) {
      logProgress(`Cleared ${quickWorkoutCount} quick workouts`, 'info');
    }
    
    return quickWorkoutCount;
  } catch (error) {
    throw new Error(`Failed to reset quick workouts: ${error.message}`);
  }
}

module.exports = {
  seedQuickWorkouts,
  generateQuickWorkouts,
  resetQuickWorkouts,
  QUICK_WORKOUT_CONFIG
};