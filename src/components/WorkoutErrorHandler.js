/**
 * Workout Error Handler UI Components
 * 
 * Provides comprehensive error display components, retry mechanisms,
 * and progress indicators for workout log operations.
 */

import React, { useState, useEffect } from 'react';
import { Alert, Button, Modal, Spinner, ProgressBar, Badge, Collapse } from 'react-bootstrap';
import { 
  ExclamationTriangle, 
  ArrowClockwise, 
  CheckCircle, 
  XCircle, 
  InfoCircle,
  WifiOff,
  Database,
  Shield,
  Clock,
  Gear
} from 'react-bootstrap-icons';
import { WorkoutLogErrorType, ErrorSeverity } from '../utils/workoutLogErrorHandler';

/**
 * Main error display component that handles different error types
 */
export function WorkoutErrorDisplay({ 
  error, 
  onRetry, 
  onDismiss, 
  onUserAction,
  showDetails = false,
  className = '' 
}) {
  const [showDetailedInfo, setShowDetailedInfo] = useState(showDetails);
  const [isRetrying, setIsRetrying] = useState(false);

  if (!error) return null;

  const handleRetry = async () => {
    if (!onRetry || !error.retryable) return;
    
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const getErrorIcon = () => {
    switch (error.type) {
      case WorkoutLogErrorType.NETWORK_ERROR:
      case WorkoutLogErrorType.CONNECTION_TIMEOUT:
        return <WifiOff size={20} />;
      case WorkoutLogErrorType.DATABASE_ERROR:
      case WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION:
        return <Database size={20} />;
      case WorkoutLogErrorType.UNAUTHORIZED:
      case WorkoutLogErrorType.FORBIDDEN:
        return <Shield size={20} />;
      case WorkoutLogErrorType.CACHE_VALIDATION_FAILED:
        return <Clock size={20} />;
      default:
        return <ExclamationTriangle size={20} />;
    }
  };

  const getAlertVariant = () => {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        return 'danger';
      case ErrorSeverity.HIGH:
        return 'danger';
      case ErrorSeverity.MEDIUM:
        return 'warning';
      case ErrorSeverity.LOW:
        return 'info';
      default:
        return 'warning';
    }
  };

  const getSeverityBadge = () => {
    const variant = error.severity === ErrorSeverity.CRITICAL ? 'danger' :
                   error.severity === ErrorSeverity.HIGH ? 'warning' :
                   error.severity === ErrorSeverity.MEDIUM ? 'info' : 'secondary';
    
    return (
      <Badge bg={variant} className="me-2">
        {error.severity.toUpperCase()}
      </Badge>
    );
  };

  return (
    <Alert 
      variant={getAlertVariant()} 
      className={`workout-error-alert ${className}`}
      dismissible={!!onDismiss}
      onClose={onDismiss}
    >
      <div className="d-flex align-items-start">
        <div className="me-3 mt-1">
          {getErrorIcon()}
        </div>
        
        <div className="flex-grow-1">
          <div className="d-flex align-items-center mb-2">
            {getSeverityBadge()}
            <Alert.Heading className="h6 mb-0">
              {error.userFriendly?.title || 'Error Occurred'}
            </Alert.Heading>
          </div>
          
          <p className="mb-2">
            {error.userFriendly?.message || error.message}
          </p>
          
          {error.userFriendly?.action && (
            <p className="mb-2 text-muted">
              <strong>What to do:</strong> {error.userFriendly.action}
            </p>
          )}
          
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {error.retryable && (
              <Button
                size="sm"
                variant="outline-primary"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                {isRetrying ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <ArrowClockwise className="me-2" />
                    Try Again
                  </>
                )}
              </Button>
            )}
            
            {error.context?.requiresUserIntervention && onUserAction && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => onUserAction(error)}
              >
                Take Action
              </Button>
            )}
            
            {error.errorId && (
              <Button
                size="sm"
                variant="link"
                className="p-0 text-decoration-none"
                onClick={() => setShowDetailedInfo(!showDetailedInfo)}
              >
                {showDetailedInfo ? 'Hide' : 'Show'} Details
              </Button>
            )}
          </div>
          
          <Collapse in={showDetailedInfo}>
            <div className="mt-3 p-2 bg-light rounded">
              <small className="text-muted">
                <div><strong>Error ID:</strong> {error.errorId}</div>
                <div><strong>Type:</strong> {error.type}</div>
                <div><strong>Time:</strong> {new Date(error.timestamp).toLocaleString()}</div>
                {error.context?.operation && (
                  <div><strong>Operation:</strong> {error.context.operation}</div>
                )}
                {error.recoveryStrategy && (
                  <div><strong>Recovery Strategy:</strong> {error.recoveryStrategy}</div>
                )}
              </small>
            </div>
          </Collapse>
        </div>
      </div>
    </Alert>
  );
}

