/**
 * Enhanced Error Handling for Add Exercise Functionality
 * 
 * Provides specific error handling, validation, and recovery mechanisms
 * for the add exercise feature in LogWorkout component.
 */

// Error types specific to add exercise functionality
export const ADD_EXERCISE_ERROR_TYPES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PARTIAL_FAILURE: 'PARTIAL_FAILURE',
  PROGRAM_UPDATE_FAILED: 'PROGRAM_UPDATE_FAILED',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  CONCURRENT_OPERATION: 'CONCURRENT_OPERATION',
  INVALID_EXERCISE_TYPE: 'INVALID_EXERCISE_TYPE',
  PERMISSION_DENIED: 'PERMISSION_DENIED'
};

// Recovery strategies for different error types
export const RECOVERY_STRATEGIES = {
  RETRY: 'RETRY',
  FALLBACK_TO_TEMPORARY: 'FALLBACK_TO_TEMPORARY',
  MANUAL_INTERVENTION: 'MANUAL_INTERVENTION',
  SKIP_OPERATION: 'SKIP_OPERATION'
};

/**
 * Validate exercise addition parameters
 * @param {Object} exercise - Exercise object to validate
 * @param {string} type - Addition type ('temporary' or 'permanent')
 * @param {Object} selectedProgram - Currently selected program
 * @param {boolean} isAddingExercise - Current operation state
 * @returns {Object} Validation result with isValid and errors
 */
