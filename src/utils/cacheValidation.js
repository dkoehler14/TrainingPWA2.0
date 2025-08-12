/**
 * Cache Validation Utilities
 * 
 * Provides validation functions for workout log cache operations
 */

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
 * Validate UUID format
 * @param {string} id - ID to validate
 * @returns {boolean} Whether ID is valid UUID
 */
export function isValidUUID(id) {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id);
}

/**
 * Validate cache key format
 * @param {string} key - Cache key to validate
 * @returns {boolean} Whether key is valid
 */
export function isValidCacheKey(key) {
  if (!key || typeof key !== 'string') return false;
  return CACHE_KEY_REGEX.test(key);
}

/**
 * Validate workout log ID exists in database
 * @param {string} workoutLogId - Workout log ID to validate
 * @returns {Promise<boolean>} Whether workout log exists
 */
export async function validateWorkoutLogInDatabase(workoutLogId) {
  if (!isValidUUID(workoutLogId)) {
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
}

/**
 * Validate exercise data structure
 * @param {Object} exercise - Exercise data to validate
 * @returns {boolean} Whether exercise data is valid
 */
export function isValidExerciseData(exercise) {
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
}

/**
 * Validate workout log cache structure (enhanced for change tracking)
 * @param {Object} cache - Cache data to validate
 * @returns {boolean} Whether cache structure is valid
 */
export function isValidCacheStructure(cache) {
  if (!cache || typeof cache !== 'object') return false;
  
  // Check required fields (backward compatibility)
  if (cache.workoutLogId !== null && !isValidUUID(cache.workoutLogId)) return false;
  if (!cache.lastSaved || typeof cache.lastSaved !== 'string') return false;
  if (typeof cache.isValid !== 'boolean') return false;
  if (!Array.isArray(cache.exercises)) return false;
  if (typeof cache.isWorkoutFinished !== 'boolean') return false;
  
  // Validate exercises
  for (const exercise of cache.exercises) {
    if (!isValidExerciseData(exercise)) return false;
  }
  
  // Enhanced validation for change tracking structure (optional for backward compatibility)
  if (cache.cacheInfo) {
    if (typeof cache.cacheInfo !== 'object') return false;
    if (cache.cacheInfo.lastExerciseUpdate && typeof cache.cacheInfo.lastExerciseUpdate !== 'string') return false;
    if (cache.cacheInfo.lastMetadataUpdate && typeof cache.cacheInfo.lastMetadataUpdate !== 'string') return false;
    if (cache.cacheInfo.saveStrategy && typeof cache.cacheInfo.saveStrategy !== 'string') return false;
  }
  
  if (cache.changeTracking) {
    if (typeof cache.changeTracking !== 'object') return false;
    if (typeof cache.changeTracking.hasUnsavedExerciseChanges !== 'boolean') return false;
    if (typeof cache.changeTracking.hasUnsavedMetadataChanges !== 'boolean') return false;
    if (cache.changeTracking.lastUserInput && typeof cache.changeTracking.lastUserInput !== 'string') return false;
    if (cache.changeTracking.pendingSaveType && 
        !['exercise-only', 'metadata-only', 'full-save'].includes(cache.changeTracking.pendingSaveType)) return false;
  }
  
  return true;
}

/**
 * Validate cache timestamp is not stale
 * @param {string} timestamp - ISO timestamp to validate
 * @param {number} maxAgeMs - Maximum age in milliseconds (default: 1 hour)
 * @returns {boolean} Whether timestamp is fresh
 */
export function isTimestampFresh(timestamp, maxAgeMs = 60 * 60 * 1000) {
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
}

/**
 * Comprehensive cache validation
 * @param {Object} cache - Cache data to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.checkDatabase - Whether to validate against database
 * @param {boolean} options.checkTimestamp - Whether to check timestamp freshness
 * @param {number} options.maxAgeMs - Maximum cache age in milliseconds
 * @returns {Promise<Object>} Validation result with details
 */
export async function validateCache(cache, options = {}) {
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
  if (!isValidCacheStructure(cache)) {
    result.reason = 'Invalid cache structure';
    result.context.structureValid = false;
    return result;
  }

  // Timestamp validation
  if (checkTimestamp && !isTimestampFresh(cache.lastSaved, maxAgeMs)) {
    result.reason = 'Cache timestamp is stale';
    result.context.timestampFresh = false;
    result.context.lastSaved = cache.lastSaved;
    return result;
  }

  // Database validation
  if (checkDatabase && cache.workoutLogId) {
    const existsInDb = await validateWorkoutLogInDatabase(cache.workoutLogId);
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
    timestampFresh: checkTimestamp ? isTimestampFresh(cache.lastSaved, maxAgeMs) : null,
    databaseValid: checkDatabase ? true : null,
    workoutLogId: cache.workoutLogId
  };

  return result;
}

/**
 * Generate cache key from workout parameters
 * @param {number} weekIndex - Week index
 * @param {number} dayIndex - Day index
 * @param {string} prefix - Optional prefix
 * @returns {string} Generated cache key
 */
export function generateCacheKey(weekIndex, dayIndex, prefix = '') {
  if (typeof weekIndex !== 'number' || typeof dayIndex !== 'number') {
    throw new Error('Week and day indices must be numbers');
  }
  
  const baseKey = `${weekIndex}_${dayIndex}`;
  return prefix ? `${prefix}_${baseKey}` : baseKey;
}

/**
 * Parse cache key into components
 * @param {string} key - Cache key to parse
 * @returns {Object} Parsed key components
 */
export function parseCacheKey(key) {
  if (!isValidCacheKey(key)) {
    throw new Error('Invalid cache key format');
  }
  
  const [weekIndex, dayIndex] = key.split('_').map(Number);
  return { weekIndex, dayIndex };
}