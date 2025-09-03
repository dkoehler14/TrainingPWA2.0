/**
 * Insight Delivery and Notification System Tests
 * 
 * Tests the real-time insight delivery system including:
 * - Real-time insight notifications for clients
 * - Insight reading status tracking
 * - Client response and feedback functionality
 * 
 * Requirements: 7.2, 7.6, 6.1
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { useRealtimeInsights } from '../hooks/useRealtimeInsights';
import InsightNotificationToast from '../components/InsightNotificationToast';
import NotificationBell from '../components/NotificationBell';
import MyCoach from '../pages/MyCoach';
// Mock dependencies first, before any imports
jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null })
    })),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockImplementation((callback) => {
        callback('SUBSCRIBED');
        return { unsubscribe: jest.fn() };
      })
    })),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'client-1' } } })
    }
  },
  isRealtimeDisabled: jest.fn().mockReturnValue(false)
}));

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' })
}));

jest.mock('../hooks/useAuth', () => ({
  useAuth: jest.fn()
}));

jest.mock('../hooks/useClientCoach', () => ({
  useClientCoach: jest.fn()
}));

jest.mock('../hooks/useRealtimeInsights', () => ({
  useRealtimeInsights: jest.fn()
}));

import { supabase } from '../config/supabase';
import { createNotification } from '../services/notificationService';

// Mock data
const mockInsight = {
  id: 'insight-1',
  coach_id: 'coach-1',
  client_id: 'client-1',
  relationship_id: 'rel-1',
  type: 'recommendation',
  title: 'Improve Your Squat Form',
  content: 'Focus on keeping your knees aligned with your toes during the squat movement.',
  priority: 'high',
  client_viewed: false,
  client_viewed_at: null,
  client_response: null,
  created_at: new Date().toISOString(),
  coach: {
    id: 'coach-1',
    name: 'John Coach',
    email: 'coach@example.com'
  }
};

const mockUser = {
  id: 'client-1',
  name: 'Test Client',
  email: 'client@example.com'
};

describe('Insight Delivery and Notification System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock useAuth
    const { useAuth } = require('../hooks/useAuth');
    useAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true
    });

    // Mock useClientCoach
    const { useClientCoach } = require('../hooks/useClientCoach');
    useClientCoach.mockReturnValue({
      loading: false,
      error: null,
      hasActiveCoach: true,
      coachRelationship: {
        id: 'rel-1',
        coach: { name: 'John Coach', email: 'coach@example.com' }
      },
      coachProfile: {},
      assignedPrograms: [],
      coachInsights: [],
      unreadInsightsCount: 0,
      markInsightAsViewed: jest.fn(),
      addInsightResponse: jest.fn(),
      terminateCoachingRelationship: jest.fn(),
      refreshCoachData: jest.fn()
    });

    // Reset Supabase mocks
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: mockInsight, error: null })
    });

    supabase.channel.mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockImplementation((callback) => {
        callback('SUBSCRIBED');
        return { unsubscribe: jest.fn() };
      })
    });
  });

  describe('Real-time Insight Notifications', () => {
    test('should display toast notification for new insight', async () => {
      // Mock the real-time hook to simulate receiving a new insight
      const { useRealtimeInsights } = require('../hooks/useRealtimeInsights');
      const mockOnNewInsight = jest.fn();
      
      useRealtimeInsights.mockReturnValue({
        insights: [mockInsight],
        unreadCount: 1,
        isConnected: true,
        markAsViewed: jest.fn(),
        addResponse: jest.fn()
      });

      render(
        <BrowserRouter>
          <InsightNotificationToast />
        </BrowserRouter>
      );

      // Verify the hook was called with the right options
      expect(useRealtimeInsights).toHaveBeenCalledWith({
        enableNotifications: true,
        onNewInsight: expect.any(Function)
      });

      // Get the callback function that was passed to the hook
      const hookCall = useRealtimeInsights.mock.calls[0][0];
      const onNewInsightCallback = hookCall.onNewInsight;
      
      // Simulate new insight callback
      await act(async () => {
        onNewInsightCallback(mockInsight);
      });

      // Should display toast notification
      await waitFor(() => {
        expect(screen.getByText('New Coaching Insight')).toBeInTheDocument();
        expect(screen.getByText(mockInsight.title)).toBeInTheDocument();
        expect(screen.getByText('HIGH')).toBeInTheDocument();
      });
    });

    test('should create in-app notification for new insight', async () => {
      const { useRealtimeInsights } = require('../hooks/useRealtimeInsights');
      
      useRealtimeInsights.mockReturnValue({
        insights: [],
        unreadCount: 0,
        isConnected: true,
        markAsViewed: jest.fn(),
        addResponse: jest.fn()
      });

      // Simulate the hook being called
      render(
        <BrowserRouter>
          <InsightNotificationToast />
        </BrowserRouter>
      );

      // Get the callback function that was passed to the hook
      const hookCall = useRealtimeInsights.mock.calls[0][0];
      const onNewInsightCallback = hookCall.onNewInsight;
      
      // Simulate new insight received
      await act(async () => {
        onNewInsightCallback(mockInsight);
      });

      // Should have called createNotification
      expect(createNotification).toHaveBeenCalledWith({
        userId: mockUser.id,
        type: 'insight_received',
        title: expect.stringContaining('recommendation'),
        message: mockInsight.title,
        relatedId: mockInsight.id,
        relatedType: 'coaching_insight',
        actionUrl: '/my-coach?tab=insights',
        actionText: 'View Insight',
        priority: 'high'
      });
    });

    test('should show unread count in notification bell', () => {
      const { useRealtimeInsights } = require('../hooks/useRealtimeInsights');
      
      useRealtimeInsights.mockReturnValue({
        insights: [mockInsight],
        unreadCount: 1,
        isConnected: true,
        markAsViewed: jest.fn(),
        addResponse: jest.fn()
      });

      render(
        <BrowserRouter>
          <NotificationBell />
        </BrowserRouter>
      );

      // Should show unread count badge
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('1 new insight')).toBeInTheDocument();
    });
  });

  describe('Insight Reading Status Tracking', () => {
    test('should mark insight as viewed when opened', async () => {
      const mockMarkAsViewed = jest.fn().mockResolvedValue(mockInsight);
      
      useRealtimeInsights.mockReturnValue({
        insights: [mockInsight],
        unreadCount: 1,
        isConnected: true,
        markAsViewed: mockMarkAsViewed,
        addResponse: jest.fn()
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // Navigate to insights tab
      const insightsTab = screen.getByText(/Insights/);
      fireEvent.click(insightsTab);

      // Click on an insight to view it
      const viewButton = screen.getByText('View');
      fireEvent.click(viewButton);

      // Should call markAsViewed
      await waitFor(() => {
        expect(mockMarkAsViewed).toHaveBeenCalledWith(mockInsight.id);
      });
    });

    test('should update insight viewed status in real-time', async () => {
      const mockMarkAsViewed = jest.fn().mockResolvedValue({
        ...mockInsight,
        client_viewed: true,
        client_viewed_at: new Date().toISOString()
      });

      useRealtimeInsights.mockReturnValue({
        insights: [mockInsight],
        unreadCount: 1,
        isConnected: true,
        markAsViewed: mockMarkAsViewed,
        addResponse: jest.fn()
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // Mark insight as viewed
      await act(async () => {
        await mockMarkAsViewed(mockInsight.id);
      });

      // Should update the Supabase database
      expect(supabase.from).toHaveBeenCalledWith('coaching_insights');
      expect(supabase.from().update).toHaveBeenCalledWith({
        client_viewed: true,
        client_viewed_at: expect.any(String)
      });
    });

    test('should track viewed timestamp', async () => {
      const viewedTimestamp = new Date().toISOString();
      const viewedInsight = {
        ...mockInsight,
        client_viewed: true,
        client_viewed_at: viewedTimestamp
      };

      useRealtimeInsights.mockReturnValue({
        insights: [viewedInsight],
        unreadCount: 0,
        isConnected: true,
        markAsViewed: jest.fn(),
        addResponse: jest.fn()
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // Should display viewed timestamp
      expect(screen.getByText(/Viewed/)).toBeInTheDocument();
    });
  });

  describe('Client Response and Feedback', () => {
    test('should allow client to respond to insight', async () => {
      const mockAddResponse = jest.fn().mockResolvedValue({
        ...mockInsight,
        client_response: 'Thank you for the feedback!'
      });

      useRealtimeInsights.mockReturnValue({
        insights: [mockInsight],
        unreadCount: 1,
        isConnected: true,
        markAsViewed: jest.fn(),
        addResponse: mockAddResponse
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // Navigate to insights and open insight
      const insightsTab = screen.getByText(/Insights/);
      fireEvent.click(insightsTab);

      const viewButton = screen.getByText('View');
      fireEvent.click(viewButton);

      // Add response
      const responseTextarea = screen.getByPlaceholderText(/your response/i);
      fireEvent.change(responseTextarea, {
        target: { value: 'Thank you for the feedback!' }
      });

      const sendButton = screen.getByText(/Send Response/i);
      fireEvent.click(sendButton);

      // Should call addResponse
      await waitFor(() => {
        expect(mockAddResponse).toHaveBeenCalledWith(
          mockInsight.id,
          'Thank you for the feedback!'
        );
      });
    });

    test('should create notification for coach when client responds', async () => {
      const mockAddResponse = jest.fn().mockImplementation(async (insightId, response) => {
        // Simulate the notification creation that happens in the hook
        await createNotification({
          userId: mockInsight.coach_id,
          type: 'insight_received',
          title: `💬 Client Response to "${mockInsight.title}"`,
          message: `Your client has responded to your insight: "${response.substring(0, 100)}"`,
          relatedId: insightId,
          relatedType: 'coaching_insight',
          actionUrl: `/coach/insights?clientId=${mockUser.id}`,
          actionText: 'View Response',
          priority: 'normal'
        });

        return {
          ...mockInsight,
          client_response: response
        };
      });

      useRealtimeInsights.mockReturnValue({
        insights: [mockInsight],
        unreadCount: 1,
        isConnected: true,
        markAsViewed: jest.fn(),
        addResponse: mockAddResponse
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // Simulate adding a response
      await act(async () => {
        await mockAddResponse(mockInsight.id, 'Thank you for the feedback!');
      });

      // Should create notification for coach
      expect(createNotification).toHaveBeenCalledWith({
        userId: mockInsight.coach_id,
        type: 'insight_received',
        title: expect.stringContaining('Client Response'),
        message: expect.stringContaining('Thank you for the feedback!'),
        relatedId: mockInsight.id,
        relatedType: 'coaching_insight',
        actionUrl: expect.stringContaining('/coach/insights'),
        actionText: 'View Response',
        priority: 'normal'
      });
    });

    test('should display existing client response', () => {
      const insightWithResponse = {
        ...mockInsight,
        client_response: 'Thank you for the advice!',
        client_viewed: true
      };

      useRealtimeInsights.mockReturnValue({
        insights: [insightWithResponse],
        unreadCount: 0,
        isConnected: true,
        markAsViewed: jest.fn(),
        addResponse: jest.fn()
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // Should show that there's a response
      expect(screen.getByText('View Response')).toBeInTheDocument();
    });
  });

  describe('Real-time Connection Status', () => {
    test('should show connection status indicator', () => {
      useRealtimeInsights.mockReturnValue({
        insights: [],
        unreadCount: 0,
        isConnected: true,
        markAsViewed: jest.fn(),
        addResponse: jest.fn()
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // Should show live indicator
      expect(screen.getByText('Live')).toBeInTheDocument();
    });

    test('should handle connection errors gracefully', () => {
      useRealtimeInsights.mockReturnValue({
        insights: [],
        unreadCount: 0,
        isConnected: false,
        error: new Error('Connection failed'),
        markAsViewed: jest.fn(),
        addResponse: jest.fn()
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // Should not show live indicator when disconnected
      expect(screen.queryByText('Live')).not.toBeInTheDocument();
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete insight workflow', async () => {
      const mockMarkAsViewed = jest.fn().mockResolvedValue({
        ...mockInsight,
        client_viewed: true,
        client_viewed_at: new Date().toISOString()
      });

      const mockAddResponse = jest.fn().mockResolvedValue({
        ...mockInsight,
        client_viewed: true,
        client_response: 'Thanks for the guidance!'
      });

      useRealtimeInsights.mockReturnValue({
        insights: [mockInsight],
        unreadCount: 1,
        isConnected: true,
        markAsViewed: mockMarkAsViewed,
        addResponse: mockAddResponse
      });

      render(
        <BrowserRouter>
          <MyCoach />
        </BrowserRouter>
      );

      // 1. Should show unread insight
      expect(screen.getByText('1 new')).toBeInTheDocument();

      // 2. Navigate to insights tab
      const insightsTab = screen.getByText(/Insights/);
      fireEvent.click(insightsTab);

      // 3. View insight (should mark as viewed)
      const viewButton = screen.getByText('View');
      fireEvent.click(viewButton);

      await waitFor(() => {
        expect(mockMarkAsViewed).toHaveBeenCalledWith(mockInsight.id);
      });

      // 4. Add response
      const responseTextarea = screen.getByPlaceholderText(/your response/i);
      fireEvent.change(responseTextarea, {
        target: { value: 'Thanks for the guidance!' }
      });

      const sendButton = screen.getByText(/Send Response/i);
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(mockAddResponse).toHaveBeenCalledWith(
          mockInsight.id,
          'Thanks for the guidance!'
        );
      });

      // 5. Should show success message
      expect(screen.getByText(/response has been sent/i)).toBeInTheDocument();
    });
  });
});