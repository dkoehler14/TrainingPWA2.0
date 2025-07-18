/**
 * Tests for error handling and recovery mechanisms
 */

const { 
  SeedingError, 
  RecoveryError, 
  OperationTracker, 
  ErrorHandler,
  createErrorHandler,
  handleEmulatorError,
  handleValidationErrors,
  withErrorHandling
} = require('../error-handling');
const { ValidationError } = require('../validation');

describe('Error Handling and Recovery', () => {
  describe('SeedingError', () => {
    test('should create seeding error with all properties', () => {
      const originalError = new Error('Original error');
      const seedingError = new SeedingError(
        'Test seeding error',
        'testOperation',
        { testContext: 'value' },
        originalError
      );

      expect(seedingError.name).toBe('SeedingError');
      expect(seedingError.message).toBe('Test seeding error');
      expect(seedingError.operation).toBe('testOperation');
      expect(seedingError.context).toEqual({ testContext: 'value' });
      expect(seedingError.originalError).toBe(originalError);
      expect(seedingError.recoverable).toBe(true);
      expect(seedingError.timestamp).toBeInstanceOf(Date);
    });

    test('should serialize to JSON correctly', () => {
      const originalError = new Error('Original error');
      originalError.code = 'TEST_CODE';
      
      const seedingError = new SeedingError(
        'Test error',
        'testOp',
        { test: true },
        originalError
      );

      const json = seedingError.toJSON();
      
      expect(json.name).toBe('SeedingError');
      expect(json.message).toBe('Test error');
      expect(json.operation).toBe('testOp');
      expect(json.context).toEqual({ test: true });
      expect(json.originalError.name).toBe('Error');
      expect(json.originalError.message).toBe('Original error');
      expect(json.originalError.code).toBe('TEST_CODE');
      expect(json.recoverable).toBe(true);
    });
  });

  describe('RecoveryError', () => {
    test('should create recovery error with failed operations', () => {
      const originalErrors = [
        new SeedingError('Error 1', 'op1'),
        new SeedingError('Error 2', 'op2')
      ];
      
      const recoveryError = new RecoveryError(
        'Recovery failed',
        ['operation1', 'operation2'],
        originalErrors
      );

      expect(recoveryError.name).toBe('RecoveryError');
      expect(recoveryError.message).toBe('Recovery failed');
      expect(recoveryError.failedOperations).toEqual(['operation1', 'operation2']);
      expect(recoveryError.originalErrors).toEqual(originalErrors);
    });
  });

  describe('OperationTracker', () => {
    let tracker;

    beforeEach(() => {
      tracker = new OperationTracker();
    });

    test('should track operation lifecycle', () => {
      // Start operation
      tracker.startOperation('testOp', { test: true });
      expect(tracker.currentOperation).toBeTruthy();
      expect(tracker.currentOperation.name).toBe('testOp');
      expect(tracker.currentOperation.status).toBe('in_progress');

      // Complete operation
      tracker.completeOperation({ result: 'success' });
      expect(tracker.currentOperation).toBeNull();
      expect(tracker.completedOperations).toHaveLength(1);
      expect(tracker.completedOperations[0].status).toBe('completed');
      expect(tracker.completedOperations[0].result).toEqual({ result: 'success' });
    });

    test('should track failed operations', () => {
      const error = new Error('Test error');
      
      tracker.startOperation('failedOp');
      tracker.failOperation(error);

      expect(tracker.currentOperation).toBeNull();
      expect(tracker.failedOperations).toHaveLength(1);
      expect(tracker.failedOperations[0].status).toBe('failed');
      expect(tracker.failedOperations[0].error).toBe(error);
    });

    test('should provide operations for rollback in reverse order', () => {
      tracker.startOperation('op1');
      tracker.completeOperation();
      
      tracker.startOperation('op2');
      tracker.completeOperation();
      
      tracker.startOperation('op3');
      tracker.completeOperation();

      const rollbackOps = tracker.getOperationsForRollback();
      expect(rollbackOps).toHaveLength(3);
      expect(rollbackOps[0].name).toBe('op3');
      expect(rollbackOps[1].name).toBe('op2');
      expect(rollbackOps[2].name).toBe('op1');
    });

    test('should provide comprehensive summary', () => {
      tracker.startOperation('op1');
      tracker.completeOperation({ data: 'test1' });
      
      tracker.startOperation('op2');
      tracker.failOperation(new Error('Failed'));

      const summary = tracker.getSummary();
      
      expect(summary.totalOperations).toBe(2);
      expect(summary.completedOperations).toBe(1);
      expect(summary.failedOperations).toBe(1);
      expect(summary.operations.completed).toHaveLength(1);
      expect(summary.operations.failed).toHaveLength(1);
      expect(summary.operations.completed[0].result).toEqual({ data: 'test1' });
      expect(summary.operations.failed[0].error).toBe('Failed');
    });
  });

  describe('ErrorHandler', () => {
    let errorHandler;

    beforeEach(() => {
      errorHandler = new ErrorHandler({
        maxRetries: 2,
        retryDelay: 10, // Short delay for tests
        verbose: false
      });
    });

    test('should execute operation successfully', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await errorHandler.executeWithRetry('testOp', operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(errorHandler.getTracker().completedOperations).toHaveLength(1);
    });

    test('should retry on retryable errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue('success');
      
      const result = await errorHandler.executeWithRetry('testOp', operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Persistent error'));
      
      await expect(
        errorHandler.executeWithRetry('testOp', operation)
      ).rejects.toThrow(SeedingError);
      
      expect(operation).toHaveBeenCalledTimes(2); // maxRetries
      expect(errorHandler.getTracker().failedOperations).toHaveLength(1);
    });

    test('should not retry non-retryable errors', async () => {
      const validationError = new ValidationError('Invalid data');
      const operation = jest.fn().mockRejectedValue(validationError);
      
      await expect(
        errorHandler.executeWithRetry('testOp', operation)
      ).rejects.toThrow(SeedingError);
      
      expect(operation).toHaveBeenCalledTimes(1); // No retries
    });

    test('should execute with validation', async () => {
      const operation = jest.fn().mockResolvedValue({ valid: true });
      const validator = jest.fn().mockReturnValue({ isValid: true, errors: [] });
      
      const result = await errorHandler.executeWithValidation('testOp', operation, validator);
      
      expect(result).toEqual({ valid: true });
      expect(validator).toHaveBeenCalledWith({ valid: true });
    });

    test('should fail validation and not retry', async () => {
      const operation = jest.fn()
        .mockResolvedValue({ valid: false });
      
      const validator = jest.fn()
        .mockReturnValue({ isValid: false, errors: [{ message: 'Invalid' }] });
      
      await expect(
        errorHandler.executeWithValidation('testOp', operation, validator)
      ).rejects.toThrow(SeedingError);
      
      expect(operation).toHaveBeenCalledTimes(1); // Validation errors are not retryable
    });
  });

  describe('Error Handling Utilities', () => {
    test('should handle emulator connection errors', () => {
      const connectionError = new Error('Connection refused');
      connectionError.code = 'ECONNREFUSED';
      connectionError.port = 9099;
      
      const seedingError = handleEmulatorError(connectionError, 'auth');
      
      expect(seedingError).toBeInstanceOf(SeedingError);
      expect(seedingError.message).toContain('auth emulator connection failed');
      expect(seedingError.message).toContain('Make sure auth emulator is running');
      expect(seedingError.operation).toBe('emulator_connection');
      expect(seedingError.recoverable).toBe(false);
    });

    test('should handle validation errors', () => {
      const validationErrors = [
        new ValidationError('Field required', 'name', null),
        new ValidationError('Invalid format', 'email', 'invalid-email')
      ];
      
      const seedingError = handleValidationErrors(validationErrors, 'user creation');
      
      expect(seedingError).toBeInstanceOf(SeedingError);
      expect(seedingError.message).toContain('Validation failed in user creation');
      expect(seedingError.message).toContain('name: Field required');
      expect(seedingError.message).toContain('email: Invalid format');
      expect(seedingError.operation).toBe('validation');
      expect(seedingError.recoverable).toBe(false);
    });

    test('should wrap function with error handling', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const wrappedFn = withErrorHandling(mockFn, 'testOperation', { maxRetries: 1 });
      
      const result = await wrappedFn('arg1', 'arg2');
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('Error Classification', () => {
    let errorHandler;

    beforeEach(() => {
      errorHandler = new ErrorHandler();
    });

    test('should identify retryable network errors', () => {
      const networkErrors = [
        { code: 'ECONNREFUSED' },
        { code: 'ENOTFOUND' },
        { code: 'ETIMEDOUT' },
        { code: 'unavailable' },
        { code: 'deadline-exceeded' },
        { code: 'resource-exhausted' },
        { message: 'rate limit exceeded' }
      ];

      networkErrors.forEach(error => {
        expect(errorHandler.isRetryableError(error)).toBe(true);
      });
    });

    test('should identify non-retryable errors', () => {
      const nonRetryableErrors = [
        new ValidationError('Invalid data'),
        { code: 'permission-denied', message: 'Access denied' },
        { code: 'not-found', message: 'Resource not found' }
      ];

      // ValidationError should not be retryable
      expect(errorHandler.isRetryableError(nonRetryableErrors[0])).toBe(false);
      
      // Other errors default to retryable
      expect(errorHandler.isRetryableError(nonRetryableErrors[1])).toBe(true);
      expect(errorHandler.isRetryableError(nonRetryableErrors[2])).toBe(true);
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete failure scenario with recovery', async () => {
      const errorHandler = new ErrorHandler({ enableRecovery: true, verbose: false });
      
      // Mock successful operations followed by failure
      errorHandler.getTracker().startOperation('op1');
      errorHandler.getTracker().completeOperation({ data: 'op1' });
      
      errorHandler.getTracker().startOperation('op2');
      errorHandler.getTracker().completeOperation({ data: 'op2' });
      
      const failureError = new Error('Critical failure');
      
      // Mock the recovery cleanup to succeed
      errorHandler.rollbackOperation = jest.fn().mockResolvedValue();
      
      const recoveryResult = await errorHandler.handlePartialFailure(failureError, {
        skipConfirmation: true,
        forceCleanup: true
      });
      
      expect(recoveryResult.recovered).toBe(true);
      expect(recoveryResult.cleanupPerformed).toBe(true);
      expect(recoveryResult.summary.completedOperations).toBe(2);
    });

    test('should handle recovery failure', async () => {
      const errorHandler = new ErrorHandler({ enableRecovery: true });
      
      // Setup completed operations
      errorHandler.getTracker().startOperation('op1');
      errorHandler.getTracker().completeOperation();
      
      // Mock rollback to fail
      errorHandler.rollbackOperation = jest.fn().mockRejectedValue(new Error('Rollback failed'));
      
      const originalError = new Error('Original failure');
      
      await expect(
        errorHandler.handlePartialFailure(originalError, {
          skipConfirmation: true,
          forceCleanup: true
        })
      ).rejects.toThrow(RecoveryError);
    });

    test('should handle partial seeding with selective recovery', async () => {
      const errorHandler = new ErrorHandler({ enableRecovery: true, verbose: false });
      
      // Simulate partial seeding success
      errorHandler.getTracker().startOperation('seedExercises');
      errorHandler.getTracker().completeOperation({ totalExercises: 50 });
      
      errorHandler.getTracker().startOperation('seedUsers');
      errorHandler.getTracker().completeOperation([
        { uid: 'user1', email: 'test1@example.com' },
        { uid: 'user2', email: 'test2@example.com' }
      ]);
      
      // Mock rollback functions
      errorHandler.rollbackExercises = jest.fn().mockResolvedValue();
      errorHandler.rollbackUsers = jest.fn().mockResolvedValue();
      
      const failureError = new SeedingError('Program seeding failed', 'seedPrograms');
      
      const recoveryResult = await errorHandler.handlePartialFailure(failureError, {
        skipConfirmation: true,
        forceCleanup: true
      });
      
      expect(recoveryResult.recovered).toBe(true);
      expect(errorHandler.rollbackUsers).toHaveBeenCalled();
      expect(errorHandler.rollbackExercises).toHaveBeenCalled();
    });

    test('should handle network connectivity issues with appropriate retries', async () => {
      const errorHandler = new ErrorHandler({ maxRetries: 3, retryDelay: 10 });
      
      // Simulate network issues that resolve after retries
      let attemptCount = 0;
      const networkOperation = jest.fn().mockImplementation(() => {
        attemptCount++;
        if (attemptCount < 3) {
          const error = new Error('Network timeout');
          error.code = 'ETIMEDOUT';
          throw error;
        }
        return { success: true, data: 'network operation completed' };
      });
      
      const result = await errorHandler.executeWithRetry('networkOp', networkOperation);
      
      expect(result.success).toBe(true);
      expect(networkOperation).toHaveBeenCalledTimes(3);
      expect(errorHandler.getTracker().completedOperations).toHaveLength(1);
    });

    test('should handle validation failures without retries', async () => {
      const errorHandler = new ErrorHandler({ maxRetries: 3 });
      
      const validationOperation = jest.fn().mockImplementation(() => {
        throw new ValidationError('Invalid data structure', 'testField', 'invalidValue');
      });
      
      await expect(
        errorHandler.executeWithRetry('validationOp', validationOperation)
      ).rejects.toThrow(SeedingError);
      
      // Should not retry validation errors
      expect(validationOperation).toHaveBeenCalledTimes(1);
      expect(errorHandler.getTracker().failedOperations).toHaveLength(1);
    });

    test('should handle mixed success and failure scenarios', async () => {
      const errorHandler = new ErrorHandler({ enableRecovery: true });
      
      // Successful operation
      const result1 = await errorHandler.executeWithRetry('op1', 
        jest.fn().mockResolvedValue({ success: true }));
      expect(result1.success).toBe(true);
      
      // Failed operation with recovery
      errorHandler.rollbackOperation = jest.fn().mockResolvedValue();
      
      const failedOperation = jest.fn().mockRejectedValue(new Error('Operation failed'));
      
      await expect(
        errorHandler.executeWithRetry('op2', failedOperation)
      ).rejects.toThrow(SeedingError);
      
      const summary = errorHandler.getTracker().getSummary();
      expect(summary.completedOperations).toBe(1);
      expect(summary.failedOperations).toBe(1);
    });
  });
});