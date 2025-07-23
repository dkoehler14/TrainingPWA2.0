import { supabase } from '../config/supabase'
import { handleSupabaseError } from '../utils/supabaseErrorHandler'

/**
 * User Service for Supabase user profile operations
 * Handles CRUD operations for user profiles and related data
 */

/**
 * Import validation utilities
 */
import { validateUserProfile } from '../utils/userValidation'



/**
 * Create a new user profile
 */
export const createUserProfile = async (authUser, additionalData = {}) => {
  try {
    const userData = {
      auth_id: authUser.id,
      email: authUser.email,
      name: additionalData.name || authUser.user_metadata?.name || '',
      experience_level: additionalData.experienceLevel || 'beginner',
      preferred_units: additionalData.preferredUnits || 'LB',
      age: additionalData.age || null,
      weight: additionalData.weight || null,
      height: additionalData.height || null,
      goals: additionalData.goals || [],
      available_equipment: additionalData.availableEquipment || [],
      injuries: additionalData.injuries || [],
      preferences: additionalData.preferences || {},
      settings: additionalData.settings || {}
    }

    // Validate user data - create validation object with proper field mapping
    const validationData = {
      email: userData.email,
      name: userData.name,
      experienceLevel: userData.experience_level,
      preferredUnits: userData.preferred_units,
      age: userData.age,
      weight: userData.weight,
      height: userData.height,
      goals: userData.goals,
      availableEquipment: userData.available_equipment,
      injuries: userData.injuries
    }

    const validation = validateUserProfile(validationData)
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${Object.values(validation.errors).join(', ')}`)
    }

    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single()

    if (error) throw error

    console.log('User profile created:', data.email)
    return data
  } catch (error) {
    console.error('Error creating user profile:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Get user profile by auth ID
 */
export const getUserProfile = async (authId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .single()

    if (error) {
      // If user doesn't exist, return null instead of throwing error
      if (error.code === 'PGRST116') {
        return null
      }
      throw error
    }

    return data
  } catch (error) {
    console.error('Error getting user profile:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Get user profile by user ID
 */
export const getUserProfileById = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error getting user profile by ID:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Update user profile
 */
export const updateUserProfile = async (userId, updates) => {
  try {
    // Create validation object with proper field mapping for updates
    const validationData = {}
    
    // Map database fields to validation fields
    if (updates.email !== undefined) validationData.email = updates.email
    if (updates.name !== undefined) validationData.name = updates.name
    if (updates.experience_level !== undefined) validationData.experienceLevel = updates.experience_level
    if (updates.preferred_units !== undefined) validationData.preferredUnits = updates.preferred_units
    if (updates.age !== undefined) validationData.age = updates.age
    if (updates.weight !== undefined) validationData.weight = updates.weight
    if (updates.height !== undefined) validationData.height = updates.height
    if (updates.goals !== undefined) validationData.goals = updates.goals
    if (updates.available_equipment !== undefined) validationData.availableEquipment = updates.available_equipment
    if (updates.injuries !== undefined) validationData.injuries = updates.injuries

    // Validate updates only if there are fields to validate
    if (Object.keys(validationData).length > 0) {
      const validation = validateUserProfile(validationData)
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${Object.values(validation.errors).join(', ')}`)
      }
    }

    // Add updated_at timestamp
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error

    console.log('User profile updated:', data.email)
    return data
  } catch (error) {
    console.error('Error updating user profile:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Update user profile by auth ID
 */
export const updateUserProfileByAuthId = async (authId, updates) => {
  try {
    // Create validation object with proper field mapping for updates
    const validationData = {}
    
    // Map database fields to validation fields
    if (updates.email !== undefined) validationData.email = updates.email
    if (updates.name !== undefined) validationData.name = updates.name
    if (updates.experience_level !== undefined) validationData.experienceLevel = updates.experience_level
    if (updates.preferred_units !== undefined) validationData.preferredUnits = updates.preferred_units
    if (updates.age !== undefined) validationData.age = updates.age
    if (updates.weight !== undefined) validationData.weight = updates.weight
    if (updates.height !== undefined) validationData.height = updates.height
    if (updates.goals !== undefined) validationData.goals = updates.goals
    if (updates.available_equipment !== undefined) validationData.availableEquipment = updates.available_equipment
    if (updates.injuries !== undefined) validationData.injuries = updates.injuries

    // Validate updates only if there are fields to validate
    if (Object.keys(validationData).length > 0) {
      const validation = validateUserProfile(validationData)
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${Object.values(validation.errors).join(', ')}`)
      }
    }

    // Add updated_at timestamp
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('auth_id', authId)
      .select()
      .single()

    if (error) throw error

    console.log('User profile updated:', data.email)
    return data
  } catch (error) {
    console.error('Error updating user profile by auth ID:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Delete user profile
 */
export const deleteUserProfile = async (userId) => {
  try {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)

    if (error) throw error

    console.log('User profile deleted:', userId)
    return true
  } catch (error) {
    console.error('Error deleting user profile:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Get or create user profile
 * This is useful for handling the case where a user signs up but doesn't have a profile yet
 */
export const getOrCreateUserProfile = async (authUser, additionalData = {}) => {
  try {
    // First try to get existing profile
    let profile = await getUserProfile(authUser.id)
    
    if (!profile) {
      // If no profile exists, create one
      profile = await createUserProfile(authUser, additionalData)
    }

    return profile
  } catch (error) {
    console.error('Error getting or creating user profile:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Update user preferences
 */
export const updateUserPreferences = async (userId, preferences) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        preferences,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error updating user preferences:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Update user settings
 */
export const updateUserSettings = async (userId, settings) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        settings,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error updating user settings:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Get user analytics summary
 */
export const getUserAnalyticsSummary = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('user_analytics')
      .select(`
        *,
        exercises (
          name,
          primary_muscle_group,
          exercise_type
        )
      `)
      .eq('user_id', userId)
      .order('total_volume', { ascending: false })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error getting user analytics summary:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Search users (admin function)
 */
export const searchUsers = async (searchTerm, limit = 50) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, created_at, experience_level')
      .or(`email.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error searching users:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Get user statistics
 */
export const getUserStatistics = async (userId) => {
  try {
    // Get workout count
    const { data: workoutCount, error: workoutError } = await supabase
      .from('workout_logs')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_finished', true)

    if (workoutError) throw workoutError

    // Get program count
    const { data: programCount, error: programError } = await supabase
      .from('programs')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)

    if (programError) throw programError

    // Get total volume from analytics
    const { data: analytics, error: analyticsError } = await supabase
      .from('user_analytics')
      .select('total_volume')
      .eq('user_id', userId)

    if (analyticsError) throw analyticsError

    const totalVolume = analytics?.reduce((sum, record) => sum + (record.total_volume || 0), 0) || 0

    return {
      totalWorkouts: workoutCount?.length || 0,
      totalPrograms: programCount?.length || 0,
      totalVolume: totalVolume
    }
  } catch (error) {
    console.error('Error getting user statistics:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Check if user exists by email
 */
export const checkUserExists = async (email) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', email)
      .single()

    if (error) {
      // If user doesn't exist, return false
      if (error.code === 'PGRST116') {
        return false
      }
      throw error
    }

    return !!data
  } catch (error) {
    console.error('Error checking if user exists:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Get user profile with related data
 */
export const getUserProfileWithRelations = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(`
        *,
        programs!programs_user_id_fkey (
          id,
          name,
          is_current,
          is_active
        ),
        user_analytics!user_analytics_user_id_fkey (
          exercise_id,
          total_volume,
          max_weight,
          exercises (
            name,
            primary_muscle_group
          )
        )
      `)
      .eq('id', userId)
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error getting user profile with relations:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Update user last login timestamp
 */
export const updateUserLastLogin = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error
    return data
  } catch (error) {
    console.error('Error updating user last login:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Soft delete user profile (mark as inactive instead of hard delete)
 */
export const deactivateUserProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        is_active: false,
        deactivated_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error

    console.log('User profile deactivated:', userId)
    return data
  } catch (error) {
    console.error('Error deactivating user profile:', error)
    throw handleSupabaseError(error)
  }
}

/**
 * Reactivate user profile
 */
export const reactivateUserProfile = async (userId) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ 
        is_active: true,
        deactivated_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error

    console.log('User profile reactivated:', userId)
    return data
  } catch (error) {
    console.error('Error reactivating user profile:', error)
    throw handleSupabaseError(error)
  }
}