/**
 * Test Suite for Workout Log Service
 * 
 * Tests CRUD operations, draft management, and analytics calculation
 * for the Supabase-based workout logging system.
 */

import workoutLogService from '../workoutLogService'
import { supabase } from '../../config/supabase'

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(),
  auth: {
    getUser: jest.fn()
  }
}

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabaseClient,
  withSupabaseErrorHandling: jest.fn((fn) => fn())
}))

describe('WorkoutLogService', () => {
  const mockUserId = 'test-user-123'
  const mockProgramId = 'test-program-456'
  const mockExercises = [
    {
      exerciseId: 'exercise-1',
      sets: 3,
      reps: [10, 10, 8],
      weights: [135, 135, 140],
      completed: [true, true, true],
      notes: 'Good form',
      bodyweight: null
    },
    {
      exerciseId: 'exercise-2',
      sets: 3,
      reps: [12, 12, 10],
      weights: [0, 0, 0],
      completed: [true, true, false],
      notes: '',
      bodyweight: 180
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createWorkoutLog', () => {
    it('should create a new workout log with exercises', async () => {
      const mockWorkoutData = {
        programId: mockProgramId,
        weekIndex: 0,
        dayIndex: 1,
        name: 'Test Workout',
        type: 'program_workout',
        exercises: mockExercises
      }

      const mockCreatedLog = {
        id: 'workout-log-123',
        user_id: mockUserId,
        program_id: mockProgramId,
        week_index: 0,
        day_index: 1,
        name: 'Test Workout',
        type: 'program_workout',
        is_finished: false,
        is_draft: false
      }

      const mockChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockCreatedLog, error: null })
      }

      mockSupabaseClient.from.mockReturnValue(mockChain)

      // Mock createWorkoutLogExercises
      const createExercisesSpy = jest.spyOn(workoutLogService, 'createWorkoutLogExercises')
      createExercisesSpy.mockResolvedValue([])

      const result = await workoutLogService.createWorkoutLog(mockUserId, mockWorkoutData)

      expect(result).toEqual(mockCreatedLog)
      expect(createExercisesSpy).toHaveBeenCalledWith(mockCreatedLog.id, mockExercises)
    })

    it('should handle workout log creation without exercises', async () => {
      const mockWorkoutData = {
        programId: mockProgramId,
        weekIndex: 0,
        dayIndex: 1,
        name: 'Test Workout'
      }

      const mockCreatedLog = {
        id: 'workout-log-123',
        user_id: mockUserId,
        program_id: mockProgramId
      }

      supabase.from.mockReturnValue({
        insert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockCreatedLog, error: null })
          })
        })
      })

      const result = await workoutLogService.createWorkoutLog(mockUserId, mockWorkoutData)

      expect(result).toEqual(mockCreatedLog)
    })
  })

  describe('getWorkoutLog', () => {
    it('should retrieve workout log with exercises', async () => {
      const mockWorkoutLog = {
        id: 'workout-log-123',
        user_id: mockUserId,
        program_id: mockProgramId,
        week_index: 0,
        day_index: 1,
        workout_log_exercises: [
          {
            id: 'exercise-log-1',
            exercise_id: 'exercise-1',
            sets: 3,
            reps: [10, 10, 8],
            weights: [135, 135, 140],
            completed: [true, true, true],
            order_index: 0,
            exercises: {
              id: 'exercise-1',
              name: 'Bench Press',
              primary_muscle_group: 'Chest',
              exercise_type: 'Barbell'
            }
          }
        ]
      }

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockWorkoutLog, error: null })
      }

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery)
      })

      const result = await workoutLogService.getWorkoutLog(mockUserId, mockProgramId, 0, 1)

      expect(result).toEqual(mockWorkoutLog)
      expect(result.workout_log_exercises).toHaveLength(1)
    })

    it('should return null when workout log not found', async () => {
      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ 
          data: null, 
          error: { code: 'PGRST116' } // Not found error
        })
      }

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery)
      })

      const result = await workoutLogService.getWorkoutLog(mockUserId, mockProgramId, 0, 1)

      expect(result).toBeNull()
    })
  })

  describe('saveDraft', () => {
    it('should create new draft when none exists', async () => {
      const mockDraftData = {
        id: 'draft-123',
        user_id: mockUserId,
        name: 'Quick Workout Draft',
        type: 'quick_workout',
        is_draft: true,
        is_finished: false
      }

      // Mock getSingleDraft to return null (no existing draft)
      const getSingleDraftSpy = jest.spyOn(workoutLogService, 'getSingleDraft')
      getSingleDraftSpy.mockResolvedValue(null)

      // Mock cleanupAllDrafts
      const cleanupSpy = jest.spyOn(workoutLogService, 'cleanupAllDrafts')
      cleanupSpy.mockResolvedValue()

      // Mock createWorkoutLog
      const createLogSpy = jest.spyOn(workoutLogService, 'createWorkoutLog')
      createLogSpy.mockResolvedValue(mockDraftData)

      const result = await workoutLogService.saveDraft(
        mockUserId,
        mockExercises,
        'Quick Workout Draft'
      )

      expect(getSingleDraftSpy).toHaveBeenCalledWith(mockUserId)
      expect(cleanupSpy).toHaveBeenCalledWith(mockUserId)
      expect(createLogSpy).toHaveBeenCalled()
      expect(result).toEqual(mockDraftData)
    })

    it('should update existing draft', async () => {
      const existingDraftId = 'existing-draft-123'
      const mockUpdatedDraft = {
        id: existingDraftId,
        user_id: mockUserId,
        name: 'Updated Draft',
        is_draft: true
      }

      const mockQuery = {
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockUpdatedDraft, error: null })
          })
        })
      }

      supabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockQuery)
      })

      // Mock updateWorkoutLogExercises
      const updateExercisesSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogExercises')
      updateExercisesSpy.mockResolvedValue()

      const result = await workoutLogService.saveDraft(
        mockUserId,
        mockExercises,
        'Updated Draft',
        existingDraftId
      )

      expect(updateExercisesSpy).toHaveBeenCalledWith(existingDraftId, mockExercises)
      expect(result).toEqual(mockUpdatedDraft)
    })
  })

  describe('completeDraft', () => {
    it('should complete draft and update analytics', async () => {
      const draftId = 'draft-123'
      const mockCompletedDraft = {
        id: draftId,
        user_id: mockUserId,
        name: 'Completed Workout',
        is_draft: false,
        is_finished: true,
        completed_date: new Date().toISOString()
      }

      const mockQuery = {
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: mockCompletedDraft, error: null })
          })
        })
      }

      supabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue(mockQuery)
      })

      // Mock updateWorkoutLogExercises and updateUserAnalytics
      const updateExercisesSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogExercises')
      updateExercisesSpy.mockResolvedValue()

      const updateAnalyticsSpy = jest.spyOn(workoutLogService, 'updateUserAnalytics')
      updateAnalyticsSpy.mockResolvedValue()

      const result = await workoutLogService.completeDraft(
        mockUserId,
        draftId,
        mockExercises,
        'Completed Workout'
      )

      expect(updateExercisesSpy).toHaveBeenCalledWith(draftId, mockExercises)
      expect(updateAnalyticsSpy).toHaveBeenCalledWith(mockUserId, mockExercises)
      expect(result).toEqual(mockCompletedDraft)
    })
  })

  describe('getExerciseHistory', () => {
    it('should retrieve and transform exercise history', async () => {
      const exerciseId = 'exercise-1'
      const mockHistoryData = [
        {
          id: 'log-exercise-1',
          exercise_id: exerciseId,
          sets: 3,
          reps: [10, 10, 8],
          weights: [135, 135, 140],
          completed: [true, true, true],
          bodyweight: null,
          workout_logs: {
            id: 'workout-1',
            user_id: mockUserId,
            completed_date: '2024-01-15T10:00:00Z',
            week_index: 0,
            day_index: 1,
            is_finished: true
          },
          exercises: {
            id: exerciseId,
            name: 'Bench Press',
            primary_muscle_group: 'Chest',
            exercise_type: 'Barbell'
          }
        }
      ]

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: mockHistoryData, error: null })
      }

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery)
      })

      const result = await workoutLogService.getExerciseHistory(mockUserId, exerciseId)

      expect(result).toHaveLength(3) // 3 completed sets
      expect(result[0]).toMatchObject({
        weight: 135,
        reps: 10,
        totalWeight: 135,
        displayWeight: 135,
        completed: true,
        set: 1,
        week: 1,
        day: 2
      })
    })
  })

  describe('updateUserAnalytics', () => {
    it('should calculate and update user analytics', async () => {
      const mockExercisesWithCompletion = [
        {
          exerciseId: 'exercise-1',
          exerciseType: 'Barbell',
          completed: [true, true, false],
          weights: [135, 140, 145],
          reps: [10, 8, 6],
          bodyweight: null
        }
      ]

      supabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: null })
      })

      await workoutLogService.updateUserAnalytics(mockUserId, mockExercisesWithCompletion)

      expect(supabase.from).toHaveBeenCalledWith('user_analytics')
      expect(supabase.from().upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            user_id: mockUserId,
            exercise_id: 'exercise-1',
            total_volume: 135 * 10 + 140 * 8, // Only completed sets
            max_weight: 140,
            total_reps: 18,
            total_sets: 2
          })
        ]),
        expect.any(Object)
      )
    })

    it('should handle bodyweight exercises correctly', async () => {
      const mockBodyweightExercises = [
        {
          exerciseId: 'exercise-2',
          exerciseType: 'Bodyweight',
          completed: [true, true],
          weights: [0, 0],
          reps: [12, 10],
          bodyweight: 180
        }
      ]

      supabase.from.mockReturnValue({
        upsert: jest.fn().mockResolvedValue({ error: null })
      })

      await workoutLogService.updateUserAnalytics(mockUserId, mockBodyweightExercises)

      expect(supabase.from().upsert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            total_volume: 180 * 12 + 180 * 10, // Bodyweight * reps
            max_weight: 180,
            total_reps: 22,
            total_sets: 2
          })
        ]),
        expect.any(Object)
      )
    })
  })

  describe('getWorkoutStats', () => {
    it('should calculate workout statistics for timeframe', async () => {
      const mockWorkoutData = [
        {
          id: 'workout-1',
          completed_date: '2024-01-15T10:00:00Z',
          duration: 60,
          workout_log_exercises: [
            {
              sets: 3,
              reps: [10, 10, 8],
              weights: [135, 135, 140],
              completed: [true, true, true],
              bodyweight: null,
              exercises: {
                primary_muscle_group: 'Chest',
                exercise_type: 'Barbell'
              }
            }
          ]
        }
      ]

      const mockQuery = {
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockWorkoutData, error: null })
      }

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue(mockQuery)
      })

      const result = await workoutLogService.getWorkoutStats(mockUserId, '30d')

      expect(result).toMatchObject({
        timeframe: '30d',
        totalWorkouts: 1,
        totalVolume: 135 * 10 + 135 * 10 + 140 * 8, // Sum of weight * reps for completed sets
        totalSets: 3,
        totalReps: 28,
        muscleGroupBreakdown: {
          'Chest': {
            volume: 135 * 10 + 135 * 10 + 140 * 8,
            sets: 3
          }
        }
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database connection failed')
      
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({ data: null, error: mockError })
          })
        })
      })

      await expect(
        workoutLogService.getWorkoutLog(mockUserId, mockProgramId, 0, 1)
      ).rejects.toThrow('Database connection failed')
    })

    it('should validate required parameters', async () => {
      await expect(
        workoutLogService.saveDraft(null, mockExercises, 'Test')
      ).rejects.toThrow('Invalid parameters for saving draft')

      await expect(
        workoutLogService.saveDraft(mockUserId, [], 'Test')
      ).rejects.toThrow('Invalid parameters for saving draft')
    })
  })
})