import React, { createContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../config/supabase'
import {
  getUserProfile,
  createUserProfile,
  updateUserProfile
} from '../services/userService'
import { handleSupabaseError } from '../utils/supabaseErrorHandler'

/**
 * Authentication Context for Supabase
 * Provides comprehensive user authentication state and profile management
 */
export const AuthContext = createContext({})

export const AuthProvider = ({ children }) => {
  // Direct Supabase auth state (consolidated from useSupabaseAuth)
  const [authUser, setAuthUser] = useState(null)
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isInitialized, setIsInitialized] = useState(false)

  // Profile state
  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [error, setError] = useState(null)

  // Initialize authentication system (consolidated - single auth listener)
  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      try {
        console.log('🔐 Initializing authentication system...')

        // Get initial session
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error

        if (isMounted) {
          setSession(session)
          setAuthUser(session?.user ?? null)
          setIsInitialized(true)
          setAuthLoading(false)

          // Profile will be loaded by the separate useEffect
        }

        console.log('✅ Authentication system initialized')
      } catch (error) {
        console.error('❌ Failed to initialize authentication system:', error)
        if (isMounted) {
          setError(handleSupabaseError(error))
          setIsInitialized(true)
          setAuthLoading(false)
        }
      }
    }

    initializeAuth()

    // Single auth state change listener (consolidates all previous listeners)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state changed:', event, session?.user?.email)

        if (isMounted) {
          setSession(session)
          setAuthUser(session?.user ?? null)

          // Handle different auth events
          if (event === 'SIGNED_OUT') {
            console.log('👋 User signed out')
            setUserProfile(null)
            setError(null)
          }

          if (!isInitialized) {
            setIsInitialized(true)
            setAuthLoading(false)
          }
        }
      }
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, []) // Remove all dependencies to prevent infinite loop

  // Load profile when auth user changes
  useEffect(() => {
    const loadProfile = async () => {
      if (!authUser) {
        console.log('👤 AuthContext: No auth user, clearing profile')
        setUserProfile(null)
        setProfileLoading(false)
        return
      }

      // Don't reload if we already have the profile for this user
      if (userProfile && userProfile.id === authUser.id) {
        console.log('👤 AuthContext: Profile already loaded for user', authUser.id)
        setProfileLoading(false)
        return
      }

      console.log('👤 AuthContext: Loading profile for user', authUser.id)
      setProfileLoading(true)
      setError(null)

      try {
        const profile = await getUserProfile(authUser.id)
        console.log('👤 AuthContext: Profile loaded:', profile ? { id: profile.id, roles: profile.roles, name: profile.name } : null)
        setUserProfile(profile)
      } catch (error) {
        console.error('❌ AuthContext: Error loading user profile:', error)
        setError(handleSupabaseError(error))
      } finally {
        setProfileLoading(false)
      }
    }

    if (isInitialized) {
      loadProfile()
    }
  }, [authUser?.id, isInitialized]) // Only depend on user ID and initialization status

  // Sign up with email and password
  const signUpWithProfile = async (email, password, profileData = {}) => {
    try {
      setError(null)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: profileData
        }
      })

      if (error) throw error

      if (data.user && !data.user.email_confirmed_at) {
        return {
          user: data.user,
          session: data.session,
          needsConfirmation: true
        }
      }

      return { user: data.user, session: data.session }
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Sign in with email and password
  const signInWithProfile = async (email, password) => {
    try {
      setError(null)
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error
      return { user: data.user, session: data.session }
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Sign in with Google
  const signInWithGoogleAndProfile = async () => {
    try {
      setError(null)
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`
        }
      })

      if (error) throw error
      return data
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Sign in with magic link
  const signInWithMagicLinkAndProfile = async (email) => {
    try {
      setError(null)
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      })

      if (error) throw error
      return { success: true }
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

  // Sign out
  const signOutUser = async () => {
    try {
      setError(null)
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Reset password
  const resetUserPassword = async (email) => {
    try {
      setError(null)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (error) throw error
      return { success: true }
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Update password
  const updateUserPassword = async (newPassword) => {
    try {
      setError(null)
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error
    } catch (error) {
      const handledError = handleSupabaseError(error)
      setError(handledError)
      throw handledError
    }
  }

  // Update email
  const updateUserEmail = async (newEmail) => {
    try {
      setError(null)
      const { error } = await supabase.auth.updateUser({
        email: newEmail
      })

      if (error) throw error

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

  // Verify OTP
  const verifyOtpCode = async (email, token, type = 'email') => {
    try {
      setError(null)
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type
      })

      if (error) throw error
      return { user: data.user, session: data.session }
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

  // Check if user is authenticated (memoized for stability)
  const isAuthenticated = useMemo(() => !!authUser, [authUser])

  // Check if user has completed profile
  const hasCompleteProfile = !!(userProfile?.name && userProfile?.experience_level)

  // Get user role (memoized for stability)
  const userRole = useMemo(() => {
    // Get roles from userProfile (database) first
    if (userProfile?.roles && Array.isArray(userProfile.roles)) {
      const roles = userProfile.roles
      console.log('👤 AuthContext: User roles from profile:', roles)
      // Priority order for primary role: admin > coach > moderator > user
      if (roles.includes('admin')) return 'admin'
      if (roles.includes('coach')) return 'coach'
      if (roles.includes('moderator')) return 'moderator'
      // Return first role or default to 'user'
      return roles[0] || 'user'
    }

    // Fallback to auth metadata (for backwards compatibility)
    const metadataRole = authUser?.user_metadata?.role
    if (metadataRole) {
      console.log('👤 AuthContext: User role from metadata:', metadataRole)
      return metadataRole
    }

    // Default role
    console.log('👤 AuthContext: No roles found, defaulting to user')
    return 'user'
  }, [authUser?.user_metadata?.role, userProfile?.roles])

  // Check if profile is loading
  const isProfileLoading = profileLoading

  // Check if system is ready (memoized for stability)
  // For authenticated users, we need the profile to be loaded
  const isReady = useMemo(() => {
    if (!isInitialized || authLoading) return false
    if (isAuthenticated && !userProfile && !profileLoading) return false
    return !profileLoading
  }, [isInitialized, authLoading, profileLoading, isAuthenticated, userProfile])

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
    getSessionInfo
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}