/**
 * Sample workout data for seeding the database
 * Contains realistic workout structures for different user experience levels
 */

// Exercise IDs from the global exercises in seeder.js
const EXERCISE_IDS = {
  // Chest
  BENCH_PRESS: '550e8400-e29b-41d4-a716-446655440001',
  PUSH_UPS: '550e8400-e29b-41d4-a716-446655440002',
  INCLINE_DUMBBELL_PRESS: '550e8400-e29b-41d4-a716-446655440003',
  DUMBBELL_FLYES: '550e8400-e29b-41d4-a716-446655440004',

  // Back
  PULL_UPS: '550e8400-e29b-41d4-a716-446655440005',
  BENT_OVER_ROW: '550e8400-e29b-41d4-a716-446655440006',
  LAT_PULLDOWN: '550e8400-e29b-41d4-a716-446655440007',
  DEADLIFT: '550e8400-e29b-41d4-a716-446655440008',

  // Legs
  SQUAT: '550e8400-e29b-41d4-a716-446655440009',
  LEG_PRESS: '550e8400-e29b-41d4-a716-44665544000a',
  LUNGES: '550e8400-e29b-41d4-a716-44665544000b',
  LEG_CURL: '550e8400-e29b-41d4-a716-44665544000c',

  // Shoulders
  OVERHEAD_PRESS: '550e8400-e29b-41d4-a716-44665544000d',
  LATERAL_RAISES: '550e8400-e29b-41d4-a716-44665544000e',
  FRONT_RAISES: '550e8400-e29b-41d4-a716-44665544000f',
  REAR_DELT_FLYES: '550e8400-e29b-41d4-a716-446655440010',

  // Arms
  BICEP_CURLS: '550e8400-e29b-41d4-a716-446655440011',
  TRICEP_DIPS: '550e8400-e29b-41d4-a716-446655440012',
  HAMMER_CURLS: '550e8400-e29b-41d4-a716-446655440013',
  TRICEP_EXTENSIONS: '550e8400-e29b-41d4-a716-446655440014',

  // Core
  PLANK: '550e8400-e29b-41d4-a716-446655440015',
  CRUNCHES: '550e8400-e29b-41d4-a716-446655440016',
  RUSSIAN_TWISTS: '550e8400-e29b-41d4-a716-446655440017',
  MOUNTAIN_CLIMBERS: '550e8400-e29b-41d4-a716-446655440018'
};

/**
 * Beginner Program - 3 days per week, 4 weeks
 * Focus on basic movements with bodyweight and light weights
 */
