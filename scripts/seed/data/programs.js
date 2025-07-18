/**
 * Workout program seeding module
 * 
 * This module handles creating workout programs for test users.
 * It creates program templates for different experience levels and links them to user accounts.
 */

const { getFirestore } = require('../utils/firebase-config');
const { logProgress } = require('../utils/logger');
const { getAllExercises } = require('./exercises');

// Program templates for different user levels
const PROGRAM_TEMPLATES = {
  beginner: {
    name: 'Starting Strength',
    description: 'A simple 3-day full-body program focusing on compound movements for beginners',
    duration: 12, // weeks
    daysPerWeek: 3,
    weightUnit: 'LB',
    difficulty: 'beginner',
    goals: ['strength', 'muscle_gain'],
    equipment: ['barbell', 'bench', 'squat_rack'],
    workoutStructure: {
      // Week 1-4: Learning phase
      weeks_1_4: {
        day1: {
          name: 'Workout A',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Bench Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 3, reps: 5, restMinutes: 3 }
          ]
        },
        day2: {
          name: 'Workout B',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Overhead Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Conventional Deadlift', sets: 1, reps: 5, restMinutes: 5 }
          ]
        },
        day3: {
          name: 'Workout C',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Bench Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 3, reps: 5, restMinutes: 3 }
          ]
        }
      },
      // Week 5-8: Progression phase
      weeks_5_8: {
        day1: {
          name: 'Workout A',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Bench Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Dumbbell Bicep Curl', sets: 2, reps: 10, restMinutes: 2 }
          ]
        },
        day2: {
          name: 'Workout C',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Overhead Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Conventional Deadlift', sets: 1, reps: 5, restMinutes: 5 },
            { exerciseName: 'Tricep Dips', sets: 2, reps: 8, restMinutes: 2 }
          ]
        },
        day3: {
          name: 'Workout C',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Bench Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Dumbbell Bicep Curl', sets: 2, reps: 10, restMinutes: 2 }
          ]
        }
      },
      // Week 9-12: Strength phase
      weeks_9_12: {
        day1: {
          name: 'Workout A',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Bench Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Dumbbell Bicep Curl', sets: 3, reps: 8, restMinutes: 2 },
            { exerciseName: 'Plank', sets: 3, reps: '30s', restMinutes: 1 }
          ]
        },
        day2: {
          name: 'Workout B',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Overhead Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Conventional Deadlift', sets: 1, reps: 5, restMinutes: 5 },
            { exerciseName: 'Tricep Dips', sets: 3, reps: 6, restMinutes: 2 },
            { exerciseName: 'Calf Raises', sets: 3, reps: 15, restMinutes: 1 }
          ]
        },
        day3: {
          name: 'Workout C',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Bench Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Dumbbell Bicep Curl', sets: 3, reps: 8, restMinutes: 2 },
            { exerciseName: 'Plank', sets: 3, reps: '30s', restMinutes: 1 }
          ]
        }
      }
    }
  },

  intermediate: {
    name: '5/3/1 for Beginners',
    description: 'A 4-day upper/lower split with percentage-based progression for intermediate lifters',
    duration: 12, // weeks
    daysPerWeek: 4,
    weightUnit: 'LB',
    difficulty: 'intermediate',
    goals: ['strength', 'powerlifting'],
    equipment: ['barbell', 'dumbbells', 'bench', 'squat_rack', 'plates'],
    workoutStructure: {
      // Week 1-4: Base building
      weeks_1_4: {
        day1: {
          name: 'Upper Power',
          exercises: [
            { exerciseName: 'Barbell Bench Press', sets: 4, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 4, reps: 5, restMinutes: 3 },
            { exerciseName: 'Overhead Press', sets: 3, reps: 8, restMinutes: 2 },
            { exerciseName: 'Pull-ups', sets: 3, reps: 6, restMinutes: 2 },
            { exerciseName: 'Dumbbell Bicep Curl', sets: 3, reps: 10, restMinutes: 2 },
            { exerciseName: 'Tricep Extensions', sets: 3, reps: 10, restMinutes: 2 }
          ]
        },
        day2: {
          name: 'Lower Power',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 4, reps: 5, restMinutes: 3 },
            { exerciseName: 'Conventional Deadlift', sets: 3, reps: 5, restMinutes: 4 },
            { exerciseName: 'Front Squat', sets: 3, reps: 8, restMinutes: 3 },
            { exerciseName: 'Leg Curls', sets: 3, reps: 12, restMinutes: 2 },
            { exerciseName: 'Calf Raises', sets: 4, reps: 15, restMinutes: 1 },
            { exerciseName: 'Plank', sets: 3, reps: '45s', restMinutes: 1 }
          ]
        },
        day3: {
          name: 'Upper Hypertrophy',
          exercises: [
            { exerciseName: 'Incline Barbell Press', sets: 4, reps: 8, restMinutes: 3 },
            { exerciseName: 'Seated Cable Row', sets: 4, reps: 8, restMinutes: 3 },
            { exerciseName: 'Lateral Raises', sets: 4, reps: 12, restMinutes: 2 },
            { exerciseName: 'Cable Flyes', sets: 3, reps: 12, restMinutes: 2 },
            { exerciseName: 'Hammer Curls', sets: 3, reps: 12, restMinutes: 2 },
            { exerciseName: 'Tricep Dips', sets: 3, reps: 10, restMinutes: 2 }
          ]
        },
        day4: {
          name: 'Lower Hypertrophy',
          exercises: [
            { exerciseName: 'Leg Press', sets: 4, reps: 12, restMinutes: 3 },
            { exerciseName: 'Sumo Deadlift', sets: 3, reps: 8, restMinutes: 3 },
            { exerciseName: 'Leg Extensions', sets: 3, reps: 15, restMinutes: 2 },
            { exerciseName: 'Leg Curls', sets: 3, reps: 15, restMinutes: 2 },
            { exerciseName: 'Hip Thrust Machine', sets: 3, reps: 12, restMinutes: 2 },
            { exerciseName: 'Mountain Climbers', sets: 3, reps: 20, restMinutes: 1 }
          ]
        }
      },
      // Week 5-8: Progression phase
      weeks_5_8: {
        day1: {
          name: 'Workout A',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Bench Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Dumbbell Bicep Curl', sets: 2, reps: 10, restMinutes: 2 }
          ]
        },
        day2: {
          name: 'Workout C',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Overhead Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Conventional Deadlift', sets: 1, reps: 5, restMinutes: 5 },
            { exerciseName: 'Tricep Dips', sets: 2, reps: 8, restMinutes: 2 }
          ]
        },
        day3: {
          name: 'Workout C',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Bench Press', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Barbell Row', sets: 3, reps: 5, restMinutes: 3 },
            { exerciseName: 'Dumbbell Bicep Curl', sets: 2, reps: 10, restMinutes: 2 }
          ]
        }
      }
    }
  },

  advanced: {
    name: 'Conjugate Method',
    description: 'A 4-day conjugate method program with max effort and dynamic effort days for advanced lifters',
    duration: 20, // weeks
    daysPerWeek: 4,
    weightUnit: 'KG',
    difficulty: 'advanced',
    goals: ['competition', 'strength'],
    equipment: ['barbell', 'dumbbells', 'bench', 'squat_rack', 'plates', 'specialty_bars'],
    workoutStructure: {
      // Week 1-4: Max effort focus
      weeks_1_4: {
        day1: {
          name: 'Max Effort Upper',
          exercises: [
            { exerciseName: 'Barbell Bench Press', sets: 5, reps: 3, restMinutes: 4 },
            { exerciseName: 'Barbell Row', sets: 4, reps: 5, restMinutes: 3 },
            { exerciseName: 'Overhead Press', sets: 4, reps: 6, restMinutes: 3 },
            { exerciseName: 'Pull-ups', sets: 4, reps: 5, restMinutes: 3 },
            { exerciseName: 'Lateral Raises', sets: 4, reps: 10, restMinutes: 2 },
            { exerciseName: 'Tricep Extensions', sets: 4, reps: 8, restMinutes: 2 }
          ]
        },
        day2: {
          name: 'Max Effort Lower',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 5, reps: 3, restMinutes: 4 },
            { exerciseName: 'Conventional Deadlift', sets: 4, reps: 3, restMinutes: 5 },
            { exerciseName: 'Front Squat', sets: 3, reps: 6, restMinutes: 3 },
            { exerciseName: 'Leg Curls', sets: 4, reps: 10, restMinutes: 2 },
            { exerciseName: 'Hip Thrust Machine', sets: 4, reps: 8, restMinutes: 2 },
            { exerciseName: 'Plank', sets: 4, reps: '60s', restMinutes: 1 }
          ]
        },
        day3: {
          name: 'Dynamic Effort Upper',
          exercises: [
            { exerciseName: 'Barbell Bench Press', sets: 8, reps: 3, restMinutes: 2 },
            { exerciseName: 'Incline Barbell Press', sets: 4, reps: 8, restMinutes: 3 },
            { exerciseName: 'Seated Cable Row', sets: 4, reps: 8, restMinutes: 3 },
            { exerciseName: 'Cable Flyes', sets: 4, reps: 12, restMinutes: 2 },
            { exerciseName: 'Hammer Curls', sets: 4, reps: 10, restMinutes: 2 },
            { exerciseName: 'Tricep Dips', sets: 4, reps: 8, restMinutes: 2 }
          ]
        },
        day4: {
          name: 'Dynamic Effort Lower',
          exercises: [
            { exerciseName: 'Barbell Back Squat', sets: 8, reps: 3, restMinutes: 2 },
            { exerciseName: 'Sumo Deadlift', sets: 6, reps: 3, restMinutes: 3 },
            { exerciseName: 'Leg Press', sets: 4, reps: 12, restMinutes: 3 },
            { exerciseName: 'Leg Extensions', sets: 4, reps: 12, restMinutes: 2 },
            { exerciseName: 'Leg Curls', sets: 4, reps: 12, restMinutes: 2 },
            { exerciseName: 'Calf Raises', sets: 5, reps: 15, restMinutes: 1 }
          ]
        }
      }
    }
  }
};

