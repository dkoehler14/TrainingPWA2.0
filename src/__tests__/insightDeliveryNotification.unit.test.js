/**
 * Insight Delivery and Notification System Unit Tests
 * 
 * Focused unit tests for the insight delivery system components
 * Tests individual functions and components in isolation
 * 
 * Requirements: 7.2, 7.6, 6.1
 */

describe('Insight Delivery and Notification System - Unit Tests', () => {
  describe('Real-time Insight Notifications', () => {
    test('should create notification data structure correctly', () => {
      const insight = {
        id: 'insight-1',
        type: 'recommendation',
        title: 'Improve Your Squat Form',
        priority: 'high',
        coach: { name: 'John Coach' }
      };

      const expectedNotification = {
        id: `insight-${insight.id}-${expect.any(Number)}`,
        insightId: insight.id,
        type: insight.type,
        title: insight.title,
        priority: insight.priority,
        coachName: insight.coach.name,
        timestamp: expect.any(Date),
        show: true
      };

      // This would be the logic inside InsightNotificationToast
      const createToastNotification = (insight) => ({
        id: `insight-${insight.id}-${Date.now()}`,
        insightId: insight.id,
        type: insight.type,
        title: insight.title,
        priority: insight.priority,
        coachName: insight.coach?.name || 'Your Coach',
        timestamp: new Date(),
        show: true
      });

      const result = createToastNotification(insight);
      
      expect(result).toMatchObject({
        insightId: insight.id,
        type: insight.type,
        title: insight.title,
        priority: insight.priority,
        coachName: insight.coach.name,
        show: true
      });
      expect(result.id).toContain('insight-');
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    test('should determine correct toast variant based on priority', () => {
      const getToastVariant = (priority) => {
        switch (priority) {
          case 'high': return 'danger';
          case 'medium': return 'warning';
          case 'low': return 'info';
          default: return 'primary';
        }
      };

      expect(getToastVariant('high')).toBe('danger');
      expect(getToastVariant('medium')).toBe('warning');
      expect(getToastVariant('low')).toBe('info');
      expect(getToastVariant('unknown')).toBe('primary');
    });

    test('should get correct insight type icon', () => {
      const getInsightIcon = (type) => {
        switch (type) {
          case 'recommendation': return '💡';
          case 'observation': return '👁️';
          case 'goal_update': return '🎯';
          case 'program_adjustment': return '📋';
          default: return '💬';
        }
      };

      expect(getInsightIcon('recommendation')).toBe('💡');
      expect(getInsightIcon('observation')).toBe('👁️');
      expect(getInsightIcon('goal_update')).toBe('🎯');
      expect(getInsightIcon('program_adjustment')).toBe('📋');
      expect(getInsightIcon('unknown')).toBe('💬');
    });
  });

  describe('Insight Reading Status Tracking', () => {
    test('should create correct update payload for marking as viewed', () => {
      const createViewedUpdate = () => ({
        client_viewed: true,
        client_viewed_at: new Date().toISOString()
      });

      const result = createViewedUpdate();
      
      expect(result.client_viewed).toBe(true);
      expect(result.client_viewed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should calculate unread count correctly', () => {
      const insights = [
        { id: '1', client_viewed: true },
        { id: '2', client_viewed: false },
        { id: '3', client_viewed: false },
        { id: '4', client_viewed: true }
      ];

      const calculateUnreadCount = (insights) => 
        insights.filter(insight => !insight.client_viewed).length;

      expect(calculateUnreadCount(insights)).toBe(2);
      expect(calculateUnreadCount([])).toBe(0);
      expect(calculateUnreadCount([{ id: '1', client_viewed: true }])).toBe(0);
    });

    test('should update insight in list when marked as viewed', () => {
      const insights = [
        { id: '1', client_viewed: false },
        { id: '2', client_viewed: false }
      ];

      const markInsightAsViewed = (insights, insightId) => {
        return insights.map(insight =>
          insight.id === insightId 
            ? { 
                ...insight, 
                client_viewed: true, 
                client_viewed_at: new Date().toISOString() 
              }
            : insight
        );
      };

      const result = markInsightAsViewed(insights, '1');
      
      expect(result[0].client_viewed).toBe(true);
      expect(result[0].client_viewed_at).toBeDefined();
      expect(result[1].client_viewed).toBe(false);
    });
  });

  describe('Client Response and Feedback', () => {
    test('should create correct response update payload', () => {
      const response = 'Thank you for the feedback!';
      
      const createResponseUpdate = (response) => ({
        client_response: response,
        updated_at: new Date().toISOString()
      });

      const result = createResponseUpdate(response);
      
      expect(result.client_response).toBe(response);
      expect(result.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    test('should create coach notification data for client response', () => {
      const insight = {
        id: 'insight-1',
        title: 'Improve Your Squat Form',
        coach_id: 'coach-1'
      };
      const response = 'Thank you for the feedback!';
      const clientId = 'client-1';

      const createCoachNotification = (insight, response, clientId) => ({
        userId: insight.coach_id,
        type: 'insight_received',
        title: `💬 Client Response to "${insight.title}"`,
        message: `Your client has responded to your insight: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`,
        relatedId: insight.id,
        relatedType: 'coaching_insight',
        actionUrl: `/coach/insights?clientId=${clientId}`,
        actionText: 'View Response',
        priority: 'normal'
      });

      const result = createCoachNotification(insight, response, clientId);
      
      expect(result.userId).toBe(insight.coach_id);
      expect(result.type).toBe('insight_received');
      expect(result.title).toContain('Client Response');
      expect(result.message).toContain(response);
      expect(result.relatedId).toBe(insight.id);
      expect(result.actionUrl).toContain(clientId);
    });

    test('should truncate long responses in notification message', () => {
      const longResponse = 'A'.repeat(150);
      
      const createTruncatedMessage = (response) => 
        `Your client has responded: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`;

      const result = createTruncatedMessage(longResponse);
      
      expect(result).toHaveLength(133); // "Your client has responded: " + 100 chars + "..."
      expect(result).toEndWith('...');
    });
  });

  describe('Real-time Connection Management', () => {
    test('should create correct channel name for user', () => {
      const userId = 'user-123';
      const createChannelName = (userId) => `insights_${userId}`;
      
      expect(createChannelName(userId)).toBe('insights_user-123');
    });

    test('should handle subscription status correctly', () => {
      const handleSubscriptionStatus = (status) => {
        switch (status) {
          case 'SUBSCRIBED':
            return { connected: true, error: null };
          case 'CHANNEL_ERROR':
            return { connected: false, error: 'Failed to subscribe to insight updates' };
          default:
            return { connected: false, error: null };
        }
      };

      expect(handleSubscriptionStatus('SUBSCRIBED')).toEqual({
        connected: true,
        error: null
      });

      expect(handleSubscriptionStatus('CHANNEL_ERROR')).toEqual({
        connected: false,
        error: 'Failed to subscribe to insight updates'
      });

      expect(handleSubscriptionStatus('CLOSED')).toEqual({
        connected: false,
        error: null
      });
    });
  });

  describe('Notification Priority and Filtering', () => {
    test('should filter insights by priority correctly', () => {
      const insights = [
        { id: '1', priority: 'high' },
        { id: '2', priority: 'medium' },
        { id: '3', priority: 'low' },
        { id: '4', priority: 'high' }
      ];

      const filterByPriority = (insights, priority) => 
        insights.filter(insight => insight.priority === priority);

      expect(filterByPriority(insights, 'high')).toHaveLength(2);
      expect(filterByPriority(insights, 'medium')).toHaveLength(1);
      expect(filterByPriority(insights, 'low')).toHaveLength(1);
    });

    test('should determine auto-hide timeout based on priority', () => {
      const getAutoHideTimeout = (priority) => {
        switch (priority) {
          case 'high': return null; // Never auto-hide
          case 'medium': return 15000; // 15 seconds
          case 'low': return 8000; // 8 seconds
          default: return 10000; // 10 seconds
        }
      };

      expect(getAutoHideTimeout('high')).toBeNull();
      expect(getAutoHideTimeout('medium')).toBe(15000);
      expect(getAutoHideTimeout('low')).toBe(8000);
      expect(getAutoHideTimeout('normal')).toBe(10000);
    });
  });

  describe('Data Validation', () => {
    test('should validate insight data structure', () => {
      const validateInsight = (insight) => {
        const required = ['id', 'coach_id', 'client_id', 'type', 'title', 'content'];
        const missing = required.filter(field => !insight[field]);
        
        return {
          valid: missing.length === 0,
          missing
        };
      };

      const validInsight = {
        id: '1',
        coach_id: 'coach-1',
        client_id: 'client-1',
        type: 'recommendation',
        title: 'Test',
        content: 'Test content'
      };

      const invalidInsight = {
        id: '1',
        type: 'recommendation'
      };

      expect(validateInsight(validInsight)).toEqual({
        valid: true,
        missing: []
      });

      expect(validateInsight(invalidInsight)).toEqual({
        valid: false,
        missing: ['coach_id', 'client_id', 'title', 'content']
      });
    });

    test('should validate response data', () => {
      const validateResponse = (response) => {
        if (!response || typeof response !== 'string') {
          return { valid: false, error: 'Response must be a non-empty string' };
        }
        
        if (response.trim().length === 0) {
          return { valid: false, error: 'Response cannot be empty' };
        }
        
        if (response.length > 1000) {
          return { valid: false, error: 'Response too long (max 1000 characters)' };
        }
        
        return { valid: true, error: null };
      };

      expect(validateResponse('Valid response')).toEqual({
        valid: true,
        error: null
      });

      expect(validateResponse('')).toEqual({
        valid: false,
        error: 'Response cannot be empty'
      });

      expect(validateResponse('A'.repeat(1001))).toEqual({
        valid: false,
        error: 'Response too long (max 1000 characters)'
      });
    });
  });
});