export const beginnerProgram = {
  program: {
    name: 'Beginner Strength Foundation',
    description: 'A beginner-friendly program focusing on basic movement patterns and building strength foundation',
    duration: 4,
    days_per_week: 3,
    weight_unit: 'LB',
    difficulty: 'beginner',
    goals: ['Build Muscle', 'Learn Proper Form'],
    equipment: ['Dumbbells', 'Resistance Bands'],
    is_template: false,
    is_current: true,
    is_active: true
  },
  workouts: [
    // Week 1
    {
      week_number: 1,
      day_number: 1,
      name: 'Upper Body Foundation',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 2, reps: '8-10', rest_minutes: 2, notes: 'Modify on knees if needed' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 2, reps: '10-12', rest_minutes: 2, notes: 'Use light dumbbells' },
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 2, reps: 8, rest_minutes: 2, notes: 'Start with light weight' },
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 2, reps: '12+', rest_minutes: 1, notes: 'Focus on form' },
        { exercise_id: EXERCISE_IDS.PLANK, sets: 2, reps: 30, rest_minutes: 1, notes: 'Hold for 30 seconds' }
      ]
    },
    {
      week_number: 1,
      day_number: 2,
      name: 'Lower Body Foundation',
      exercises: [
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 2, reps: 10, rest_minutes: 2, notes: 'Bodyweight or light weight' },
        { exercise_id: EXERCISE_IDS.LUNGES, sets: 2, reps: '8-10', rest_minutes: 2, notes: '8 per leg' },
        { exercise_id: EXERCISE_IDS.LEG_CURL, sets: 2, reps: 12, rest_minutes: 2, notes: 'Use resistance band' },
        { exercise_id: EXERCISE_IDS.CRUNCHES, sets: 2, reps: 15, rest_minutes: 1, notes: 'Slow and controlled' },
        { exercise_id: EXERCISE_IDS.MOUNTAIN_CLIMBERS, sets: 2, reps: 20, rest_minutes: 1, notes: '10 per leg' }
      ]
    },
    {
      week_number: 1,
      day_number: 3,
      name: 'Full Body Integration',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 2, reps: 6, rest_minutes: 2, notes: 'Focus on quality' },
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 2, reps: 8, rest_minutes: 2, notes: 'Add light weight if comfortable' },
        { exercise_id: EXERCISE_IDS.LATERAL_RAISES, sets: 2, reps: 10, rest_minutes: 1, notes: 'Very light weight' },
        { exercise_id: EXERCISE_IDS.TRICEP_DIPS, sets: 2, reps: 6, rest_minutes: 2, notes: 'Use chair or bench' },
        { exercise_id: EXERCISE_IDS.RUSSIAN_TWISTS, sets: 2, reps: 20, rest_minutes: 1, notes: '10 per side' }
      ]
    },

    // Week 2 - Slight progression
    {
      week_number: 2,
      day_number: 1,
      name: 'Upper Body Progression',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 3, reps: 8, rest_minutes: 2, notes: 'Add one more set' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 3, reps: 10, rest_minutes: 2, notes: 'Slightly heavier weight' },
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 3, reps: 8, rest_minutes: 2, notes: 'Maintain good form' },
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 3, reps: 12, rest_minutes: 1, notes: 'Controlled movement' },
        { exercise_id: EXERCISE_IDS.PLANK, sets: 3, reps: 35, rest_minutes: 1, notes: 'Hold for 35 seconds' }
      ]
    },
    {
      week_number: 2,
      day_number: 2,
      name: 'Lower Body Progression',
      exercises: [
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 10, rest_minutes: 2, notes: 'Add light weight' },
        { exercise_id: EXERCISE_IDS.LUNGES, sets: 3, reps: 8, rest_minutes: 2, notes: '8 per leg, add weight if ready' },
        { exercise_id: EXERCISE_IDS.LEG_CURL, sets: 3, reps: 12, rest_minutes: 2, notes: 'Increase resistance' },
        { exercise_id: EXERCISE_IDS.CRUNCHES, sets: 3, reps: 18, rest_minutes: 1, notes: 'Add a few more reps' },
        { exercise_id: EXERCISE_IDS.MOUNTAIN_CLIMBERS, sets: 3, reps: 24, rest_minutes: 1, notes: '12 per leg' }
      ]
    },
    {
      week_number: 2,
      day_number: 3,
      name: 'Full Body Integration',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 3, reps: 8, rest_minutes: 2, notes: 'Building endurance' },
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 10, rest_minutes: 2, notes: 'Focus on depth' },
        { exercise_id: EXERCISE_IDS.LATERAL_RAISES, sets: 3, reps: 12, rest_minutes: 1, notes: 'Light weight, good form' },
        { exercise_id: EXERCISE_IDS.TRICEP_DIPS, sets: 3, reps: 8, rest_minutes: 2, notes: 'Full range of motion' },
        { exercise_id: EXERCISE_IDS.RUSSIAN_TWISTS, sets: 3, reps: 24, rest_minutes: 1, notes: '12 per side' }
      ]
    },

    // Week 3 - Continue progression
    {
      week_number: 3,
      day_number: 1,
      name: 'Upper Body Strength',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 3, reps: 10, rest_minutes: 2, notes: 'Increase reps' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 3, reps: 12, rest_minutes: 2, notes: 'Focus on squeezing back' },
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 3, reps: 10, rest_minutes: 2, notes: 'Increase weight slightly' },
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 3, reps: 15, rest_minutes: 1, notes: 'Higher rep range' },
        { exercise_id: EXERCISE_IDS.PLANK, sets: 3, reps: 40, rest_minutes: 1, notes: 'Hold for 40 seconds' }
      ]
    },
    {
      week_number: 3,
      day_number: 2,
      name: 'Lower Body Strength',
      exercises: [
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 12, rest_minutes: 2, notes: 'Add more weight' },
        { exercise_id: EXERCISE_IDS.LUNGES, sets: 3, reps: 10, rest_minutes: 2, notes: '10 per leg' },
        { exercise_id: EXERCISE_IDS.LEG_CURL, sets: 3, reps: 15, rest_minutes: 2, notes: 'Higher resistance' },
        { exercise_id: EXERCISE_IDS.CRUNCHES, sets: 3, reps: 20, rest_minutes: 1, notes: 'Slow and controlled' },
        { exercise_id: EXERCISE_IDS.MOUNTAIN_CLIMBERS, sets: 3, reps: 30, rest_minutes: 1, notes: '15 per leg' }
      ]
    },
    {
      week_number: 3,
      day_number: 3,
      name: 'Full Body Challenge',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 3, reps: 10, rest_minutes: 2, notes: 'Challenge yourself' },
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 12, rest_minutes: 2, notes: 'Good depth and control' },
        { exercise_id: EXERCISE_IDS.LATERAL_RAISES, sets: 3, reps: 15, rest_minutes: 1, notes: 'Light weight, high reps' },
        { exercise_id: EXERCISE_IDS.TRICEP_DIPS, sets: 3, reps: 10, rest_minutes: 2, notes: 'Full range' },
        { exercise_id: EXERCISE_IDS.RUSSIAN_TWISTS, sets: 3, reps: 30, rest_minutes: 1, notes: '15 per side' }
      ]
    },

    // Week 4 - Peak beginner level
    {
      week_number: 4,
      day_number: 1,
      name: 'Upper Body Mastery',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 3, reps: 12, rest_minutes: 2, notes: 'Peak beginner level' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 3, reps: 12, rest_minutes: 2, notes: 'Perfect form' },
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 3, reps: 10, rest_minutes: 2, notes: 'Controlled movement' },
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 3, reps: 15, rest_minutes: 1, notes: 'Full range of motion' },
        { exercise_id: EXERCISE_IDS.PLANK, sets: 3, reps: 45, rest_minutes: 1, notes: 'Hold for 45 seconds' }
      ]
    },
    {
      week_number: 4,
      day_number: 2,
      name: 'Lower Body Mastery',
      exercises: [
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 15, rest_minutes: 2, notes: 'Higher rep endurance' },
        { exercise_id: EXERCISE_IDS.LUNGES, sets: 3, reps: 12, rest_minutes: 2, notes: '12 per leg' },
        { exercise_id: EXERCISE_IDS.LEG_CURL, sets: 3, reps: 15, rest_minutes: 2, notes: 'Maximum resistance' },
        { exercise_id: EXERCISE_IDS.CRUNCHES, sets: 3, reps: 25, rest_minutes: 1, notes: 'Peak performance' },
        { exercise_id: EXERCISE_IDS.MOUNTAIN_CLIMBERS, sets: 3, reps: 40, rest_minutes: 1, notes: '20 per leg' }
      ]
    },
    {
      week_number: 4,
      day_number: 3,
      name: 'Full Body Finale',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 3, reps: 12, rest_minutes: 2, notes: 'Show your progress' },
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 15, rest_minutes: 2, notes: 'Perfect form' },
        { exercise_id: EXERCISE_IDS.LATERAL_RAISES, sets: 3, reps: 15, rest_minutes: 1, notes: 'Light weight mastery' },
        { exercise_id: EXERCISE_IDS.TRICEP_DIPS, sets: 3, reps: 12, rest_minutes: 2, notes: 'Full range mastery' },
        { exercise_id: EXERCISE_IDS.RUSSIAN_TWISTS, sets: 3, reps: 40, rest_minutes: 1, notes: '20 per side' }
      ]
    }
  ]
};

