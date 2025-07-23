/**
 * Test Suite for Supabase Quick Workout Draft Service
 * 
 * Tests draft management functionality with API compatibility
 * for the Firebase-to-Supabase migration.
 */

import supabaseQuickWorkoutDraftService from '../supabaseWorkoutDraftService'
import workoutLogService from '../workoutLogService'

// Mock the workout log service
jest.mock('../workoutLogService', () => ({
  saveDraft: jest.fn(),
  getSingleDraft: jest.fn(),
  loadDrafts: jest.fn(),
  deleteDraft: jest.fn(),
  completeDraft: jest.fn(),
  cleanupAllDrafts: jest.fn(),
  cleanupOldDrafts: jest.fn()
}))

describe('SupabaseQuickWorkoutDraftService', () => {
  const mockUserId = 'test-user-123'
  const mockExercises = [
    {
      exerciseId: 'exercise-1',
      sets: 3,
      reps: [10, 10, 8],
      weights: [135, 135, 140],
      completed: [true, true, true],
      notes: 'Good form',
      bodyweight: null
    }
  ]

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('saveDraft', () => {
    it('should save draft and transform response to Firebase format', async () => {
      const mockSupabaseResponse = {
        id: 'draft-123',
        user_id: mockUserId,
        name: 'Test Draft',
        type: 'quick_workout',
        is_draft: true,
        is_finished: false,
        updated_at: '2024-01-15T10:00:00Z',
        date: '2024-01-15'
      }

      workoutLogService.saveDraft.mockResolvedValue(mockSupabaseResponse)

      const result = await supabaseQuickWorkoutDraftService.saveDraft(
        mockUserId,
        mockExercises,
        'Test Draft'
      )

      expect(workoutLogService.saveDraft).toHaveBeenCalledWith(
        mockUserId,
        expect.arrayContaining([
          expect.objectContaining({
            exerciseId: 'exercise-1',
            sets: 3,
            reps: [10, 10, 8],
            weights: [135, 135, 140],
            completed: [true, true, true],
            notes: 'Good form',
            bodyweight: null
          })
        ]),
        'Test Draft',
        undefined
      )

      // Verify Firebase-compatible format
      expect(result).toMatchObject({
        id: 'draft-123',
        userId: mockUserId,
        name: 'Test Draft',
        type: 'quick_workout',
        isDraft: true,
        isWorkoutFinished: false,
        lastModified: expect.any(Date),
        date: expect.any(Date)
      })
    })

    it('should handle invalid parameters', async () => {
      await expect(
        supabaseQuickWorkoutDraftService.saveDraft(null, mockExercises, 'Test')
      ).rejects.toThrow('Invalid parameters for saving draft')

      await expect(
        supabaseQuickWorkoutDraftService.saveDraft(mockUserId, [], 'Test')
      ).rejects.toThrow('Invalid parameters for saving draft')
    })
  })

  describe('getSingleDraft', () => {
    it('should retrieve and transform single draft', async () => {
      const mockSupabaseDraft = {
        id: 'draft-123',
        user_id: mockUserId,
        name: 'Test Draft',
        type: 'quick_workout',
        is_draft: true,
        is_finished: false,
        updated_at: '2024-01-15T10:00:00Z',
        date: '2024-01-15',
        workout_log_exercises: [
          {
            exercise_id: 'exercise-1',
            sets: 3,
            reps: [10, 10, 8],
            weights: [135, 135, 140],
            completed: [true, true, true],
            notes: 'Good form',
            bodyweight: null
          }
        ]
      }

      workoutLogService.getSingleDraft.mockResolvedValue(mockSupabaseDraft)

      const result = await supabaseQuickWorkoutDraftService.getSingleDraft(mockUserId)

      expect(workoutLogService.getSingleDraft).toHaveBeenCalledWith(mockUserId)
      
      // Verify Firebase-compatible format
      expect(result).toMatchObject({
        id: 'draft-123',
        userId: mockUserId,
        name: 'Test Draft',
        type: 'quick_workout',
        isDraft: true,
        isWorkoutFinished: false,
        exercises: [
          {
            exerciseId: 'exercise-1',
            sets: 3,
            reps: [10, 10, 8],
            weights: [135, 135, 140],
            completed: [true, true, true],
            notes: 'Good form',
            bodyweight: null
          }
        ]
      })
    })

    it('should return null when no draft exists', async () => {
      workoutLogService.getSingleDraft.mockResolvedValue(null)

      const result = await supabaseQuickWorkoutDraftService.getSingleDraft(mockUserId)

      expect(result).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      workoutLogService.getSingleDraft.mockRejectedValue(new Error('Database error'))

      await expect(
        supabaseQuickWorkoutDraftService.getSingleDraft(mockUserId)
      ).rejects.toThrow('Failed to load workout draft')
    })
  })

  describe('loadDrafts', () => {
    it('should load and transform multiple drafts', async () => {
      const mockSupabaseDrafts = [
        {
          id: 'draft-1',
          user_id: mockUserId,
          name: 'Draft 1',
          type: 'quick_workout',
          is_draft: true,
          is_finished: false,
          updated_at: '2024-01-15T10:00:00Z',
          date: '2024-01-15',
          workout_log_exercises: []
        },
        {
          id: 'draft-2',
          user_id: mockUserId,
          name: 'Draft 2',
          type: 'quick_workout',
          is_draft: true,
          is_finished: false,
          updated_at: '2024-01-14T10:00:00Z',
          date: '2024-01-14',
          workout_log_exercises: []
        }
      ]

      workoutLogService.loadDrafts.mockResolvedValue(mockSupabaseDrafts)

      const result = await supabaseQuickWorkoutDraftService.loadDrafts(mockUserId, 5)

      expect(workoutLogService.loadDrafts).toHaveBeenCalledWith(mockUserId, 5)
      expect(result).toHaveLength(2)
      
      // Verify Firebase-compatible format
      expect(result[0]).toMatchObject({
        id: 'draft-1',
        userId: mockUserId,
        name: 'Draft 1',
        isDraft: true,
        isWorkoutFinished: false,
        exercises: []
      })
    })
  })

  describe('completeDraft', () => {
    it('should complete draft and transform response', async () => {
      const draftId = 'draft-123'
      const mockCompletedDraft = {
        id: draftId,
        user_id: mockUserId,
        name: 'Completed Workout',
        type: 'quick_workout',
        is_draft: false,
        is_finished: true,
        completed_date: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        date: '2024-01-15'
      }

      workoutLogService.completeDraft.mockResolvedValue(mockCompletedDraft)

      const result = await supabaseQuickWorkoutDraftService.completeDraft(
        mockUserId,
        draftId,
        mockExercises,
        'Completed Workout'
      )

      expect(workoutLogService.completeDraft).toHaveBeenCalledWith(
        mockUserId,
        draftId,
        expect.arrayContaining([
          expect.objectContaining({
            exerciseId: 'exercise-1',
            sets: 3,
            reps: [10, 10, 8],
            weights: [135, 135, 140],
            completed: [true, true, true]
          })
        ]),
        'Completed Workout'
      )

      // Verify Firebase-compatible format
      expect(result).toMatchObject({
        id: draftId,
        userId: mockUserId,
        name: 'Completed Workout',
        isDraft: false,
        isWorkoutFinished: true,
        completedDate: expect.any(Date)
      })
    })

    it('should handle completion errors', async () => {
      workoutLogService.completeDraft.mockRejectedValue(new Error('Completion failed'))

      await expect(
        supabaseQuickWorkoutDraftService.completeDraft(
          mockUserId,
          'draft-123',
          mockExercises,
          'Test'
        )
      ).rejects.toThrow('Failed to complete workout draft')
    })
  })

  describe('cleanupAllDrafts', () => {
    it('should cleanup drafts and return count', async () => {
      const mockDrafts = [
        { id: 'draft-1' },
        { id: 'draft-2' },
        { id: 'draft-3' }
      ]

      workoutLogService.loadDrafts.mockResolvedValue(mockDrafts)
      workoutLogService.cleanupAllDrafts.mockResolvedValue()

      const result = await supabaseQuickWorkoutDraftService.cleanupAllDrafts(mockUserId)

      expect(workoutLogService.loadDrafts).toHaveBeenCalledWith(mockUserId, 50)
      expect(workoutLogService.cleanupAllDrafts).toHaveBeenCalledWith(mockUserId)
      expect(result).toBe(3)
    })

    it('should handle cleanup errors gracefully', async () => {
      workoutLogService.loadDrafts.mockRejectedValue(new Error('Load failed'))

      const result = await supabaseQuickWorkoutDraftService.cleanupAllDrafts(mockUserId)

      expect(result).toBe(0)
    })
  })

  describe('getDraftStats', () => {
    it('should calculate draft statistics', async () => {
      const mockDrafts = [
        {
          id: 'draft-1',
          lastModified: new Date('2024-01-15T10:00:00Z')
        },
        {
          id: 'draft-2',
          lastModified: new Date('2024-01-10T10:00:00Z')
        },
        {
          id: 'draft-3',
          lastModified: new Date('2024-01-20T10:00:00Z')
        }
      ]

      // Mock loadDrafts method
      const loadDraftsSpy = jest.spyOn(supabaseQuickWorkoutDraftService, 'loadDrafts')
      loadDraftsSpy.mockResolvedValue(mockDrafts)

      const result = await supabaseQuickWorkoutDraftService.getDraftStats(mockUserId)

      expect(result).toMatchObject({
        count: 3,
        oldestDate: new Date('2024-01-10T10:00:00Z'),
        newestDate: new Date('2024-01-20T10:00:00Z')
      })
    })

    it('should handle empty drafts', async () => {
      const loadDraftsSpy = jest.spyOn(supabaseQuickWorkoutDraftService, 'loadDrafts')
      loadDraftsSpy.mockResolvedValue([])

      const result = await supabaseQuickWorkoutDraftService.getDraftStats(mockUserId)

      expect(result).toMatchObject({
        count: 0,
        oldestDate: null,
        newestDate: null
      })
    })
  })

  describe('checkForConflicts', () => {
    it('should detect conflicts between drafts', async () => {
      const mockDrafts = [
        {
          id: 'draft-1',
          exercises: [
            { exerciseId: 'exercise-1' },
            { exerciseId: 'exercise-2' }
          ]
        },
        {
          id: 'draft-2',
          exercises: [
            { exerciseId: 'exercise-1' },
            { exerciseId: 'exercise-3' }
          ]
        }
      ]

      const loadDraftsSpy = jest.spyOn(supabaseQuickWorkoutDraftService, 'loadDrafts')
      loadDraftsSpy.mockResolvedValue(mockDrafts)

      const result = await supabaseQuickWorkoutDraftService.checkForConflicts(mockUserId)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        draft1: mockDrafts[0],
        draft2: mockDrafts[1],
        similarity: expect.any(Number)
      })
      expect(result[0].similarity).toBeGreaterThan(0)
    })

    it('should return empty array when no conflicts', async () => {
      const mockDrafts = [
        {
          id: 'draft-1',
          exercises: [{ exerciseId: 'exercise-1' }]
        },
        {
          id: 'draft-2',
          exercises: [{ exerciseId: 'exercise-2' }]
        }
      ]

      const loadDraftsSpy = jest.spyOn(supabaseQuickWorkoutDraftService, 'loadDrafts')
      loadDraftsSpy.mockResolvedValue(mockDrafts)

      const result = await supabaseQuickWorkoutDraftService.checkForConflicts(mockUserId)

      expect(result).toHaveLength(0)
    })
  })

  describe('Parameter Validation', () => {
    it('should validate user ID in getSingleDraft', async () => {
      await expect(
        supabaseQuickWorkoutDraftService.getSingleDraft(null)
      ).rejects.toThrow('User ID is required to load draft')
    })

    it('should validate parameters in deleteDraft', async () => {
      await expect(
        supabaseQuickWorkoutDraftService.deleteDraft(null, 'draft-123')
      ).rejects.toThrow('User ID and draft ID are required')

      await expect(
        supabaseQuickWorkoutDraftService.deleteDraft(mockUserId, null)
      ).rejects.toThrow('User ID and draft ID are required')
    })

    it('should validate parameters in completeDraft', async () => {
      await expect(
        supabaseQuickWorkoutDraftService.completeDraft(null, 'draft-123', mockExercises, 'Test')
      ).rejects.toThrow('Invalid parameters for completing draft')

      await expect(
        supabaseQuickWorkoutDraftService.completeDraft(mockUserId, null, mockExercises, 'Test')
      ).rejects.toThrow('Invalid parameters for completing draft')

      await expect(
        supabaseQuickWorkoutDraftService.completeDraft(mockUserId, 'draft-123', null, 'Test')
      ).rejects.toThrow('Invalid parameters for completing draft')
    })
  })
})