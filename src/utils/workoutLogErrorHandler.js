/**
 * Workout Log Error Handling and Classification System
 * 
 * Provides comprehensive error classification, recovery strategies, and logging
 * for workout log operations to ensure data integrity and user experience.
 */

/**
 * Workout Log Error Types for classification and handling
 */
const WorkoutLogErrorType = {
  // Cache-related errors
  CACHE_VALIDATION_FAILED: 'cache_validation_failed',
  CACHE_CORRUPTION: 'cache_corruption',
  CACHE_TIMEOUT: 'cache_timeout',
  
  // Database constraint errors
  DUPLICATE_CONSTRAINT_VIOLATION: 'duplicate_constraint_violation',
  FOREIGN_KEY_VIOLATION: 'foreign_key_violation',
  CHECK_CONSTRAINT_VIOLATION: 'check_constraint_violation',
  
  // Exercise operation errors
  EXERCISE_UPSERT_FAILED: 'exercise_upsert_failed',
  EXERCISE_SAVE_FAILED: 'exercise_save_failed',
  EXERCISE_VALIDATION_FAILED: 'exercise_validation_failed',
  EXERCISE_ORDER_CONFLICT: 'exercise_order_conflict',
  
  // Metadata operation errors
  METADATA_SAVE_FAILED: 'metadata_save_failed',
  
  // Network and connectivity errors
  NETWORK_ERROR: 'network_error',
  CONNECTION_TIMEOUT: 'connection_timeout',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded',
  
  // Data validation errors
  INVALID_DATA: 'invalid_data',
  MISSING_REQUIRED_FIELDS: 'missing_required_fields',
  DATA_TYPE_MISMATCH: 'data_type_mismatch',
  
  // Database operation errors
  DATABASE_ERROR: 'database_error',
  TRANSACTION_FAILED: 'transaction_failed',
  QUERY_TIMEOUT: 'query_timeout',
  
  // Authentication and authorization errors
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  SESSION_EXPIRED: 'session_expired',
  
  // System and resource errors
  MEMORY_LIMIT_EXCEEDED: 'memory_limit_exceeded',
  DISK_SPACE_FULL: 'disk_space_full',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  
  // Unknown or unclassified errors
  UNKNOWN_ERROR: 'unknown_error'
};

/**
 * Error severity levels
 */
const ErrorSeverity = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Error recovery strategies
 */
const RecoveryStrategy = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  USER_INTERVENTION: 'user_intervention',
  CACHE_CLEANUP: 'cache_cleanup',
  DATA_SANITIZATION: 'data_sanitization',
  NO_RECOVERY: 'no_recovery'
};

/**
 * Enhanced error class for workout log operations
 */
class WorkoutLogError extends Error {
  constructor(type, message, context = {}, originalError = null) {
    super(message);
    this.name = 'WorkoutLogError';
    this.type = type;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
    
    // Determine error characteristics
    this.severity = this.determineSeverity(type);
    this.recoverable = this.isRecoverable(type);
    this.retryable = this.isRetryable(type);
    this.recoveryStrategy = this.getRecoveryStrategy(type);
    this.userFriendly = this.generateUserFriendlyMessage(type, context);
    
    // Generate unique error ID for tracking
    this.errorId = this.generateErrorId();
  }

