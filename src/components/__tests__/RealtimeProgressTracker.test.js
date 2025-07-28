/**
 * RealtimeProgressTracker Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import RealtimeProgressTracker from '../RealtimeProgressTracker';

// Mock the real-time hooks
jest.mock('../../hooks/useRealtimeProgress', () => ({
  useRealtimeProgress: () => ({
    analytics: [],
    exerciseHistory: [],
    isConnected: true,
    lastUpdate: null
  }),
  useRealtimePRNotifications: () => ({
    prNotifications: [],
    clearPRNotifications: jest.fn()
  })
}));

describe('RealtimeProgressTracker', () => {
  test('renders connection status', () => {
    render(<RealtimeProgressTracker />);
    
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.getByText('Real-time Progress')).toBeInTheDocument();
  });

  test('renders in compact mode', () => {
    render(<RealtimeProgressTracker compact={true} />);
    
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByText('Real-time Progress')).not.toBeInTheDocument();
  });

  test('shows offline status when not connected', () => {
    // Re-mock with disconnected state
    const mockUseRealtimeProgress = require('../../hooks/useRealtimeProgress');
    mockUseRealtimeProgress.useRealtimeProgress = jest.fn(() => ({
      analytics: [],
      exerciseHistory: [],
      isConnected: false,
      lastUpdate: null
    }));

    render(<RealtimeProgressTracker />);
    
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });
});