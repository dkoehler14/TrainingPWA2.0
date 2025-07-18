/**
 * Error handling utilities for seeding operations
 * 
 * This module provides comprehensive error handling, recovery mechanisms,
 * and graceful failure handling for the seeding process.
 */

const { logProgress, logError } = require('./logger');
const { ValidationError } = require('./validation');

/**
 * Seeding error class for structured error handling
 */
class SeedingError extends Error {
  constructor(message, operation = null, context = null, originalError = null) {
    super(message);
    this.name = 'SeedingError';
    this.operation = operation;
    this.context = context;
    this.originalError = originalError;
    this.timestamp = new Date();
    this.recoverable = true; // Most seeding errors are recoverable
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      operation: this.operation,
      context: this.context,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        code: this.originalError.code
      } : null,
      timestamp: this.timestamp,
      recoverable: this.recoverable
    };
  }
}

/**
 * Recovery error class for unrecoverable failures
 */
class RecoveryError extends Error {
  constructor(message, failedOperations = [], originalErrors = []) {
    super(message);
    this.name = 'RecoveryError';
    this.failedOperations = failedOperations;
    this.originalErrors = originalErrors;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      failedOperations: this.failedOperations,
      originalErrors: this.originalErrors.map(err => ({
        name: err.name,
        message: err.message,
        operation: err.operation
      })),
      timestamp: this.timestamp
    };
  }
}

/**
 * Operation tracker for managing seeding state and recovery
 */
class OperationTracker {
  constructor() {
    this.completedOperations = [];
    this.failedOperations = [];
    this.currentOperation = null;
    this.startTime = Date.now();
  }

  /**
   * Start tracking an operation
   * @param {string} operation - Operation name
   * @param {Object} context - Operation context
   */
  startOperation(operation, context = {}) {
    this.currentOperation = {
      name: operation,
      context,
      startTime: Date.now(),
      status: 'in_progress'
    };
    
    logProgress(`Starting operation: ${operation}`, 'info');
  }

  /**
   * Mark current operation as completed
   * @param {Object} result - Operation result
   */
  completeOperation(result = {}) {
    if (!this.currentOperation) {
      throw new Error('No operation in progress to complete');
    }

    this.currentOperation.status = 'completed';
    this.currentOperation.endTime = Date.now();
    this.currentOperation.duration = this.currentOperation.endTime - this.currentOperation.startTime;
    this.currentOperation.result = result;

    this.completedOperations.push({ ...this.currentOperation });
    
    logProgress(`Completed operation: ${this.currentOperation.name} (${this.currentOperation.duration}ms)`, 'success');
    this.currentOperation = null;
  }

  /**
   * Mark current operation as failed
   * @param {Error} error - Error that caused failure
   */
  failOperation(error) {
    if (!this.currentOperation) {
      throw new Error('No operation in progress to fail');
    }

    this.currentOperation.status = 'failed';
    this.currentOperation.endTime = Date.now();
    this.currentOperation.duration = this.currentOperation.endTime - this.currentOperation.startTime;
    this.currentOperation.error = error;

    this.failedOperations.push({ ...this.currentOperation });
    
    logError(error, this.currentOperation.name, true);
    this.currentOperation = null;
  }

  /**
   * Get operations that need rollback (completed operations in reverse order)
   * @returns {Array} Operations to rollback
   */
  getOperationsForRollback() {
    return [...this.completedOperations].reverse();
  }

  /**
   * Get summary of all operations
   * @returns {Object} Operations summary
   */
  getSummary() {
    const totalDuration = Date.now() - this.startTime;
    
    return {
      totalOperations: this.completedOperations.length + this.failedOperations.length,
      completedOperations: this.completedOperations.length,
      failedOperations: this.failedOperations.length,
      totalDuration,
      operations: {
        completed: this.completedOperations.map(op => ({
          name: op.name,
          duration: op.duration,
          result: op.result
        })),
        failed: this.failedOperations.map(op => ({
          name: op.name,
          duration: op.duration,
          error: op.error.message
        }))
      }
    };
  }
}

