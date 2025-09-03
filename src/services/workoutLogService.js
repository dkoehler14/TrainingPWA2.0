/**
 * Workout Log Service for Supabase
 * 
 * Handles workout logging data access with PostgreSQL backend:
 * - CRUD operations for workout logs and exercises
 * - Draft workout management and completion flow
 * - Workout analytics calculation and retrieval
 * - Real-time updates and caching integration
 */

import { supabase } from '../config/supabase'
import { withSupabaseErrorHandling } from '../config/supabase'
import { supabaseCache } from '../api/supabaseCache'
import { WorkoutLogCacheManager } from '../utils/cacheManager'

// Import comprehensive error handling system
const {
  WorkoutLogError,
  WorkoutLogErrorType,
  ErrorClassifier,
  ErrorContextCollector
} = require('../utils/workoutLogErrorHandler')

// Import comprehensive logging system
const {
  workoutLogLogger,
  OperationType,
  logInfo,
  logError,
  logWarn,
  logDebug,
  logCacheOperation,
  logExerciseOperation,
  startTimer,
  endTimer,
  logPerformanceMetric
} = require('../utils/workoutLogLogger')

// Import error recovery system
const { recoverFromError } = require('../utils/workoutLogErrorRecovery')

/**
 * Constraint violation handler utilities
 */
export const ConstraintViolationHandler = {
  /**
   * Check if error is a unique constraint violation
   */
  isUniqueConstraintViolation(error) {
    return error.code === '23505' &&
      (error.message.includes('unique_user_program_week_day') ||
        error.message.includes('workout_logs_user_id_program_id_week_index_day_index_key') ||
        error.message.includes('unique_workout_log_exercise') ||
        error.message.includes('workout_log_exercises_workout_log_id_exercise_id_key'));
  },

  /**
   * Extract constraint violation details from error
   */
  extractConstraintDetails(error) {
    const details = {
      constraintName: null,
      conflictingValues: {},
      errorCode: error.code,
      errorMessage: error.message
    };

    if (error.message.includes('unique_user_program_week_day')) {
      details.constraintName = 'unique_user_program_week_day';
    } else if (error.message.includes('unique_workout_log_exercise')) {
      details.constraintName = 'unique_workout_log_exercise';
    }

    // Try to extract conflicting values from error message
    const valueMatch = error.message.match(/\(([^)]+)\)=\(([^)]+)\)/);
    if (valueMatch) {
      const keys = valueMatch[1].split(', ');
      const values = valueMatch[2].split(', ');
      keys.forEach((key, index) => {
        details.conflictingValues[key] = values[index];
      });
    }

    return details;
  },

  /**
   * Log constraint violation incident with comprehensive details
   */
  logConstraintViolation(operation, error, context = {}) {
    const details = this.extractConstraintDetails(error);

    console.error('🚫 CONSTRAINT VIOLATION DETECTED:', {
      operation,
      timestamp: new Date().toISOString(),
      constraintDetails: details,
      context,
      error: {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details
      },
      recoveryAction: 'attempting_update_fallback'
    });

    return details;
  },

  /**
   * Attempt recovery from constraint violation by updating existing record
   */
  async attemptConstraintRecovery(service, userId, workoutData, originalError) {
    const details = this.extractConstraintDetails(originalError);

    console.log('🔄 CONSTRAINT RECOVERY: Attempting to find and update existing record', {
      constraintDetails: details,
      userId,
      programId: workoutData.programId,
      weekIndex: workoutData.weekIndex,
      dayIndex: workoutData.dayIndex
    });

    try {
      // Find existing workout log
      const existingLog = await service.getWorkoutLog(
        userId,
        workoutData.programId,
        workoutData.weekIndex,
        workoutData.dayIndex
      );

      if (existingLog) {
        console.log('✅ CONSTRAINT RECOVERY: Found existing log, updating', {
          existingLogId: existingLog.id,
          operation: 'update_on_constraint_violation',
          recoverySuccess: true
        });

        // Update the existing record
        const updatedLog = await service.updateWorkoutLog(existingLog.id, {
          name: workoutData.name,
          isFinished: workoutData.isFinished || false,
          isDraft: workoutData.isDraft || false,
          duration: workoutData.duration,
          notes: workoutData.notes,
          exercises: workoutData.exercises
        });

        console.log('✅ CONSTRAINT RECOVERY SUCCESS:', {
          workoutLogId: updatedLog.id,
          operation: 'constraint_violation_recovery',
          originalError: originalError.message
        });

        return updatedLog;
      } else {
        // Could not find existing record - this is unexpected
        const recoveryError = new WorkoutLogError(
          WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION,
          'Constraint violation occurred but no existing record found for update',
          {
            userId,
            programId: workoutData.programId,
            weekIndex: workoutData.weekIndex,
            dayIndex: workoutData.dayIndex,
            constraintDetails: details
          },
          originalError
        );

        console.error('❌ CONSTRAINT RECOVERY FAILED:', recoveryError.toJSON());
        throw recoveryError;
      }
    } catch (recoveryError) {
      console.error('❌ CONSTRAINT RECOVERY ERROR:', {
        originalError: originalError.message,
        recoveryError: recoveryError.message,
        context: {
          userId,
          programId: workoutData.programId,
          weekIndex: workoutData.weekIndex,
          dayIndex: workoutData.dayIndex
        }
      });

      // Re-throw as WorkoutLogError if not already
      if (!(recoveryError instanceof WorkoutLogError)) {
        throw new WorkoutLogError(
          WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION,
          'Failed to recover from constraint violation',
          { originalError: originalError.message, recoveryError: recoveryError.message },
          recoveryError
        );
      }
      throw recoveryError;
    }
  },

  /**
   * Create user-friendly error message for constraint violations
   */
  createUserFriendlyMessage(error, context = {}) {
    const details = this.extractConstraintDetails(error);

    if (details.constraintName === 'unique_user_program_week_day') {
      return {
        title: 'Workout Already Exists',
        message: 'A workout log already exists for this program, week, and day. Your changes have been saved to the existing workout.',
        type: 'info',
        recoverable: true,
        context: {
          programId: context.programId,
          weekIndex: context.weekIndex,
          dayIndex: context.dayIndex
        }
      };
    } else if (details.constraintName === 'unique_workout_log_exercise') {
      return {
        title: 'Exercise Already Added',
        message: 'This exercise has already been added to your workout. You can modify the existing exercise entry instead.',
        type: 'warning',
        recoverable: true,
        context: {
          workoutLogId: context.workoutLogId,
          exerciseId: context.exerciseId,
          constraintType: 'duplicate_exercise'
        }
      };
    }

    return {
      title: 'Data Conflict',
      message: 'There was a conflict saving your workout data. Please try again.',
      type: 'error',
      recoverable: true,
      context
    };
  }
};

class WorkoutLogService {
  constructor() {
    this.CACHE_TTL = 15 * 60 * 1000 // 15 minutes
    this.DRAFT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes for drafts
    this.PROGRAM_LOGS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes for program logs
    this.EXERCISE_HISTORY_CACHE_TTL = 30 * 60 * 1000 // 30 minutes for exercise history

    // Initialize constraint violation tracking
    this.constraintViolationStats = {
      totalViolations: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      lastViolation: null
    };

    // Serialize ensure operations by key to avoid duplicate creations during concurrent autosaves
    this._ensureLocks = new Map();
  }

  /**
   * Handle constraint violation with comprehensive logging and user feedback
   */
  async handleConstraintViolation(error, context, operation = 'unknown') {
    this.constraintViolationStats.totalViolations++;
    this.constraintViolationStats.lastViolation = new Date().toISOString();

    // Log the incident with full context
    const violationDetails = ConstraintViolationHandler.logConstraintViolation(operation, error, context);

    // Create user-friendly message
    const userMessage = ConstraintViolationHandler.createUserFriendlyMessage(error, context);

    // Attempt recovery
    try {
      const recoveredLog = await ConstraintViolationHandler.attemptConstraintRecovery(
        this,
        context.userId,
        context.workoutData || context,
        error
      );

      this.constraintViolationStats.successfulRecoveries++;

      console.log('✅ CONSTRAINT VIOLATION HANDLED SUCCESSFULLY:', {
        operation,
        recoveredLogId: recoveredLog.id,
        violationDetails,
        userMessage,
        stats: this.constraintViolationStats
      });

      return {
        success: true,
        result: recoveredLog,
        userMessage,
        violationDetails
      };
    } catch (recoveryError) {
      this.constraintViolationStats.failedRecoveries++;

      console.error('❌ CONSTRAINT VIOLATION RECOVERY FAILED:', {
        operation,
        originalError: error.message,
        recoveryError: recoveryError.message,
        violationDetails,
        userMessage,
        stats: this.constraintViolationStats
      });

      return {
        success: false,
        error: recoveryError,
        userMessage: {
          ...userMessage,
          type: 'error',
          message: 'Unable to save workout due to a data conflict. Please refresh and try again.'
        },
        violationDetails
      };
    }
  }

  /**
   * Get constraint violation statistics
   */
  getConstraintViolationStats() {
    return {
      ...this.constraintViolationStats,
      recoveryRate: this.constraintViolationStats.totalViolations > 0
        ? (this.constraintViolationStats.successfulRecoveries / this.constraintViolationStats.totalViolations) * 100
        : 0
    };
  }

  /**
   * Reset constraint violation statistics
   */
  resetConstraintViolationStats() {
    this.constraintViolationStats = {
      totalViolations: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      lastViolation: null
    };
  }

  /**
   * Enhanced workout log creation with transaction boundaries and comprehensive error handling
   */
  async createWorkoutLogEnhanced(userId, workoutData, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        validateConstraints = true,
        enableRecovery = true,
        logOperations = true
      } = options;

      let transactionState = {
        workoutLogCreated: false,
        exercisesCreated: false,
        workoutLogId: null,
        exerciseIds: []
      };

      // Start performance timer
      const timerId = startTimer('createWorkoutLogEnhanced', {
        userId,
        programId: workoutData.programId,
        weekIndex: workoutData.weekIndex,
        dayIndex: workoutData.dayIndex,
        exerciseCount: workoutData.exercises?.length || 0
      });

