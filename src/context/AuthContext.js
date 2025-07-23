import React, { createContext, useContext, useEffect, useState } from 'react'
import { useSupabaseAuth } from '../hooks/useSupabaseAuth'
import { 
  getUserProfile, 
  createUserProfile, 
  getOrCreateUserProfile,
  updateUserProfile 
} from '../services/userService'
import { handleSupabaseError } from '../utils/supabaseErrorHandler'

/**
 * Authentication Context for Supabase
 * Provides user authentication state and profile management
 */
const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const {
    user: authUser,
    session,
    loading: authLoading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updatePassword,
    updateEmail
  } = useSupabaseAuth()

  const [userProfile, setUserProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [error, setError] = useState(null)

  // Load user profile when auth user changes
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!authUser) {
        setUserProfile(null)
        return
      }

      setProfileLoading(true)
      setError(null)

      try {
        const profile = await getUserProfile(authUser.id)
        setUserProfile(profile)
      } catch (error) {
        console.error('Error loading user profile:', error)
        setError(handleSupabaseError(error))
      } finally {
        setProfileLoading(false)
      }
    }

    loadUserProfile()
  }, [authUser])

  // Enhanced sign up with profile creation
  const signUpWithProfile = async (email, password, profileData = {}) => {
    try {
      setError(null)
      const { user: newUser } = await signUp(email, password, profileData)
      
      if (newUser) {
        // Create user profile
        const profile = await createUserProfile(newUser, profileData)
        setUserProfile(profile)
        return { user: newUser, profile }
      }
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
      const { user: signedInUser } = await signIn(email, password)
      
      if (signedInUser) {
        // Load or create profile
        const profile = await getOrCreateUserProfile(signedInUser)
        setUserProfile(profile)
        return { user: signedInUser, profile }
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
      const result = await signInWithGoogle()
      
      // Profile will be loaded by the useEffect when authUser changes
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
      await signOut()
      setUserProfile(null)
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
      await resetPassword(email)
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
      await updatePassword(newPassword)
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
      await updateEmail(newEmail)
      
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
  const clearError = () => setError(null)

  // Check if user is authenticated
  const isAuthenticated = !!authUser

  // Check if user has completed profile
  const hasCompleteProfile = !!(userProfile?.name && userProfile?.experience_level)

  // Get user role (for backwards compatibility)
  const userRole = userProfile?.role || 'user'

  // Check if profile is loading
  const isProfileLoading = profileLoading

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
    error,

    // Auth methods
    signUp: signUpWithProfile,
    signIn: signInWithProfile,
    signInWithGoogle: signInWithGoogleAndProfile,
    signOut: signOutUser,
    resetPassword: resetUserPassword,
    updatePassword: updateUserPassword,
    updateEmail: updateUserEmail,

    // Profile methods
    updateProfile,
    refreshProfile,
    createProfile,
    updatePreferences,
    updateSettings,
    
    // Utility methods
    clearError
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}