/**
 * Error handler with recovery mechanisms
 */
class ErrorHandler {
  constructor(options = {}) {
    this.options = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      enableRecovery: options.enableRecovery !== false,
      verbose: options.verbose || false
    };
    this.tracker = new OperationTracker();
  }

  /**
   * Execute operation with error handling and retry logic
   * @param {string} operationName - Name of the operation
   * @param {Function} operation - Operation function to execute
   * @param {Object} context - Operation context
   * @param {Object} options - Execution options
   * @returns {Promise<*>} Operation result
   */
  async executeWithRetry(operationName, operation, context = {}, options = {}) {
    const maxRetries = options.maxRetries || this.options.maxRetries;
    const retryDelay = options.retryDelay || this.options.retryDelay;
    
    this.tracker.startOperation(operationName, context);
    
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (this.options.verbose && attempt > 1) {
          logProgress(`Retry attempt ${attempt}/${maxRetries} for ${operationName}`, 'warning');
        }
        
        const result = await operation();
        this.tracker.completeOperation(result);
        return result;
        
      } catch (error) {
        lastError = error;
        
        if (this.options.verbose) {
          logProgress(`Attempt ${attempt}/${maxRetries} failed for ${operationName}: ${error.message}`, 'error');
        }
        
        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === maxRetries) {
          break;
        }
        
        // Wait before retry
        if (attempt < maxRetries) {
          await this.delay(retryDelay * attempt); // Exponential backoff
        }
      }
    }
    
    // All retries failed
    const seedingError = new SeedingError(
      `Operation ${operationName} failed after ${maxRetries} attempts: ${lastError.message}`,
      operationName,
      context,
      lastError
    );
    
    this.tracker.failOperation(seedingError);
    throw seedingError;
  }

  /**
   * Execute operation with validation
   * @param {string} operationName - Name of the operation
   * @param {Function} operation - Operation function to execute
   * @param {Function} validator - Validation function
   * @param {Object} context - Operation context
   * @returns {Promise<*>} Operation result
   */
  async executeWithValidation(operationName, operation, validator, context = {}) {
    return this.executeWithRetry(operationName, async () => {
      const result = await operation();
      
      // Validate result
      if (validator) {
        const validation = validator(result);
        if (!validation.isValid) {
          const validationError = new ValidationError(
            `Validation failed for ${operationName}: ${validation.errors.map(e => e.message).join(', ')}`,
            'validation',
            result,
            operationName
          );
          throw validationError;
        }
      }
      
      return result;
    }, context);
  }

  /**
   * Handle partial seeding failure with recovery
   * @param {Error} error - The error that caused failure
   * @param {Object} options - Recovery options
   * @returns {Promise<Object>} Recovery result
   */
  async handlePartialFailure(error, options = {}) {
    const { forceCleanup = false, skipConfirmation = false } = options;
    
    logProgress('Handling partial seeding failure...', 'warning');
    
    if (this.options.verbose) {
      logError(error, 'Partial Failure Handler', true);
    }
    
    const summary = this.tracker.getSummary();
    
    if (summary.completedOperations === 0) {
      logProgress('No operations completed - no cleanup needed', 'info');
      return {
        recovered: true,
        cleanupPerformed: false,
        summary
      };
    }
    
    logProgress(`${summary.completedOperations} operations completed before failure`, 'info');
    
    if (!this.options.enableRecovery && !forceCleanup) {
      logProgress('Recovery disabled - leaving partial data in place', 'warning');
      return {
        recovered: false,
        cleanupPerformed: false,
        summary,
        message: 'Recovery disabled. Use --force-cleanup to clean up partial data.'
      };
    }
    
    // Ask for confirmation unless skipped
    if (!skipConfirmation && !forceCleanup) {
      const shouldCleanup = await this.confirmCleanup(summary);
      if (!shouldCleanup) {
        logProgress('Cleanup cancelled by user', 'info');
        return {
          recovered: false,
          cleanupPerformed: false,
          summary,
          message: 'Cleanup cancelled. Partial data remains in emulators.'
        };
      }
    }
    
    // Perform cleanup
    try {
      await this.performRecoveryCleanup();
      
      logProgress('Recovery cleanup completed successfully', 'success');
      return {
        recovered: true,
        cleanupPerformed: true,
        summary
      };
      
    } catch (recoveryError) {
      logError(recoveryError, 'Recovery Cleanup', true);
      
      throw new RecoveryError(
        'Failed to clean up partial seeding data. Manual cleanup may be required.',
        this.tracker.getOperationsForRollback().map(op => op.name),
        [error, recoveryError]
      );
    }
  }

  /**
   * Perform recovery cleanup by rolling back completed operations
   * @returns {Promise<void>}
   */
  async performRecoveryCleanup() {
    const operationsToRollback = this.tracker.getOperationsForRollback();
    
    if (operationsToRollback.length === 0) {
      logProgress('No operations to rollback', 'info');
      return;
    }
    
    logProgress(`Rolling back ${operationsToRollback.length} operations...`, 'info');
    
    const rollbackErrors = [];
    
    for (const operation of operationsToRollback) {
      try {
        await this.rollbackOperation(operation);
        logProgress(`✅ Rolled back: ${operation.name}`, 'success');
      } catch (rollbackError) {
        logError(rollbackError, `Rollback of ${operation.name}`, this.options.verbose);
        rollbackErrors.push({
          operation: operation.name,
          error: rollbackError
        });
      }
    }
    
    if (rollbackErrors.length > 0) {
      throw new Error(`Failed to rollback ${rollbackErrors.length} operations: ${
        rollbackErrors.map(e => `${e.operation} (${e.error.message})`).join(', ')
      }`);
    }
  }

  /**
   * Rollback a specific operation
   * @param {Object} operation - Operation to rollback
   * @returns {Promise<void>}
   */
  async rollbackOperation(operation) {
    const { name, context, result } = operation;
    
    switch (name) {
      case 'seedExercises':
        await this.rollbackExercises();
        break;
      case 'seedUsers':
        await this.rollbackUsers(result);
        break;
      case 'seedPrograms':
        await this.rollbackPrograms(result);
        break;
      case 'seedWorkoutLogs':
        await this.rollbackWorkoutLogs(result);
        break;
      default:
        logProgress(`No rollback handler for operation: ${name}`, 'warning');
    }
  }

  /**
   * Rollback exercise seeding
   * @returns {Promise<void>}
   */
  async rollbackExercises() {
    const { resetExercises } = require('../data/exercises');
    await resetExercises({ verbose: this.options.verbose });
  }

  /**
   * Rollback user seeding
   * @param {Array} users - Created users to rollback
   * @returns {Promise<void>}
   */
  async rollbackUsers(users) {
    const { resetUsers } = require('../data/users');
    await resetUsers({ verbose: this.options.verbose });
  }

  /**
   * Rollback program seeding
   * @param {Object} programResult - Program seeding result
   * @returns {Promise<void>}
   */
  async rollbackPrograms(programResult) {
    const { resetPrograms } = require('../data/programs');
    await resetPrograms({ verbose: this.options.verbose });
  }

  /**
   * Rollback workout log seeding
   * @param {Object} logResult - Workout log seeding result
   * @returns {Promise<void>}
   */
  async rollbackWorkoutLogs(logResult) {
    const { resetWorkoutLogs } = require('../data/workout-logs');
    await resetWorkoutLogs({ verbose: this.options.verbose });
  }

  /**
   * Ask user for cleanup confirmation
   * @param {Object} summary - Operations summary
   * @returns {Promise<boolean>} Whether to proceed with cleanup
   */
  async confirmCleanup(summary) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n⚠️  Seeding failed with partial data created:');
    console.log(`   - Completed operations: ${summary.completedOperations}`);
    console.log(`   - Failed operations: ${summary.failedOperations}`);
    console.log('\nOptions:');
    console.log('  1. Clean up partial data (recommended)');
    console.log('  2. Leave partial data for debugging');
    
    return new Promise((resolve) => {
      rl.question('\nClean up partial data? (y/N): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  /**
   * Check if error is retryable
   * @param {Error} error - Error to check
   * @returns {boolean} Whether error is retryable
   */
  isRetryableError(error) {
    // Network errors are usually retryable
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return true;
    }
    
    // Firebase errors that might be temporary
    if (error.code === 'unavailable' || error.code === 'deadline-exceeded') {
      return true;
    }
    
    // Validation errors are not retryable
    if (error instanceof ValidationError) {
      return false;
    }
    
    // Rate limiting errors are retryable
    if (error.code === 'resource-exhausted' || (error.message && error.message.includes('rate limit'))) {
      return true;
    }
    
    // Default to retryable for unknown errors
    return true;
  }

  /**
   * Delay execution for specified milliseconds
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get operation tracker
   * @returns {OperationTracker} The operation tracker
   */
  getTracker() {
    return this.tracker;
  }
}

/**
 * Create error handler with default options
 * @param {Object} options - Error handler options
 * @returns {ErrorHandler} Configured error handler
 */
function createErrorHandler(options = {}) {
  return new ErrorHandler(options);
}

/**
 * Handle emulator connection errors
 * @param {Error} error - Connection error
 * @param {string} service - Service name (auth, firestore)
 * @returns {SeedingError} Structured seeding error
 */
function handleEmulatorError(error, service) {
  let message = `${service} emulator connection failed: ${error.message}`;
  let suggestions = [];
  
  if (error.code === 'ECONNREFUSED') {
    suggestions.push(`Make sure ${service} emulator is running on the expected port`);
    suggestions.push('Run: npm run dev:firebase');
  } else if (error.code === 'ENOTFOUND') {
    suggestions.push('Check emulator host configuration');
  } else if (error.code === 'ETIMEDOUT') {
    suggestions.push('Check network connectivity to emulator');
  }
  
  if (suggestions.length > 0) {
    message += '\n💡 Suggestions:\n   ' + suggestions.join('\n   ');
  }
  
  const seedingError = new SeedingError(
    message,
    'emulator_connection',
    { service, port: error.port },
    error
  );
  
  seedingError.recoverable = false; // Can't recover from emulator connection issues
  return seedingError;
}

/**
 * Handle validation errors with context
 * @param {Array} validationErrors - Array of validation errors
 * @param {string} context - Context where validation failed
 * @returns {SeedingError} Structured seeding error
 */
function handleValidationErrors(validationErrors, context) {
  const errorMessages = validationErrors.map(err => 
    err.field ? `${err.field}: ${err.message}` : err.message
  );
  
  const message = `Validation failed in ${context}:\n  - ${errorMessages.join('\n  - ')}`;
  
  const seedingError = new SeedingError(
    message,
    'validation',
    { context, errorCount: validationErrors.length },
    null
  );
  
  seedingError.recoverable = false; // Validation errors require code fixes
  return seedingError;
}

/**
 * Wrap async function with comprehensive error handling
 * @param {Function} fn - Async function to wrap
 * @param {string} operationName - Name of the operation
 * @param {Object} options - Error handling options
 * @returns {Function} Wrapped function
 */
function withErrorHandling(fn, operationName, options = {}) {
  return async (...args) => {
    const errorHandler = createErrorHandler(options);
    
    try {
      return await errorHandler.executeWithRetry(operationName, () => fn(...args));
    } catch (error) {
      if (options.enableRecovery !== false) {
        const recoveryResult = await errorHandler.handlePartialFailure(error, options);
        
        // Re-throw with recovery information
        const enhancedError = new SeedingError(
          `${error.message}\n\nRecovery: ${recoveryResult.recovered ? 'Successful' : 'Failed'}`,
          operationName,
          { recoveryResult },
          error
        );
        
        throw enhancedError;
      }
      
      throw error;
    }
  };
}

module.exports = {
  SeedingError,
  RecoveryError,
  OperationTracker,
  ErrorHandler,
  createErrorHandler,
  handleEmulatorError,
  handleValidationErrors,
  withErrorHandling
};