      try {

        if (logOperations) {
          logInfo(OperationType.CREATE, 'Enhanced create transaction started', {
            userId,
            programId: workoutData.programId,
            weekIndex: workoutData.weekIndex,
            dayIndex: workoutData.dayIndex,
            exerciseCount: workoutData.exercises?.length || 0,
            options
          });
        }

        // Validate input data
        if (!userId || !workoutData.programId ||
          workoutData.weekIndex === undefined || workoutData.dayIndex === undefined) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.INVALID_DATA,
            'Missing required workout log data',
            {
              userId: !!userId,
              programId: !!workoutData.programId,
              weekIndex: workoutData.weekIndex !== undefined,
              dayIndex: workoutData.dayIndex !== undefined
            }
          );
        }

        // Create workout log with constraint handling
        const workoutLogResult = await this.createWorkoutLog(userId, workoutData);
        transactionState.workoutLogCreated = true;
        transactionState.workoutLogId = workoutLogResult.id;

        if (logOperations) {
          logInfo(OperationType.CREATE, 'Workout log created in enhanced transaction', {
            workoutLogId: workoutLogResult.id,
            userId,
            programId: workoutData.programId,
            weekIndex: workoutData.weekIndex,
            dayIndex: workoutData.dayIndex
          });
        }

        // Create exercises if provided (already handled in createWorkoutLog, but track state)
        if (workoutData.exercises && workoutData.exercises.length > 0) {
          transactionState.exercisesCreated = true;
          // Exercise creation is handled within createWorkoutLog
        }

        // End performance timer and log success
        const timing = endTimer(timerId, {
          workoutLogId: workoutLogResult.id,
          transactionState,
          success: true
        });

        if (logOperations) {
          logInfo(OperationType.CREATE, 'Enhanced create transaction completed successfully', {
            workoutLogId: workoutLogResult.id,
            transactionState,
            operation: 'createWorkoutLogEnhanced',
            duration: timing?.duration
          });
        }

        return workoutLogResult;
      } catch (error) {
        // End timer with error
        endTimer(timerId, {
          success: false,
          error: error.message,
          errorType: error.type || 'unknown'
        });

        logError(OperationType.CREATE, 'Enhanced create transaction failed', {
          errorType: error.type || 'unknown',
          transactionState,
          context: {
            userId,
            programId: workoutData.programId,
            weekIndex: workoutData.weekIndex,
            dayIndex: workoutData.dayIndex
          }
        }, error);

        // Handle constraint violations with recovery if enabled
        if (error instanceof WorkoutLogError &&
          error.type === WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION &&
          enableRecovery) {

          if (logOperations) {
            console.log('🔄 ENHANCED CREATE: Attempting constraint violation recovery', {
              originalError: error.message,
              transactionState
            });
          }

          try {
            const recoveryResult = await this.handleConstraintViolation(error, {
              userId,
              workoutData
            }, 'createWorkoutLogEnhanced');

            if (recoveryResult.success) {
              if (logOperations) {
                console.log('✅ ENHANCED CREATE: Constraint violation recovery successful', {
                  recoveredLogId: recoveryResult.result.id,
                  userMessage: recoveryResult.userMessage
                });
              }
              return recoveryResult.result;
            } else {
              throw recoveryResult.error;
            }
          } catch (recoveryError) {
            if (logOperations) {
              console.error('❌ ENHANCED CREATE: Constraint violation recovery failed', {
                originalError: error.message,
                recoveryError: recoveryError.message
              });
            }
            throw recoveryError;
          }
        }

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.TRANSACTION_FAILED,
          `Enhanced create transaction failed: ${error.message}`,
          {
            userId,
            programId: workoutData.programId,
            weekIndex: workoutData.weekIndex,
            dayIndex: workoutData.dayIndex,
            transactionState
          },
          error
        );
      }
    }, 'createWorkoutLogEnhanced')
  }

  /**
   * Enhanced workout log update with cache-aware operations and transaction boundaries
   */
  async updateWorkoutLogEnhanced(workoutLogId, updates, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        validateCache = true,
        invalidateCache = true,
        logOperations = true,
        cacheManager = null,
        programLogs = {},
        setProgramLogs = () => { }
      } = options;

      try {
        if (logOperations) {
          console.log('🚀 ENHANCED UPDATE START:', {
            workoutLogId,
            hasExercises: !!updates.exercises,
            exerciseCount: updates.exercises?.length || 0,
            options: {
              validateCache,
              invalidateCache,
              hasCacheManager: !!cacheManager
            }
          });
        }

        // Validate workout log ID format
        if (!workoutLogId || typeof workoutLogId !== 'string') {
          throw new WorkoutLogError(
            WorkoutLogErrorType.INVALID_DATA,
            'Invalid workout log ID provided',
            { workoutLogId, type: typeof workoutLogId }
          );
        }

        // Perform the update with transaction boundaries
        const result = await this.updateWorkoutLog(workoutLogId, updates);

        // Update cache if cache manager is provided
        if (cacheManager && result) {
          try {
            const cacheKey = cacheManager.generateKey(result.week_index, result.day_index);

            if (validateCache) {
              // Validate existing cache entry
              const existingCache = await cacheManager.get(cacheKey, programLogs);
              if (existingCache && existingCache.workoutLogId !== workoutLogId) {
                console.warn('⚠️ CACHE INCONSISTENCY DETECTED:', {
                  cacheKey,
                  cachedId: existingCache.workoutLogId,
                  actualId: workoutLogId,
                  action: 'updating_cache'
                });
              }
            }

            // Update cache with fresh data
            await cacheManager.set(cacheKey, {
              workoutLogId: result.id,
              lastSaved: new Date().toISOString(),
              isValid: true,
              exercises: updates.exercises || [],
              isWorkoutFinished: result.is_finished || false,
              metadata: {
                source: 'enhanced_update',
                operation: 'updateWorkoutLogEnhanced',
                timestamp: new Date().toISOString()
              }
            }, programLogs, setProgramLogs, {
              source: 'enhanced_update'
            });

            if (logOperations) {
              console.log('✅ CACHE UPDATED IN ENHANCED UPDATE:', {
                workoutLogId: result.id,
                cacheKey,
                exerciseCount: updates.exercises?.length || 0
              });
            }
          } catch (cacheError) {
            console.warn('⚠️ CACHE UPDATE FAILED (NON-CRITICAL):', {
              workoutLogId,
              cacheError: cacheError.message,
              updateContinues: true
            });
            // Cache errors are non-critical for update operations
          }
        }

        if (logOperations) {
          console.log('✅ ENHANCED UPDATE SUCCESS:', {
            workoutLogId: result.id,
            userId: result.user_id,
            programId: result.program_id,
            weekIndex: result.week_index,
            dayIndex: result.day_index,
            exercisesUpdated: !!updates.exercises,
            cacheUpdated: !!cacheManager
          });
        }

        return result;
      } catch (error) {
        console.error('❌ ENHANCED UPDATE ERROR:', {
          workoutLogId,
          error: error.message,
          errorType: error.type || 'unknown',
          stack: error.stack,
          context: {
            hasExercises: !!updates.exercises,
            exerciseCount: updates.exercises?.length || 0
          }
        });

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.DATABASE_ERROR,
          `Enhanced update failed: ${error.message}`,
          {
            workoutLogId,
            updates: JSON.stringify(updates, null, 2)
          },
          error
        );
      }
    }, 'updateWorkoutLogEnhanced')
  }

  /**
   * Create a new workout log with comprehensive constraint violation handling
   */
  async createWorkoutLog(userId, workoutData) {
    return withSupabaseErrorHandling(async () => {
      try {
        const { data, error } = await supabase
          .from('workout_logs')
          .insert({
            user_id: userId,
            program_id: workoutData.programId,
            week_index: workoutData.weekIndex,
            day_index: workoutData.dayIndex,
            name: workoutData.name,
            type: workoutData.type || 'program_workout',
            date: workoutData.date || new Date().toISOString().split('T')[0],
            is_finished: workoutData.isFinished || false,
            is_draft: workoutData.isDraft || false,
            weight_unit: workoutData.weightUnit || 'LB',
            duration: workoutData.duration,
            notes: workoutData.notes,
            completed_date: workoutData.completedDate
          })
          .select()
          .single()

        if (error) {
          // Handle unique constraint violation with comprehensive logging and recovery
          if (ConstraintViolationHandler.isUniqueConstraintViolation(error)) {
            // Log the constraint violation incident
            ConstraintViolationHandler.logConstraintViolation('createWorkoutLog', error, {
              userId,
              programId: workoutData.programId,
              weekIndex: workoutData.weekIndex,
              dayIndex: workoutData.dayIndex,
              workoutData: JSON.stringify(workoutData, null, 2)
            });

            // Attempt recovery by updating existing record
            try {
              const recoveredLog = await ConstraintViolationHandler.attemptConstraintRecovery(
                this,
                userId,
                workoutData,
                error
              );

              // Log successful recovery
              console.log('✅ CONSTRAINT VIOLATION RECOVERY SUCCESS:', {
                operation: 'createWorkoutLog',
                recoveredLogId: recoveredLog.id,
                originalError: error.message,
                recoveryAction: 'updated_existing_record'
              });

              return recoveredLog;
            } catch (recoveryError) {
              // Recovery failed - throw enhanced error
              throw new WorkoutLogError(
                WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION,
                'Failed to create workout log due to duplicate constraint violation',
                {
                  userId,
                  programId: workoutData.programId,
                  weekIndex: workoutData.weekIndex,
                  dayIndex: workoutData.dayIndex,
                  userFriendlyMessage: ConstraintViolationHandler.createUserFriendlyMessage(error, {
                    programId: workoutData.programId,
                    weekIndex: workoutData.weekIndex,
                    dayIndex: workoutData.dayIndex
                  })
                },
                recoveryError
              );
            }
          }

          // Handle other database errors
          if (error.code) {
            throw new WorkoutLogError(
              WorkoutLogErrorType.DATABASE_ERROR,
              `Database error during workout log creation: ${error.message}`,
              {
                userId,
                programId: workoutData.programId,
                weekIndex: workoutData.weekIndex,
                dayIndex: workoutData.dayIndex,
                errorCode: error.code,
                errorDetails: error.details,
                errorHint: error.hint
              },
              error
            );
          }

          throw error;
        }

        // If exercises are provided, create them using upsert for consistency
        if (workoutData.exercises && workoutData.exercises.length > 0) {
          try {
            // Use upsert method even for creation to maintain consistency
            const upsertResult = await this.upsertWorkoutExercises(data.id, workoutData.exercises, {
              logOperations: true,
              useTransaction: true,
              validateData: true
            });

            console.log('✅ EXERCISES CREATED VIA UPSERT:', {
              workoutLogId: data.id,
              operations: upsertResult.operations,
              exerciseCount: workoutData.exercises.length
            });
          } catch (exerciseError) {
            console.error('❌ EXERCISE CREATION ERROR:', {
              workoutLogId: data.id,
              exerciseCount: workoutData.exercises.length,
              error: exerciseError.message
            });

            // Don't fail the entire operation for exercise errors
            // The workout log was created successfully
            console.warn('⚠️ PARTIAL SUCCESS: Workout log created but exercises failed', {
              workoutLogId: data.id,
              exerciseError: exerciseError.message
            });
          }
        }

        console.log('✅ CREATE WORKOUT LOG SUCCESS:', {
          workoutLogId: data.id,
          userId,
          programId: workoutData.programId,
          weekIndex: workoutData.weekIndex,
          dayIndex: workoutData.dayIndex,
          exerciseCount: workoutData.exercises?.length || 0
        });

        return data
      } catch (error) {
        // Enhanced error logging for all create operations
        console.error('❌ CREATE WORKOUT LOG ERROR:', {
          operation: 'createWorkoutLog',
          userId,
          programId: workoutData.programId,
          weekIndex: workoutData.weekIndex,
          dayIndex: workoutData.dayIndex,
          error: error.message,
          errorType: error.type || 'unknown',
          errorCode: error.code,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.DATABASE_ERROR,
          `Failed to create workout log: ${error.message}`,
          {
            userId,
            programId: workoutData.programId,
            weekIndex: workoutData.weekIndex,
            dayIndex: workoutData.dayIndex
          },
          error
        );
      }
    }, 'createWorkoutLog')
  }

  /**
   * Create workout log exercises
   */
  async createWorkoutLogExercises(workoutLogId, exercises) {
    return withSupabaseErrorHandling(async () => {
      const exerciseData = exercises.map((ex, index) => {
        // Validate and sanitize exercise data
        const sets = ex.sets && ex.sets !== '' ? Number(ex.sets) : 1
        const exerciseId = ex.exerciseId && ex.exerciseId !== '' ? ex.exerciseId : null
        const bodyweight = ex.bodyweight && ex.bodyweight !== '' ? Number(ex.bodyweight) : null

        // Validate required fields
        if (!exerciseId) {
          throw new Error(`Exercise ID is required for exercise at index ${index}`)
        }

        if (isNaN(sets) || sets <= 0) {
          throw new Error(`Invalid sets value for exercise at index ${index}: ${ex.sets}`)
        }

        // Ensure arrays match the sets count (required by DB constraint)
        const reps = ex.reps || []
        const weights = ex.weights || []
        const completed = ex.completed || []

        // Pad or trim arrays to match sets count
        const paddedReps = [...reps]
        const paddedWeights = [...weights]
        const paddedCompleted = [...completed]

        // Pad with null values for uncompleted sets (preserve empty state)
        while (paddedReps.length < sets) paddedReps.push(null)
        while (paddedWeights.length < sets) paddedWeights.push(null)
        while (paddedCompleted.length < sets) paddedCompleted.push(false)

        // Trim if arrays are too long
        paddedReps.length = sets
        paddedWeights.length = sets
        paddedCompleted.length = sets

        // Convert empty strings to null for database storage (preserve uncompleted state)
        const cleanedReps = paddedReps.map(rep => rep === '' || rep === undefined ? null : rep)
        const cleanedWeights = paddedWeights.map(weight => weight === '' || weight === undefined ? null : weight)

        return {
          workout_log_id: workoutLogId,
          exercise_id: exerciseId,
          sets: sets,
          reps: cleanedReps,
          weights: cleanedWeights,
          completed: paddedCompleted,
          bodyweight: bodyweight,
          notes: ex.notes || '',
          is_added: ex.isAdded || false,
          added_type: ex.addedType || null,
          original_index: ex.originalIndex || -1,
          order_index: index
        }
      })

      const { data, error } = await supabase
        .from('workout_log_exercises')
        .insert(exerciseData)
        .select()

      if (error) throw error
      return data
    }, 'createWorkoutLogExercises')
  }

  /**
   * Save only exercise data to workout_log_exercises table
   * Optimized for frequent exercise updates during workout logging
   * 
   * @param {string} workoutLogId - The workout log ID to update exercises for
   * @param {Array} exercises - Array of exercise data to save
   * @param {Object} options - Save options
   * @returns {Promise<Object>} Save result with performance metrics
   */
  async saveExercisesOnly(workoutLogId, exercises, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        useCache = true,
        validateCache = true,
        logOperations = true,
        source = 'exercise-only-save'
      } = options;

      // Start performance timer
      const timerId = startTimer('saveExercisesOnly', {
        workoutLogId,
        exerciseCount: exercises?.length || 0,
        source
      });

      try {
        if (logOperations) {
          logInfo(OperationType.UPDATE, 'Exercise-only save started', {
            workoutLogId,
            exerciseCount: exercises?.length || 0,
            source,
            options: { useCache, validateCache }
          });
        }

        // Validate input data
        if (!workoutLogId || typeof workoutLogId !== 'string') {
          throw new WorkoutLogError(
            WorkoutLogErrorType.INVALID_DATA,
            'Invalid workout log ID for exercise-only save',
            { workoutLogId, type: typeof workoutLogId }
          );
        }

        if (!Array.isArray(exercises)) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.INVALID_DATA,
            'Exercises must be an array for exercise-only save',
            { exercises: typeof exercises, workoutLogId }
          );
        }

        // Validate exercise data before saving
        for (let i = 0; i < exercises.length; i++) {
          const exercise = exercises[i];
          if (!exercise.exerciseId) {
            throw new WorkoutLogError(
              WorkoutLogErrorType.INVALID_DATA,
              `Exercise at index ${i} missing exerciseId`,
              { exerciseIndex: i, exercise, workoutLogId }
            );
          }

          // Validate sets count
          const sets = exercise.sets && exercise.sets !== '' ? Number(exercise.sets) : 1;
          if (isNaN(sets) || sets <= 0) {
            throw new WorkoutLogError(
              WorkoutLogErrorType.INVALID_DATA,
              `Invalid sets value at exercise index ${i}: ${exercise.sets}`,
              { exerciseIndex: i, sets: exercise.sets, workoutLogId }
            );
          }
        }

        // Use existing upsert method for efficient exercise updates
        const upsertResult = await this.upsertWorkoutExercises(workoutLogId, exercises, {
          logOperations,
          useTransaction: true,
          validateData: true
        });

        // End performance timer
        const timing = endTimer(timerId, {
          workoutLogId,
          success: true,
          operations: upsertResult.operations
        });

        // Log performance metrics
        logPerformanceMetric('saveExercisesOnly', {
          workoutLogId,
          exerciseCount: exercises.length,
          operations: upsertResult.operations,
          duration: timing?.duration,
          databaseWrites: (upsertResult.operations.inserted + upsertResult.operations.updated + upsertResult.operations.deleted),
          source
        });

        if (logOperations) {
          logInfo(OperationType.UPDATE, 'Exercise-only save completed successfully', {
            workoutLogId,
            operations: upsertResult.operations,
            exerciseCount: exercises.length,
            duration: timing?.duration,
            databaseWrites: (upsertResult.operations.inserted + upsertResult.operations.updated + upsertResult.operations.deleted)
          });
        }

        return {
          success: true,
          workoutLogId,
          operationType: 'exercise-only',
          affectedTables: ['workout_log_exercises'],
          cacheUpdated: false, // Cache updates handled separately
          performance: {
            duration: timing?.duration || 0,
            databaseWrites: (upsertResult.operations.inserted + upsertResult.operations.updated + upsertResult.operations.deleted)
          },
          operations: upsertResult.operations,
          changes: upsertResult.changes,
          summary: upsertResult.summary
        };

      } catch (error) {
        // End timer with error
        endTimer(timerId, {
          success: false,
          error: error.message,
          errorType: error.type || 'unknown'
        });

        logError(OperationType.UPDATE, 'Exercise-only save failed', {
          workoutLogId,
          exerciseCount: exercises?.length || 0,
          errorType: error.type || 'unknown',
          source
        }, error);

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.EXERCISE_SAVE_FAILED,
          `Exercise-only save failed: ${error.message}`,
          {
            workoutLogId,
            exerciseCount: exercises?.length || 0,
            source
          },
          error
        );
      }
    }, 'saveExercisesOnly');
  }

  /**
   * Save only metadata to workout_logs table
   * Optimized for immediate metadata updates (completion status, duration, notes)
   * 
   * @param {string} workoutLogId - The workout log ID to update metadata for
   * @param {Object} metadata - Metadata object to save
   * @param {Object} options - Save options
   * @returns {Promise<Object>} Save result with performance metrics
   */
  async saveMetadataOnly(workoutLogId, metadata, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        useCache = true,
        validateCache = true,
        logOperations = true,
        source = 'metadata-only-save'
      } = options;

      // Start performance timer
      const timerId = startTimer('saveMetadataOnly', {
        workoutLogId,
        metadataFields: Object.keys(metadata || {}),
        source
      });

      try {
        if (logOperations) {
          logInfo(OperationType.UPDATE, 'Metadata-only save started', {
            workoutLogId,
            metadataFields: Object.keys(metadata || {}),
            source,
            options: { useCache, validateCache }
          });
        }

        // Validate input data
        if (!workoutLogId || typeof workoutLogId !== 'string') {
          throw new WorkoutLogError(
            WorkoutLogErrorType.INVALID_DATA,
            'Invalid workout log ID for metadata-only save',
            { workoutLogId, type: typeof workoutLogId }
          );
        }

        if (!metadata || typeof metadata !== 'object') {
          throw new WorkoutLogError(
            WorkoutLogErrorType.INVALID_DATA,
            'Metadata must be an object for metadata-only save',
            { metadata: typeof metadata, workoutLogId }
          );
        }

        // Validate metadata fields - only allow specific metadata fields
        const allowedFields = ['is_finished', 'duration', 'notes', 'completed_date', 'name', 'is_draft'];
        const providedFields = Object.keys(metadata);
        const invalidFields = providedFields.filter(field => !allowedFields.includes(field));

        if (invalidFields.length > 0) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.INVALID_DATA,
            `Invalid metadata fields provided: ${invalidFields.join(', ')}`,
            {
              invalidFields,
              allowedFields,
              providedFields,
              workoutLogId
            }
          );
        }

        // Build update object with only provided fields
        const updateData = {
          updated_at: new Date().toISOString()
        };

        // Map metadata fields to database columns
        if (metadata.is_finished !== undefined) updateData.is_finished = metadata.is_finished;
        if (metadata.duration !== undefined) updateData.duration = metadata.duration;
        if (metadata.notes !== undefined) updateData.notes = metadata.notes;
        if (metadata.completed_date !== undefined) updateData.completed_date = metadata.completed_date;
        if (metadata.name !== undefined) updateData.name = metadata.name;
        if (metadata.is_draft !== undefined) updateData.is_draft = metadata.is_draft;

        // Perform the metadata-only update
        const { data, error } = await supabase
          .from('workout_logs')
          .update(updateData)
          .eq('id', workoutLogId)
          .select()
          .single();

        if (error) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.DATABASE_ERROR,
            `Failed to update workout log metadata: ${error.message}`,
            {
              workoutLogId,
              metadata: JSON.stringify(metadata, null, 2),
              updateData: JSON.stringify(updateData, null, 2),
              errorCode: error.code,
              errorDetails: error.details
            },
            error
          );
        }

        // End performance timer
        const timing = endTimer(timerId, {
          workoutLogId,
          success: true,
          metadataFields: providedFields
        });

        // Log performance metrics
        logPerformanceMetric('saveMetadataOnly', {
          workoutLogId,
          metadataFields: providedFields,
          duration: timing?.duration,
          databaseWrites: 1, // Only one table update
          source
        });

        if (logOperations) {
          logInfo(OperationType.UPDATE, 'Metadata-only save completed successfully', {
            workoutLogId,
            metadataFields: providedFields,
            duration: timing?.duration,
            databaseWrites: 1
          });
        }

        return {
          success: true,
          workoutLogId,
          operationType: 'metadata-only',
          affectedTables: ['workout_logs'],
          cacheUpdated: false, // Cache updates handled separately
          performance: {
            duration: timing?.duration || 0,
            databaseWrites: 1
          },
          updatedFields: providedFields,
          result: data
        };

      } catch (error) {
        // End timer with error
        endTimer(timerId, {
          success: false,
          error: error.message,
          errorType: error.type || 'unknown'
        });

        logError(OperationType.UPDATE, 'Metadata-only save failed', {
          workoutLogId,
          metadataFields: Object.keys(metadata || {}),
          errorType: error.type || 'unknown',
          source
        }, error);

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.METADATA_SAVE_FAILED,
          `Metadata-only save failed: ${error.message}`,
          {
            workoutLogId,
            metadata: JSON.stringify(metadata, null, 2),
            source
          },
          error
        );
      }
    }, 'saveMetadataOnly');
  }

  /**
   * Ensure a workout log exists for the given parameters, creating a minimal one if needed
   * Uses cache-first approach to check for existing workout log
   * 
   * @param {string} userId - User ID
   * @param {string} programId - Program ID
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} options - Options for cache and creation
   * @returns {Promise<string>} Workout log ID
   */
  async ensureWorkoutLogExists(userId, programId, weekIndex, dayIndex, options = {}) {
    const lockKey = `${userId}_${programId}_${weekIndex}_${dayIndex}`;
    if (this._ensureLocks.has(lockKey)) {
      return this._ensureLocks.get(lockKey);
    }

    const promise = withSupabaseErrorHandling(async () => {
      const {
        cacheManager = new WorkoutLogCacheManager(),
        programLogs = {},
        setProgramLogs = () => { },
        logOperations = true,
        workoutName = null,
        source = 'ensure-workout-log'
      } = options;

      // Start performance timer
      const timerId = startTimer('ensureWorkoutLogExists', {
        userId,
        programId,
        weekIndex,
        dayIndex,
        source
      });

      try {
        if (logOperations) {
          logInfo(OperationType.CREATE, 'Ensuring workout log exists', {
            userId,
            programId,
            weekIndex,
            dayIndex,
            source
          });
        }

        // Validate input parameters
        if (!userId || !programId || weekIndex === undefined || dayIndex === undefined) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.INVALID_DATA,
            'Missing required parameters for workout log existence check',
            {
              userId: !!userId,
              programId: !!programId,
              weekIndex: weekIndex !== undefined,
              dayIndex: dayIndex !== undefined
            }
          );
        }

        const cacheKey = cacheManager.generateKey(weekIndex, dayIndex);

        // Step 1: Check cache for existing workout log ID
        const cachedEntry = await cacheManager.get(cacheKey, programLogs, {
          validateInDatabase: true,
          logOperations
        });

        if (cachedEntry && cachedEntry.workoutLogId) {
          // Validate cached entry
          const validationResult = await cacheManager.validate(cacheKey, cachedEntry.workoutLogId, {
            validateInDatabase: true
          });

          if (validationResult.isValid) {
            if (logOperations) {
              logInfo(OperationType.CREATE, 'Workout log found in cache', {
                workoutLogId: cachedEntry.workoutLogId,
                cacheKey,
                source
              });
            }

            // End timer with cache hit
            endTimer(timerId, {
              success: true,
              workoutLogId: cachedEntry.workoutLogId,
              source: 'cache_hit'
            });

            return cachedEntry.workoutLogId;
          } else {
            // Cache validation failed - cleanup
            if (logOperations) {
              logWarn(OperationType.CREATE, 'Cache validation failed, cleaning up', {
                workoutLogId: cachedEntry.workoutLogId,
                reason: validationResult.reason,
                cacheKey
              });
            }

            await cacheManager.cleanup(cacheKey, programLogs, setProgramLogs, {
              reason: validationResult.reason
            });
          }
        }

        // Step 2: Query database for existing workout log
        let existingLog = null;
        try {
          existingLog = await this.getWorkoutLog(userId, programId, weekIndex, dayIndex);

          if (existingLog && existingLog.id) {
            if (logOperations) {
              logInfo(OperationType.CREATE, 'Workout log found in database', {
                workoutLogId: existingLog.id,
                userId,
                programId,
                weekIndex,
                dayIndex
              });
            }

            // Update cache with found workout log
            await cacheManager.set(cacheKey, {
              workoutLogId: existingLog.id,
              lastSaved: new Date().toISOString(),
              isValid: true,
              exercises: existingLog.workout_log_exercises || [],
              isWorkoutFinished: existingLog.is_finished || false,
              metadata: {
                source: 'database_query',
                operation: 'ensureWorkoutLogExists'
              }
            }, programLogs, setProgramLogs, {
              source: 'database_found'
            });

            // End timer with database hit
            endTimer(timerId, {
              success: true,
              workoutLogId: existingLog.id,
              source: 'database_hit'
            });

            return existingLog.id;
          }
        } catch (dbError) {
          if (logOperations) {
            logWarn(OperationType.CREATE, 'Database query failed, will create new workout log', {
              error: dbError.message,
              userId,
              programId,
              weekIndex,
              dayIndex
            });
          }
          // Continue to create new workout log
        }

        // Step 3: Create minimal workout log with default metadata
        if (logOperations) {
          logInfo(OperationType.CREATE, 'Creating minimal workout log', {
            userId,
            programId,
            weekIndex,
            dayIndex,
            workoutName: workoutName || `Week ${weekIndex + 1}, Day ${dayIndex + 1}`
          });
        }

        const newWorkoutLog = await this.createWorkoutLog(userId, {
          programId,
          weekIndex,
          dayIndex,
          name: workoutName || `Week ${weekIndex + 1}, Day ${dayIndex + 1}`,
          isFinished: false,
          isDraft: true, // Default to draft for new workout logs
          notes: '',
          exercises: [] // No exercises initially
        });

        // Cache the new workout log
        await cacheManager.set(cacheKey, {
          workoutLogId: newWorkoutLog.id,
          lastSaved: new Date().toISOString(),
          isValid: true,
          exercises: [],
          isWorkoutFinished: false,
          metadata: {
            source: 'minimal_creation',
            operation: 'ensureWorkoutLogExists'
          }
        }, programLogs, setProgramLogs, {
          source: 'minimal_create'
        });

        // End timer with creation
        const timing = endTimer(timerId, {
          success: true,
          workoutLogId: newWorkoutLog.id,
          source: 'created_new'
        });

        if (logOperations) {
          logInfo(OperationType.CREATE, 'Minimal workout log created successfully', {
            workoutLogId: newWorkoutLog.id,
            userId,
            programId,
            weekIndex,
            dayIndex,
            duration: timing?.duration
          });
        }

        return newWorkoutLog.id;

      } catch (error) {
        // End timer with error
        endTimer(timerId, {
          success: false,
          error: error.message,
          errorType: error.type || 'unknown'
        });

        logError(OperationType.CREATE, 'Failed to ensure workout log exists', {
          userId,
          programId,
          weekIndex,
          dayIndex,
          errorType: error.type || 'unknown',
          source
        }, error);

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.DATABASE_ERROR,
          `Failed to ensure workout log exists: ${error.message}`,
          {
            userId,
            programId,
            weekIndex,
            dayIndex,
            source
          },
          error
        );
      }
    }, 'ensureWorkoutLogExists');

    this._ensureLocks.set(lockKey, promise);
    try {
      const id = await promise;
      return id;
    } finally {
      this._ensureLocks.delete(lockKey);
    }
  }

  /**
   * Validate that a workout log ID exists and belongs to the specified user/program/week/day
   */
  async validateWorkoutLogId(workoutLogId, userId, programId, weekIndex, dayIndex) {
    return withSupabaseErrorHandling(async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('id', workoutLogId)
        .eq('user_id', userId)
        .eq('program_id', programId)
        .eq('week_index', weekIndex)
        .eq('day_index', dayIndex)
        .single()

      if (error || !data) {
        return false
      }

      return true
    }, 'validateWorkoutLogId')
  }

  /**
   * Cache-first save logic for workout logs
   * Implements comprehensive cache validation and fallback to database queries
   */
  async saveWorkoutLogCacheFirst(userId, programId, weekIndex, dayIndex, exerciseData, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        cacheManager = new WorkoutLogCacheManager(),
        programLogs = {},
        setProgramLogs = () => { },
        isImmediate = false,
        workoutName = null,
        isFinished = false,
        isDraft = false,
        notes = '',
        completedDate = null
      } = options;

      const cacheKey = cacheManager.generateKey(weekIndex, dayIndex);
      const operation = isImmediate ? 'immediateSaveLog' : 'debouncedSaveLog';

      console.log(`🚀 CACHE-FIRST SAVE: Starting ${operation}`, {
        userId,
        programId,
        weekIndex,
        dayIndex,
        cacheKey,
        exerciseCount: exerciseData?.length || 0
      });

      try {
        // Step 1: Check cache for existing workout log ID
        const cachedEntry = await cacheManager.get(cacheKey, programLogs, {
          validateInDatabase: true,
          logOperations: true
        });

        let workoutLogId = null;
        let existingLog = null;

        if (cachedEntry && cachedEntry.workoutLogId) {
          // Cache hit - validate the cached ID
          const validationResult = await cacheManager.validate(cacheKey, cachedEntry.workoutLogId, {
            validateInDatabase: true
          });

          if (validationResult.isValid) {
            workoutLogId = cachedEntry.workoutLogId;
            console.log('✅ CACHE HIT: Using validated cached workout log ID', {
              operation,
              cacheKey,
              workoutLogId,
              validationContext: validationResult.context
            });
          } else {
            // Cache validation failed - cleanup and fall back to database
            console.warn('⚠️ CACHE VALIDATION FAILED: Cleaning up and falling back to database', {
              operation,
              cacheKey,
              workoutLogId: cachedEntry.workoutLogId,
              reason: validationResult.reason,
              context: validationResult.context
            });

            await cacheManager.cleanup(cacheKey, programLogs, setProgramLogs, {
              reason: validationResult.reason
            });
          }
        }

        // Step 2: Query database if no valid cached ID
        if (!workoutLogId) {
          console.log('🔍 DATABASE QUERY: No valid cached ID, querying database', {
            operation,
            cacheKey,
            userId,
            programId,
            weekIndex,
            dayIndex
          });

          try {
            existingLog = await this.getWorkoutLog(userId, programId, weekIndex, dayIndex);
            if (existingLog && existingLog.id) {
              workoutLogId = existingLog.id;

              // Update cache with found workout log ID
              await cacheManager.set(cacheKey, {
                workoutLogId,
                lastSaved: new Date().toISOString(),
                isValid: true,
                exercises: exerciseData || [],
                isWorkoutFinished: isFinished,
                metadata: {
                  source: 'database_query',
                  operation
                }
              }, programLogs, setProgramLogs, {
                source: 'database_fallback'
              });

              console.log('✅ DATABASE FOUND: Cached existing workout log ID', {
                operation,
                cacheKey,
                workoutLogId,
                exerciseCount: existingLog.workout_log_exercises?.length || 0
              });
            }
          } catch (dbError) {
            console.error('❌ DATABASE QUERY FAILED: Treating as new workout', {
              operation,
              cacheKey,
              error: dbError.message,
              errorCode: dbError.code,
              fallbackAction: 'create_new_workout'
            });
            // Continue to create new workout log
          }
        }

        // Step 3: Create or update workout log with constraint violation handling
        let result;
        if (workoutLogId) {
          // Update existing workout log
          console.log('🔄 UPDATE OPERATION: Updating existing workout log', {
            operation,
            workoutLogId,
            exerciseCount: exerciseData?.length || 0
          });

          try {
            result = await this.updateWorkoutLog(workoutLogId, {
              name: workoutName,
              isFinished,
              isDraft,
              notes,
              completedDate: isFinished ? (completedDate || new Date().toISOString()) : null,
              exercises: exerciseData
            });
          } catch (updateError) {
            console.error('❌ UPDATE OPERATION FAILED:', {
              operation,
              workoutLogId,
              error: updateError.message,
              errorType: updateError.type
            });

            // Clean up cache on update failure
            await cacheManager.cleanup(cacheKey, programLogs, setProgramLogs, {
              reason: 'update_operation_failed'
            });

            throw updateError;
          }
        } else {
          // Create new workout log with constraint violation handling
          console.log('🆕 CREATE OPERATION: Creating new workout log', {
            operation,
            userId,
            programId,
            weekIndex,
            dayIndex,
            exerciseCount: exerciseData?.length || 0
          });

          try {
            result = await this.createWorkoutLog(userId, {
              programId,
              weekIndex,
              dayIndex,
              name: workoutName,
              isFinished,
              isDraft,
              notes,
              completedDate: isFinished ? (completedDate || new Date().toISOString()) : null,
              exercises: exerciseData
            });

            workoutLogId = result.id;

            // Cache the new workout log ID
            await cacheManager.set(cacheKey, {
              workoutLogId,
              lastSaved: new Date().toISOString(),
              isValid: true,
              exercises: exerciseData || [],
              isWorkoutFinished: isFinished,
              metadata: {
                source: 'create_operation',
                operation
              }
            }, programLogs, setProgramLogs, {
              source: 'create_new'
            });
          } catch (createError) {
            console.error('❌ CREATE OPERATION FAILED:', {
              operation,
              error: createError.message,
              errorType: createError.type,
              context: {
                userId,
                programId,
                weekIndex,
                dayIndex
              }
            });

            // Handle constraint violations specifically
            if (createError instanceof WorkoutLogError &&
              createError.type === WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION) {

              console.log('🔄 CONSTRAINT VIOLATION IN CACHE-FIRST: Attempting cache update', {
                operation,
                cacheKey,
                error: createError.message
              });

              // The constraint violation handler already attempted recovery
              // If we get here, the recovery was successful and result is in the error context
              if (createError.context && createError.context.recoveredLog) {
                result = createError.context.recoveredLog;
                workoutLogId = result.id;

                // Update cache with recovered workout log ID
                await cacheManager.set(cacheKey, {
                  workoutLogId,
                  lastSaved: new Date().toISOString(),
                  isValid: true,
                  exercises: exerciseData || [],
                  isWorkoutFinished: isFinished,
                  metadata: {
                    source: 'constraint_violation_recovery',
                    operation,
                    originalError: createError.message
                  }
                }, programLogs, setProgramLogs, {
                  source: 'constraint_recovery'
                });

                console.log('✅ CONSTRAINT VIOLATION RECOVERY IN CACHE-FIRST:', {
                  operation,
                  workoutLogId,
                  cacheKey
                });
              } else {
                // Recovery failed, clean up cache and re-throw
                await cacheManager.cleanup(cacheKey, programLogs, setProgramLogs, {
                  reason: 'constraint_violation_recovery_failed'
                });
                throw createError;
              }
            } else {
              // Other errors, clean up cache and re-throw
              await cacheManager.cleanup(cacheKey, programLogs, setProgramLogs, {
                reason: 'create_operation_failed'
              });
              throw createError;
            }
          }
        }

        console.log('✅ CACHE-FIRST SAVE SUCCESS:', {
          operation,
          workoutLogId: result.id,
          action: workoutLogId === result.id ? 'UPDATE' : 'CREATE',
          cacheKey,
          exerciseCount: exerciseData?.length || 0
        });

        return result;

      } catch (error) {
        console.error('❌ CACHE-FIRST SAVE ERROR:', {
          operation,
          cacheKey,
          error: error.message,
          errorName: error.name,
          stack: error.stack,
          context: {
            userId,
            programId,
            weekIndex,
            dayIndex,
            exerciseCount: exerciseData?.length || 0
          }
        });

        // Attempt cache cleanup on error
        try {
          await cacheManager.cleanup(cacheKey, programLogs, setProgramLogs, {
            reason: 'save_operation_failed'
          });
        } catch (cleanupError) {
          console.error('❌ CACHE CLEANUP FAILED:', cleanupError);
        }

        throw error;
      }
    }, 'saveWorkoutLogCacheFirst')
  }

  /**
   * Get workout log with cache-aware operations
   */
  async getWorkoutLogWithCache(userId, programId, weekIndex, dayIndex, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        cacheManager = new WorkoutLogCacheManager(),
        programLogs = {},
        setProgramLogs = () => { },
        forceRefresh = false
      } = options;

      const cacheKey = cacheManager.generateKey(weekIndex, dayIndex);

      try {
        // Check cache first unless force refresh is requested
        if (!forceRefresh) {
          const cachedEntry = await cacheManager.get(cacheKey, programLogs, {
            validateInDatabase: false, // Skip DB validation for read operations
            logOperations: true
          });

          if (cachedEntry && cachedEntry.workoutLogId) {
            console.log('✅ CACHE HIT: Using cached workout log for read operation', {
              cacheKey,
              workoutLogId: cachedEntry.workoutLogId
            });

            // Return cached data if available, otherwise fetch from database
            if (cachedEntry.exercises && cachedEntry.exercises.length > 0) {
              return {
                id: cachedEntry.workoutLogId,
                exercises: cachedEntry.exercises,
                is_finished: cachedEntry.isWorkoutFinished,
                // Add other cached properties as needed
              };
            }
          }
        }

        // Fetch from database
        const workoutLog = await this.getWorkoutLog(userId, programId, weekIndex, dayIndex);

        if (workoutLog) {
          // Update cache with fresh data
          await cacheManager.set(cacheKey, {
            workoutLogId: workoutLog.id,
            lastSaved: new Date().toISOString(),
            isValid: true,
            exercises: workoutLog.workout_log_exercises || [],
            isWorkoutFinished: workoutLog.is_finished || false,
            metadata: {
              source: 'database_read',
              operation: 'getWorkoutLogWithCache'
            }
          }, programLogs, setProgramLogs, {
            source: 'database_read'
          });
        }

        return workoutLog;
      } catch (error) {
        console.error('❌ GET WORKOUT LOG WITH CACHE ERROR:', {
          cacheKey,
          error: error.message,
          context: { userId, programId, weekIndex, dayIndex }
        });
        throw error;
      }
    }, 'getWorkoutLogWithCache')
  }

  /**
   * Get workout log by program, week, and day (with caching)
   */
  async getWorkoutLog(userId, programId, weekIndex, dayIndex) {
    return withSupabaseErrorHandling(async () => {
      const cacheKey = `workout_log_${userId}_${programId}_${weekIndex}_${dayIndex}`

      return supabaseCache.getWithCache(
        cacheKey,
        async () => {
          try {
            const { data, error } = await supabase
              .from('workout_logs')
              .select(`
                *,
                workout_log_exercises (
                  *,
                  exercises (
                    id,
                    name,
                    primary_muscle_group,
                    exercise_type,
                    instructions
                  )
                )
              `)
              .eq('user_id', userId)
              .eq('program_id', programId)
              .eq('week_index', weekIndex)
              .eq('day_index', dayIndex)
              .limit(1)

            if (error) {
              console.error('❌ getWorkoutLog query failed:', {
                error: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
                userId,
                programId,
                weekIndex,
                dayIndex
              })
              // Return null instead of throwing to prevent breaking the app
              return null
            }

            // Return null if no workout log found (empty array)
            if (!data || data.length === 0) {
              console.log('ℹ️ No workout log found:', { userId, programId, weekIndex, dayIndex })
              return null
            }

            // Get the first (and should be only) result
            const workoutLog = data[0]

            // Sort exercises by order_index
            if (workoutLog?.workout_log_exercises) {
              workoutLog.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
            }

            // Enhanced logging for workout log retrieval with comprehensive metadata
            console.log('✅ getWorkoutLog found existing log:', {
              logId: workoutLog.id,
              exerciseCount: workoutLog.workout_log_exercises?.length || 0,
              isFinished: workoutLog.is_finished,
              isDraft: workoutLog.is_draft,
              weekIndex: workoutLog.week_index,
              dayIndex: workoutLog.day_index,
              createdAt: workoutLog.created_at,
              updatedAt: workoutLog.updated_at,
              timestamp: new Date().toISOString()
            })

            return workoutLog
          } catch (queryError) {
            console.error('❌ getWorkoutLog failed completely:', queryError)
            // Return null instead of throwing to prevent breaking the app
            return null
          }
        },
        { ttl: this.CACHE_TTL }
      )
    }, 'getWorkoutLog')
  }

  /**
   * Get all workout logs for a program (with caching)
   */
  async getProgramWorkoutLogs(userId, programId) {
    return withSupabaseErrorHandling(async () => {
      const cacheKey = `program_workout_logs_${userId}_${programId}`

      return supabaseCache.getWithCache(
        cacheKey,
        async () => {
          const { data, error } = await supabase
            .from('workout_logs')
            .select(`
              *,
              workout_log_exercises (
                *,
                exercises (
                  id,
                  name,
                  primary_muscle_group,
                  exercise_type
                )
              )
            `)
            .eq('user_id', userId)
            .eq('program_id', programId)
            .order('week_index', { ascending: true })
            .order('day_index', { ascending: true })

          if (error) throw error

          // Sort exercises within each workout log
          data.forEach(log => {
            if (log.workout_log_exercises) {
              log.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
            }
          })

          return data
        },
        { ttl: this.PROGRAM_LOGS_CACHE_TTL }
      )
    }, 'getProgramWorkoutLogs')
  }

  /**
   * Update workout log with cache-aware operations and transaction boundaries
   */
  async updateWorkoutLog(workoutLogId, updates) {
    return withSupabaseErrorHandling(async () => {
      // Start transaction-like operation with rollback capability
      let transactionState = {
        workoutLogUpdated: false,
        exercisesUpdated: false,
        cacheInvalidated: false,
        originalData: null
      };

      try {
        // First, get the original data for potential rollback
        const { data: originalData, error: fetchError } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('id', workoutLogId)
          .single();

        if (fetchError) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.DATABASE_ERROR,
            `Failed to fetch original workout log data: ${fetchError.message}`,
            { workoutLogId, operation: 'updateWorkoutLog' },
            fetchError
          );
        }

        transactionState.originalData = originalData;

        console.log('🔄 UPDATE TRANSACTION START:', {
          workoutLogId,
          operation: 'updateWorkoutLog',
          hasExercises: !!updates.exercises,
          exerciseCount: updates.exercises?.length || 0,
          originalData: {
            name: originalData.name,
            isFinished: originalData.is_finished,
            isDraft: originalData.is_draft
          }
        });

        // Update workout log metadata
        const { data, error } = await supabase
          .from('workout_logs')
          .update({
            name: updates.name,
            is_finished: updates.isFinished,
            is_draft: updates.isDraft,
            completed_date: updates.completedDate,
            duration: updates.duration,
            notes: updates.notes,
            updated_at: new Date().toISOString()
          })
          .eq('id', workoutLogId)
          .select()
          .single()

        if (error) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.DATABASE_ERROR,
            `Failed to update workout log: ${error.message}`,
            {
              workoutLogId,
              updates: JSON.stringify(updates, null, 2),
              errorCode: error.code,
              errorDetails: error.details
            },
            error
          );
        }

        transactionState.workoutLogUpdated = true;

        // Update exercises if provided (within transaction boundary)
        if (updates.exercises) {
          try {
            // Use the new upsert method for efficient exercise updates
            const upsertResult = await this.upsertWorkoutExercises(workoutLogId, updates.exercises, {
              logOperations: true,
              useTransaction: true,
              validateData: true
            });

            transactionState.exercisesUpdated = true;

            console.log('✅ EXERCISES UPSERTED IN TRANSACTION:', {
              workoutLogId,
              exerciseCount: updates.exercises.length,
              operations: upsertResult.operations,
              totalChanges: upsertResult.operations.inserted + upsertResult.operations.updated + upsertResult.operations.deleted,
              operation: 'updateWorkoutLog'
            });
          } catch (exerciseError) {
            console.error('❌ EXERCISE UPSERT FAILED IN TRANSACTION:', {
              workoutLogId,
              exerciseError: exerciseError.message,
              rollbackRequired: true
            });

            // Exercise update failed - this is critical for data consistency
            throw new WorkoutLogError(
              WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
              `Failed to upsert exercises in transaction: ${exerciseError.message}`,
              {
                workoutLogId,
                exerciseCount: updates.exercises.length,
                transactionState
              },
              exerciseError
            );
          }
        }

        // Invalidate related caches (final step)
        if (data) {
          try {
            const patterns = [
              `workout_log_${data.user_id}_${data.program_id}_${data.week_index}_${data.day_index}`,
              `program_workout_logs_${data.user_id}_${data.program_id}`
            ];
            supabaseCache.invalidate(patterns);
            transactionState.cacheInvalidated = true;

            console.log('✅ UPDATE TRANSACTION SUCCESS:', {
              workoutLogId: data.id,
              userId: data.user_id,
              programId: data.program_id,
              weekIndex: data.week_index,
              dayIndex: data.day_index,
              exercisesUpdated: transactionState.exercisesUpdated,
              cacheInvalidated: transactionState.cacheInvalidated,
              transactionState
            });
          } catch (cacheError) {
            console.warn('⚠️ CACHE INVALIDATION FAILED (NON-CRITICAL):', {
              workoutLogId,
              cacheError: cacheError.message,
              transactionContinues: true
            });
            // Cache invalidation failure is not critical - continue
          }
        }

        return data;
      } catch (error) {
        console.error('❌ UPDATE TRANSACTION ERROR:', {
          workoutLogId,
          error: error.message,
          errorType: error.type || 'unknown',
          transactionState,
          rollbackAttempted: false
        });

        // For now, we don't implement automatic rollback as Supabase doesn't support transactions
        // In a real implementation, you would use database transactions
        console.warn('⚠️ TRANSACTION ROLLBACK NOT IMPLEMENTED:', {
          workoutLogId,
          transactionState,
          note: 'Manual cleanup may be required'
        });

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.TRANSACTION_FAILED,
          `Update transaction failed: ${error.message}`,
          {
            workoutLogId,
            transactionState,
            originalError: error.message
          },
          error
        );
      }
    }, 'updateWorkoutLog')
  }

  /**
   * Upsert workout exercises using intelligent change detection
   * Replaces delete-and-recreate with efficient insert/update/delete operations
   */
  async upsertWorkoutExercises(workoutLogId, exercises, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        logOperations = true,
        useTransaction = true,
        validateData = true
      } = options;

      if (logOperations) {
        console.log('🚀 UPSERT EXERCISES START:', {
          workoutLogId,
          exerciseCount: exercises?.length || 0,
          options
        });
      }

      // Validate input
      if (!workoutLogId || typeof workoutLogId !== 'string') {
        throw new WorkoutLogError(
          WorkoutLogErrorType.INVALID_DATA,
          'Invalid workout log ID for exercise upsert',
          { workoutLogId, type: typeof workoutLogId }
        );
      }

      if (!Array.isArray(exercises)) {
        throw new WorkoutLogError(
          WorkoutLogErrorType.INVALID_DATA,
          'Exercises must be an array',
          { exercises: typeof exercises }
        );
      }

      try {
        // Step 1: Get existing exercises from database
        const { data: existingExercises, error: fetchError } = await supabase
          .from('workout_log_exercises')
          .select('*')
          .eq('workout_log_id', workoutLogId)
          .order('order_index', { ascending: true });

        if (fetchError) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.DATABASE_ERROR,
            `Failed to fetch existing exercises: ${fetchError.message}`,
            { workoutLogId, errorCode: fetchError.code },
            fetchError
          );
        }

        if (logOperations) {
          console.log('📋 EXISTING EXERCISES FETCHED:', {
            workoutLogId,
            existingCount: existingExercises?.length || 0
          });
        }

        // Step 2: Use change detection to identify operations needed
        const { ExerciseChangeDetector } = await import('../utils/exerciseChangeDetection.js');
        const detector = new ExerciseChangeDetector({
          trackOrderChanges: true,
          deepCompare: true,
          logOperations: logOperations
        });

        const comparisonResult = detector.compareExercises(existingExercises || [], exercises);

        if (logOperations) {
          console.log('🔍 CHANGE DETECTION COMPLETE:', {
            workoutLogId,
            hasChanges: comparisonResult.hasChanges,
            summary: comparisonResult.summary,
            changeTypes: comparisonResult.changes.metadata.changeTypes
          });
        }

        // If no changes detected, return early
        if (!comparisonResult.hasChanges) {
          if (logOperations) {
            console.log('✅ NO CHANGES DETECTED - SKIPPING UPSERT:', {
              workoutLogId,
              existingCount: existingExercises?.length || 0,
              updatedCount: exercises.length
            });
          }
          return {
            success: true,
            operations: { inserted: 0, updated: 0, deleted: 0 },
            message: 'No changes detected'
          };
        }

        const { changes } = comparisonResult;
        let operationResults = {
          inserted: 0,
          updated: 0,
          deleted: 0,
          errors: []
        };

        // Step 3: Execute operations in transaction-like manner
        if (useTransaction) {
          // Note: Supabase doesn't support true transactions, but we'll execute in order
          // and track operations for potential rollback
          if (logOperations) {
            console.log('🔄 EXECUTING UPSERT OPERATIONS:', {
              workoutLogId,
              toInsert: changes.toInsert.length,
              toUpdate: changes.toUpdate.length,
              toDelete: changes.toDelete.length,
              orderChanged: changes.orderChanged
            });
          }
        }

        // Step 4: Delete exercises that are no longer needed
        if (changes.toDelete.length > 0) {
          try {
            const { error: deleteError } = await supabase
              .from('workout_log_exercises')
              .delete()
              .in('id', changes.toDelete);

            if (deleteError) {
              throw new WorkoutLogError(
                WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
                `Failed to delete exercises: ${deleteError.message}`,
                { workoutLogId, exerciseIds: changes.toDelete },
                deleteError
              );
            }

            operationResults.deleted = changes.toDelete.length;

            if (logOperations) {
              console.log('🗑️ EXERCISES DELETED:', {
                workoutLogId,
                deletedCount: changes.toDelete.length,
                deletedIds: changes.toDelete
              });
            }
          } catch (deleteError) {
            operationResults.errors.push({
              operation: 'delete',
              error: deleteError.message,
              exerciseIds: changes.toDelete
            });
            throw deleteError;
          }
        }

        // Step 5: Update existing exercises
        if (changes.toUpdate.length > 0) {
          try {
            for (const exercise of changes.toUpdate) {
              const updateData = this._prepareExerciseData(exercise, workoutLogId);

              const { error: updateError } = await supabase
                .from('workout_log_exercises')
                .update(updateData)
                .eq('id', exercise.id);

              if (updateError) {
                throw new WorkoutLogError(
                  WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
                  `Failed to update exercise ${exercise.id}: ${updateError.message}`,
                  { workoutLogId, exerciseId: exercise.id, updateData },
                  updateError
                );
              }

              operationResults.updated++;
            }

            if (logOperations) {
              console.log('✏️ EXERCISES UPDATED:', {
                workoutLogId,
                updatedCount: changes.toUpdate.length,
                updatedIds: changes.toUpdate.map(ex => ex.id)
              });
            }
          } catch (updateError) {
            operationResults.errors.push({
              operation: 'update',
              error: updateError.message,
              exercises: changes.toUpdate.map(ex => ex.id)
            });
            throw updateError;
          }
        }

        // Step 6: Insert new exercises
        if (changes.toInsert.length > 0) {
          try {
            const insertData = changes.toInsert.map(exercise =>
              this._prepareExerciseData(exercise, workoutLogId)
            );

            const { data: insertedExercises, error: insertError } = await supabase
              .from('workout_log_exercises')
              .insert(insertData)
              .select('id');

            if (insertError) {
              // Handle unique constraint violation for duplicate exercises
              if (ConstraintViolationHandler.isUniqueConstraintViolation(insertError)) {
                const violationDetails = ConstraintViolationHandler.extractConstraintDetails(insertError);
                const userMessage = ConstraintViolationHandler.createUserFriendlyMessage(insertError, {
                  workoutLogId,
                  exerciseId: insertData[0]?.exercise_id // First exercise that caused the violation
                });

                console.warn('⚠️ EXERCISE DUPLICATE DETECTED DURING INSERT:', {
                  workoutLogId,
                  constraintDetails: violationDetails,
                  userMessage,
                  attemptedInserts: insertData.length
                });

                // For batch inserts, we need to handle this differently
                // Return partial success with the constraint violation details
                operationResults.errors.push({
                  operation: 'insert',
                  error: insertError.message,
                  type: 'unique_constraint_violation',
                  constraintDetails: violationDetails,
                  userMessage,
                  exercises: changes.toInsert.length
                });

                // Don't throw - allow partial success
                operationResults.inserted = 0; // No exercises were actually inserted due to constraint
              } else {
                throw new WorkoutLogError(
                  WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
                  `Failed to insert exercises: ${insertError.message}`,
                  { workoutLogId, insertData },
                  insertError
                );
              }
            } else {
              operationResults.inserted = insertedExercises?.length || 0;

              if (logOperations) {
                console.log('➕ EXERCISES INSERTED:', {
                  workoutLogId,
                  insertedCount: operationResults.inserted,
                  insertedIds: insertedExercises?.map(ex => ex.id) || []
                });
              }
            }
          } catch (insertError) {
            // Only add to errors if not already handled as constraint violation
            if (!ConstraintViolationHandler.isUniqueConstraintViolation(insertError)) {
              operationResults.errors.push({
                operation: 'insert',
                error: insertError.message,
                exercises: changes.toInsert.length
              });
              throw insertError;
            }
          }
        }

        // Step 7: Handle order changes if needed
        if (changes.orderChanged) {
          try {
            const reorderResult = await this.reorderExercises(workoutLogId, exercises, {
              logOperations,
              validateConsistency: true,
              batchUpdates: exercises.length > 5 // Use batch updates for larger sets
            });

            if (logOperations) {
              console.log('🔄 EXERCISE ORDER UPDATED:', {
                workoutLogId,
                exerciseCount: exercises.length,
                updatedCount: reorderResult.updatedCount,
                reorderResult
              });
            }
          } catch (orderError) {
            operationResults.errors.push({
              operation: 'reorder',
              error: orderError.message,
              workoutLogId
            });
            // Order changes are not critical - log but don't fail
            console.warn('⚠️ EXERCISE REORDER FAILED (NON-CRITICAL):', {
              workoutLogId,
              error: orderError.message,
              errorType: orderError.type || 'unknown'
            });
          }
        }

        if (logOperations) {
          console.log('✅ UPSERT EXERCISES SUCCESS:', {
            workoutLogId,
            operations: operationResults,
            totalChanges: operationResults.inserted + operationResults.updated + operationResults.deleted,
            hasErrors: operationResults.errors.length > 0
          });
        }

        return {
          success: true,
          operations: operationResults,
          changes: comparisonResult.changes,
          summary: comparisonResult.summary
        };

      } catch (error) {
        console.error('❌ UPSERT EXERCISES ERROR:', {
          workoutLogId,
          error: error.message,
          errorType: error.type || 'unknown',
          exerciseCount: exercises?.length || 0,
          stack: error.stack
        });

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
          `Exercise upsert failed: ${error.message}`,
          {
            workoutLogId,
            exerciseCount: exercises?.length || 0
          },
          error
        );
      }
    }, 'upsertWorkoutExercises')
  }

  /**
   * Prepare exercise data for database operations
   * @private
   */
  _prepareExerciseData(exercise, workoutLogId) {
    // Validate and sanitize exercise data
    const sets = exercise.sets && exercise.sets !== '' ? Number(exercise.sets) : 1;
    const exerciseId = exercise.exerciseId && exercise.exerciseId !== '' ? exercise.exerciseId : null;
    const bodyweight = exercise.bodyweight && exercise.bodyweight !== '' ? Number(exercise.bodyweight) : null;

    // Validate required fields
    if (!exerciseId) {
      throw new Error(`Exercise ID is required for exercise preparation`);
    }

    if (isNaN(sets) || sets <= 0) {
      throw new Error(`Invalid sets value for exercise preparation: ${exercise.sets}`);
    }

    // Ensure arrays match the sets count (required by DB constraint)
    const reps = exercise.reps || [];
    const weights = exercise.weights || [];
    const completed = exercise.completed || [];

    // Pad or trim arrays to match sets count
    const paddedReps = [...reps];
    const paddedWeights = [...weights];
    const paddedCompleted = [...completed];

    // Pad with null values for uncompleted sets (preserve empty state)
    while (paddedReps.length < sets) paddedReps.push(null);
    while (paddedWeights.length < sets) paddedWeights.push(null);
    while (paddedCompleted.length < sets) paddedCompleted.push(false);

    // Trim if arrays are too long
    paddedReps.length = sets;
    paddedWeights.length = sets;
    paddedCompleted.length = sets;

    // Convert empty strings to null for database storage (preserve uncompleted state)
    const cleanedReps = paddedReps.map(rep => rep === '' || rep === undefined ? null : rep);
    const cleanedWeights = paddedWeights.map(weight => weight === '' || weight === undefined ? null : weight);

    return {
      workout_log_id: workoutLogId,
      exercise_id: exerciseId,
      sets: sets,
      reps: cleanedReps,
      weights: cleanedWeights,
      completed: paddedCompleted,
      bodyweight: bodyweight,
      notes: exercise.notes || '',
      is_added: exercise.isAdded || false,
      added_type: exercise.addedType || null,
      original_index: exercise.originalIndex || -1,
      order_index: exercise.orderIndex !== undefined ? exercise.orderIndex : 0
    };
  }

  /**
   * Efficiently reorder exercises to match the provided order
   * Only updates order_index values when necessary and validates consistency
   */
  async reorderExercises(workoutLogId, exercises, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        logOperations = true,
        validateConsistency = true,
        batchUpdates = true
      } = options;

      // Validate inputs
      if (!workoutLogId || typeof workoutLogId !== 'string') {
        throw new WorkoutLogError(
          WorkoutLogErrorType.INVALID_DATA,
          'Invalid workout log ID for exercise reordering',
          { workoutLogId, type: typeof workoutLogId }
        );
      }

      if (!Array.isArray(exercises)) {
        throw new WorkoutLogError(
          WorkoutLogErrorType.INVALID_DATA,
          'Exercises must be an array for reordering',
          { exercises: typeof exercises }
        );
      }

      if (exercises.length === 0) {
        if (logOperations) {
          console.log('ℹ️ REORDER EXERCISES: No exercises to reorder');
        }
        return {
          success: true,
          updatedCount: 0,
          message: 'No exercises to reorder'
        };
      }

      if (logOperations) {
        console.log('🔄 REORDER EXERCISES START:', {
          workoutLogId,
          exerciseCount: exercises.length,
          exercisesWithIds: exercises.filter(ex => ex.id).length,
          options
        });
      }

      try {
        // Step 1: Get current exercise order from database for comparison
        let currentExercises = [];
        if (validateConsistency) {
          const { data: dbExercises, error: fetchError } = await supabase
            .from('workout_log_exercises')
            .select('id, order_index, exercise_id')
            .eq('workout_log_id', workoutLogId)
            .order('order_index', { ascending: true });

          if (fetchError) {
            console.warn('⚠️ REORDER: Could not fetch current exercises for validation:', fetchError.message);
            // Continue without validation rather than failing
          } else {
            currentExercises = dbExercises || [];
          }
        }

        // Step 2: Validate exercise order consistency
        if (validateConsistency && currentExercises.length > 0) {
          const validationResult = this._validateExerciseOrderConsistency(
            currentExercises,
            exercises,
            workoutLogId
          );

          if (!validationResult.isValid) {
            console.warn('⚠️ EXERCISE ORDER INCONSISTENCY DETECTED:', validationResult);
            // Log warning but continue - order will be corrected
          }
        }

        // Step 3: Determine which exercises need order updates
        const exercisesToUpdate = this._identifyOrderUpdatesNeeded(
          currentExercises,
          exercises,
          logOperations
        );

        if (exercisesToUpdate.length === 0) {
          if (logOperations) {
            console.log('✅ REORDER EXERCISES: No order changes needed');
          }
          return {
            success: true,
            updatedCount: 0,
            message: 'Exercise order already correct'
          };
        }

        // Step 4: Execute order updates efficiently
        let updatedCount = 0;
        const updateErrors = [];

        if (batchUpdates && exercisesToUpdate.length > 1) {
          // Use batch update approach for better performance
          updatedCount = await this._batchUpdateExerciseOrder(
            exercisesToUpdate,
            workoutLogId,
            logOperations
          );
        } else {
          // Use individual updates for better error handling
          for (const update of exercisesToUpdate) {
            try {
              const { error: updateError } = await supabase
                .from('workout_log_exercises')
                .update({ order_index: update.newOrderIndex })
                .eq('id', update.exerciseId)
                .eq('workout_log_id', workoutLogId); // Additional safety check

              if (updateError) {
                const errorDetails = {
                  workoutLogId,
                  exerciseId: update.exerciseId,
                  oldOrderIndex: update.oldOrderIndex,
                  newOrderIndex: update.newOrderIndex,
                  error: updateError.message
                };

                console.error('❌ REORDER UPDATE FAILED:', errorDetails);
                updateErrors.push(errorDetails);

                throw new WorkoutLogError(
                  WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
                  `Failed to update exercise order: ${updateError.message}`,
                  errorDetails,
                  updateError
                );
              }

              updatedCount++;

              if (logOperations) {
                console.log('✅ EXERCISE ORDER UPDATED:', {
                  workoutLogId,
                  exerciseId: update.exerciseId,
                  oldOrderIndex: update.oldOrderIndex,
                  newOrderIndex: update.newOrderIndex
                });
              }
            } catch (updateError) {
              updateErrors.push({
                exerciseId: update.exerciseId,
                error: updateError.message
              });
              throw updateError; // Re-throw to stop processing
            }
          }
        }

        // Step 5: Final validation if requested
        if (validateConsistency && updatedCount > 0) {
          const finalValidation = await this._validateFinalExerciseOrder(
            workoutLogId,
            exercises,
            logOperations
          );

          if (!finalValidation.isValid) {
            console.error('❌ FINAL ORDER VALIDATION FAILED:', finalValidation);
            // This is a serious issue but don't fail the operation
            // The order updates were applied, just not as expected
          }
        }

        if (logOperations) {
          console.log('✅ REORDER EXERCISES SUCCESS:', {
            workoutLogId,
            totalExercises: exercises.length,
            exercisesWithIds: exercises.filter(ex => ex.id).length,
            updatesNeeded: exercisesToUpdate.length,
            updatedCount,
            hasErrors: updateErrors.length > 0,
            errors: updateErrors
          });
        }

        return {
          success: true,
          updatedCount,
          totalExercises: exercises.length,
          exercisesWithIds: exercises.filter(ex => ex.id).length,
          updatesNeeded: exercisesToUpdate.length,
          errors: updateErrors
        };

      } catch (error) {
        console.error('❌ REORDER EXERCISES ERROR:', {
          workoutLogId,
          error: error.message,
          errorType: error.type || 'unknown',
          exerciseCount: exercises.length,
          stack: error.stack
        });

        // Re-throw WorkoutLogError as-is, wrap others
        if (error instanceof WorkoutLogError) {
          throw error;
        }

        throw new WorkoutLogError(
          WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
          `Exercise reordering failed: ${error.message}`,
          {
            workoutLogId,
            exerciseCount: exercises.length
          },
          error
        );
      }
    }, 'reorderExercises')
  }

  /**
   * Validate exercise order consistency between database and provided exercises
   * @private
   */
  _validateExerciseOrderConsistency(currentExercises, providedExercises, workoutLogId) {
    const validation = {
      isValid: true,
      issues: [],
      workoutLogId,
      currentCount: currentExercises.length,
      providedCount: providedExercises.length
    };

    try {
      // Check if all provided exercises with IDs exist in current exercises
      const currentExerciseIds = new Set(currentExercises.map(ex => ex.id));
      const providedExercisesWithIds = providedExercises.filter(ex => ex.id);

      for (const providedEx of providedExercisesWithIds) {
        if (!currentExerciseIds.has(providedEx.id)) {
          validation.isValid = false;
          validation.issues.push({
            type: 'missing_exercise',
            exerciseId: providedEx.id,
            message: `Exercise ${providedEx.id} not found in current database exercises`
          });
        }
      }

      // Check for duplicate order indices in current exercises
      const currentOrderIndices = currentExercises.map(ex => ex.order_index);
      const duplicateIndices = currentOrderIndices.filter((index, pos) =>
        currentOrderIndices.indexOf(index) !== pos
      );

      if (duplicateIndices.length > 0) {
        validation.isValid = false;
        validation.issues.push({
          type: 'duplicate_order_indices',
          duplicates: duplicateIndices,
          message: `Duplicate order indices found: ${duplicateIndices.join(', ')}`
        });
      }

      // Check for gaps in order sequence
      const sortedIndices = [...currentOrderIndices].sort((a, b) => a - b);
      for (let i = 0; i < sortedIndices.length; i++) {
        if (sortedIndices[i] !== i) {
          validation.issues.push({
            type: 'order_sequence_gap',
            expectedIndex: i,
            actualIndex: sortedIndices[i],
            message: `Order sequence gap: expected ${i}, found ${sortedIndices[i]}`
          });
          // This is not necessarily invalid, just noteworthy
        }
      }

    } catch (error) {
      validation.isValid = false;
      validation.issues.push({
        type: 'validation_error',
        error: error.message,
        message: `Error during order consistency validation: ${error.message}`
      });
    }

    return validation;
  }

  /**
   * Identify which exercises need order index updates
   * @private
   */
  _identifyOrderUpdatesNeeded(currentExercises, providedExercises, logOperations = false) {
    const updatesNeeded = [];

    // Create lookup map for current exercises
    const currentExerciseMap = new Map();
    currentExercises.forEach(ex => {
      currentExerciseMap.set(ex.id, ex.order_index);
    });

    // Check each provided exercise to see if order needs updating
    providedExercises.forEach((exercise, newIndex) => {
      if (exercise.id && currentExerciseMap.has(exercise.id)) {
        const currentOrderIndex = currentExerciseMap.get(exercise.id);

        // Only update if the order index actually changed
        if (currentOrderIndex !== newIndex) {
          updatesNeeded.push({
            exerciseId: exercise.id,
            oldOrderIndex: currentOrderIndex,
            newOrderIndex: newIndex,
            exerciseType: exercise.exerciseId || 'unknown'
          });
        }
      }
    });

    if (logOperations && updatesNeeded.length > 0) {
      console.log('🔍 ORDER UPDATES IDENTIFIED:', {
        totalExercises: providedExercises.length,
        exercisesWithIds: providedExercises.filter(ex => ex.id).length,
        updatesNeeded: updatesNeeded.length,
        updates: updatesNeeded.map(u => ({
          id: u.exerciseId,
          from: u.oldOrderIndex,
          to: u.newOrderIndex
        }))
      });
    }

    return updatesNeeded;
  }

  /**
   * Batch update exercise order for better performance
   * @private
   */
  async _batchUpdateExerciseOrder(exercisesToUpdate, workoutLogId, logOperations = false) {
    if (logOperations) {
      console.log('🚀 BATCH ORDER UPDATE START:', {
        workoutLogId,
        updateCount: exercisesToUpdate.length
      });
    }

    let updatedCount = 0;
    const batchSize = 10; // Process in batches to avoid overwhelming the database

    for (let i = 0; i < exercisesToUpdate.length; i += batchSize) {
      const batch = exercisesToUpdate.slice(i, i + batchSize);

      // Execute batch updates in parallel
      const batchPromises = batch.map(async (update) => {
        const { error } = await supabase
          .from('workout_log_exercises')
          .update({ order_index: update.newOrderIndex })
          .eq('id', update.exerciseId)
          .eq('workout_log_id', workoutLogId);

        if (error) {
          throw new WorkoutLogError(
            WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
            `Batch order update failed for exercise ${update.exerciseId}: ${error.message}`,
            {
              workoutLogId,
              exerciseId: update.exerciseId,
              oldOrderIndex: update.oldOrderIndex,
              newOrderIndex: update.newOrderIndex
            },
            error
          );
        }

        return update;
      });

      try {
        const batchResults = await Promise.all(batchPromises);
        updatedCount += batchResults.length;

        if (logOperations) {
          console.log('✅ BATCH ORDER UPDATE COMPLETE:', {
            workoutLogId,
            batchNumber: Math.floor(i / batchSize) + 1,
            batchSize: batchResults.length,
            totalUpdated: updatedCount
          });
        }
      } catch (batchError) {
        console.error('❌ BATCH ORDER UPDATE FAILED:', {
          workoutLogId,
          batchNumber: Math.floor(i / batchSize) + 1,
          error: batchError.message
        });
        throw batchError;
      }
    }

    return updatedCount;
  }

  /**
   * Validate final exercise order after updates
   * @private
   */
  async _validateFinalExerciseOrder(workoutLogId, expectedExercises, logOperations = false) {
    const validation = {
      isValid: true,
      issues: [],
      workoutLogId
    };

    try {
      // Fetch current order from database
      const { data: finalExercises, error: fetchError } = await supabase
        .from('workout_log_exercises')
        .select('id, order_index, exercise_id')
        .eq('workout_log_id', workoutLogId)
        .order('order_index', { ascending: true });

      if (fetchError) {
        validation.isValid = false;
        validation.issues.push({
          type: 'fetch_error',
          error: fetchError.message,
          message: `Could not fetch exercises for final validation: ${fetchError.message}`
        });
        return validation;
      }

      // Create maps for comparison
      const finalOrderMap = new Map();
      finalExercises.forEach(ex => {
        finalOrderMap.set(ex.id, ex.order_index);
      });

      // Check if expected order matches final order
      expectedExercises.forEach((exercise, expectedIndex) => {
        if (exercise.id && finalOrderMap.has(exercise.id)) {
          const actualIndex = finalOrderMap.get(exercise.id);
          if (actualIndex !== expectedIndex) {
            validation.isValid = false;
            validation.issues.push({
              type: 'order_mismatch',
              exerciseId: exercise.id,
              expectedIndex,
              actualIndex,
              message: `Exercise ${exercise.id} has order ${actualIndex}, expected ${expectedIndex}`
            });
          }
        }
      });

      if (logOperations) {
        console.log('🔍 FINAL ORDER VALIDATION:', {
          workoutLogId,
          isValid: validation.isValid,
          issueCount: validation.issues.length,
          expectedCount: expectedExercises.filter(ex => ex.id).length,
          actualCount: finalExercises.length
        });
      }

    } catch (error) {
      validation.isValid = false;
      validation.issues.push({
        type: 'validation_error',
        error: error.message,
        message: `Error during final order validation: ${error.message}`
      });
    }

    return validation;
  }

  /**
   * Update workout log exercises (legacy method - now uses upsert)
   */
  async updateWorkoutLogExercises(workoutLogId, exercises) {
    return withSupabaseErrorHandling(async () => {
      console.log('⚠️ LEGACY METHOD CALLED: updateWorkoutLogExercises - redirecting to upsert', {
        workoutLogId,
        exerciseCount: exercises?.length || 0
      });

      // Use the new upsert method instead of delete-and-recreate
      const result = await this.upsertWorkoutExercises(workoutLogId, exercises, {
        logOperations: true,
        useTransaction: true,
        validateData: true
      });

      console.log('✅ LEGACY METHOD COMPLETED VIA UPSERT:', {
        workoutLogId,
        operations: result.operations,
        success: result.success
      });

      return result;
    }, 'updateWorkoutLogExercises')
  }

  /**
   * Delete workout log
   */
  async deleteWorkoutLog(workoutLogId) {
    return withSupabaseErrorHandling(async () => {
      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('id', workoutLogId)

      if (error) throw error
    }, 'deleteWorkoutLog')
  }

  /**
   * Save workout as draft (single-draft mode)
   */
  async saveDraft(authUserId, exercises, workoutName, existingDraftId = null) {
    return withSupabaseErrorHandling(async () => {
      if (!authUserId || !exercises || exercises.length === 0) {
        throw new Error('Invalid parameters for saving draft')
      }

      // First get the internal user ID from the auth user ID
      // const { data: userData, error: userError } = await supabase
      //   .from('users')
      //   .select('id')
      //   .eq('auth_id', authUserId)
      //   .single()

      // if (userError) throw userError
      // if (!userData) throw new Error('User not found')

      // const internalUserId = userData.id

      // Validate and sanitize exercises data before saving
      const validatedExercises = exercises.map((ex, index) => {
        if (!ex.exerciseId || ex.exerciseId === '') {
          throw new Error(`Exercise ID is required for exercise at index ${index}`)
        }

        // Handle sets - ensure it's a valid positive integer (must be > 0 per DB constraint)
        let sets = 1 // Default to 1 set minimum
        if (ex.sets !== undefined && ex.sets !== null && ex.sets !== '') {
          sets = Number(ex.sets)
          if (isNaN(sets) || sets <= 0) {
            sets = 1 // Ensure at least 1 set
          }
        }

        // Handle bodyweight - ensure it's a valid number or null
        let bodyweight = null
        if (ex.bodyweight !== undefined && ex.bodyweight !== null && ex.bodyweight !== '') {
          const bw = Number(ex.bodyweight)
          if (!isNaN(bw) && bw > 0) {
            bodyweight = bw
          }
        }

        return {
          ...ex,
          sets: sets,
          bodyweight: bodyweight
        }
      })

      const draftData = {
        user_id: authUserId,
        programId: null, // Quick workouts are not tied to a program
        weekIndex: null,
        dayIndex: null,
        name: workoutName || `Quick Workout - ${new Date().toLocaleDateString()}`,
        type: 'quick_workout',
        date: new Date().toISOString().split('T')[0],
        isFinished: false,
        isDraft: true,
        weightUnit: 'LB',
        updated_at: new Date().toISOString()
      }

      let workoutLog

      // Check for existing draft if no ID provided
      if (!existingDraftId) {
        const existingDraft = await this.getSingleDraft(authUserId)
        if (existingDraft) {
          existingDraftId = existingDraft.id
        }
      }

      if (existingDraftId) {
        // Update existing draft
        const { data, error } = await supabase
          .from('workout_logs')
          .update({
            program_id: draftData.programId,
            week_index: draftData.weekIndex,
            day_index: draftData.dayIndex,
            name: draftData.name,
            type: draftData.type,
            date: draftData.date,
            is_finished: draftData.isFinished,
            is_draft: draftData.isDraft,
            weight_unit: draftData.weightUnit,
            updated_at: draftData.updated_at
          })
          .eq('id', existingDraftId)
          .select()
          .single()

        if (error) throw error
        workoutLog = data

        // Update exercises
        await this.updateWorkoutLogExercises(existingDraftId, validatedExercises)
      } else {
        // Clean up any orphaned drafts first
        await this.cleanupAllDrafts(authUserId)

        // Create new draft
        workoutLog = await this.createWorkoutLog(authUserId, {
          ...draftData,
          exercises: validatedExercises
        })
      }

      return workoutLog
    }, 'saveDraft')
  }

  /**
   * Get single draft for user
   */
  async getSingleDraft(authUserId) {
    return withSupabaseErrorHandling(async () => {
      // First get the internal user ID from the auth user ID
      // const { data: userData, error: userError } = await supabase
      //   .from('users')
      //   .select('id')
      //   .eq('auth_id', authUserId)
      //   .single()

      // if (userError) throw userError
      // if (!userData) throw new Error('User not found')

      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          *,
          workout_log_exercises (
            *,
            exercises (
              id,
              name,
              primary_muscle_group,
              exercise_type
            )
          )
        `)
        .eq('user_id', authUserId)
        .eq('is_draft', true)
        .eq('type', 'quick_workout')
        .order('updated_at', { ascending: false })
        .limit(1)

      if (error) throw error

      // Return null if no draft found
      if (!data || data.length === 0) return null

      // Get the first (most recent) draft
      const draft = data[0]

      // Sort exercises by order_index
      if (draft?.workout_log_exercises) {
        draft.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
      }

      return draft
    }, 'getSingleDraft')
  }

  /**
   * Load all drafts for user
   */
  async loadDrafts(userId, limit = 5) {
    return withSupabaseErrorHandling(async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          *,
          workout_log_exercises (
            *,
            exercises (
              id,
              name,
              primary_muscle_group,
              exercise_type
            )
          )
        `)
        .eq('user_id', userId)
        .eq('is_draft', true)
        .eq('type', 'quick_workout')
        .order('updated_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      // Sort exercises within each draft
      data.forEach(draft => {
        if (draft.workout_log_exercises) {
          draft.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })

      return data
    }, 'loadDrafts')
  }

  /**
   * Delete specific draft
   */
  async deleteDraft(authUserId, draftId) {
    return withSupabaseErrorHandling(async () => {
      // First get the internal user ID from the auth user ID
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('id', authUserId)
        .single()

      if (userError) throw userError
      if (!userData) throw new Error('User not found')

      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('id', draftId)
        .eq('user_id', userData.id)
        .eq('is_draft', true)

      if (error) throw error
    }, 'deleteDraft')
  }

  /**
   * Complete draft workout
   */
  async completeDraft(authUserId, draftId, exercises, workoutName) {
    return withSupabaseErrorHandling(async () => {
      // First get the internal user ID from the auth user ID
      // const { data: userData, error: userError } = await supabase
      //   .from('users')
      //   .select('id')
      //   .eq('auth_id', authUserId)
      //   .single()

      // if (userError) throw userError
      // if (!userData) throw new Error('User not found')

      // const internalUserId = userData.id

      const completedData = {
        name: workoutName || `Quick Workout - ${new Date().toLocaleDateString()}`,
        is_draft: false,
        is_finished: true,
        completed_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('workout_logs')
        .update(completedData)
        .eq('id', draftId)
        .eq('user_id', authUserId)
        .select()
        .single()

      if (error) throw error

      // Update exercises if provided
      if (exercises) {
        await this.updateWorkoutLogExercises(draftId, exercises)
      }

      // Update user analytics
      await this.updateUserAnalytics(authUserId, exercises)

      return data
    }, 'completeDraft')
  }

  /**
   * Clean up all drafts for user
   */
  async cleanupAllDrafts(userId) {
    return withSupabaseErrorHandling(async () => {
      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('user_id', userId)
        .eq('is_draft', true)
        .eq('type', 'quick_workout')

      if (error) throw error
    }, 'cleanupAllDrafts')
  }

  /**
   * Clean up old drafts (older than threshold)
   */
  async cleanupOldDrafts(userId, thresholdDays = 7) {
    return withSupabaseErrorHandling(async () => {
      const thresholdDate = new Date()
      thresholdDate.setDate(thresholdDate.getDate() - thresholdDays)

      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('user_id', userId)
        .eq('is_draft', true)
        .lt('updated_at', thresholdDate.toISOString())

      if (error) throw error
    }, 'cleanupOldDrafts')
  }

  /**
   * Get workout history for user
   */
  async getWorkoutHistory(userId, limit = 20, offset = 0) {
    return withSupabaseErrorHandling(async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          *,
          workout_log_exercises (
            *,
            exercises (
              id,
              name,
              primary_muscle_group,
              exercise_type
            )
          )
        `)
        .eq('user_id', userId)
        .eq('is_finished', true)
        .order('completed_date', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      // Sort exercises within each workout
      data.forEach(workout => {
        if (workout.workout_log_exercises) {
          workout.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })

      return data
    }, 'getWorkoutHistory')
  }

  /**
   * Get exercise history for specific exercise (with caching)
   */
  async getExerciseHistory(userId, exerciseId, limit = 50) {
    return withSupabaseErrorHandling(async () => {
      const cacheKey = `exercise_history_${userId}_${exerciseId}_${limit}`

      return supabaseCache.getWithCache(
        cacheKey,
        async () => {
          const { data, error } = await supabase
            .from('workout_log_exercises')
            .select(`
              *,
              workout_logs!inner (
                id,
                user_id,
                completed_date,
                week_index,
                day_index,
                is_finished
              ),
              exercises (
                id,
                name,
                primary_muscle_group,
                exercise_type
              )
            `)
            .eq('exercise_id', exerciseId)
            .eq('workout_logs.user_id', userId)
            .eq('workout_logs.is_finished', true)
            .order('workout_logs(completed_date)', { ascending: false })
            .limit(limit)

          if (error) throw error

          // Transform data to match expected format
          const historyData = []

          data.forEach(logExercise => {
            const workout = logExercise.workout_logs
            const exercise = logExercise.exercises

            // Process each set
            for (let setIndex = 0; setIndex < logExercise.sets; setIndex++) {
              if (logExercise.completed && logExercise.completed[setIndex]) {
                // Safely convert to numbers, handling null, empty strings and invalid values
                const weight = logExercise.weights[setIndex] && logExercise.weights[setIndex] !== '' && logExercise.weights[setIndex] !== null ? Number(logExercise.weights[setIndex]) : 0
                const reps = logExercise.reps[setIndex] && logExercise.reps[setIndex] !== '' && logExercise.reps[setIndex] !== null ? Number(logExercise.reps[setIndex]) : 0
                const bodyweight = logExercise.bodyweight && logExercise.bodyweight !== '' && logExercise.bodyweight !== null ? Number(logExercise.bodyweight) : 0

                // Validate numbers
                const validWeight = isNaN(weight) ? 0 : weight
                const validReps = isNaN(reps) ? 0 : reps
                const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

                let totalWeight = validWeight
                let displayWeight = validWeight

                if (exercise.exercise_type === 'Bodyweight') {
                  totalWeight = validBodyweight
                  displayWeight = validBodyweight
                } else if (exercise.exercise_type === 'Bodyweight Loadable' && validBodyweight > 0) {
                  totalWeight = validBodyweight + validWeight
                  displayWeight = `${validBodyweight} + ${validWeight} = ${totalWeight}`
                }

                historyData.push({
                  date: new Date(workout.completed_date),
                  week: (workout.week_index || 0) + 1,
                  day: (workout.day_index || 0) + 1,
                  set: setIndex + 1,
                  weight: validWeight,
                  totalWeight: totalWeight,
                  displayWeight: displayWeight,
                  reps: validReps,
                  completed: true,
                  bodyweight: validBodyweight,
                  exerciseType: exercise.exercise_type
                })
              }
            }
          })

          return historyData
        },
        { ttl: this.EXERCISE_HISTORY_CACHE_TTL }
      )
    }, 'getExerciseHistory')
  }

  /**
   * Get workout logs with exercises for progress tracking (with caching)
   * Supports date ranges and includes exercise details for progress analysis
   */
  async getWorkoutLogsForProgress(userId, options = {}) {
    return withSupabaseErrorHandling(async () => {
      const {
        startDate,
        endDate,
        limit = 1000,
        includeDrafts = false,
        programId = null
      } = options

      // Create cache key based on parameters
      const cacheKey = `workout_logs_progress_${userId}_${startDate || 'all'}_${endDate || 'all'}_${limit}_${includeDrafts}_${programId || 'all'}`

      return supabaseCache.getWithCache(
        cacheKey,
        async () => {
          let query = supabase
            .from('workout_logs')
            .select(`
              *,
              workout_log_exercises (
                *,
                exercises (
                  id,
                  name,
                  primary_muscle_group,
                  exercise_type,
                  instructions
                )
              )
            `)
            .eq('user_id', userId)

          // Add filters based on options
          if (!includeDrafts) {
            query = query.eq('is_finished', true)
          }

          if (programId) {
            query = query.eq('program_id', programId)
          }

          if (startDate) {
            query = query.gte('date', startDate)
          }

          if (endDate) {
            query = query.lte('date', endDate)
          }

          // Order by date descending (most recent first)
          query = query.order('date', { ascending: false })

          if (limit && limit !== 'all') {
            query = query.limit(limit)
          }

          const { data, error } = await query

          if (error) throw error

          // Transform data to match expected format and sort exercises
          const transformedData = data.map(workout => {
            // Sort exercises by order_index
            if (workout.workout_log_exercises) {
              workout.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
            }

            // Add exercises array for backward compatibility with existing code
            workout.exercises = workout.workout_log_exercises || []

            return workout
          })

          return transformedData
        },
        { ttl: this.WORKOUT_LOGS_CACHE_TTL || 15 * 60 * 1000 } // 15 minutes default
      )
    }, 'getWorkoutLogsForProgress')
  }

  /**
   * Update user analytics after workout completion
   */
  async updateUserAnalytics(userId, exercises) {
    return withSupabaseErrorHandling(async () => {
      if (!exercises || exercises.length === 0) return

      const analyticsUpdates = []

      exercises.forEach(exercise => {
        if (!exercise.completed || exercise.completed.length === 0) return

        let totalVolume = 0
        let maxWeight = 0
        let totalReps = 0
        let totalSets = 0

        exercise.completed.forEach((isCompleted, setIndex) => {
          if (isCompleted) {
            // Safely convert to numbers, handling null, empty strings and invalid values
            const weight = exercise.weights[setIndex] && exercise.weights[setIndex] !== '' && exercise.weights[setIndex] !== null ? Number(exercise.weights[setIndex]) : 0
            const reps = exercise.reps[setIndex] && exercise.reps[setIndex] !== '' && exercise.reps[setIndex] !== null ? Number(exercise.reps[setIndex]) : 0
            const bodyweight = exercise.bodyweight && exercise.bodyweight !== '' && exercise.bodyweight !== null ? Number(exercise.bodyweight) : 0

            // Validate numbers
            const validWeight = isNaN(weight) ? 0 : weight
            const validReps = isNaN(reps) ? 0 : reps
            const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

            let effectiveWeight = validWeight
            if (exercise.exerciseType === 'Bodyweight') {
              effectiveWeight = validBodyweight
            } else if (exercise.exerciseType === 'Bodyweight Loadable') {
              effectiveWeight = validBodyweight + validWeight
            }

            totalVolume += effectiveWeight * validReps
            maxWeight = Math.max(maxWeight, effectiveWeight)
            totalReps += validReps
            totalSets += 1
          }
        })

        if (totalSets > 0) {
          analyticsUpdates.push({
            user_id: userId,
            exercise_id: exercise.exerciseId,
            total_volume: totalVolume,
            max_weight: maxWeight,
            total_reps: totalReps,
            total_sets: totalSets,
            last_workout_date: new Date().toISOString().split('T')[0],
            pr_date: new Date().toISOString().split('T')[0], // Simplified - would need PR detection logic
            updated_at: new Date().toISOString()
          })
        }
      })

      if (analyticsUpdates.length > 0) {
        // Use upsert to update existing records or create new ones
        const { error } = await supabase
          .from('user_analytics')
          .upsert(analyticsUpdates, {
            onConflict: 'user_id,exercise_id',
            ignoreDuplicates: false
          })

        if (error) throw error
      }
    }, 'updateUserAnalytics')
  }

  /**
   * Get user analytics for specific exercise
   */
  async getUserAnalytics(userId, exerciseId = null) {
    return withSupabaseErrorHandling(async () => {
      let query = supabase
        .from('user_analytics')
        .select(`
          *,
          exercises (
            id,
            name,
            primary_muscle_group,
            exercise_type
          )
        `)
        .eq('user_id', userId)

      if (exerciseId) {
        query = query.eq('exercise_id', exerciseId)
      }

      const { data, error } = await query.order('last_workout_date', { ascending: false })

      if (error) throw error
      return data
    }, 'getUserAnalytics')
  }

  /**
   * Get workout statistics for user
   */
  async getWorkoutStats(userId, timeframe = '30d') {
    return withSupabaseErrorHandling(async () => {
      const startDate = new Date()

      switch (timeframe) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7)
          break
        case '30d':
          startDate.setDate(startDate.getDate() - 30)
          break
        case '90d':
          startDate.setDate(startDate.getDate() - 90)
          break
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1)
          break
        default:
          startDate.setDate(startDate.getDate() - 30)
      }

      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          id,
          completed_date,
          duration,
          workout_log_exercises (
            sets,
            reps,
            weights,
            completed,
            bodyweight,
            exercises (
              primary_muscle_group,
              exercise_type
            )
          )
        `)
        .eq('user_id', userId)
        .eq('is_finished', true)
        .gte('completed_date', startDate.toISOString())
        .order('completed_date', { ascending: false })

      if (error) throw error

      // Calculate statistics
      let totalWorkouts = data.length
      let totalVolume = 0
      let totalSets = 0
      let totalReps = 0
      let muscleGroupBreakdown = {}

      data.forEach(workout => {
        workout.workout_log_exercises.forEach(exercise => {
          const muscleGroup = exercise.exercises.primary_muscle_group

          if (!muscleGroupBreakdown[muscleGroup]) {
            muscleGroupBreakdown[muscleGroup] = { volume: 0, sets: 0 }
          }

          exercise.completed.forEach((isCompleted, setIndex) => {
            if (isCompleted) {
              // Safely convert to numbers, handling null, empty strings and invalid values
              const weight = exercise.weights[setIndex] && exercise.weights[setIndex] !== '' && exercise.weights[setIndex] !== null ? Number(exercise.weights[setIndex]) : 0
              const reps = exercise.reps[setIndex] && exercise.reps[setIndex] !== '' && exercise.reps[setIndex] !== null ? Number(exercise.reps[setIndex]) : 0
              const bodyweight = exercise.bodyweight && exercise.bodyweight !== '' && exercise.bodyweight !== null ? Number(exercise.bodyweight) : 0

              // Validate numbers
              const validWeight = isNaN(weight) ? 0 : weight
              const validReps = isNaN(reps) ? 0 : reps
              const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

              let effectiveWeight = validWeight
              if (exercise.exercises.exercise_type === 'Bodyweight') {
                effectiveWeight = validBodyweight
              } else if (exercise.exercises.exercise_type === 'Bodyweight Loadable') {
                effectiveWeight = validBodyweight + validWeight
              }

              const volume = effectiveWeight * validReps
              totalVolume += volume
              totalSets += 1
              totalReps += validReps

              muscleGroupBreakdown[muscleGroup].volume += volume
              muscleGroupBreakdown[muscleGroup].sets += 1
            }
          })
        })
      })

      return {
        timeframe,
        totalWorkouts,
        totalVolume,
        totalSets,
        totalReps,
        averageWorkoutsPerWeek: totalWorkouts / (timeframe === '7d' ? 1 : timeframe === '30d' ? 4.3 : timeframe === '90d' ? 12.9 : 52),
        muscleGroupBreakdown
      }
    }, 'getWorkoutStats')
  }

  /**
   * Finish workout and trigger processing
   */
  async finishWorkout(userId, programId, weekIndex, dayIndex, exercises) {
    return withSupabaseErrorHandling(async () => {
      let workoutLogId

      // Check if workout log already exists
      const existingLog = await this.getWorkoutLog(userId, programId, weekIndex, dayIndex)

      // Transform exercise data to Supabase format
      const transformedExercises = exercises.map((ex, index) => {
        const sets = ex.sets && ex.sets !== '' ? Number(ex.sets) : 1
        const bodyweight = ex.bodyweight && ex.bodyweight !== '' ? Number(ex.bodyweight) : null

        return {
          exerciseId: ex.exerciseId,
          sets: isNaN(sets) || sets <= 0 ? 1 : sets,
          reps: ex.reps || [],
          weights: ex.weights || [],
          completed: ex.completed || [],
          bodyweight: isNaN(bodyweight) ? null : bodyweight,
          notes: ex.notes || '',
          isAdded: ex.isAdded || false,
          addedType: ex.addedType || null,
          originalIndex: ex.originalIndex || -1
        }
      })

      const completedDate = new Date().toISOString()

      if (existingLog && existingLog.id && existingLog.id !== 'undefined' && existingLog.id !== undefined && existingLog.id !== null && existingLog.id !== '') {
        // Update existing log to mark as finished
        await this.updateWorkoutLog(existingLog.id, {
          name: existingLog.name,
          isFinished: true,
          isDraft: false,
          completedDate: completedDate,
          exercises: transformedExercises
        })
        workoutLogId = existingLog.id
      } else {
        // Create new completed workout log
        const workoutData = {
          programId: programId,
          weekIndex: weekIndex,
          dayIndex: dayIndex,
          name: `Workout - Week ${weekIndex + 1}, Day ${dayIndex + 1}`,
          type: 'program_workout',
          date: new Date().toISOString().split('T')[0],
          isFinished: true,
          isDraft: false,
          weightUnit: 'LB',
          exercises: transformedExercises
        }
        const newLog = await this.createWorkoutLog(userId, workoutData)
        workoutLogId = newLog.id
      }

      // Trigger workout processing using Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('process-workout', {
        body: { workoutLogId: workoutLogId }
      })

      if (error) {
        throw error
      }

      console.log('Workout processing triggered successfully:', data)
      return { workoutLogId, processingResult: data }
    }, 'finishWorkout')
  }
}

