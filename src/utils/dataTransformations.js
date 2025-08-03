/**
 * Data transformation utilities for converting between Firebase and Supabase formats
 * Used during the migration from Firebase to Supabase
 */

import { parseWeeklyConfigs } from './programUtils';

/**
 * Transform Supabase program structure to weekly_configs format
 * Converts normalized database structure (program_workouts and program_exercises) 
 * to the flattened weekly_configs format expected by the frontend
 * @param {Object} program - Supabase program object with program_workouts and program_exercises
 * @returns {Object} Program object with computed weekly_configs field
 */
export const transformSupabaseProgramToWeeklyConfigs = (program) => {
  const startTime = performance.now();

  // Handle missing or invalid program data
  if (!program || typeof program !== 'object') {
    console.error('❌ [DATA_TRANSFORM] Invalid program object provided:', {
      program,
      type: typeof program,
      isNull: program === null,
      isUndefined: program === undefined
    });
    return { ...program, weekly_configs: {} };
  }

  // Handle programs without workout data gracefully
  if (!program.program_workouts || !Array.isArray(program.program_workouts)) {
    console.warn('⚠️ [DATA_TRANSFORM] No program_workouts found for program:', {
      programId: program.id,
      programName: program.name,
      hasWorkouts: !!program.program_workouts,
      workoutsType: typeof program.program_workouts,
      isArray: Array.isArray(program.program_workouts)
    });
    return { ...program, weekly_configs: {} };
  }

  // Validate program structure
  if (!program.duration || !program.days_per_week || program.duration < 1 || program.days_per_week < 1) {
    console.error('❌ [DATA_TRANSFORM] Invalid program duration or days_per_week:', {
      programId: program.id,
      programName: program.name,
      duration: program.duration,
      days_per_week: program.days_per_week,
      durationValid: program.duration >= 1,
      daysPerWeekValid: program.days_per_week >= 1
    });
    return { ...program, weekly_configs: {} };
  }

  try {
    const weekly_configs = {};
    let processedWorkouts = 0;
    let skippedWorkouts = 0;
    let totalExercises = 0;

    // Transform each workout to the expected flattened format
    program.program_workouts.forEach((workout, index) => {
      // Validate workout structure
      if (!workout || typeof workout !== 'object') {
        console.error('❌ [DATA_TRANSFORM] Invalid workout object:', {
          workout,
          index,
          type: typeof workout
        });
        skippedWorkouts++;
        return;
      }

      const weekNumber = workout.week_number;
      const dayNumber = workout.day_number;

      // Validate week and day numbers
      if (!weekNumber || !dayNumber || 
          weekNumber < 1 || dayNumber < 1 ||
          weekNumber > program.duration || dayNumber > program.days_per_week) {
        console.error('❌ [DATA_TRANSFORM] Invalid week or day number:', {
          workoutId: workout.id,
          weekNumber,
          dayNumber,
          programDuration: program.duration,
          programDaysPerWeek: program.days_per_week,
          weekValid: weekNumber >= 1 && weekNumber <= program.duration,
          dayValid: dayNumber >= 1 && dayNumber <= program.days_per_week
        });
        skippedWorkouts++;
        return;
      }

      // Create the flattened key format expected by parseWeeklyConfigs
      const key = `week${weekNumber}_day${dayNumber}`;

      // Transform exercises with proper error handling
      let exercises = [];
      if (workout.program_exercises && Array.isArray(workout.program_exercises)) {        
        const validExercises = workout.program_exercises.filter(ex => ex !== null && typeof ex === 'object');
        const invalidExercises = workout.program_exercises.length - validExercises.length;
        
        if (invalidExercises > 0) {
          console.warn(`⚠️ [DATA_TRANSFORM] Found ${invalidExercises} invalid exercises in workout ${key}`);
        }

        exercises = validExercises
          .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)) // Sort by order_index
          .map((ex, exIndex) => {
            const transformedExercise = {
              exerciseId: ex.exercise_id || '',
              sets: typeof ex.sets === 'number' ? ex.sets : 3,
              reps: typeof ex.reps === 'number' ? ex.reps : 8,
              notes: ex.notes || ''
            };
            
            return transformedExercise;
          });
        
        totalExercises += exercises.length;
      } else {
        console.warn(`⚠️ [DATA_TRANSFORM] No exercises found for workout ${key}:`, {
          hasExercises: !!workout.program_exercises,
          exercisesType: typeof workout.program_exercises,
          isArray: Array.isArray(workout.program_exercises)
        });
      }

      // Create the day object in the expected format
      weekly_configs[key] = {
        name: workout.name || `Day ${dayNumber}`,
        exercises: exercises
      };

      processedWorkouts++;
    });

    const endTime = performance.now();
    const transformationTime = endTime - startTime;

    return {
      ...program,
      weekly_configs: weekly_configs
    };

  } catch (error) {
    const endTime = performance.now();
    const transformationTime = endTime - startTime;
    
    console.error('💥 [DATA_TRANSFORM] Error transforming program data:', {
      error: error.message,
      programId: program.id,
      programName: program.name,
      stack: error.stack,
      transformationTimeMs: Math.round(transformationTime * 100) / 100,
      success: false
    });
    
    // Return program with empty weekly_configs on error to prevent crashes
    return { ...program, weekly_configs: {} };
  }
};