/**
 * Create program document structure for Firestore
 * @param {Object} template - Program template
 * @param {string} userId - User ID
 * @param {Object} exerciseMap - Map of exercise names to IDs
 * @param {boolean} isCurrent - Whether this is the user's current program
 * @returns {Object} Program document
 */
function createProgramDocument(template, userId, exerciseMap, isCurrent = false) {
  const weeklyConfigs = {};

  // Convert template structure to weekly configs
  Object.entries(template.workoutStructure).forEach(([weekRange, days]) => {
    const [startWeek, endWeek] = weekRange.includes('_')
      ? weekRange.split('_').slice(1).map(w => parseInt(w))
      : [1, template.duration];

    for (let week = startWeek; week <= endWeek; week++) {
      Object.entries(days).forEach(([dayKey, dayData]) => {
        const dayNumber = parseInt(dayKey.replace('day', ''));
        const configKey = `week${week}_day${dayNumber}`;

        weeklyConfigs[configKey] = {
          name: dayData.name,
          exercises: dayData.exercises.map(exercise => ({
            exerciseId: exerciseMap[exercise.exerciseName] || null,
            sets: exercise.sets,
            reps: exercise.reps,
            restMinutes: exercise.restMinutes,
            notes: exercise.notes || ''
          })).filter(ex => ex.exerciseId) // Only include exercises that were found
        };
      });
    }
  });

  return {
    userId,
    isTemplate: false,
    name: template.name,
    description: template.description,
    duration: template.duration,
    daysPerWeek: template.daysPerWeek,
    weightUnit: template.weightUnit,
    difficulty: template.difficulty,
    goals: template.goals,
    equipment: template.equipment,
    weeklyConfigs,
    createdAt: new Date(),
    isCurrent,
    isActive: true,
    startDate: new Date(),
    completedWeeks: 0,
    metadata: {
      totalWorkouts: Object.keys(weeklyConfigs).length,
      estimatedDuration: `${template.duration} weeks`,
      targetAudience: template.difficulty
    }
  };
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
 * Get appropriate program template for user experience level
 * @param {string} experienceLevel - User's experience level
 * @returns {Object} Program template
 */
function getProgramTemplateForUser(experienceLevel) {
  const templateMap = {
    'beginner': PROGRAM_TEMPLATES.beginner,
    'intermediate': PROGRAM_TEMPLATES.intermediate,
    'advanced': PROGRAM_TEMPLATES.advanced
  };

  return templateMap[experienceLevel] || PROGRAM_TEMPLATES.beginner;
}

/**
 * Seed workout programs for test users
 * @param {Array} users - Array of test users
 * @param {Object} options - Seeding options
 * @param {boolean} options.verbose - Whether to show detailed progress
 * @returns {Promise<Object>} Seeding results
 */
async function seedPrograms(users, options = {}) {
  const { verbose = false } = options;

  try {
    const db = getFirestore();

    if (verbose) {
      logProgress('Starting workout program seeding...', 'info');
    }

    // Get all exercises to create exercise mapping
    const exercises = await getAllExercises();
    const exerciseMap = createExerciseMap(exercises);

    if (verbose) {
      logProgress(`Found ${exercises.length} exercises for program creation`, 'info');
    }

    const createdPrograms = [];
    const batch = db.batch();

    // Create programs for each user
    for (const user of users) {
      if (verbose) {
        logProgress(`Creating program for ${user.scenario} user: ${user.profile.name}`, 'info');
      }

      // Get appropriate template for user's experience level
      const template = getProgramTemplateForUser(user.profile.experienceLevel);

      // Adjust template based on user preferences
      const adjustedTemplate = {
        ...template,
        weightUnit: user.profile.preferredUnits,
        equipment: user.profile.availableEquipment || template.equipment
      };

      // Create program document
      const programDoc = createProgramDocument(
        adjustedTemplate,
        user.uid,
        exerciseMap,
        true // Set as current program
      );

      // Add to batch
      const programRef = db.collection('programs').doc();
      batch.set(programRef, programDoc);

      createdPrograms.push({
        id: programRef.id,
        userId: user.uid,
        userScenario: user.scenario,
        programName: template.name,
        ...programDoc
      });

      if (verbose) {
        logProgress(`  ✅ Created "${template.name}" program for ${user.scenario} user`, 'success');
      }
    }

    // Commit all programs
    await batch.commit();

    const results = {
      totalPrograms: createdPrograms.length,
      programsByLevel: {
        beginner: createdPrograms.filter(p => p.difficulty === 'beginner').length,
        intermediate: createdPrograms.filter(p => p.difficulty === 'intermediate').length,
        advanced: createdPrograms.filter(p => p.difficulty === 'advanced').length
      },
      createdPrograms: createdPrograms.map(p => ({
        id: p.id,
        userId: p.userId,
        userScenario: p.userScenario,
        name: p.programName,
        duration: p.duration,
        daysPerWeek: p.daysPerWeek,
        weeklyConfigs: p.weeklyConfigs,
        weightUnit: p.weightUnit
      }))
    };

    if (verbose) {
      logProgress(`Workout programs seeded successfully:`, 'success');
      logProgress(`  - Total programs: ${results.totalPrograms}`, 'info');
      logProgress(`  - Beginner programs: ${results.programsByLevel.beginner}`, 'info');
      logProgress(`  - Intermediate programs: ${results.programsByLevel.intermediate}`, 'info');
      logProgress(`  - Advanced programs: ${results.programsByLevel.advanced}`, 'info');

      results.createdPrograms.forEach(program => {
        logProgress(`  - ${program.userScenario}: "${program.name}" (${program.duration} weeks, ${program.daysPerWeek} days/week)`, 'info');
      });
    }

    return results;

  } catch (error) {
    logProgress(`Program seeding failed: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Get all programs from the database (for testing/validation)
 * @param {string} userId - Optional user ID to filter programs
 * @returns {Promise<Array>} Array of program documents
 */
async function getAllPrograms(userId = null) {
  const db = getFirestore();
  let query = db.collection('programs');

  if (userId) {
    query = query.where('userId', '==', userId);
  }

  const snapshot = await query.get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Clear all program data (for reset functionality)
 * @returns {Promise<void>}
 */
async function clearProgramData() {
  const db = getFirestore();

  const programsSnapshot = await db.collection('programs').get();
  const batch = db.batch();

  programsSnapshot.docs.forEach(doc => {
    batch.delete(doc.ref);
  });

  await batch.commit();
}

/**
 * Reset all program data and return count of cleared items
 * @param {Object} options - Reset options
 * @returns {Promise<number>} Number of programs cleared
 */
async function resetPrograms(options = {}) {
  const db = getFirestore();

  try {
    // Get count before deletion
    const programsSnapshot = await db.collection('programs').get();
    const programCount = programsSnapshot.size;

    if (programCount === 0) {
      if (options.verbose) {
        logProgress('No program data found to clear', 'info');
      }
      return 0;
    }

    // Use existing clear function
    await clearProgramData();

    if (options.verbose) {
      logProgress(`Cleared ${programCount} workout programs`, 'info');
    }

    return programCount;
  } catch (error) {
    throw new Error(`Failed to reset programs: ${error.message}`);
  }
}

module.exports = {
  seedPrograms,
  getAllPrograms,
  clearProgramData,
  resetPrograms,
  PROGRAM_TEMPLATES,
  getProgramTemplateForUser
};