/**
 * Supabase Authentication Configuration
 * 
 * This module provides comprehensive authentication configuration for Supabase,
 * including email templates, authentication flows, and session management.
 */

import { supabase } from './supabase'

/**
 * Authentication configuration constants
 */
export const AUTH_CONFIG = {
  // Session configuration
  SESSION: {
    EXPIRY_TIME: 3600, // 1 hour in seconds
    REFRESH_THRESHOLD: 300, // Refresh when 5 minutes left
    AUTO_REFRESH: true,
    PERSIST_SESSION: true
  },

  // Email configuration
  EMAIL: {
    ENABLE_SIGNUP: true,
    ENABLE_CONFIRMATIONS: false, // Set to true in production
    DOUBLE_CONFIRM_CHANGES: true,
    SECURE_PASSWORD_CHANGE: false,
    OTP_LENGTH: 6,
    OTP_EXPIRY: 3600, // 1 hour
    MAX_FREQUENCY: '1s'
  },

  // Password requirements
  PASSWORD: {
    MIN_LENGTH: 6,
    REQUIREMENTS: 'letters_digits' // Can be: letters_digits, lower_upper_letters_digits, lower_upper_letters_digits_symbols
  },

  // OAuth providers
  OAUTH: {
    GOOGLE: {
      ENABLED: true,
      SCOPES: ['email', 'profile']
    }
  },

  // Rate limiting (for reference - configured in Supabase dashboard)
  RATE_LIMITS: {
    SIGN_IN_SIGN_UPS: 30, // per 5 minutes per IP
    TOKEN_REFRESH: 150, // per 5 minutes per IP
    EMAIL_SENT: 2, // per hour
    TOKEN_VERIFICATIONS: 30 // per 5 minutes per IP
  }
}

/**
 * Authentication flow configuration
 */
export const AUTH_FLOWS = {
  // Sign up flow
  SIGNUP: {
    REDIRECT_URL: `${window.location.origin}/welcome`,
    EMAIL_REDIRECT_URL: `${window.location.origin}/verify-email`,
    SUCCESS_REDIRECT: '/dashboard',
    ERROR_REDIRECT: '/auth?error=signup'
  },

  // Sign in flow
  SIGNIN: {
    REDIRECT_URL: `${window.location.origin}/dashboard`,
    SUCCESS_REDIRECT: '/dashboard',
    ERROR_REDIRECT: '/auth?error=signin'
  },

  // Password reset flow
  PASSWORD_RESET: {
    REDIRECT_URL: `${window.location.origin}/reset-password`,
    SUCCESS_REDIRECT: '/auth?message=reset-sent',
    ERROR_REDIRECT: '/auth?error=reset'
  },

  // Email verification flow
  EMAIL_VERIFICATION: {
    REDIRECT_URL: `${window.location.origin}/verify-email`,
    SUCCESS_REDIRECT: '/dashboard?message=email-verified',
    ERROR_REDIRECT: '/auth?error=verification'
  },

  // OAuth flows
  OAUTH: {
    GOOGLE: {
      REDIRECT_URL: `${window.location.origin}/auth/callback`,
      SUCCESS_REDIRECT: '/dashboard',
      ERROR_REDIRECT: '/auth?error=oauth'
    }
  }
}

/**
 * Email template configuration
 * These templates are used for various authentication emails
 */
