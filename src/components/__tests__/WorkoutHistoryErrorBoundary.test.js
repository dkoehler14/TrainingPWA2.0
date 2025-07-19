/**
 * WorkoutHistoryErrorBoundary Component Tests
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutHistoryErrorBoundary from '../WorkoutHistoryErrorBoundary';

// Mock component that throws an error
const ThrowError = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Mock window.location methods
const mockReload = jest.fn();
Object.defineProperty(window, 'location', {
  value: {
    reload: mockReload,
    href: ''
  },
  writable: true
});

describe('WorkoutHistoryErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Suppress console.error for error boundary tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  test('renders children when there is no error', () => {
    render(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={false} />
      </WorkoutHistoryErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  test('renders error UI when there is an error', () => {
    render(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={true} />
      </WorkoutHistoryErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred while loading your workout history.')).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
    expect(screen.getByText('Go Home')).toBeInTheDocument();
    expect(screen.getByText('Refresh Page')).toBeInTheDocument();
  });

  test('shows retry button and handles retry', () => {
    render(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={true} />
      </WorkoutHistoryErrorBoundary>
    );

    const retryButton = screen.getByText('Try Again');
    expect(retryButton).toBeInTheDocument();

    // Click retry button - this should reset the error state
    fireEvent.click(retryButton);

    // After retry, the error boundary should attempt to render children again
    // Since we're still passing shouldThrow={true}, it will error again
    // But we can verify the retry count increases
    expect(screen.getByText(/Retry attempts: 1/)).toBeInTheDocument();
  });

  test('handles refresh page button', () => {
    render(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={true} />
      </WorkoutHistoryErrorBoundary>
    );

    const refreshButton = screen.getByText('Refresh Page');
    fireEvent.click(refreshButton);

    expect(mockReload).toHaveBeenCalled();
  });

  test('handles go home button', () => {
    render(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={true} />
      </WorkoutHistoryErrorBoundary>
    );

    const homeButton = screen.getByText('Go Home');
    fireEvent.click(homeButton);

    expect(window.location.href).toBe('/');
  });

  test('shows retry count after multiple attempts', () => {
    const { rerender } = render(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={true} />
      </WorkoutHistoryErrorBoundary>
    );

    // First retry
    fireEvent.click(screen.getByText('Try Again'));
    
    // Trigger error again
    rerender(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={true} />
      </WorkoutHistoryErrorBoundary>
    );

    expect(screen.getByText(/Retry attempts: 1/)).toBeInTheDocument();
  });

  test('shows retry count increases with multiple attempts', () => {
    render(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={true} />
      </WorkoutHistoryErrorBoundary>
    );

    // First retry
    fireEvent.click(screen.getByText('Try Again'));
    expect(screen.getByText(/Retry attempts: 1/)).toBeInTheDocument();

    // Second retry
    fireEvent.click(screen.getByText('Try Again'));
    expect(screen.getByText(/Retry attempts: 2/)).toBeInTheDocument();

    // Third retry
    fireEvent.click(screen.getByText('Try Again'));
    expect(screen.getByText(/Retry attempts: 3/)).toBeInTheDocument();
  });

  test('shows development error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <WorkoutHistoryErrorBoundary>
        <ThrowError shouldThrow={true} />
      </WorkoutHistoryErrorBoundary>
    );

    expect(screen.getByText('Error Details (Development Only)')).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });
});