// Export singleton instance
const workoutLogService = new WorkoutLogService()
export default workoutLogService/**

 * Coach Access Functions for Workout Logs
 */

/**
 * Get workout logs for a client (coach access)
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of client workout logs
 */
export const getClientWorkoutLogs = async (coachId, clientId, options = {}) => {
  return withSupabaseErrorHandling(async () => {
    // First verify coach has permission to access client data
    const { canAccessClientData } = await import('./permissionService')
    const hasAccess = await canAccessClientData(coachId, clientId, 'workouts')
    
    if (!hasAccess) {
      throw new Error('Permission denied: Cannot access client workout data')
    }

    const {
      startDate,
      endDate,
      limit = 50,
      includeDrafts = false,
      programId = null
    } = options

    let query = supabase
      .from('workout_logs')
      .select(`
        *,
        workout_log_exercises (
          *,
          exercises (
            id,
            name,
            primary_muscle_group,
            exercise_type
          )
        )
      `)
      .eq('user_id', clientId)

    if (!includeDrafts) {
      query = query.eq('is_finished', true)
    }

    if (programId) {
      query = query.eq('program_id', programId)
    }

    if (startDate) {
      query = query.gte('date', startDate)
    }

    if (endDate) {
      query = query.lte('date', endDate)
    }

    query = query.order('date', { ascending: false }).limit(limit)

    const { data, error } = await query

    if (error) throw error

    return data || []
  }, 'getClientWorkoutLogs')
}