/**
 * Retry mechanism component with progress tracking
 */
export function RetryMechanism({ 
  error, 
  onRetry, 
  maxRetries = 3,
  retryDelay = 1000,
  onComplete,
  onFailed 
}) {
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryProgress, setRetryProgress] = useState(0);
  const [lastError, setLastError] = useState(null);

  const executeRetry = async () => {
    if (currentAttempt >= maxRetries) {
      onFailed?.(lastError);
      return;
    }

    setIsRetrying(true);
    setCurrentAttempt(prev => prev + 1);
    
    try {
      // Show progress during delay
      if (currentAttempt > 0) {
        const delay = retryDelay * Math.pow(2, currentAttempt - 1); // Exponential backoff
        let progress = 0;
        const interval = setInterval(() => {
          progress += 10;
          setRetryProgress(progress);
          if (progress >= 100) {
            clearInterval(interval);
          }
        }, delay / 10);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        clearInterval(interval);
      }
      
      setRetryProgress(100);
      const result = await onRetry();
      
      // Success
      setIsRetrying(false);
      onComplete?.(result);
      
    } catch (retryError) {
      setLastError(retryError);
      setRetryProgress(0);
      
      if (currentAttempt >= maxRetries) {
        setIsRetrying(false);
        onFailed?.(retryError);
      } else {
        // Continue retrying
        setTimeout(() => executeRetry(), 100);
      }
    }
  };

  useEffect(() => {
    if (error?.retryable && currentAttempt === 0) {
      executeRetry();
    }
  }, [error]);

  if (!error?.retryable) return null;

  return (
    <div className="retry-mechanism p-3 border rounded bg-light">
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-center">
          <ArrowClockwise className="me-2" />
          <span className="fw-bold">
            {isRetrying ? 'Retrying...' : 'Retry Available'}
          </span>
        </div>
        <Badge bg="secondary">
          Attempt {currentAttempt}/{maxRetries}
        </Badge>
      </div>
      
      {isRetrying && (
        <div className="mb-2">
          <div className="d-flex justify-content-between mb-1">
            <small className="text-muted">
              {currentAttempt > 1 ? 'Waiting before retry...' : 'Attempting operation...'}
            </small>
            <small className="text-muted">{retryProgress}%</small>
          </div>
          <ProgressBar now={retryProgress} size="sm" />
        </div>
      )}
      
      {!isRetrying && currentAttempt === 0 && (
        <Button
          size="sm"
          variant="primary"
          onClick={executeRetry}
          className="w-100"
        >
          Start Retry Process
        </Button>
      )}
      
      {lastError && currentAttempt > 0 && (
        <div className="mt-2">
          <small className="text-danger">
            Last attempt failed: {lastError.message}
          </small>
        </div>
      )}
    </div>
  );
}

/**
 * Progress indicator for long-running operations
 */
