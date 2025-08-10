/**
 * Workout Error Handler Hook
 * 
 * Provides state management and operations for workout error handling,
 * including error classification, recovery mechanisms, and UI state.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  WorkoutLogError, 
  WorkoutLogErrorType, 
  ErrorClassifier,
  ErrorSeverity 
} from '../utils/workoutLogErrorHandler';
import { globalRecoveryManager } from '../utils/workoutLogErrorRecovery';

/**
 * Hook for managing workout error handling state and operations
 */
export function useWorkoutErrorHandler(options = {}) {
  const {
    maxErrors = 10,
    autoRetry = true,
    retryDelay = 1000,
    enableLogging = true,
    onErrorResolved,
    onErrorFailed,
    onRecoveryComplete
  } = options;

  // Error state management
  const [errors, setErrors] = useState([]);
  const [activeRecoveries, setActiveRecoveries] = useState(new Map());
  const [errorStats, setErrorStats] = useState({
    total: 0,
    resolved: 0,
    failed: 0,
    byType: {},
    bySeverity: {}
  });

  // UI state management
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [selectedError, setSelectedError] = useState(null);
  const [isProcessingRecovery, setIsProcessingRecovery] = useState(false);

  // Refs for cleanup and tracking
  const errorTimeouts = useRef(new Map());
  const recoveryAttempts = useRef(new Map());

  /**
   * Add a new error to the error list
   */
  const addError = useCallback((error, context = {}) => {
    let workoutError;

    // Classify error if not already a WorkoutLogError
    if (error instanceof WorkoutLogError) {
      workoutError = error;
    } else {
      workoutError = ErrorClassifier.classify(error, context);
    }

    // Update error statistics
    setErrorStats(prev => ({
      ...prev,
      total: prev.total + 1,
      byType: {
        ...prev.byType,
        [workoutError.type]: (prev.byType[workoutError.type] || 0) + 1
      },
      bySeverity: {
        ...prev.bySeverity,
        [workoutError.severity]: (prev.bySeverity[workoutError.severity] || 0) + 1
      }
    }));

    // Add to error list
    setErrors(prev => {
      const updated = [workoutError, ...prev];
      // Limit number of errors kept in memory
      return updated.slice(0, maxErrors);
    });

    // Auto-hide non-critical errors after delay
    if (workoutError.severity !== ErrorSeverity.CRITICAL && 
        workoutError.severity !== ErrorSeverity.HIGH) {
      const timeout = setTimeout(() => {
        removeError(workoutError.errorId);
      }, 10000); // 10 seconds
      
      errorTimeouts.current.set(workoutError.errorId, timeout);
    }

    // Attempt automatic recovery if enabled and error is retryable
    if (autoRetry && workoutError.retryable && context.operation) {
      attemptRecovery(workoutError, context.operation, context);
    }

    if (enableLogging) {
      console.error('Workout Error Added:', {
        errorId: workoutError.errorId,
        type: workoutError.type,
        severity: workoutError.severity,
        message: workoutError.message,
        context: workoutError.context
      });
    }

    return workoutError;
  }, [maxErrors, autoRetry, enableLogging]);

  /**
   * Remove an error from the error list
   */
  const removeError = useCallback((errorId) => {
    setErrors(prev => prev.filter(error => error.errorId !== errorId));
    
    // Clear any associated timeout
    const timeout = errorTimeouts.current.get(errorId);
    if (timeout) {
      clearTimeout(timeout);
      errorTimeouts.current.delete(errorId);
    }

    // Remove from active recoveries
    setActiveRecoveries(prev => {
      const updated = new Map(prev);
      updated.delete(errorId);
      return updated;
    });

    // Clear recovery attempts
    recoveryAttempts.current.delete(errorId);
  }, []);

  /**
   * Clear all errors
   */
  const clearAllErrors = useCallback(() => {
    // Clear all timeouts
    errorTimeouts.current.forEach(timeout => clearTimeout(timeout));
    errorTimeouts.current.clear();

    // Clear state
    setErrors([]);
    setActiveRecoveries(new Map());
    recoveryAttempts.current.clear();
  }, []);

  /**
   * Attempt automatic recovery for an error
   */
  const attemptRecovery = useCallback(async (error, operation, context = {}) => {
    const recoveryId = `${error.errorId}_${Date.now()}`;
    
    try {
      // Track recovery attempt
      setActiveRecoveries(prev => new Map(prev).set(error.errorId, {
        recoveryId,
        startTime: Date.now(),
        attempts: (recoveryAttempts.current.get(error.errorId) || 0) + 1
      }));

      recoveryAttempts.current.set(
        error.errorId, 
        (recoveryAttempts.current.get(error.errorId) || 0) + 1
      );

      if (enableLogging) {
        console.log('🔄 RECOVERY ATTEMPT START:', {
          errorId: error.errorId,
          recoveryId,
          type: error.type,
          strategy: error.recoveryStrategy,
          attempt: recoveryAttempts.current.get(error.errorId)
        });
      }

      // Execute recovery using the global recovery manager
      const result = await globalRecoveryManager.recover(error, operation, {
        ...context,
        errorId: error.errorId,
        recoveryId
      });

      // Recovery successful
      setErrorStats(prev => ({
        ...prev,
        resolved: prev.resolved + 1
      }));

      removeError(error.errorId);
      onErrorResolved?.(error, result);
      onRecoveryComplete?.(error, result, true);

      if (enableLogging) {
        console.log('✅ RECOVERY SUCCESS:', {
          errorId: error.errorId,
          recoveryId,
          type: error.type,
          duration: Date.now() - activeRecoveries.get(error.errorId)?.startTime
        });
      }

      return result;

    } catch (recoveryError) {
      // Recovery failed
      setErrorStats(prev => ({
        ...prev,
        failed: prev.failed + 1
      }));

      setActiveRecoveries(prev => {
        const updated = new Map(prev);
        updated.delete(error.errorId);
        return updated;
      });

      onErrorFailed?.(error, recoveryError);
      onRecoveryComplete?.(error, recoveryError, false);

      if (enableLogging) {
        console.error('❌ RECOVERY FAILED:', {
          errorId: error.errorId,
          recoveryId,
          originalError: error.type,
          recoveryError: recoveryError.message,
          duration: activeRecoveries.get(error.errorId) ? 
            Date.now() - activeRecoveries.get(error.errorId).startTime : 0
        });
      }

      throw recoveryError;
    }
  }, [enableLogging, onErrorResolved, onErrorFailed, onRecoveryComplete]);

  /**
   * Manually retry an error
   */
  const retryError = useCallback(async (error, operation, context = {}) => {
    if (!error.retryable) {
      throw new Error('Error is not retryable');
    }

    return await attemptRecovery(error, operation, context);
  }, [attemptRecovery]);

  /**
   * Retry all retryable errors
   */
  const retryAllErrors = useCallback(async () => {
    const retryableErrors = errors.filter(error => error.retryable);
    
    if (retryableErrors.length === 0) {
      return;
    }

    setIsProcessingRecovery(true);

    try {
      const results = await Promise.allSettled(
        retryableErrors.map(error => 
          attemptRecovery(error, null, { source: 'retry_all' })
        )
      );

      const successful = results.filter(result => result.status === 'fulfilled').length;
      const failed = results.filter(result => result.status === 'rejected').length;

      if (enableLogging) {
        console.log('🔄 RETRY ALL COMPLETE:', {
          total: retryableErrors.length,
          successful,
          failed
        });
      }

      return { successful, failed, total: retryableErrors.length };

    } finally {
      setIsProcessingRecovery(false);
    }
  }, [errors, attemptRecovery, enableLogging]);

  /**
   * Show error details modal
   */
  const showErrorDetails = useCallback((error) => {
    setSelectedError(error);
    setShowErrorModal(true);
  }, []);

  /**
   * Hide error details modal
   */
  const hideErrorModal = useCallback(() => {
    setShowErrorModal(false);
    setSelectedError(null);
  }, []);

  /**
   * Get errors by severity
   */
  const getErrorsBySeverity = useCallback((severity) => {
    return errors.filter(error => error.severity === severity);
  }, [errors]);

  /**
   * Get errors by type
   */
  const getErrorsByType = useCallback((type) => {
    return errors.filter(error => error.type === type);
  }, [errors]);

  /**
   * Check if there are any critical errors
   */
  const hasCriticalErrors = useCallback(() => {
    return errors.some(error => error.severity === ErrorSeverity.CRITICAL);
  }, [errors]);

  /**
   * Check if there are any retryable errors
   */
  const hasRetryableErrors = useCallback(() => {
    return errors.some(error => error.retryable);
  }, [errors]);

  /**
   * Get recovery status for an error
   */
  const getRecoveryStatus = useCallback((errorId) => {
    return activeRecoveries.get(errorId);
  }, [activeRecoveries]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear all timeouts
      errorTimeouts.current.forEach(timeout => clearTimeout(timeout));
      errorTimeouts.current.clear();
    };
  }, []);

  return {
    // Error state
    errors,
    errorStats,
    activeRecoveries,
    
    // UI state
    showErrorModal,
    selectedError,
    isProcessingRecovery,
    
    // Error management
    addError,
    removeError,
    clearAllErrors,
    
    // Recovery operations
    attemptRecovery,
    retryError,
    retryAllErrors,
    
    // Modal management
    showErrorDetails,
    hideErrorModal,
    
    // Query functions
    getErrorsBySeverity,
    getErrorsByType,
    hasCriticalErrors,
    hasRetryableErrors,
    getRecoveryStatus,
    
    // Utility functions
    isRecovering: (errorId) => activeRecoveries.has(errorId),
    getRecoveryAttempts: (errorId) => recoveryAttempts.current.get(errorId) || 0
  };
}

