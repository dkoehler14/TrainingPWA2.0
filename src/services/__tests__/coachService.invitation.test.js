import { sendInvitation, getCoachInvitations, acceptInvitation, declineInvitation } from '../coachService';
import { supabase } from '../../config/supabase';

// Mock Supabase
jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: {
      invoke: jest.fn()
    },
    rpc: jest.fn()
  }
}));

// Mock error handler
jest.mock('../../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn((error) => error),
  executeSupabaseOperation: jest.fn(async (fn) => await fn())
}));

describe('Coach Service - Invitation Management', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendInvitation', () => {
    const mockInvitationData = {
      coachId: 'coach-123',
      coachEmail: 'coach@example.com',
      coachName: 'John Coach',
      targetEmail: 'client@example.com',
      message: 'Welcome to my coaching program!'
    };

    const mockInvitationResponse = {
      id: 'invitation-123',
      coach_id: 'coach-123',
      target_email: 'client@example.com',
      invitation_code: 'abc123def456',
      expires_at: '2024-01-08T00:00:00Z'
    };

    it('should create email invitation successfully', async () => {
      // Mock database insert chain
      const mockSingle = jest.fn().mockResolvedValue({
        data: mockInvitationResponse,
        error: null
      });
      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle
      });
      const mockInsert = jest.fn().mockReturnValue({
        select: mockSelect
      });

      supabase.from.mockReturnValue({
        insert: mockInsert
      });

      // Mock email function
      supabase.functions.invoke.mockResolvedValue({ error: null });

      const result = await sendInvitation(mockInvitationData);

      expect(result).toEqual(mockInvitationResponse);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          coach_id: 'coach-123',
          target_email: 'client@example.com',
          invitation_code: expect.any(String),
          expires_at: expect.any(String)
        })
      );
      expect(supabase.functions.invoke).toHaveBeenCalledWith('send-coach-invitation', {
        body: { invitation: mockInvitationResponse }
      });
    });

    it('should create username invitation successfully', async () => {
      const usernameInvitationData = {
        ...mockInvitationData,
        targetUsername: 'client_user',
        targetEmail: undefined
      };

      // Mock user lookup chain
      const mockUserSingle = jest.fn().mockResolvedValue({
        data: { id: 'user-456' },
        error: null
      });
      const mockUserEq = jest.fn().mockReturnValue({
        single: mockUserSingle
      });
      const mockUserSelect = jest.fn().mockReturnValue({
        eq: mockUserEq
      });

      // Mock invitation insert chain
      const mockInvitationSingle = jest.fn().mockResolvedValue({
        data: { ...mockInvitationResponse, target_user_id: 'user-456' },
        error: null
      });
      const mockInvitationSelect = jest.fn().mockReturnValue({
        single: mockInvitationSingle
      });
      const mockInvitationInsert = jest.fn().mockReturnValue({
        select: mockInvitationSelect
      });

      // Mock notification insert
      const mockNotificationInsert = jest.fn().mockResolvedValue({ error: null });

      supabase.from
        .mockReturnValueOnce({
          select: mockUserSelect
        })
        .mockReturnValueOnce({
          insert: mockInvitationInsert
        })
        .mockReturnValueOnce({
          insert: mockNotificationInsert
        });

      const result = await sendInvitation(usernameInvitationData);

      expect(result).toEqual({ ...mockInvitationResponse, target_user_id: 'user-456' });
      expect(mockUserSelect).toHaveBeenCalled();
      expect(mockNotificationInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-456',
          type: 'coaching_invitation',
          title: expect.stringContaining('John Coach')
        })
      );
    });

    it('should handle username not found error', async () => {
      const usernameInvitationData = {
        ...mockInvitationData,
        targetUsername: 'nonexistent_user',
        targetEmail: undefined
      };

      // Mock user lookup failure chain
      const mockUserSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });
      const mockUserEq = jest.fn().mockReturnValue({
        single: mockUserSingle
      });
      const mockUserSelect = jest.fn().mockReturnValue({
        eq: mockUserEq
      });

      supabase.from.mockReturnValue({
        select: mockUserSelect
      });

      await expect(sendInvitation(usernameInvitationData))
        .rejects
        .toThrow('User with username "nonexistent_user" not found');
    });

    it('should handle email sending failure gracefully', async () => {
      // Mock database insert success chain
      const mockSingle = jest.fn().mockResolvedValue({
        data: mockInvitationResponse,
        error: null
      });
      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle
      });
      const mockInsert = jest.fn().mockReturnValue({
        select: mockSelect
      });

      // Mock update chain for error logging
      const mockUpdateEq = jest.fn().mockResolvedValue({ error: null });
      const mockUpdate = jest.fn().mockReturnValue({
        eq: mockUpdateEq
      });

      supabase.from
        .mockReturnValueOnce({
          insert: mockInsert
        })
        .mockReturnValueOnce({
          update: mockUpdate
        });

      // Mock email function failure
      supabase.functions.invoke.mockResolvedValue({ 
        error: { message: 'SMTP server unavailable' }
      });

      const result = await sendInvitation(mockInvitationData);

      // Should still return the invitation even if email fails
      expect(result).toEqual(mockInvitationResponse);
    });
  });

  describe('getCoachInvitations', () => {
    it('should retrieve coach invitations successfully', async () => {
      const mockInvitations = [
        {
          id: 'invitation-1',
          coach_id: 'coach-123',
          target_email: 'client1@example.com',
          status: 'pending'
        },
        {
          id: 'invitation-2',
          coach_id: 'coach-123',
          target_email: 'client2@example.com',
          status: 'accepted'
        }
      ];

      const mockOrder = jest.fn().mockResolvedValue({
        data: mockInvitations,
        error: null
      });
      const mockEq = jest.fn().mockReturnValue({
        order: mockOrder
      });
      const mockSelect = jest.fn().mockReturnValue({
        eq: mockEq
      });

      supabase.from.mockReturnValue({
        select: mockSelect
      });

      const result = await getCoachInvitations('coach-123');

      expect(result).toEqual(mockInvitations);
      expect(mockEq).toHaveBeenCalledWith('coach_id', 'coach-123');
    });

    it('should filter invitations by status', async () => {
      const mockOrder = jest.fn().mockResolvedValue({
        data: [],
        error: null
      });
      const mockEq2 = jest.fn().mockReturnValue({
        order: mockOrder
      });
      const mockEq1 = jest.fn().mockReturnValue({
        eq: mockEq2
      });
      const mockSelect = jest.fn().mockReturnValue({
        eq: mockEq1
      });

      supabase.from.mockReturnValue({
        select: mockSelect
      });

      await getCoachInvitations('coach-123', 'pending');

      expect(mockEq1).toHaveBeenCalledWith('coach_id', 'coach-123');
      expect(mockEq2).toHaveBeenCalledWith('status', 'pending');
    });
  });

  describe('acceptInvitation', () => {
    it('should accept invitation successfully', async () => {
      supabase.rpc.mockResolvedValue({
        data: 'relationship-123',
        error: null
      });

      const result = await acceptInvitation('invitation-123');

      expect(result).toBe('relationship-123');
      expect(supabase.rpc).toHaveBeenCalledWith('accept_coaching_invitation', {
        invitation_id: 'invitation-123'
      });
    });

    it('should handle acceptance errors', async () => {
      supabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Invitation already accepted' }
      });

      await expect(acceptInvitation('invitation-123'))
        .rejects
        .toThrow();
    });
  });

  describe('declineInvitation', () => {
    it('should decline invitation successfully', async () => {
      const mockDeclinedInvitation = {
        id: 'invitation-123',
        status: 'declined',
        responded_at: '2024-01-01T12:00:00Z'
      };

      const mockSingle = jest.fn().mockResolvedValue({
        data: mockDeclinedInvitation,
        error: null
      });
      const mockSelect = jest.fn().mockReturnValue({
        single: mockSingle
      });
      const mockEq = jest.fn().mockReturnValue({
        select: mockSelect
      });
      const mockUpdate = jest.fn().mockReturnValue({
        eq: mockEq
      });

      supabase.from.mockReturnValue({
        update: mockUpdate
      });

      const result = await declineInvitation('invitation-123');

      expect(result).toEqual(mockDeclinedInvitation);
      expect(mockUpdate).toHaveBeenCalledWith({
        status: 'declined',
        responded_at: expect.any(String)
      });
    });
  });
});