export const validateAddExerciseParams = (exercise, type, selectedProgram, isAddingExercise) => {
  const errors = [];
  
  // Check if operation is already in progress
  if (isAddingExercise) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.CONCURRENT_OPERATION,
      message: 'Another exercise addition is already in progress. Please wait for it to complete.',
      userMessage: 'Please wait for the current operation to complete before adding another exercise.',
      recoveryStrategy: RECOVERY_STRATEGIES.SKIP_OPERATION
    });
  }
  
  // Validate exercise object
  if (!exercise) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
      message: 'No exercise selected',
      userMessage: 'Please select an exercise to add to your workout.',
      recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
    });
  } else {
    // Validate exercise has required properties
    if (!exercise.id) {
      errors.push({
        type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
        message: 'Exercise missing required ID',
        userMessage: 'The selected exercise is invalid. Please try selecting a different exercise.',
        recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
      });
    }
    
    if (!exercise.name) {
      errors.push({
        type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
        message: 'Exercise missing name',
        userMessage: 'The selected exercise is missing required information. Please try selecting a different exercise.',
        recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
      });
    }
    
    // Validate exercise type
    const validExerciseTypes = ['Dumbbell', 'Barbell', 'Cable', 'Trap Bar', 'Safety Squat Bar',
    'Bodyweight', 'Bodyweight Loadable', 'Swiss Bar', 'Kettlebell',
    'Machine', 'Smith Machine', 'Camber Bar', 'Bands'];
    if (exercise.exerciseType && !validExerciseTypes.includes(exercise.exerciseType)) {
      errors.push({
        type: ADD_EXERCISE_ERROR_TYPES.INVALID_EXERCISE_TYPE,
        message: `Invalid exercise type: ${exercise.exerciseType}`,
        userMessage: 'This exercise type is not supported. Please select a different exercise.',
        recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
      });
    }
  }
  
  // Validate addition type
  if (!type || !['temporary', 'permanent'].includes(type)) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
      message: `Invalid addition type: ${type}`,
      userMessage: 'Please select whether to add this exercise temporarily or permanently.',
      recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
    });
  }
  
  // Validate selected program for permanent additions
  if (type === 'permanent') {
    if (!selectedProgram) {
      errors.push({
        type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
        message: 'No program selected for permanent addition',
        userMessage: 'A program must be selected to add exercises permanently.',
        recoveryStrategy: RECOVERY_STRATEGIES.FALLBACK_TO_TEMPORARY
      });
    } else if (!selectedProgram.id) {
      errors.push({
        type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
        message: 'Selected program missing ID',
        userMessage: 'The selected program is invalid. The exercise will be added temporarily instead.',
        recoveryStrategy: RECOVERY_STRATEGIES.FALLBACK_TO_TEMPORARY
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Create enhanced error information for add exercise operations
 * @param {Error} error - Original error object
 * @param {string} operation - Operation that failed ('add_exercise', 'update_program', 'remove_exercise')
 * @param {Object} context - Additional context information
 * @returns {Object} Enhanced error information
 */
export const createAddExerciseError = (error, operation, context = {}) => {
  const timestamp = new Date().toISOString();
  
  // Determine error type based on error message and context
  let errorType = ADD_EXERCISE_ERROR_TYPES.NETWORK_ERROR;
  let userMessage = 'An unexpected error occurred. Please try again.';
  let recoveryStrategy = RECOVERY_STRATEGIES.RETRY;
  
  if (error.message.includes('not found') || error.message.includes('does not exist')) {
    errorType = ADD_EXERCISE_ERROR_TYPES.DOCUMENT_NOT_FOUND;
    userMessage = 'The program could not be found. Please refresh the page and try again.';
    recoveryStrategy = RECOVERY_STRATEGIES.MANUAL_INTERVENTION;
  } else if (error.message.includes('permission') || error.message.includes('unauthorized')) {
    errorType = ADD_EXERCISE_ERROR_TYPES.PERMISSION_DENIED;
    userMessage = 'You do not have permission to modify this program. Please check your access rights.';
    recoveryStrategy = RECOVERY_STRATEGIES.MANUAL_INTERVENTION;
  } else if (error.message.includes('network') || error.message.includes('fetch')) {
    errorType = ADD_EXERCISE_ERROR_TYPES.NETWORK_ERROR;
    userMessage = 'Network connection failed. Please check your internet connection and try again.';
    recoveryStrategy = RECOVERY_STRATEGIES.RETRY;
  } else if (operation === 'update_program' && context.addedToWorkout) {
    errorType = ADD_EXERCISE_ERROR_TYPES.PARTIAL_FAILURE;
    userMessage = 'The exercise was added to your current workout but could not be saved to the program. It will only appear in this session.';
    recoveryStrategy = RECOVERY_STRATEGIES.FALLBACK_TO_TEMPORARY;
  }
  
  return {
    timestamp,
    operation,
    errorType,
    originalError: error,
    message: error.message,
    userMessage,
    recoveryStrategy,
    context,
    stack: error.stack
  };
};

/**
 * Handle add exercise errors with appropriate user feedback and recovery
 * @param {Object} errorInfo - Enhanced error information from createAddExerciseError
 * @param {Function} showUserMessage - Function to display messages to user
 * @param {Object} recoveryOptions - Available recovery options
 * @returns {Object} Recovery action to take
 */
export const handleAddExerciseError = (errorInfo, showUserMessage, recoveryOptions = {}) => {
  // Log detailed error information for debugging
  console.group(`🚨 Add Exercise Error [${errorInfo.errorType}]`);
  console.error(`Operation: ${errorInfo.operation}`);
  console.error(`Time: ${errorInfo.timestamp}`);
  console.error(`Message: ${errorInfo.message}`);
  console.error(`User Message: ${errorInfo.userMessage}`);
  console.error(`Recovery Strategy: ${errorInfo.recoveryStrategy}`);
  
  if (errorInfo.context && Object.keys(errorInfo.context).length > 0) {
    console.error('Context:', errorInfo.context);
  }
  
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack trace:', errorInfo.stack);
  }
  
  console.groupEnd();
  
  // Show user-friendly message
  showUserMessage(errorInfo.userMessage, 'error');
  
  // Determine recovery action based on strategy
  const recoveryAction = {
    strategy: errorInfo.recoveryStrategy,
    shouldRetry: false,
    fallbackToTemporary: false,
    requiresManualIntervention: false
  };
  
  switch (errorInfo.recoveryStrategy) {
    case RECOVERY_STRATEGIES.RETRY:
      if (recoveryOptions.canRetry !== false) {
        recoveryAction.shouldRetry = true;
        showUserMessage('Retrying operation...', 'info');
      }
      break;
      
    case RECOVERY_STRATEGIES.FALLBACK_TO_TEMPORARY:
      if (recoveryOptions.canFallbackToTemporary !== false) {
        recoveryAction.fallbackToTemporary = true;
        showUserMessage('Falling back to temporary addition...', 'warning');
      }
      break;
      
    case RECOVERY_STRATEGIES.MANUAL_INTERVENTION:
      recoveryAction.requiresManualIntervention = true;
      break;
      
    case RECOVERY_STRATEGIES.SKIP_OPERATION:
      // Do nothing, operation is skipped
      break;
  }
  
  return recoveryAction;
};

/**
 * Attempt to recover from permanent exercise addition failure
 * @param {Object} exercise - Exercise that failed to be added permanently
 * @param {Object} context - Context information about the failure
 * @param {Function} addTemporaryExercise - Function to add exercise temporarily
 * @returns {Promise<boolean>} True if recovery was successful
 */
export const attemptPermanentAdditionRecovery = async (exercise, context, addTemporaryExercise) => {
  console.log('🔄 Attempting recovery from permanent addition failure...');
  
  try {
    // Try to add the exercise temporarily as a fallback
    await addTemporaryExercise(exercise);
    console.log('✅ Successfully recovered by adding exercise temporarily');
    return true;
  } catch (recoveryError) {
    console.error('❌ Recovery attempt failed:', recoveryError);
    return false;
  }
};

/**
 * Validate program structure for exercise addition
 * @param {Object} program - Program object to validate
 * @param {number} weekIndex - Week index for addition
 * @param {number} dayIndex - Day index for addition
 * @returns {Object} Validation result
 */
export const validateProgramStructure = (program, weekIndex, dayIndex) => {
  const errors = [];
  
  if (!program) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
      message: 'Program is null or undefined',
      userMessage: 'No program is currently selected.',
      recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
    });
    return { isValid: false, errors };
  }
  
  if (!program.weeklyConfigs) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
      message: 'Program missing weeklyConfigs',
      userMessage: 'The program structure is invalid.',
      recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
    });
  }
  
  // Validate week and day indices
  if (weekIndex < 0 || weekIndex >= (program.duration || 0)) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
      message: `Invalid week index: ${weekIndex}`,
      userMessage: 'The selected week is invalid.',
      recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
    });
  }
  
  if (dayIndex < 0 || dayIndex >= (program.daysPerWeek || 0)) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
      message: `Invalid day index: ${dayIndex}`,
      userMessage: 'The selected day is invalid.',
      recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Create user-friendly error messages with actionable guidance
 * @param {string} errorType - Type of error from ADD_EXERCISE_ERROR_TYPES
 * @param {Object} context - Additional context for the error
 * @returns {Object} User message information
 */
