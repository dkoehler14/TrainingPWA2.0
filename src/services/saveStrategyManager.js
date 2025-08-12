/**
 * Save Strategy Manager for Workout Log Save Optimization
 * 
 * Coordinates different save strategies based on change analysis to optimize
 * database operations and improve performance. This service acts as the main
 * entry point for all workout log save operations.
 * 
 * Key Features:
 * - Intelligent save strategy selection based on change analysis
 * - Performance monitoring and metrics collection
 * - Error handling and fallback mechanisms
 * - Integration with existing cache management
 */

const ChangeDetectionService = require('./changeDetectionService.js').default;
const workoutLogService = require('./workoutLogService.js').default;

/**
 * @typedef {Object} SaveRequest
 * @property {string} userId - User ID
 * @property {string} programId - Program ID
 * @property {number} weekIndex - Week index
 * @property {number} dayIndex - Day index
 * @property {Object} currentData - Current workout data
 * @property {Object|null} previousData - Previous workout data (null for new workouts)
 * @property {'debounced'|'immediate'|'completion'} saveType - Type of save operation
 * @property {Object} options - Additional save options
 */

/**
 * @typedef {Object} SaveContext
 * @property {boolean} hasExistingWorkoutLog - Whether workout log already exists
 * @property {string|null} workoutLogId - Existing workout log ID
 * @property {boolean} isWorkoutFinished - Whether workout is finished
 * @property {Date|null} lastSaveTime - Last save timestamp
 * @property {Object} cacheState - Current cache state
 * @property {Object} userPreferences - User preferences for save behavior
 */

/**
 * @typedef {Object} SaveStrategy
 * @property {'exercise-only'|'metadata-only'|'full-save'} type - Strategy type
 * @property {'low'|'normal'|'high'} priority - Save priority
 * @property {number|null} debounceMs - Debounce delay in milliseconds
 * @property {boolean} useTransaction - Whether to use database transaction
 * @property {boolean} validateCache - Whether to validate cache before save
 * @property {string} reason - Reason for strategy selection
 */

/**
 * @typedef {Object} SaveResult
 * @property {boolean} success - Whether save was successful
 * @property {string|null} workoutLogId - Workout log ID
 * @property {'exercise-only'|'metadata-only'|'full-save'} operationType - Type of operation performed
 * @property {string[]} affectedTables - Database tables that were updated
 * @property {boolean} cacheUpdated - Whether cache was updated
 * @property {Object} performance - Performance metrics
 * @property {number} performance.duration - Operation duration in milliseconds
 * @property {number} performance.databaseWrites - Number of database write operations
 * @property {Object|null} error - Error information if save failed
 * @property {Object} changeAnalysis - Change analysis that drove the strategy
 */

/**
 * @typedef {Object} SavePerformanceMetrics
 * @property {Object} operationCounts - Count of each operation type
 * @property {Object} averageResponseTimes - Average response times by operation type
 * @property {Object} databaseWriteReduction - Database write reduction statistics
 * @property {Object} errorRates - Error rates by operation type
 * @property {Date} lastReset - When metrics were last reset
 */

