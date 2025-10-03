import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'
import { supabaseCache } from '../api/supabaseCache'

/**
 * Permission checking utilities for exercise operations
 */

/**
 * Check if a user can edit a global exercise
 * @param {string} userRole - The user's role ('admin', 'user', etc.)
 * @param {Object} exercise - The exercise object
 * @returns {boolean} - True if user can edit the exercise
 */
export const canEditGlobalExercise = (userRole, exercise) => {
  if (!exercise.is_global) return true // Anyone can edit custom exercises
  return userRole === 'admin' // Only admins can edit global exercises
}

/**
 * Permission context for exercise operations
 */
export const exercisePermissions = {
  canEdit: (exercise, userRole) => {
    return !exercise.is_global || userRole === 'admin'
  },
  canDelete: (exercise, userRole, userId) => {
    return exercise.created_by === userId || 
           (exercise.is_global && userRole === 'admin')
  }
}

/**
 * Validate user permissions for exercise operations
 * @param {Object} exercise - The exercise object
 * @param {string} userRole - The user's role
 * @param {string} operation - The operation being performed ('edit', 'delete')
 * @param {string} userId - The current user's ID (required for delete operations)
 * @throws {Error} - Throws error if user doesn't have permission
 */
export const validateExercisePermission = (exercise, userRole, operation = 'edit', userId = null) => {
  if (operation === 'edit' && !exercisePermissions.canEdit(exercise, userRole)) {
    if (exercise.is_global) {
      throw new Error('You don\'t have permission to edit global exercises. Only administrators can modify global exercises.')
    }
    throw new Error('You don\'t have permission to edit this exercise.')
  }
  
  if (operation === 'delete' && !exercisePermissions.canDelete(exercise, userRole, userId)) {
    if (exercise.is_global) {
      throw new Error('You don\'t have permission to delete global exercises. Only administrators can delete global exercises.')
    }
    throw new Error('You don\'t have permission to delete this exercise.')
  }
}

/**
 * Check if a user can perform an operation on an exercise
 * @param {Object} exercise - The exercise object
 * @param {string} userRole - The user's role
 * @param {string} userId - The user's ID (for ownership checks)
 * @param {string} operation - The operation to check ('edit', 'delete')
 * @returns {boolean} - True if the user can perform the operation
 */
export const canUserPerformExerciseOperation = (exercise, userRole, userId, operation = 'edit') => {
  try {
    if (operation === 'edit') {
      return exercisePermissions.canEdit(exercise, userRole)
    }
    if (operation === 'delete') {
      return exercisePermissions.canDelete(exercise, userRole, userId)
    }
    return false
  } catch (error) {
    return false
  }
}

/**
 * Exercise Service for Supabase exercise operations
 * Handles CRUD operations for exercises with proper filtering and search
 * Enhanced with caching for improved performance
 */

// Cache TTL constants
const EXERCISE_CACHE_TTL = 60 * 60 * 1000 // 1 hour (exercises change infrequently)
const EXERCISE_SEARCH_CACHE_TTL = 30 * 60 * 1000 // 30 minutes
const MUSCLE_GROUPS_CACHE_TTL = 2 * 60 * 60 * 1000 // 2 hours

/**
 * Get all exercises with optional filtering
 */
export const getExercises = async (filters = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('exercises')
      .select('*')
      .order('name')

    // Apply filters
    if (filters.muscleGroup) {
      query = query.eq('primary_muscle_group', filters.muscleGroup)
    }

    if (filters.exerciseType) {
      query = query.eq('exercise_type', filters.exerciseType)
    }

    if (filters.isGlobal !== undefined) {
      query = query.eq('is_global', filters.isGlobal)
    }

    if (filters.createdBy) {
      query = query.eq('created_by', filters.createdBy)
    }

    if (filters.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'getExercises')
}

/**
 * Search exercises by name with fuzzy matching
 */
export const searchExercises = async (searchTerm, filters = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('exercises')
      .select('*')
      .ilike('name', `%${searchTerm}%`)
      .order('name')

    // Apply additional filters
    if (filters.muscleGroup) {
      query = query.eq('primary_muscle_group', filters.muscleGroup)
    }

    if (filters.exerciseType) {
      query = query.eq('exercise_type', filters.exerciseType)
    }

    if (filters.isGlobal !== undefined) {
      query = query.eq('is_global', filters.isGlobal)
    }

    if (filters.createdBy) {
      query = query.eq('created_by', filters.createdBy)
    }

    const limit = filters.limit || 50
    query = query.limit(limit)

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'searchExercises')
}