  /**
   * Determine error severity based on type
   */
  determineSeverity(type) {
    const severityMap = {
      [WorkoutLogErrorType.CACHE_VALIDATION_FAILED]: ErrorSeverity.LOW,
      [WorkoutLogErrorType.CACHE_CORRUPTION]: ErrorSeverity.MEDIUM,
      [WorkoutLogErrorType.CACHE_TIMEOUT]: ErrorSeverity.LOW,
      
      [WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION]: ErrorSeverity.MEDIUM,
      [WorkoutLogErrorType.FOREIGN_KEY_VIOLATION]: ErrorSeverity.HIGH,
      [WorkoutLogErrorType.CHECK_CONSTRAINT_VIOLATION]: ErrorSeverity.HIGH,
      
      [WorkoutLogErrorType.EXERCISE_UPSERT_FAILED]: ErrorSeverity.MEDIUM,
      [WorkoutLogErrorType.EXERCISE_VALIDATION_FAILED]: ErrorSeverity.MEDIUM,
      [WorkoutLogErrorType.EXERCISE_ORDER_CONFLICT]: ErrorSeverity.LOW,
      [WorkoutLogErrorType.METADATA_SAVE_FAILED]: ErrorSeverity.MEDIUM,
      
      [WorkoutLogErrorType.NETWORK_ERROR]: ErrorSeverity.MEDIUM,
      [WorkoutLogErrorType.CONNECTION_TIMEOUT]: ErrorSeverity.MEDIUM,
      [WorkoutLogErrorType.RATE_LIMIT_EXCEEDED]: ErrorSeverity.LOW,
      
      [WorkoutLogErrorType.INVALID_DATA]: ErrorSeverity.MEDIUM,
      [WorkoutLogErrorType.MISSING_REQUIRED_FIELDS]: ErrorSeverity.MEDIUM,
      [WorkoutLogErrorType.DATA_TYPE_MISMATCH]: ErrorSeverity.MEDIUM,
      
      [WorkoutLogErrorType.DATABASE_ERROR]: ErrorSeverity.HIGH,
      [WorkoutLogErrorType.TRANSACTION_FAILED]: ErrorSeverity.HIGH,
      [WorkoutLogErrorType.QUERY_TIMEOUT]: ErrorSeverity.MEDIUM,
      
      [WorkoutLogErrorType.UNAUTHORIZED]: ErrorSeverity.HIGH,
      [WorkoutLogErrorType.FORBIDDEN]: ErrorSeverity.HIGH,
      [WorkoutLogErrorType.SESSION_EXPIRED]: ErrorSeverity.MEDIUM,
      
      [WorkoutLogErrorType.MEMORY_LIMIT_EXCEEDED]: ErrorSeverity.CRITICAL,
      [WorkoutLogErrorType.DISK_SPACE_FULL]: ErrorSeverity.CRITICAL,
      [WorkoutLogErrorType.SERVICE_UNAVAILABLE]: ErrorSeverity.HIGH,
      
      [WorkoutLogErrorType.UNKNOWN_ERROR]: ErrorSeverity.MEDIUM
    };

    return severityMap[type] || ErrorSeverity.MEDIUM;
  }

