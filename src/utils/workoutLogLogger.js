/**
 * Comprehensive Logging System for Workout Log Operations
 * 
 * Provides structured logging with metadata, performance metrics,
 * and operation tracking for debugging and monitoring purposes.
 */

/**
 * Log levels
 */
const LogLevel = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Operation types for categorization
 */
const OperationType = {
  // Core operations
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  READ: 'read',
  
  // Cache operations
  CACHE_HIT: 'cache_hit',
  CACHE_MISS: 'cache_miss',
  CACHE_SET: 'cache_set',
  CACHE_VALIDATION: 'cache_validation',
  CACHE_CLEANUP: 'cache_cleanup',
  CACHE_INVALIDATION: 'cache_invalidation',
  
  // Exercise operations
  EXERCISE_UPSERT: 'exercise_upsert',
  EXERCISE_CREATE: 'exercise_create',
  EXERCISE_UPDATE: 'exercise_update',
  EXERCISE_DELETE: 'exercise_delete',
  EXERCISE_REORDER: 'exercise_reorder',
  
  // Error and recovery operations
  ERROR_OCCURRED: 'error_occurred',
  ERROR_RECOVERY: 'error_recovery',
  CONSTRAINT_VIOLATION: 'constraint_violation',
  
  // Performance operations
  PERFORMANCE_METRIC: 'performance_metric',
  OPERATION_TIMING: 'operation_timing',
  
  // User operations
  USER_ACTION: 'user_action',
  SAVE_OPERATION: 'save_operation',
  AUTO_SAVE: 'auto_save',
  MANUAL_SAVE: 'manual_save'
};

/**
 * Performance timer for measuring operation duration
 */
class PerformanceTimer {
  constructor(operation, metadata = {}) {
    this.operation = operation;
    this.metadata = metadata;
    this.startTime = performance.now();
    this.startTimestamp = new Date().toISOString();
    this.markers = [];
  }

  /**
   * Add a marker at current time
   */
  mark(label, metadata = {}) {
    const currentTime = performance.now();
    this.markers.push({
      label,
      time: currentTime,
      duration: currentTime - this.startTime,
      metadata
    });
    return this;
  }

  /**
   * End timer and return duration info
   */
  end(metadata = {}) {
    const endTime = performance.now();
    const duration = endTime - this.startTime;
    
    return {
      operation: this.operation,
      startTime: this.startTime,
      endTime,
      duration,
      startTimestamp: this.startTimestamp,
      endTimestamp: new Date().toISOString(),
      markers: this.markers,
      metadata: { ...this.metadata, ...metadata }
    };
  }
}

/**
 * Structured logger for workout log operations
 */
class WorkoutLogLogger {
  constructor(options = {}) {
    this.options = {
      enableConsoleOutput: true,
      enablePerformanceTracking: true,
      enableMetrics: true,
      logLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
      maxLogHistory: 1000,
      enableStackTrace: process.env.NODE_ENV === 'development',
      ...options
    };
    
    this.logHistory = [];
    this.metrics = {
      totalLogs: 0,
      byLevel: {},
      byOperation: {},
      byErrorType: {},
      performanceMetrics: {
        averageDuration: 0,
        totalOperations: 0,
        slowestOperations: []
      }
    };
    
    this.activeTimers = new Map();
  }

  /**
   * Log a message with structured data
   */
  log(level, operation, message, metadata = {}) {
    // Check if log level is enabled
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = this.createLogEntry(level, operation, message, metadata);
    
    // Add to history
    this.addToHistory(logEntry);
    
    // Update metrics
    this.updateMetrics(logEntry);
    
    // Output to console if enabled
    if (this.options.enableConsoleOutput) {
      this.outputToConsole(logEntry);
    }
    
    return logEntry;
  }

  /**
   * Log debug message
   */
  debug(operation, message, metadata = {}) {
    return this.log(LogLevel.DEBUG, operation, message, metadata);
  }

  /**
   * Log info message
   */
  info(operation, message, metadata = {}) {
    return this.log(LogLevel.INFO, operation, message, metadata);
  }

  /**
   * Log warning message
   */
  warn(operation, message, metadata = {}) {
    return this.log(LogLevel.WARN, operation, message, metadata);
  }

  /**
   * Log error message
   */
  error(operation, message, metadata = {}, error = null) {
    const errorMetadata = { ...metadata };
    
    if (error) {
      errorMetadata.error = {
        name: error.name,
        message: error.message,
        type: error.type || 'unknown',
        stack: this.options.enableStackTrace ? error.stack : undefined
      };
    }
    
    return this.log(LogLevel.ERROR, operation, message, errorMetadata);
  }