class SaveStrategyManager {
  constructor(options = {}) {
    this.changeDetectionService = new ChangeDetectionService();
    this.workoutLogService = workoutLogService;
    
    // Configuration options
    this.config = {
      enablePerformanceMonitoring: options.enablePerformanceMonitoring !== false,
      enableDebugLogging: options.enableDebugLogging || false,
      defaultDebounceMs: options.defaultDebounceMs || 1000,
      maxRetryAttempts: options.maxRetryAttempts || 3,
      fallbackToFullSave: options.fallbackToFullSave !== false,
      ...options
    };

    // Performance metrics tracking
    this.performanceMetrics = {
      operationCounts: {
        'exercise-only': 0,
        'metadata-only': 0,
        'full-save': 0,
        'fallback': 0
      },
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTimes: {
        'exercise-only': [],
        'metadata-only': [],
        'full-save': []
      },
      databaseWriteReduction: {
        totalSaves: 0,
        optimizedSaves: 0,
        writesAvoided: 0
      },
      errorRates: {
        'exercise-only': { attempts: 0, failures: 0 },
        'metadata-only': { attempts: 0, failures: 0 },
        'full-save': { attempts: 0, failures: 0 }
      },
      lastReset: new Date()
    };

    // Strategy selection rules
    this.strategyRules = {
      // Exercise-only changes use debounced saves
      'exercise-only': {
        priority: 'normal',
        debounceMs: this.config.defaultDebounceMs,
        useTransaction: false,
        validateCache: true,
        reason: 'Exercise data changes only - using optimized save'
      },
      // Metadata changes use immediate saves
      'metadata-only': {
        priority: 'high',
        debounceMs: null,
        useTransaction: false,
        validateCache: true,
        reason: 'Metadata changes require immediate save'
      },
      // Mixed changes or structural changes use full save
      'full-save': {
        priority: 'high',
        debounceMs: null,
        useTransaction: true,
        validateCache: true,
        reason: 'Mixed or structural changes require full save'
      }
    };

    this._debugLog('SaveStrategyManager initialized', { config: this.config });
  }

