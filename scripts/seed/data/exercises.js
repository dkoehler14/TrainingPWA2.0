/**
 * Exercise database seeding module
 * 
 * This module handles seeding the exercise database into Firestore emulator.
 * It creates both individual exercise documents and the exercises_metadata collection
 * with comprehensive exercise data including muscle groups, equipment types, and instructions.
 */

const { getFirestore } = require('../utils/firebase-config');
const { logProgress, logError } = require('../utils/logger');
const { ExerciseValidator, handleValidationErrors } = require('../utils/validation');
const { SeedingError } = require('../utils/error-handling');

// Muscle groups used in the application
const MUSCLE_GROUPS = [
  'Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders',
  'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves'
];

// Exercise types used in the application
const EXERCISE_TYPES = [
  'Dumbbell', 'Barbell', 'Cable', 'Trap Bar', 'Safety Squat Bar',
  'Bodyweight Only', 'Bodyweight Loadable', 'Kettlebell', 'Swiss Bar',
  'Machine', 'Smith Machine', 'Camber Bar', 'Bands'
];

// Comprehensive exercise database with proper categorization
const EXERCISE_DATABASE = {
  // Compound Movements - Major movement patterns
  compound: [
    {
      name: 'Barbell Back Squat',
      primaryMuscleGroup: 'Quads',
      exerciseType: 'Barbell',
      instructions: 'Stand with feet shoulder-width apart, bar on upper back. Descend by pushing hips back and bending knees. Drive through heels to return to start.'
    },
    {
      name: 'Conventional Deadlift',
      primaryMuscleGroup: 'Hamstrings',
      exerciseType: 'Barbell',
      instructions: 'Stand with feet hip-width apart, bar over mid-foot. Hinge at hips, grip bar, and drive through heels to stand tall.'
    },
    {
      name: 'Barbell Bench Press',
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Barbell',
      instructions: 'Lie on bench, grip bar slightly wider than shoulders. Lower bar to chest, then press up to full arm extension.'
    },
    {
      name: 'Overhead Press',
      primaryMuscleGroup: 'Shoulders',
      exerciseType: 'Barbell',
      instructions: 'Stand with feet hip-width apart, bar at shoulder height. Press bar straight up overhead, then lower with control.'
    },
    {
      name: 'Barbell Row',
      primaryMuscleGroup: 'Back',
      exerciseType: 'Barbell',
      instructions: 'Hinge at hips with bar in hands. Pull bar to lower chest/upper abdomen, squeeze shoulder blades together.'
    },
    {
      name: 'Front Squat',
      primaryMuscleGroup: 'Quads',
      exerciseType: 'Barbell',
      instructions: 'Hold bar in front rack position. Squat down keeping torso upright, then drive through heels to stand.'
    },
    {
      name: 'Sumo Deadlift',
      primaryMuscleGroup: 'Hamstrings',
      exerciseType: 'Barbell',
      instructions: 'Wide stance with toes pointed out. Grip bar inside legs, drive through heels and squeeze glutes to stand.'
    },
    {
      name: 'Incline Barbell Press',
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Barbell',
      instructions: 'Set bench to 30-45 degree incline. Press bar from upper chest to arms extended overhead.'
    }
  ],

  // Isolation Exercises - Single joint movements
  isolation: [
    {
      name: 'Dumbbell Bicep Curl',
      primaryMuscleGroup: 'Biceps',
      exerciseType: 'Dumbbell',
      instructions: 'Hold dumbbells at sides with palms forward. Curl weights up by flexing biceps, lower with control.'
    },
    {
      name: 'Tricep Dips',
      primaryMuscleGroup: 'Triceps',
      exerciseType: 'Bodyweight Only',
      instructions: 'Support body on parallel bars or bench. Lower body by bending elbows, then push back up.'
    },
    {
      name: 'Lateral Raises',
      primaryMuscleGroup: 'Shoulders',
      exerciseType: 'Dumbbell',
      instructions: 'Hold dumbbells at sides. Raise arms out to sides until parallel with floor, lower with control.'
    },
    {
      name: 'Hammer Curls',
      primaryMuscleGroup: 'Biceps',
      exerciseType: 'Dumbbell',
      instructions: 'Hold dumbbells with neutral grip. Curl weights up keeping palms facing each other throughout.'
    },
    {
      name: 'Tricep Extensions',
      primaryMuscleGroup: 'Triceps',
      exerciseType: 'Dumbbell',
      instructions: 'Hold dumbbell overhead with both hands. Lower behind head by bending elbows, extend back up.'
    },
    {
      name: 'Cable Lateral Raises',
      primaryMuscleGroup: 'Shoulders',
      exerciseType: 'Cable',
      instructions: 'Stand beside cable machine with handle in far hand. Raise arm out to side against resistance.'
    },
    {
      name: 'Leg Curls',
      primaryMuscleGroup: 'Hamstrings',
      exerciseType: 'Machine',
      instructions: 'Lie face down on machine. Curl heels toward glutes by contracting hamstrings.'
    },
    {
      name: 'Leg Extensions',
      primaryMuscleGroup: 'Quads',
      exerciseType: 'Machine',
      instructions: 'Sit on machine with pad against shins. Extend legs by contracting quadriceps.'
    },
    {
      name: 'Calf Raises',
      primaryMuscleGroup: 'Calves',
      exerciseType: 'Bodyweight Only',
      instructions: 'Stand on balls of feet. Rise up on toes as high as possible, lower with control.'
    }
  ],

  // Bodyweight Exercises
  bodyweight: [
    {
      name: 'Push-ups',
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Bodyweight Only',
      instructions: 'Start in plank position. Lower chest to floor by bending elbows, push back up to start.'
    },
    {
      name: 'Pull-ups',
      primaryMuscleGroup: 'Back',
      exerciseType: 'Bodyweight Loadable',
      instructions: 'Hang from bar with overhand grip. Pull body up until chin clears bar, lower with control.'
    },
    {
      name: 'Chin-ups',
      primaryMuscleGroup: 'Back',
      exerciseType: 'Bodyweight Loadable',
      instructions: 'Hang from bar with underhand grip. Pull body up until chin clears bar, lower with control.'
    },
    {
      name: 'Bodyweight Squats',
      primaryMuscleGroup: 'Quads',
      exerciseType: 'Bodyweight Only',
      instructions: 'Stand with feet shoulder-width apart. Squat down by pushing hips back, return to standing.'
    },
    {
      name: 'Plank',
      primaryMuscleGroup: 'Abs',
      exerciseType: 'Bodyweight Only',
      instructions: 'Hold body in straight line from head to heels, supported on forearms and toes.'
    },
    {
      name: 'Mountain Climbers',
      primaryMuscleGroup: 'Abs',
      exerciseType: 'Bodyweight Only',
      instructions: 'Start in plank position. Alternate bringing knees toward chest in running motion.'
    },
    {
      name: 'Burpees',
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Bodyweight Only',
      instructions: 'Squat down, jump back to plank, do push-up, jump feet forward, jump up with arms overhead.'
    }
  ],

  // Machine Exercises
  machine: [
    {
      name: 'Leg Press',
      primaryMuscleGroup: 'Quads',
      exerciseType: 'Machine',
      instructions: 'Sit in machine with feet on platform. Lower weight by bending knees, press back up.'
    },
    {
      name: 'Lat Pulldown',
      primaryMuscleGroup: 'Back',
      exerciseType: 'Machine',
      instructions: 'Sit at machine with bar overhead. Pull bar down to upper chest, squeeze shoulder blades.'
    },
    {
      name: 'Cable Flyes',
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Cable',
      instructions: 'Stand between cable machines. Bring handles together in front of chest in hugging motion.'
    },
    {
      name: 'Seated Cable Row',
      primaryMuscleGroup: 'Back',
      exerciseType: 'Cable',
      instructions: 'Sit at cable machine. Pull handle to torso while squeezing shoulder blades together.'
    },
    {
      name: 'Chest Press Machine',
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Machine',
      instructions: 'Sit in machine with handles at chest level. Press handles forward to full arm extension.'
    },
    {
      name: 'Shoulder Press Machine',
      primaryMuscleGroup: 'Shoulders',
      exerciseType: 'Machine',
      instructions: 'Sit in machine with handles at shoulder height. Press handles up overhead.'
    },
    {
      name: 'Hip Thrust Machine',
      primaryMuscleGroup: 'Glutes',
      exerciseType: 'Machine',
      instructions: 'Sit with back against pad, feet on platform. Drive hips up by squeezing glutes.'
    }
  ]
};