  /**
   * Log critical error message
   */
  critical(operation, message, metadata = {}, error = null) {
    const errorMetadata = { ...metadata };
    
    if (error) {
      errorMetadata.error = {
        name: error.name,
        message: error.message,
        type: error.type || 'unknown',
        stack: error.stack
      };
    }
    
    return this.log(LogLevel.CRITICAL, operation, message, errorMetadata);
  }

  /**
   * Log cache operation
   */
  logCacheOperation(operationType, cacheKey, result, metadata = {}) {
    const cacheMetadata = {
      cacheKey,
      result: result ? 'success' : 'failure',
      ...metadata
    };

    switch (operationType) {
      case OperationType.CACHE_HIT:
        return this.info(operationType, `Cache hit for key: ${cacheKey}`, cacheMetadata);
      
      case OperationType.CACHE_MISS:
        return this.debug(operationType, `Cache miss for key: ${cacheKey}`, cacheMetadata);
      
      case OperationType.CACHE_SET:
        return this.debug(operationType, `Cache set for key: ${cacheKey}`, cacheMetadata);
      
      case OperationType.CACHE_VALIDATION:
        return this.debug(operationType, `Cache validation for key: ${cacheKey}`, {
          ...cacheMetadata,
          validationResult: result
        });
      
      case OperationType.CACHE_CLEANUP:
        return this.info(operationType, `Cache cleanup for key: ${cacheKey}`, cacheMetadata);
      
      case OperationType.CACHE_INVALIDATION:
        return this.info(operationType, `Cache invalidation for key: ${cacheKey}`, cacheMetadata);
      
      default:
        return this.debug(operationType, `Cache operation: ${operationType}`, cacheMetadata);
    }
  }

  /**
   * Log exercise operation
   */
  logExerciseOperation(operationType, exerciseData, result, metadata = {}) {
    const exerciseMetadata = {
      exerciseCount: Array.isArray(exerciseData) ? exerciseData.length : 1,
      exerciseIds: Array.isArray(exerciseData) 
        ? exerciseData.map(ex => ex.exerciseId || ex.id).filter(Boolean)
        : [exerciseData?.exerciseId || exerciseData?.id].filter(Boolean),
      result: result ? 'success' : 'failure',
      ...metadata
    };

    switch (operationType) {
      case OperationType.EXERCISE_UPSERT:
        return this.info(operationType, 'Exercise upsert operation completed', exerciseMetadata);
      
      case OperationType.EXERCISE_CREATE:
        return this.info(operationType, 'Exercise creation completed', exerciseMetadata);
      
      case OperationType.EXERCISE_UPDATE:
        return this.info(operationType, 'Exercise update completed', exerciseMetadata);
      
      case OperationType.EXERCISE_DELETE:
        return this.info(operationType, 'Exercise deletion completed', exerciseMetadata);
      
      case OperationType.EXERCISE_REORDER:
        return this.debug(operationType, 'Exercise reordering completed', exerciseMetadata);
      
      default:
        return this.debug(operationType, `Exercise operation: ${operationType}`, exerciseMetadata);
    }
  }

  /**
   * Log error with recovery information
   */
  logErrorWithRecovery(error, recoveryAttempt, recoveryResult, metadata = {}) {
    const errorMetadata = {
      errorType: error.type || 'unknown',
      errorId: error.errorId || 'unknown',
      recoveryStrategy: error.recoveryStrategy || 'unknown',
      recoveryAttempt,
      recoveryResult: recoveryResult ? 'success' : 'failure',
      recoverable: error.recoverable || false,
      retryable: error.retryable || false,
      ...metadata
    };

    if (recoveryResult) {
      return this.info(OperationType.ERROR_RECOVERY, 
        `Error recovery successful: ${error.message}`, errorMetadata);
    } else {
      return this.error(OperationType.ERROR_RECOVERY, 
        `Error recovery failed: ${error.message}`, errorMetadata, error);
    }
  }

  /**
   * Log constraint violation with details
   */
  logConstraintViolation(constraintType, details, recoveryAction, metadata = {}) {
    const constraintMetadata = {
      constraintType,
      constraintDetails: details,
      recoveryAction,
      ...metadata
    };

    return this.warn(OperationType.CONSTRAINT_VIOLATION, 
      `Database constraint violation: ${constraintType}`, constraintMetadata);
  }