/**
 * Get client workout statistics for coach
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {string} timeframe - Time period ('7d', '30d', '90d', '1y')
 * @returns {Promise<Object>} Client workout statistics
 */
export const getClientWorkoutStats = async (coachId, clientId, timeframe = '30d') => {
  return withSupabaseErrorHandling(async () => {
    // Verify coach has permission to access client analytics
    const { canAccessClientData } = await import('./permissionService')
    const hasAccess = await canAccessClientData(coachId, clientId, 'analytics')
    
    if (!hasAccess) {
      throw new Error('Permission denied: Cannot access client analytics data')
    }

    const startDate = new Date()

    switch (timeframe) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7)
        break
      case '30d':
        startDate.setDate(startDate.getDate() - 30)
        break
      case '90d':
        startDate.setDate(startDate.getDate() - 90)
        break
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
      default:
        startDate.setDate(startDate.getDate() - 30)
    }

    const { data, error } = await supabase
      .from('workout_logs')
      .select(`
        id,
        completed_date,
        duration,
        workout_log_exercises (
          sets,
          reps,
          weights,
          completed,
          bodyweight,
          exercises (
            primary_muscle_group,
            exercise_type
          )
        )
      `)
      .eq('user_id', clientId)
      .eq('is_finished', true)
      .gte('completed_date', startDate.toISOString())
      .order('completed_date', { ascending: false })

    if (error) throw error

    // Calculate statistics (same logic as getWorkoutStats but for client)
    let totalWorkouts = data.length
    let totalVolume = 0
    let totalSets = 0
    let totalReps = 0
    let muscleGroupBreakdown = {}

    data.forEach(workout => {
      workout.workout_log_exercises.forEach(exercise => {
        const muscleGroup = exercise.exercises.primary_muscle_group

        if (!muscleGroupBreakdown[muscleGroup]) {
          muscleGroupBreakdown[muscleGroup] = { volume: 0, sets: 0 }
        }

        exercise.completed.forEach((isCompleted, setIndex) => {
          if (isCompleted) {
            const weight = exercise.weights[setIndex] && exercise.weights[setIndex] !== '' ? Number(exercise.weights[setIndex]) : 0
            const reps = exercise.reps[setIndex] && exercise.reps[setIndex] !== '' ? Number(exercise.reps[setIndex]) : 0
            const bodyweight = exercise.bodyweight && exercise.bodyweight !== '' ? Number(exercise.bodyweight) : 0

            const validWeight = isNaN(weight) ? 0 : weight
            const validReps = isNaN(reps) ? 0 : reps
            const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

            let effectiveWeight = validWeight
            if (exercise.exercises.exercise_type === 'Bodyweight') {
              effectiveWeight = validBodyweight
            } else if (exercise.exercises.exercise_type === 'Bodyweight Loadable') {
              effectiveWeight = validBodyweight + validWeight
            }

            const volume = effectiveWeight * validReps
            totalVolume += volume
            totalSets += 1
            totalReps += validReps

            muscleGroupBreakdown[muscleGroup].volume += volume
            muscleGroupBreakdown[muscleGroup].sets += 1
          }
        })
      })
    })

    return {
      clientId,
      timeframe,
      totalWorkouts,
      totalVolume,
      totalSets,
      totalReps,
      averageWorkoutsPerWeek: totalWorkouts / (timeframe === '7d' ? 1 : timeframe === '30d' ? 4.3 : timeframe === '90d' ? 12.9 : 52),
      muscleGroupBreakdown
    }
  }, 'getClientWorkoutStats')
}

