import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'

/**
 * Permission Service for coach-client data access validation
 * Handles permission checking, relationship verification, and access control
 */

/**
 * Custom error classes for permission-related errors
 */
export class PermissionDeniedError extends Error {
  constructor(action, reason = '') {
    super(`Permission denied for action: ${action}${reason ? ` (${reason})` : ''}`)
    this.name = 'PermissionDeniedError'
    this.action = action
    this.reason = reason
  }
}

export class RelationshipNotFoundError extends Error {
  constructor(coachId, clientId) {
    super(`No active coaching relationship found between coach ${coachId} and client ${clientId}`)
    this.name = 'RelationshipNotFoundError'
    this.coachId = coachId
    this.clientId = clientId
  }
}

/**
 * Coach Permission Checking
 */

/**
 * Check if a coach can access specific client data
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {string} dataType - Type of data to access ('workouts', 'progress', 'analytics', 'programs')
 * @returns {Promise<boolean>} True if access is allowed
 */
export const canAccessClientData = async (coachId, clientId, dataType) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .rpc('coach_can_access_client_data', {
        coach_user_id: coachId,
        client_user_id: clientId,
        data_type: dataType
      })

    if (error) {
      console.error('Permission check failed:', error)
      return false
    }

    return data === true
  })
}

/**
 * Verify coach has permission and throw error if not
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {string} dataType - Type of data to access
 * @param {string} action - Action being performed (for error message)
 * @throws {PermissionDeniedError} If permission is denied
 */
export const requireClientDataAccess = async (coachId, clientId, dataType, action) => {
  const hasAccess = await canAccessClientData(coachId, clientId, dataType)
  
  if (!hasAccess) {
    throw new PermissionDeniedError(action, `Cannot access client ${dataType} data`)
  }
}

/**
 * Check if user has coach role
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user has coach role
 */
export const hasCoachRole = async (userId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('users')
      .select('roles')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return false // User not found
      }
      throw handleSupabaseError(error, 'hasCoachRole')
    }

    return data?.roles?.includes('coach') || false
  })
}

/**
 * Check if user has admin role
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user has admin role
 */
export const hasAdminRole = async (userId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('users')
      .select('roles')
      .eq('id', userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return false // User not found
      }
      throw handleSupabaseError(error, 'hasAdminRole')
    }

    return data?.roles?.includes('admin') || false
  })
}

/**
 * Require coach role and throw error if not present
 * @param {string} userId - User ID to check
 * @param {string} action - Action being performed (for error message)
 * @throws {PermissionDeniedError} If user doesn't have coach role
 */
export const requireCoachRole = async (userId, action) => {
  const isCoach = await hasCoachRole(userId)
  
  if (!isCoach) {
    throw new PermissionDeniedError(action, 'Coach role required')
  }
}

/**
 * Require admin role and throw error if not present
 * @param {string} userId - User ID to check
 * @param {string} action - Action being performed (for error message)
 * @throws {PermissionDeniedError} If user doesn't have admin role
 */
export const requireAdminRole = async (userId, action) => {
  const isAdmin = await hasAdminRole(userId)
  
  if (!isAdmin) {
    throw new PermissionDeniedError(action, 'Admin role required')
  }
}

/**
 * Relationship Status Verification
 */

/**
 * Get coaching relationship between coach and client
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<Object|null>} Relationship object or null if not found
 */
export const getCoachClientRelationship = async (coachId, clientId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coach_client_relationships')
      .select('*')
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw handleSupabaseError(error, 'getCoachClientRelationship')
    }

    return data
  })
}

/**
 * Check if an active coaching relationship exists
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<boolean>} True if active relationship exists
 */
export const hasActiveRelationship = async (coachId, clientId) => {
  const relationship = await getCoachClientRelationship(coachId, clientId)
  return relationship && relationship.status === 'active'
}

/**
 * Require active coaching relationship and throw error if not present
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {string} action - Action being performed (for error message)
 * @throws {RelationshipNotFoundError} If no active relationship exists
 */
export const requireActiveRelationship = async (coachId, clientId, action) => {
  const hasRelationship = await hasActiveRelationship(coachId, clientId)
  
  if (!hasRelationship) {
    throw new RelationshipNotFoundError(coachId, clientId)
  }
}

/**
 * Check if user is client of a specific coach
 * @param {string} userId - User ID to check
 * @param {string} coachId - Coach user ID
 * @returns {Promise<boolean>} True if user is client of the coach
 */
export const isClientOfCoach = async (userId, coachId) => {
  return await hasActiveRelationship(coachId, userId)
}

/**
 * Get all coaches for a client
 * @param {string} clientId - Client user ID
 * @returns {Promise<Array>} Array of coach relationships
 */