/**
 * Get exercise by ID
 */
export const getExerciseById = async (exerciseId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .eq('id', exerciseId)
      .single()

    if (error) throw error
    return data
  }, 'getExerciseById')
}

/**
 * Get exercises by muscle group
 */
export const getExercisesByMuscleGroup = async (muscleGroup, options = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('exercises')
      .select('*')
      .eq('primary_muscle_group', muscleGroup)
      .order('name')

    // RLS policy will automatically filter based on user permissions
    // No need to manually add OR conditions

    if (options.exerciseType) {
      query = query.eq('exercise_type', options.exerciseType)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'getExercisesByMuscleGroup')
}

/**
 * Get exercises by type
 */
export const getExercisesByType = async (exerciseType, options = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('exercises')
      .select('*')
      .eq('exercise_type', exerciseType)
      .order('name')

    // RLS policy will automatically filter based on user permissions
    // No need to manually add OR conditions

    if (options.muscleGroup) {
      query = query.eq('primary_muscle_group', options.muscleGroup)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'getExercisesByType')
}

/**
 * Get user's custom exercises
 */
export const getUserExercises = async (userId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }, 'getUserExercises')
}

/**
 * Get available exercises for user (global + user-created) with caching
 */
export const getAvailableExercises = async (userId, filters = {}) => {
  return executeSupabaseOperation(async () => {
    // Create cache key based on user ID and filters
    const filterKey = Object.keys(filters).sort().map(key => `${key}:${filters[key]}`).join('_')
    const cacheKey = `available_exercises_${userId || 'anonymous'}_${filterKey}`
    
    return supabaseCache.getWithCache(
      cacheKey,
      async () => {
        let query = supabase
          .from('exercises')
          .select('*')
          .order('name')

        // Apply filters
        if (filters.muscleGroup) {
          query = query.eq('primary_muscle_group', filters.muscleGroup)
        }

        if (filters.exerciseType) {
          query = query.eq('exercise_type', filters.exerciseType)
        }

        if (filters.search) {
          query = query.ilike('name', `%${filters.search}%`)
        }

        // Return the full Supabase result object with data and error properties
        return await query
      },
      { ttl: EXERCISE_CACHE_TTL, table: 'exercises', userId }
    )
  }, 'getAvailableExercises')
}

/**
 * Create a new exercise
 */
export const createExercise = async (exerciseData) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('exercises')
      .insert([exerciseData])
      .select()
      .single()

    if (error) throw error
    supabaseCache.invalidateExerciseCache()

    console.log('Exercise created:', data.name)
    return data
  }, 'createExercise')
}

/**
 * Update an exercise with permission validation
 * @param {string} exerciseId - The ID of the exercise to update
 * @param {Object} updates - The updates to apply
 * @param {string} userRole - The current user's role (optional, for client-side validation)
 */
export const updateExercise = async (exerciseId, updates, userRole = null) => {
  return executeSupabaseOperation(async () => {
    // If userRole is provided, perform client-side validation
    if (userRole) {
      try {
        // First, get the current exercise to check permissions
        const { data: currentExercise, error: fetchError } = await supabase
          .from('exercises')
          .select('id, name, is_global, created_by')
          .eq('id', exerciseId)
          .single()

        if (fetchError) throw fetchError

        // Validate permissions before attempting update
        validateExercisePermission(currentExercise, userRole, 'edit')
      } catch (permissionError) {
        // Re-throw permission errors with user-friendly messages
        throw permissionError
      }
    }

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('exercises')
      .update(updateData)
      .eq('id', exerciseId)
      .select()
      .single()

    if (error) {
      // Check if this is a permission error from RLS policy
      if (error.code === '42501' || error.message?.includes('insufficient privileges')) {
        throw new Error('You don\'t have permission to edit global exercises. Only administrators can modify global exercises.')
      }
      throw error
    }
    supabaseCache.invalidateExerciseCache()

    console.log('Exercise updated:', data.name)
    return data
  }, 'updateExercise')
}

/**
 * Delete an exercise with permission validation
 * @param {string} exerciseId - The ID of the exercise to delete
 * @param {string} userRole - The current user's role (optional, for client-side validation)
 * @param {string} userId - The current user's ID (optional, for client-side validation)
 */
