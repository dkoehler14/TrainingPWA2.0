/**
 * Enhanced Cache Manager Hook
 * 
 * Provides a clean interface for integrating the WorkoutLogCacheManager
 * with the existing programLogs state in LogWorkout component.
 */

import { useCallback } from 'react';
import { WorkoutLogCacheManager } from '../utils/cacheManager.js';

/**
 * Hook for managing workout log cache operations
 * @param {Object} programLogs - Current programLogs state
 * @param {Function} setProgramLogs - Function to update programLogs state
 * @param {Object} options - Cache manager options
 * @returns {Object} Cache management functions
 */
export function useCacheManager(programLogs, setProgramLogs, options = {}) {
  // Create cache manager instance with options
  const cacheManager = new WorkoutLogCacheManager({
    validateInDatabase: false,
    autoCleanup: true,
    maxCacheAge: 60 * 60 * 1000, // 1 hour
    logOperations: true,
    ...options
  });

  /**
   * Get cached workout log data with validation
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} options - Operation options
   * @returns {Promise<Object|null>} Cached data or null
   */
  const getCachedWorkoutLog = useCallback(async (weekIndex, dayIndex, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    return await cacheManager.get(key, programLogs, operationOptions);
  }, [cacheManager, programLogs]);

  /**
   * Get cached workout log ID with validation (backward compatibility)
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {boolean} validateInDatabase - Whether to validate against database
   * @returns {Promise<string|null>} Cached workout log ID or null
   */
  const getCachedWorkoutLogId = useCallback(async (weekIndex, dayIndex, validateInDatabase = false) => {
    const cachedData = await getCachedWorkoutLog(weekIndex, dayIndex, { validateInDatabase });
    return cachedData?.workoutLogId || null;
  }, [getCachedWorkoutLog]);

  /**
   * Set cached workout log data
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} cacheData - Cache data to store
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const setCachedWorkoutLog = useCallback(async (weekIndex, dayIndex, cacheData, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    await cacheManager.set(key, cacheData, programLogs, setProgramLogs, operationOptions);
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Update cached workout log data (merge with existing)
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} updates - Updates to apply
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const updateCachedWorkoutLog = useCallback(async (weekIndex, dayIndex, updates, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    const existingData = programLogs[key] || {};
    
    const updatedData = {
      ...existingData,
      ...updates,
      lastSaved: new Date().toISOString(),
      isValid: true
    };

    await cacheManager.set(key, updatedData, programLogs, setProgramLogs, operationOptions);
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Validate cached workout log ID
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} workoutLogId - Workout log ID to validate
   * @param {Object} options - Validation options
   * @returns {Promise<Object>} Validation result
   */
  const validateCachedWorkoutLogId = useCallback(async (weekIndex, dayIndex, workoutLogId, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    return await cacheManager.validate(key, workoutLogId, operationOptions);
  }, [cacheManager]);

  /**
   * Clean up invalid cache entry
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} reason - Cleanup reason
   * @param {Object} options - Cleanup options
   * @returns {Promise<void>}
   */
  const cleanupInvalidCacheEntry = useCallback(async (weekIndex, dayIndex, reason, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    await cacheManager.cleanup(key, programLogs, setProgramLogs, { 
      reason, 
      ...operationOptions 
    });
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Invalidate cache entry
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} reason - Invalidation reason
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const invalidateCacheEntry = useCallback(async (weekIndex, dayIndex, reason, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    await cacheManager.invalidate(key, programLogs, setProgramLogs, { 
      reason, 
      ...operationOptions 
    });
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Check if cache entry exists
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @returns {Promise<boolean>} Whether entry exists
   */
  const cacheEntryExists = useCallback(async (weekIndex, dayIndex) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    return await cacheManager.exists(key, programLogs);
  }, [cacheManager, programLogs]);

  /**
   * Clear all cache entries
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const clearAllCache = useCallback(async (operationOptions = {}) => {
    await cacheManager.clear(setProgramLogs, operationOptions);
  }, [cacheManager, setProgramLogs]);

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  const getCacheStats = useCallback(() => {
    return cacheManager.getStats(programLogs);
  }, [cacheManager, programLogs]);

  /**
   * Update cache after exercise-only save
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} exerciseData - Updated exercise data
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const updateCacheAfterExerciseSave = useCallback(async (weekIndex, dayIndex, exerciseData, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    await cacheManager.updateCacheAfterExerciseSave(key, exerciseData, programLogs, setProgramLogs, operationOptions);
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Update cache after metadata-only save
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} metadataData - Updated metadata
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const updateCacheAfterMetadataSave = useCallback(async (weekIndex, dayIndex, metadataData, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    await cacheManager.updateCacheAfterMetadataSave(key, metadataData, programLogs, setProgramLogs, operationOptions);
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Update cache after full save
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} fullData - Complete workout data
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const updateCacheAfterFullSave = useCallback(async (weekIndex, dayIndex, fullData, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    await cacheManager.updateCacheAfterFullSave(key, fullData, programLogs, setProgramLogs, operationOptions);
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Mark cache entry as having unsaved changes
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} changeType - Type of change ('exercise', 'metadata', 'both')
   * @param {string} pendingSaveType - Pending save type
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const markCacheAsChanged = useCallback(async (weekIndex, dayIndex, changeType, pendingSaveType, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    await cacheManager.markAsChanged(key, changeType, pendingSaveType, programLogs, setProgramLogs, operationOptions);
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Invalidate cache on save failure
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {string} saveType - Type of save that failed
   * @param {Error} error - Save error
   * @param {Object} options - Operation options
   * @returns {Promise<void>}
   */
  const invalidateCacheOnSaveFailure = useCallback(async (weekIndex, dayIndex, saveType, error, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    await cacheManager.invalidateOnSaveFailure(key, saveType, error, programLogs, setProgramLogs, operationOptions);
  }, [cacheManager, programLogs, setProgramLogs]);

  /**
   * Enhanced programLogs update with cache integration
   * @param {number} weekIndex - Week index
   * @param {number} dayIndex - Day index
   * @param {Object} data - Data to store
   * @param {Object} options - Update options
   * @returns {Promise<void>}
   */
  const updateProgramLogs = useCallback(async (weekIndex, dayIndex, data, operationOptions = {}) => {
    const key = cacheManager.generateKey(weekIndex, dayIndex);
    
    // Prepare cache-compatible data structure
    const cacheData = {
      workoutLogId: data.workoutLogId || null,
      exercises: data.exercises || [],
      isWorkoutFinished: data.isWorkoutFinished || false,
      lastSaved: new Date().toISOString(),
      isValid: true,
      metadata: {
        name: data.name || '',
        isFinished: data.isWorkoutFinished || false,
        isDraft: data.isDraft !== false,
        duration: data.duration || null,
        notes: data.notes || '',
        completedDate: data.completedDate || null,
        weightUnit: data.weightUnit || 'lbs',
        userId: data.userId,
        programId: data.programId,
        weekIndex,
        dayIndex,
        source: operationOptions.source || 'update_program_logs',
        timestamp: new Date().toISOString(),
        ...data.metadata
      }
    };

    // Update using cache manager for consistency
    await cacheManager.set(key, cacheData, programLogs, setProgramLogs, operationOptions);
  }, [cacheManager, programLogs, setProgramLogs]);

  return {
    // Core cache operations
    getCachedWorkoutLog,
    setCachedWorkoutLog,
    updateCachedWorkoutLog,
    
    // Backward compatibility functions
    getCachedWorkoutLogId,
    validateCachedWorkoutLogId,
    cleanupInvalidCacheEntry,
    
    // Additional operations
    invalidateCacheEntry,
    cacheEntryExists,
    clearAllCache,
    getCacheStats,
    
    // Enhanced cache operations for different save types
    updateCacheAfterExerciseSave,
    updateCacheAfterMetadataSave,
    updateCacheAfterFullSave,
    markCacheAsChanged,
    invalidateCacheOnSaveFailure,
    
    // Enhanced programLogs integration
    updateProgramLogs,
    
    // Direct access to cache manager if needed
    cacheManager
  };
}

export default useCacheManager;