export const EMAIL_TEMPLATES = {
  // Welcome email after signup
  WELCOME: {
    SUBJECT: 'Welcome to Exercise Tracker!',
    TEMPLATE: `
      <h2>Welcome to Exercise Tracker!</h2>
      <p>Thank you for joining our fitness community. We're excited to help you track your progress and achieve your fitness goals.</p>
      <p>Get started by:</p>
      <ul>
        <li>Setting up your profile</li>
        <li>Creating your first workout program</li>
        <li>Logging your first workout</li>
      </ul>
      <p>If you have any questions, feel free to reach out to our support team.</p>
      <p>Happy training!</p>
    `
  },

  // Email confirmation
  CONFIRMATION: {
    SUBJECT: 'Confirm your email address',
    TEMPLATE: `
      <h2>Confirm Your Email Address</h2>
      <p>Please click the link below to confirm your email address and activate your account:</p>
      <p><a href="{{ .ConfirmationURL }}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Confirm Email</a></p>
      <p>If you didn't create an account with Exercise Tracker, you can safely ignore this email.</p>
      <p>This link will expire in 24 hours.</p>
    `
  },

  // Password reset
  PASSWORD_RESET: {
    SUBJECT: 'Reset your password',
    TEMPLATE: `
      <h2>Reset Your Password</h2>
      <p>You requested to reset your password for your Exercise Tracker account.</p>
      <p>Click the link below to create a new password:</p>
      <p><a href="{{ .ConfirmationURL }}" style="background-color: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
      <p>If you didn't request this password reset, you can safely ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    `
  },

  // Magic link
  MAGIC_LINK: {
    SUBJECT: 'Your Exercise Tracker login link',
    TEMPLATE: `
      <h2>Your Login Link</h2>
      <p>Click the link below to sign in to your Exercise Tracker account:</p>
      <p><a href="{{ .ConfirmationURL }}" style="background-color: #FF9800; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Sign In</a></p>
      <p>If you didn't request this login link, you can safely ignore this email.</p>
      <p>This link will expire in 1 hour.</p>
    `
  },

  // Email change confirmation
  EMAIL_CHANGE: {
    SUBJECT: 'Confirm your new email address',
    TEMPLATE: `
      <h2>Confirm Your New Email Address</h2>
      <p>You requested to change your email address for your Exercise Tracker account.</p>
      <p>Click the link below to confirm your new email address:</p>
      <p><a href="{{ .ConfirmationURL }}" style="background-color: #9C27B0; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Confirm New Email</a></p>
      <p>If you didn't request this email change, please contact our support team immediately.</p>
      <p>This link will expire in 24 hours.</p>
    `
  }
}

/**
 * Session management utilities
 */
export class SessionManager {
  constructor() {
    this.refreshTimer = null
    this.warningTimer = null
  }

  /**
   * Initialize session management
   */
  async initialize() {
    try {
      // Get current session
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        console.error('Error getting session:', error)
        return null
      }

      if (session) {
        this.setupSessionRefresh(session)
        this.setupSessionWarning(session)
      }

      return session
    } catch (error) {
      console.error('Error initializing session manager:', error)
      return null
    }
  }

  /**
   * Set up automatic session refresh
   */
  setupSessionRefresh(session) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
    }

    const expiresAt = new Date(session.expires_at * 1000)
    const now = new Date()
    const timeUntilRefresh = expiresAt.getTime() - now.getTime() - (AUTH_CONFIG.SESSION.REFRESH_THRESHOLD * 1000)

    if (timeUntilRefresh > 0) {
      this.refreshTimer = setTimeout(async () => {
        try {
          const { data: { session: newSession }, error } = await supabase.auth.refreshSession()
          
          if (error) {
            console.error('Error refreshing session:', error)
            this.handleSessionExpiry()
            return
          }

          if (newSession) {
            console.log('Session refreshed successfully')
            this.setupSessionRefresh(newSession)
            this.setupSessionWarning(newSession)
          }
        } catch (error) {
          console.error('Error during session refresh:', error)
          this.handleSessionExpiry()
        }
      }, timeUntilRefresh)
    }
  }

  /**
   * Set up session expiry warning
   */
  setupSessionWarning(session) {
    if (this.warningTimer) {
      clearTimeout(this.warningTimer)
    }

    const expiresAt = new Date(session.expires_at * 1000)
    const now = new Date()
    const timeUntilWarning = expiresAt.getTime() - now.getTime() - (600 * 1000) // 10 minutes before expiry

    if (timeUntilWarning > 0) {
      this.warningTimer = setTimeout(() => {
        this.showSessionWarning()
      }, timeUntilWarning)
    }
  }

  /**
   * Show session expiry warning
   */
  showSessionWarning() {
    // Dispatch custom event for UI components to handle
    window.dispatchEvent(new CustomEvent('sessionWarning', {
      detail: {
        message: 'Your session will expire soon. Please save your work.',
        timeRemaining: 600 // 10 minutes
      }
    }))
  }

  /**
   * Handle session expiry
   */
  handleSessionExpiry() {
    // Clear timers
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    
    if (this.warningTimer) {
      clearTimeout(this.warningTimer)
      this.warningTimer = null
    }

    // Dispatch session expired event
    window.dispatchEvent(new CustomEvent('sessionExpired', {
      detail: {
        message: 'Your session has expired. Please sign in again.',
        redirectUrl: '/auth'
      }
    }))
  }

  /**
   * Cleanup session management
   */
  cleanup() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    
    if (this.warningTimer) {
      clearTimeout(this.warningTimer)
      this.warningTimer = null
    }
  }
}

