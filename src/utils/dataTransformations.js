/**
 * Data transformation utilities for converting between Firebase and Supabase formats
 * Used during the migration from Firebase to Supabase
 */

import { parseWeeklyConfigs } from './programUtils';

/**
 * Transform Supabase program structure to weeklyConfigs format
 * @param {Object} program - Supabase program object
 * @returns {Array} weeklyConfigs array
 */
export const transformSupabaseProgramToWeeklyConfigs = (program) => {
  if (!program.program_workouts || !program.duration || !program.days_per_week) {
    return [];
  }

  // Initialize the nested structure
  const weeklyConfigs = Array.from({ length: program.duration }, () =>
    Array.from({ length: program.days_per_week }, () => ({ name: undefined, exercises: [] }))
  );

  // Transform program_workouts to weeklyConfigs format
  program.program_workouts.forEach(workout => {
    const weekIndex = workout.week_number - 1;
    const dayIndex = workout.day_number - 1;

    if (weekIndex >= 0 && weekIndex < program.duration && 
        dayIndex >= 0 && dayIndex < program.days_per_week) {
      
      weeklyConfigs[weekIndex][dayIndex] = {
        name: workout.name || `Day ${dayIndex + 1}`,
        exercises: workout.program_exercises ? workout.program_exercises.map(ex => ({
          exerciseId: ex.exercise_id,
          sets: ex.sets || 3,
          reps: ex.reps || 8,
          notes: ex.notes || ''
        })) : []
      };
    }
  });

  return weeklyConfigs;
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
    reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
    weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
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
        reps: ex.reps || Array(ex.sets).fill(0),
        weights: ex.weights || Array(ex.sets).fill(''),
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
      if (data.weekly_configs && !data.weeklyConfigs) {
        // Legacy Firebase format - parse the weekly_configs
        data.weeklyConfigs = parseWeeklyConfigs(data.weekly_configs, data.duration, data.days_per_week);
      } else if (data.program_workouts && !data.weeklyConfigs) {
        // New Supabase format - transform to weeklyConfigs
        data.weeklyConfigs = transformSupabaseProgramToWeeklyConfigs(data);
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