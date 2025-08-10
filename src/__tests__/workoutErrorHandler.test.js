/**
 * Tests for Workout Error Handler Components
 * 
 * Tests the error display components, retry mechanisms, and progress indicators
 * to ensure they handle different error types correctly.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  WorkoutErrorDisplay,
  RetryMechanism,
  OperationProgress,
  SaveStatusIndicator,
  ErrorSummary
} from '../components/WorkoutErrorHandler';
import { WorkoutLogError, WorkoutLogErrorType, ErrorSeverity } from '../utils/workoutLogErrorHandler';

// Mock error for testing
const createMockError = (type = WorkoutLogErrorType.NETWORK_ERROR, severity = ErrorSeverity.MEDIUM) => {
  return new WorkoutLogError(
    type,
    'Test error message',
    {
      operation: 'test_operation',
      userId: 'test-user-123'
    }
  );
};

describe('WorkoutErrorDisplay', () => {
  test('renders error with correct severity and message', () => {
    const error = createMockError(WorkoutLogErrorType.NETWORK_ERROR, ErrorSeverity.HIGH);
    
    render(
      <WorkoutErrorDisplay
        error={error}
        onRetry={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText(error.userFriendly.title)).toBeInTheDocument();
    expect(screen.getByText(error.userFriendly.message)).toBeInTheDocument();
  });

  test('shows retry button for retryable errors', () => {
    const error = createMockError(WorkoutLogErrorType.NETWORK_ERROR);
    const onRetry = jest.fn();
    
    render(
      <WorkoutErrorDisplay
        error={error}
        onRetry={onRetry}
        onDismiss={jest.fn()}
      />
    );

    const retryButton = screen.getByText('Try Again');
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalled();
  });

  test('hides retry button for non-retryable errors', () => {
    const error = createMockError(WorkoutLogErrorType.UNAUTHORIZED);
    
    render(
      <WorkoutErrorDisplay
        error={error}
        onRetry={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
  });

  test('shows error details when requested', () => {
    const error = createMockError();
    
    render(
      <WorkoutErrorDisplay
        error={error}
        showDetails={true}
      />
    );

    expect(screen.getByText('Error ID:')).toBeInTheDocument();
    expect(screen.getByText('Type:')).toBeInTheDocument();
    expect(screen.getByText(error.errorId)).toBeInTheDocument();
  });
});

describe('RetryMechanism', () => {
  test('executes retry operation when triggered', async () => {
    const error = createMockError(WorkoutLogErrorType.NETWORK_ERROR);
    const onRetry = jest.fn().mockResolvedValue('success');
    const onComplete = jest.fn();
    
    render(
      <RetryMechanism
        error={error}
        onRetry={onRetry}
        onComplete={onComplete}
        maxRetries={3}
      />
    );

    const startButton = screen.getByText('Start Retry Process');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(onRetry).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith('success');
    });
  });

  test('handles retry failures correctly', async () => {
    const error = createMockError(WorkoutLogErrorType.NETWORK_ERROR);
    const onRetry = jest.fn().mockRejectedValue(new Error('Retry failed'));
    const onFailed = jest.fn();
    
    render(
      <RetryMechanism
        error={error}
        onRetry={onRetry}
        onFailed={onFailed}
        maxRetries={1}
      />
    );

    const startButton = screen.getByText('Start Retry Process');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(onFailed).toHaveBeenCalled();
    });
  });

  test('does not render for non-retryable errors', () => {
    const error = createMockError(WorkoutLogErrorType.UNAUTHORIZED);
    
    const { container } = render(
      <RetryMechanism
        error={error}
        onRetry={jest.fn()}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});

describe('OperationProgress', () => {
  test('shows running state with spinner', () => {
    render(
      <OperationProgress
        operation="Saving workout"
        status="running"
        progress={50}
        message="Processing data..."
      />
    );

    expect(screen.getByText('Saving workout')).toBeInTheDocument();
    expect(screen.getByText('Processing data...')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  test('shows completed state with success icon', () => {
    render(
      <OperationProgress
        operation="Saving workout"
        status="completed"
      />
    );

    expect(screen.getByText('Saving workout')).toBeInTheDocument();
    expect(screen.getByText(/Operation completed successfully/)).toBeInTheDocument();
  });

  test('shows failed state with error icon', () => {
    render(
      <OperationProgress
        operation="Saving workout"
        status="failed"
      />
    );

    expect(screen.getByText('Saving workout')).toBeInTheDocument();
    expect(screen.getByText(/Operation failed/)).toBeInTheDocument();
  });

  test('shows cancel button when enabled', () => {
    const onCancel = jest.fn();
    
    render(
      <OperationProgress
        operation="Saving workout"
        status="running"
        showCancel={true}
        onCancel={onCancel}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    expect(cancelButton).toBeInTheDocument();
    
    fireEvent.click(cancelButton);
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('SaveStatusIndicator', () => {
  test('shows saving state', () => {
    const saveStatus = {
      isSaving: true,
      operationType: 'auto'
    };
    
    render(<SaveStatusIndicator saveStatus={saveStatus} />);
    
    expect(screen.getByText('Auto-saving...')).toBeInTheDocument();
  });

  test('shows error state with retry button', () => {
    const error = createMockError();
    const saveStatus = {
      isSaving: false,
      saveError: error
    };
    const onRetry = jest.fn();
    
    render(
      <SaveStatusIndicator
        saveStatus={saveStatus}
        onRetry={onRetry}
      />
    );
    
    expect(screen.getByText('Save failed')).toBeInTheDocument();
    
    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalled();
  });

  test('shows success state', () => {
    const saveStatus = {
      isSaving: false,
      lastSaved: new Date('2024-01-01T12:00:00Z')
    };
    
    render(<SaveStatusIndicator saveStatus={saveStatus} />);
    
    expect(screen.getByText(/Saved/)).toBeInTheDocument();
  });

  test('shows unsaved changes state', () => {
    const saveStatus = {
      isSaving: false,
      hasUnsavedChanges: true
    };
    
    render(<SaveStatusIndicator saveStatus={saveStatus} />);
    
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });
});

describe('ErrorSummary', () => {
  test('displays multiple errors with counts', () => {
    const errors = [
      createMockError(WorkoutLogErrorType.NETWORK_ERROR, ErrorSeverity.HIGH),
      createMockError(WorkoutLogErrorType.CACHE_VALIDATION_FAILED, ErrorSeverity.LOW),
      createMockError(WorkoutLogErrorType.DUPLICATE_CONSTRAINT_VIOLATION, ErrorSeverity.MEDIUM)
    ];
    
    render(<ErrorSummary errors={errors} />);
    
    expect(screen.getByText('3 Errors')).toBeInTheDocument();
    expect(screen.getByText('1 high')).toBeInTheDocument();
    expect(screen.getByText('1 medium')).toBeInTheDocument();
    expect(screen.getByText('1 low')).toBeInTheDocument();
  });

  test('shows retry all button when errors are retryable', () => {
    const errors = [
      createMockError(WorkoutLogErrorType.NETWORK_ERROR),
      createMockError(WorkoutLogErrorType.CACHE_VALIDATION_FAILED)
    ];
    const onRetryAll = jest.fn();
    
    render(
      <ErrorSummary
        errors={errors}
        onRetryAll={onRetryAll}
      />
    );
    
    const retryAllButton = screen.getByText('Retry All');
    fireEvent.click(retryAllButton);
    expect(onRetryAll).toHaveBeenCalled();
  });

  test('shows clear all button', () => {
    const errors = [createMockError()];
    const onClearAll = jest.fn();
    
    render(
      <ErrorSummary
        errors={errors}
        onClearAll={onClearAll}
      />
    );
    
    const clearAllButton = screen.getByText('Clear All');
    fireEvent.click(clearAllButton);
    expect(onClearAll).toHaveBeenCalled();
  });

  test('limits visible errors and shows expand option', () => {
    const errors = Array.from({ length: 5 }, (_, i) => 
      createMockError(WorkoutLogErrorType.NETWORK_ERROR)
    );
    
    render(
      <ErrorSummary
        errors={errors}
        maxVisible={2}
      />
    );
    
    expect(screen.getByText('5 Errors')).toBeInTheDocument();
    expect(screen.getByText('Show 3 More')).toBeInTheDocument();
  });

  test('returns null when no errors', () => {
    const { container } = render(<ErrorSummary errors={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('Error Integration', () => {
  test('error display integrates with retry mechanism', async () => {
    const error = createMockError(WorkoutLogErrorType.NETWORK_ERROR);
    const onRetry = jest.fn().mockResolvedValue('success');
    
    render(
      <div>
        <WorkoutErrorDisplay
          error={error}
          onRetry={onRetry}
        />
        <RetryMechanism
          error={error}
          onRetry={onRetry}
        />
      </div>
    );

    // Click retry in error display
    const retryButton = screen.getByText('Try Again');
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(onRetry).toHaveBeenCalled();
    });
  });

  test('handles error classification correctly', () => {
    const networkError = createMockError(WorkoutLogErrorType.NETWORK_ERROR, ErrorSeverity.MEDIUM);
    const criticalError = createMockError(WorkoutLogErrorType.DATABASE_ERROR, ErrorSeverity.CRITICAL);
    
    const { rerender } = render(
      <WorkoutErrorDisplay error={networkError} />
    );
    
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    
    rerender(<WorkoutErrorDisplay error={criticalError} />);
    
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });
});