  /**
   * Check if error is recoverable
   */
  isRecoverable(type) {
    const recoverableTypes = [
      WorkoutLogErrorType.CACHE_VALIDATION_FAILED,
      WorkoutLogErrorType.CACHE_CORRUPTION,
      WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION,
      WorkoutLogErrorType.EXERCISE_UPSERT_FAILED,
      WorkoutLogErrorType.EXERCISE_ORDER_CONFLICT,
      WorkoutLogErrorType.METADATA_SAVE_FAILED,
      WorkoutLogErrorType.NETWORK_ERROR,
      WorkoutLogErrorType.CONNECTION_TIMEOUT,
      WorkoutLogErrorType.RATE_LIMIT_EXCEEDED,
      WorkoutLogErrorType.INVALID_DATA,
      WorkoutLogErrorType.DATA_TYPE_MISMATCH,
      WorkoutLogErrorType.QUERY_TIMEOUT,
      WorkoutLogErrorType.SESSION_EXPIRED
    ];
    return recoverableTypes.includes(type);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(type) {
    const retryableTypes = [
      WorkoutLogErrorType.CACHE_VALIDATION_FAILED,
      WorkoutLogErrorType.CACHE_TIMEOUT,
      WorkoutLogErrorType.NETWORK_ERROR,
      WorkoutLogErrorType.CONNECTION_TIMEOUT,
      WorkoutLogErrorType.RATE_LIMIT_EXCEEDED,
      WorkoutLogErrorType.QUERY_TIMEOUT,
      WorkoutLogErrorType.SERVICE_UNAVAILABLE
    ];
    return retryableTypes.includes(type);
  }

  /**
   * Get recovery strategy for error type
   */
  getRecoveryStrategy(type) {
    const strategyMap = {
      [WorkoutLogErrorType.CACHE_VALIDATION_FAILED]: RecoveryStrategy.CACHE_CLEANUP,
      [WorkoutLogErrorType.CACHE_CORRUPTION]: RecoveryStrategy.CACHE_CLEANUP,
      [WorkoutLogErrorType.CACHE_TIMEOUT]: RecoveryStrategy.RETRY,
      
      [WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION]: RecoveryStrategy.FALLBACK,
      [WorkoutLogErrorType.FOREIGN_KEY_VIOLATION]: RecoveryStrategy.DATA_SANITIZATION,
      [WorkoutLogErrorType.CHECK_CONSTRAINT_VIOLATION]: RecoveryStrategy.DATA_SANITIZATION,
      
      [WorkoutLogErrorType.EXERCISE_UPSERT_FAILED]: RecoveryStrategy.RETRY,
      [WorkoutLogErrorType.EXERCISE_VALIDATION_FAILED]: RecoveryStrategy.DATA_SANITIZATION,
      [WorkoutLogErrorType.EXERCISE_ORDER_CONFLICT]: RecoveryStrategy.FALLBACK,
      [WorkoutLogErrorType.METADATA_SAVE_FAILED]: RecoveryStrategy.RETRY,
      
      [WorkoutLogErrorType.NETWORK_ERROR]: RecoveryStrategy.RETRY,
      [WorkoutLogErrorType.CONNECTION_TIMEOUT]: RecoveryStrategy.RETRY,
      [WorkoutLogErrorType.RATE_LIMIT_EXCEEDED]: RecoveryStrategy.RETRY,
      
      [WorkoutLogErrorType.INVALID_DATA]: RecoveryStrategy.DATA_SANITIZATION,
      [WorkoutLogErrorType.MISSING_REQUIRED_FIELDS]: RecoveryStrategy.USER_INTERVENTION,
      [WorkoutLogErrorType.DATA_TYPE_MISMATCH]: RecoveryStrategy.DATA_SANITIZATION,
      
      [WorkoutLogErrorType.DATABASE_ERROR]: RecoveryStrategy.RETRY,
      [WorkoutLogErrorType.TRANSACTION_FAILED]: RecoveryStrategy.RETRY,
      [WorkoutLogErrorType.QUERY_TIMEOUT]: RecoveryStrategy.RETRY,
      
      [WorkoutLogErrorType.UNAUTHORIZED]: RecoveryStrategy.USER_INTERVENTION,
      [WorkoutLogErrorType.FORBIDDEN]: RecoveryStrategy.USER_INTERVENTION,
      [WorkoutLogErrorType.SESSION_EXPIRED]: RecoveryStrategy.USER_INTERVENTION,
      
      [WorkoutLogErrorType.MEMORY_LIMIT_EXCEEDED]: RecoveryStrategy.NO_RECOVERY,
      [WorkoutLogErrorType.DISK_SPACE_FULL]: RecoveryStrategy.NO_RECOVERY,
      [WorkoutLogErrorType.SERVICE_UNAVAILABLE]: RecoveryStrategy.RETRY,
      
      [WorkoutLogErrorType.UNKNOWN_ERROR]: RecoveryStrategy.USER_INTERVENTION
    };

    return strategyMap[type] || RecoveryStrategy.USER_INTERVENTION;
  }

  /**
   * Generate user-friendly error message
   */
  generateUserFriendlyMessage(type, context = {}) {
    const messageMap = {
      [WorkoutLogErrorType.CACHE_VALIDATION_FAILED]: {
        title: 'Data Sync Issue',
        message: 'Your workout data needs to be refreshed. This has been done automatically.',
        action: 'Continue working on your workout.'
      },
      
      [WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION]: {
        title: 'Workout Already Exists',
        message: 'A workout log already exists for this program, week, and day. Your changes have been saved to the existing workout.',
        action: 'Your data is safe and up to date.'
      },
      
      [WorkoutLogErrorType.EXERCISE_UPSERT_FAILED]: {
        title: 'Exercise Save Error',
        message: 'There was an issue saving your exercise data. We\'re retrying automatically.',
        action: 'Please wait a moment and try again if the issue persists.'
      },
      
      [WorkoutLogErrorType.NETWORK_ERROR]: {
        title: 'Connection Issue',
        message: 'Unable to connect to the server. Your data will be saved when connection is restored.',
        action: 'Check your internet connection and try again.'
      },
      
      [WorkoutLogErrorType.INVALID_DATA]: {
        title: 'Invalid Data',
        message: 'Some of your workout data is invalid and needs to be corrected.',
        action: 'Please check your entries and try again.'
      },
      
      [WorkoutLogErrorType.SESSION_EXPIRED]: {
        title: 'Session Expired',
        message: 'Your session has expired. Please log in again to continue.',
        action: 'You will be redirected to the login page.'
      },
      
      [WorkoutLogErrorType.SERVICE_UNAVAILABLE]: {
        title: 'Service Temporarily Unavailable',
        message: 'The workout service is temporarily unavailable. We\'re working to restore it.',
        action: 'Please try again in a few minutes.'
      }
    };

    const defaultMessage = {
      title: 'Unexpected Error',
      message: 'An unexpected error occurred while saving your workout.',
      action: 'Please try again or contact support if the issue persists.'
    };

    return messageMap[type] || defaultMessage;
  }

  /**
   * Generate unique error ID for tracking
   */
  generateErrorId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `wle_${timestamp}_${random}`;
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON() {
    return {
      errorId: this.errorId,
      name: this.name,
      type: this.type,
      message: this.message,
      severity: this.severity,
      recoverable: this.recoverable,
      retryable: this.retryable,
      recoveryStrategy: this.recoveryStrategy,
      userFriendly: this.userFriendly,
      context: this.context,
      timestamp: this.timestamp,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : null
    };
  }

  /**
   * Get error summary for quick reference
   */
  getSummary() {
    return {
      id: this.errorId,
      type: this.type,
      severity: this.severity,
      recoverable: this.recoverable,
      strategy: this.recoveryStrategy,
      timestamp: this.timestamp
    };
  }
}

/**
 * Error classification utilities
 */
class ErrorClassifier {
  /**
   * Classify error based on error object and context
   */
  static classify(error, context = {}) {
    // Handle already classified WorkoutLogError
    if (error instanceof WorkoutLogError) {
      return error;
    }

    // Classify based on error properties
    const errorType = this.determineErrorType(error, context);
    
    return new WorkoutLogError(
      errorType,
      error.message || 'Unknown error occurred',
      {
        ...context,
        originalErrorName: error.name,
        originalErrorCode: error.code,
        classification: 'auto_classified'
      },
      error
    );
  }

