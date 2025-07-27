/**
 * Workout-specific Debugging and Monitoring Utilities
 * 
 * This module provides debugging capabilities specifically for workout logging operations,
 * including performance monitoring, operation tracking, and migration validation.
 */

import { supabaseLogger, logSupabaseQuery } from './supabaseDebugger';
import { getConnectionMonitor } from './supabaseConnectionMonitor';
import { extractErrorDetails } from './supabaseErrorHandler';

/**
 * Workout operation types for tracking
 */
export const WORKOUT_OPERATIONS = {
  LOAD_PROGRAMS: 'load_programs',
  LOAD_EXERCISES: 'load_exercises',
  LOAD_WORKOUT_LOGS: 'load_workout_logs',
  SAVE_WORKOUT_LOG: 'save_workout_log',
  UPDATE_WORKOUT_LOG: 'update_workout_log',
  FINISH_WORKOUT: 'finish_workout',
  REPLACE_EXERCISE: 'replace_exercise',
  LOAD_EXERCISE_HISTORY: 'load_exercise_history',
  REALTIME_UPDATE: 'realtime_update',
  CACHE_OPERATION: 'cache_operation'
};

/**
 * Performance metrics tracking
 */
class WorkoutPerformanceTracker {
  constructor() {
    this.metrics = {
      operations: new Map(),
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      slowestOperation: null,
      fastestOperation: null,
      realtimeEvents: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    this.operationHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Start tracking an operation
   */
  startOperation(operationType, context = {}) {
    const operationId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const operation = {
      id: operationId,
      type: operationType,
      context,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      success: null,
      error: null,
      result: null
    };

    this.operationHistory.push(operation);
    
    // Keep history size manageable
    if (this.operationHistory.length > this.maxHistorySize) {
      this.operationHistory.shift();
    }

    return operationId;
  }

  /**
   * End tracking an operation
   */
  endOperation(operationId, success, result = null, error = null) {
    const operation = this.operationHistory.find(op => op.id === operationId);
    if (!operation) return;

    operation.endTime = Date.now();
    operation.duration = operation.endTime - operation.startTime;
    operation.success = success;
    operation.result = result;
    operation.error = error;

    // Update metrics
    this.updateMetrics(operation);
    
    // Log the operation
    this.logOperation(operation);
  }

  /**
   * Update performance metrics
   */
  updateMetrics(operation) {
    this.metrics.totalOperations++;
    
    if (operation.success) {
      this.metrics.successfulOperations++;
    } else {
      this.metrics.failedOperations++;
    }

    // Update operation-specific metrics
    if (!this.metrics.operations.has(operation.type)) {
      this.metrics.operations.set(operation.type, {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        successCount: 0,
        failureCount: 0
      });
    }

    const opMetrics = this.metrics.operations.get(operation.type);
    opMetrics.count++;
    opMetrics.totalTime += operation.duration;
    opMetrics.averageTime = opMetrics.totalTime / opMetrics.count;
    
    if (operation.success) {
      opMetrics.successCount++;
    } else {
      opMetrics.failureCount++;
    }

    // Update overall average response time
    const totalTime = Array.from(this.metrics.operations.values())
      .reduce((sum, metrics) => sum + metrics.totalTime, 0);
    this.metrics.averageResponseTime = totalTime / this.metrics.totalOperations;

    // Track slowest and fastest operations
    if (!this.metrics.slowestOperation || operation.duration > this.metrics.slowestOperation.duration) {
      this.metrics.slowestOperation = { ...operation };
    }
    
    if (!this.metrics.fastestOperation || operation.duration < this.metrics.fastestOperation.duration) {
      this.metrics.fastestOperation = { ...operation };
    }
  }

  /**
   * Log operation details
   */
  logOperation(operation) {
    const logger = new supabaseLogger('WorkoutPerformance');
    
    if (operation.success) {
      logger.debug(`✅ ${operation.type} completed`, {
        duration: `${operation.duration}ms`,
        context: operation.context,
        result: operation.result
      });
    } else {
      logger.error(`❌ ${operation.type} failed`, {
        duration: `${operation.duration}ms`,
        context: operation.context,
        error: operation.error
      });
    }
  }

  /**
   * Track cache operations
   */
  trackCacheOperation(hit, operation, key) {
    if (hit) {
      this.metrics.cacheHits++;
    } else {
      this.metrics.cacheMisses++;
    }

    const logger = new supabaseLogger('WorkoutCache');
    logger.debug(`${hit ? '🎯' : '❌'} Cache ${hit ? 'hit' : 'miss'}`, {
      operation,
      key,
      hitRate: this.getCacheHitRate()
    });
  }

  /**
   * Track real-time events
   */
  trackRealtimeEvent(eventType, data) {
    this.metrics.realtimeEvents++;
    
    const logger = new supabaseLogger('WorkoutRealtime');
    logger.debug(`📡 Real-time event: ${eventType}`, {
      data,
      totalEvents: this.metrics.realtimeEvents
    });
  }

  /**
   * Get cache hit rate
   */
  getCacheHitRate() {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total > 0 ? (this.metrics.cacheHits / total) * 100 : 0;
  }

  /**
   * Get performance summary
   */
  getMetrics() {
    return {
      ...this.metrics,
      cacheHitRate: this.getCacheHitRate(),
      successRate: this.metrics.totalOperations > 0 
        ? (this.metrics.successfulOperations / this.metrics.totalOperations) * 100 
        : 0,
      operationBreakdown: Object.fromEntries(this.metrics.operations)
    };
  }

  /**
   * Get recent operation history
   */
  getRecentOperations(limit = 20) {
    return this.operationHistory
      .slice(-limit)
      .sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Reset metrics
   */
  reset() {
    this.metrics = {
      operations: new Map(),
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      slowestOperation: null,
      fastestOperation: null,
      realtimeEvents: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    this.operationHistory = [];
  }
}

/**
 * Global performance tracker instance
 */
const performanceTracker = new WorkoutPerformanceTracker();

/**
 * Workout debugging logger
 */
export class WorkoutDebugger {
  constructor(context = 'WorkoutLogger') {
    this.logger = new supabaseLogger(context);
    this.context = context;
  }

  /**
   * Log workout operation with performance tracking
   */
  async trackOperation(operationType, operation, context = {}) {
    const operationId = performanceTracker.startOperation(operationType, context);
    
    try {
      this.logger.debug(`🚀 Starting ${operationType}`, context);
      
      const result = await operation();
      
      performanceTracker.endOperation(operationId, true, result);
      
      this.logger.info(`✅ ${operationType} completed successfully`, {
        context,
        result: this.sanitizeResult(result)
      });
      
      return result;
    } catch (error) {
      const errorDetails = extractErrorDetails(error);
      performanceTracker.endOperation(operationId, false, null, errorDetails);
      
      this.logger.error(`❌ ${operationType} failed`, {
        context,
        error: errorDetails
      });
      
      throw error;
    }
  }

  /**
   * Log Supabase query with workout context
   */
  logQuery(operation, table, query, result, error = null) {
    logSupabaseQuery(operation, table, query, result, error);
    
    // Additional workout-specific logging
    this.logger.debug(`🗃️ Database query: ${operation}`, {
      table,
      query: this.sanitizeQuery(query),
      resultCount: Array.isArray(result) ? result.length : result ? 1 : 0,
      error: error ? extractErrorDetails(error) : null
    });
  }

  /**
   * Log cache operations
   */
  logCacheOperation(operation, key, hit, data = null) {
    performanceTracker.trackCacheOperation(hit, operation, key);
    
    this.logger.debug(`${hit ? '🎯' : '💾'} Cache ${hit ? 'hit' : 'miss'}: ${operation}`, {
      key,
      hit,
      dataSize: data ? JSON.stringify(data).length : 0
    });
  }

  /**
   * Log real-time events
   */
  logRealtimeEvent(eventType, data, context = {}) {
    performanceTracker.trackRealtimeEvent(eventType, data);
    
    this.logger.debug(`📡 Real-time: ${eventType}`, {
      data: this.sanitizeResult(data),
      context
    });
  }

  /**
   * Log migration validation
   */
  logMigrationValidation(check, passed, details = {}) {
    this.logger.info(`🔍 Migration check: ${check}`, {
      passed: passed ? '✅' : '❌',
      details
    });
  }

  /**
   * Log workout state changes
   */
  logWorkoutStateChange(from, to, context = {}) {
    this.logger.info(`🔄 Workout state: ${from} → ${to}`, context);
  }

  /**
   * Log user actions
   */
  logUserAction(action, context = {}) {
    this.logger.info(`👤 User action: ${action}`, context);
  }

  /**
   * Sanitize query data for logging
   */
  sanitizeQuery(query) {
    if (typeof query === 'object') {
      return Object.keys(query).reduce((acc, key) => {
        if (key.includes('password') || key.includes('token')) {
          acc[key] = '***';
        } else {
          acc[key] = query[key];
        }
        return acc;
      }, {});
    }
    return query;
  }

  /**
   * Sanitize result data for logging
   */
  sanitizeResult(result) {
    if (Array.isArray(result)) {
      return {
        type: 'array',
        length: result.length,
        sample: result.length > 0 ? this.sanitizeObject(result[0]) : null
      };
    } else if (typeof result === 'object' && result !== null) {
      return this.sanitizeObject(result);
    }
    return result;
  }

  /**
   * Sanitize object data for logging
   */
  sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    const sanitized = {};
    Object.keys(obj).forEach(key => {
      if (key.includes('password') || key.includes('token') || key.includes('secret')) {
        sanitized[key] = '***';
      } else if (typeof obj[key] === 'object') {
        sanitized[key] = '[object]';
      } else {
        sanitized[key] = obj[key];
      }
    });
    return sanitized;
  }
}

/**
 * Migration validation utilities
 */
export class MigrationValidator {
  constructor() {
    this.debugger = new WorkoutDebugger('MigrationValidator');
    this.validationResults = [];
  }

  /**
   * Validate that Firebase imports are removed
   */
  validateNoFirebaseImports(componentCode) {
    const firebaseImports = [
      'firebase/firestore',
      'firebase/functions',
      'firebase/auth',
      'from firebase',
      'import firebase',
      'getFirestore',
      'collection',
      'doc',
      'addDoc',
      'updateDoc',
      'deleteDoc',
      'getDocs',
      'getDoc',
      'Timestamp'
    ];

    const foundImports = firebaseImports.filter(importStr => 
      componentCode.includes(importStr)
    );

    const passed = foundImports.length === 0;
    
    this.debugger.logMigrationValidation('No Firebase imports', passed, {
      foundImports
    });

    this.validationResults.push({
      check: 'No Firebase imports',
      passed,
      details: { foundImports }
    });

    return passed;
  }

  /**
   * Validate that all database operations use Supabase services
   */
  validateSupabaseServiceUsage(componentCode) {
    const requiredServices = [
      'workoutLogService',
      'programService',
      'exerciseService'
    ];

    const foundServices = requiredServices.filter(service => 
      componentCode.includes(service)
    );

    const passed = foundServices.length === requiredServices.length;
    
    this.debugger.logMigrationValidation('Supabase service usage', passed, {
      requiredServices,
      foundServices,
      missingServices: requiredServices.filter(s => !foundServices.includes(s))
    });

    this.validationResults.push({
      check: 'Supabase service usage',
      passed,
      details: { requiredServices, foundServices }
    });

    return passed;
  }

  /**
   * Validate that error handling uses Supabase utilities
   */
  validateSupabaseErrorHandling(componentCode) {
    const errorHandlingPatterns = [
      'handleSupabaseError',
      'executeSupabaseOperation',
      'SupabaseError'
    ];

    const foundPatterns = errorHandlingPatterns.filter(pattern => 
      componentCode.includes(pattern)
    );

    const passed = foundPatterns.length > 0;
    
    this.debugger.logMigrationValidation('Supabase error handling', passed, {
      errorHandlingPatterns,
      foundPatterns
    });

    this.validationResults.push({
      check: 'Supabase error handling',
      passed,
      details: { errorHandlingPatterns, foundPatterns }
    });

    return passed;
  }

  /**
   * Get validation summary
   */
  getValidationSummary() {
    const totalChecks = this.validationResults.length;
    const passedChecks = this.validationResults.filter(r => r.passed).length;
    
    return {
      totalChecks,
      passedChecks,
      failedChecks: totalChecks - passedChecks,
      successRate: totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0,
      results: this.validationResults
    };
  }

  /**
   * Reset validation results
   */
  reset() {
    this.validationResults = [];
  }
}

/**
 * Development utilities for debugging workout operations
 */
export const workoutDebugUtils = {
  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return performanceTracker.getMetrics();
  },

  /**
   * Get recent operations
   */
  getRecentOperations(limit = 20) {
    return performanceTracker.getRecentOperations(limit);
  },

  /**
   * Log performance summary to console
   */
  logPerformanceSummary() {
    if (process.env.NODE_ENV !== 'development') return;
    
    const metrics = performanceTracker.getMetrics();
    const connectionMonitor = getConnectionMonitor();
    
    console.group('🏋️ Workout Performance Summary');
    
    console.table({
      'Total Operations': metrics.totalOperations,
      'Success Rate': `${metrics.successRate.toFixed(1)}%`,
      'Average Response Time': `${metrics.averageResponseTime.toFixed(0)}ms`,
      'Cache Hit Rate': `${metrics.cacheHitRate.toFixed(1)}%`,
      'Real-time Events': metrics.realtimeEvents
    });
    
    if (metrics.operationBreakdown) {
      console.log('📊 Operation Breakdown:');
      console.table(metrics.operationBreakdown);
    }
    
    if (connectionMonitor) {
      console.log('🔗 Connection Status:');
      console.table(connectionMonitor.getMetrics());
    }
    
    console.groupEnd();
  },

  /**
   * Reset all metrics
   */
  resetMetrics() {
    performanceTracker.reset();
  },

  /**
   * Enable verbose logging
   */
  enableVerboseLogging() {
    if (process.env.NODE_ENV === 'development') {
      localStorage.setItem('REACT_APP_SUPABASE_DEBUG', 'debug');
      console.log('🔊 Verbose workout logging enabled');
    }
  },

  /**
   * Disable verbose logging
   */
  disableVerboseLogging() {
    localStorage.removeItem('REACT_APP_SUPABASE_DEBUG');
    console.log('🔇 Verbose workout logging disabled');
  }
};

/**
 * Global instances
 */
export const workoutDebugger = new WorkoutDebugger('WorkoutLogger');
export const migrationValidator = new MigrationValidator();

/**
 * Initialize workout debugging
 */
export function initializeWorkoutDebugging() {
  if (process.env.NODE_ENV !== 'development') return;
  
  workoutDebugger.logger.info('🏋️ Initializing workout debugging...', {
    performanceTracking: true,
    migrationValidation: true,
    realtimeMonitoring: true
  });

  // Log performance summary every 5 minutes in development
  setInterval(() => {
    workoutDebugUtils.logPerformanceSummary();
  }, 5 * 60 * 1000);

  workoutDebugger.logger.info('✅ Workout debugging initialized');
}

// Auto-initialize in development
if (process.env.NODE_ENV === 'development') {
  initializeWorkoutDebugging();
}