/**
 * Supabase Error Handling Utilities
 * 
 * This module provides comprehensive error handling for Supabase operations,
 * including retry logic, error classification, and user-friendly error messages.
 */

/**
 * Custom error classes for different types of Supabase errors
 */
export class SupabaseError extends Error {
  constructor(message, code, details, originalError) {
    super(message)
    this.name = 'SupabaseError'
    this.code = code
    this.details = details
    this.originalError = originalError
    this.timestamp = new Date().toISOString()
  }
}

export class SupabaseConnectionError extends SupabaseError {
  constructor(message, originalError) {
    super(message, 'CONNECTION_ERROR', null, originalError)
    this.name = 'SupabaseConnectionError'
  }
}

export class SupabaseAuthError extends SupabaseError {
  constructor(message, code, originalError) {
    super(message, code, null, originalError)
    this.name = 'SupabaseAuthError'
  }
}

export class SupabaseDataError extends SupabaseError {
  constructor(message, code, details, originalError) {
    super(message, code, details, originalError)
    this.name = 'SupabaseDataError'
  }
}

/**
 * Error code mappings for user-friendly messages
 */
const ERROR_MESSAGES = {
  // Connection errors
  'CONNECTION_ERROR': 'Unable to connect to the database. Please check your internet connection.',
  'TIMEOUT_ERROR': 'The request took too long to complete. Please try again.',
  
  // Authentication errors
  'INVALID_CREDENTIALS': 'Invalid email or password. Please check your credentials.',
  'USER_NOT_FOUND': 'No account found with this email address.',
  'EMAIL_NOT_CONFIRMED': 'Please check your email and click the confirmation link.',
  'WEAK_PASSWORD': 'Password is too weak. Please choose a stronger password.',
  'EMAIL_ALREADY_EXISTS': 'An account with this email already exists.',
  'SESSION_EXPIRED': 'Your session has expired. Please log in again.',
  
  // Database errors
  'PGRST116': 'The requested data was not found.',
  '23505': 'This record already exists.',
  '23503': 'Cannot delete this record because it is referenced by other data.',
  '23502': 'Required information is missing.',
  '42P01': 'Database table not found. Please contact support.',
  
  // Permission errors
  'INSUFFICIENT_PRIVILEGES': 'You do not have permission to perform this action.',
  'ROW_LEVEL_SECURITY': 'Access denied. You can only access your own data.',
  
  // Generic fallback
  'UNKNOWN_ERROR': 'An unexpected error occurred. Please try again or contact support.'
}

/**
 * Classify Supabase errors based on error codes and messages
 */
export function classifySupabaseError(error) {
  if (!error) return 'UNKNOWN_ERROR'
  
  // Connection and network errors
  if (error.name === 'AbortError' || error.message?.includes('aborted')) {
    return 'TIMEOUT_ERROR'
  }
  
  if (error.name === 'TypeError' && error.message?.includes('fetch')) {
    return 'CONNECTION_ERROR'
  }
  
  // Supabase-specific error codes
  if (error.code) {
    return error.code
  }
  
  // Auth errors
  if (error.message?.includes('Invalid login credentials')) {
    return 'INVALID_CREDENTIALS'
  }
  
  if (error.message?.includes('User not found')) {
    return 'USER_NOT_FOUND'
  }
  
  if (error.message?.includes('Email not confirmed')) {
    return 'EMAIL_NOT_CONFIRMED'
  }
  
  if (error.message?.includes('Password should be')) {
    return 'WEAK_PASSWORD'
  }
  
  if (error.message?.includes('User already registered')) {
    return 'EMAIL_ALREADY_EXISTS'
  }
  
  if (error.message?.includes('JWT expired')) {
    return 'SESSION_EXPIRED'
  }
  
  // Permission errors
  if (error.message?.includes('insufficient_privilege')) {
    return 'INSUFFICIENT_PRIVILEGES'
  }
  
  if (error.message?.includes('row-level security')) {
    return 'ROW_LEVEL_SECURITY'
  }
  
  return 'UNKNOWN_ERROR'
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error) {
  const errorCode = classifySupabaseError(error)
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES['UNKNOWN_ERROR']
}