/**
 * Hook for managing save operation error handling
 */
export function useSaveErrorHandler(options = {}) {
  const {
    onSaveSuccess,
    onSaveError,
    maxRetries = 3,
    retryDelay = 1000
  } = options;

  const [saveStatus, setSaveStatus] = useState({
    isSaving: false,
    lastSaved: null,
    hasUnsavedChanges: false,
    saveError: null,
    operationType: null,
    retryCount: 0
  });

  const errorHandler = useWorkoutErrorHandler({
    autoRetry: false, // Manual retry for save operations
    onErrorResolved: (error, result) => {
      setSaveStatus(prev => ({
        ...prev,
        isSaving: false,
        lastSaved: new Date(),
        hasUnsavedChanges: false,
        saveError: null,
        retryCount: 0
      }));
      onSaveSuccess?.(result);
    },
    onErrorFailed: (error, recoveryError) => {
      setSaveStatus(prev => ({
        ...prev,
        isSaving: false,
        saveError: error,
        hasUnsavedChanges: true
      }));
      onSaveError?.(error, recoveryError);
    }
  });

  /**
   * Execute a save operation with error handling
   */
  const executeSave = useCallback(async (saveOperation, operationType = 'manual') => {
    setSaveStatus(prev => ({
      ...prev,
      isSaving: true,
      saveError: null,
      operationType,
      hasUnsavedChanges: true
    }));

    try {
      const result = await saveOperation();
      
      setSaveStatus(prev => ({
        ...prev,
        isSaving: false,
        lastSaved: new Date(),
        hasUnsavedChanges: false,
        saveError: null,
        retryCount: 0
      }));

      onSaveSuccess?.(result);
      return result;

    } catch (error) {
      const workoutError = errorHandler.addError(error, {
        operation: saveOperation,
        operationType,
        source: 'save_operation'
      });

      setSaveStatus(prev => ({
        ...prev,
        isSaving: false,
        saveError: workoutError,
        hasUnsavedChanges: true
      }));

      onSaveError?.(workoutError);
      throw workoutError;
    }
  }, [errorHandler, onSaveSuccess, onSaveError]);

  /**
   * Retry the last failed save operation
   */
  const retrySave = useCallback(async () => {
    const { saveError } = saveStatus;
    
    if (!saveError || !saveError.retryable || saveStatus.retryCount >= maxRetries) {
      return;
    }

    setSaveStatus(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1
    }));

    try {
      await errorHandler.retryError(saveError, saveError.context?.operation, {
        ...saveError.context,
        retryAttempt: saveStatus.retryCount + 1
      });
    } catch (retryError) {
      // Error handling is managed by the error handler
      console.error('Save retry failed:', retryError);
    }
  }, [saveStatus, maxRetries, errorHandler]);

  /**
   * Mark changes as unsaved
   */
  const markUnsaved = useCallback(() => {
    setSaveStatus(prev => ({
      ...prev,
      hasUnsavedChanges: true
    }));
  }, []);

  /**
   * Clear save error
   */
  const clearSaveError = useCallback(() => {
    if (saveStatus.saveError) {
      errorHandler.removeError(saveStatus.saveError.errorId);
    }
    setSaveStatus(prev => ({
      ...prev,
      saveError: null
    }));
  }, [saveStatus.saveError, errorHandler]);

  return {
    // Save state
    saveStatus,
    
    // Save operations
    executeSave,
    retrySave,
    markUnsaved,
    clearSaveError,
    
    // Error handler integration
    ...errorHandler,
    
    // Computed properties
    canRetry: saveStatus.saveError?.retryable && saveStatus.retryCount < maxRetries,
    isRetryable: saveStatus.saveError?.retryable || false,
    hasMaxRetries: saveStatus.retryCount >= maxRetries
  };
}