export const getClientCoaches = async (clientId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coach_client_relationships')
      .select(`
        *,
        coach:users!coach_id(
          id,
          name,
          email
        )
      `)
      .eq('client_id', clientId)
      .eq('status', 'active')

    if (error) {
      throw handleSupabaseError(error, 'getClientCoaches')
    }

    return data || []
  })
}

/**
 * Data Access Validation
 */

/**
 * Check if coach can view client's workout logs
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<boolean>} True if access is allowed
 */
export const canViewWorkouts = async (coachId, clientId) => {
  return await canAccessClientData(coachId, clientId, 'workouts')
}

/**
 * Check if coach can view client's progress data
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<boolean>} True if access is allowed
 */
export const canViewProgress = async (coachId, clientId) => {
  return await canAccessClientData(coachId, clientId, 'progress')
}

/**
 * Check if coach can view client's analytics
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<boolean>} True if access is allowed
 */
export const canViewAnalytics = async (coachId, clientId) => {
  return await canAccessClientData(coachId, clientId, 'analytics')
}

/**
 * Check if coach can view/modify client's programs
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<boolean>} True if access is allowed
 */
export const canAccessPrograms = async (coachId, clientId) => {
  return await canAccessClientData(coachId, clientId, 'programs')
}

/**
 * Comprehensive permission check for multiple data types
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {Array<string>} dataTypes - Array of data types to check
 * @returns {Promise<Object>} Object with permission results for each data type
 */
export const checkMultiplePermissions = async (coachId, clientId, dataTypes) => {
  const permissions = {}
  
  for (const dataType of dataTypes) {
    try {
      permissions[dataType] = await canAccessClientData(coachId, clientId, dataType)
    } catch (error) {
      console.error(`Failed to check permission for ${dataType}:`, error)
      permissions[dataType] = false
    }
  }
  
  return permissions
}

/**
 * Utility Functions
 */

/**
 * Check if current user can perform admin actions
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user can perform admin actions
 */
export const canPerformAdminActions = async (userId) => {
  return await hasAdminRole(userId)
}

/**
 * Check if current user can manage coaches (promote/demote)
 * @param {string} userId - User ID to check
 * @returns {Promise<boolean>} True if user can manage coaches
 */
export const canManageCoaches = async (userId) => {
  return await hasAdminRole(userId)
}

/**
 * Get user's effective permissions for a client
 * @param {string} userId - User ID (could be coach, admin, or the client themselves)
 * @param {string} clientId - Client user ID
 * @returns {Promise<Object>} Object with all relevant permissions
 */
export const getUserClientPermissions = async (userId, clientId) => {
  const permissions = {
    isOwner: userId === clientId,
    isAdmin: false,
    isCoach: false,
    canViewWorkouts: false,
    canViewProgress: false,
    canViewAnalytics: false,
    canAccessPrograms: false,
    hasActiveRelationship: false
  }

  try {
    // Check if user is admin
    permissions.isAdmin = await hasAdminRole(userId)
    
    // If admin or owner, grant all permissions
    if (permissions.isAdmin || permissions.isOwner) {
      permissions.canViewWorkouts = true
      permissions.canViewProgress = true
      permissions.canViewAnalytics = true
      permissions.canAccessPrograms = true
      return permissions
    }

    // Check if user is a coach with relationship to this client
    permissions.isCoach = await hasCoachRole(userId)
    
    if (permissions.isCoach) {
      permissions.hasActiveRelationship = await hasActiveRelationship(userId, clientId)
      
      if (permissions.hasActiveRelationship) {
        const dataPermissions = await checkMultiplePermissions(userId, clientId, [
          'workouts', 'progress', 'analytics', 'programs'
        ])
        
        permissions.canViewWorkouts = dataPermissions.workouts
        permissions.canViewProgress = dataPermissions.progress
        permissions.canViewAnalytics = dataPermissions.analytics
        permissions.canAccessPrograms = dataPermissions.programs
      }
    }

    return permissions
  } catch (error) {
    console.error('Failed to get user client permissions:', error)
    return permissions
  }
}

/**
 * Validate invitation permissions
 * @param {string} coachId - Coach user ID
 * @param {string} targetUserId - Target user ID (optional)
 * @returns {Promise<boolean>} True if coach can send invitation
 */
export const canSendInvitation = async (coachId, targetUserId = null) => {
  try {
    // Must be a coach
    const isCoach = await hasCoachRole(coachId)
    if (!isCoach) {
      return false
    }

    // If targeting specific user, check if relationship already exists
    if (targetUserId) {
      const existingRelationship = await getCoachClientRelationship(coachId, targetUserId)
      if (existingRelationship && existingRelationship.status !== 'terminated') {
        return false // Relationship already exists or is pending
      }
    }

    return true
  } catch (error) {
    console.error('Failed to validate invitation permissions:', error)
    return false
  }
}