/**
 * Create individual exercise documents in the exercises collection
 * @param {Object} db - Firestore database instance
 * @param {Array} exercises - Array of exercise objects
 * @returns {Promise<Array>} Array of created exercise documents with IDs
 */
async function createExerciseDocuments(db, exercises) {
  const batch = db.batch();
  const createdExercises = [];

  for (const exercise of exercises) {
    const exerciseRef = db.collection('exercises').doc();
    const exerciseData = {
      name: exercise.name,
      primaryMuscleGroup: exercise.primaryMuscleGroup,
      exerciseType: exercise.exerciseType,
      instructions: exercise.instructions,
      createdAt: new Date(),
      isGlobal: true // Mark as global exercise
    };

    batch.set(exerciseRef, exerciseData);
    createdExercises.push({
      id: exerciseRef.id,
      ...exerciseData
    });
  }

  await batch.commit();
  return createdExercises;
}

/**
 * Create exercises metadata document for efficient querying
 * @param {Object} db - Firestore database instance
 * @param {Array} exercises - Array of exercise objects with IDs
 * @returns {Promise<void>}
 */
async function createExercisesMetadata(db, exercises) {
  const exercisesMap = {};
  
  exercises.forEach(exercise => {
    exercisesMap[exercise.id] = {
      name: exercise.name,
      primaryMuscleGroup: exercise.primaryMuscleGroup,
      exerciseType: exercise.exerciseType
    };
  });

  const metadataDoc = {
    exercises: exercisesMap,
    lastUpdated: new Date(),
    totalCount: exercises.length
  };

  await db.collection('exercises_metadata').doc('all_exercises').set(metadataDoc);
}

