/**
 * Enhanced Authentication Hook
 * 
 * This hook provides a comprehensive authentication interface that integrates
 * with the AuthContext and provides additional utilities for authentication management.
 */

import { useContext } from 'react'
import { AuthContext } from '../context/AuthContext'

/**
 * Main authentication hook
 * Provides access to authentication state and methods
 */
export function useAuth() {
  const context = useContext(AuthContext)
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  
  return context
}

/**
 * Hook for authentication state only
 * Useful when you only need to check authentication status
 */
export function useAuthState() {
  const { user, userProfile, isAuthenticated, loading, error } = useAuth()
  
  return {
    user,
    userProfile,
    isAuthenticated,
    loading,
    error
  }
}

/**
 * Hook for authentication methods only
 * Useful when you only need authentication actions
 */
export function useAuthActions() {
  const {
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
    updateEmail,
    updateProfile,
    refreshProfile,
    createProfile,
    updatePreferences,
    updateSettings,
    clearError
  } = useAuth()
  
  return {
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
    updateEmail,
    updateProfile,
    refreshProfile,
    createProfile,
    updatePreferences,
    updateSettings,
    clearError
  }
}

/**
 * Hook for user profile management
 * Provides profile-specific state and methods
 */
export function useUserProfile() {
  const {
    userProfile,
    hasCompleteProfile,
    isProfileLoading,
    updateProfile,
    refreshProfile,
    createProfile,
    updatePreferences,
    updateSettings
  } = useAuth()
  
  return {
    profile: userProfile,
    hasCompleteProfile,
    loading: isProfileLoading,
    updateProfile,
    refreshProfile,
    createProfile,
    updatePreferences,
    updateSettings
  }
}

/**
 * Hook for session management
 * Provides session-related utilities
 */
export function useSession() {
  const { session, user, isAuthenticated } = useAuth()
  
  const getAccessToken = () => session?.access_token
  const getRefreshToken = () => session?.refresh_token
  const getExpiresAt = () => session?.expires_at ? new Date(session.expires_at * 1000) : null
  const isExpired = () => {
    const expiresAt = getExpiresAt()
    return expiresAt ? expiresAt <= new Date() : true
  }
  
  return {
    session,
    user,
    isAuthenticated,
    getAccessToken,
    getRefreshToken,
    getExpiresAt,
    isExpired
  }
}

/**
 * Hook for authentication error handling
 * Provides error state and utilities
 */
export function useAuthError() {
  const { error, clearError } = useAuth()
  
  const hasError = !!error
  const errorMessage = error?.message || null
  const errorCode = error?.code || null
  
  return {
    error,
    hasError,
    errorMessage,
    errorCode,
    clearError
  }
}

/**
 * Hook for role-based access control
 * Provides role checking utilities
 */
export function useRoles() {
  const { userProfile, user } = useAuth()
  
  const getUserRoles = () => {
    // Get roles from userProfile (database) first, fallback to auth metadata
    if (userProfile?.roles && Array.isArray(userProfile.roles)) {
      return userProfile.roles
    }
    
    // Fallback to auth metadata (for backwards compatibility)
    const metadataRole = user?.user_metadata?.role
    if (metadataRole) {
      return [metadataRole]
    }
    
    // Default role
    return ['user']
  }
  
  const getUserRole = () => {
    const roles = getUserRoles()
    
    // Priority order for primary role: admin > coach > moderator > user
    if (roles.includes('admin')) return 'admin'
    if (roles.includes('coach')) return 'coach'
    if (roles.includes('moderator')) return 'moderator'
    
    // Return first role or default to 'user'
    return roles[0] || 'user'
  }
  
  const hasRole = (role) => {
    const roles = getUserRoles()
    return roles.includes(role)
  }
  
  const hasAnyRole = (rolesToCheck) => {
    const userRoles = getUserRoles()
    return rolesToCheck.some(role => userRoles.includes(role))
  }
  
  const hasAllRoles = (rolesToCheck) => {
    const userRoles = getUserRoles()
    return rolesToCheck.every(role => userRoles.includes(role))
  }
  
  const isAdmin = () => hasRole('admin')
  const isModerator = () => hasRole('moderator')
  const isCoach = () => hasRole('coach')
  const isUser = () => hasRole('user')
  
  return {
    userRole: getUserRole(),
    userRoles: getUserRoles(),
    hasRole,
    hasAnyRole,
    hasAllRoles,
    isAdmin,
    isModerator,
    isCoach,
    isUser
  }
}

/**
 * Hook for authentication loading states
 * Provides granular loading state information
 */
export function useAuthLoading() {
  const { loading, isProfileLoading } = useAuth()
  
  return {
    isAuthLoading: loading,
    isProfileLoading,
    isLoading: loading || isProfileLoading
  }
}

/**
 * Hook for authentication status checks
 * Provides boolean checks for various authentication states
 */
export function useAuthStatus() {
  const { 
    isAuthenticated, 
    hasCompleteProfile, 
    user,
    userProfile,
    loading 
  } = useAuth()
  
  const isEmailVerified = !!user?.email_confirmed_at
  const hasProfile = !!userProfile
  const needsProfileSetup = isAuthenticated && !hasCompleteProfile
  const isReady = isAuthenticated && hasCompleteProfile && !loading
  
  return {
    isAuthenticated,
    isEmailVerified,
    hasProfile,
    hasCompleteProfile,
    needsProfileSetup,
    isReady,
    loading
  }
}

// Export all hooks as default
export default {
  useAuth,
  useAuthState,
  useAuthActions,
  useUserProfile,
  useSession,
  useAuthError,
  useRoles,
  useAuthLoading,
  useAuthStatus
}