/**
 * Intermediate Program - 4 days per week, 6 weeks
 * More complex movements with heavier weights and varied rep ranges
 */
export const intermediateProgram = {
  program: {
    name: 'Intermediate Strength Builder',
    description: 'A comprehensive program for intermediate lifters focusing on strength and muscle building',
    duration: 6,
    days_per_week: 4,
    weight_unit: 'LB',
    difficulty: 'intermediate',
    goals: ['Build Muscle', 'Get Stronger', 'Improve Conditioning'],
    equipment: ['Dumbbells', 'Barbell', 'Bench', 'Pull-up Bar'],
    is_template: false,
    is_current: true,
    is_active: true
  },
  workouts: [
    // Week 1 - Upper/Lower Split
    {
      week_number: 1,
      day_number: 1,
      name: 'Upper Body Power',
      exercises: [
        { exercise_id: EXERCISE_IDS.BENCH_PRESS, sets: 4, reps: '6-8', rest_minutes: 3, notes: 'Heavy compound movement' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 4, reps: 6, rest_minutes: 3, notes: 'Match bench press strength' },
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 3, reps: '8-12', rest_minutes: 2, notes: 'Strict form' },
        { exercise_id: EXERCISE_IDS.PULL_UPS, sets: 3, reps: 8, rest_minutes: 2, notes: 'Assisted if needed' },
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 3, reps: '12+', rest_minutes: 1, notes: 'Isolation work' },
        { exercise_id: EXERCISE_IDS.TRICEP_EXTENSIONS, sets: 3, reps: 12, rest_minutes: 1, notes: 'Full range' }
      ]
    },
    {
      week_number: 1,
      day_number: 2,
      name: 'Lower Body Power',
      exercises: [
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 4, reps: '6-8', rest_minutes: 3, notes: 'Heavy squats' },
        { exercise_id: EXERCISE_IDS.DEADLIFT, sets: 3, reps: '5-7', rest_minutes: 3, notes: 'Perfect form essential' },
        { exercise_id: EXERCISE_IDS.LEG_PRESS, sets: 3, reps: 12, rest_minutes: 2, notes: 'High volume' },
        { exercise_id: EXERCISE_IDS.LEG_CURL, sets: 3, reps: 12, rest_minutes: 2, notes: 'Hamstring focus' },
        { exercise_id: EXERCISE_IDS.LUNGES, sets: 3, reps: 10, rest_minutes: 2, notes: '10 per leg' },
        { exercise_id: EXERCISE_IDS.PLANK, sets: 3, reps: 60, rest_minutes: 1, notes: '1 minute hold' }
      ]
    },
    {
      week_number: 1,
      day_number: 3,
      name: 'Upper Body Volume',
      exercises: [
        { exercise_id: EXERCISE_IDS.INCLINE_DUMBBELL_PRESS, sets: 4, reps: 10, rest_minutes: 2, notes: 'Upper chest focus' },
        { exercise_id: EXERCISE_IDS.LAT_PULLDOWN, sets: 4, reps: 10, rest_minutes: 2, notes: 'Wide grip' },
        { exercise_id: EXERCISE_IDS.LATERAL_RAISES, sets: 4, reps: 15, rest_minutes: 1, notes: 'Shoulder width' },
        { exercise_id: EXERCISE_IDS.DUMBBELL_FLYES, sets: 3, reps: 12, rest_minutes: 2, notes: 'Chest isolation' },
        { exercise_id: EXERCISE_IDS.HAMMER_CURLS, sets: 3, reps: 12, rest_minutes: 1, notes: 'Neutral grip' },
        { exercise_id: EXERCISE_IDS.TRICEP_DIPS, sets: 3, reps: 12, rest_minutes: 2, notes: 'Bodyweight or weighted' }
      ]
    },
    {
      week_number: 1,
      day_number: 4,
      name: 'Lower Body Volume',
      exercises: [
        { exercise_id: EXERCISE_IDS.LEG_PRESS, sets: 4, reps: 15, rest_minutes: 2, notes: 'High rep volume' },
        { exercise_id: EXERCISE_IDS.LUNGES, sets: 4, reps: 12, rest_minutes: 2, notes: '12 per leg with weight' },
        { exercise_id: EXERCISE_IDS.LEG_CURL, sets: 4, reps: '15-20', rest_minutes: 2, notes: 'Hamstring pump' },
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 20, rest_minutes: 2, notes: 'Light weight, high reps' },
        { exercise_id: EXERCISE_IDS.CRUNCHES, sets: 4, reps: 25, rest_minutes: 1, notes: 'Core finisher' },
        { exercise_id: EXERCISE_IDS.RUSSIAN_TWISTS, sets: 3, reps: 50, rest_minutes: 1, notes: '25 per side' }
      ]
    },

    // Week 2-6 would continue with progressive overload...
    // For brevity, I'll add a few more weeks with key progressions

    // Week 3 - Intensity increase
    {
      week_number: 3,
      day_number: 1,
      name: 'Upper Body Power',
      exercises: [
        { exercise_id: EXERCISE_IDS.BENCH_PRESS, sets: 4, reps: 5, rest_minutes: 3, notes: 'Increase weight, lower reps' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 4, reps: 5, rest_minutes: 3, notes: 'Heavy pulling' },
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 4, reps: 6, rest_minutes: 3, notes: 'Strength focus' },
        { exercise_id: EXERCISE_IDS.PULL_UPS, sets: 4, reps: 6, rest_minutes: 2, notes: 'Add weight if possible' },
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 3, reps: 10, rest_minutes: 1, notes: 'Heavier weight' },
        { exercise_id: EXERCISE_IDS.TRICEP_EXTENSIONS, sets: 3, reps: 10, rest_minutes: 1, notes: 'Strength range' }
      ]
    },

    // Week 6 - Peak week
    {
      week_number: 6,
      day_number: 1,
      name: 'Upper Body Peak',
      exercises: [
        { exercise_id: EXERCISE_IDS.BENCH_PRESS, sets: 5, reps: 3, rest_minutes: 4, notes: 'Peak strength' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 5, reps: 3, rest_minutes: 4, notes: 'Maximum weight' },
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 4, reps: 5, rest_minutes: 3, notes: 'Heavy pressing' },
        { exercise_id: EXERCISE_IDS.PULL_UPS, sets: 4, reps: 5, rest_minutes: 3, notes: 'Weighted if possible' },
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 3, reps: 8, rest_minutes: 2, notes: 'Heavy isolation' },
        { exercise_id: EXERCISE_IDS.TRICEP_EXTENSIONS, sets: 3, reps: 8, rest_minutes: 2, notes: 'Peak strength' }
      ]
    }
  ]
};