/**
 * Get client exercise history for coach
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {string} exerciseId - Exercise ID
 * @param {number} limit - Number of records to return
 * @returns {Promise<Array>} Client exercise history
 */
export const getClientExerciseHistory = async (coachId, clientId, exerciseId, limit = 50) => {
  return withSupabaseErrorHandling(async () => {
    // Verify coach has permission to access client workout data
    const { canAccessClientData } = await import('./permissionService')
    const hasAccess = await canAccessClientData(coachId, clientId, 'workouts')
    
    if (!hasAccess) {
      throw new Error('Permission denied: Cannot access client workout data')
    }

    const { data, error } = await supabase
      .from('workout_log_exercises')
      .select(`
        *,
        workout_logs!inner (
          id,
          user_id,
          completed_date,
          week_index,
          day_index,
          is_finished
        ),
        exercises (
          id,
          name,
          primary_muscle_group,
          exercise_type
        )
      `)
      .eq('exercise_id', exerciseId)
      .eq('workout_logs.user_id', clientId)
      .eq('workout_logs.is_finished', true)
      .order('workout_logs(completed_date)', { ascending: false })
      .limit(limit)

    if (error) throw error

    // Transform data to match expected format (same as getExerciseHistory)
    const historyData = []

    data.forEach(logExercise => {
      const workout = logExercise.workout_logs
      const exercise = logExercise.exercises

      for (let setIndex = 0; setIndex < logExercise.sets; setIndex++) {
        if (logExercise.completed && logExercise.completed[setIndex]) {
          const weight = logExercise.weights[setIndex] && logExercise.weights[setIndex] !== '' ? Number(logExercise.weights[setIndex]) : 0
          const reps = logExercise.reps[setIndex] && logExercise.reps[setIndex] !== '' ? Number(logExercise.reps[setIndex]) : 0
          const bodyweight = logExercise.bodyweight && logExercise.bodyweight !== '' ? Number(logExercise.bodyweight) : 0

          const validWeight = isNaN(weight) ? 0 : weight
          const validReps = isNaN(reps) ? 0 : reps
          const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

          let totalWeight = validWeight
          let displayWeight = validWeight

          if (exercise.exercise_type === 'Bodyweight') {
            totalWeight = validBodyweight
            displayWeight = validBodyweight
          } else if (exercise.exercise_type === 'Bodyweight Loadable' && validBodyweight > 0) {
            totalWeight = validBodyweight + validWeight
            displayWeight = `${validBodyweight} + ${validWeight} = ${totalWeight}`
          }

          historyData.push({
            date: new Date(workout.completed_date),
            week: (workout.week_index || 0) + 1,
            day: (workout.day_index || 0) + 1,
            set: setIndex + 1,
            weight: validWeight,
            totalWeight: totalWeight,
            displayWeight: displayWeight,
            reps: validReps,
            completed: true,
            bodyweight: validBodyweight,
            exerciseType: exercise.exercise_type
          })
        }
      }
    })

    return historyData
  }, 'getClientExerciseHistory')
}