  /**
   * Start performance timer
   */
  startTimer(operation, metadata = {}) {
    if (!this.options.enablePerformanceTracking) {
      return null;
    }

    const timerId = this.generateTimerId(operation);
    const timer = new PerformanceTimer(operation, metadata);
    this.activeTimers.set(timerId, timer);
    
    this.debug(OperationType.OPERATION_TIMING, `Started timer for: ${operation}`, {
      timerId,
      ...metadata
    });
    
    return timerId;
  }

  /**
   * End performance timer and log results
   */
  endTimer(timerId, metadata = {}) {
    if (!this.options.enablePerformanceTracking || !timerId) {
      return null;
    }

    const timer = this.activeTimers.get(timerId);
    if (!timer) {
      this.warn(OperationType.OPERATION_TIMING, `Timer not found: ${timerId}`, metadata);
      return null;
    }

    const timing = timer.end(metadata);
    this.activeTimers.delete(timerId);
    
    // Update performance metrics
    this.updatePerformanceMetrics(timing);
    
    // Log timing information
    this.info(OperationType.OPERATION_TIMING, 
      `Operation completed: ${timing.operation}`, {
        timerId,
        duration: timing.duration,
        markers: timing.markers,
        ...timing.metadata
      });
    
    return timing;
  }

  /**
   * Log performance metric
   */
  logPerformanceMetric(metricName, value, unit = 'ms', metadata = {}) {
    if (!this.options.enablePerformanceTracking) {
      return;
    }

    return this.info(OperationType.PERFORMANCE_METRIC, 
      `Performance metric: ${metricName}`, {
        metricName,
        value,
        unit,
        ...metadata
      });
  }

  /**
   * Log user action
   */
  logUserAction(action, context, metadata = {}) {
    return this.info(OperationType.USER_ACTION, `User action: ${action}`, {
      action,
      context,
      ...metadata
    });
  }

  /**
   * Log save operation with details
   */
  logSaveOperation(saveType, workoutLogId, exerciseCount, duration, metadata = {}) {
    const saveMetadata = {
      saveType,
      workoutLogId,
      exerciseCount,
      duration,
      ...metadata
    };

    return this.info(OperationType.SAVE_OPERATION, 
      `Save operation completed: ${saveType}`, saveMetadata);
  }

  /**
   * Create structured log entry
   */
  createLogEntry(level, operation, message, metadata = {}) {
    return {
      id: this.generateLogId(),
      timestamp: new Date().toISOString(),
      level,
      operation,
      message,
      metadata: {
        ...metadata,
        sessionId: this.getSessionId(),
        userId: metadata.userId || 'unknown',
        environment: process.env.NODE_ENV || 'unknown'
      }
    };
  }

  /**
   * Check if log level should be logged
   */
  shouldLog(level) {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR, LogLevel.CRITICAL];
    const currentLevelIndex = levels.indexOf(this.options.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * Add log entry to history
   */
  addToHistory(logEntry) {
    this.logHistory.push(logEntry);
    
    // Trim history if it exceeds max size
    if (this.logHistory.length > this.options.maxLogHistory) {
      this.logHistory = this.logHistory.slice(-this.options.maxLogHistory);
    }
  }

  /**
   * Update metrics with log entry
   */
  updateMetrics(logEntry) {
    this.metrics.totalLogs++;
    
    // Update by level
    this.metrics.byLevel[logEntry.level] = (this.metrics.byLevel[logEntry.level] || 0) + 1;
    
    // Update by operation
    this.metrics.byOperation[logEntry.operation] = (this.metrics.byOperation[logEntry.operation] || 0) + 1;
    
    // Update by error type if applicable
    if (logEntry.metadata.error?.type) {
      this.metrics.byErrorType[logEntry.metadata.error.type] = 
        (this.metrics.byErrorType[logEntry.metadata.error.type] || 0) + 1;
    }
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics(timing) {
    const metrics = this.metrics.performanceMetrics;
    
    // Update average duration
    const totalDuration = metrics.averageDuration * metrics.totalOperations + timing.duration;
    metrics.totalOperations++;
    metrics.averageDuration = totalDuration / metrics.totalOperations;
    
    // Track slowest operations
    metrics.slowestOperations.push({
      operation: timing.operation,
      duration: timing.duration,
      timestamp: timing.endTimestamp
    });
    
    // Keep only top 10 slowest operations
    metrics.slowestOperations.sort((a, b) => b.duration - a.duration);
    metrics.slowestOperations = metrics.slowestOperations.slice(0, 10);
  }

  /**
   * Output log entry to console
   */
  outputToConsole(logEntry) {
    const { level, operation, message, metadata } = logEntry;
    const prefix = this.getConsolePrefix(level, operation);
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(prefix, message, metadata);
        break;
      case LogLevel.INFO:
        console.log(prefix, message, metadata);
        break;
      case LogLevel.WARN:
        console.warn(prefix, message, metadata);
        break;
      case LogLevel.ERROR:
      case LogLevel.CRITICAL:
        console.error(prefix, message, metadata);
        break;
      default:
        console.log(prefix, message, metadata);
    }
  }

  /**
   * Get console prefix for log level and operation
   */
  getConsolePrefix(level, operation) {
    const levelEmojis = {
      [LogLevel.DEBUG]: '🔍',
      [LogLevel.INFO]: '✅',
      [LogLevel.WARN]: '⚠️',
      [LogLevel.ERROR]: '❌',
      [LogLevel.CRITICAL]: '🚨'
    };
    
    const emoji = levelEmojis[level] || '📝';
    return `${emoji} WORKOUT_LOG [${level.toUpperCase()}] ${operation.toUpperCase()}:`;
  }

  /**
   * Generate unique log ID
   */
  generateLogId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `log_${timestamp}_${random}`;
  }

