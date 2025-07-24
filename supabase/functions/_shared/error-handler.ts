import { corsHeaders } from './cors.ts'
import { createLogger } from './logger.ts'

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  DATABASE_ERROR = 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export interface ErrorDetails {
  code: ErrorCode
  message: string
  details?: any
  statusCode?: number
}

export class EdgeFunctionError extends Error {
  public code: ErrorCode
  public statusCode: number
  public details?: any

  constructor(code: ErrorCode, message: string, statusCode: number = 500, details?: any) {
    super(message)
    this.name = 'EdgeFunctionError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export class ErrorHandler {
  private logger = createLogger('ErrorHandler')

  handleError(error: unknown, functionName: string, userId?: string): Response {
    this.logger.error(`Error in ${functionName}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId,
      functionName
    })

    if (error instanceof EdgeFunctionError) {
      return this.createErrorResponse(error.code, error.message, error.statusCode, error.details)
    }

    // Handle common error types
    if (error instanceof Error) {
      if (error.message.includes('JWT')) {
        return this.createErrorResponse(
          ErrorCode.AUTHENTICATION_ERROR,
          'Invalid authentication token',
          401
        )
      }

      if (error.message.includes('permission') || error.message.includes('unauthorized')) {
        return this.createErrorResponse(
          ErrorCode.AUTHORIZATION_ERROR,
          'Insufficient permissions',
          403
        )
      }

      if (error.message.includes('not found')) {
        return this.createErrorResponse(
          ErrorCode.NOT_FOUND,
          'Resource not found',
          404
        )
      }

      if (error.message.includes('database') || error.message.includes('postgres')) {
        return this.createErrorResponse(
          ErrorCode.DATABASE_ERROR,
          'Database operation failed',
          500,
          { originalError: error.message }
        )
      }
    }

    // Default internal server error
    return this.createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      'An unexpected error occurred',
      500
    )
  }

  private createErrorResponse(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: any
  ): Response {
    const errorResponse = {
      error: {
        code,
        message,
        details,
        timestamp: new Date().toISOString()
      }
    }

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: statusCode,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    )
  }

  // Validation error helper
  static validationError(message: string, details?: any): EdgeFunctionError {
    return new EdgeFunctionError(ErrorCode.VALIDATION_ERROR, message, 400, details)
  }

  // Authentication error helper
  static authenticationError(message: string = 'Authentication required'): EdgeFunctionError {
    return new EdgeFunctionError(ErrorCode.AUTHENTICATION_ERROR, message, 401)
  }

  // Authorization error helper
  static authorizationError(message: string = 'Insufficient permissions'): EdgeFunctionError {
    return new EdgeFunctionError(ErrorCode.AUTHORIZATION_ERROR, message, 403)
  }

  // Not found error helper
  static notFoundError(message: string = 'Resource not found'): EdgeFunctionError {
    return new EdgeFunctionError(ErrorCode.NOT_FOUND, message, 404)
  }

  // Database error helper
  static databaseError(message: string, details?: any): EdgeFunctionError {
    return new EdgeFunctionError(ErrorCode.DATABASE_ERROR, message, 500, details)
  }

  // Rate limit error helper
  static rateLimitError(message: string = 'Rate limit exceeded'): EdgeFunctionError {
    return new EdgeFunctionError(ErrorCode.RATE_LIMIT_ERROR, message, 429)
  }
}

export const errorHandler = new ErrorHandler()

// Wrapper function for handling async operations
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  functionName: string,
  userId?: string
): Promise<T | Response> {
  try {
    return await operation()
  } catch (error) {
    return errorHandler.handleError(error, functionName, userId)
  }
}

// Rate limiting helper
export class RateLimiter {
  private requests = new Map<string, number[]>()
  private readonly windowMs: number
  private readonly maxRequests: number

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
  }

  isRateLimited(identifier: string): boolean {
    const now = Date.now()
    const windowStart = now - this.windowMs

    // Get existing requests for this identifier
    const requests = this.requests.get(identifier) || []
    
    // Filter out old requests
    const recentRequests = requests.filter(timestamp => timestamp > windowStart)
    
    // Update the requests array
    this.requests.set(identifier, recentRequests)

    // Check if rate limit is exceeded
    if (recentRequests.length >= this.maxRequests) {
      return true
    }

    // Add current request
    recentRequests.push(now)
    this.requests.set(identifier, recentRequests)

    return false
  }

  cleanup() {
    const now = Date.now()
    const windowStart = now - this.windowMs

    for (const [identifier, requests] of this.requests.entries()) {
      const recentRequests = requests.filter(timestamp => timestamp > windowStart)
      if (recentRequests.length === 0) {
        this.requests.delete(identifier)
      } else {
        this.requests.set(identifier, recentRequests)
      }
    }
  }
}

// Global rate limiter instance
export const globalRateLimiter = new RateLimiter()

// Cleanup rate limiter every 5 minutes
setInterval(() => {
  globalRateLimiter.cleanup()
}, 5 * 60 * 1000)