/**
 * Get client analytics for coach
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {string} exerciseId - Optional exercise ID filter
 * @returns {Promise<Array>} Client analytics data
 */
export const getClientAnalytics = async (coachId, clientId, exerciseId = null) => {
  return withSupabaseErrorHandling(async () => {
    // Verify coach has permission to access client analytics
    const { canAccessClientData } = await import('./permissionService')
    const hasAccess = await canAccessClientData(coachId, clientId, 'analytics')
    
    if (!hasAccess) {
      throw new Error('Permission denied: Cannot access client analytics data')
    }

    let query = supabase
      .from('user_analytics')
      .select(`
        *,
        exercises (
          id,
          name,
          primary_muscle_group,
          exercise_type
        )
      `)
      .eq('user_id', clientId)

    if (exerciseId) {
      query = query.eq('exercise_id', exerciseId)
    }

    const { data, error } = await query.order('last_workout_date', { ascending: false })

    if (error) throw error
    return data || []
  }, 'getClientAnalytics')
}

/**
 * Get workout progress comparison for coach
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {Object} options - Comparison options
 * @returns {Promise<Object>} Progress comparison data
 */
export const getClientProgressComparison = async (coachId, clientId, options = {}) => {
  return withSupabaseErrorHandling(async () => {
    // Verify coach has permission to access client progress data
    const { canAccessClientData } = await import('./permissionService')
    const hasAccess = await canAccessClientData(coachId, clientId, 'progress')
    
    if (!hasAccess) {
      throw new Error('Permission denied: Cannot access client progress data')
    }

    const {
      exerciseId,
      timeframe = '90d',
      compareType = 'volume' // 'volume', 'max_weight', 'total_reps'
    } = options

    const endDate = new Date()
    const startDate = new Date()

    switch (timeframe) {
      case '30d':
        startDate.setDate(startDate.getDate() - 30)
        break
      case '90d':
        startDate.setDate(startDate.getDate() - 90)
        break
      case '6m':
        startDate.setMonth(startDate.getMonth() - 6)
        break
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1)
        break
      default:
        startDate.setDate(startDate.getDate() - 90)
    }

    let query = supabase
      .from('workout_log_exercises')
      .select(`
        *,
        workout_logs!inner (
          completed_date,
          is_finished
        ),
        exercises (
          name,
          primary_muscle_group,
          exercise_type
        )
      `)
      .eq('workout_logs.user_id', clientId)
      .eq('workout_logs.is_finished', true)
      .gte('workout_logs.completed_date', startDate.toISOString())
      .lte('workout_logs.completed_date', endDate.toISOString())

    if (exerciseId) {
      query = query.eq('exercise_id', exerciseId)
    }

    query = query.order('workout_logs(completed_date)', { ascending: true })

    const { data, error } = await query

    if (error) throw error

    // Process data for progress comparison
    const progressData = []
    const exerciseProgress = {}

    data.forEach(logExercise => {
      const exerciseId = logExercise.exercise_id
      const exerciseName = logExercise.exercises.name
      const date = logExercise.workout_logs.completed_date

      if (!exerciseProgress[exerciseId]) {
        exerciseProgress[exerciseId] = {
          name: exerciseName,
          data: []
        }
      }

      // Calculate metrics for this workout
      let totalVolume = 0
      let maxWeight = 0
      let totalReps = 0

      logExercise.completed.forEach((isCompleted, setIndex) => {
        if (isCompleted) {
          const weight = logExercise.weights[setIndex] && logExercise.weights[setIndex] !== '' ? Number(logExercise.weights[setIndex]) : 0
          const reps = logExercise.reps[setIndex] && logExercise.reps[setIndex] !== '' ? Number(logExercise.reps[setIndex]) : 0
          const bodyweight = logExercise.bodyweight && logExercise.bodyweight !== '' ? Number(logExercise.bodyweight) : 0

          const validWeight = isNaN(weight) ? 0 : weight
          const validReps = isNaN(reps) ? 0 : reps
          const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

          let effectiveWeight = validWeight
          if (logExercise.exercises.exercise_type === 'Bodyweight') {
            effectiveWeight = validBodyweight
          } else if (logExercise.exercises.exercise_type === 'Bodyweight Loadable') {
            effectiveWeight = validBodyweight + validWeight
          }

          totalVolume += effectiveWeight * validReps
          maxWeight = Math.max(maxWeight, effectiveWeight)
          totalReps += validReps
        }
      })

      exerciseProgress[exerciseId].data.push({
        date,
        totalVolume,
        maxWeight,
        totalReps
      })
    })

    return {
      clientId,
      timeframe,
      compareType,
      exerciseProgress
    }
  }, 'getClientProgressComparison')
}

// Coach access functions are already exported individually above
// No need for additional export block since they use 'export const'