  /**
   * Main entry point for all save operations
   * @param {SaveRequest} saveRequest - Save request details
   * @returns {Promise<SaveResult>} Save operation result
   */
  async executeSave(saveRequest) {
    const startTime = Date.now();
    const operationId = this._generateOperationId();
    
    this._debugLog('Save operation started', { 
      operationId, 
      saveRequest: this._sanitizeSaveRequest(saveRequest) 
    });

    try {
      // Validate save request
      this._validateSaveRequest(saveRequest);

      // Build save context
      const saveContext = await this._buildSaveContext(saveRequest);

      // Detect changes and determine strategy
      const changeAnalysis = this.changeDetectionService.detectChanges(
        saveRequest.previousData,
        saveRequest.currentData
      );

      // Select optimal save strategy
      const strategy = this.selectStrategy(changeAnalysis, saveContext);

      this._debugLog('Save strategy selected', { 
        operationId, 
        strategy, 
        changeAnalysis: this.changeDetectionService.getChangeDetails(changeAnalysis) 
      });

      // Execute save with selected strategy
      const saveResult = await this._executeSaveWithStrategy(
        saveRequest,
        strategy,
        changeAnalysis,
        saveContext
      );

      // Record performance metrics
      const duration = Date.now() - startTime;
      this._recordPerformanceMetrics(strategy.type, duration, true, saveResult);

      this._debugLog('Save operation completed successfully', { 
        operationId, 
        duration, 
        result: this._sanitizeSaveResult(saveResult) 
      });

      return {
        ...saveResult,
        success: true,
        performance: {
          ...saveResult.performance,
          duration,
          operationId
        },
        changeAnalysis
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this._recordPerformanceMetrics('unknown', duration, false, null, error);

      this._debugLog('Save operation failed', { 
        operationId, 
        duration, 
        error: error.message,
        errorType: error.type || 'unknown'
      });

      // Only attempt error recovery for non-validation errors
      if (this.config.fallbackToFullSave && 
          error.recoverable !== false && 
          !error.message.includes('Invalid save request') &&
          !error.message.includes('Invalid save type')) {
        try {
          const fallbackResult = await this._attemptFallbackSave(saveRequest, error);
          
          this._debugLog('Fallback save successful', { 
            operationId, 
            fallbackResult: this._sanitizeSaveResult(fallbackResult) 
          });

          return {
            ...fallbackResult,
            success: true,
            performance: {
              ...fallbackResult.performance,
              duration: Date.now() - startTime,
              operationId,
              fallbackUsed: true
            },
            originalError: error.message
          };
        } catch (fallbackError) {
          this._debugLog('Fallback save failed', { 
            operationId, 
            originalError: error.message,
            fallbackError: fallbackError.message 
          });
          
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Select optimal save strategy based on change analysis and context
   * @param {Object} changeAnalysis - Change analysis from ChangeDetectionService
   * @param {SaveContext} context - Save context information
   * @returns {SaveStrategy} Selected save strategy
   */
  selectStrategy(changeAnalysis, context) {
    try {
      // Get base strategy from change analysis
      const baseStrategy = this.strategyRules[changeAnalysis.saveStrategy];
      
      if (!baseStrategy) {
        this._debugLog('Unknown save strategy, falling back to full-save', { 
          requestedStrategy: changeAnalysis.saveStrategy 
        });
        return {
          ...this.strategyRules['full-save'],
          type: 'full-save',
          reason: `Unknown strategy '${changeAnalysis.saveStrategy}', using full-save fallback`
        };
      }

      // Create strategy with context-specific adjustments
      const strategy = {
        ...baseStrategy,
        type: changeAnalysis.saveStrategy
      };

      // Adjust strategy based on context
      if (context.isWorkoutFinished) {
        // Finished workouts should use immediate, high-priority saves
        strategy.priority = 'high';
        strategy.debounceMs = null;
        strategy.reason += ' (workout finished - immediate save)';
      }

      if (!context.hasExistingWorkoutLog && changeAnalysis.saveStrategy === 'exercise-only') {
        // New workouts with exercise data need full save to create workout log
        strategy.type = 'full-save';
        strategy.useTransaction = true;
        strategy.reason = 'New workout with exercise data requires full save';
      }

      if (context.cacheState?.isInvalid) {
        // Invalid cache requires validation
        strategy.validateCache = true;
        strategy.reason += ' (cache validation required)';
      }

      // Adjust debounce timing based on save type and context
      if (strategy.debounceMs && context.lastSaveTime) {
        const timeSinceLastSave = Date.now() - context.lastSaveTime.getTime();
        if (timeSinceLastSave < strategy.debounceMs / 2) {
          // Recent save - extend debounce slightly to batch changes
          strategy.debounceMs = Math.min(strategy.debounceMs * 1.5, 3000);
          strategy.reason += ' (extended debounce for batching)';
        }
      }

      this._debugLog('Strategy selection completed', { 
        originalStrategy: changeAnalysis.saveStrategy,
        finalStrategy: strategy,
        contextFactors: {
          isWorkoutFinished: context.isWorkoutFinished,
          hasExistingWorkoutLog: context.hasExistingWorkoutLog,
          cacheIsInvalid: context.cacheState?.isInvalid,
          timeSinceLastSave: context.lastSaveTime ? Date.now() - context.lastSaveTime.getTime() : null
        }
      });

      return strategy;

    } catch (error) {
      this._debugLog('Strategy selection failed, using full-save fallback', { 
        error: error.message 
      });
      
      return {
        ...this.strategyRules['full-save'],
        type: 'full-save',
        reason: `Strategy selection failed: ${error.message}`
      };
    }
  }

  /**
   * Get current performance metrics
   * @returns {SavePerformanceMetrics} Performance metrics
   */
  getPerformanceMetrics() {
    const metrics = { ...this.performanceMetrics };
    
    // Calculate derived metrics
    metrics.successRate = metrics.totalOperations > 0 
      ? (metrics.successfulOperations / metrics.totalOperations) * 100 
      : 0;

    metrics.optimizationRate = metrics.databaseWriteReduction.totalSaves > 0
      ? (metrics.databaseWriteReduction.optimizedSaves / metrics.databaseWriteReduction.totalSaves) * 100
      : 0;

    // Calculate average response times
    Object.keys(metrics.averageResponseTimes).forEach(strategy => {
      const times = metrics.averageResponseTimes[strategy];
      metrics.averageResponseTimes[strategy] = times.length > 0
        ? times.reduce((sum, time) => sum + time, 0) / times.length
        : 0;
    });

    // Calculate error rates
    Object.keys(metrics.errorRates).forEach(strategy => {
      const stats = metrics.errorRates[strategy];
      stats.errorRate = stats.attempts > 0 ? (stats.failures / stats.attempts) * 100 : 0;
    });

    return metrics;
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics() {
    this.performanceMetrics = {
      operationCounts: {
        'exercise-only': 0,
        'metadata-only': 0,
        'full-save': 0,
        'fallback': 0
      },
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTimes: {
        'exercise-only': [],
        'metadata-only': [],
        'full-save': []
      },
      databaseWriteReduction: {
        totalSaves: 0,
        optimizedSaves: 0,
        writesAvoided: 0
      },
      errorRates: {
        'exercise-only': { attempts: 0, failures: 0 },
        'metadata-only': { attempts: 0, failures: 0 },
        'full-save': { attempts: 0, failures: 0 }
      },
      lastReset: new Date()
    };

    this._debugLog('Performance metrics reset');
  }

  /**
   * Validate save request structure
   * @private
   */
  _validateSaveRequest(saveRequest) {
    const required = ['userId', 'programId', 'weekIndex', 'dayIndex', 'currentData', 'saveType'];
    const missing = required.filter(field => saveRequest[field] === undefined || saveRequest[field] === null);
    
    if (missing.length > 0) {
      throw new Error(`Invalid save request: missing required fields: ${missing.join(', ')}`);
    }

    if (!['debounced', 'immediate', 'completion'].includes(saveRequest.saveType)) {
      throw new Error(`Invalid save type: ${saveRequest.saveType}`);
    }

    if (!saveRequest.currentData || typeof saveRequest.currentData !== 'object') {
      throw new Error('Invalid save request: currentData must be an object');
    }
  }

  /**
   * Build save context from request
   * @private
   */
  async _buildSaveContext(saveRequest) {
    try {
      // Check if workout log exists
      let hasExistingWorkoutLog = false;
      let workoutLogId = null;
      
      try {
        const existingLog = await this.workoutLogService.getWorkoutLog(
          saveRequest.userId,
          saveRequest.programId,
          saveRequest.weekIndex,
          saveRequest.dayIndex
        );
        
        if (existingLog) {
          hasExistingWorkoutLog = true;
          workoutLogId = existingLog.id;
        }
      } catch (error) {
        // Log not found is expected for new workouts
        this._debugLog('No existing workout log found (expected for new workouts)', { 
          error: error.message 
        });
      }

      return {
        hasExistingWorkoutLog,
        workoutLogId,
        isWorkoutFinished: saveRequest.currentData.metadata?.isFinished || false,
        lastSaveTime: saveRequest.options?.lastSaveTime || null,
        cacheState: saveRequest.options?.cacheState || { isValid: true },
        userPreferences: saveRequest.options?.userPreferences || {}
      };
    } catch (error) {
      this._debugLog('Failed to build save context, using defaults', { 
        error: error.message 
      });
      
      return {
        hasExistingWorkoutLog: false,
        workoutLogId: null,
        isWorkoutFinished: false,
        lastSaveTime: null,
        cacheState: { isValid: true },
        userPreferences: {}
      };
    }
  }

  /**
   * Execute save with selected strategy
   * @private
   */
  async _executeSaveWithStrategy(saveRequest, strategy, changeAnalysis, saveContext) {
    const startTime = Date.now();
    
    // Update metrics
    this.performanceMetrics.totalOperations++;
    this.performanceMetrics.operationCounts[strategy.type]++;
    this.performanceMetrics.errorRates[strategy.type].attempts++;

    try {
      let result;
      const workoutData = this._transformToWorkoutData(saveRequest);

      switch (strategy.type) {
        case 'exercise-only':
          result = await this._executeExerciseOnlySave(workoutData, saveContext, strategy);
          break;
        case 'metadata-only':
          result = await this._executeMetadataOnlySave(workoutData, saveContext, strategy);
          break;
        case 'full-save':
        default:
          result = await this._executeFullSave(workoutData, saveContext, strategy);
          break;
      }

      // Track database write reduction
      this.performanceMetrics.databaseWriteReduction.totalSaves++;
      if (strategy.type === 'exercise-only' || strategy.type === 'metadata-only') {
        this.performanceMetrics.databaseWriteReduction.optimizedSaves++;
        this.performanceMetrics.databaseWriteReduction.writesAvoided++;
      }

      this.performanceMetrics.successfulOperations++;

      return {
        ...result,
        operationType: strategy.type,
        affectedTables: this._getAffectedTables(strategy.type),
        cacheUpdated: true,
        performance: {
          duration: Date.now() - startTime,
          databaseWrites: this._getDatabaseWriteCount(strategy.type),
          strategy: strategy.reason
        }
      };

    } catch (error) {
      this.performanceMetrics.failedOperations++;
      this.performanceMetrics.errorRates[strategy.type].failures++;
      
      throw error;
    }
  }

  /**
   * Execute exercise-only save
   * @private
   */
  async _executeExerciseOnlySave(workoutData, saveContext, strategy) {
    if (!saveContext.hasExistingWorkoutLog) {
      // Need to create workout log first
      const workoutLogId = await this.workoutLogService.ensureWorkoutLogExists(
        workoutData.userId,
        workoutData.programId,
        workoutData.weekIndex,
        workoutData.dayIndex
      );
      
      saveContext.workoutLogId = workoutLogId;
      saveContext.hasExistingWorkoutLog = true;
    }

    const result = await this.workoutLogService.saveExercisesOnly(
      saveContext.workoutLogId,
      workoutData.exercises,
      {
        useCache: strategy.validateCache,
        source: 'save_strategy_manager',
        priority: strategy.priority
      }
    );

    return {
      success: true,
      workoutLogId: saveContext.workoutLogId,
      ...result
    };
  }

  /**
   * Execute metadata-only save
   * @private
   */
  async _executeMetadataOnlySave(workoutData, saveContext, strategy) {
    if (!saveContext.hasExistingWorkoutLog) {
      throw new Error('Cannot perform metadata-only save without existing workout log');
    }

    const result = await this.workoutLogService.saveMetadataOnly(
      saveContext.workoutLogId,
      workoutData.metadata,
      {
        useCache: strategy.validateCache,
        source: 'save_strategy_manager',
        priority: strategy.priority
      }
    );

    return {
      success: true,
      workoutLogId: saveContext.workoutLogId,
      ...result
    };
  }

  /**
   * Execute full save
   * @private
   */
  async _executeFullSave(workoutData, saveContext, strategy) {
    let result;

    // Resolve or ensure a valid workoutLogId
    let resolvedWorkoutLogId = saveContext.workoutLogId;
    if (!resolvedWorkoutLogId || typeof resolvedWorkoutLogId !== 'string') {
      resolvedWorkoutLogId = await this.workoutLogService.ensureWorkoutLogExists(
        workoutData.userId,
        workoutData.programId,
        workoutData.weekIndex,
        workoutData.dayIndex,
        { source: 'save_strategy_manager_full_save_resolve' }
      );
    }

    if (resolvedWorkoutLogId) {
      // Update existing workout log directly using a valid ID
      result = await this.workoutLogService.updateWorkoutLogEnhanced(
        resolvedWorkoutLogId,
        {
          name: workoutData.metadata?.name,
          isFinished: !!workoutData.metadata?.isFinished,
          isDraft: !!workoutData.metadata?.isDraft,
          duration: workoutData.metadata?.duration || null,
          notes: workoutData.metadata?.notes || '',
          completedDate: workoutData.metadata?.completedDate || null,
          exercises: workoutData.exercises
        },
        {
          validateCache: strategy.validateCache,
          invalidateCache: true,
          logOperations: this.config.enableDebugLogging
        }
      );
    }

    return {
      success: true,
      workoutLogId: result.id,
      ...result
    };
  }

  /**
   * Attempt fallback save on error
   * @private
   */
  async _attemptFallbackSave(saveRequest, originalError) {
    this._debugLog('Attempting fallback save', { 
      originalError: originalError.message 
    });

    this.performanceMetrics.operationCounts.fallback++;

    const workoutData = this._transformToWorkoutData(saveRequest);
    const saveContext = await this._buildSaveContext(saveRequest);

    // Always use full save for fallback
    const fallbackStrategy = {
      ...this.strategyRules['full-save'],
      type: 'full-save',
      reason: `Fallback after error: ${originalError.message}`
    };

    return await this._executeFullSave(workoutData, saveContext, fallbackStrategy);
  }

  /**
   * Transform save request to workout data format
   * @private
   */
  _transformToWorkoutData(saveRequest) {
    return {
      userId: saveRequest.userId,
      programId: saveRequest.programId,
      weekIndex: saveRequest.weekIndex,
      dayIndex: saveRequest.dayIndex,
      metadata: saveRequest.currentData.metadata || {},
      exercises: saveRequest.currentData.exercises || [],
      system: saveRequest.currentData.system || {}
    };
  }

  /**
   * Get affected database tables for strategy type
   * @private
   */
  _getAffectedTables(strategyType) {
    switch (strategyType) {
      case 'exercise-only':
        return ['workout_log_exercises'];
      case 'metadata-only':
        return ['workout_logs'];
      case 'full-save':
      default:
        return ['workout_logs', 'workout_log_exercises'];
    }
  }

  /**
   * Get database write count for strategy type
   * @private
   */
  _getDatabaseWriteCount(strategyType) {
    switch (strategyType) {
      case 'exercise-only':
        return 1; // Only exercises table
      case 'metadata-only':
        return 1; // Only workout_logs table
      case 'full-save':
      default:
        return 2; // Both tables
    }
  }

  /**
   * Record performance metrics
   * @private
   */
  _recordPerformanceMetrics(strategyType, duration, success, result, error = null) {
    if (!this.config.enablePerformanceMonitoring) return;

    if (this.performanceMetrics.averageResponseTimes[strategyType]) {
      this.performanceMetrics.averageResponseTimes[strategyType].push(duration);
      
      // Keep only last 100 measurements to prevent memory growth
      if (this.performanceMetrics.averageResponseTimes[strategyType].length > 100) {
        this.performanceMetrics.averageResponseTimes[strategyType].shift();
      }
    }
  }

  /**
   * Generate unique operation ID
   * @private
   */
  _generateOperationId() {
    return `save_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Debug logging helper
   * @private
   */
  _debugLog(message, data = {}) {
    if (this.config.enableDebugLogging) {
      console.log(`[SaveStrategyManager] ${message}`, data);
    }
  }

  /**
   * Sanitize save request for logging (remove sensitive data)
   * @private
   */
  _sanitizeSaveRequest(saveRequest) {
    return {
      userId: saveRequest.userId ? '[REDACTED]' : null,
      programId: saveRequest.programId,
      weekIndex: saveRequest.weekIndex,
      dayIndex: saveRequest.dayIndex,
      saveType: saveRequest.saveType,
      hasCurrentData: !!saveRequest.currentData,
      hasPreviousData: !!saveRequest.previousData,
      exerciseCount: saveRequest.currentData?.exercises?.length || 0
    };
  }

  /**
   * Sanitize save result for logging (remove sensitive data)
   * @private
   */
  _sanitizeSaveResult(saveResult) {
    return {
      success: saveResult.success,
      operationType: saveResult.operationType,
      affectedTables: saveResult.affectedTables,
      cacheUpdated: saveResult.cacheUpdated,
      performance: saveResult.performance,
      hasError: !!saveResult.error
    };
  }
}

module.exports = SaveStrategyManager;
module.exports.default = SaveStrategyManager;