export function OperationProgress({ 
  operation, 
  progress = 0, 
  status = 'running',
  message = '',
  showCancel = false,
  onCancel,
  estimatedTime,
  className = ''
}) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    if (status === 'running') {
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [status, startTime]);

  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Spinner size="sm" className="me-2" />;
      case 'completed':
        return <CheckCircle className="me-2 text-success" />;
      case 'failed':
        return <XCircle className="me-2 text-danger" />;
      case 'canceled':
        return <XCircle className="me-2 text-warning" />;
      default:
        return <InfoCircle className="me-2" />;
    }
  };

  const getProgressVariant = () => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'failed':
      case 'canceled':
        return 'danger';
      default:
        return 'primary';
    }
  };

  return (
    <div className={`operation-progress p-3 border rounded ${className}`}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-center">
          {getStatusIcon()}
          <span className="fw-bold">{operation}</span>
        </div>
        
        {showCancel && status === 'running' && onCancel && (
          <Button
            size="sm"
            variant="outline-secondary"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
      
      {status === 'running' && (
        <div className="mb-2">
          <div className="d-flex justify-content-between mb-1">
            <small className="text-muted">
              {message || 'Processing...'}
            </small>
            <small className="text-muted">
              {progress > 0 ? `${Math.round(progress)}%` : formatTime(elapsedTime)}
            </small>
          </div>
          <ProgressBar 
            now={progress > 0 ? progress : undefined} 
            animated={progress === 0}
            variant={getProgressVariant()}
          />
        </div>
      )}
      
      {estimatedTime && status === 'running' && (
        <small className="text-muted">
          Estimated time remaining: {formatTime(estimatedTime - elapsedTime)}
        </small>
      )}
      
      {status === 'completed' && (
        <div className="text-success">
          <small>✓ Operation completed successfully in {formatTime(elapsedTime)}</small>
        </div>
      )}
      
      {status === 'failed' && (
        <div className="text-danger">
          <small>✗ Operation failed after {formatTime(elapsedTime)}</small>
        </div>
      )}
    </div>
  );
}

/**
 * Error recovery modal for complex error scenarios
 */
export function ErrorRecoveryModal({ 
  show, 
  onHide, 
  error, 
  onRetry, 
  onSkip, 
  onUserAction,
  recoveryOptions = []
}) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRecoveryAction = async (action) => {
    setIsProcessing(true);
    try {
      switch (action) {
        case 'retry':
          await onRetry?.();
          break;
        case 'skip':
          await onSkip?.();
          break;
        case 'user_action':
          await onUserAction?.(error);
          break;
        default:
          if (selectedOption?.action) {
            await selectedOption.action();
          }
      }
      onHide();
    } catch (actionError) {
      console.error('Recovery action failed:', actionError);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!error) return null;

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static">
      <Modal.Header closeButton={!isProcessing}>
        <Modal.Title className="d-flex align-items-center">
          <ExclamationTriangle className="me-2 text-warning" />
          Error Recovery Required
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body>
        <div className="mb-3">
          <h6>{error.userFriendly?.title || 'An error occurred'}</h6>
          <p className="text-muted mb-2">
            {error.userFriendly?.message || error.message}
          </p>
          
          {error.userFriendly?.action && (
            <div className="alert alert-info">
              <strong>Recommended action:</strong> {error.userFriendly.action}
            </div>
          )}
        </div>
        
        {recoveryOptions.length > 0 && (
          <div className="mb-3">
            <h6>Recovery Options:</h6>
            {recoveryOptions.map((option, index) => (
              <div key={index} className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="radio"
                  name="recoveryOption"
                  id={`option-${index}`}
                  checked={selectedOption === option}
                  onChange={() => setSelectedOption(option)}
                  disabled={isProcessing}
                />
                <label className="form-check-label" htmlFor={`option-${index}`}>
                  <strong>{option.title}</strong>
                  <br />
                  <small className="text-muted">{option.description}</small>
                </label>
              </div>
            ))}
          </div>
        )}
        
        {isProcessing && (
          <div className="text-center">
            <Spinner className="me-2" />
            Processing recovery action...
          </div>
        )}
      </Modal.Body>
      
      <Modal.Footer>
        <div className="d-flex justify-content-between w-100">
          <div>
            {error.retryable && (
              <Button
                variant="primary"
                onClick={() => handleRecoveryAction('retry')}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Spinner size="sm" className="me-2" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <ArrowClockwise className="me-2" />
                    Retry
                  </>
                )}
              </Button>
            )}
          </div>
          
          <div>
            {selectedOption && (
              <Button
                variant="success"
                onClick={() => handleRecoveryAction('custom')}
                disabled={isProcessing}
                className="me-2"
              >
                {selectedOption.title}
              </Button>
            )}
            
            <Button
              variant="secondary"
              onClick={() => handleRecoveryAction('skip')}
              disabled={isProcessing}
            >
              Skip
            </Button>
          </div>
        </div>
      </Modal.Footer>
    </Modal>
  );
}

