/**
 * Real-time Coaching Tests
 * 
 * Tests for real-time coaching subscriptions and functionality:
 * - Coaching insights real-time updates
 * - Invitation status changes
 * - Client activity monitoring
 * 
 * Requirements: 7.2, 2.6, 4.2
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { useRealtimeCoachDashboard, useRealtimeClientCoaching, useRealtimeInvitations } from '../hooks/useRealtimeCoaching';
import realtimeCoachingManager from '../services/realtimeCoachingService';

// Mock Supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn((callback) => {
        callback('SUBSCRIBED');
        return Promise.resolve();
      }),
      unsubscribe: jest.fn()
    })),
    removeChannel: jest.fn()
  },
  isRealtimeDisabled: jest.fn(() => false)
}));

// Mock notification service
jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 'test-notification' })
}));

// Test component for hooks
function TestCoachDashboard({ clientIds = [], callbacks = {} }) {
  const hookResult = useRealtimeCoachDashboard(clientIds, callbacks);
  
  return (
    <div data-testid="coach-dashboard">
      <div data-testid="connection-status">
        {hookResult.isConnected ? 'connected' : 'disconnected'}
      </div>
      <div data-testid="activity-count">
        {hookResult.clientActivity.length}
      </div>
      <div data-testid="invitations-count">
        {hookResult.invitations.length}
      </div>
    </div>
  );
}

function TestClientCoaching({ callbacks = {} }) {
  const hookResult = useRealtimeClientCoaching(callbacks);
  
  return (
    <div data-testid="client-coaching">
      <div data-testid="connection-status">
        {hookResult.isConnected ? 'connected' : 'disconnected'}
      </div>
      <div data-testid="insights-count">
        {hookResult.insights.length}
      </div>
      <div data-testid="unread-count">
        {hookResult.unreadInsightCount}
      </div>
    </div>
  );
}

function TestInvitations({ coachId, callbacks = {} }) {
  const hookResult = useRealtimeInvitations(coachId, callbacks);
  
  return (
    <div data-testid="invitations">
      <div data-testid="connection-status">
        {hookResult.isConnected ? 'connected' : 'disconnected'}
      </div>
      <div data-testid="invitations-count">
        {hookResult.invitations.length}
      </div>
    </div>
  );
}

// Wrapper component with providers
function TestWrapper({ children }) {
  return (
    <BrowserRouter>
      <AuthProvider>
        {children}
      </AuthProvider>
    </BrowserRouter>
  );
}

describe('Real-time Coaching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useRealtimeCoachDashboard', () => {
    it('should establish real-time connection for coach dashboard', async () => {
      const mockUser = { id: 'coach-1', roles: ['coach'] };
      const clientIds = ['client-1', 'client-2'];

      // Mock useAuth
      jest.doMock('../hooks/useAuth', () => ({
        useAuth: () => ({ user: mockUser })
      }));

      render(
        <TestWrapper>
          <TestCoachDashboard clientIds={clientIds} />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
      });
    });

    it('should handle client activity updates', async () => {
      const mockUser = { id: 'coach-1', roles: ['coach'] };
      const clientIds = ['client-1'];
      const onClientActivity = jest.fn();

      jest.doMock('../hooks/useAuth', () => ({
        useAuth: () => ({ user: mockUser })
      }));

      render(
        <TestWrapper>
          <TestCoachDashboard 
            clientIds={clientIds} 
            callbacks={{ onClientActivity }}
          />
        </TestWrapper>
      );

      // Simulate client activity
      act(() => {
        realtimeCoachingManager.handleClientWorkoutActivity({
          eventType: 'INSERT',
          new: {
            id: 'workout-1',
            user_id: 'client-1',
            program_name: 'Test Program',
            completed_at: new Date().toISOString()
          }
        }, { onClientActivity });
      });

      await waitFor(() => {
        expect(onClientActivity).toHaveBeenCalled();
      });
    });

    it('should handle invitation status changes', async () => {
      const mockUser = { id: 'coach-1', roles: ['coach'] };
      const onInvitationAccepted = jest.fn();

      jest.doMock('../hooks/useAuth', () => ({
        useAuth: () => ({ user: mockUser })
      }));

      render(
        <TestWrapper>
          <TestCoachDashboard 
            callbacks={{ onInvitationAccepted }}
          />
        </TestWrapper>
      );

      // Simulate invitation acceptance
      act(() => {
        realtimeCoachingManager.handleInvitationChange({
          eventType: 'UPDATE',
          new: {
            id: 'invitation-1',
            coach_id: 'coach-1',
            status: 'accepted'
          },
          old: {
            id: 'invitation-1',
            coach_id: 'coach-1',
            status: 'pending'
          }
        }, { onInvitationAccepted });
      });

      await waitFor(() => {
        expect(onInvitationAccepted).toHaveBeenCalled();
      });
    });
  });

  describe('useRealtimeClientCoaching', () => {
    it('should establish real-time connection for client coaching', async () => {
      const mockUser = { id: 'client-1' };

      jest.doMock('../hooks/useAuth', () => ({
        useAuth: () => ({ user: mockUser })
      }));

      render(
        <TestWrapper>
          <TestClientCoaching />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
      });
    });

    it('should handle new insights', async () => {
      const mockUser = { id: 'client-1' };
      const onInsightReceived = jest.fn();

      jest.doMock('../hooks/useAuth', () => ({
        useAuth: () => ({ user: mockUser })
      }));

      render(
        <TestWrapper>
          <TestClientCoaching callbacks={{ onInsightReceived }} />
        </TestWrapper>
      );

      // Simulate new insight
      act(() => {
        realtimeCoachingManager.handleInsightChange({
          eventType: 'INSERT',
          new: {
            id: 'insight-1',
            client_id: 'client-1',
            coach_id: 'coach-1',
            title: 'Test Insight',
            content: 'Test content',
            client_viewed: false
          }
        }, { onInsightCreated: onInsightReceived });
      });

      await waitFor(() => {
        expect(onInsightReceived).toHaveBeenCalled();
      });
    });
  });

  describe('useRealtimeInvitations', () => {
    it('should establish real-time connection for invitations', async () => {
      const coachId = 'coach-1';

      render(
        <TestWrapper>
          <TestInvitations coachId={coachId} />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('connected');
      });
    });

    it('should handle invitation status changes', async () => {
      const coachId = 'coach-1';
      const onInvitationAccepted = jest.fn();

      render(
        <TestWrapper>
          <TestInvitations 
            coachId={coachId} 
            callbacks={{ onInvitationAccepted }}
          />
        </TestWrapper>
      );

      // Simulate invitation acceptance
      act(() => {
        realtimeCoachingManager.handleInvitationChange({
          eventType: 'UPDATE',
          new: {
            id: 'invitation-1',
            coach_id: coachId,
            status: 'accepted'
          },
          old: {
            id: 'invitation-1',
            coach_id: coachId,
            status: 'pending'
          }
        }, { onInvitationAccepted });
      });

      await waitFor(() => {
        expect(onInvitationAccepted).toHaveBeenCalled();
      });
    });
  });

  describe('RealtimeCoachingManager', () => {
    it('should create and manage subscriptions', async () => {
      const manager = realtimeCoachingManager;
      
      // Test subscription creation
      const subscription = await manager.subscribeToInsights('client-1', {
        onInsightCreated: jest.fn()
      });

      expect(subscription).toBeDefined();
      expect(manager.getMetrics().totalSubscriptions).toBeGreaterThan(0);
    });

    it('should handle subscription cleanup', () => {
      const manager = realtimeCoachingManager;
      
      // Create subscription
      manager.subscribeToInsights('client-1', {});
      
      // Clean up
      manager.unsubscribeAll();
      
      expect(manager.getMetrics().activeSubscriptions).toBe(0);
    });

    it('should provide health check information', async () => {
      const manager = realtimeCoachingManager;
      
      // Create subscription
      await manager.subscribeToInsights('client-1', {});
      
      const health = await manager.healthCheck();
      expect(health).toBeDefined();
      expect(typeof health).toBe('object');
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      // Mock connection error
      const mockChannel = {
        on: jest.fn().mockReturnThis(),
        subscribe: jest.fn((callback) => {
          callback('CHANNEL_ERROR', new Error('Connection failed'));
        })
      };

      jest.doMock('../config/supabase', () => ({
        supabase: {
          channel: jest.fn(() => mockChannel),
          removeChannel: jest.fn()
        },
        isRealtimeDisabled: jest.fn(() => false)
      }));

      const mockUser = { id: 'client-1' };

      jest.doMock('../hooks/useAuth', () => ({
        useAuth: () => ({ user: mockUser })
      }));

      render(
        <TestWrapper>
          <TestClientCoaching />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('disconnected');
      });
    });

    it('should handle disabled real-time gracefully', async () => {
      jest.doMock('../config/supabase', () => ({
        supabase: {},
        isRealtimeDisabled: jest.fn(() => true)
      }));

      const mockUser = { id: 'client-1' };

      jest.doMock('../hooks/useAuth', () => ({
        useAuth: () => ({ user: mockUser })
      }));

      render(
        <TestWrapper>
          <TestClientCoaching />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('connection-status')).toHaveTextContent('disconnected');
      });
    });
  });
});

describe('Real-time Components', () => {
  describe('RealtimeActivityFeed', () => {
    it('should render activity feed with activities', () => {
      const activities = [
        {
          type: 'workout_completed',
          event: 'UPDATE',
          data: { user_id: 'client-1', program_name: 'Test Program' },
          timestamp: new Date().toISOString()
        }
      ];

      const { RealtimeActivityFeed } = require('../components/RealtimeActivityFeed');

      render(
        <RealtimeActivityFeed
          activities={activities}
          isConnected={true}
          error={null}
        />
      );

      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('should show empty state when no activities', () => {
      const { RealtimeActivityFeed } = require('../components/RealtimeActivityFeed');

      render(
        <RealtimeActivityFeed
          activities={[]}
          isConnected={true}
          error={null}
        />
      );

      expect(screen.getByText('Waiting for client activity...')).toBeInTheDocument();
    });
  });

  describe('RealtimeStatusIndicator', () => {
    it('should show connected status', () => {
      const { RealtimeStatusIndicator } = require('../components/RealtimeStatusIndicator');

      render(
        <RealtimeStatusIndicator
          isConnected={true}
          error={null}
          compact={true}
        />
      );

      expect(screen.getByText('🟢 LIVE')).toBeInTheDocument();
    });

    it('should show error status', () => {
      const { RealtimeStatusIndicator } = require('../components/RealtimeStatusIndicator');

      render(
        <RealtimeStatusIndicator
          isConnected={false}
          error={new Error('Connection failed')}
          compact={true}
        />
      );

      expect(screen.getByText('🔴 ERROR')).toBeInTheDocument();
    });
  });
});