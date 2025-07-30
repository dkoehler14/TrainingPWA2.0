/**
 * Cache Warming Error Handler
 * 
 * Comprehensive error handling system for Supabase cache warming operations.
 * Provides error categorization, recovery strategies, detailed logging, and monitoring.
 */

import { gracefulDegradationManager, ServiceAspect } from './gracefulDegradationManager.js';

/**
 * Error categories for cache warming operations
 */
export const ErrorCategory = {
  NETWORK: 'NETWORK',
  AUTH: 'AUTH', 
  DATABASE: 'DATABASE',
  CACHE: 'CACHE',
  VALIDATION: 'VALIDATION',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Error severity levels
 */
export const ErrorSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

/**
 * Recovery strategies for different error types
 */
export const RecoveryStrategy = {
  RETRY: 'RETRY',
  FALLBACK: 'FALLBACK',
  SKIP: 'SKIP',
  ABORT: 'ABORT',
  DEGRADE: 'DEGRADE'
};

/**
 * Custom error class for cache warming operations
 */
export class CacheWarmingError extends Error {
  constructor(message, category, severity, context = {}, originalError = null) {
    super(message);
    this.name = 'CacheWarmingError';
    this.category = category;
    this.severity = severity;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
    this.retryable = this.determineRetryability();
    this.recoveryStrategy = this.determineRecoveryStrategy();
  }

  /**
   * Determine if this error is retryable based on category and context
   */
  determineRetryability() {
    switch (this.category) {
      case ErrorCategory.NETWORK:
      case ErrorCategory.TIMEOUT:
      case ErrorCategory.RATE_LIMIT:
        return true;
      case ErrorCategory.DATABASE:
        // Database errors are retryable unless they're constraint violations
        return !this.isConstraintViolation();
      case ErrorCategory.CACHE:
        return true;
      case ErrorCategory.AUTH:
        // Auth errors are generally not retryable
        return false;
      case ErrorCategory.VALIDATION:
        return false;
      default:
        return true; // Default to retryable for unknown errors
    }
  }

  /**
   * Determine recovery strategy based on error characteristics
   */
  determineRecoveryStrategy() {
    if (!this.retryable) {
      switch (this.category) {
        case ErrorCategory.AUTH:
          return RecoveryStrategy.SKIP;
        case ErrorCategory.VALIDATION:
          return RecoveryStrategy.ABORT;
        default:
          return RecoveryStrategy.FALLBACK;
      }
    }

    switch (this.severity) {
      case ErrorSeverity.CRITICAL:
        return RecoveryStrategy.ABORT;
      case ErrorSeverity.HIGH:
        return RecoveryStrategy.RETRY;
      case ErrorSeverity.MEDIUM:
        return RecoveryStrategy.FALLBACK;
      case ErrorSeverity.LOW:
        return RecoveryStrategy.DEGRADE;
      default:
        return RecoveryStrategy.RETRY;
    }
  }

  /**
   * Check if this is a database constraint violation
   */
  isConstraintViolation() {
    if (!this.originalError) return false;
    
    const constraintCodes = ['23505', '23503', '23502', '23514'];
    return constraintCodes.includes(this.originalError.code);
  }

  /**
   * Convert error to JSON for logging and monitoring
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      category: this.category,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      retryable: this.retryable,
      recoveryStrategy: this.recoveryStrategy,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        code: this.originalError.code,
        stack: this.originalError.stack
      } : null
    };
  }
}

/**
 * Error rate monitoring and alerting system
 */
export class ErrorRateMonitor {
  constructor(options = {}) {
    this.config = {
      windowSizeMs: options.windowSizeMs || 300000, // 5 minutes
      maxErrorRate: options.maxErrorRate || 0.1, // 10% error rate threshold
      minSampleSize: options.minSampleSize || 10,
      alertCooldownMs: options.alertCooldownMs || 600000, // 10 minutes
      ...options
    };

    this.errorCounts = new Map(); // category -> count
    this.totalOperations = 0;
    this.windowStart = Date.now();
    this.lastAlertTime = new Map(); // category -> timestamp
    this.alerts = [];
  }

  /**
   * Record an error occurrence
   */
  recordError(category, context = {}) {
    this.cleanupOldData();
    
    const currentCount = this.errorCounts.get(category) || 0;
    this.errorCounts.set(category, currentCount + 1);
    
    this.checkForAlerts(category);
  }

  /**
   * Record a successful operation
   */
  recordSuccess() {
    this.cleanupOldData();
    this.totalOperations++;
  }

  /**
   * Check if error rate exceeds threshold and trigger alerts
   */
  checkForAlerts(category) {
    if (this.totalOperations < this.config.minSampleSize) {
      return; // Not enough data for meaningful analysis
    }

    const errorCount = this.errorCounts.get(category) || 0;
    const errorRate = errorCount / this.totalOperations;
    
    if (errorRate > this.config.maxErrorRate) {
      this.triggerAlert(category, errorRate, errorCount);
    }
  }

  /**
   * Trigger an alert for high error rate
   */
  triggerAlert(category, errorRate, errorCount) {
    const now = Date.now();
    const lastAlert = this.lastAlertTime.get(category) || 0;
    
    // Check cooldown period
    if (now - lastAlert < this.config.alertCooldownMs) {
      return;
    }

    const alert = {
      category,
      errorRate: Math.round(errorRate * 100),
      errorCount,
      totalOperations: this.totalOperations,
      timestamp: new Date().toISOString(),
      windowSizeMinutes: this.config.windowSizeMs / 60000
    };

    this.alerts.push(alert);
    this.lastAlertTime.set(category, now);

    console.warn(`🚨 High error rate alert: ${category}`, alert);
    
    // In production, this could send notifications to monitoring systems
    this.notifyMonitoringSystem(alert);
  }

  /**
   * Clean up old data outside the monitoring window
   */
  cleanupOldData() {
    const now = Date.now();
    
    if (now - this.windowStart > this.config.windowSizeMs) {
      // Reset counters for new window
      this.errorCounts.clear();
      this.totalOperations = 0;
      this.windowStart = now;
    }
  }

  /**
   * Get current error statistics
   */
  getErrorStats() {
    this.cleanupOldData();
    
    const stats = {
      windowSizeMs: this.config.windowSizeMs,
      totalOperations: this.totalOperations,
      errorsByCategory: {},
      overallErrorRate: 0,
      alerts: this.alerts.slice(-10) // Last 10 alerts
    };

    let totalErrors = 0;
    
    for (const [category, count] of this.errorCounts.entries()) {
      const errorRate = this.totalOperations > 0 ? count / this.totalOperations : 0;
      stats.errorsByCategory[category] = {
        count,
        rate: Math.round(errorRate * 100),
        exceedsThreshold: errorRate > this.config.maxErrorRate
      };
      totalErrors += count;
    }

    stats.overallErrorRate = this.totalOperations > 0 
      ? Math.round((totalErrors / this.totalOperations) * 100)
      : 0;

    return stats;
  }

  /**
   * Notify external monitoring system (placeholder for integration)
   */
  notifyMonitoringSystem(alert) {
    // This could integrate with services like:
    // - Sentry for error tracking
    // - DataDog for metrics
    // - Slack/Discord for notifications
    // - Custom webhook endpoints
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Would notify monitoring system:', alert);
    }
  }

  /**
   * Reset all monitoring data
   */
  reset() {
    this.errorCounts.clear();
    this.totalOperations = 0;
    this.windowStart = Date.now();
    this.lastAlertTime.clear();
    this.alerts = [];
  }
}

/**
 * Comprehensive error handler for cache warming operations
 */
export class CacheWarmingErrorHandler {
  constructor(options = {}) {
    this.config = {
      maxRetries: options.maxRetries || 3,
      baseRetryDelay: options.baseRetryDelay || 1000,
      maxRetryDelay: options.maxRetryDelay || 10000,
      retryBackoffFactor: options.retryBackoffFactor || 2,
      enableErrorRateMonitoring: options.enableErrorRateMonitoring !== false,
      enableDetailedLogging: options.enableDetailedLogging !== false,
      logLevel: options.logLevel || 'info',
      ...options
    };

    this.errorRateMonitor = this.config.enableErrorRateMonitoring 
      ? new ErrorRateMonitor(options.monitoringConfig)
      : null;

    this.errorHistory = [];
    this.maxHistorySize = options.maxHistorySize || 100;
    
    // Integration with graceful degradation
    this.degradationManager = gracefulDegradationManager;
    this.enableGracefulDegradation = options.enableGracefulDegradation !== false;
  }

  /**
   * Categorize error based on its characteristics
   */
  categorizeError(error, context = {}) {
    if (!error) return ErrorCategory.UNKNOWN;

    // Network-related errors
    if (this.isNetworkError(error)) {
      return ErrorCategory.NETWORK;
    }

    // Authentication errors
    if (this.isAuthError(error)) {
      return ErrorCategory.AUTH;
    }

    // Database errors
    if (this.isDatabaseError(error)) {
      return ErrorCategory.DATABASE;
    }

    // Cache-specific errors
    if (this.isCacheError(error, context)) {
      return ErrorCategory.CACHE;
    }

    // Timeout errors
    if (this.isTimeoutError(error)) {
      return ErrorCategory.TIMEOUT;
    }

    // Rate limiting errors
    if (this.isRateLimitError(error)) {
      return ErrorCategory.RATE_LIMIT;
    }

    // Validation errors
    if (this.isValidationError(error)) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  determineErrorSeverity(error, category, context = {}) {
    // Critical errors that should stop all operations
    if (category === ErrorCategory.AUTH && context.operation === 'app-init') {
      return ErrorSeverity.CRITICAL;
    }

    if (category === ErrorCategory.DATABASE && this.isDatabaseConnectionError(error)) {
      return ErrorSeverity.CRITICAL;
    }

    // High severity errors
    if (category === ErrorCategory.NETWORK && context.priority === 'high') {
      return ErrorSeverity.HIGH;
    }

    if (category === ErrorCategory.TIMEOUT && context.retryCount >= 2) {
      return ErrorSeverity.HIGH;
    }

    // Medium severity errors
    if (category === ErrorCategory.CACHE) {
      return ErrorSeverity.MEDIUM;
    }

    if (category === ErrorCategory.RATE_LIMIT) {
      return ErrorSeverity.MEDIUM;
    }

    // Low severity errors
    if (category === ErrorCategory.VALIDATION) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM; // Default
  }

  /**
   * Handle error with appropriate recovery strategy
   */
  async handleError(error, context = {}) {
    const category = this.categorizeError(error, context);
    const severity = this.determineErrorSeverity(error, category, context);
    
    const cacheError = new CacheWarmingError(
      error.message || 'Unknown cache warming error',
      category,
      severity,
      context,
      error
    );

    // Record error for monitoring
    if (this.errorRateMonitor) {
      this.errorRateMonitor.recordError(category, context);
    }

    // Add to error history
    this.addToErrorHistory(cacheError);

    // Log error with appropriate level
    this.logError(cacheError);

    // Record failure for graceful degradation tracking
    if (this.enableGracefulDegradation) {
      const serviceAspect = this.mapOperationToServiceAspect(context.operation);
      this.degradationManager.recordFailure(serviceAspect, category, severity, context);

      // Evaluate if degradation is needed
      const degradationEvaluation = this.degradationManager.evaluateDegradationNeed(
        category, severity, serviceAspect, context
      );

      if (degradationEvaluation.needsDegradation) {
        console.log(`🛡️ Applying graceful degradation: ${degradationEvaluation.reason}`);
        await this.degradationManager.applyDegradation(
          serviceAspect,
          degradationEvaluation.recommendedLevel,
          degradationEvaluation.reason,
          context
        );
      }
    }

    // Apply recovery strategy
    return await this.applyRecoveryStrategy(cacheError, context);
  }

  /**
   * Apply recovery strategy based on error characteristics
   */
  async applyRecoveryStrategy(cacheError, context = {}) {
    const { recoveryStrategy, category, severity } = cacheError;

    switch (recoveryStrategy) {
      case RecoveryStrategy.RETRY:
        return await this.handleRetryStrategy(cacheError, context);
      
      case RecoveryStrategy.FALLBACK:
        return await this.handleFallbackStrategy(cacheError, context);
      
      case RecoveryStrategy.SKIP:
        return this.handleSkipStrategy(cacheError, context);
      
      case RecoveryStrategy.ABORT:
        return this.handleAbortStrategy(cacheError, context);
      
      case RecoveryStrategy.DEGRADE:
        return await this.handleDegradeStrategy(cacheError, context);
      
      default:
        console.warn(`Unknown recovery strategy: ${recoveryStrategy}`);
        return this.handleFallbackStrategy(cacheError, context);
    }
  }

  /**
   * Handle retry recovery strategy
   */
  async handleRetryStrategy(cacheError, context) {
    const retryCount = context.retryCount || 0;
    
    if (retryCount >= this.config.maxRetries) {
      console.error(`❌ Max retries exceeded for ${cacheError.category} error`);
      return this.handleFallbackStrategy(cacheError, context);
    }

    const delay = this.calculateRetryDelay(retryCount);
    
    console.log(`🔄 Retrying operation after ${delay}ms (attempt ${retryCount + 1}/${this.config.maxRetries})`);
    
    await this.delay(delay);
    
    return {
      action: 'retry',
      delay,
      retryCount: retryCount + 1,
      error: cacheError
    };
  }

  /**
   * Handle fallback recovery strategy
   */
  async handleFallbackStrategy(cacheError, context) {
    console.log(`🔄 Applying fallback strategy for ${cacheError.category} error`);
    
    // Different fallback strategies based on operation type
    switch (context.operation) {
      case 'app-init':
        return this.handleAppInitFallback(cacheError, context);
      case 'user-cache':
        return this.handleUserCacheFallback(cacheError, context);
      case 'smart-warm':
        return this.handleSmartWarmFallback(cacheError, context);
      default:
        return this.handleGenericFallback(cacheError, context);
    }
  }

  /**
   * Handle skip recovery strategy
   */
  handleSkipStrategy(cacheError, context) {
    console.log(`⏭️ Skipping operation due to ${cacheError.category} error`);
    
    return {
      action: 'skip',
      reason: `${cacheError.category} error is not recoverable`,
      error: cacheError,
      continueExecution: true
    };
  }

  /**
   * Handle abort recovery strategy
   */
  handleAbortStrategy(cacheError, context) {
    console.error(`🛑 Aborting operation due to ${cacheError.severity} ${cacheError.category} error`);
    
    return {
      action: 'abort',
      reason: `${cacheError.severity} ${cacheError.category} error requires immediate attention`,
      error: cacheError,
      continueExecution: false
    };
  }

  /**
   * Handle degrade recovery strategy
   */
  async handleDegradeStrategy(cacheError, context) {
    console.log(`📉 Degrading service due to ${cacheError.category} error`);
    
    return {
      action: 'degrade',
      degradationLevel: this.calculateDegradationLevel(cacheError),
      error: cacheError,
      continueExecution: true
    };
  }

  // Error classification methods
  isNetworkError(error) {
    return error.name === 'TypeError' && error.message?.includes('fetch') ||
           error.name === 'AbortError' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'ENOTFOUND' ||
           error.code === 'ETIMEDOUT' ||
           error.message?.includes('network') ||
           error.message?.includes('connection');
  }

  isAuthError(error) {
    return error.message?.includes('JWT') ||
           error.message?.includes('authentication') ||
           error.message?.includes('unauthorized') ||
           error.message?.includes('Invalid login credentials') ||
           error.code === '401' ||
           error.status === 401;
  }

  isDatabaseError(error) {
    return error.message?.includes('database') ||
           error.message?.includes('postgres') ||
           error.message?.includes('PGRST') ||
           error.code?.startsWith('23') || // PostgreSQL constraint violations
           error.code?.startsWith('42'); // PostgreSQL syntax errors
  }

  isCacheError(error, context) {
    return context.operation?.includes('cache') ||
           error.message?.includes('cache') ||
           context.source === 'supabaseCache';
  }

  isTimeoutError(error) {
    return error.name === 'AbortError' ||
           error.message?.includes('timeout') ||
           error.message?.includes('aborted') ||
           error.code === 'ETIMEDOUT';
  }

  isRateLimitError(error) {
    return error.message?.includes('rate limit') ||
           error.message?.includes('too many requests') ||
           error.code === '429' ||
           error.status === 429;
  }

  isValidationError(error) {
    return error.name === 'ValidationError' ||
           error.message?.includes('validation') ||
           error.message?.includes('invalid') ||
           error.message?.includes('required');
  }

  isDatabaseConnectionError(error) {
    return error.code === 'ECONNREFUSED' ||
           error.message?.includes('connection refused') ||
           error.message?.includes('database connection');
  }

  // Utility methods
  calculateRetryDelay(retryCount) {
    const delay = this.config.baseRetryDelay * Math.pow(this.config.retryBackoffFactor, retryCount);
    return Math.min(delay, this.config.maxRetryDelay);
  }

  calculateDegradationLevel(cacheError) {
    switch (cacheError.severity) {
      case ErrorSeverity.HIGH:
        return 'moderate';
      case ErrorSeverity.MEDIUM:
        return 'minimal';
      case ErrorSeverity.LOW:
        return 'none';
      default:
        return 'minimal';
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  logError(cacheError) {
    const logLevel = this.getLogLevel(cacheError.severity);
    const logMessage = `Cache warming ${cacheError.category} error: ${cacheError.message}`;
    
    if (this.config.enableDetailedLogging) {
      console[logLevel](logMessage, cacheError.toJSON());
    } else {
      console[logLevel](logMessage);
    }
  }

  getLogLevel(severity) {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'error';
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'warn';
    }
  }

  addToErrorHistory(cacheError) {
    this.errorHistory.push(cacheError);
    
    // Keep history size manageable
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  // Fallback strategy implementations
  async handleAppInitFallback(cacheError, context) {
    return {
      action: 'fallback',
      strategy: 'continue-without-cache',
      message: 'App initialization will continue without cache warming',
      error: cacheError
    };
  }

  async handleUserCacheFallback(cacheError, context) {
    return {
      action: 'fallback',
      strategy: 'reduce-cache-scope',
      message: 'User cache warming will use reduced scope',
      error: cacheError
    };
  }

  async handleSmartWarmFallback(cacheError, context) {
    return {
      action: 'fallback',
      strategy: 'basic-warming',
      message: 'Smart warming will fall back to basic cache warming',
      error: cacheError
    };
  }

  async handleGenericFallback(cacheError, context) {
    return {
      action: 'fallback',
      strategy: 'continue-execution',
      message: 'Operation will continue with degraded performance',
      error: cacheError
    };
  }

  // Public API methods
  getErrorStats() {
    const stats = {
      totalErrors: this.errorHistory.length,
      errorsByCategory: {},
      errorsBySeverity: {},
      recentErrors: this.errorHistory.slice(-10)
    };

    // Count errors by category and severity
    this.errorHistory.forEach(error => {
      stats.errorsByCategory[error.category] = (stats.errorsByCategory[error.category] || 0) + 1;
      stats.errorsBySeverity[error.severity] = (stats.errorsBySeverity[error.severity] || 0) + 1;
    });

    // Add monitoring stats if available
    if (this.errorRateMonitor) {
      stats.monitoring = this.errorRateMonitor.getErrorStats();
    }

    // Add graceful degradation status if available
    if (this.enableGracefulDegradation) {
      stats.degradation = this.degradationManager.getDegradationStatus();
    }

    return stats;
  }

  recordSuccess(operation = 'unknown') {
    if (this.errorRateMonitor) {
      this.errorRateMonitor.recordSuccess();
    }

    // Record success for graceful degradation tracking
    if (this.enableGracefulDegradation) {
      const serviceAspect = this.mapOperationToServiceAspect(operation);
      this.degradationManager.recordSuccess(serviceAspect);
    }
  }

  /**
   * Map operation type to service aspect for degradation tracking
   */
  mapOperationToServiceAspect(operation) {
    switch (operation) {
      case 'app-init':
      case 'user-cache':
      case 'smart-warm':
      case 'progressive-warm':
        return ServiceAspect.CACHE_WARMING;
      case 'queue-processing':
        return ServiceAspect.QUEUE_PROCESSING;
      case 'context-analysis':
        return ServiceAspect.SMART_ANALYSIS;
      case 'stats-tracking':
        return ServiceAspect.STATISTICS_TRACKING;
      case 'error-monitoring':
        return ServiceAspect.ERROR_MONITORING;
      case 'maintenance':
        return ServiceAspect.MAINTENANCE;
      case 'persistence':
        return ServiceAspect.PERSISTENCE;
      default:
        return ServiceAspect.CACHE_WARMING; // Default fallback
    }
  }

  clearErrorHistory() {
    this.errorHistory = [];
    if (this.errorRateMonitor) {
      this.errorRateMonitor.reset();
    }
  }
}

// Export singleton instance
export const cacheWarmingErrorHandler = new CacheWarmingErrorHandler();