/**
 * Unit Tests for Supabase Error Handler
 * 
 * Tests error handling scenarios for the migrated Supabase functionality:
 * - Error classification and handling
 * - User-friendly error messages
 * - Operation execution wrapper
 */

import {
  handleSupabaseError,
  getErrorMessage,
  executeSupabaseOperation,
  SupabaseError,
  SupabaseConnectionError,
  SupabaseAuthError,
  SupabaseDataError,
  classifySupabaseError,
  withRetry,
  isRetryableError,
  extractErrorDetails
} from '../supabaseErrorHandler';

describe('Supabase Error Handler', () => {
  describe('SupabaseError classes', () => {
    it('should create SupabaseError instances', () => {
      const error = new SupabaseError('Test error', 'TEST_CODE', 'Test details', new Error('Original'));
      
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SupabaseError);
      expect(error.name).toBe('SupabaseError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toBe('Test details');
      expect(error.originalError).toBeInstanceOf(Error);
      expect(error.timestamp).toBeDefined();
    });

    it('should create SupabaseConnectionError instances', () => {
      const originalError = new Error('Network failed');
      const error = new SupabaseConnectionError('Connection failed', originalError);
      
      expect(error).toBeInstanceOf(SupabaseError);
      expect(error.name).toBe('SupabaseConnectionError');
      expect(error.code).toBe('CONNECTION_ERROR');
      expect(error.originalError).toBe(originalError);
    });

    it('should create SupabaseAuthError instances', () => {
      const originalError = new Error('Auth failed');
      const error = new SupabaseAuthError('Authentication failed', 'AUTH_ERROR', originalError);
      
      expect(error).toBeInstanceOf(SupabaseError);
      expect(error.name).toBe('SupabaseAuthError');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.originalError).toBe(originalError);
    });

    it('should create SupabaseDataError instances', () => {
      const originalError = new Error('Data error');
      const error = new SupabaseDataError('Data operation failed', 'DATA_ERROR', 'Details', originalError);
      
      expect(error).toBeInstanceOf(SupabaseError);
      expect(error.name).toBe('SupabaseDataError');
      expect(error.code).toBe('DATA_ERROR');
      expect(error.details).toBe('Details');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('classifySupabaseError', () => {
    it('should classify connection errors', () => {
      const networkError = new Error('fetch failed');
      networkError.name = 'TypeError';
      
      const result = classifySupabaseError(networkError);
      
      expect(result).toBe('CONNECTION_ERROR');
    });

    it('should classify timeout errors', () => {
      const timeoutError = new Error('Request aborted');
      timeoutError.name = 'AbortError';
      
      const result = classifySupabaseError(timeoutError);
      
      expect(result).toBe('TIMEOUT_ERROR');
    });

    it('should classify authentication errors by message', () => {
      const authError = new Error('Invalid login credentials');
      
      const result = classifySupabaseError(authError);
      
      expect(result).toBe('INVALID_CREDENTIALS');
    });

    it('should classify errors by code', () => {
      const codeError = new Error('Database error');
      codeError.code = 'PGRST116';
      
      const result = classifySupabaseError(codeError);
      
      expect(result).toBe('PGRST116');
    });

    it('should classify JWT expired errors', () => {
      const jwtError = new Error('JWT expired');
      
      const result = classifySupabaseError(jwtError);
      
      expect(result).toBe('SESSION_EXPIRED');
    });

    it('should classify permission errors', () => {
      const permissionError = new Error('insufficient_privilege');
      
      const result = classifySupabaseError(permissionError);
      
      expect(result).toBe('INSUFFICIENT_PRIVILEGES');
    });

    it('should return UNKNOWN_ERROR for unclassified errors', () => {
      const unknownError = new Error('Something went wrong');
      
      const result = classifySupabaseError(unknownError);
      
      expect(result).toBe('UNKNOWN_ERROR');
    });

    it('should handle null/undefined errors', () => {
      expect(classifySupabaseError(null)).toBe('UNKNOWN_ERROR');
      expect(classifySupabaseError(undefined)).toBe('UNKNOWN_ERROR');
    });
  });

  describe('isRetryableError', () => {
    it('should identify retryable errors', () => {
      const networkError = new Error('fetch failed');
      networkError.name = 'TypeError';
      
      expect(isRetryableError(networkError)).toBe(true);
    });

    it('should identify non-retryable errors', () => {
      const authError = new Error('Invalid login credentials');
      
      expect(isRetryableError(authError)).toBe(false);
    });

    it('should handle permission errors as non-retryable', () => {
      const permissionError = new Error('insufficient_privilege');
      
      expect(isRetryableError(permissionError)).toBe(false);
    });

    it('should handle not found errors as non-retryable', () => {
      const notFoundError = new Error('Not found');
      notFoundError.code = 'PGRST116';
      
      expect(isRetryableError(notFoundError)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should return user-friendly message for connection errors', () => {
      const error = new Error('fetch failed');
      error.name = 'TypeError';
      
      const result = getErrorMessage(error);
      
      expect(result).toContain('connect to the database');
    });

    it('should return user-friendly message for auth errors', () => {
      const error = new Error('Invalid login credentials');
      
      const result = getErrorMessage(error);
      
      expect(result).toContain('Invalid email or password');
    });

    it('should return user-friendly message for not found errors', () => {
      const error = new Error('Not found');
      error.code = 'PGRST116';
      
      const result = getErrorMessage(error);
      
      expect(result).toContain('not found');
    });

    it('should return fallback message for unknown errors', () => {
      const error = new Error('Unknown error');
      
      const result = getErrorMessage(error);
      
      expect(result).toBe('An unexpected error occurred. Please try again or contact support.');
    });

    it('should handle session expired errors', () => {
      const error = new Error('JWT expired');
      
      const result = getErrorMessage(error);
      
      expect(result).toContain('session has expired');
    });
  });

  describe('handleSupabaseError', () => {
    it('should handle connection errors', () => {
      const error = new Error('fetch failed');
      error.name = 'TypeError';
      
      const result = handleSupabaseError(error, 'loading workout data');
      
      expect(result).toBeInstanceOf(SupabaseConnectionError);
      expect(result.message).toContain('connect to the database');
      expect(result.originalError).toBe(error);
    });

    it('should handle authentication errors', () => {
      const error = new Error('Invalid login credentials');
      
      const result = handleSupabaseError(error, 'authenticating user');
      
      expect(result).toBeInstanceOf(SupabaseAuthError);
      expect(result.message).toContain('Invalid email or password');
      expect(result.originalError).toBe(error);
    });

    it('should handle data errors', () => {
      const error = new Error('Database constraint violation');
      error.code = '23505';
      
      const result = handleSupabaseError(error, 'saving data');
      
      expect(result).toBeInstanceOf(SupabaseDataError);
      expect(result.message).toContain('already exists');
      expect(result.originalError).toBe(error);
    });

    it('should handle timeout errors', () => {
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      
      const result = handleSupabaseError(error, 'fetching data');
      
      expect(result).toBeInstanceOf(SupabaseConnectionError);
      expect(result.message).toContain('took too long');
      expect(result.originalError).toBe(error);
    });

    it('should handle unknown errors as data errors', () => {
      const error = new Error('Unknown error');
      
      const result = handleSupabaseError(error, 'unknown operation');
      
      expect(result).toBeInstanceOf(SupabaseDataError);
      expect(result.message).toContain('unexpected error');
      expect(result.originalError).toBe(error);
    });
  });

  describe('executeSupabaseOperation', () => {
    it('should execute successful operations', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success result');
      
      const result = await executeSupabaseOperation(mockOperation, 'test operation');
      
      expect(result).toBe('success result');
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should handle and transform errors with retry', async () => {
      const error = new Error('fetch failed');
      error.name = 'TypeError';
      
      const mockOperation = jest.fn().mockRejectedValue(error);
      
      await expect(
        executeSupabaseOperation(mockOperation, 'test operation')
      ).rejects.toThrow(SupabaseConnectionError);
      
      // Should retry connection errors
      expect(mockOperation).toHaveBeenCalledTimes(3); // Default max retries
    });

    it('should not retry non-retryable errors', async () => {
      const error = new Error('Invalid login credentials');
      const mockOperation = jest.fn().mockRejectedValue(error);
      
      await expect(
        executeSupabaseOperation(mockOperation, 'test operation')
      ).rejects.toThrow(SupabaseAuthError);
      
      // Should not retry auth errors
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should preserve SupabaseError instances', async () => {
      const supabaseError = new SupabaseError('Already handled');
      const mockOperation = jest.fn().mockRejectedValue(supabaseError);
      
      await expect(
        executeSupabaseOperation(mockOperation, 'test operation')
      ).rejects.toThrow(SupabaseError);
    });

    it('should handle synchronous operations', async () => {
      const mockOperation = jest.fn().mockReturnValue('sync result');
      
      const result = await executeSupabaseOperation(mockOperation, 'sync operation');
      
      expect(result).toBe('sync result');
    });

    it('should work without context parameter', async () => {
      const mockOperation = jest.fn().mockResolvedValue('result');
      
      const result = await executeSupabaseOperation(mockOperation);
      
      expect(result).toBe('result');
    });
  });

  describe('extractErrorDetails', () => {
    it('should extract comprehensive error details', () => {
      const error = new Error('Test error');
      error.code = 'TEST_CODE';
      error.details = 'Test details';
      error.hint = 'Test hint';
      
      const result = extractErrorDetails(error);
      
      expect(result).toEqual({
        name: 'Error',
        message: 'Test error',
        code: 'TEST_CODE',
        details: 'Test details',
        hint: 'Test hint',
        timestamp: expect.any(String),
        stack: expect.any(String)
      });
    });

    it('should handle errors without optional properties', () => {
      const error = new Error('Simple error');
      
      const result = extractErrorDetails(error);
      
      expect(result.name).toBe('Error');
      expect(result.message).toBe('Simple error');
      expect(result.code).toBeUndefined();
      expect(result.details).toBeUndefined();
      expect(result.hint).toBeUndefined();
      expect(result.timestamp).toBeDefined();
      expect(result.stack).toBeDefined();
    });
  });

  describe('withRetry', () => {
    it('should retry retryable operations', async () => {
      const error = new Error('fetch failed');
      error.name = 'TypeError';
      
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce('success');
      
      const result = await withRetry(mockOperation, { context: 'test' });
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable operations', async () => {
      const error = new Error('Invalid login credentials');
      const mockOperation = jest.fn().mockRejectedValue(error);
      
      await expect(
        withRetry(mockOperation, { context: 'test' })
      ).rejects.toThrow(SupabaseAuthError);
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should respect max retry limit', async () => {
      const error = new Error('fetch failed');
      error.name = 'TypeError';
      
      const mockOperation = jest.fn().mockRejectedValue(error);
      
      await expect(
        withRetry(mockOperation, { maxRetries: 2, context: 'test' })
      ).rejects.toThrow(SupabaseConnectionError);
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Integration Scenarios', () => {
    it('should handle workout log creation errors', () => {
      const dbError = new Error('duplicate key value');
      dbError.code = '23505';
      
      const result = handleSupabaseError(dbError, 'creating workout log');
      
      expect(result).toBeInstanceOf(SupabaseDataError);
      expect(result.message).toContain('already exists');
      expect(result.originalError).toBe(dbError);
    });

    it('should handle program loading errors', () => {
      const networkError = new Error('fetch failed');
      networkError.name = 'TypeError';
      
      const result = handleSupabaseError(networkError, 'loading user programs');
      
      expect(result).toBeInstanceOf(SupabaseConnectionError);
      expect(result.message).toContain('connect to the database');
      expect(isRetryableError(networkError)).toBe(true);
    });

    it('should handle exercise replacement errors', () => {
      const permissionError = new Error('insufficient_privilege');
      
      const result = handleSupabaseError(permissionError, 'replacing exercise in program');
      
      expect(result).toBeInstanceOf(SupabaseDataError);
      expect(result.message).toContain('permission');
      expect(isRetryableError(permissionError)).toBe(false);
    });

    it('should handle workout completion errors', () => {
      const validationError = new Error('Not found');
      validationError.code = 'PGRST116';
      
      const result = handleSupabaseError(validationError, 'completing workout');
      
      expect(result).toBeInstanceOf(SupabaseDataError);
      expect(result.message).toContain('not found');
      expect(isRetryableError(validationError)).toBe(false);
    });

    it('should handle session expiration', () => {
      const sessionError = new Error('JWT expired');
      
      const result = handleSupabaseError(sessionError, 'accessing protected resource');
      
      expect(result).toBeInstanceOf(SupabaseAuthError);
      expect(result.message).toContain('session has expired');
      expect(isRetryableError(sessionError)).toBe(false);
    });
  });
});