/**
 * Seed exercises into Firestore emulator
 * @param {Object} options - Seeding options
 * @param {boolean} options.verbose - Whether to show detailed progress
 * @returns {Promise<Object>} Seeding results
 */
async function seedExercises(options = {}) {
  const { verbose = false } = options;
  const validator = new ExerciseValidator();
  
  try {
    const db = getFirestore();
    
    if (verbose) {
      logProgress('Starting exercise database seeding...', 'info');
    }

    // Validate exercise database structure before processing
    if (!validator.validateExerciseDatabase(EXERCISE_DATABASE)) {
      const validationError = handleValidationErrors(validator.getErrors(), 'exercise database');
      throw validationError;
    }

    // Flatten all exercise categories into a single array
    const allExercises = [
      ...EXERCISE_DATABASE.compound,
      ...EXERCISE_DATABASE.isolation,
      ...EXERCISE_DATABASE.bodyweight,
      ...EXERCISE_DATABASE.machine
    ];

    // Validate each exercise individually
    for (let i = 0; i < allExercises.length; i++) {
      const exercise = allExercises[i];
      validator.clearErrors();
      
      if (!validator.validateExercise(exercise)) {
        const validationError = handleValidationErrors(
          validator.getErrors(), 
          `exercise ${i + 1}: ${exercise.name || 'unnamed'}`
        );
        throw validationError;
      }
    }

    if (verbose) {
      logProgress(`Creating ${allExercises.length} validated exercise documents...`, 'info');
    }

    // Create individual exercise documents with error handling
    let createdExercises;
    try {
      createdExercises = await createExerciseDocuments(db, allExercises);
    } catch (error) {
      const seedingError = new SeedingError(
        `Failed to create exercise documents: ${error.message}`,
        'createExerciseDocuments',
        { exerciseCount: allExercises.length },
        error
      );
      throw seedingError;
    }

    // Validate created exercises
    if (!createdExercises || createdExercises.length !== allExercises.length) {
      throw new SeedingError(
        `Exercise creation mismatch: expected ${allExercises.length}, created ${createdExercises?.length || 0}`,
        'exerciseCreationValidation',
        { expected: allExercises.length, actual: createdExercises?.length || 0 }
      );
    }

    if (verbose) {
      logProgress('Creating exercises metadata document...', 'info');
    }

    // Create exercises metadata document with error handling
    try {
      await createExercisesMetadata(db, createdExercises);
    } catch (error) {
      const seedingError = new SeedingError(
        `Failed to create exercises metadata: ${error.message}`,
        'createExercisesMetadata',
        { exerciseCount: createdExercises.length },
        error
      );
      throw seedingError;
    }

    const results = {
      totalExercises: createdExercises.length,
      categories: {
        compound: EXERCISE_DATABASE.compound.length,
        isolation: EXERCISE_DATABASE.isolation.length,
        bodyweight: EXERCISE_DATABASE.bodyweight.length,
        machine: EXERCISE_DATABASE.machine.length
      },
      muscleGroups: [...new Set(allExercises.map(ex => ex.primaryMuscleGroup))],
      exerciseTypes: [...new Set(allExercises.map(ex => ex.exerciseType))],
      createdExercises: createdExercises.map(ex => ({ id: ex.id, name: ex.name }))
    };

    // Validate final results
    if (results.totalExercises === 0) {
      throw new SeedingError('No exercises were created', 'seedExercises', results);
    }

    if (verbose) {
      logProgress(`Exercise database seeded successfully:`, 'success');
      logProgress(`  - Total exercises: ${results.totalExercises}`, 'info');
      logProgress(`  - Compound: ${results.categories.compound}`, 'info');
      logProgress(`  - Isolation: ${results.categories.isolation}`, 'info');
      logProgress(`  - Bodyweight: ${results.categories.bodyweight}`, 'info');
      logProgress(`  - Machine: ${results.categories.machine}`, 'info');
      logProgress(`  - Muscle groups: ${results.muscleGroups.join(', ')}`, 'info');
      logProgress(`  - Exercise types: ${results.exerciseTypes.join(', ')}`, 'info');
    }

    return results;

  } catch (error) {
    if (error instanceof SeedingError) {
      throw error;
    }
    
    const seedingError = new SeedingError(
      `Exercise seeding failed: ${error.message}`,
      'seedExercises',
      { databaseSize: Object.keys(EXERCISE_DATABASE).length },
      error
    );
    
    logError(seedingError, 'Exercise Seeding', verbose);
    throw seedingError;
  }
}

