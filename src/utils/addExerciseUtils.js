/**
 * Utility functions for add exercise functionality
 * Extracted from LogWorkout component for better testability
 */

import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { getDocCached, invalidateProgramCache } from '../api/enhancedFirestoreCache';

/**
 * Creates a new exercise object with default values
 * @param {Object} exercise - The exercise to add
 * @param {string} type - 'temporary' or 'permanent'
 * @param {number} originalIndex - The index where the exercise will be added
 * @returns {Object} New exercise object
 */
export const createNewExerciseObject = (exercise, type, originalIndex) => {
  if (!exercise || !exercise.id) {
    throw new Error('Exercise is required and must have an id');
  }

  if (!type || !['temporary', 'permanent'].includes(type)) {
    throw new Error('Type must be either "temporary" or "permanent"');
  }

  const isBodyweightType = ['Bodyweight', 'Bodyweight Loadable'].includes(exercise.exerciseType);

  return {
    exerciseId: exercise.id,
    sets: 3, // Default sets
    reps: Array(3).fill(''),
    weights: Array(3).fill(''),
    completed: Array(3).fill(false),
    notes: '',
    bodyweight: isBodyweightType ? '' : '',
    isAdded: true,
    addedType: type,
    originalIndex: originalIndex
  };
};

/**
 * Updates program structure with new exercise (Enhanced with error handling)
 * @param {string} programId - Program document ID
 * @param {Object} exercise - Exercise to add
 * @param {number} selectedWeek - Week index (0-based)
 * @param {number} selectedDay - Day index (0-based)
 * @param {Object} options - Additional options for error handling
 * @returns {Promise<void>}
 */