export const createUserFriendlyErrorMessage = (errorType, context = {}) => {
  const messages = {
    [ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR]: {
      title: 'Invalid Input',
      message: 'Please check your selection and try again.',
      actions: ['Select a valid exercise', 'Choose temporary or permanent option']
    },
    [ADD_EXERCISE_ERROR_TYPES.NETWORK_ERROR]: {
      title: 'Connection Error',
      message: 'Unable to connect to the server. Please check your internet connection.',
      actions: ['Check your internet connection', 'Try again in a few moments']
    },
    [ADD_EXERCISE_ERROR_TYPES.PARTIAL_FAILURE]: {
      title: 'Partial Success',
      message: 'The exercise was added to your current workout but could not be saved permanently.',
      actions: ['Continue with temporary addition', 'Try adding permanently again later']
    },
    [ADD_EXERCISE_ERROR_TYPES.PROGRAM_UPDATE_FAILED]: {
      title: 'Program Update Failed',
      message: 'Unable to update the program structure. The exercise was added temporarily.',
      actions: ['Continue with current workout', 'Try refreshing the page']
    },
    [ADD_EXERCISE_ERROR_TYPES.DOCUMENT_NOT_FOUND]: {
      title: 'Program Not Found',
      message: 'The program could not be found. Please refresh the page.',
      actions: ['Refresh the page', 'Select a different program']
    },
    [ADD_EXERCISE_ERROR_TYPES.CONCURRENT_OPERATION]: {
      title: 'Operation in Progress',
      message: 'Please wait for the current operation to complete.',
      actions: ['Wait for current operation to finish', 'Try again in a moment']
    },
    [ADD_EXERCISE_ERROR_TYPES.INVALID_EXERCISE_TYPE]: {
      title: 'Unsupported Exercise',
      message: 'This exercise type is not currently supported.',
      actions: ['Select a different exercise', 'Contact support if this persists']
    },
    [ADD_EXERCISE_ERROR_TYPES.PERMISSION_DENIED]: {
      title: 'Access Denied',
      message: 'You do not have permission to modify this program.',
      actions: ['Check your account permissions', 'Contact the program owner']
    }
  };
  
  const defaultMessage = {
    title: 'Unexpected Error',
    message: 'An unexpected error occurred. Please try again.',
    actions: ['Try the operation again', 'Refresh the page if the problem persists']
  };
  
  return messages[errorType] || defaultMessage;
};

/**
 * Monitor and log add exercise operations for debugging
 * @param {string} operation - Operation being performed
 * @param {Object} data - Operation data
 * @param {boolean} success - Whether operation was successful
 * @param {Error} error - Error if operation failed
 */