  /**
   * Determine error type from error object and context
   */
  static determineErrorType(error, context = {}) {
    // Database constraint violations
    if (error.code === '23505') {
      if (error.message?.includes('unique_user_program_week_day') || 
          error.message?.includes('workout_logs_user_id_program_id_week_index_day_index_key')) {
        return WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION;
      }
      return WorkoutLogErrorType.CHECK_CONSTRAINT_VIOLATION;
    }

    if (error.code === '23503') {
      return WorkoutLogErrorType.FOREIGN_KEY_VIOLATION;
    }

    if (error.code === '23514') {
      return WorkoutLogErrorType.CHECK_CONSTRAINT_VIOLATION;
    }

    // Network and connection errors
    if (error.name === 'NetworkError' || 
        error.message?.includes('network') || 
        error.message?.includes('fetch')) {
      return WorkoutLogErrorType.NETWORK_ERROR;
    }

    if (error.name === 'TimeoutError' || 
        error.message?.includes('timeout')) {
      return WorkoutLogErrorType.CONNECTION_TIMEOUT;
    }

    // Authentication errors
    if (error.status === 401 || error.message?.includes('unauthorized')) {
      return WorkoutLogErrorType.UNAUTHORIZED;
    }

    if (error.status === 403 || error.message?.includes('forbidden')) {
      return WorkoutLogErrorType.FORBIDDEN;
    }

    // Rate limiting
    if (error.status === 429 || error.message?.includes('rate limit')) {
      return WorkoutLogErrorType.RATE_LIMIT_EXCEEDED;
    }

    // Service availability
    if (error.status === 503 || error.message?.includes('service unavailable')) {
      return WorkoutLogErrorType.SERVICE_UNAVAILABLE;
    }

    // Cache-related errors
    if (context.operation?.includes('cache') || 
        error.message?.includes('cache')) {
      if (error.message?.includes('validation')) {
        return WorkoutLogErrorType.CACHE_VALIDATION_FAILED;
      }
      if (error.message?.includes('timeout')) {
        return WorkoutLogErrorType.CACHE_TIMEOUT;
      }
      return WorkoutLogErrorType.CACHE_CORRUPTION;
    }

    // Exercise-related errors
    if (context.operation?.includes('exercise') || 
        context.operation?.includes('upsert')) {
      if (error.message?.includes('validation')) {
        return WorkoutLogErrorType.EXERCISE_VALIDATION_FAILED;
      }
      if (error.message?.includes('order')) {
        return WorkoutLogErrorType.EXERCISE_ORDER_CONFLICT;
      }
      return WorkoutLogErrorType.EXERCISE_UPSERT_FAILED;
    }

    // Data validation errors
    if (error.message?.includes('invalid') || 
        error.message?.includes('validation')) {
      if (error.message?.includes('required')) {
        return WorkoutLogErrorType.MISSING_REQUIRED_FIELDS;
      }
      if (error.message?.includes('type')) {
        return WorkoutLogErrorType.DATA_TYPE_MISMATCH;
      }
      return WorkoutLogErrorType.INVALID_DATA;
    }

    // Database errors
    if (error.code?.startsWith('42') || // SQL syntax errors
        error.code?.startsWith('08') || // Connection errors
        error.message?.includes('database') ||
        error.message?.includes('sql')) {
      if (error.message?.includes('timeout')) {
        return WorkoutLogErrorType.QUERY_TIMEOUT;
      }
      if (error.message?.includes('transaction')) {
        return WorkoutLogErrorType.TRANSACTION_FAILED;
      }
      return WorkoutLogErrorType.DATABASE_ERROR;
    }

    // Memory and resource errors
    if (error.message?.includes('memory') || 
        error.message?.includes('heap')) {
      return WorkoutLogErrorType.MEMORY_LIMIT_EXCEEDED;
    }

    if (error.message?.includes('disk') || 
        error.message?.includes('space')) {
      return WorkoutLogErrorType.DISK_SPACE_FULL;
    }

    // Default to unknown error
    return WorkoutLogErrorType.UNKNOWN_ERROR;
  }

