import { createClient } from '@supabase/supabase-js'
import { isDevelopment } from './environment'

/**
 * Supabase Client Configuration
 * 
 * This module provides a comprehensive Supabase client setup with:
 * - Environment-specific configuration
 * - Authentication and real-time configuration
 * - Connection error handling and retry logic
 * - Development and production environment support
 */

// Environment detection
const useSupabase = process.env.REACT_APP_USE_SUPABASE === 'true'
const isLocalDevelopment = isDevelopment && process.env.REACT_APP_SUPABASE_LOCAL_URL

// Configuration based on environment
const getSupabaseConfig = () => {
  if (isLocalDevelopment) {
    return {
      url: process.env.REACT_APP_SUPABASE_LOCAL_URL || 'http://localhost:54321',
      anonKey: process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
    }
  }
  
  return {
    url: process.env.REACT_APP_SUPABASE_URL,
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
  }
}

const config = getSupabaseConfig()

// Enhanced client options with retry logic and error handling
const clientOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'supabase.auth.token',
    debug: isDevelopment
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    heartbeatIntervalMs: 30000,
    reconnectAfterMs: (tries) => Math.min(tries * 1000, 30000)
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'X-Client-Info': 'exercise-tracker-web'
    }
  },
  // Connection retry configuration
  fetch: (url, options = {}) => {
    return fetchWithRetry(url, {
      ...options,
      timeout: 10000 // 10 second timeout
    })
  }
}

/**
 * Enhanced fetch function with retry logic and error handling
 */
async function fetchWithRetry(url, options = {}, retries = 3) {
  const { timeout = 10000, ...fetchOptions } = options
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Create abort controller for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      // If response is ok, return it
      if (response.ok) {
        return response
      }
      
      // If it's a server error (5xx) and we have retries left, continue
      if (response.status >= 500 && attempt < retries) {
        console.warn(`Supabase request failed (attempt ${attempt}/${retries}):`, response.status)
        await delay(Math.pow(2, attempt) * 1000) // Exponential backoff
        continue
      }
      
      // For client errors (4xx) or final attempt, return the response
      return response
      
    } catch (error) {
      console.error(`Supabase request error (attempt ${attempt}/${retries}):`, error.message)
      
      // If it's the last attempt, throw the error
      if (attempt === retries) {
        throw new SupabaseConnectionError(
          `Failed to connect to Supabase after ${retries} attempts: ${error.message}`,
          error
        )
      }
      
      // Wait before retrying with exponential backoff
      await delay(Math.pow(2, attempt) * 1000)
    }
  }
}

/**
 * Utility function to create a delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Custom error class for Supabase connection errors
 */
export class SupabaseConnectionError extends Error {
  constructor(message, originalError) {
    super(message)
    this.name = 'SupabaseConnectionError'
    this.originalError = originalError
    this.timestamp = new Date().toISOString()
  }
}

/**
 * Custom error class for Supabase configuration errors
 */
export class SupabaseConfigurationError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SupabaseConfigurationError'
    this.timestamp = new Date().toISOString()
  }
}

// Create the main Supabase client
let supabase = null

try {
  if (config.url && config.anonKey) {
    supabase = createClient(config.url, config.anonKey, clientOptions)
    
    // Set up connection monitoring in development
    if (isDevelopment) {
      setupConnectionMonitoring(supabase)
    }
  } else if (useSupabase) {
    throw new SupabaseConfigurationError(
      'Supabase configuration is incomplete. Please check your environment variables.'
    )
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error)
  if (useSupabase) {
    throw error
  }
}

/**
 * Set up connection monitoring for development
 */
function setupConnectionMonitoring(client) {
  // Monitor auth state changes
  client.auth.onAuthStateChange((event, session) => {
    console.log('🔐 Supabase Auth Event:', event, session ? 'Session Active' : 'No Session')
  })
  
  // Monitor realtime connection status
  const channel = client.channel('connection-monitor')
  
  channel
    .on('system', { event: 'connected' }, () => {
      console.log('🔗 Supabase Realtime: Connected')
    })
    .on('system', { event: 'disconnected' }, () => {
      console.log('🔌 Supabase Realtime: Disconnected')
    })
    .on('system', { event: 'error' }, (error) => {
      console.error('❌ Supabase Realtime Error:', error)
    })
    .subscribe()
}

/**
 * Health check function to verify Supabase connection
 */
export async function checkSupabaseHealth() {
  if (!supabase) {
    throw new SupabaseConfigurationError('Supabase client is not initialized')
  }
  
  try {
    // Simple query to test connection
    const { error } = await supabase
      .from('users')
      .select('count')
      .limit(1)
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "table not found" which is ok for health check
      throw error
    }
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      url: config.url,
      environment: isLocalDevelopment ? 'local' : 'remote'
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
      url: config.url,
      environment: isLocalDevelopment ? 'local' : 'remote'
    }
  }
}

/**
 * Helper function to check if Supabase is properly configured
 */
export const isSupabaseConfigured = () => {
  return !!(config.url && config.anonKey)
}

/**
 * Helper function to check if we should use Supabase
 */
export const shouldUseSupabase = () => {
  return useSupabase && isSupabaseConfigured()
}

/**
 * Get current Supabase configuration info
 */
export const getSupabaseInfo = () => {
  return {
    configured: isSupabaseConfigured(),
    shouldUse: shouldUseSupabase(),
    environment: isLocalDevelopment ? 'local' : 'remote',
    url: config.url ? 'Set' : 'Missing',
    anonKey: config.anonKey ? 'Set' : 'Missing',
    serviceRoleKey: config.serviceRoleKey ? 'Set' : 'Missing'
  }
}

/**
 * Create an admin client for server-side operations (use with caution)
 */
export const createSupabaseAdmin = () => {
  if (!config.url || !config.serviceRoleKey) {
    throw new SupabaseConfigurationError(
      'Admin client requires both URL and service role key'
    )
  }
  
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    }
  })
}

/**
 * Wrapper function for Supabase operations with error handling
 */
export async function withSupabaseErrorHandling(operation, context = '') {
  try {
    const result = await operation()
    return result
  } catch (error) {
    console.error(`Supabase operation failed${context ? ` (${context})` : ''}:`, error)
    
    // Re-throw with additional context
    if (error instanceof SupabaseConnectionError || error instanceof SupabaseConfigurationError) {
      throw error
    }
    
    throw new SupabaseConnectionError(
      `Operation failed${context ? ` in ${context}` : ''}: ${error.message}`,
      error
    )
  }
}

// Development logging
if (isDevelopment) {
  const info = getSupabaseInfo()
  console.log('🗄️  Supabase Configuration:', info)
  
  if (info.configured && info.shouldUse) {
    console.log('✅ Supabase client initialized successfully')
    
    // Perform health check in development
    checkSupabaseHealth()
      .then(health => {
        console.log('🏥 Supabase Health Check:', health)
      })
      .catch(error => {
        console.warn('⚠️  Supabase Health Check Failed:', error.message)
      })
  } else if (useSupabase) {
    console.warn('⚠️  Supabase is enabled but not properly configured')
  } else {
    console.log('ℹ️  Supabase is disabled (using Firebase)')
  }
}

// Export the configured client
export { supabase }

// Export default client for convenience
export default supabase