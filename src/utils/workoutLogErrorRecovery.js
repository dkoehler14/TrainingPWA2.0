/**
 * Workout Log Error Recovery System
 * 
 * Implements automatic error recovery mechanisms including retry logic,
 * cache cleanup, data sanitization, and fallback strategies.
 */

const { 
  WorkoutLogError, 
  WorkoutLogErrorType, 
  RecoveryStrategy,
  ErrorRecoveryStrategies,
  ErrorContextCollector 
} = require('./workoutLogErrorHandler');

/**
 * Retry configuration for different error types
 */
const RETRY_CONFIG = {
  DEFAULT: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true
  },
  NETWORK: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true
  },
  CACHE: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    backoffMultiplier: 1.5,
    jitter: false
  },
  DATABASE: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 15000,
    backoffMultiplier: 2,
    jitter: true
  }
};

/**
 * Error recovery manager
 */
class ErrorRecoveryManager {
  constructor(options = {}) {
    this.options = {
      enableLogging: true,
      enableMetrics: true,
      maxConcurrentRecoveries: 5,
      ...options
    };
    
    this.activeRecoveries = new Map();
    this.recoveryStats = {
      totalAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      byStrategy: {},
      byErrorType: {}
    };
  }

  /**
   * Attempt to recover from error using appropriate strategy
   */
  async recover(error, operation, context = {}) {
    const recoveryId = this.generateRecoveryId();
    
    try {
      // Check if we're already at max concurrent recoveries
      if (this.activeRecoveries.size >= this.options.maxConcurrentRecoveries) {
        throw new WorkoutLogError(
          WorkoutLogErrorType.SERVICE_UNAVAILABLE,
          'Too many concurrent recovery operations',
          { activeRecoveries: this.activeRecoveries.size }
        );
      }

      // Track recovery attempt
      this.activeRecoveries.set(recoveryId, {
        error,
        operation,
        startTime: Date.now(),
        context
      });

      this.recoveryStats.totalAttempts++;
      
      if (this.options.enableLogging) {
        console.log('🔄 RECOVERY ATTEMPT START:', {
          recoveryId,
          errorType: error.type,
          operation,
          strategy: error.recoveryStrategy,
          context
        });
      }

      // Execute recovery strategy
      const result = await this.executeRecoveryStrategy(error, operation, context, recoveryId);
      
      // Track successful recovery
      this.recoveryStats.successfulRecoveries++;
      this.updateStrategyStats(error.recoveryStrategy, true);
      this.updateErrorTypeStats(error.type, true);
      
      if (this.options.enableLogging) {
        console.log('✅ RECOVERY SUCCESS:', {
          recoveryId,
          errorType: error.type,
          strategy: error.recoveryStrategy,
          duration: Date.now() - this.activeRecoveries.get(recoveryId).startTime
        });
      }

      return result;
    } catch (recoveryError) {
      // Track failed recovery
      this.recoveryStats.failedRecoveries++;
      this.updateStrategyStats(error.recoveryStrategy, false);
      this.updateErrorTypeStats(error.type, false);
      
      if (this.options.enableLogging) {
        console.error('❌ RECOVERY FAILED:', {
          recoveryId,
          originalError: error.type,
          recoveryError: recoveryError.message,
          duration: this.activeRecoveries.has(recoveryId) ? 
            Date.now() - this.activeRecoveries.get(recoveryId).startTime : 0
        });
      }

      throw recoveryError;
    } finally {
      // Clean up tracking
      this.activeRecoveries.delete(recoveryId);
    }
  }

  /**
   * Execute specific recovery strategy
   */
  async executeRecoveryStrategy(error, operation, context, recoveryId) {
    switch (error.recoveryStrategy) {
      case RecoveryStrategy.RETRY:
        return await this.executeRetryStrategy(error, operation, context, recoveryId);
      
      case RecoveryStrategy.CACHE_CLEANUP:
        return await this.executeCacheCleanupStrategy(error, operation, context, recoveryId);
      
      case RecoveryStrategy.DATA_SANITIZATION:
        return await this.executeDataSanitizationStrategy(error, operation, context, recoveryId);
      
      case RecoveryStrategy.FALLBACK:
        return await this.executeFallbackStrategy(error, operation, context, recoveryId);
      
      case RecoveryStrategy.USER_INTERVENTION:
        return await this.executeUserInterventionStrategy(error, operation, context, recoveryId);
      
      case RecoveryStrategy.NO_RECOVERY:
        throw new WorkoutLogError(
          WorkoutLogErrorType.UNKNOWN_ERROR,
          'Error is not recoverable',
          { originalError: error.type, recoveryId }
        );
      
      default:
        throw new WorkoutLogError(
          WorkoutLogErrorType.UNKNOWN_ERROR,
          `Unknown recovery strategy: ${error.recoveryStrategy}`,
          { originalError: error.type, recoveryId }
        );
    }
  }

