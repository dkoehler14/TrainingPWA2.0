// Mock Supabase configuration before importing
jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
    functions: {
      invoke: jest.fn()
    }
  }
}))

jest.mock('../notificationService', () => ({
  createNotification: jest.fn()
}))

jest.mock('../permissionService', () => ({
  canAccessClientData: jest.fn()
}))

jest.mock('../../api/supabaseCache', () => ({
  supabaseCache: {
    getWithCache: jest.fn((key, fetchFn, options) => fetchFn()),
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn()
  }
}))

import {
  getClientProgramProgress,
  getProgramCompletionAnalytics,
  generateProgramEffectivenessReport,
  checkProgramCompletion
} from '../coachProgramMonitoringService'
import { supabase } from '../../config/supabase'
import { createNotification } from '../notificationService'

describe('CoachProgramMonitoringService', () => {
  const mockCoachId = 'coach-123'
  const mockClientId = 'client-456'
  const mockProgramId = 'program-789'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getClientProgramProgress', () => {
    it('should fetch and calculate program progress metrics', async () => {
      // Mock permission check
      const { canAccessClientData } = require('../permissionService')
      canAccessClientData.mockResolvedValue(true)

      // Mock program data
      const mockProgram = {
        id: mockProgramId,
        name: 'Test Program',
        assigned_to_client: mockClientId,
        assigned_at: '2024-01-01T00:00:00Z',
        expected_duration_weeks: 8,
        days_per_week: 3,
        program_workouts: [
          { id: 'w1', week_number: 1, day_number: 1, program_exercises: [{ exercise_id: 'ex1', exercises: { name: 'Squat' } }] },
          { id: 'w2', week_number: 1, day_number: 2, program_exercises: [{ exercise_id: 'ex2', exercises: { name: 'Bench' } }] },
          { id: 'w3', week_number: 2, day_number: 1, program_exercises: [{ exercise_id: 'ex1', exercises: { name: 'Squat' } }] }
        ]
      }

      // Mock workout logs
      const mockWorkoutLogs = [
        {
          id: 'log1',
          user_id: mockClientId,
          program_id: mockProgramId,
          is_finished: true,
          completed_date: '2024-01-02T00:00:00Z',
          day_number: 1,
          workout_log_exercises: [
            {
              exercise_id: 'ex1',
              sets: [{ reps: 10, weight: 100 }, { reps: 8, weight: 105 }]
            }
          ]
        }
      ]

      // Mock Supabase responses
      supabase.from.mockImplementation((table) => {
        if (table === 'programs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockProgram, error: null })
          }
        }
        if (table === 'workout_logs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: mockWorkoutLogs, error: null })
          }
        }
      })

      const result = await getClientProgramProgress(mockCoachId, mockClientId, mockProgramId)

      expect(result).toHaveProperty('program')
      expect(result).toHaveProperty('workoutLogs')
      expect(result).toHaveProperty('progressMetrics')
      expect(result.progressMetrics).toHaveProperty('overall')
      expect(result.progressMetrics).toHaveProperty('weekly')
      expect(result.progressMetrics).toHaveProperty('exercises')
      expect(result.progressMetrics.overall.totalWorkouts).toBe(3)
      expect(result.progressMetrics.overall.completedWorkouts).toBe(1)
    })

    it('should throw error if coach lacks permission', async () => {
      const { canAccessClientData } = require('../permissionService')
      canAccessClientData.mockResolvedValue(false)

      await expect(
        getClientProgramProgress(mockCoachId, mockClientId, mockProgramId)
      ).rejects.toThrow('Permission denied: Cannot access client progress data')
    })
  })

  describe('checkProgramCompletion', () => {
    it('should send completion notification when program is 100% complete', async () => {
      // Mock program with coach info
      const mockProgram = {
        id: mockProgramId,
        name: 'Test Program',
        user_id: mockCoachId,
        coach_assigned: true,
        program_workouts: [
          { id: 'w1' },
          { id: 'w2' }
        ],
        coach: { id: mockCoachId, name: 'Coach John', email: 'coach@test.com' }
      }

      // Mock completed workout logs (100% completion)
      const mockCompletedLogs = [
        { id: 'log1' },
        { id: 'log2' }
      ]

      // Mock no existing notification
      supabase.from.mockImplementation((table) => {
        if (table === 'programs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockProgram, error: null })
          }
        }
        if (table === 'workout_logs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: mockCompletedLogs, error: null })
          }
        }
        if (table === 'notifications') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          }
        }
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ 
              data: { name: 'Client Jane', email: 'client@test.com' }, 
              error: null 
            })
          }
        }
      })

      createNotification.mockResolvedValue({ id: 'notification-123' })

      const result = await checkProgramCompletion(mockClientId, mockProgramId)

      expect(result).toBe(true)
      expect(createNotification).toHaveBeenCalledTimes(2) // Coach and client notifications
    })

    it('should not send notification if program is not 100% complete', async () => {
      const mockProgram = {
        id: mockProgramId,
        name: 'Test Program',
        user_id: mockCoachId,
        coach_assigned: true,
        program_workouts: [
          { id: 'w1' },
          { id: 'w2' }
        ]
      }

      // Mock incomplete workout logs (50% completion)
      const mockCompletedLogs = [
        { id: 'log1' }
      ]

      supabase.from.mockImplementation((table) => {
        if (table === 'programs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: mockProgram, error: null })
          }
        }
        if (table === 'workout_logs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: mockCompletedLogs, error: null })
          }
        }
      })

      const result = await checkProgramCompletion(mockClientId, mockProgramId)

      expect(result).toBe(false)
      expect(createNotification).not.toHaveBeenCalled()
    })

    it('should return false for non-coach-assigned programs', async () => {
      supabase.from.mockImplementation((table) => {
        if (table === 'programs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
          }
        }
      })

      const result = await checkProgramCompletion(mockClientId, mockProgramId)

      expect(result).toBe(false)
      expect(createNotification).not.toHaveBeenCalled()
    })
  })

  describe('getProgramCompletionAnalytics', () => {
    it('should calculate completion analytics for coach programs', async () => {
      const mockPrograms = [
        {
          id: 'prog1',
          name: 'Program 1',
          assigned_to_client: 'client1',
          assigned_at: '2024-01-01T00:00:00Z',
          assigned_client: { name: 'Client 1' },
          program_workouts: [{ id: 'w1' }, { id: 'w2' }]
        },
        {
          id: 'prog2',
          name: 'Program 2',
          assigned_to_client: 'client2',
          assigned_at: '2024-01-01T00:00:00Z',
          assigned_client: { name: 'Client 2' },
          program_workouts: [{ id: 'w3' }, { id: 'w4' }]
        }
      ]

      const mockWorkoutLogs = [
        { id: 'log1', program_id: 'prog1', completed_date: '2024-01-02T00:00:00Z' },
        { id: 'log2', program_id: 'prog1', completed_date: '2024-01-03T00:00:00Z' },
        { id: 'log3', program_id: 'prog2', completed_date: '2024-01-04T00:00:00Z' }
      ]

      supabase.from.mockImplementation((table) => {
        if (table === 'programs') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            not: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: mockPrograms, error: null })
          }
        }
        if (table === 'workout_logs') {
          return {
            select: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: jest.fn().mockResolvedValue({ data: mockWorkoutLogs, error: null })
          }
        }
      })

      const result = await getProgramCompletionAnalytics(mockCoachId, { timeframe: '90d' })

      expect(result).toHaveProperty('totalPrograms', 2)
      expect(result).toHaveProperty('completionStats')
      expect(result).toHaveProperty('clientStats')
      expect(result).toHaveProperty('programStats')
      expect(result.completionStats).toHaveProperty('overallCompletionRate')
      expect(result.programStats).toHaveLength(2)
    })
  })

  describe('generateProgramEffectivenessReport', () => {
    it('should generate comprehensive effectiveness report', async () => {
      // Mock completion analytics
      const mockCompletionAnalytics = {
        totalPrograms: 2,
        completionStats: {
          overallCompletionRate: 75,
          programsWithActivity: 2,
          fullyCompletedPrograms: 1,
          activePrograms: 1,
          inactivePrograms: 0
        },
        clientStats: {
          'client1': {
            clientName: 'Client 1',
            totalPrograms: 1,
            completedPrograms: 1,
            averageCompletionRate: 100,
            totalWorkouts: 2,
            completedWorkouts: 2,
            lastActivity: Date.now() - 24 * 60 * 60 * 1000 // 1 day ago
          }
        },
        programStats: [
          {
            programId: 'prog1',
            programName: 'Program 1',
            clientId: 'client1',
            clientName: 'Client 1',
            assignedAt: '2024-01-01T00:00:00Z',
            totalWorkouts: 2,
            completedWorkouts: 2,
            completionRate: 100,
            lastWorkout: Date.now() - 24 * 60 * 60 * 1000,
            isActive: false,
            expectedDuration: 4,
            difficulty: 'intermediate'
          }
        ]
      }

      // Mock the getProgramCompletionAnalytics function
      jest.doMock('../coachProgramMonitoringService', () => ({
        ...jest.requireActual('../coachProgramMonitoringService'),
        getProgramCompletionAnalytics: jest.fn().mockResolvedValue(mockCompletionAnalytics)
      }))

      const result = await generateProgramEffectivenessReport(mockCoachId, { timeframe: '90d' })

      expect(result).toHaveProperty('summary')
      expect(result).toHaveProperty('programAnalysis')
      expect(result).toHaveProperty('clientAnalysis')
      expect(result).toHaveProperty('insights')
      expect(result.summary).toHaveProperty('averageCompletionRate')
      expect(result.summary).toHaveProperty('clientRetentionRate')
      expect(result.programAnalysis).toHaveLength(1)
      expect(result.programAnalysis[0]).toHaveProperty('effectivenessScore')
      expect(result.programAnalysis[0]).toHaveProperty('recommendations')
    })
  })
})