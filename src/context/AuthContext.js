import React, { createContext, useEffect, useState, useCallback } from 'react'
import { useSupabaseAuth } from '../hooks/useSupabaseAuth'
import { 
  getUserProfile, 
  createUserProfile, 
  updateUserProfile 
} from '../services/userService'
import { handleSupabaseError } from '../utils/supabaseErrorHandler'
import { authService } from '../services/authService'
import { initializeAuthConfig, authEventHandler } from '../config/supabaseAuth'

/**
 * Authentication Context for Supabase
 * Provides comprehensive user authentication state and profile management
 */
export const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
  const {
    user: authUser,
    session,
    loading: authLoading,
    signUp: supabaseSignUp,
    signIn: supabaseSignIn,
    signInWithGoogle: supabaseSignInWithGoogle,
    signOut: supabaseSignOut,
    resetPassword: supabaseResetPassword,
    updatePassword: supabaseUpdatePassword,
    updateEmail: supabaseUpdateEmail,
    signInWithMagicLink,
    verifyOtp
  } = useSupabaseAuth()

  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize authentication system
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        console.log('🔐 Initializing authentication system...')
        
        // Initialize auth configuration
        await initializeAuthConfig()
        
        // Initialize auth service
        await authService.initialize()
        
        setIsInitialized(true)
        console.log('✅ Authentication system initialized')
      } catch (error) {
        console.error('❌ Failed to initialize authentication system:', error)
        setError(handleSupabaseError(error))
      }
    }

    initializeAuth()
  }, [])

  // Set up auth event listeners
  useEffect(() => {
    if (!isInitialized) return

    const handleSignedIn = ({ user, session }) => {
      console.log('🔐 User signed in event received')
      loadUserProfile(user)
    }

    const handleSignedOut = () => {
      console.log('🔐 User signed out event received')
      setUserProfile(null)
      setError(null)
    }

    const handleUserUpdated = ({ user }) => {
      console.log('🔐 User updated event received')
      if (user) {
        loadUserProfile(user)
      }
    }

    // Subscribe to auth events
    authEventHandler.on('signedIn', handleSignedIn)
    authEventHandler.on('signedOut', handleSignedOut)
    authEventHandler.on('userUpdated', handleUserUpdated)

    return () => {
      authEventHandler.off('signedIn', handleSignedIn)
      authEventHandler.off('signedOut', handleSignedOut)
      authEventHandler.off('userUpdated', handleUserUpdated)
    }
  }, [isInitialized])

  // Load user profile when auth user changes
  const loadUserProfile = useCallback(async (user = authUser) => {
    if (!user) {
      setUserProfile(null)
      return
    }

    setProfileLoading(true)
    setError(null)

    try {
      const profile = await getUserProfile(user.id)
      setUserProfile(profile)
    } catch (error) {
      console.error('Error loading user profile:', error)
      setError(handleSupabaseError(error))
    } finally {
      setProfileLoading(false)
    }
  }, [authUser])

  // Load profile when auth user changes
  useEffect(() => {
    if (isInitialized) {
      loadUserProfile()
    }
  }, [authUser, isInitialized, loadUserProfile])

  // Enhanced sign up with profile creation
  const signUpWithProfile = async (email, password, profileData = {}) => {
    try {
      setError(null)
      const result = await supabaseSignUp(email, password, profileData)
      
      if (result.user && !result.needsConfirmation) {
        // Create user profile for immediately confirmed users
        const profile = await createUserProfile(result.user, profileData)
        setUserProfile(profile)
        return { ...result, profile }
      }
      
      return result
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Enhanced sign in with profile loading
  const signInWithProfile = async (email, password) => {
    try {
      setError(null)
      const result = await supabaseSignIn(email, password)
      
      if (result.user) {
        // Profile will be loaded by the auth event handler
        return result
      }
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Enhanced Google sign in with profile handling
  const signInWithGoogleAndProfile = async () => {
    try {
      setError(null)
      const result = await supabaseSignInWithGoogle()
      
      // Profile will be loaded by the auth event handler
      return result
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Enhanced magic link sign in
  const signInWithMagicLinkAndProfile = async (email) => {
    try {
      setError(null)
      const result = await signInWithMagicLink(email)
      return result
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Update user profile
  const updateProfile = async (updates) => {
    if (!userProfile) {
      throw new Error('No user profile loaded')
    }

    try {
      setError(null)
      const updatedProfile = await updateUserProfile(userProfile.id, updates)
      setUserProfile(updatedProfile)
      return updatedProfile
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Enhanced sign out
  const signOutUser = async () => {
    try {
      setError(null)
      await supabaseSignOut()
      // Profile cleanup is handled by auth event handler
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Reset password with error handling
  const resetUserPassword = async (email) => {
    try {
      setError(null)
      const result = await supabaseResetPassword(email)
      return result
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Update password with error handling
  const updateUserPassword = async (newPassword) => {
    try {
      setError(null)
      await supabaseUpdatePassword(newPassword)
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Update email with error handling
  const updateUserEmail = async (newEmail) => {
    try {
      setError(null)
      await supabaseUpdateEmail(newEmail)
      
      // Update profile email if successful
      if (userProfile) {
        const updatedProfile = await updateUserProfile(userProfile.id, { email: newEmail })
        setUserProfile(updatedProfile)
      }
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Verify OTP with error handling
  const verifyOtpCode = async (email, token, type = 'email') => {
    try {
      setError(null)
      const result = await verifyOtp(email, token, type)
      return result
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Refresh user profile
  const refreshProfile = async () => {
    if (!authUser) return null

    try {
      setError(null)
      setProfileLoading(true)
      const profile = await getUserProfile(authUser.id)
      setUserProfile(profile)
      return profile
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    } finally {
      setProfileLoading(false)
    }
  }

  // Create profile for existing auth user
  const createProfile = async (profileData = {}) => {
    if (!authUser) {
      throw new Error('No authenticated user')
    }

    try {
      setError(null)
      const profile = await createUserProfile(authUser, profileData)
      setUserProfile(profile)
      return profile
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Update user preferences
  const updatePreferences = async (preferences) => {
    if (!userProfile) {
      throw new Error('No user profile loaded')
    }

    try {
      setError(null)
      const updatedProfile = await updateUserProfile(userProfile.id, { preferences })
      setUserProfile(updatedProfile)
      return updatedProfile
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Update user settings
  const updateSettings = async (settings) => {
    if (!userProfile) {
      throw new Error('No user profile loaded')
    }

    try {
      setError(null)
      const updatedProfile = await updateUserProfile(userProfile.id, { settings })
      setUserProfile(updatedProfile)
      return updatedProfile
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Clear error
  const clearError = useCallback(() => setError(null), [])

  // Check if user is authenticated
  const isAuthenticated = !!authUser

  // Check if user has completed profile
  const hasCompleteProfile = !!(userProfile?.name && userProfile?.experience_level)

  // Get user role (for backwards compatibility)
  const getUserRole = () => {
    // Get roles from userProfile (database) first
    if (userProfile?.roles && Array.isArray(userProfile.roles)) {
      const roles = userProfile.roles
      // Priority order for primary role: admin > moderator > user
      if (roles.includes('admin')) return 'admin'
      if (roles.includes('moderator')) return 'moderator'
      // Return first role or default to 'user'
      return roles[0] || 'user'
    }
    
    // Fallback to auth metadata (for backwards compatibility)
    const metadataRole = authUser?.user_metadata?.role
    if (metadataRole) {
      return metadataRole
    }
    
    // Default role
    return 'user'
  }
  
  const userRole = getUserRole()

  // Check if profile is loading
  const isProfileLoading = profileLoading

  // Check if system is ready
  const isReady = isInitialized && !authLoading && !profileLoading

  // Get session expiry information
  const getSessionInfo = useCallback(() => {
    if (!session) return null
    
    return {
      expiresAt: new Date(session.expires_at * 1000),
      isExpired: new Date(session.expires_at * 1000) <= new Date(),
      accessToken: session.access_token,
      refreshToken: session.refresh_token
    }
  }, [session])

  const value = {
    // Auth state
    user: authUser,
    userProfile,
    session,
    isAuthenticated,
    hasCompleteProfile,
    userRole,
    loading: authLoading || profileLoading,
    isProfileLoading,
    isInitialized,
    isReady,
    error,

    // Auth methods
    signUp: signUpWithProfile,
    signIn: signInWithProfile,
    signInWithGoogle: signInWithGoogleAndProfile,
    signInWithMagicLink: signInWithMagicLinkAndProfile,
    signOut: signOutUser,
    resetPassword: resetUserPassword,
    updatePassword: updateUserPassword,
    updateEmail: updateUserEmail,
    verifyOtp: verifyOtpCode,

    // Profile methods
    updateProfile,
    refreshProfile,
    createProfile,
    updatePreferences,
    updateSettings,
    
    // Utility methods
    clearError,
    getSessionInfo,
    loadUserProfile
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}