export const deleteExercise = async (exerciseId, userRole = null, userId = null) => {
  return executeSupabaseOperation(async () => {
    // If userRole and userId are provided, perform client-side validation
    if (userRole && userId) {
      try {
        // First, get the current exercise to check permissions
        const { data: currentExercise, error: fetchError } = await supabase
          .from('exercises')
          .select('id, name, is_global, created_by')
          .eq('id', exerciseId)
          .single()

        if (fetchError) throw fetchError

        // Validate permissions before attempting delete
        validateExercisePermission(currentExercise, userRole, 'delete', userId)
      } catch (permissionError) {
        // Re-throw permission errors with user-friendly messages
        throw permissionError
      }
    }

    const { error } = await supabase
      .from('exercises')
      .delete()
      .eq('id', exerciseId)

    if (error) {
      // Check if this is a permission error from RLS policy
      if (error.code === '42501' || error.message?.includes('insufficient privileges')) {
        throw new Error('You don\'t have permission to delete global exercises. Only administrators can delete global exercises.')
      }
      throw error
    }
    supabaseCache.invalidateExerciseCache()

    console.log('Exercise deleted:', exerciseId)
    return true
  }, 'deleteExercise')
}

/**
 * Get exercise usage statistics
 */
export const getExerciseUsageStats = async (exerciseId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('exercise_usage_stats')
      .select('*')
      .eq('id', exerciseId)
      .single()

    if (error) throw error
    return data
  }, 'getExerciseUsageStats')
}

/**
 * Get popular exercises (most used in programs)
 */
export const getPopularExercises = async (limit = 20) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('exercise_usage_stats')
      .select('*')
      .order('program_usage_count', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  }, 'getPopularExercises')
}

/**
 * Get exercises with their usage in programs and workout logs
 */
export const getExercisesWithUsage = async (userId, filters = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('exercises')
      .select(`
        *,
        program_exercises!inner (
          id,
          workout_id,
          program_workouts!inner (
            program_id,
            programs!inner (
              user_id
            )
          )
        )
      `)
      .eq('program_exercises.program_workouts.programs.user_id', userId)

    // Apply filters
    if (filters.muscleGroup) {
      query = query.eq('primary_muscle_group', filters.muscleGroup)
    }

    if (filters.exerciseType) {
      query = query.eq('exercise_type', filters.exerciseType)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'getExercisesWithUsage')
}

/**
 * Get distinct muscle groups (with caching)
 */
export const getMuscleGroups = async () => {
  return executeSupabaseOperation(async () => {
    const cacheKey = 'muscle_groups_global'
    
    return supabaseCache.getWithCache(
      cacheKey,
      async () => {
        const { data, error } = await supabase
          .from('exercises')
          .select('primary_muscle_group')
          .eq('is_global', true)
          .order('primary_muscle_group')

        if (error) throw error

        // Extract unique muscle groups
        const uniqueMuscleGroups = [...new Set(data.map(item => item.primary_muscle_group))]
        return uniqueMuscleGroups
      },
      { ttl: MUSCLE_GROUPS_CACHE_TTL }
    )
  }, 'getMuscleGroups')
}

/**
 * Get distinct exercise types
 */
export const getExerciseTypes = async () => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('exercise_type')
      .eq('is_global', true)
      .order('exercise_type')

    if (error) throw error

    // Extract unique exercise types
    const uniqueExerciseTypes = [...new Set(data.map(item => item.exercise_type))]
    return uniqueExerciseTypes
  }, 'getExerciseTypes')
}

/**
 * Bulk create exercises
 */
export const bulkCreateExercises = async (exercisesData) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('exercises')
      .insert(exercisesData)
      .select()

    if (error) throw error
    supabaseCache.invalidateExerciseCache()

    console.log(`${data.length} exercises created`)
    return data
  }, 'bulkCreateExercises')
}

/**
 * Check if exercise name exists for user
 */
export const checkExerciseNameExists = async (name, userId = null, excludeId = null) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('exercises')
      .select('id, name')
      .ilike('name', name)

    // RLS policy will automatically filter based on user permissions
    // No need to manually add OR conditions

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data, error } = await query

    if (error) throw error
    return data && data.length > 0
  }, 'checkExerciseNameExists')
}