/**
 * Handle Supabase errors with proper classification and logging
 */
export function handleSupabaseError(error, context = '') {
  const errorCode = classifySupabaseError(error)
  const userMessage = getErrorMessage(error)
  
  // Log error details for debugging
  console.error(`Supabase error${context ? ` in ${context}` : ''}:`, {
    code: errorCode,
    message: error.message,
    details: error.details,
    hint: error.hint,
    originalError: error
  })
  
  // Create appropriate error type
  switch (errorCode) {
    case 'CONNECTION_ERROR':
    case 'TIMEOUT_ERROR':
      return new SupabaseConnectionError(userMessage, error)
    
    case 'INVALID_CREDENTIALS':
    case 'USER_NOT_FOUND':
    case 'EMAIL_NOT_CONFIRMED':
    case 'WEAK_PASSWORD':
    case 'EMAIL_ALREADY_EXISTS':
    case 'SESSION_EXPIRED':
      return new SupabaseAuthError(userMessage, errorCode, error)
    
    default:
      return new SupabaseDataError(userMessage, errorCode, error.details, error)
  }
}

/**
 * Retry configuration for different types of operations
 */
const RETRY_CONFIG = {
  default: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffFactor: 2
  },
  auth: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
    backoffFactor: 2
  },
  realtime: {
    maxRetries: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2
  }
}

/**
 * Execute Supabase operation with retry logic
 */
export async function withRetry(operation, options = {}) {
  const config = { ...RETRY_CONFIG.default, ...options }
  let lastError = null
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation()
      return result
    } catch (error) {
      lastError = error
      const errorCode = classifySupabaseError(error)
      
      // Don't retry certain types of errors
      if (shouldNotRetry(errorCode)) {
        throw handleSupabaseError(error, options.context)
      }
      
      // If this is the last attempt, throw the error
      if (attempt === config.maxRetries) {
        throw handleSupabaseError(error, options.context)
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffFactor, attempt - 1),
        config.maxDelay
      )
      
      console.warn(`Supabase operation failed (attempt ${attempt}/${config.maxRetries}), retrying in ${delay}ms:`, error.message)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw handleSupabaseError(lastError, options.context)
}

/**
 * Determine if an error should not be retried
 */
function shouldNotRetry(errorCode) {
  const nonRetryableErrors = [
    'INVALID_CREDENTIALS',
    'USER_NOT_FOUND',
    'EMAIL_NOT_CONFIRMED',
    'WEAK_PASSWORD',
    'EMAIL_ALREADY_EXISTS',
    'INSUFFICIENT_PRIVILEGES',
    'ROW_LEVEL_SECURITY',
    '23505', // Unique constraint violation
    '23502', // Not null constraint violation
    'PGRST116' // Not found
  ]
  
  return nonRetryableErrors.includes(errorCode)
}

/**
 * Wrapper for Supabase operations with comprehensive error handling
 */
export async function executeSupabaseOperation(operation, context = '', retryOptions = {}) {
  try {
    return await withRetry(operation, { context, ...retryOptions })
  } catch (error) {
    // If it's already a handled error, re-throw it
    if (error instanceof SupabaseError) {
      throw error
    }
    
    // Otherwise, handle it
    throw handleSupabaseError(error, context)
  }
}

/**
 * Utility to check if an error is retryable
 */
export function isRetryableError(error) {
  const errorCode = classifySupabaseError(error)
  return !shouldNotRetry(errorCode)
}

/**
 * Utility to extract error details for logging
 */
export function extractErrorDetails(error) {
  return {
    name: error.name,
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
    timestamp: new Date().toISOString(),
    stack: error.stack
  }
}

/**
 * Development helper to simulate network errors for testing
 */
export function simulateNetworkError() {
  if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_SIMULATE_ERRORS === 'true') {
    if (Math.random() < 0.1) { // 10% chance
      throw new Error('Simulated network error for testing')
    }
  }
}