/**
 * Compact error status indicator for save operations
 */
export function SaveStatusIndicator({ 
  saveStatus, 
  onRetry, 
  onShowDetails,
  className = '' 
}) {
  if (!saveStatus) return null;

  const { isSaving, saveError, hasUnsavedChanges, lastSaved, operationType } = saveStatus;

  if (isSaving) {
    return (
      <div className={`save-status-indicator d-flex align-items-center ${className}`}>
        <Spinner size="sm" className="me-2" />
        <small className="text-muted">
          {operationType === 'auto' ? 'Auto-saving...' : 'Saving...'}
        </small>
      </div>
    );
  }

  if (saveError) {
    return (
      <div className={`save-status-indicator d-flex align-items-center ${className}`}>
        <XCircle className="me-2 text-danger" size={16} />
        <small className="text-danger me-2">
          Save failed
        </small>
        {saveError.retryable && onRetry && (
          <Button
            size="sm"
            variant="outline-primary"
            onClick={onRetry}
            className="me-2"
          >
            Retry
          </Button>
        )}
        {onShowDetails && (
          <Button
            size="sm"
            variant="link"
            className="p-0 text-decoration-none"
            onClick={onShowDetails}
          >
            Details
          </Button>
        )}
      </div>
    );
  }

  if (hasUnsavedChanges) {
    return (
      <div className={`save-status-indicator d-flex align-items-center ${className}`}>
        <div className="me-2 text-warning" style={{ width: '16px', height: '16px' }}>
          <div 
            style={{ 
              width: '8px', 
              height: '8px', 
              backgroundColor: 'orange', 
              borderRadius: '50%',
              margin: '4px'
            }} 
          />
        </div>
        <small className="text-muted">Unsaved changes</small>
      </div>
    );
  }

  if (lastSaved) {
    return (
      <div className={`save-status-indicator d-flex align-items-center ${className}`}>
        <CheckCircle className="me-2 text-success" size={16} />
        <small className="text-muted">
          Saved {new Date(lastSaved).toLocaleTimeString()}
        </small>
      </div>
    );
  }

  return null;
}

/**
 * Error summary component for displaying multiple errors
 */
export function ErrorSummary({ 
  errors = [], 
  onClearAll, 
  onRetryAll,
  maxVisible = 3,
  className = '' 
}) {
  const [showAll, setShowAll] = useState(false);
  
  if (errors.length === 0) return null;

  const visibleErrors = showAll ? errors : errors.slice(0, maxVisible);
  const hasMore = errors.length > maxVisible;

  const errorCounts = errors.reduce((acc, error) => {
    acc[error.severity] = (acc[error.severity] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className={`error-summary ${className}`}>
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-center">
          <ExclamationTriangle className="me-2 text-warning" />
          <span className="fw-bold">
            {errors.length} Error{errors.length !== 1 ? 's' : ''}
          </span>
          <div className="ms-2">
            {Object.entries(errorCounts).map(([severity, count]) => (
              <Badge 
                key={severity}
                bg={severity === ErrorSeverity.CRITICAL ? 'danger' : 
                   severity === ErrorSeverity.HIGH ? 'warning' : 'secondary'}
                className="me-1"
              >
                {count} {severity}
              </Badge>
            ))}
          </div>
        </div>
        
        <div>
          {onRetryAll && errors.some(e => e.retryable) && (
            <Button
              size="sm"
              variant="outline-primary"
              onClick={onRetryAll}
              className="me-2"
            >
              Retry All
            </Button>
          )}
          {onClearAll && (
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={onClearAll}
            >
              Clear All
            </Button>
          )}
        </div>
      </div>
      
      <div className="error-list">
        {visibleErrors.map((error, index) => (
          <div key={error.errorId || index} className="mb-2">
            <WorkoutErrorDisplay 
              error={error}
              showDetails={false}
              className="mb-0"
            />
          </div>
        ))}
      </div>
      
      {hasMore && (
        <div className="text-center mt-2">
          <Button
            size="sm"
            variant="link"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Show Less' : `Show ${errors.length - maxVisible} More`}
          </Button>
        </div>
      )}
    </div>
  );
}