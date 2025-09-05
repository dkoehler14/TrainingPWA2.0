import { sendInvitation } from '../services/coachService';

// Mock Supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: {
      invoke: jest.fn()
    }
  }
}));

// Mock error handler
jest.mock('../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn((error) => error),
  executeSupabaseOperation: jest.fn()
}));

describe('Invitation System - Email Only', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Email Invitation Logic', () => {
    it('should check if email exists in users table for existing users', async () => {
      const { supabase } = require('../config/supabase');
      const { executeSupabaseOperation } = require('../utils/supabaseErrorHandler');

      const coachData = {
        coachId: 'coach-123',
        coachEmail: 'coach@example.com',
        coachName: 'John Coach',
        targetEmail: 'existing@example.com',
        message: 'Welcome!'
      };

      const mockUser = { id: 'user-456' };
      const mockInvitation = {
        id: 'invitation-123',
        target_user_id: 'user-456',
        target_email: 'existing@example.com'
      };

      // Mock user lookup (existing user found)
      supabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockUser,
              error: null
            })
          })
        })
      });

      // Mock invitation creation
      supabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      // Mock notification creation for existing user
      supabase.from.mockReturnValueOnce({
        insert: jest.fn().mockResolvedValue({ error: null })
      });

      supabase.functions.invoke.mockResolvedValue({ error: null });

      // Mock the executeSupabaseOperation to actually execute the function
      executeSupabaseOperation.mockImplementation(async (operation) => {
        return await operation();
      });

      const result = await sendInvitation(coachData);

      expect(result).toEqual(mockInvitation);
      expect(supabase.from).toHaveBeenCalledWith('users');
      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    it('should handle new users (email not in users table)', async () => {
      const { supabase } = require('../config/supabase');
      const { executeSupabaseOperation } = require('../utils/supabaseErrorHandler');

      const coachData = {
        coachId: 'coach-123',
        coachEmail: 'coach@example.com',
        coachName: 'John Coach',
        targetEmail: 'newuser@example.com',
        message: 'Welcome!'
      };

      const mockInvitation = {
        id: 'invitation-123',
        target_user_id: null,
        target_email: 'newuser@example.com'
      };

      // Mock user lookup (no existing user)
      supabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }
            })
          })
        })
      });

      // Mock invitation creation
      supabase.from.mockReturnValueOnce({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        })
      });

      supabase.functions.invoke.mockResolvedValue({ error: null });

      // Mock the executeSupabaseOperation to actually execute the function
      executeSupabaseOperation.mockImplementation(async (operation) => {
        return await operation();
      });

      const result = await sendInvitation(coachData);

      expect(result).toEqual(mockInvitation);
      expect(result.target_user_id).toBeNull();
      expect(supabase.functions.invoke).toHaveBeenCalled();
    });
  });
});