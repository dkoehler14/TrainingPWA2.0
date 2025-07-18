/**
 * Comprehensive Logging and Debugging Support for Add Exercise Functionality
 * 
 * Provides detailed console logging, debug mode, performance monitoring,
 * and state inspection utilities for troubleshooting exercise addition issues.
 */

import { getAddExerciseOperationLogs } from './addExerciseErrorHandler';

// Debug configuration
const DEBUG_CONFIG = {
  enabled: process.env.NODE_ENV === 'development' || localStorage.getItem('ADD_EXERCISE_DEBUG') === 'true',
  logLevel: localStorage.getItem('ADD_EXERCISE_LOG_LEVEL') || 'info', // 'debug', 'info', 'warn', 'error'
  performanceMonitoring: localStorage.getItem('ADD_EXERCISE_PERF_MONITORING') === 'true',
  stateInspection: localStorage.getItem('ADD_EXERCISE_STATE_INSPECTION') === 'true'
};

// Performance tracking storage
const performanceMetrics = new Map();

// State snapshots storage
const stateSnapshots = [];

/**
 * Enable or disable debug mode
 * @param {boolean} enabled - Whether to enable debug mode
 */
export const setDebugMode = (enabled) => {
  DEBUG_CONFIG.enabled = enabled;
  localStorage.setItem('ADD_EXERCISE_DEBUG', enabled.toString());
  console.log(`🔧 Add Exercise Debug Mode: ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

/**
 * Set logging level
 * @param {string} level - Log level ('debug', 'info', 'warn', 'error')
 */
export const setLogLevel = (level) => {
  const validLevels = ['debug', 'info', 'warn', 'error'];
  if (validLevels.includes(level)) {
    DEBUG_CONFIG.logLevel = level;
    localStorage.setItem('ADD_EXERCISE_LOG_LEVEL', level);
    console.log(`📊 Add Exercise Log Level set to: ${level.toUpperCase()}`);
  } else {
    console.warn(`Invalid log level: ${level}. Valid levels: ${validLevels.join(', ')}`);
  }
};

/**
 * Enable or disable performance monitoring
 * @param {boolean} enabled - Whether to enable performance monitoring
 */
export const setPerformanceMonitoring = (enabled) => {
  DEBUG_CONFIG.performanceMonitoring = enabled;
  localStorage.setItem('ADD_EXERCISE_PERF_MONITORING', enabled.toString());
  console.log(`⏱️ Add Exercise Performance Monitoring: ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

/**
 * Enable or disable state inspection
 * @param {boolean} enabled - Whether to enable state inspection
 */
export const setStateInspection = (enabled) => {
  DEBUG_CONFIG.stateInspection = enabled;
  localStorage.setItem('ADD_EXERCISE_STATE_INSPECTION', enabled.toString());
  console.log(`🔍 Add Exercise State Inspection: ${enabled ? 'ENABLED' : 'DISABLED'}`);
};

/**
 * Check if logging should occur for given level
 * @param {string} level - Log level to check
 * @returns {boolean} Whether logging should occur
 */
const shouldLog = (level) => {
  if (!DEBUG_CONFIG.enabled) return false;
  
  const levels = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = levels[DEBUG_CONFIG.logLevel] || 1;
  const messageLevel = levels[level] || 1;
  
  return messageLevel >= currentLevel;
};

/**
 * Enhanced logging function with context and formatting
 * @param {string} level - Log level
 * @param {string} operation - Operation being logged
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
const logWithContext = (level, operation, message, data = {}) => {
  if (!shouldLog(level)) return;
  
  const timestamp = new Date().toISOString();
  const emoji = {
    debug: '🐛',
    info: 'ℹ️',
    warn: '⚠️',
    error: '🚨'
  }[level] || 'ℹ️';
  
  const logData = {
    timestamp,
    operation,
    message,
    ...data
  };
  
  console.group(`${emoji} [ADD_EXERCISE_${level.toUpperCase()}] ${operation}`);
  console[level](`${message}`);
  
  if (Object.keys(data).length > 0) {
    console[level]('Data:', data);
  }
  
  console.groupEnd();
  
  // Store debug logs in session storage for inspection
  try {
    const debugLogs = JSON.parse(sessionStorage.getItem('add_exercise_debug_logs') || '[]');
    debugLogs.push(logData);
    
    // Keep only last 100 debug logs
    const recentLogs = debugLogs.slice(-100);
    sessionStorage.setItem('add_exercise_debug_logs', JSON.stringify(recentLogs));
  } catch (error) {
    console.warn('Failed to store debug log:', error);
  }
};

/**
 * Log add exercise operation start
 * @param {Object} exercise - Exercise being added
 * @param {string} type - Addition type ('temporary' or 'permanent')
 * @param {Object} context - Additional context
 */
export const logAddExerciseStart = (exercise, type, context = {}) => {
  logWithContext('info', 'ADD_EXERCISE_START', `Starting to add exercise: ${exercise?.name || exercise?.id}`, {
    exerciseId: exercise?.id,
    exerciseName: exercise?.name,
    exerciseType: exercise?.exerciseType,
    additionType: type,
    programId: context.programId,
    weekIndex: context.weekIndex,
    dayIndex: context.dayIndex,
    currentLogDataLength: context.currentLogDataLength
  });
};

/**
 * Log add exercise operation success
 * @param {Object} exercise - Exercise that was added
 * @param {string} type - Addition type
 * @param {Object} context - Additional context
 */
export const logAddExerciseSuccess = (exercise, type, context = {}) => {
  logWithContext('info', 'ADD_EXERCISE_SUCCESS', `Successfully added exercise: ${exercise?.name || exercise?.id}`, {
    exerciseId: exercise?.id,
    exerciseName: exercise?.name,
    additionType: type,
    programId: context.programId,
    weekIndex: context.weekIndex,
    dayIndex: context.dayIndex,
    newLogDataLength: context.newLogDataLength,
    programUpdated: context.programUpdated
  });
};

/**
 * Log add exercise operation failure
 * @param {Object} exercise - Exercise that failed to be added
 * @param {string} type - Addition type
 * @param {Error} error - Error that occurred
 * @param {Object} context - Additional context
 */
export const logAddExerciseFailure = (exercise, type, error, context = {}) => {
  logWithContext('error', 'ADD_EXERCISE_FAILURE', `Failed to add exercise: ${exercise?.name || exercise?.id}`, {
    exerciseId: exercise?.id,
    exerciseName: exercise?.name,
    additionType: type,
    error: {
      message: error.message,
      name: error.name,
      stack: error.stack
    },
    programId: context.programId,
    weekIndex: context.weekIndex,
    dayIndex: context.dayIndex,
    partialSuccess: context.partialSuccess
  });
};

/**
 * Log exercise removal operation
 * @param {Object} exercise - Exercise being removed
 * @param {number} exerciseIndex - Index of exercise being removed
 * @param {Object} context - Additional context
 */
export const logExerciseRemoval = (exercise, exerciseIndex, context = {}) => {
  logWithContext('info', 'REMOVE_EXERCISE', `Removing exercise: ${exercise?.exerciseId}`, {
    exerciseId: exercise?.exerciseId,
    exerciseIndex,
    addedType: exercise?.addedType,
    isAdded: exercise?.isAdded,
    programId: context.programId,
    weekIndex: context.weekIndex,
    dayIndex: context.dayIndex,
    currentLogDataLength: context.currentLogDataLength
  });
};

/**
 * Log program structure update
 * @param {string} operation - Operation type ('add' or 'remove')
 * @param {Object} exercise - Exercise being updated
 * @param {Object} context - Additional context
 */
export const logProgramStructureUpdate = (operation, exercise, context = {}) => {
  logWithContext('debug', 'PROGRAM_STRUCTURE_UPDATE', `${operation.toUpperCase()} exercise in program structure`, {
    operation,
    exerciseId: exercise?.id || exercise?.exerciseId,
    exerciseName: exercise?.name,
    programId: context.programId,
    weekIndex: context.weekIndex,
    dayIndex: context.dayIndex,
    configKey: context.configKey,
    isOldFormat: context.isOldFormat,
    exerciseCount: context.exerciseCount
  });
};

/**
 * Log state changes for debugging
 * @param {string} stateType - Type of state being changed
 * @param {*} oldValue - Previous state value
 * @param {*} newValue - New state value
 * @param {Object} context - Additional context
 */
export const logStateChange = (stateType, oldValue, newValue, context = {}) => {
  if (!DEBUG_CONFIG.stateInspection) return;
  
  logWithContext('debug', 'STATE_CHANGE', `State change: ${stateType}`, {
    stateType,
    oldValue: typeof oldValue === 'object' ? JSON.stringify(oldValue) : oldValue,
    newValue: typeof newValue === 'object' ? JSON.stringify(newValue) : newValue,
    context
  });
  
  // Store state snapshot if enabled
  if (DEBUG_CONFIG.stateInspection) {
    stateSnapshots.push({
      timestamp: new Date().toISOString(),
      stateType,
      oldValue,
      newValue,
      context
    });
    
    // Keep only last 50 state snapshots
    if (stateSnapshots.length > 50) {
      stateSnapshots.shift();
    }
  }
};

/**
 * Start performance monitoring for an operation
 * @param {string} operationId - Unique identifier for the operation
 * @param {string} operationName - Human-readable operation name
 * @param {Object} context - Additional context
 */
export const startPerformanceMonitoring = (operationId, operationName, context = {}) => {
  if (!DEBUG_CONFIG.performanceMonitoring) return;
  
  const startTime = performance.now();
  performanceMetrics.set(operationId, {
    operationName,
    startTime,
    context,
    memoryStart: performance.memory ? {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    } : null
  });
  
  logWithContext('debug', 'PERFORMANCE_START', `Started monitoring: ${operationName}`, {
    operationId,
    operationName,
    startTime,
    context
  });
};

/**
 * End performance monitoring for an operation
 * @param {string} operationId - Unique identifier for the operation
 * @param {Object} additionalContext - Additional context to log
 */
export const endPerformanceMonitoring = (operationId, additionalContext = {}) => {
  if (!DEBUG_CONFIG.performanceMonitoring) return;
  
  const metric = performanceMetrics.get(operationId);
  if (!metric) {
    logWithContext('warn', 'PERFORMANCE_WARNING', `No performance metric found for operation: ${operationId}`);
    return;
  }
  
  const endTime = performance.now();
  const duration = endTime - metric.startTime;
  
  const memoryEnd = performance.memory ? {
    used: performance.memory.usedJSHeapSize,
    total: performance.memory.totalJSHeapSize,
    limit: performance.memory.jsHeapSizeLimit
  } : null;
  
  const memoryDelta = metric.memoryStart && memoryEnd ? {
    usedDelta: memoryEnd.used - metric.memoryStart.used,
    totalDelta: memoryEnd.total - metric.memoryStart.total
  } : null;
  
  logWithContext('info', 'PERFORMANCE_END', `Completed monitoring: ${metric.operationName}`, {
    operationId,
    operationName: metric.operationName,
    duration: `${duration.toFixed(2)}ms`,
    memoryStart: metric.memoryStart,
    memoryEnd,
    memoryDelta,
    context: { ...metric.context, ...additionalContext }
  });
  
  // Clean up
  performanceMetrics.delete(operationId);
  
  // Store performance data for analysis
  try {
    const perfLogs = JSON.parse(sessionStorage.getItem('add_exercise_perf_logs') || '[]');
    perfLogs.push({
      timestamp: new Date().toISOString(),
      operationId,
      operationName: metric.operationName,
      duration,
      memoryDelta,
      context: { ...metric.context, ...additionalContext }
    });
    
    // Keep only last 50 performance logs
    const recentPerfLogs = perfLogs.slice(-50);
    sessionStorage.setItem('add_exercise_perf_logs', JSON.stringify(recentPerfLogs));
  } catch (error) {
    console.warn('Failed to store performance log:', error);
  }
};

/**
 * Log validation results
 * @param {string} validationType - Type of validation performed
 * @param {Object} validationResult - Result of validation
 * @param {Object} context - Additional context
 */
export const logValidation = (validationType, validationResult, context = {}) => {
  const level = validationResult.isValid ? 'debug' : 'warn';
  
  logWithContext(level, 'VALIDATION', `${validationType} validation: ${validationResult.isValid ? 'PASSED' : 'FAILED'}`, {
    validationType,
    isValid: validationResult.isValid,
    errors: validationResult.errors,
    context
  });
};

/**
 * Create debugging utilities for state inspection
 * @returns {Object} Debugging utilities
 */
export const createDebuggingUtilities = () => {
  return {
    // Get current debug configuration
    getDebugConfig: () => ({ ...DEBUG_CONFIG }),
    
    // Get all stored debug logs
    getDebugLogs: () => {
      try {
        return JSON.parse(sessionStorage.getItem('add_exercise_debug_logs') || '[]');
      } catch (error) {
        console.warn('Failed to retrieve debug logs:', error);
        return [];
      }
    },
    
    // Get all stored performance logs
    getPerformanceLogs: () => {
      try {
        return JSON.parse(sessionStorage.getItem('add_exercise_perf_logs') || '[]');
      } catch (error) {
        console.warn('Failed to retrieve performance logs:', error);
        return [];
      }
    },
    
    // Get operation logs from error handler
    getOperationLogs: () => getAddExerciseOperationLogs(),
    
    // Get state snapshots
    getStateSnapshots: () => [...stateSnapshots],
    
    // Get current performance metrics
    getCurrentMetrics: () => {
      const metrics = {};
      performanceMetrics.forEach((value, key) => {
        metrics[key] = {
          operationName: value.operationName,
          duration: performance.now() - value.startTime,
          context: value.context
        };
      });
      return metrics;
    },
    
    // Clear all stored logs
    clearAllLogs: () => {
      try {
        sessionStorage.removeItem('add_exercise_debug_logs');
        sessionStorage.removeItem('add_exercise_perf_logs');
        sessionStorage.removeItem('add_exercise_logs');
        stateSnapshots.length = 0;
        performanceMetrics.clear();
        console.log('🧹 Cleared all add exercise debug logs');
      } catch (error) {
        console.warn('Failed to clear debug logs:', error);
      }
    },
    
    // Export logs for analysis
    exportLogs: () => {
      const logs = {
        timestamp: new Date().toISOString(),
        debugConfig: DEBUG_CONFIG,
        debugLogs: JSON.parse(sessionStorage.getItem('add_exercise_debug_logs') || '[]'),
        performanceLogs: JSON.parse(sessionStorage.getItem('add_exercise_perf_logs') || '[]'),
        operationLogs: getAddExerciseOperationLogs(),
        stateSnapshots: [...stateSnapshots]
      };
      
      const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `add-exercise-debug-logs-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('📁 Exported add exercise debug logs');
    },
    
    // Generate debug report
    generateDebugReport: () => {
      const debugLogs = JSON.parse(sessionStorage.getItem('add_exercise_debug_logs') || '[]');
      const perfLogs = JSON.parse(sessionStorage.getItem('add_exercise_perf_logs') || '[]');
      const operationLogs = getAddExerciseOperationLogs();
      
      const report = {
        summary: {
          totalDebugLogs: debugLogs.length,
          totalPerformanceLogs: perfLogs.length,
          totalOperationLogs: operationLogs.length,
          totalStateSnapshots: stateSnapshots.length,
          activeMetrics: performanceMetrics.size
        },
        errorSummary: {
          totalErrors: debugLogs.filter(log => log.operation.includes('FAILURE')).length,
          errorTypes: [...new Set(debugLogs.filter(log => log.operation.includes('FAILURE')).map(log => log.data?.error?.name))],
          commonErrors: debugLogs.filter(log => log.operation.includes('FAILURE')).reduce((acc, log) => {
            const errorMessage = log.data?.error?.message || 'Unknown error';
            acc[errorMessage] = (acc[errorMessage] || 0) + 1;
            return acc;
          }, {})
        },
        performanceSummary: {
          averageDuration: perfLogs.length > 0 ? perfLogs.reduce((sum, log) => sum + log.duration, 0) / perfLogs.length : 0,
          slowestOperations: perfLogs.sort((a, b) => b.duration - a.duration).slice(0, 5),
          memoryUsage: perfLogs.filter(log => log.memoryDelta).map(log => log.memoryDelta.usedDelta)
        }
      };
      
      console.group('📊 Add Exercise Debug Report');
      console.log('Summary:', report.summary);
      console.log('Error Summary:', report.errorSummary);
      console.log('Performance Summary:', report.performanceSummary);
      console.groupEnd();
      
      return report;
    }
  };
};

/**
 * Initialize debugging utilities and expose them globally in development
 */
export const initializeDebugging = () => {
  if (DEBUG_CONFIG.enabled) {
    // Expose debugging utilities globally for console access
    window.addExerciseDebug = createDebuggingUtilities();
    
    console.log('🔧 Add Exercise Debugging Initialized');
    console.log('Available commands:');
    console.log('  - addExerciseDebug.getDebugConfig()');
    console.log('  - addExerciseDebug.getDebugLogs()');
    console.log('  - addExerciseDebug.getPerformanceLogs()');
    console.log('  - addExerciseDebug.generateDebugReport()');
    console.log('  - addExerciseDebug.exportLogs()');
    console.log('  - addExerciseDebug.clearAllLogs()');
  }
};

// Auto-initialize in development
if (typeof window !== 'undefined' && DEBUG_CONFIG.enabled) {
  initializeDebugging();
}