/**
 * Transform Supabase exercise data to match expected component structure
 * @param {Array} exercises - Array of Supabase exercise objects
 * @returns {Array} Transformed exercises array
 */
export const transformSupabaseExercises = (exercises) => {
  return exercises.map(ex => ({
    id: ex.id,
    name: ex.name,
    primaryMuscleGroup: ex.primary_muscle_group,
    exerciseType: ex.exercise_type,
    description: ex.description,
    instructions: ex.instructions,
    isGlobal: ex.is_global,
    source: ex.is_global ? 'global' : 'custom',
    createdBy: ex.created_by,
    created_at: ex.created_at,
    updated_at: ex.updated_at
  }));
};

/**
 * Transform workout log exercise data to Supabase format
 * @param {Array} exerciseData - Array of exercise data from component state
 * @returns {Array} Transformed exercises for Supabase
 */
export const transformExercisesToSupabaseFormat = (exerciseData) => {
  return exerciseData.map(ex => ({
    exerciseId: ex.exerciseId,
    sets: Number(ex.sets),
    reps: ex.reps.map(rep => rep === '' || rep === null || rep === undefined ? null : Number(rep)),
    weights: ex.weights.map(weight => weight === '' || weight === null || weight === undefined ? null : Number(weight)),
    completed: ex.completed,
    notes: ex.notes || '',
    bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null,
    // Include added exercise metadata
    isAdded: ex.isAdded || false,
    addedType: ex.addedType || null,
    originalIndex: ex.originalIndex || -1
  }));
};

/**
 * Transform Supabase workout log data to component format
 * @param {Array} workoutLogs - Array of Supabase workout log objects
 * @returns {Object} Transformed logs map keyed by "week_day"
 */
export const transformSupabaseWorkoutLogs = (workoutLogs) => {
  const logsMap = {};
  
  workoutLogs.forEach(log => {
    const key = `${log.week_index}_${log.day_index}`;
    logsMap[key] = {
      exercises: log.workout_log_exercises.map(ex => ({
        exerciseId: ex.exercise_id,
        sets: ex.sets,
        reps: ex.reps ? ex.reps.map(rep => rep === null ? '' : rep) : Array(ex.sets).fill(''),
        weights: ex.weights ? ex.weights.map(weight => weight === null ? '' : weight) : Array(ex.sets).fill(''),
        completed: ex.completed || Array(ex.sets).fill(false),
        notes: ex.notes || '',
        bodyweight: ex.bodyweight || '',
        // Preserve added exercise metadata
        isAdded: ex.is_added || false,
        addedType: ex.added_type || null,
        originalIndex: ex.original_index || -1
      })),
      isWorkoutFinished: log.is_finished || false
    };
  });
  
  return logsMap;
};