export const logAddExerciseOperation = (operation, data, success, error = null) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    success,
    data: {
      exerciseId: data.exercise?.id,
      exerciseName: data.exercise?.name,
      additionType: data.type,
      programId: data.program?.id || data.programId,
      weekIndex: data.weekIndex,
      dayIndex: data.dayIndex,
      // Additional debugging context
      exerciseType: data.exercise?.exerciseType,
      isAddingExercise: data.isAddingExercise,
      currentLogDataLength: data.currentLogDataLength,
      userAgent: navigator.userAgent,
      timestamp: Date.now()
    }
  };
  
  if (error) {
    logEntry.error = {
      message: error.message,
      type: error.constructor.name,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      code: error.code,
      // Additional error context
      cause: error.cause,
      fileName: error.fileName,
      lineNumber: error.lineNumber,
      columnNumber: error.columnNumber
    };
  }
  
  const logLevel = success ? 'log' : 'error';
  const emoji = success ? '✅' : '❌';
  
  // Enhanced console logging with grouping
  console.group(`${emoji} Add Exercise Operation: ${operation}`);
  console[logLevel]('Operation Details:', {
    operation,
    success,
    timestamp: logEntry.timestamp,
    duration: data.duration ? `${data.duration}ms` : 'N/A'
  });
  
  if (logEntry.data && Object.keys(logEntry.data).length > 0) {
    console[logLevel]('Data:', logEntry.data);
  }
  
  if (error) {
    console.error('Error Details:', logEntry.error);
    
    // Log stack trace in development
    if (process.env.NODE_ENV === 'development' && error.stack) {
      console.error('Stack Trace:', error.stack);
    }
  }
  
  console.groupEnd();
  
  // Store operation log for debugging with enhanced data
  try {
    const existingLogs = JSON.parse(sessionStorage.getItem('add_exercise_logs') || '[]');
    existingLogs.push(logEntry);
    
    // Keep only last 100 operations (increased from 50)
    const recentLogs = existingLogs.slice(-100);
    sessionStorage.setItem('add_exercise_logs', JSON.stringify(recentLogs));
    
    // Also store in a separate detailed log for development
    if (process.env.NODE_ENV === 'development') {
      const detailedLogs = JSON.parse(sessionStorage.getItem('add_exercise_detailed_logs') || '[]');
      detailedLogs.push({
        ...logEntry,
        memoryUsage: performance.memory ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit
        } : null,
        performanceNow: performance.now(),
        url: window.location.href,
        referrer: document.referrer
      });
      
      // Keep only last 50 detailed operations
      const recentDetailedLogs = detailedLogs.slice(-50);
      sessionStorage.setItem('add_exercise_detailed_logs', JSON.stringify(recentDetailedLogs));
    }
  } catch (storageError) {
    console.warn('Failed to store operation log:', storageError);
  }
};

/**
 * Get stored add exercise operation logs for debugging
 * @returns {Array} Array of operation log entries
 */
export const getAddExerciseOperationLogs = () => {
  try {
    return JSON.parse(sessionStorage.getItem('add_exercise_logs') || '[]');
  } catch (error) {
    console.warn('Failed to retrieve operation logs:', error);
    return [];
  }
};

/**
 * Validate exercise removal parameters
 * @param {Object} exercise - Exercise object to validate for removal
 * @param {boolean} isWorkoutFinished - Whether the workout is finished
 * @returns {Object} Validation result with isValid and errors
 */
export const validateRemoveExerciseParams = (exercise, isWorkoutFinished) => {
  const errors = [];
  
  // Check if workout is finished
  if (isWorkoutFinished) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
      message: 'Cannot remove exercises from finished workout',
      userMessage: 'Cannot remove exercises from a finished workout.',
      recoveryStrategy: RECOVERY_STRATEGIES.SKIP_OPERATION
    });
  }
  
  // Validate exercise object
  if (!exercise) {
    errors.push({
      type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
      message: 'Exercise is required for removal',
      userMessage: 'No exercise selected for removal.',
      recoveryStrategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION
    });
  } else {
    // Check if exercise is an added exercise
    if (!exercise.isAdded) {
      errors.push({
        type: ADD_EXERCISE_ERROR_TYPES.VALIDATION_ERROR,
        message: 'Only added exercises can be removed',
        userMessage: 'Only exercises that were added to this workout can be removed.',
        recoveryStrategy: RECOVERY_STRATEGIES.SKIP_OPERATION
      });
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Clear stored add exercise operation logs
 */
export const clearAddExerciseOperationLogs = () => {
  try {
    sessionStorage.removeItem('add_exercise_logs');
    console.log('🧹 Cleared add exercise operation logs');
  } catch (error) {
    console.warn('Failed to clear operation logs:', error);
  }
};