  /**
   * Generate unique timer ID
   */
  generateTimerId(operation) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 3);
    return `timer_${operation}_${timestamp}_${random}`;
  }

  /**
   * Get session ID (simple implementation)
   */
  getSessionId() {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      let sessionId = window.sessionStorage.getItem('workout_log_session_id');
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        window.sessionStorage.setItem('workout_log_session_id', sessionId);
      }
      return sessionId;
    }
    return 'unknown_session';
  }

  /**
   * Get log history
   */
  getLogHistory(filters = {}) {
    let history = [...this.logHistory];
    
    // Apply filters
    if (filters.level) {
      history = history.filter(log => log.level === filters.level);
    }
    
    if (filters.operation) {
      history = history.filter(log => log.operation === filters.operation);
    }
    
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      history = history.filter(log => new Date(log.timestamp) >= sinceDate);
    }
    
    if (filters.userId) {
      history = history.filter(log => log.metadata.userId === filters.userId);
    }
    
    return history;
  }

  /**
   * Get metrics summary
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeTimers: this.activeTimers.size,
      logHistorySize: this.logHistory.length
    };
  }

  /**
   * Clear log history
   */
  clearHistory() {
    this.logHistory = [];
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      totalLogs: 0,
      byLevel: {},
      byOperation: {},
      byErrorType: {},
      performanceMetrics: {
        averageDuration: 0,
        totalOperations: 0,
        slowestOperations: []
      }
    };
  }

  /**
   * Export logs as JSON
   */
  exportLogs(filters = {}) {
    const logs = this.getLogHistory(filters);
    return {
      exportTimestamp: new Date().toISOString(),
      totalLogs: logs.length,
      filters,
      logs,
      metrics: this.getMetrics()
    };
  }
}

/**
 * Global logger instance
 */
const workoutLogLogger = new WorkoutLogLogger({
  enableConsoleOutput: process.env.NODE_ENV === 'development',
  enablePerformanceTracking: true,
  enableMetrics: true,
  logLevel: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO
});

/**
 * Convenience logging functions
 */
const logDebug = (operation, message, metadata) => 
  workoutLogLogger.debug(operation, message, metadata);

const logInfo = (operation, message, metadata) => 
  workoutLogLogger.info(operation, message, metadata);

const logWarn = (operation, message, metadata) => 
  workoutLogLogger.warn(operation, message, metadata);

const logError = (operation, message, metadata, error) => 
  workoutLogLogger.error(operation, message, metadata, error);

const logCritical = (operation, message, metadata, error) => 
  workoutLogLogger.critical(operation, message, metadata, error);

const logCacheOperation = (operationType, cacheKey, result, metadata) =>
  workoutLogLogger.logCacheOperation(operationType, cacheKey, result, metadata);

const logExerciseOperation = (operationType, exerciseData, result, metadata) =>
  workoutLogLogger.logExerciseOperation(operationType, exerciseData, result, metadata);

const startTimer = (operation, metadata) =>
  workoutLogLogger.startTimer(operation, metadata);

const endTimer = (timerId, metadata) =>
  workoutLogLogger.endTimer(timerId, metadata);

const logPerformanceMetric = (metricName, value, unit, metadata) =>
  workoutLogLogger.logPerformanceMetric(metricName, value, unit, metadata);

// Export all logging utilities
module.exports = {
  LogLevel,
  OperationType,
  WorkoutLogLogger,
  workoutLogLogger,
  logDebug,
  logInfo,
  logWarn,
  logError,
  logCritical,
  logCacheOperation,
  logExerciseOperation,
  startTimer,
  endTimer,
  logPerformanceMetric
};