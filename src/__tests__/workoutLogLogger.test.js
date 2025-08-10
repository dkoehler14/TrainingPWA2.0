/**
 * Tests for Workout Log Comprehensive Logging System
 * 
 * Tests the structured logging, performance tracking, and metrics collection
 * functionality of the workout log logging system.
 */

const { 
  WorkoutLogLogger, 
  LogLevel, 
  OperationType,
  workoutLogLogger,
  logInfo,
  logError,
  logCacheOperation,
  logExerciseOperation,
  startTimer,
  endTimer
} = require('../utils/workoutLogLogger');

describe('WorkoutLogLogger', () => {
  let logger;

  beforeEach(() => {
    logger = new WorkoutLogLogger({
      enableConsoleOutput: false, // Disable console output for tests
      enablePerformanceTracking: true,
      enableMetrics: true,
      logLevel: LogLevel.DEBUG
    });
  });

  afterEach(() => {
    logger.clearHistory();
    logger.resetMetrics();
  });

  describe('Basic Logging', () => {
    test('should log messages with correct structure', () => {
      const logEntry = logger.info(OperationType.CREATE, 'Test message', {
        userId: 'test-user',
        workoutLogId: 'test-workout'
      });

      expect(logEntry).toMatchObject({
        level: LogLevel.INFO,
        operation: OperationType.CREATE,
        message: 'Test message',
        metadata: expect.objectContaining({
          userId: 'test-user',
          workoutLogId: 'test-workout'
        })
      });

      expect(logEntry.id).toBeDefined();
      expect(logEntry.timestamp).toBeDefined();
    });

    test('should respect log level filtering', () => {
      const restrictiveLogger = new WorkoutLogLogger({
        enableConsoleOutput: false,
        logLevel: LogLevel.ERROR
      });

      const debugEntry = restrictiveLogger.debug(OperationType.CREATE, 'Debug message');
      const errorEntry = restrictiveLogger.error(OperationType.CREATE, 'Error message');

      expect(debugEntry).toBeUndefined();
      expect(errorEntry).toBeDefined();
    });

    test('should handle error logging with stack traces', () => {
      const testError = new Error('Test error');
      testError.type = 'test_error';

      const logEntry = logger.error(OperationType.ERROR_OCCURRED, 'Error occurred', {
        userId: 'test-user'
      }, testError);

      expect(logEntry.metadata.error).toMatchObject({
        name: 'Error',
        message: 'Test error',
        type: 'test_error'
      });
    });
  });

  describe('Cache Operation Logging', () => {
    test('should log cache hit operations', () => {
      const logEntry = logger.logCacheOperation(
        OperationType.CACHE_HIT,
        'test_cache_key',
        true,
        { workoutLogId: 'test-workout' }
      );

      expect(logEntry).toMatchObject({
        level: LogLevel.INFO,
        operation: OperationType.CACHE_HIT,
        metadata: expect.objectContaining({
          cacheKey: 'test_cache_key',
          result: 'success',
          workoutLogId: 'test-workout'
        })
      });
    });

    test('should log cache miss operations', () => {
      const logEntry = logger.logCacheOperation(
        OperationType.CACHE_MISS,
        'missing_key',
        false
      );

      expect(logEntry).toMatchObject({
        level: LogLevel.DEBUG,
        operation: OperationType.CACHE_MISS,
        metadata: expect.objectContaining({
          cacheKey: 'missing_key',
          result: 'failure'
        })
      });
    });

    test('should log cache validation operations', () => {
      const logEntry = logger.logCacheOperation(
        OperationType.CACHE_VALIDATION,
        'validation_key',
        true,
        { validationResult: 'valid' }
      );

      expect(logEntry.metadata).toMatchObject({
        cacheKey: 'validation_key',
        result: 'success',
        validationResult: true
      });
    });
  });

  describe('Exercise Operation Logging', () => {
    test('should log exercise upsert operations', () => {
      const exerciseData = [
        { exerciseId: 'ex1', sets: 3 },
        { exerciseId: 'ex2', sets: 4 }
      ];

      const logEntry = logger.logExerciseOperation(
        OperationType.EXERCISE_UPSERT,
        exerciseData,
        true,
        { workoutLogId: 'test-workout' }
      );

      expect(logEntry).toMatchObject({
        level: LogLevel.INFO,
        operation: OperationType.EXERCISE_UPSERT,
        metadata: expect.objectContaining({
          exerciseCount: 2,
          exerciseIds: ['ex1', 'ex2'],
          result: 'success',
          workoutLogId: 'test-workout'
        })
      });
    });

    test('should handle single exercise operations', () => {
      const exerciseData = { exerciseId: 'single-ex', sets: 2 };

      const logEntry = logger.logExerciseOperation(
        OperationType.EXERCISE_CREATE,
        exerciseData,
        true
      );

      expect(logEntry.metadata).toMatchObject({
        exerciseCount: 1,
        exerciseIds: ['single-ex'],
        result: 'success'
      });
    });
  });

  describe('Performance Tracking', () => {
    test('should track operation timing', async () => {
      const timerId = logger.startTimer('test_operation', {
        userId: 'test-user'
      });

      expect(timerId).toBeDefined();
      expect(logger.activeTimers.has(timerId)).toBe(true);

      // Simulate some work
      await new Promise(resolve => setTimeout(resolve, 10));

      const timing = logger.endTimer(timerId, {
        result: 'success'
      });

      expect(timing).toMatchObject({
        operation: 'test_operation',
        duration: expect.any(Number),
        metadata: expect.objectContaining({
          userId: 'test-user',
          result: 'success'
        })
      });

      expect(timing.duration).toBeGreaterThan(0);
      expect(logger.activeTimers.has(timerId)).toBe(false);
    });

    test('should handle missing timer gracefully', () => {
      const timing = logger.endTimer('non-existent-timer');
      expect(timing).toBeNull();
    });

    test('should update performance metrics', () => {
      const timerId = logger.startTimer('metric_test');
      const timing = logger.endTimer(timerId);

      const metrics = logger.getMetrics();
      expect(metrics.performanceMetrics.totalOperations).toBe(1);
      expect(metrics.performanceMetrics.averageDuration).toBeGreaterThan(0);
      expect(metrics.performanceMetrics.slowestOperations).toHaveLength(1);
    });

    test('should log performance metrics', () => {
      const logEntry = logger.logPerformanceMetric(
        'cache_hit_ratio',
        85.5,
        '%',
        { period: '1h' }
      );

      expect(logEntry).toMatchObject({
        level: LogLevel.INFO,
        operation: OperationType.PERFORMANCE_METRIC,
        metadata: expect.objectContaining({
          metricName: 'cache_hit_ratio',
          value: 85.5,
          unit: '%',
          period: '1h'
        })
      });
    });
  });

  describe('Error Recovery Logging', () => {
    test('should log error recovery attempts', () => {
      const mockError = {
        type: 'test_error',
        errorId: 'err_123',
        recoveryStrategy: 'retry',
        recoverable: true,
        retryable: true,
        message: 'Test error message'
      };

      const logEntry = logger.logErrorWithRecovery(
        mockError,
        2, // recovery attempt
        true, // recovery result
        { userId: 'test-user' }
      );

      expect(logEntry).toMatchObject({
        level: LogLevel.INFO,
        operation: OperationType.ERROR_RECOVERY,
        metadata: expect.objectContaining({
          errorType: 'test_error',
          errorId: 'err_123',
          recoveryStrategy: 'retry',
          recoveryAttempt: 2,
          recoveryResult: 'success',
          recoverable: true,
          retryable: true,
          userId: 'test-user'
        })
      });
    });

    test('should log failed error recovery', () => {
      const mockError = {
        type: 'test_error',
        message: 'Test error message'
      };

      const logEntry = logger.logErrorWithRecovery(
        mockError,
        1,
        false // recovery failed
      );

      expect(logEntry.level).toBe(LogLevel.ERROR);
      expect(logEntry.metadata.recoveryResult).toBe('failure');
    });
  });

  describe('Constraint Violation Logging', () => {
    test('should log constraint violations with details', () => {
      const constraintDetails = {
        constraintName: 'unique_user_program_week_day',
        conflictingValues: {
          user_id: 'user123',
          program_id: 'prog456',
          week_index: 1,
          day_index: 2
        }
      };

      const logEntry = logger.logConstraintViolation(
        'unique_constraint',
        constraintDetails,
        'update_existing_record',
        { operation: 'createWorkoutLog' }
      );

      expect(logEntry).toMatchObject({
        level: LogLevel.WARN,
        operation: OperationType.CONSTRAINT_VIOLATION,
        metadata: expect.objectContaining({
          constraintType: 'unique_constraint',
          constraintDetails,
          recoveryAction: 'update_existing_record',
          operation: 'createWorkoutLog'
        })
      });
    });
  });

  describe('Metrics and History', () => {
    test('should track log metrics', () => {
      logger.info(OperationType.CREATE, 'Test 1');
      logger.error(OperationType.CREATE, 'Test 2');
      logger.warn(OperationType.UPDATE, 'Test 3');

      const metrics = logger.getMetrics();
      expect(metrics.totalLogs).toBe(3);
      expect(metrics.byLevel[LogLevel.INFO]).toBe(1);
      expect(metrics.byLevel[LogLevel.ERROR]).toBe(1);
      expect(metrics.byLevel[LogLevel.WARN]).toBe(1);
      expect(metrics.byOperation[OperationType.CREATE]).toBe(2);
      expect(metrics.byOperation[OperationType.UPDATE]).toBe(1);
    });

    test('should maintain log history', () => {
      logger.info(OperationType.CREATE, 'Test 1');
      logger.error(OperationType.UPDATE, 'Test 2');

      const history = logger.getLogHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('Test 1');
      expect(history[1].message).toBe('Test 2');
    });

    test('should filter log history', () => {
      logger.info(OperationType.CREATE, 'Info message');
      logger.error(OperationType.CREATE, 'Error message');
      logger.warn(OperationType.UPDATE, 'Warning message');

      const errorLogs = logger.getLogHistory({ level: LogLevel.ERROR });
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].message).toBe('Error message');

      const createLogs = logger.getLogHistory({ operation: OperationType.CREATE });
      expect(createLogs).toHaveLength(2);
    });

    test('should export logs with metadata', () => {
      logger.info(OperationType.CREATE, 'Test message');
      
      const exportData = logger.exportLogs();
      expect(exportData).toMatchObject({
        exportTimestamp: expect.any(String),
        totalLogs: 1,
        filters: {},
        logs: expect.arrayContaining([
          expect.objectContaining({
            message: 'Test message'
          })
        ]),
        metrics: expect.any(Object)
      });
    });
  });

  describe('Global Logger Functions', () => {
    test('should use global logger instance', () => {
      // Test that the function returns a log entry (indicating it was called)
      const logEntry = logInfo(OperationType.CREATE, 'Global test message', {
        userId: 'test-user'
      });

      // Verify the global logger was used by checking the returned log entry
      expect(logEntry).toBeDefined();
      expect(logEntry.message).toBe('Global test message');
      expect(logEntry.metadata.userId).toBe('test-user');
    });

    test('should handle cache operations through global functions', () => {
      const logEntry = logCacheOperation(OperationType.CACHE_HIT, 'test_key', true, {
        workoutLogId: 'test-workout'
      });

      expect(logEntry).toBeDefined();
      expect(logEntry.metadata.cacheKey).toBe('test_key');
      expect(logEntry.metadata.workoutLogId).toBe('test-workout');
    });

    test('should handle exercise operations through global functions', () => {
      const logEntry = logExerciseOperation(OperationType.EXERCISE_UPSERT, [
        { exerciseId: 'ex1', sets: 3 }
      ], true);

      expect(logEntry).toBeDefined();
      expect(logEntry.metadata.exerciseIds).toContain('ex1');
    });

    test('should handle timer operations through global functions', async () => {
      const timerId = startTimer('global_test_operation');
      expect(timerId).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 5));

      const timing = endTimer(timerId);
      expect(timing).toBeDefined();
      expect(timing.duration).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle undefined metadata gracefully', () => {
      const logEntry = logger.info(OperationType.CREATE, 'Test message');
      expect(logEntry.metadata).toBeDefined();
      expect(logEntry.metadata.userId).toBe('unknown');
    });

    test('should handle null exercise data', () => {
      const logEntry = logger.logExerciseOperation(
        OperationType.EXERCISE_CREATE,
        null,
        false
      );

      expect(logEntry.metadata.exerciseCount).toBe(1);
      expect(logEntry.metadata.exerciseIds).toEqual([]);
    });

    test('should handle performance tracking when disabled', () => {
      const disabledLogger = new WorkoutLogLogger({
        enablePerformanceTracking: false
      });

      const timerId = disabledLogger.startTimer('test');
      expect(timerId).toBeNull();

      const timing = disabledLogger.endTimer('fake-id');
      expect(timing).toBeNull();
    });

    test('should limit log history size', () => {
      const limitedLogger = new WorkoutLogLogger({
        maxLogHistory: 2,
        enableConsoleOutput: false
      });

      limitedLogger.info(OperationType.CREATE, 'Message 1');
      limitedLogger.info(OperationType.CREATE, 'Message 2');
      limitedLogger.info(OperationType.CREATE, 'Message 3');

      const history = limitedLogger.getLogHistory();
      expect(history).toHaveLength(2);
      expect(history[0].message).toBe('Message 2');
      expect(history[1].message).toBe('Message 3');
    });
  });
});