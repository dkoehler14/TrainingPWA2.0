/**
 * Integration test for coach program monitoring functionality
 * Tests the complete workflow from program assignment to completion tracking
 * Requirements: 4.2, 4.3, 5.5
 */

import { checkProgramCompletion } from '../services/coachProgramMonitoringService'

// Mock all external dependencies
jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: { invoke: jest.fn() }
  }
}))

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn()
}))

jest.mock('../api/supabaseCache', () => ({
  supabaseCache: {
    getWithCache: jest.fn((key, fetchFn) => fetchFn()),
    get: jest.fn(),
    set: jest.fn()
  }
}))

describe('Coach Program Monitoring Integration', () => {
  const mockClientId = 'client-123'
  const mockProgramId = 'program-456'
  const mockCoachId = 'coach-789'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Program Completion Workflow', () => {
    it('should handle complete program monitoring workflow', async () => {
      const { supabase } = require('../config/supabase')
      const { createNotification } = require('../services/notificationService')

      // Mock a completed program
      const mockProgram = {
        id: mockProgramId,
        name: 'Test Program',
        user_id: mockCoachId,
        coach_assigned: true,
        program_workouts: [
          { id: 'workout1' },
          { id: 'workout2' }
        ],
        coach: {
          id: mockCoachId,
          name: 'Coach John',
          email: 'coach@test.com'
        }
      }

      // Mock completed workout logs (100% completion)
      const mockCompletedLogs = [
        { id: 'log1' },
        { id: 'log2' }
      ]

      // Mock client data
      const mockClient = {
        name: 'Client Jane',
        email: 'client@test.com'
      }

      // Setup Supabase mocks
      supabase.from.mockImplementation((table) => {
        const mockQuery = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(),
          then: jest.fn()
        }

        if (table === 'programs') {
          mockQuery.single.mockResolvedValue({ data: mockProgram, error: null })
        } else if (table === 'workout_logs') {
          mockQuery.then.mockResolvedValue({ data: mockCompletedLogs, error: null })
        } else if (table === 'users') {
          mockQuery.single.mockResolvedValue({ data: mockClient, error: null })
        } else if (table === 'notifications') {
          // No existing notification
          mockQuery.single.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        }

        return mockQuery
      })

      createNotification.mockResolvedValue({ id: 'notification-123' })

      // Test program completion check
      const result = await checkProgramCompletion(mockClientId, mockProgramId)

      // Verify completion was detected and notifications sent
      expect(result).toBe(true)
      expect(createNotification).toHaveBeenCalledTimes(2)

      // Verify coach notification
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockCoachId,
          type: 'program_completion',
          title: '🎉 Program Completed!',
          priority: 'high'
        })
      )

      // Verify client notification
      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockClientId,
          type: 'program_completion_client',
          title: '🏆 Congratulations!',
          priority: 'high'
        })
      )
    })

    it('should not send duplicate completion notifications', async () => {
      const { supabase } = require('../config/supabase')
      const { createNotification } = require('../services/notificationService')

      const mockProgram = {
        id: mockProgramId,
        name: 'Test Program',
        user_id: mockCoachId,
        coach_assigned: true,
        program_workouts: [{ id: 'workout1' }, { id: 'workout2' }]
      }

      const mockCompletedLogs = [{ id: 'log1' }, { id: 'log2' }]

      // Mock existing notification (already sent)
      const existingNotification = { id: 'existing-notification' }

      supabase.from.mockImplementation((table) => {
        const mockQuery = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(),
          then: jest.fn()
        }

        if (table === 'programs') {
          mockQuery.single.mockResolvedValue({ data: mockProgram, error: null })
        } else if (table === 'workout_logs') {
          mockQuery.then.mockResolvedValue({ data: mockCompletedLogs, error: null })
        } else if (table === 'notifications') {
          // Existing notification found
          mockQuery.single.mockResolvedValue({ data: existingNotification, error: null })
        }

        return mockQuery
      })

      const result = await checkProgramCompletion(mockClientId, mockProgramId)

      // Should not send notification if already exists
      expect(result).toBe(false)
      expect(createNotification).not.toHaveBeenCalled()
    })

    it('should handle incomplete programs correctly', async () => {
      const { supabase } = require('../config/supabase')
      const { createNotification } = require('../services/notificationService')

      const mockProgram = {
        id: mockProgramId,
        name: 'Test Program',
        user_id: mockCoachId,
        coach_assigned: true,
        program_workouts: [{ id: 'workout1' }, { id: 'workout2' }]
      }

      // Only 1 out of 2 workouts completed (50%)
      const mockCompletedLogs = [{ id: 'log1' }]

      supabase.from.mockImplementation((table) => {
        const mockQuery = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn(),
          then: jest.fn()
        }

        if (table === 'programs') {
          mockQuery.single.mockResolvedValue({ data: mockProgram, error: null })
        } else if (table === 'workout_logs') {
          mockQuery.then.mockResolvedValue({ data: mockCompletedLogs, error: null })
        }

        return mockQuery
      })

      const result = await checkProgramCompletion(mockClientId, mockProgramId)

      // Should not trigger completion for incomplete program
      expect(result).toBe(false)
      expect(createNotification).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const { supabase } = require('../config/supabase')

      // Mock database error
      supabase.from.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ 
          data: null, 
          error: { message: 'Database connection failed' } 
        })
      }))

      const result = await checkProgramCompletion(mockClientId, mockProgramId)

      // Should return false on error without throwing
      expect(result).toBe(false)
    })

    it('should handle non-coach-assigned programs', async () => {
      const { supabase } = require('../config/supabase')

      // Mock program not found (not coach-assigned)
      supabase.from.mockImplementation(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ 
          data: null, 
          error: { code: 'PGRST116' } 
        })
      }))

      const result = await checkProgramCompletion(mockClientId, mockProgramId)

      expect(result).toBe(false)
    })
  })
})