export const updateProgramWithExercise = async (programId, exercise, selectedWeek, selectedDay, options = {}) => {
  const operationId = `update_program_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const operationContext = {
    programId,
    exercise,
    selectedWeek,
    selectedDay,
    timestamp: new Date().toISOString(),
    operationId
  };

  // Enhanced validation with logging
  const validationErrors = [];
  
  if (!programId) {
    validationErrors.push('Program ID is required');
  }
  if (!exercise || !exercise.id) {
    validationErrors.push('Exercise is required and must have an id');
  }
  if (selectedWeek < 0 || selectedDay < 0) {
    validationErrors.push('Week and day indices must be non-negative');
  }

  if (validationErrors.length > 0) {
    const error = new Error(validationErrors.join(', '));
    throw error;
  }

  try {
    // Get the latest program document with retry mechanism
    let programDoc;
    let retryCount = 0;
    const maxRetries = options.maxRetries || 3;
    
    while (retryCount < maxRetries) {
      try {
        programDoc = await getDocCached('programs', programId);
        break;
      } catch (fetchError) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw fetchError;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    if (!programDoc) {
      const error = new Error("Program document not found");
      throw error; // Throw simple error for compatibility
    }

    const currentProgramData = programDoc;

    // Try both format keys for backward compatibility
    const newFormatKey = `week${selectedWeek + 1}_day${selectedDay + 1}_exercises`;
    const oldFormatKey = `week${selectedWeek + 1}_day${selectedDay + 1}`;

    // First try new format, then fall back to old format
    let currentExercises = currentProgramData.weeklyConfigs?.[newFormatKey];
    let configKey = newFormatKey;
    let isOldFormat = false;

    if (!currentExercises) {
      // Try old format
      const oldFormatData = currentProgramData.weeklyConfigs?.[oldFormatKey];
      if (oldFormatData && oldFormatData.exercises) {
        currentExercises = oldFormatData.exercises;
        configKey = oldFormatKey;
        isOldFormat = true;
      }
    }

    if (!currentExercises) {
      const error = new Error(`No exercises found for week ${selectedWeek + 1}, day ${selectedDay + 1}. Available keys: ${Object.keys(currentProgramData.weeklyConfigs || {}).join(', ')}`);
      throw error; // Throw simple error for compatibility
    }

    // Check for duplicate exercises
    const isDuplicate = currentExercises.some(ex => ex.exerciseId === exercise.id);
    if (isDuplicate && !options.allowDuplicates) {
      const error = new Error(`Exercise ${exercise.name || exercise.id} is already in this workout`);
      throw error; // Throw simple error for compatibility
    }

    // Create new exercise entry for program
    const newProgramExercise = {
      exerciseId: exercise.id,
      sets: 3,
      reps: 8, // Default reps
      notes: ''
    };

    // Add the exercise to the existing exercises array
    const updatedExercises = [...currentExercises, newProgramExercise];

    // Update Firestore with the correct nested path based on format
    const updateData = {};
    if (isOldFormat) {
      // For old format, update the exercises array within the day object
      updateData[`weeklyConfigs.${configKey}.exercises`] = updatedExercises;
    } else {
      // For new format, update the exercises array directly
      updateData[`weeklyConfigs.${configKey}`] = updatedExercises;
    }

    await updateDoc(doc(db, "programs", programId), updateData);

    // Invalidate program cache
    const userId = currentProgramData.userId;
    if (userId) {
      invalidateProgramCache(userId);
    }
    
    console.log('Successfully added exercise to program structure');
  } catch (error) {    
    throw error; // Throw original error for compatibility
  }
};

/**
 * Removes exercise from program structure (Enhanced with error handling)
 * @param {string} programId - Program document ID
 * @param {string} exerciseId - Exercise ID to remove
 * @param {number} selectedWeek - Week index (0-based)
 * @param {number} selectedDay - Day index (0-based)
 * @param {Object} options - Additional options for error handling
 * @returns {Promise<void>}
 */
export const removeExerciseFromProgram = async (programId, exerciseId, selectedWeek, selectedDay, options = {}) => {
  const operationId = `remove_program_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const operationContext = {
    programId,
    exerciseId,
    selectedWeek,
    selectedDay,
    timestamp: new Date().toISOString(),
    operationId
  };

  // Enhanced validation with logging
  const validationErrors = [];
  
  if (!programId) {
    validationErrors.push('Program ID is required');
  }
  if (!exerciseId) {
    validationErrors.push('Exercise ID is required');
  }
  if (selectedWeek < 0 || selectedDay < 0) {
    validationErrors.push('Week and day indices must be non-negative');
  }

  if (validationErrors.length > 0) {
    const error = new Error(validationErrors.join(', '));
    throw error;
  }


  try {
    // Get the latest program document with retry mechanism
    let programDoc;
    let retryCount = 0;
    const maxRetries = options.maxRetries || 3;
    
    while (retryCount < maxRetries) {
      try {
        programDoc = await getDocCached('programs', programId);
        break;
      } catch (fetchError) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw fetchError;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    if (!programDoc) {
      const error = new Error("Program document not found");
      throw error; // Throw simple error for compatibility
    }

    const currentProgramData = programDoc;

    // Try both format keys for backward compatibility
    const newFormatKey = `week${selectedWeek + 1}_day${selectedDay + 1}_exercises`;
    const oldFormatKey = `week${selectedWeek + 1}_day${selectedDay + 1}`;

    // First try new format, then fall back to old format
    let currentExercises = currentProgramData.weeklyConfigs?.[newFormatKey];
    let configKey = newFormatKey;
    let isOldFormat = false;

    if (!currentExercises) {
      // Try old format
      const oldFormatData = currentProgramData.weeklyConfigs?.[oldFormatKey];
      if (oldFormatData && oldFormatData.exercises) {
        currentExercises = oldFormatData.exercises;
        configKey = oldFormatKey;
        isOldFormat = true;
      }
    }

    if (!currentExercises) {
      const error = new Error(`No exercises found for week ${selectedWeek + 1}, day ${selectedDay + 1}. Available keys: ${Object.keys(currentProgramData.weeklyConfigs || {}).join(', ')}`);
      throw error; // Throw simple error for compatibility
    }

    // Check if exercise exists before removal
    const exerciseExists = currentExercises.some(ex => ex.exerciseId === exerciseId);
    if (!exerciseExists) {
      const error = new Error(`Exercise ${exerciseId} not found in program structure`);
      throw error; // Throw simple error for compatibility
    }

    // Remove the exercise from the exercises array
    const updatedExercises = currentExercises.filter(ex => ex.exerciseId !== exerciseId);

    // Verify removal was successful
    if (updatedExercises.length === currentExercises.length) {
      const error = new Error(`Failed to remove exercise ${exerciseId} from program structure`);
      throw error; // Throw simple error for compatibility
    }

    // Update Firestore with the correct nested path based on format
    const updateData = {};
    if (isOldFormat) {
      // For old format, update the exercises array within the day object
      updateData[`weeklyConfigs.${configKey}.exercises`] = updatedExercises;
    } else {
      // For new format, update the exercises array directly
      updateData[`weeklyConfigs.${configKey}`] = updatedExercises;
    }

    await updateDoc(doc(db, "programs", programId), updateData);

    // Invalidate program cache
    const userId = currentProgramData.userId;
    if (userId) {
      invalidateProgramCache(userId);
    }
    
    console.log('Successfully removed exercise from program structure');
  } catch (error) {
    throw error; // Throw original error for compatibility
  }
};

/**
 * Validates exercise addition parameters
 * @param {Object} exercise - Exercise object
 * @param {Object} program - Program object
 * @param {string} type - Addition type
 * @param {boolean} isAddingExercise - Whether addition is in progress
 * @returns {Object} Validation result
 */
export const validateAddExerciseParams = (exercise, program, type, isAddingExercise) => {
  const errors = [];

  if (!exercise) {
    errors.push('Exercise is required');
  } else if (!exercise.id) {
    errors.push('Exercise must have an id');
  }

  if (!program) {
    errors.push('Program is required');
  } else if (!program.id) {
    errors.push('Program must have an id');
  }

  if (!type || !['temporary', 'permanent'].includes(type)) {
    errors.push('Type must be either "temporary" or "permanent"');
  }

  if (isAddingExercise) {
    errors.push('Exercise addition already in progress');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Validates exercise removal parameters
 * @param {Object} exercise - Exercise object to remove
 * @param {boolean} isWorkoutFinished - Whether workout is finished
 * @returns {Object} Validation result
 */
export const validateRemoveExerciseParams = (exercise, isWorkoutFinished) => {
  const errors = [];

  if (!exercise) {
    errors.push('Exercise is required');
  } else {
    if (!exercise.isAdded) {
      errors.push('Only added exercises can be removed');
    }
  }

  if (isWorkoutFinished) {
    errors.push('Cannot remove exercises from finished workout');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Updates workout log data by adding an exercise
 * @param {Array} currentLogData - Current workout log data
 * @param {Object} newExercise - New exercise to add
 * @returns {Array} Updated log data
 */
export const addExerciseToLogData = (currentLogData, newExercise) => {
  if (!Array.isArray(currentLogData)) {
    throw new Error('Current log data must be an array');
  }

  if (!newExercise) {
    throw new Error('New exercise is required');
  }

  return [...currentLogData, newExercise];
};

/**
 * Updates workout log data by removing an exercise
 * @param {Array} currentLogData - Current workout log data
 * @param {number} exerciseIndex - Index of exercise to remove
 * @returns {Array} Updated log data
 */
export const removeExerciseFromLogData = (currentLogData, exerciseIndex) => {
  if (!Array.isArray(currentLogData)) {
    throw new Error('Current log data must be an array');
  }

  if (exerciseIndex < 0 || exerciseIndex >= currentLogData.length) {
    throw new Error('Exercise index is out of bounds');
  }

  return currentLogData.filter((_, index) => index !== exerciseIndex);
};