/**
 * Create workout data object for Supabase service
 * @param {Object} params - Parameters object
 * @param {Object} params.program - Program object
 * @param {number} params.weekIndex - Week index (0-based)
 * @param {number} params.dayIndex - Day index (0-based)
 * @param {Array} params.exercises - Transformed exercises array
 * @param {boolean} params.isFinished - Whether workout is finished
 * @param {Date} params.completedDate - Completion date (optional)
 * @returns {Object} Workout data object for Supabase
 */
export const createWorkoutDataForSupabase = ({ 
  program, 
  weekIndex, 
  dayIndex, 
  exercises, 
  isFinished = false, 
  completedDate = null 
}) => {
  const workoutData = {
    programId: program.id,
    weekIndex: weekIndex,
    dayIndex: dayIndex,
    name: `${program.name} - Week ${weekIndex + 1}, Day ${dayIndex + 1}`,
    type: 'program_workout',
    date: new Date().toISOString().split('T')[0],
    isFinished: isFinished,
    isDraft: false,
    weightUnit: 'LB',
    exercises: exercises
  };

  if (completedDate) {
    workoutData.completedDate = completedDate;
  }

  return workoutData;
};

/**
 * Validate exercise data before transformation
 * @param {Array} exerciseData - Exercise data to validate
 * @returns {boolean} Whether data is valid
 */
export const validateExerciseData = (exerciseData) => {
  if (!Array.isArray(exerciseData)) {
    return false;
  }

  return exerciseData.every(ex => {
    return (
      ex.exerciseId &&
      typeof ex.sets === 'number' &&
      Array.isArray(ex.reps) &&
      Array.isArray(ex.weights) &&
      Array.isArray(ex.completed)
    );
  });
};

/**
 * Ensure backward compatibility during migration
 * Handles both Firebase and Supabase data formats
 * @param {Object} data - Data object that might be in either format
 * @param {string} type - Type of data ('program', 'exercise', 'workoutLog')
 * @returns {Object} Normalized data object
 */
export const ensureBackwardCompatibility = (data, type) => {
  if (!data) return data;

  switch (type) {
    case 'program':
      // Handle both Firebase weekly_configs and Supabase program_workouts
      if (data.program_workouts && !data.weekly_configs) {
        // New Supabase format - transform to weekly_configs first, then parse
        const transformedData = transformSupabaseProgramToWeeklyConfigs(data);
        data.weekly_configs = transformedData.weekly_configs;
        data.weeklyConfigs = parseWeeklyConfigs(data.weekly_configs, data.duration, data.days_per_week);
      } else if (data.weekly_configs && !data.weeklyConfigs) {
        // Legacy Firebase format or existing weekly_configs - parse them
        data.weeklyConfigs = parseWeeklyConfigs(data.weekly_configs, data.duration, data.days_per_week);
      }
      break;

    case 'exercise':
      // Handle both Firebase and Supabase exercise formats
      if (data.primary_muscle_group && !data.primaryMuscleGroup) {
        data.primaryMuscleGroup = data.primary_muscle_group;
      }
      if (data.exercise_type && !data.exerciseType) {
        data.exerciseType = data.exercise_type;
      }
      if (data.is_global !== undefined && data.isGlobal === undefined) {
        data.isGlobal = data.is_global;
      }
      break;

    case 'workoutLog':
      // Handle both Firebase and Supabase workout log formats
      if (data.is_finished !== undefined && data.isWorkoutFinished === undefined) {
        data.isWorkoutFinished = data.is_finished;
      }
      if (data.week_index !== undefined && data.weekIndex === undefined) {
        data.weekIndex = data.week_index;
      }
      if (data.day_index !== undefined && data.dayIndex === undefined) {
        data.dayIndex = data.day_index;
      }
      break;

    default:
      break;
  }

  return data;
};