/**
 * Production Configuration for Supabase
 * 
 * This module provides production-specific configuration for Supabase,
 * including security settings, performance optimizations, and monitoring.
 */

import { createClient } from '@supabase/supabase-js'

/**
 * Production Supabase Configuration
 */
export const productionSupabaseConfig = {
  // Core configuration
  url: process.env.REACT_APP_SUPABASE_URL,
  anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY,
  
  // Security settings
  security: {
    // Enable RLS by default
    enableRLS: true,
    // JWT settings
    jwt: {
      expiry: 3600, // 1 hour
      enableRefreshTokenRotation: true,
      refreshTokenReuseInterval: 10
    },
    // Rate limiting
    rateLimits: {
      emailSent: 10, // per hour
      tokenRefresh: 300, // per 5 minutes
      signInSignUps: 60, // per 5 minutes
      tokenVerifications: 60 // per 5 minutes
    }
  },
  
  // Performance settings
  performance: {
    // Connection pooling
    connectionPool: {
      maxConnections: 20,
      idleTimeout: 30000,
      connectionTimeout: 10000
    },
    // Query optimization
    querySettings: {
      maxRows: 1000,
      timeout: 30000,
      enableQueryPlan: false // Disable in production for security
    },
    // Caching
    cache: {
      defaultTTL: 300000, // 5 minutes
      maxCacheSize: 100, // MB
      enableCompression: true
    }
  },
  
  // Monitoring and logging
  monitoring: {
    enableMetrics: true,
    enableErrorTracking: true,
    logLevel: 'error', // Only log errors in production
    performanceThresholds: {
      slowQuery: 2000, // 2 seconds
      connectionTimeout: 5000, // 5 seconds
      memoryUsage: 100 // MB
    }
  },
  
  // Backup and disaster recovery
  backup: {
    enableAutomaticBackups: true,
    backupFrequency: 'daily',
    retentionPeriod: 30, // days
    enablePointInTimeRecovery: true
  }
}

/**
 * Production Supabase Client Options
 */
export const productionClientOptions = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'supabase.auth.token',
    debug: false // Disable debug in production
  },
  realtime: {
    params: {
      eventsPerSecond: 5 // Reduced for production stability
    },
    heartbeatIntervalMs: 30000,
    reconnectAfterMs: (tries) => Math.min(tries * 2000, 60000), // Exponential backoff
    timeout: 20000
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'X-Client-Info': 'exercise-tracker-web-prod',
      'X-Client-Version': process.env.REACT_APP_VERSION || '1.0.0'
    }
  },
  // Production fetch with enhanced error handling
  fetch: (url, options = {}) => {
    return productionFetchWithRetry(url, {
      ...options,
      timeout: productionSupabaseConfig.performance.querySettings.timeout
    })
  }
}

/**
 * Production-optimized fetch function with retry logic
 */
async function productionFetchWithRetry(url, options = {}, retries = 2) {
  const { timeout = 30000, ...fetchOptions } = options
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)
      
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      // Log slow queries in production
      const responseTime = Date.now() - (options.startTime || Date.now())
      if (responseTime > productionSupabaseConfig.monitoring.performanceThresholds.slowQuery) {
        console.warn(`Slow Supabase query detected: ${responseTime}ms`, { url, attempt })
      }
      
      if (response.ok) {
        return response
      }
      
      // For server errors, retry with exponential backoff
      if (response.status >= 500 && attempt < retries) {
        await delay(Math.pow(2, attempt) * 1000)
        continue
      }
      
      return response
      
    } catch (error) {
      // Log production errors
      console.error(`Supabase request failed (attempt ${attempt}/${retries}):`, {
        error: error.message,
        url,
        timestamp: new Date().toISOString()
      })
      
      if (attempt === retries) {
        throw new ProductionSupabaseError(
          `Failed to connect to Supabase after ${retries} attempts`,
          error,
          { url, attempts: retries }
        )
      }
      
      await delay(Math.pow(2, attempt) * 1000)
    }
  }
}

/**
 * Production-specific error class
 */
export class ProductionSupabaseError extends Error {
  constructor(message, originalError, context = {}) {
    super(message)
    this.name = 'ProductionSupabaseError'
    this.originalError = originalError
    this.context = context
    this.timestamp = new Date().toISOString()
    this.severity = this.determineSeverity(originalError)
  }
  
