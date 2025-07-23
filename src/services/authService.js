/**
 * Authentication Service for Supabase
 * 
 * This service provides a comprehensive authentication layer for the application,
 * handling all authentication flows, session management, and user profile integration.
 */

import { supabase } from '../config/supabase'
import { AUTH_FLOWS, sessionManager, authEventHandler } from '../config/supabaseAuth'
import { handleSupabaseError } from '../utils/supabaseErrorHandler'
import { getUserProfile, createUserProfile, getOrCreateUserProfile } from './userService'

/**
 * Authentication Service Class
 */
export class AuthService {
  constructor() {
    this.currentUser = null
    this.currentSession = null
    this.isInitialized = false
  }

  /**
   * Initialize the authentication service
   */
  async initialize() {
    try {
      console.log('🔐 Initializing Authentication Service...')
      
      // Get current session
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Error getting initial session:', error)
        throw handleSupabaseError(error)
      }

      this.currentSession = session
      this.currentUser = session?.user || null

      // Set up auth state change listener
      supabase.auth.onAuthStateChange(async (event, session) => {
        await this.handleAuthStateChange(event, session)
      })

      this.isInitialized = true
      console.log('✅ Authentication Service initialized successfully')
      
      return {
        success: true,
        user: this.currentUser,
        session: this.currentSession
      }
    } catch (error) {
      console.error('❌ Failed to initialize Authentication Service:', error)
      throw error
    }
  }

  /**
   * Handle authentication state changes
   */
  async handleAuthStateChange(event, session) {
    console.log('🔄 Auth state changed:', event, session?.user?.email)
    
    this.currentSession = session
    this.currentUser = session?.user || null

    // Handle different auth events
    switch (event) {
      case 'SIGNED_IN':
        await this.handleSignIn(session)
        break
      case 'SIGNED_OUT':
        await this.handleSignOut()
        break
      case 'TOKEN_REFRESHED':
        await this.handleTokenRefresh(session)
        break
      case 'USER_UPDATED':
        await this.handleUserUpdate(session)
        break
      case 'PASSWORD_RECOVERY':
        await this.handlePasswordRecovery(session)
        break
    }

    // Emit event for components to handle
    authEventHandler.handleAuthStateChange(event, session)
  }

  /**
   * Handle successful sign in
   */
  async handleSignIn(session) {
    try {
      console.log('👤 User signed in:', session.user.email)
      
      // Load or create user profile
      const profile = await getOrCreateUserProfile(session.user)
      
      // Set up session management
      await sessionManager.initialize()
      
      return profile
    } catch (error) {
      console.error('Error handling sign in:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Handle sign out
   */
  async handleSignOut() {
    console.log('👋 User signed out')
    
    // Cleanup session management
    sessionManager.cleanup()
    
    // Clear any cached data
    this.clearCache()
  }

  /**
   * Handle token refresh
   */
  async handleTokenRefresh(session) {
    console.log('🔄 Token refreshed for user:', session.user.email)
    // Token refresh is handled automatically by Supabase
  }

  /**
   * Handle user update
   */
  async handleUserUpdate(session) {
    console.log('📝 User updated:', session.user.email)
    // User profile updates are handled by the profile service
  }

  /**
   * Handle password recovery
   */
  async handlePasswordRecovery(session) {
    console.log('🔑 Password recovery for user:', session?.user?.email)
    // Password recovery flow is handled by the auth components
  }

  /**
   * Sign up with email and password
   */
  async signUp(email, password, userData = {}) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: userData.name || '',
            ...userData
          },
          emailRedirectTo: AUTH_FLOWS.SIGNUP.EMAIL_REDIRECT_URL
        }
      })

      if (error) throw error

      // If user is created and confirmed, create profile
      if (data.user && !data.user.email_confirmed_at) {
        console.log('📧 Confirmation email sent to:', email)
        return {
          user: data.user,
          session: data.session,
          needsConfirmation: true,
          message: 'Please check your email to confirm your account'
        }
      }

      return {
        user: data.user,
        session: data.session,
        needsConfirmation: false
      }
    } catch (error) {
      console.error('Sign up error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(email, password) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (error) throw error

      return {
        user: data.user,
        session: data.session
      }
    } catch (error) {
      console.error('Sign in error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Sign in with Google OAuth
   */
  async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: AUTH_FLOWS.OAUTH.GOOGLE.REDIRECT_URL,
          scopes: 'email profile'
        }
      })

      if (error) throw error
      return data
    } catch (error) {
      console.error('Google sign in error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Sign in with magic link
   */
  async signInWithMagicLink(email) {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: AUTH_FLOWS.SIGNIN.REDIRECT_URL
        }
      })

      if (error) throw error

      return {
        success: true,
        message: 'Magic link sent to your email'
      }
    } catch (error) {
      console.error('Magic link sign in error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Sign out
   */
  async signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (error) {
      console.error('Sign out error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email) {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: AUTH_FLOWS.PASSWORD_RESET.REDIRECT_URL
      })

      if (error) throw error

      return {
        success: true,
        message: 'Password reset email sent'
      }
    } catch (error) {
      console.error('Reset password error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Update password
   */
  async updatePassword(newPassword) {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      })

      if (error) throw error

      return {
        success: true,
        message: 'Password updated successfully'
      }
    } catch (error) {
      console.error('Update password error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Update email
   */
  async updateEmail(newEmail) {
    try {
      const { error } = await supabase.auth.updateUser({
        email: newEmail
      })

      if (error) throw error

      return {
        success: true,
        message: 'Email update confirmation sent to new email address'
      }
    } catch (error) {
      console.error('Update email error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Update user metadata
   */
  async updateUserMetadata(metadata) {
    try {
      const { error } = await supabase.auth.updateUser({
        data: metadata
      })

      if (error) throw error

      return {
        success: true,
        message: 'User metadata updated successfully'
      }
    } catch (error) {
      console.error('Update user metadata error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Verify OTP (One-Time Password)
   */
  async verifyOtp(email, token, type = 'email') {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type
      })

      if (error) throw error

      return {
        user: data.user,
        session: data.session
      }
    } catch (error) {
      console.error('Verify OTP error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Get current session
   */
  async getCurrentSession() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      
      this.currentSession = session
      return session
    } catch (error) {
      console.error('Get current session error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Refresh current session
   */
  async refreshSession() {
    try {
      const { data: { session }, error } = await supabase.auth.refreshSession()
      if (error) throw error
      
      this.currentSession = session
      return session
    } catch (error) {
      console.error('Refresh session error:', error)
      throw handleSupabaseError(error)
    }
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.currentUser
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!this.currentUser
  }

  /**
   * Check if user email is confirmed
   */
  isEmailConfirmed() {
    return !!this.currentUser?.email_confirmed_at
  }

  /**
   * Get user role from metadata
   */
  getUserRole() {
    return this.currentUser?.user_metadata?.role || 'user'
  }

  /**
   * Check if user has specific role
   */
  hasRole(role) {
    return this.getUserRole() === role
  }

  /**
   * Clear cached data
   */
  clearCache() {
    // Clear any cached authentication data
    this.currentUser = null
    this.currentSession = null
  }

  /**
   * Get authentication headers for API requests
   */
  getAuthHeaders() {
    if (!this.currentSession?.access_token) {
      return {}
    }

    return {
      'Authorization': `Bearer ${this.currentSession.access_token}`
    }
  }

  /**
   * Check if session is expired
   */
  isSessionExpired() {
    if (!this.currentSession) return true

    const expiresAt = new Date(this.currentSession.expires_at * 1000)
    const now = new Date()
    
    return expiresAt <= now
  }

  /**
   * Get session expiry time
   */
  getSessionExpiry() {
    if (!this.currentSession) return null
    return new Date(this.currentSession.expires_at * 1000)
  }

  /**
   * Handle authentication errors
   */
  handleAuthError(error) {
    console.error('Authentication error:', error)
    
    // Handle specific error cases
    switch (error.message) {
      case 'Invalid login credentials':
        return 'Invalid email or password. Please try again.'
      case 'Email not confirmed':
        return 'Please check your email and confirm your account before signing in.'
      case 'User not found':
        return 'No account found with this email address.'
      case 'Password should be at least 6 characters':
        return 'Password must be at least 6 characters long.'
      default:
        return error.message || 'An authentication error occurred. Please try again.'
    }
  }
}

// Create singleton instance
export const authService = new AuthService()

// Export individual methods for convenience
export const {
  initialize: initializeAuth,
  signUp,
  signIn,
  signInWithGoogle,
  signInWithMagicLink,
  signOut,
  resetPassword,
  updatePassword,
  updateEmail,
  updateUserMetadata,
  verifyOtp,
  getCurrentSession,
  refreshSession,
  getCurrentUser,
  isAuthenticated,
  isEmailConfirmed,
  getUserRole,
  hasRole,
  getAuthHeaders,
  isSessionExpired,
  getSessionExpiry,
  handleAuthError
} = authService