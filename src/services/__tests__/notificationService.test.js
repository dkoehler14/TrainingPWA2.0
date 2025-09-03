import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  createNotification,
  subscribeToNotifications
} from '../notificationService';
import { supabase } from '../../config/supabase';

// Mock Supabase
jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
    channel: jest.fn(),
    auth: {
      getUser: jest.fn()
    }
  }
}));

// Mock error handler
jest.mock('../../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn((error) => error),
  executeSupabaseOperation: jest.fn((fn) => Promise.resolve(fn()))
}));

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserNotifications', () => {
    const mockNotifications = [
      {
        id: 'notification-1',
        user_id: 'user-123',
        type: 'coaching_invitation',
        title: 'Coaching Invitation',
        message: 'You have a new coaching invitation',
        is_read: false,
        created_at: '2024-01-01T12:00:00Z'
      },
      {
        id: 'notification-2',
        user_id: 'user-123',
        type: 'program_assigned',
        title: 'New Program Assigned',
        message: 'Your coach assigned you a new program',
        is_read: true,
        created_at: '2024-01-01T11:00:00Z'
      }
    ];

    it('should retrieve user notifications successfully', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        or: jest.fn().mockResolvedValue({
          data: mockNotifications,
          error: null
        })
      };

      supabase.from.mockReturnValue(mockQuery);

      const result = await getUserNotifications();

      expect(result).toEqual(mockNotifications);
      expect(mockQuery.select).toHaveBeenCalledWith('*');
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });

    it('should filter unread notifications only', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockResolvedValue({
          data: [mockNotifications[0]], // Only unread
          error: null
        })
      };

      supabase.from.mockReturnValue(mockQuery);

      const result = await getUserNotifications({ unreadOnly: true });

      expect(result).toEqual([mockNotifications[0]]);
      expect(mockQuery.eq).toHaveBeenCalledWith('is_read', false);
    });

    it('should filter by notification type', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockResolvedValue({
          data: [mockNotifications[0]], // Only coaching invitations
          error: null
        })
      };

      supabase.from.mockReturnValue(mockQuery);

      const result = await getUserNotifications({ type: 'coaching_invitation' });

      expect(result).toEqual([mockNotifications[0]]);
      expect(mockQuery.eq).toHaveBeenCalledWith('type', 'coaching_invitation');
    });

    it('should limit results', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        or: jest.fn().mockResolvedValue({
          data: [mockNotifications[0]],
          error: null
        })
      };

      supabase.from.mockReturnValue(mockQuery);

      const result = await getUserNotifications({ limit: 1 });

      expect(result).toEqual([mockNotifications[0]]);
      expect(mockQuery.limit).toHaveBeenCalledWith(1);
    });
  });

  describe('getUnreadNotificationCount', () => {
    it('should return unread notification count', async () => {
      supabase.rpc.mockResolvedValue({
        data: 5,
        error: null
      });

      const result = await getUnreadNotificationCount();

      expect(result).toBe(5);
      expect(supabase.rpc).toHaveBeenCalledWith('get_unread_notification_count');
    });

    it('should return 0 if no data', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: null
      });

      const result = await getUnreadNotificationCount();

      expect(result).toBe(0);
    });
  });

  describe('markNotificationAsRead', () => {
    it('should mark notification as read', async () => {
      supabase.rpc.mockResolvedValue({
        error: null
      });

      await markNotificationAsRead('notification-123');

      expect(supabase.rpc).toHaveBeenCalledWith('mark_notification_read', {
        notification_id: 'notification-123'
      });
    });
  });

  describe('markAllNotificationsAsRead', () => {
    it('should mark all notifications as read', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: null
        })
      });

      supabase.from.mockReturnValue({
        update: mockUpdate
      });

      await markAllNotificationsAsRead();

      expect(mockUpdate).toHaveBeenCalledWith({
        is_read: true,
        read_at: expect.any(String),
        updated_at: expect.any(String)
      });
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification', async () => {
      const mockDelete = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: null
        })
      });

      supabase.from.mockReturnValue({
        delete: mockDelete
      });

      await deleteNotification('notification-123');

      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('createNotification', () => {
    it('should create notification successfully', async () => {
      const notificationData = {
        userId: 'user-123',
        type: 'coaching_invitation',
        title: 'New Invitation',
        message: 'You have a coaching invitation',
        priority: 'high'
      };

      const mockCreatedNotification = {
        id: 'notification-123',
        ...notificationData,
        user_id: notificationData.userId,
        created_at: '2024-01-01T12:00:00Z'
      };

      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockCreatedNotification,
            error: null
          })
        })
      });

      supabase.from.mockReturnValue({
        insert: mockInsert
      });

      const result = await createNotification(notificationData);

      expect(result).toEqual(mockCreatedNotification);
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'user-123',
        type: 'coaching_invitation',
        title: 'New Invitation',
        message: 'You have a coaching invitation',
        related_id: null,
        related_type: null,
        action_url: null,
        action_text: null,
        priority: 'high',
        expires_at: null
      });
    });
  });

  describe('subscribeToNotifications', () => {
    it('should create real-time subscription', () => {
      const mockCallback = jest.fn();
      const mockSubscribe = jest.fn();
      const mockOn = jest.fn().mockReturnValue({
        subscribe: mockSubscribe
      });
      const mockChannel = jest.fn().mockReturnValue({
        on: mockOn
      });

      supabase.channel = mockChannel;
      supabase.auth.getUser.mockReturnValue({
        data: { user: { id: 'user-123' } }
      });

      subscribeToNotifications(mockCallback);

      expect(mockChannel).toHaveBeenCalledWith('user-notifications');
      expect(mockOn).toHaveBeenCalledWith(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: 'user_id=eq.user-123'
        },
        mockCallback
      );
      expect(mockSubscribe).toHaveBeenCalled();
    });
  });
});