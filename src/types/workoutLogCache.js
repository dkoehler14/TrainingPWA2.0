/**
 * WorkoutLogCache Types and Interfaces
 * 
 * Defines TypeScript-style interfaces and types for the enhanced caching system
 * used in workout log operations to prevent duplicates and improve performance.
 */

/**
 * @typedef {Object} ExerciseData
 * @property {string} [id] - Database ID for existing exercises
 * @property {string} exerciseId - Reference to exercise definition
 * @property {number} sets - Number of sets
 * @property {(number|null)[]} reps - Array of reps per set
 * @property {(number|null)[]} weights - Array of weights per set
 * @property {boolean[]} completed - Array of completion status per set
 * @property {number} orderIndex - Order of exercise in workout
 * @property {string} notes - Exercise notes
 * @property {number|null} bodyweight - Bodyweight for bodyweight exercises
 * @property {boolean} isModified - Whether exercise has been modified
 * @property {boolean} isNew - Whether exercise is newly added
 * @property {boolean} isDeleted - Whether exercise is marked for deletion
 * @property {boolean} [isAdded] - Whether exercise was added temporarily
 * @property {string|null} [addedType] - Type of addition (temporary/permanent)
 * @property {number} [originalIndex] - Original index before modifications
 */

/**
 * @typedef {Object} WorkoutLogCache
 * @property {string|null} workoutLogId - Cached workout log ID (UUID format)
 * @property {string} lastSaved - ISO timestamp of last save operation
 * @property {boolean} isValid - Whether the cache entry is valid
 * @property {ExerciseData[]} exercises - Cached exercise data
 * @property {boolean} isWorkoutFinished - Whether workout is completed
 * @property {string} cacheKey - Cache key used for storage
 * @property {number} version - Cache version for conflict resolution
 * @property {string} lastModified - ISO timestamp of last modification
 * @property {Object} metadata - Additional cache metadata
 * @property {string} metadata.userId - User ID associated with cache
 * @property {string} metadata.programId - Program ID associated with cache
 * @property {number} metadata.weekIndex - Week index
 * @property {number} metadata.dayIndex - Day index
 * @property {string} metadata.source - Source of cache entry (create/update/query)
 */

/**
 * @typedef {Object} CacheValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {string} reason - Reason for validation result
 * @property {Object} context - Additional validation context
 * @property {string} timestamp - Validation timestamp
 */

/**
 * @typedef {Object} CacheOperationOptions
 * @property {boolean} [validateInDatabase] - Whether to validate against database
 * @property {boolean} [skipCleanup] - Whether to skip automatic cleanup
 * @property {string} [source] - Source of the operation
 * @property {Object} [metadata] - Additional operation metadata
 */

/**
 * @typedef {Object} CacheCleanupOptions
 * @property {string} reason - Reason for cleanup
 * @property {boolean} [logOperation] - Whether to log the cleanup operation
 * @property {Object} [context] - Additional cleanup context
 */

/**
 * Cache Manager Interface
 * Provides methods for managing workout log cache operations
 */
export class CacheManagerInterface {
  /**
   * Get cached workout log data
   * @param {string} key - Cache key
   * @param {CacheOperationOptions} [options] - Operation options
   * @returns {Promise<WorkoutLogCache|null>} Cached data or null
   */
  async get(key, options = {}) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Set cached workout log data
   * @param {string} key - Cache key
   * @param {WorkoutLogCache} value - Cache value
   * @param {CacheOperationOptions} [options] - Operation options
   * @returns {Promise<void>}
   */
  async set(key, value, options = {}) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Validate cached workout log ID
   * @param {string} key - Cache key
   * @param {string} workoutLogId - Workout log ID to validate
   * @param {CacheOperationOptions} [options] - Operation options
   * @returns {Promise<CacheValidationResult>} Validation result
   */
  async validate(key, workoutLogId, options = {}) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Invalidate cached entry
   * @param {string} key - Cache key
   * @param {CacheOperationOptions} [options] - Operation options
   * @returns {Promise<void>}
   */
  async invalidate(key, options = {}) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Clean up invalid cache entry
   * @param {string} key - Cache key
   * @param {CacheCleanupOptions} options - Cleanup options
   * @returns {Promise<void>}
   */
  async cleanup(key, options) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Generate cache key for workout log
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} [prefix] - Optional key prefix
   * @returns {string} Generated cache key
   */
  generateKey(weekIndex, dayIndex, prefix = '') {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Check if cache entry exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} Whether entry exists
   */
  async exists(key) {
    throw new Error('Method must be implemented by subclass');
  }

  /**
   * Clear all cache entries
   * @param {CacheOperationOptions} [options] - Operation options
   * @returns {Promise<void>}
   */
  async clear(options = {}) {
    throw new Error('Method must be implemented by subclass');
  }
}

/**
 * Cache validation utilities
 */