  /**
   * Get error statistics for monitoring
   */
  static getErrorStats(errors) {
    const stats = {
      total: errors.length,
      byType: {},
      bySeverity: {},
      byRecoveryStrategy: {},
      recoverable: 0,
      retryable: 0
    };

    errors.forEach(error => {
      // Count by type
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
      
      // Count by severity
      stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
      
      // Count by recovery strategy
      stats.byRecoveryStrategy[error.recoveryStrategy] = 
        (stats.byRecoveryStrategy[error.recoveryStrategy] || 0) + 1;
      
      // Count recoverable and retryable
      if (error.recoverable) stats.recoverable++;
      if (error.retryable) stats.retryable++;
    });

    return stats;
  }
}

/**
 * Error recovery strategy mapping
 */
const ErrorRecoveryStrategies = {
  [WorkoutLogErrorType.CACHE_VALIDATION_FAILED]: {
    strategy: RecoveryStrategy.CACHE_CLEANUP,
    maxRetries: 2,
    retryDelay: 1000,
    description: 'Clear invalid cache and retry with database query'
  },
  
  [WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION]: {
    strategy: RecoveryStrategy.FALLBACK,
    maxRetries: 1,
    retryDelay: 0,
    description: 'Attempt to update existing record instead of creating new one'
  },
  
  [WorkoutLogErrorType.EXERCISE_UPSERT_FAILED]: {
    strategy: RecoveryStrategy.RETRY,
    maxRetries: 3,
    retryDelay: 2000,
    description: 'Retry exercise upsert operation with exponential backoff'
  },
  
  [WorkoutLogErrorType.METADATA_SAVE_FAILED]: {
    strategy: RecoveryStrategy.RETRY,
    maxRetries: 3,
    retryDelay: 1000,
    description: 'Retry metadata save operation with exponential backoff'
  },
  
  [WorkoutLogErrorType.NETWORK_ERROR]: {
    strategy: RecoveryStrategy.RETRY,
    maxRetries: 5,
    retryDelay: 1000,
    description: 'Retry network operation with exponential backoff'
  },
  
  [WorkoutLogErrorType.INVALID_DATA]: {
    strategy: RecoveryStrategy.DATA_SANITIZATION,
    maxRetries: 1,
    retryDelay: 0,
    description: 'Sanitize data and retry operation'
  },
  
  [WorkoutLogErrorType.SESSION_EXPIRED]: {
    strategy: RecoveryStrategy.USER_INTERVENTION,
    maxRetries: 0,
    retryDelay: 0,
    description: 'Require user to re-authenticate'
  }
};

/**
 * Error context collection utilities
 */
class ErrorContextCollector {
  /**
   * Collect comprehensive error context
   */
  static collect(operation, additionalContext = {}) {
    return {
      // Operation context
      operation,
      timestamp: new Date().toISOString(),
      
      // Browser context
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      
      // Application context
      environment: process.env.NODE_ENV || 'unknown',
      version: process.env.REACT_APP_VERSION || 'unknown',
      
      // Performance context
      memory: this.getMemoryInfo(),
      timing: this.getTimingInfo(),
      
      // Additional context
      ...additionalContext
    };
  }

  /**
   * Get memory information if available
   */
  static getMemoryInfo() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  }

  /**
   * Get timing information if available
   */
  static getTimingInfo() {
    if (typeof performance !== 'undefined' && performance.timing) {
      const timing = performance.timing;
      return {
        navigationStart: timing.navigationStart,
        loadEventEnd: timing.loadEventEnd,
        domContentLoadedEventEnd: timing.domContentLoadedEventEnd
      };
    }
    return null;
  }
}

// Export all error handling utilities
module.exports = {
  WorkoutLogErrorType,
  ErrorSeverity,
  RecoveryStrategy,
  WorkoutLogError,
  ErrorClassifier,
  ErrorRecoveryStrategies,
  ErrorContextCollector
};