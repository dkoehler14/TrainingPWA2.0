/**
 * Debug utilities for logging and debugging support
 * Provides consistent logging patterns and debugging helpers
 */

/**
 * Create a debug logger with consistent formatting
 * @param {string} component - Component name (e.g., 'PROGRAM_SERVICE', 'DATA_TRANSFORM')
 * @param {string} operation - Operation name (e.g., 'getUserPrograms', 'transform')
 * @returns {Object} Logger object with different log levels
 */
export const createDebugLogger = (component, operation) => {
  const prefix = `[${component}${operation ? `_${operation}` : ''}]`;
  
  return {
    info: (message, data = {}) => {
      console.log(`ℹ️ ${prefix} ${message}`, data);
    },
    
    success: (message, data = {}) => {
      console.log(`✅ ${prefix} ${message}`, data);
    },
    
    warn: (message, data = {}) => {
      console.warn(`⚠️ ${prefix} ${message}`, data);
    },
    
    error: (message, data = {}) => {
      console.error(`❌ ${prefix} ${message}`, data);
    },
    
    debug: (message, data = {}) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`🐛 ${prefix} ${message}`, data);
      }
    },
    
    performance: (message, startTime, data = {}) => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      console.log(`⏱️ ${prefix} ${message}`, {
        ...data,
        durationMs: Math.round(duration * 100) / 100
      });
    },
    
    cache: (action, message, data = {}) => {
      const emoji = {
        hit: '🎯',
        miss: '💾',
        set: '💾',
        invalidate: '🗑️'
      }[action] || '💾';
      
      console.log(`${emoji} ${prefix} [CACHE_${action.toUpperCase()}] ${message}`, data);
    }
  };
};

/**
 * Log cache operation with consistent formatting
 * @param {string} operation - Cache operation (hit, miss, set, invalidate)
 * @param {string} component - Component performing the operation
 * @param {string} message - Log message
 * @param {Object} data - Additional data to log
 */
export const logCacheOperation = (operation, component, message, data = {}) => {
  const emoji = {
    hit: '🎯',
    miss: '💾',
    set: '💾',
    invalidate: '🗑️'
  }[operation] || '💾';
  
  console.log(`${emoji} [${component}] [CACHE_${operation.toUpperCase()}] ${message}`, {
    timestamp: new Date().toISOString(),
    ...data
  });
};

/**
 * Log data transformation with performance metrics
 * @param {string} transformType - Type of transformation
 * @param {Object} input - Input data summary
 * @param {Object} output - Output data summary
 * @param {number} startTime - Start time from performance.now()
 */
export const logDataTransformation = (transformType, input, output, startTime) => {
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  console.log(`🔄 [DATA_TRANSFORM] ${transformType} completed:`, {
    input,
    output,
    durationMs: Math.round(duration * 100) / 100,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log database operation with performance metrics
 * @param {string} operation - Database operation (select, insert, update, delete)
 * @param {string} table - Table name
 * @param {Object} filters - Applied filters
 * @param {Object} result - Operation result summary
 * @param {number} startTime - Start time from performance.now()
 */
export const logDatabaseOperation = (operation, table, filters, result, startTime) => {
  const endTime = performance.now();
  const duration = endTime - startTime;
  
  const emoji = {
    select: '🔍',
    insert: '➕',
    update: '✏️',
    delete: '🗑️'
  }[operation] || '📊';
  
  console.log(`${emoji} [DATABASE] ${operation.toUpperCase()} ${table}:`, {
    filters,
    result,
    durationMs: Math.round(duration * 100) / 100,
    timestamp: new Date().toISOString()
  });
};

/**
 * Log error with context information
 * @param {string} component - Component where error occurred
 * @param {string} operation - Operation that failed
 * @param {Error} error - Error object
 * @param {Object} context - Additional context data
 */
export const logError = (component, operation, error, context = {}) => {
  console.error(`💥 [${component}] Error in ${operation}:`, {
    message: error.message,
    stack: error.stack,
    context,
    timestamp: new Date().toISOString()
  });
};

/**
 * Create a performance timer
 * @param {string} label - Timer label
 * @returns {Function} Function to end the timer and log results
 */
export const createPerformanceTimer = (label) => {
  const startTime = performance.now();
  
  return (data = {}) => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`⏱️ [PERFORMANCE] ${label}:`, {
      durationMs: Math.round(duration * 100) / 100,
      ...data,
      timestamp: new Date().toISOString()
    });
    
    return duration;
  };
};

/**
 * Log component lifecycle event
 * @param {string} component - Component name
 * @param {string} event - Lifecycle event (mount, unmount, update)
 * @param {Object} data - Additional data
 */
export const logComponentLifecycle = (component, event, data = {}) => {
  const emoji = {
    mount: '🚀',
    unmount: '🛑',
    update: '🔄',
    render: '🎨'
  }[event] || '📱';
  
  console.log(`${emoji} [${component}] ${event.toUpperCase()}:`, {
    ...data,
    timestamp: new Date().toISOString()
  });
};

/**
 * Debug helper to log object structure
 * @param {string} label - Label for the object
 * @param {Object} obj - Object to analyze
 */
export const debugObjectStructure = (label, obj) => {
  if (process.env.NODE_ENV !== 'development') return;
  
  const analyze = (item, depth = 0) => {
    if (depth > 3) return '[max depth reached]';
    
    if (item === null) return 'null';
    if (item === undefined) return 'undefined';
    
    const type = typeof item;
    
    if (type === 'object') {
      if (Array.isArray(item)) {
        return `Array(${item.length})`;
      }
      
      const keys = Object.keys(item);
      const structure = {};
      keys.slice(0, 10).forEach(key => {
        structure[key] = analyze(item[key], depth + 1);
      });
      
      if (keys.length > 10) {
        structure['...'] = `${keys.length - 10} more keys`;
      }
      
      return structure;
    }
    
    return type;
  };
  
  console.log(`🔍 [DEBUG_STRUCTURE] ${label}:`, analyze(obj));
};

/**
 * Validate and log data structure issues
 * @param {string} component - Component name
 * @param {string} dataType - Type of data being validated
 * @param {*} data - Data to validate
 * @param {Object} expectedStructure - Expected structure description
 * @returns {boolean} Whether data is valid
 */
export const validateAndLogDataStructure = (component, dataType, data, expectedStructure) => {
  const logger = createDebugLogger(component, 'VALIDATION');
  
  if (data === null || data === undefined) {
    logger.error(`${dataType} is null or undefined`, { data, expectedStructure });
    return false;
  }
  
  if (expectedStructure.type && typeof data !== expectedStructure.type) {
    logger.error(`${dataType} has wrong type`, {
      expected: expectedStructure.type,
      actual: typeof data,
      data
    });
    return false;
  }
  
  if (expectedStructure.isArray && !Array.isArray(data)) {
    logger.error(`${dataType} should be an array`, { data });
    return false;
  }
  
  if (expectedStructure.requiredKeys) {
    const missingKeys = expectedStructure.requiredKeys.filter(key => !(key in data));
    if (missingKeys.length > 0) {
      logger.error(`${dataType} missing required keys`, {
        missingKeys,
        availableKeys: Object.keys(data),
        data
      });
      return false;
    }
  }
  
  logger.success(`${dataType} validation passed`);
  return true;
};