export const CacheValidationUtils = {
  /**
   * Validate UUID format
   * @param {string} id - ID to validate
   * @returns {boolean} Whether ID is valid UUID
   */
  isValidUUID(id) {
    if (!id || typeof id !== 'string') return false;
    // Check for valid UUID format (8-4-4-4-12 characters)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  },

  /**
   * Validate cache key format
   * @param {string} key - Cache key to validate
   * @returns {boolean} Whether key is valid
   */
  isValidCacheKey(key) {
    if (!key || typeof key !== 'string') return false;
    // Check for expected format: weekIndex_dayIndex
    const keyRegex = /^\d+_\d+$/;
    return keyRegex.test(key);
  },

  /**
   * Validate exercise data structure
   * @param {ExerciseData} exercise - Exercise data to validate
   * @returns {boolean} Whether exercise data is valid
   */
  isValidExerciseData(exercise) {
    if (!exercise || typeof exercise !== 'object') return false;
    
    // Required fields
    if (!exercise.exerciseId || typeof exercise.exerciseId !== 'string') return false;
    if (typeof exercise.sets !== 'number' || exercise.sets <= 0) return false;
    if (!Array.isArray(exercise.reps) || !Array.isArray(exercise.weights) || !Array.isArray(exercise.completed)) return false;
    
    // Arrays should match sets count
    if (exercise.reps.length !== exercise.sets || 
        exercise.weights.length !== exercise.sets || 
        exercise.completed.length !== exercise.sets) return false;
    
    return true;
  },

  /**
   * Validate workout log cache structure
   * @param {WorkoutLogCache} cache - Cache data to validate
   * @returns {boolean} Whether cache structure is valid
   */
  isValidCacheStructure(cache) {
    if (!cache || typeof cache !== 'object') return false;
    
    // Check required fields
    if (cache.workoutLogId !== null && !this.isValidUUID(cache.workoutLogId)) return false;
    if (!cache.lastSaved || typeof cache.lastSaved !== 'string') return false;
    if (typeof cache.isValid !== 'boolean') return false;
    if (!Array.isArray(cache.exercises)) return false;
    if (typeof cache.isWorkoutFinished !== 'boolean') return false;
    
    // Validate exercises
    for (const exercise of cache.exercises) {
      if (!this.isValidExerciseData(exercise)) return false;
    }
    
    return true;
  }
};

/**
 * Cache key generation utilities
 */
export const CacheKeyUtils = {
  /**
   * Generate standard cache key
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} [prefix] - Optional prefix
   * @returns {string} Generated cache key
   */
  generateKey(weekIndex, dayIndex, prefix = '') {
    if (typeof weekIndex !== 'number' || typeof dayIndex !== 'number') {
      throw new Error('Week and day indices must be numbers');
    }
    
    const baseKey = `${weekIndex}_${dayIndex}`;
    return prefix ? `${prefix}_${baseKey}` : baseKey;
  },

  /**
   * Parse cache key into components
   * @param {string} key - Cache key to parse
   * @returns {Object} Parsed key components
   */
  parseKey(key) {
    if (!CacheValidationUtils.isValidCacheKey(key)) {
      throw new Error('Invalid cache key format');
    }
    
    const [weekIndex, dayIndex] = key.split('_').map(Number);
    return { weekIndex, dayIndex };
  },

  /**
   * Generate cache key with metadata
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Key and metadata object
   */
  generateKeyWithMetadata(weekIndex, dayIndex, metadata = {}) {
    const key = this.generateKey(weekIndex, dayIndex);
    return {
      key,
      metadata: {
        weekIndex,
        dayIndex,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }
};

/**
 * Cache operation logging utilities
 */
export const CacheLoggingUtils = {
  /**
   * Log cache operation with structured data
   * @param {string} operation - Operation name
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {string} message - Log message
   * @param {Object} context - Operation context
   */
  logOperation(operation, level, message, context = {}) {
    const logData = {
      operation,
      message,
      timestamp: new Date().toISOString(),
      ...context
    };

    // Use appropriate console method based on level
    switch (level) {
      case 'error':
        console.error(`❌ CACHE ${operation.toUpperCase()}: ${message}`, logData);
        break;
      case 'warn':
        console.warn(`⚠️ CACHE ${operation.toUpperCase()}: ${message}`, logData);
        break;
      case 'debug':
        console.debug(`🔍 CACHE ${operation.toUpperCase()}: ${message}`, logData);
        break;
      case 'info':
      default:
        console.log(`✅ CACHE ${operation.toUpperCase()}: ${message}`, logData);
        break;
    }
  },

  /**
   * Log cache hit
   * @param {string} key - Cache key
   * @param {Object} context - Additional context
   */
  logCacheHit(key, context = {}) {
    this.logOperation('HIT', 'info', 'Found valid cached workout log ID', {
      key,
      cacheSource: 'programLogs',
      validationPassed: true,
      ...context
    });
  },

  /**
   * Log cache miss
   * @param {string} key - Cache key
   * @param {Object} context - Additional context
   */
  logCacheMiss(key, context = {}) {
    this.logOperation('MISS', 'debug', 'No cached workout log ID found', {
      key,
      cacheSource: 'programLogs',
      reason: 'key_not_found',
      ...context
    });
  },

  /**
   * Log cache validation failure
   * @param {string} key - Cache key
   * @param {string} reason - Failure reason
   * @param {Object} context - Additional context
   */
  logValidationFailure(key, reason, context = {}) {
    this.logOperation('VALIDATION_FAILED', 'error', 'Cache validation failed', {
      key,
      reason,
      validationResult: false,
      ...context
    });
  },

  /**
   * Log cache cleanup
   * @param {string} key - Cache key
   * @param {string} reason - Cleanup reason
   * @param {Object} context - Additional context
   */
  logCleanup(key, reason, context = {}) {
    this.logOperation('CLEANUP', 'info', 'Removing invalid cache entry', {
      key,
      reason,
      ...context
    });
  }
};

/**
 * Error types for cache operations
 */
export const CacheErrorTypes = {
  INVALID_KEY: 'INVALID_KEY',
  INVALID_UUID: 'INVALID_UUID',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INVALID_STRUCTURE: 'INVALID_STRUCTURE',
  OPERATION_FAILED: 'OPERATION_FAILED'
};

/**
 * Cache error class
 */
export class CacheError extends Error {
  constructor(type, message, context = {}) {
    super(message);
    this.name = 'CacheError';
    this.type = type;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

// Export all types and utilities
export default {
  CacheManagerInterface,
  CacheValidationUtils,
  CacheKeyUtils,
  CacheLoggingUtils,
  CacheErrorTypes,
  CacheError
};