  /**
   * Execute retry strategy with exponential backoff
   */
  async executeRetryStrategy(error, operation, context, recoveryId) {
    const config = this.getRetryConfig(error.type);
    let lastError = error;
    
    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        if (this.options.enableLogging) {
          console.log(`🔄 RETRY ATTEMPT ${attempt}/${config.maxRetries}:`, {
            recoveryId,
            errorType: error.type,
            operation,
            delay: attempt > 1 ? this.calculateDelay(attempt - 1, config) : 0
          });
        }

        // Wait before retry (except first attempt)
        if (attempt > 1) {
          const delay = this.calculateDelay(attempt - 1, config);
          await this.sleep(delay);
        }

        // Execute the operation again
        const result = await this.executeOperation(operation, context);
        
        if (this.options.enableLogging) {
          console.log(`✅ RETRY SUCCESS on attempt ${attempt}:`, {
            recoveryId,
            errorType: error.type,
            operation
          });
        }

        return result;
      } catch (retryError) {
        lastError = retryError;
        
        if (this.options.enableLogging) {
          console.warn(`❌ RETRY ATTEMPT ${attempt} FAILED:`, {
            recoveryId,
            errorType: error.type,
            retryError: retryError.message,
            remainingAttempts: config.maxRetries - attempt
          });
        }

        // If this was the last attempt, throw the error
        if (attempt === config.maxRetries) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.UNKNOWN_ERROR,
            `Retry strategy failed after ${config.maxRetries} attempts`,
            {
              originalError: error.type,
              lastError: lastError.message,
              recoveryId,
              attempts: attempt
            },
            lastError
          );
        }
      }
    }
  }

  /**
   * Execute cache cleanup strategy
   */
  async executeCacheCleanupStrategy(error, operation, context, recoveryId) {
    try {
      if (this.options.enableLogging) {
        console.log('🧹 CACHE CLEANUP START:', {
          recoveryId,
          errorType: error.type,
          operation,
          context: context.cacheKey || 'unknown'
        });
      }

      // Clean up cache if cache manager is available
      if (context.cacheManager && context.cacheKey) {
        await context.cacheManager.cleanup(context.cacheKey, {
          reason: 'error_recovery',
          errorType: error.type,
          recoveryId
        });
      }

      // Clear programLogs cache if available
      if (context.setProgramLogs && context.cacheKey) {
        context.setProgramLogs(prev => {
          const updated = { ...prev };
          delete updated[context.cacheKey];
          return updated;
        });
      }

      if (this.options.enableLogging) {
        console.log('✅ CACHE CLEANUP COMPLETE:', {
          recoveryId,
          cacheKey: context.cacheKey
        });
      }

      // Retry the operation after cleanup
      return await this.executeOperation(operation, {
        ...context,
        cacheCleanupPerformed: true
      });
    } catch (cleanupError) {
      throw new WorkoutLogError(
        WorkoutLogErrorType.CACHE_CORRUPTION,
        'Cache cleanup strategy failed',
        {
          originalError: error.type,
          cleanupError: cleanupError.message,
          recoveryId
        },
        cleanupError
      );
    }
  }

  /**
   * Execute data sanitization strategy
   */
  async executeDataSanitizationStrategy(error, operation, context, recoveryId) {
    try {
      if (this.options.enableLogging) {
        console.log('🧼 DATA SANITIZATION START:', {
          recoveryId,
          errorType: error.type,
          operation
        });
      }

      // Sanitize data based on error type and context
      const sanitizedContext = await this.sanitizeData(error, context);
      
      if (this.options.enableLogging) {
        console.log('✅ DATA SANITIZATION COMPLETE:', {
          recoveryId,
          sanitizedFields: Object.keys(sanitizedContext.sanitizedData || {})
        });
      }

      // Retry operation with sanitized data
      return await this.executeOperation(operation, sanitizedContext);
    } catch (sanitizationError) {
      throw new WorkoutLogError(
        WorkoutLogErrorType.INVALID_DATA,
        'Data sanitization strategy failed',
        {
          originalError: error.type,
          sanitizationError: sanitizationError.message,
          recoveryId
        },
        sanitizationError
      );
    }
  }

  /**
   * Execute fallback strategy
   */
  async executeFallbackStrategy(error, operation, context, recoveryId) {
    try {
      if (this.options.enableLogging) {
        console.log('🔀 FALLBACK STRATEGY START:', {
          recoveryId,
          errorType: error.type,
          operation
        });
      }

      // Execute fallback based on error type
      const result = await this.executeFallback(error, operation, context);
      
      if (this.options.enableLogging) {
        console.log('✅ FALLBACK STRATEGY SUCCESS:', {
          recoveryId,
          errorType: error.type,
          fallbackResult: result ? 'success' : 'no_result'
        });
      }

      return result;
    } catch (fallbackError) {
      throw new WorkoutLogError(
        WorkoutLogErrorType.UNKNOWN_ERROR,
        'Fallback strategy failed',
        {
          originalError: error.type,
          fallbackError: fallbackError.message,
          recoveryId
        },
        fallbackError
      );
    }
  }

  /**
   * Execute user intervention strategy
   */
  async executeUserInterventionStrategy(error, operation, context, recoveryId) {
    if (this.options.enableLogging) {
      console.log('👤 USER INTERVENTION REQUIRED:', {
        recoveryId,
        errorType: error.type,
        operation,
        userMessage: error.userFriendly
      });
    }

    // Return error with user intervention flag
    throw new WorkoutLogError(
      error.type,
      error.message,
      {
        ...error.context,
        requiresUserIntervention: true,
        userMessage: error.userFriendly,
        recoveryId
      },
      error.originalError
    );
  }

  /**
   * Sanitize data based on error type
   */
  async sanitizeData(error, context) {
    const sanitizedData = {};
    const sanitizedContext = { ...context, sanitizedData };

    switch (error.type) {
      case WorkoutLogErrorType.INVALID_DATA:
      case WorkoutLogErrorType.DATA_TYPE_MISMATCH:
        // Sanitize exercise data
        if (context.exercises) {
          sanitizedData.exercises = this.sanitizeExercises(context.exercises);
          sanitizedContext.exercises = sanitizedData.exercises;
        }
        
        // Sanitize workout data
        if (context.workoutData) {
          sanitizedData.workoutData = this.sanitizeWorkoutData(context.workoutData);
          sanitizedContext.workoutData = sanitizedData.workoutData;
        }
        break;

      case WorkoutLogErrorType.MISSING_REQUIRED_FIELDS:
        // Add default values for missing fields
        if (context.workoutData) {
          sanitizedData.workoutData = this.addDefaultValues(context.workoutData);
          sanitizedContext.workoutData = sanitizedData.workoutData;
        }
        break;

      default:
        // No specific sanitization for this error type
        break;
    }

    return sanitizedContext;
  }

  /**
   * Sanitize exercise data
   */
  sanitizeExercises(exercises) {
    return exercises.map((exercise, index) => {
      const sanitized = { ...exercise };

      // Ensure required fields
      if (!sanitized.exerciseId || typeof sanitized.exerciseId !== 'string') {
        sanitized.exerciseId = `unknown_exercise_${index}`;
      }

      // Sanitize sets
      if (typeof sanitized.sets !== 'number' || sanitized.sets <= 0) {
        sanitized.sets = 1;
      }

      // Sanitize arrays
      sanitized.reps = Array.isArray(sanitized.reps) ? sanitized.reps : [];
      sanitized.weights = Array.isArray(sanitized.weights) ? sanitized.weights : [];
      sanitized.completed = Array.isArray(sanitized.completed) ? sanitized.completed : [];

      // Ensure arrays match sets count
      while (sanitized.reps.length < sanitized.sets) sanitized.reps.push(null);
      while (sanitized.weights.length < sanitized.sets) sanitized.weights.push(null);
      while (sanitized.completed.length < sanitized.sets) sanitized.completed.push(false);

      // Trim arrays if too long
      sanitized.reps.length = sanitized.sets;
      sanitized.weights.length = sanitized.sets;
      sanitized.completed.length = sanitized.sets;

      // Sanitize numeric values
      sanitized.reps = sanitized.reps.map(rep => {
        if (rep === null || rep === undefined || rep === '') return null;
        const num = Number(rep);
        return isNaN(num) ? null : Math.max(0, Math.floor(num));
      });

      sanitized.weights = sanitized.weights.map(weight => {
        if (weight === null || weight === undefined || weight === '') return null;
        const num = Number(weight);
        return isNaN(num) ? null : Math.max(0, num);
      });

      // Ensure order index
      if (typeof sanitized.orderIndex !== 'number') {
        sanitized.orderIndex = index;
      }

      // Sanitize notes
      if (typeof sanitized.notes !== 'string') {
        sanitized.notes = '';
      }

      return sanitized;
    });
  }

  /**
   * Sanitize workout data
   */
  sanitizeWorkoutData(workoutData) {
    const sanitized = { ...workoutData };

    // Ensure required string fields
    if (typeof sanitized.name !== 'string') {
      sanitized.name = 'Untitled Workout';
    }

    if (typeof sanitized.programId !== 'string') {
      throw new Error('Program ID is required and cannot be sanitized');
    }

    // Ensure numeric fields
    if (typeof sanitized.weekIndex !== 'number') {
      sanitized.weekIndex = 0;
    }

    if (typeof sanitized.dayIndex !== 'number') {
      sanitized.dayIndex = 0;
    }

    // Ensure boolean fields
    if (typeof sanitized.isFinished !== 'boolean') {
      sanitized.isFinished = false;
    }

    if (typeof sanitized.isDraft !== 'boolean') {
      sanitized.isDraft = true;
    }

    // Sanitize optional numeric fields
    if (sanitized.duration !== null && sanitized.duration !== undefined) {
      const duration = Number(sanitized.duration);
      sanitized.duration = isNaN(duration) ? null : Math.max(0, duration);
    }

    // Sanitize notes
    if (typeof sanitized.notes !== 'string') {
      sanitized.notes = '';
    }

    return sanitized;
  }

  /**
   * Add default values for missing required fields
   */
  addDefaultValues(workoutData) {
    const withDefaults = { ...workoutData };

    if (!withDefaults.name) {
      withDefaults.name = 'Untitled Workout';
    }

    if (withDefaults.weekIndex === undefined || withDefaults.weekIndex === null) {
      withDefaults.weekIndex = 0;
    }

    if (withDefaults.dayIndex === undefined || withDefaults.dayIndex === null) {
      withDefaults.dayIndex = 0;
    }

    if (withDefaults.isFinished === undefined || withDefaults.isFinished === null) {
      withDefaults.isFinished = false;
    }

    if (withDefaults.isDraft === undefined || withDefaults.isDraft === null) {
      withDefaults.isDraft = true;
    }

    if (!withDefaults.date) {
      withDefaults.date = new Date().toISOString().split('T')[0];
    }

    if (!withDefaults.type) {
      withDefaults.type = 'program_workout';
    }

    if (!withDefaults.weightUnit) {
      withDefaults.weightUnit = 'LB';
    }

    return withDefaults;
  }

  /**
   * Execute fallback operation based on error type
   */
  async executeFallback(error, operation, context) {
    switch (error.type) {
      case WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION:
        // Try to update existing record instead of creating new one
        if (context.workoutLogService && context.userId && context.workoutData) {
          return await this.handleDuplicateConstraintFallback(
            context.workoutLogService,
            context.userId,
            context.workoutData,
            error
          );
        }
        break;

      case WorkoutLogErrorType.EXERCISE_ORDER_CONFLICT:
        // Reorder exercises and retry
        if (context.exercises) {
          const reorderedExercises = this.reorderExercises(context.exercises);
          return await this.executeOperation(operation, {
            ...context,
            exercises: reorderedExercises
          });
        }
        break;

      default:
        throw new Error(`No fallback strategy available for error type: ${error.type}`);
    }
  }

  /**
   * Handle duplicate constraint violation fallback
   */
  async handleDuplicateConstraintFallback(service, userId, workoutData, error) {
    try {
      // Find existing workout log
      const existingLog = await service.getWorkoutLog(
        userId,
        workoutData.programId,
        workoutData.weekIndex,
        workoutData.dayIndex
      );

      if (existingLog) {
        // Update existing record
        return await service.updateWorkoutLog(existingLog.id, {
          name: workoutData.name,
          isFinished: workoutData.isFinished || false,
          isDraft: workoutData.isDraft || false,
          duration: workoutData.duration,
          notes: workoutData.notes,
          exercises: workoutData.exercises
        });
      } else {
        throw new Error('No existing record found for constraint violation');
      }
    } catch (fallbackError) {
      throw new WorkoutLogError(
        WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION,
        'Fallback strategy failed for duplicate constraint violation',
        {
          originalError: error.message,
          fallbackError: fallbackError.message
        },
        fallbackError
      );
    }
  }

  /**
   * Reorder exercises to resolve conflicts
   */
  reorderExercises(exercises) {
    return exercises.map((exercise, index) => ({
      ...exercise,
      orderIndex: index
    }));
  }

  /**
   * Execute operation with context
   */
  async executeOperation(operation, context) {
    if (typeof operation === 'function') {
      return await operation(context);
    }
    
    throw new Error('Operation must be a function');
  }

  /**
   * Get retry configuration for error type
   */
  getRetryConfig(errorType) {
    switch (errorType) {
      case WorkoutLogErrorType.NETWORK_ERROR:
      case WorkoutLogErrorType.CONNECTION_TIMEOUT:
      case WorkoutLogErrorType.RATE_LIMIT_EXCEEDED:
        return RETRY_CONFIG.NETWORK;
      
      case WorkoutLogErrorType.CACHE_VALIDATION_FAILED:
      case WorkoutLogErrorType.CACHE_TIMEOUT:
        return RETRY_CONFIG.CACHE;
      
      case WorkoutLogErrorType.DATABASE_ERROR:
      case WorkoutLogErrorType.QUERY_TIMEOUT:
      case WorkoutLogErrorType.TRANSACTION_FAILED:
        return RETRY_CONFIG.DATABASE;
      
      default:
        return RETRY_CONFIG.DEFAULT;
    }
  }

  /**
   * Calculate delay for retry with exponential backoff
   */
  calculateDelay(attempt, config) {
    let delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
    delay = Math.min(delay, config.maxDelay);
    
    if (config.jitter) {
      // Add random jitter (±25%)
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      delay += jitter;
    }
    
    return Math.max(0, Math.floor(delay));
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique recovery ID
   */
  generateRecoveryId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `rec_${timestamp}_${random}`;
  }

  /**
   * Update strategy statistics
   */
  updateStrategyStats(strategy, success) {
    if (!this.recoveryStats.byStrategy[strategy]) {
      this.recoveryStats.byStrategy[strategy] = { attempts: 0, successes: 0 };
    }
    
    this.recoveryStats.byStrategy[strategy].attempts++;
    if (success) {
      this.recoveryStats.byStrategy[strategy].successes++;
    }
  }

  /**
   * Update error type statistics
   */
  updateErrorTypeStats(errorType, success) {
    if (!this.recoveryStats.byErrorType[errorType]) {
      this.recoveryStats.byErrorType[errorType] = { attempts: 0, successes: 0 };
    }
    
    this.recoveryStats.byErrorType[errorType].attempts++;
    if (success) {
      this.recoveryStats.byErrorType[errorType].successes++;
    }
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats() {
    return {
      ...this.recoveryStats,
      successRate: this.recoveryStats.totalAttempts > 0 
        ? (this.recoveryStats.successfulRecoveries / this.recoveryStats.totalAttempts) * 100 
        : 0,
      activeRecoveries: this.activeRecoveries.size
    };
  }

  /**
   * Reset recovery statistics
   */
  resetStats() {
    this.recoveryStats = {
      totalAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      byStrategy: {},
      byErrorType: {}
    };
  }
}

/**
 * Global error recovery manager instance
 */
const globalRecoveryManager = new ErrorRecoveryManager({
  enableLogging: process.env.NODE_ENV === 'development',
  enableMetrics: true
});

/**
 * Convenience function to recover from error
 */
async function recoverFromError(error, operation, context = {}) {
  return await globalRecoveryManager.recover(error, operation, context);
}

// Export recovery utilities
module.exports = {
  ErrorRecoveryManager,
  globalRecoveryManager,
  recoverFromError,
  RETRY_CONFIG
};