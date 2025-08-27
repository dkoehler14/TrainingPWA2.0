import { useEffect, useState } from 'react'
import { supabase } from '../config/supabase'
import { handleSupabaseError } from '../utils/supabaseErrorHandler'

/**
 * Custom hook for Supabase authentication
 * Provides user state, loading state, and authentication methods
 */
export function useSupabaseAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    let isMounted = true

    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        
        if (isMounted) {
          setSession(session)
          setUser(session?.user ?? null)
          setIsInitialized(true)
          setLoading(false)
        }
      } catch (error) {
        console.error('Error getting initial session:', error)
        handleSupabaseError(error)
        if (isMounted) {
          setIsInitialized(true)
          setLoading(false)
        }
      }
    }

    getInitialSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email)
        
        // Only update state if this is a meaningful auth change
        // Ignore redundant events that happen on tab focus
        if (isMounted) {
          const currentUserId = user?.id
          const newUserId = session?.user?.id
          
          // Only update if there's an actual change in user state
          if (currentUserId !== newUserId || !isInitialized) {
            setSession(session)
            setUser(session?.user ?? null)
            
            // Only set loading to false if we're not already initialized
            // This prevents unnecessary loading states on tab switches
            if (!isInitialized) {
              setIsInitialized(true)
              setLoading(false)
            }
          }
        }
      }
    )

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [user?.id, isInitialized])

  // Sign up with email and password
  const signUp = async (email, password, userData = {}) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData
        }
      })

      if (error) throw error
      return { user: data.user, session: data.session }
    } catch (error) {
      console.error('Sign up error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Sign in with email and password
  const signIn = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error
      return { user: data.user, session: data.session }
    } catch (error) {
      console.error('Sign in error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`
        }
      })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Google sign in error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Sign out
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Sign out error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Reset password
  const resetPassword = async (email) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (error) throw error
    } catch (error) {
      console.error('Reset password error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Update password
  const updatePassword = async (newPassword) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error
    } catch (error) {
      console.error('Update password error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Update email
  const updateEmail = async (newEmail) => {
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail
      })

      if (error) throw error
    } catch (error) {
      console.error('Update email error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Update user metadata
  const updateUserMetadata = async (metadata) => {
    try {
      const { error } = await supabase.auth.updateUser({
        data: metadata
      })

      if (error) throw error
    } catch (error) {
      console.error('Update user metadata error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Get current session
  const getCurrentSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      return session
    } catch (error) {
      console.error('Get current session error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Refresh session
  const refreshSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession()
      if (error) throw error
      return session
    } catch (error) {
      console.error('Refresh session error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Sign in with magic link
  const signInWithMagicLink = async (email) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      })

      if (error) throw error
    } catch (error) {
      console.error('Magic link sign in error:', error)
      throw handleSupabaseError(error)
    }
  }

  // Verify OTP
  const verifyOtp = async (email, token, type = 'email') => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type
      })

      if (error) throw error
      return { user: data.user, session: data.session }
    } catch (error) {
      console.error('Verify OTP error:', error)
      throw handleSupabaseError(error)
    }
  }

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signInWithMagicLink,
    signOut,
    resetPassword,
    updatePassword,
    updateEmail,
    updateUserMetadata,
    getCurrentSession,
    refreshSession,
    verifyOtp
  }
}