/**
 * Token management utilities
 */
export class TokenManager {
  /**
   * Get current access token
   */
  static async getAccessToken() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        throw error
      }

      return session?.access_token || null
    } catch (error) {
      console.error('Error getting access token:', error)
      return null
    }
  }

  /**
   * Get current refresh token
   */
  static async getRefreshToken() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        throw error
      }

      return session?.refresh_token || null
    } catch (error) {
      console.error('Error getting refresh token:', error)
      return null
    }
  }

  /**
   * Validate token expiry
   */
  static isTokenExpired(token) {
    if (!token) return true

    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const now = Math.floor(Date.now() / 1000)
      
      return payload.exp < now
    } catch (error) {
      console.error('Error validating token:', error)
      return true
    }
  }

  /**
   * Get token expiry time
   */
  static getTokenExpiry(token) {
    if (!token) return null

    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return new Date(payload.exp * 1000)
    } catch (error) {
      console.error('Error getting token expiry:', error)
      return null
    }
  }
}

/**
 * Authentication event handlers
 */
export class AuthEventHandler {
  constructor() {
    this.listeners = new Map()
  }

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    
    this.listeners.get(event).push(callback)
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    if (!this.listeners.has(event)) return

    const callbacks = this.listeners.get(event)
    const index = callbacks.indexOf(callback)
    
    if (index > -1) {
      callbacks.splice(index, 1)
    }
  }

  /**
   * Emit event
   */
  emit(event, data) {
    if (!this.listeners.has(event)) return

    const callbacks = this.listeners.get(event)
    callbacks.forEach(callback => {
      try {
        callback(data)
      } catch (error) {
        console.error(`Error in auth event handler for ${event}:`, error)
      }
    })
  }

  /**
   * Handle auth state change
   */
  handleAuthStateChange(event, session) {
    console.log('Auth state changed:', event, session?.user?.email)
    
    switch (event) {
      case 'SIGNED_IN':
        this.emit('signedIn', { session, user: session?.user })
        break
      case 'SIGNED_OUT':
        this.emit('signedOut', {})
        break
      case 'TOKEN_REFRESHED':
        this.emit('tokenRefreshed', { session, user: session?.user })
        break
      case 'USER_UPDATED':
        this.emit('userUpdated', { session, user: session?.user })
        break
      case 'PASSWORD_RECOVERY':
        this.emit('passwordRecovery', { session, user: session?.user })
        break
      default:
        this.emit('authEvent', { event, session, user: session?.user })
    }
  }
}

// Create singleton instances
export const sessionManager = new SessionManager()
export const authEventHandler = new AuthEventHandler()

/**
 * Initialize authentication configuration
 */
export async function initializeAuthConfig() {
  try {
    console.log('🔐 Initializing Supabase Auth configuration...')
    
    // Initialize session management
    const session = await sessionManager.initialize()
    
    // Set up auth state change listener
    supabase.auth.onAuthStateChange((event, session) => {
      authEventHandler.handleAuthStateChange(event, session)
    })
    
    console.log('✅ Supabase Auth configuration initialized successfully')
    
    return {
      success: true,
      session,
      config: AUTH_CONFIG
    }
  } catch (error) {
    console.error('❌ Failed to initialize Supabase Auth configuration:', error)
    
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Cleanup authentication configuration
 */
export function cleanupAuthConfig() {
  sessionManager.cleanup()
  authEventHandler.listeners.clear()
}