/**
 * Test Program - Simple 2-week program for testing
 * Used for general testing and demonstration purposes
 */
export const testProgram = {
  program: {
    name: 'Test Program',
    description: 'A simple test program for development and testing purposes',
    duration: 2,
    days_per_week: 3,
    weight_unit: 'LB',
    difficulty: 'beginner',
    goals: ['Build Muscle'],
    equipment: ['Dumbbells'],
    is_template: false,
    is_current: false,
    is_active: true
  },
  workouts: [
    {
      week_number: 1,
      day_number: 1,
      name: 'Test Day 1',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 3, reps: 10, rest_minutes: 2, notes: 'Basic push-ups' },
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 10, rest_minutes: 2, notes: 'Bodyweight squats' },
        { exercise_id: EXERCISE_IDS.PLANK, sets: 2, reps: 30, rest_minutes: 1, notes: '30 second hold' }
      ]
    },
    {
      week_number: 1,
      day_number: 2,
      name: 'Test Day 2',
      exercises: [
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 3, reps: 12, rest_minutes: 1, notes: 'Light weight' },
        { exercise_id: EXERCISE_IDS.LUNGES, sets: 3, reps: 8, rest_minutes: 2, notes: '8 per leg' },
        { exercise_id: EXERCISE_IDS.CRUNCHES, sets: 3, reps: 15, rest_minutes: 1, notes: 'Slow and controlled' }
      ]
    },
    {
      week_number: 1,
      day_number: 3,
      name: 'Test Day 3',
      exercises: [
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 3, reps: 8, rest_minutes: 2, notes: 'Light dumbbells' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 3, reps: 10, rest_minutes: 2, notes: 'Focus on form' },
        { exercise_id: EXERCISE_IDS.MOUNTAIN_CLIMBERS, sets: 2, reps: 20, rest_minutes: 1, notes: '10 per leg' }
      ]
    },
    {
      week_number: 2,
      day_number: 1,
      name: 'Test Day 1 - Week 2',
      exercises: [
        { exercise_id: EXERCISE_IDS.PUSH_UPS, sets: 3, reps: 12, rest_minutes: 2, notes: 'Increase reps' },
        { exercise_id: EXERCISE_IDS.SQUAT, sets: 3, reps: 12, rest_minutes: 2, notes: 'Add light weight' },
        { exercise_id: EXERCISE_IDS.PLANK, sets: 3, reps: 35, rest_minutes: 1, notes: '35 second hold' }
      ]
    },
    {
      week_number: 2,
      day_number: 2,
      name: 'Test Day 2 - Week 2',
      exercises: [
        { exercise_id: EXERCISE_IDS.BICEP_CURLS, sets: 3, reps: 15, rest_minutes: 1, notes: 'Increase reps' },
        { exercise_id: EXERCISE_IDS.LUNGES, sets: 3, reps: 10, rest_minutes: 2, notes: '10 per leg' },
        { exercise_id: EXERCISE_IDS.CRUNCHES, sets: 3, reps: 20, rest_minutes: 1, notes: 'More reps' }
      ]
    },
    {
      week_number: 2,
      day_number: 3,
      name: 'Test Day 3 - Week 2',
      exercises: [
        { exercise_id: EXERCISE_IDS.OVERHEAD_PRESS, sets: 3, reps: 10, rest_minutes: 2, notes: 'Slight weight increase' },
        { exercise_id: EXERCISE_IDS.BENT_OVER_ROW, sets: 3, reps: 12, rest_minutes: 2, notes: 'Perfect form' },
        { exercise_id: EXERCISE_IDS.MOUNTAIN_CLIMBERS, sets: 3, reps: 24, rest_minutes: 1, notes: '12 per leg' }
      ]
    }
  ]
};

/**
 * Get sample program data based on user experience level
 * @param {string} experienceLevel - 'beginner', 'intermediate', or 'test'
 * @returns {Object} Program data object with program and workouts
 */
export const getSampleProgramData = (experienceLevel) => {
  switch (experienceLevel) {
    case 'beginner':
      return beginnerProgram;
    case 'intermediate':
      return intermediateProgram;
    case 'test':
    default:
      return testProgram;
  }
};

/**
 * Get all available sample programs
 * @returns {Array} Array of all sample program data
 */
export const getAllSamplePrograms = () => {
  return [beginnerProgram, intermediateProgram, testProgram];
};