/**
 * Get all exercises from the database (for testing/validation)
 * @returns {Promise<Array>} Array of all exercises
 */
async function getAllExercises() {
  const db = getFirestore();
  const snapshot = await db.collection('exercises').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Clear all exercise data (for reset functionality)
 * @returns {Promise<void>}
 */
async function clearExerciseData() {
  const db = getFirestore();
  
  // Delete all exercise documents
  const exercisesSnapshot = await db.collection('exercises').get();
  const batch = db.batch();
  
  exercisesSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });
  
  // Delete exercises metadata
  batch.delete(db.collection('exercises_metadata').doc('all_exercises'));
  
  await batch.commit();
}

/**
 * Reset all exercise data and return count of cleared items
 * @param {Object} options - Reset options
 * @returns {Promise<number>} Number of exercises cleared
 */
async function resetExercises(options = {}) {
  const db = getFirestore();
  
  try {
    // Get count before deletion
    const exercisesSnapshot = await db.collection('exercises').get();
    const exerciseCount = exercisesSnapshot.size;
    
    // Check if exercises_metadata exists
    let metadataExists = false;
    try {
      const metadataDoc = await db.collection('exercises_metadata').doc('all_exercises').get();
      metadataExists = metadataDoc.exists;
    } catch (error) {
      // Metadata collection might not exist, that's okay
    }
    
    if (exerciseCount === 0 && !metadataExists) {
      if (options.verbose) {
        logProgress('No exercise data found to clear', 'info');
      }
      return 0;
    }
    
    // Use existing clear function
    await clearExerciseData();
    
    if (options.verbose) {
      logProgress(`Cleared ${exerciseCount} exercises and metadata`, 'info');
    }
    
    return exerciseCount;
  } catch (error) {
    throw new Error(`Failed to reset exercises: ${error.message}`);
  }
}

module.exports = {
  seedExercises,
  getAllExercises,
  clearExerciseData,
  resetExercises,
  EXERCISE_DATABASE,
  MUSCLE_GROUPS,
  EXERCISE_TYPES
};