  determineSeverity(error) {
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      return 'critical'
    }
    if (error?.status >= 500) {
      return 'high'
    }
    if (error?.status >= 400) {
      return 'medium'
    }
    return 'low'
  }
}

/**
 * Create production Supabase client
 */
export function createProductionSupabaseClient() {
  const config = productionSupabaseConfig
  
  if (!config.url || !config.anonKey) {
    throw new ProductionSupabaseError(
      'Production Supabase configuration is incomplete',
      new Error('Missing required environment variables'),
      { url: !!config.url, anonKey: !!config.anonKey }
    )
  }
  
  const client = createClient(config.url, config.anonKey, productionClientOptions)
  
  // Set up production monitoring
  setupProductionMonitoring(client)
  
  return client
}

/**
 * Create production admin client (server-side only)
 */
export function createProductionAdminClient() {
  const config = productionSupabaseConfig
  
  if (!config.url || !config.serviceRoleKey) {
    throw new ProductionSupabaseError(
      'Production admin client requires service role key',
      new Error('Missing service role key'),
      { url: !!config.url, serviceRoleKey: !!config.serviceRoleKey }
    )
  }
  
  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'X-Client-Info': 'exercise-tracker-admin-prod'
      }
    }
  })
}

/**
 * Set up production monitoring
 */
function setupProductionMonitoring(client) {
  if (!productionSupabaseConfig.monitoring.enableMetrics) {
    return
  }
  
  // Monitor auth state changes
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      console.log('User signed in', { timestamp: new Date().toISOString() })
    } else if (event === 'SIGNED_OUT') {
      console.log('User signed out', { timestamp: new Date().toISOString() })
    } else if (event === 'TOKEN_REFRESHED') {
      console.log('Token refreshed', { timestamp: new Date().toISOString() })
    }
  })
  
  // Monitor connection health
  const healthCheckInterval = setInterval(async () => {
    try {
      const startTime = Date.now()
      const { error } = await client.from('users').select('count').limit(1)
      const responseTime = Date.now() - startTime
      
      if (error && error.code !== 'PGRST116') {
        console.error('Supabase health check failed:', error)
      } else if (responseTime > productionSupabaseConfig.monitoring.performanceThresholds.slowQuery) {
        console.warn('Supabase health check slow:', { responseTime })
      }
    } catch (error) {
      console.error('Supabase health check error:', error)
    }
  }, 300000) // Every 5 minutes
  
  // Clean up on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      clearInterval(healthCheckInterval)
    })
  }
}

/**
 * Production health check
 */
export async function checkProductionHealth() {
  const client = createProductionSupabaseClient()
  
  try {
    const startTime = Date.now()
    
    // Test database connection
    const { error: dbError } = await client
      .from('users')
      .select('count')
      .limit(1)
    
    const dbResponseTime = Date.now() - startTime
    
    // Test auth service
    const authStartTime = Date.now()
    const { data: { session }, error: authError } = await client.auth.getSession()
    const authResponseTime = Date.now() - authStartTime
    
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbError && dbError.code !== 'PGRST116' ? 'unhealthy' : 'healthy',
          responseTime: dbResponseTime,
          error: dbError?.message
        },
        auth: {
          status: authError ? 'unhealthy' : 'healthy',
          responseTime: authResponseTime,
          hasSession: !!session,
          error: authError?.message
        }
      },
      performance: {
        totalResponseTime: Date.now() - startTime,
        thresholds: productionSupabaseConfig.monitoring.performanceThresholds
      }
    }
  } catch (error) {
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      severity: error instanceof ProductionSupabaseError ? error.severity : 'high'
    }
  }
}

/**
 * Utility function for delays
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Validate production environment
 */
export function validateProductionEnvironment() {
  const requiredEnvVars = [
    'REACT_APP_SUPABASE_URL',
    'REACT_APP_SUPABASE_ANON_KEY'
  ]
  
  const missing = requiredEnvVars.filter(envVar => !process.env[envVar])
  
  if (missing.length > 0) {
    throw new ProductionSupabaseError(
      'Missing required production environment variables',
      new Error(`Missing: ${missing.join(', ')}`),
      { missing }
    )
  }
  
  // Validate URL format
  const url = process.env.REACT_APP_SUPABASE_URL
  if (url && !url.startsWith('https://')) {
    throw new ProductionSupabaseError(
      'Production Supabase URL must use HTTPS',
      new Error('Invalid URL protocol'),
      { url }
    )
  }
  
  return true
}