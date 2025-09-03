import { sendInvitation, acceptInvitation, declineInvitation } from '../services/coachService';
import { getUserNotifications, createNotification } from '../services/notificationService';
import { supabase } from '../config/supabase';

// Mock Supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: {
      invoke: jest.fn()
    },
    rpc: jest.fn(),
    channel: jest.fn(),
    auth: {
      getUser: jest.fn()
    }
  }
}));

// Mock error handler
jest.mock('../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn((error) => error),
  executeSupabaseOperation: jest.fn((fn) => fn())
}));

describe('Invitation System Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Email Invitation Flow', () => {
    it('should handle complete email invitation workflow', async () => {
      const coachData = {
        coachId: 'coach-123',
        coachEmail: 'coach@example.com',
        coachName: 'John Coach',
        targetEmail: 'client@example.com',
        message: 'Welcome to my coaching program!'
      };

      const mockInvitation = {
        id: 'invitation-123',
        coach_id: 'coach-123',
        target_email: 'client@example.com',
        invitation_code: 'abc123def456',
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };

      // Step 1: Send invitation
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockInvitation,
            error: null
          })
        })
      });

      supabase.from.mockReturnValue({
        insert: mockInsert
      });

      supabase.functions.invoke.mockResolvedValue({ error: null });

      const sentInvitation = await sendInvitation(coachData);

      expect(sentInvitation).toEqual(mockInvitation);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-coach-invitation', {
        body: { invitation: mockInvitation }
      });

      // Step 2: Accept invitation
      supabase.rpc.mockResolvedValue({
        data: 'relationship-123',
        error: null
      });

      const relationshipId = await acceptInvitation(mockInvitation.id);

      expect(relationshipId).toBe('relationship-123');
      expect(supabase.rpc).toHaveBeenCalledWith('accept_coaching_invitation', {
        invitation_id: mockInvitation.id
      });
    });

    it('should handle email invitation decline workflow', async () => {
      const mockInvitation = {
        id: 'invitation-123',
        status: 'pending'
      };

      const mockDeclinedInvitation = {
        ...mockInvitation,
        status: 'declined',
        responded_at: '2024-01-01T12:00:00Z'
      };

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockDeclinedInvitation,
              error: null
            })
          })
        })
      });

      supabase.from.mockReturnValue({
        update: mockUpdate
      });

      const result = await declineInvitation(mockInvitation.id);

      expect(result).toEqual(mockDeclinedInvitation);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'declined',
        responded_at: expect.any(String)
      });
    });
  });

  describe('Complete Username Invitation Flow', () => {
    it('should handle complete username invitation workflow', async () => {
      const coachData = {
        coachId: 'coach-123',
        coachEmail: 'coach@example.com',
        coachName: 'John Coach',
        targetUsername: 'client_user',
        message: 'Welcome to my coaching program!'
      };

      const mockUser = { id: 'user-456' };
      const mockInvitation = {
        id: 'invitation-123',
        coach_id: 'coach-123',
        target_user_id: 'user-456',
        invitation_code: 'abc123def456',
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };

      // Step 1: Send invitation (includes user lookup and notification creation)
      const mockUserSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockUser,
            error: null
          })
        })
      });

      const mockInvitationInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockInvitation,
            error: null
          })
        })
      });

      const mockNotificationInsert = jest.fn().mockResolvedValue({ error: null });

      supabase.from
        .mockReturnValueOnce({ select: mockUserSelect }) // User lookup
        .mockReturnValueOnce({ insert: mockInvitationInsert }) // Invitation creation
        .mockReturnValueOnce({ insert: mockNotificationInsert }); // Notification creation

      const sentInvitation = await sendInvitation(coachData);

      expect(sentInvitation).toEqual(mockInvitation);
      expect(mockUserSelect).toHaveBeenCalled();
      expect(mockNotificationInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-456',
          type: 'coaching_invitation',
          title: expect.stringContaining('John Coach'),
          related_id: mockInvitation.id
        })
      );

      // Step 2: User sees notification
      const mockNotifications = [
        {
          id: 'notification-123',
          user_id: 'user-456',
          type: 'coaching_invitation',
          title: '🏋️ Coaching Invitation from John Coach',
          message: 'John Coach has invited you to be their client: "Welcome to my coaching program!"',
          related_id: mockInvitation.id,
          is_read: false
        }
      ];

      const mockNotificationQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        or: jest.fn().mockResolvedValue({
          data: mockNotifications,
          error: null
        })
      };

      supabase.from.mockReturnValue(mockNotificationQuery);

      const notifications = await getUserNotifications();

      expect(notifications).toEqual(mockNotifications);
      expect(notifications[0].related_id).toBe(mockInvitation.id);

      // Step 3: Accept invitation
      supabase.rpc.mockResolvedValue({
        data: 'relationship-123',
        error: null
      });

      const relationshipId = await acceptInvitation(mockInvitation.id);

      expect(relationshipId).toBe('relationship-123');
    });

    it('should handle username not found error', async () => {
      const coachData = {
        coachId: 'coach-123',
        coachEmail: 'coach@example.com',
        coachName: 'John Coach',
        targetUsername: 'nonexistent_user'
      };

      // Mock user lookup failure
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }
            })
          })
        })
      });

      await expect(sendInvitation(coachData))
        .rejects
        .toThrow('User with username "nonexistent_user" not found');
    });
  });

  describe('Invitation Error Handling', () => {
    it('should handle duplicate invitation attempts', async () => {
      const coachData = {
        coachId: 'coach-123',
        coachEmail: 'coach@example.com',
        coachName: 'John Coach',
        targetEmail: 'client@example.com'
      };

      // Mock duplicate key error
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' }
          })
        })
      });

      supabase.from.mockReturnValue({
        insert: mockInsert
      });

      await expect(sendInvitation(coachData))
        .rejects
        .toThrow();
    });

    it('should handle expired invitation acceptance', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Invitation has expired' }
      });

      await expect(acceptInvitation('expired-invitation-123'))
        .rejects
        .toThrow();
    });

    it('should handle already accepted invitation', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Invitation already accepted' }
      });

      await expect(acceptInvitation('accepted-invitation-123'))
        .rejects
        .toThrow();
    });
  });

  describe('Notification System Integration', () => {
    it('should create and retrieve coaching invitation notifications', async () => {
      const notificationData = {
        userId: 'user-123',
        type: 'coaching_invitation',
        title: '🏋️ Coaching Invitation from John Coach',
        message: 'John Coach has invited you to be their client',
        relatedId: 'invitation-123',
        relatedType: 'client_invitation',
        actionUrl: '/invitation/abc123',
        actionText: 'View Invitation',
        priority: 'high'
      };

      const mockCreatedNotification = {
        id: 'notification-123',
        ...notificationData,
        user_id: notificationData.userId,
        related_id: notificationData.relatedId,
        related_type: notificationData.relatedType,
        action_url: notificationData.actionUrl,
        action_text: notificationData.actionText,
        is_read: false,
        created_at: '2024-01-01T12:00:00Z'
      };

      // Create notification
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

      const createdNotification = await createNotification(notificationData);

      expect(createdNotification).toEqual(mockCreatedNotification);

      // Retrieve notifications
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        or: jest.fn().mockResolvedValue({
          data: [mockCreatedNotification],
          error: null
        })
      };

      supabase.from.mockReturnValue(mockQuery);

      const notifications = await getUserNotifications({ type: 'coaching_invitation' });

      expect(notifications).toEqual([mockCreatedNotification]);
      expect(notifications[0].type).toBe('coaching_invitation');
      expect(notifications[0].action_url).toBe('/invitation/abc123');
    });
  });

  describe('Edge Function Integration', () => {
    it('should handle email sending success', async () => {
      const coachData = {
        coachId: 'coach-123',
        coachEmail: 'coach@example.com',
        coachName: 'John Coach',
        targetEmail: 'client@example.com'
      };

      const mockInvitation = {
        id: 'invitation-123',
        invitation_code: 'abc123def456'
      };

      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockInvitation,
            error: null
          })
        })
      });

      supabase.from.mockReturnValue({
        insert: mockInsert
      });

      // Mock successful email sending
      supabase.functions.invoke.mockResolvedValue({ error: null });

      const result = await sendInvitation(coachData);

      expect(result).toEqual(mockInvitation);
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-coach-invitation', {
        body: { invitation: mockInvitation }
      });
    });

    it('should handle email sending failure gracefully', async () => {
      const coachData = {
        coachId: 'coach-123',
        coachEmail: 'coach@example.com',
        coachName: 'John Coach',
        targetEmail: 'client@example.com'
      };

      const mockInvitation = {
        id: 'invitation-123',
        invitation_code: 'abc123def456'
      };

      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockInvitation,
            error: null
          })
        })
      });

      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null })
      });

      supabase.from
        .mockReturnValueOnce({ insert: mockInsert })
        .mockReturnValueOnce({ update: mockUpdate });

      // Mock email sending failure
      supabase.functions.invoke.mockResolvedValue({ 
        error: { message: 'SMTP server unavailable' }
      });

      const result = await sendInvitation(coachData);

      // Should still return invitation even if email fails
      expect(result).toEqual(mockInvitation);
      
      // Should update invitation with error
      expect(mockUpdate).toHaveBeenCalledWith({
        email_error: 'SMTP server unavailable',
        updated_at: expect.any(String)
      });
    });
  });
});