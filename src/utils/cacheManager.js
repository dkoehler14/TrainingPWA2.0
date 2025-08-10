/**
 * Enhanced Cache Manager for Workout Log Operations
 * 
 * Provides a comprehensive caching system for workout logs with validation,
 * cleanup, and database synchronization capabilities.
 */

// Import only what we need to avoid circular dependencies
import { supabase } from '../config/supabase.js';

/**
 * UUID validation regex pattern
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Cache key validation regex pattern (weekIndex_dayIndex)
 */
const CACHE_KEY_REGEX = /^\d+_\d+$/;

/**
 * Internal validation utilities
 */
const ValidationUtils = {
  /**
   * Validate UUID format
   * @param {string} id - ID to validate
   * @returns {boolean} Whether ID is valid UUID
   */
  isValidUUID(id) {
    if (!id || typeof id !== 'string') return false;
    return UUID_REGEX.test(id);
  },

  /**
   * Validate cache key format
   * @param {string} key - Cache key to validate
   * @returns {boolean} Whether key is valid
   */
  isValidCacheKey(key) {
    if (!key || typeof key !== 'string') return false;
    return CACHE_KEY_REGEX.test(key);
  },

  /**
   * Validate exercise data structure
   * @param {Object} exercise - Exercise data to validate
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
   * @param {Object} cache - Cache data to validate
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
  },

  /**
   * Validate workout log ID exists in database
   * @param {string} workoutLogId - Workout log ID to validate
   * @returns {Promise<boolean>} Whether workout log exists
   */
  async validateWorkoutLogInDatabase(workoutLogId) {
    if (!this.isValidUUID(workoutLogId)) {
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('id', workoutLogId)
        .single();

      if (error) {
        console.warn('Database validation error:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error validating workout log in database:', error);
      return false;
    }
  },

  /**
   * Validate cache timestamp is not stale
   * @param {string} timestamp - ISO timestamp to validate
   * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   * @returns {boolean} Whether timestamp is fresh
   */
  isTimestampFresh(timestamp, maxAgeMs = 60 * 60 * 1000) {
    if (!timestamp || typeof timestamp !== 'string') return false;
    
    try {
      const timestampDate = new Date(timestamp);
      const now = new Date();
      const age = now.getTime() - timestampDate.getTime();
      
      return age <= maxAgeMs;
    } catch (error) {
      console.warn('Invalid timestamp format:', timestamp);
      return false;
    }
  },

  /**
   * Comprehensive cache validation
   * @param {Object} cache - Cache data to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result with details
   */
  async validateCache(cache, options = {}) {
    const {
      checkDatabase = false,
      checkTimestamp = true,
      maxAgeMs = 60 * 60 * 1000 // 1 hour default
    } = options;

    const result = {
      isValid: false,
      reason: '',
      context: {},
      timestamp: new Date().toISOString()
    };

    // Structure validation
    if (!this.isValidCacheStructure(cache)) {
      result.reason = 'Invalid cache structure';
      result.context.structureValid = false;
      return result;
    }

    // Timestamp validation
    if (checkTimestamp && !this.isTimestampFresh(cache.lastSaved, maxAgeMs)) {
      result.reason = 'Cache timestamp is stale';
      result.context.timestampFresh = false;
      result.context.lastSaved = cache.lastSaved;
      return result;
    }

    // Database validation
    if (checkDatabase && cache.workoutLogId) {
      const existsInDb = await this.validateWorkoutLogInDatabase(cache.workoutLogId);
      if (!existsInDb) {
        result.reason = 'Workout log not found in database';
        result.context.databaseValid = false;
        result.context.workoutLogId = cache.workoutLogId;
        return result;
      }
      result.context.databaseValid = true;
    }

    // All validations passed
    result.isValid = true;
    result.reason = 'Cache validation successful';
    result.context = {
      structureValid: true,
      timestampFresh: checkTimestamp ? this.isTimestampFresh(cache.lastSaved, maxAgeMs) : null,
      databaseValid: checkDatabase ? true : null,
      workoutLogId: cache.workoutLogId
    };

    return result;
  },

  /**
   * Generate cache key from workout parameters
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} prefix - Optional prefix
   * @returns {string} Generated cache key
   */
  generateCacheKey(weekIndex, dayIndex, prefix = '') {
    if (typeof weekIndex !== 'number' || typeof dayIndex !== 'number') {
      throw new Error('Week and day indices must be numbers');
    }
    
    const baseKey = `${weekIndex}_${dayIndex}`;
    return prefix ? `${prefix}_${baseKey}` : baseKey;
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
 * Enhanced Cache Manager Class
 * 
 * Manages workout log cache operations with validation and cleanup
 */
export class WorkoutLogCacheManager {
  constructor(options = {}) {
    this.options = {
      validateInDatabase: false,
      autoCleanup: true,
      maxCacheAge: 60 * 60 * 1000, // 1 hour default
      logOperations: true,
      ...options
    };
  }

  /**
   * Get cached workout log data
   * @param {string} key - Cache key
   * @param {Object} cacheStore - Cache store object (programLogs)
   * @param {Object} options - Operation options
   * @returns {Promise<Object|null>} Cached data or null
   */
  async get(key, cacheStore, options = {}) {
    const opts = { ...this.options, ...options };
    
    try {
      // Validate cache key format
      if (!ValidationUtils.isValidCacheKey(key)) {
        if (opts.logOperations) {
          CacheLoggingUtils.logOperation('GET', 'error', 'Invalid cache key format', {
            key,
            expectedFormat: 'weekIndex_dayIndex'
          });
        }
        return null;
      }

      // Check if cache entry exists
      const cacheEntry = cacheStore[key];
      if (!cacheEntry) {
        if (opts.logOperations) {
          CacheLoggingUtils.logCacheMiss(key, {
            availableKeys: Object.keys(cacheStore),
            cacheSize: Object.keys(cacheStore).length
          });
        }
        return null;
      }

      // Validate cache structure
      if (!ValidationUtils.isValidCacheStructure(cacheEntry)) {
        if (opts.logOperations) {
          CacheLoggingUtils.logValidationFailure(key, 'Invalid cache structure', {
            cacheEntry: JSON.stringify(cacheEntry, null, 2)
          });
        }
        
        if (opts.autoCleanup) {
          await this.cleanup(key, cacheStore, { reason: 'invalid_structure' });
        }
        return null;
      }

      // Perform comprehensive validation
      const validationResult = await ValidationUtils.validateCache(cacheEntry, {
        checkDatabase: opts.validateInDatabase,
        checkTimestamp: true,
        maxAgeMs: opts.maxCacheAge
      });

      if (!validationResult.isValid) {
        if (opts.logOperations) {
          CacheLoggingUtils.logValidationFailure(key, validationResult.reason, {
            validationContext: validationResult.context,
            workoutLogId: cacheEntry.workoutLogId
          });
        }
        
        if (opts.autoCleanup) {
          await this.cleanup(key, cacheStore, { reason: validationResult.reason });
        }
        return null;
      }

      // Cache hit - log success
      if (opts.logOperations) {
        CacheLoggingUtils.logCacheHit(key, {
          workoutLogId: cacheEntry.workoutLogId,
          exerciseCount: cacheEntry.exercises?.length || 0,
          isFinished: cacheEntry.isWorkoutFinished,
          validationContext: validationResult.context
        });
      }

      return cacheEntry;
    } catch (error) {
      if (opts.logOperations) {
        CacheLoggingUtils.logOperation('GET', 'error', 'Cache get operation failed', {
          key,
          error: error.message,
          stack: error.stack
        });
      }
      return null;
    }
  }

  /**
   * Set cached workout log data
   * @param {string} key - Cache key
   * @param {Object} value - Cache value
   * @param {Object} cacheStore - Cache store object (programLogs)
   * @param {Function} setCacheStore - Function to update cache store
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  async set(key, value, cacheStore, setCacheStore, options = {}) {
    const opts = { ...this.options, ...options };
    
    try {
      // Validate cache key format
      if (!ValidationUtils.isValidCacheKey(key)) {
        throw new Error(`Invalid cache key format: ${key}`);
      }

      // Validate cache structure
      if (!ValidationUtils.isValidCacheStructure(value)) {
        throw new Error('Invalid cache structure provided');
      }

      // Enhance cache entry with metadata
      const enhancedValue = {
        ...value,
        cacheKey: key,
        lastSaved: new Date().toISOString(),
        isValid: true,
        version: (cacheStore[key]?.version || 0) + 1,
        metadata: {
          ...value.metadata,
          source: opts.source || 'set_operation',
          timestamp: new Date().toISOString()
        }
      };

      // Update cache store
      setCacheStore(prev => ({
        ...prev,
        [key]: enhancedValue
      }));

      if (opts.logOperations) {
        CacheLoggingUtils.logOperation('SET', 'info', 'Cache entry updated successfully', {
          key,
          workoutLogId: value.workoutLogId,
          exerciseCount: value.exercises?.length || 0,
          isFinished: value.isWorkoutFinished,
          version: enhancedValue.version,
          source: opts.source
        });
      }
    } catch (error) {
      if (opts.logOperations) {
        CacheLoggingUtils.logOperation('SET', 'error', 'Cache set operation failed', {
          key,
          error: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }

  /**
   * Validate cached workout log ID
   * @param {string} key - Cache key
   * @param {string} workoutLogId - Workout log ID to validate
   * @param {Object} options - Operation options
   * @returns {Promise<Object>} Validation result
   */
  async validate(key, workoutLogId, options = {}) {
    const opts = { ...this.options, ...options };
    
    try {
      // Basic UUID validation
      if (!ValidationUtils.isValidUUID(workoutLogId)) {
        return {
          isValid: false,
          reason: 'Invalid UUID format',
          context: {
            workoutLogId,
            expectedFormat: '8-4-4-4-12 characters'
          },
          timestamp: new Date().toISOString()
        };
      }

      // Database validation if requested
      if (opts.validateInDatabase) {
        const existsInDb = await ValidationUtils.validateWorkoutLogInDatabase(workoutLogId);
        if (!existsInDb) {
          return {
            isValid: false,
            reason: 'Workout log not found in database',
            context: {
              workoutLogId,
              databaseChecked: true
            },
            timestamp: new Date().toISOString()
          };
        }
      }

      return {
        isValid: true,
        reason: 'Validation successful',
        context: {
          workoutLogId,
          databaseChecked: opts.validateInDatabase
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        isValid: false,
        reason: 'Validation error',
        context: {
          workoutLogId,
          error: error.message
        },
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Invalidate cached entry
   * @param {string} key - Cache key
   * @param {Object} cacheStore - Cache store object
   * @param {Function} setCacheStore - Function to update cache store
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  async invalidate(key, cacheStore, setCacheStore, options = {}) {
    const opts = { ...this.options, ...options };
    
    try {
      const existingEntry = cacheStore[key];
      if (!existingEntry) {
        if (opts.logOperations) {
          CacheLoggingUtils.logOperation('INVALIDATE', 'debug', 'Cache entry not found for invalidation', {
            key,
            availableKeys: Object.keys(cacheStore)
          });
        }
        return;
      }

      // Mark as invalid but preserve data
      setCacheStore(prev => ({
        ...prev,
        [key]: {
          ...existingEntry,
          isValid: false,
          lastSaved: new Date().toISOString(),
          metadata: {
            ...existingEntry.metadata,
            invalidatedAt: new Date().toISOString(),
            invalidationReason: opts.reason || 'manual_invalidation'
          }
        }
      }));

      if (opts.logOperations) {
        CacheLoggingUtils.logOperation('INVALIDATE', 'info', 'Cache entry invalidated', {
          key,
          reason: opts.reason || 'manual_invalidation',
          workoutLogId: existingEntry.workoutLogId
        });
      }
    } catch (error) {
      if (opts.logOperations) {
        CacheLoggingUtils.logOperation('INVALIDATE', 'error', 'Cache invalidation failed', {
          key,
          error: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }

  /**
   * Clean up invalid cache entry
   * @param {string} key - Cache key
   * @param {Object} cacheStore - Cache store object
   * @param {Function} setCacheStore - Function to update cache store
   * @param {Object} options - Cleanup options
   * @returns {Promise<void>}
   */
  async cleanup(key, cacheStore, setCacheStore, options = {}) {
    const opts = { ...this.options, ...options };
    
    try {
      const existingEntry = cacheStore[key];
      if (!existingEntry) {
        if (opts.logOperations) {
          CacheLoggingUtils.logOperation('CLEANUP', 'debug', 'No cache entry found for cleanup', {
            key,
            availableKeys: Object.keys(cacheStore)
          });
        }
        return;
      }

      // Remove invalid cached workout log ID while preserving other data
      const cleanedEntry = {
        ...existingEntry,
        workoutLogId: null,
        isValid: false,
        lastSaved: new Date().toISOString(),
        metadata: {
          ...existingEntry.metadata,
          cleanedAt: new Date().toISOString(),
          cleanupReason: opts.reason || 'manual_cleanup'
        }
      };

      setCacheStore(prev => ({
        ...prev,
        [key]: cleanedEntry
      }));

      if (opts.logOperations) {
        CacheLoggingUtils.logCleanup(key, opts.reason || 'manual_cleanup', {
          previousWorkoutLogId: existingEntry.workoutLogId,
          exerciseCount: existingEntry.exercises?.length || 0,
          preservedData: true
        });
      }
    } catch (error) {
      if (opts.logOperations) {
        CacheLoggingUtils.logOperation('CLEANUP', 'error', 'Cache cleanup failed', {
          key,
          error: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }

  /**
   * Generate cache key for workout log
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} prefix - Optional key prefix
   * @returns {string} Generated cache key
   */
  generateKey(weekIndex, dayIndex, prefix = '') {
    return ValidationUtils.generateCacheKey(weekIndex, dayIndex, prefix);
  }

  /**
   * Check if cache entry exists
   * @param {string} key - Cache key
   * @param {Object} cacheStore - Cache store object
   * @returns {Promise<boolean>} Whether entry exists
   */
  async exists(key, cacheStore) {
    return key in cacheStore && cacheStore[key] !== null && cacheStore[key] !== undefined;
  }

  /**
   * Clear all cache entries
   * @param {Function} setCacheStore - Function to update cache store
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  async clear(setCacheStore, options = {}) {
    const opts = { ...this.options, ...options };
    
    try {
      setCacheStore({});
      
      if (opts.logOperations) {
        CacheLoggingUtils.logOperation('CLEAR', 'info', 'All cache entries cleared', {
          reason: opts.reason || 'manual_clear',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      if (opts.logOperations) {
        CacheLoggingUtils.logOperation('CLEAR', 'error', 'Cache clear operation failed', {
          error: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
  }

  /**
   * Get cache statistics
   * @param {Object} cacheStore - Cache store object
   * @returns {Object} Cache statistics
   */
  getStats(cacheStore) {
    const entries = Object.entries(cacheStore);
    const validEntries = entries.filter(([, entry]) => entry?.isValid === true);
    const invalidEntries = entries.filter(([, entry]) => entry?.isValid === false);
    const entriesWithWorkoutLogId = entries.filter(([, entry]) => entry?.workoutLogId);

    return {
      totalEntries: entries.length,
      validEntries: validEntries.length,
      invalidEntries: invalidEntries.length,
      entriesWithWorkoutLogId: entriesWithWorkoutLogId.length,
      hitRate: entries.length > 0 ? (validEntries.length / entries.length) * 100 : 0,
      keys: entries.map(([key]) => key),
      lastUpdated: new Date().toISOString()
    };
  }
}

// Export default instance
export default new WorkoutLogCacheManager();