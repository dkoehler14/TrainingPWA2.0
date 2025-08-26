/**
 * Unit tests for updateCompleteProgram rollback functionality
 * Tests the transaction-like error handling and rollback capabilities
 */

import { updateCompleteProgram } from '../programService'
import { supabase } from '../../config/supabase'

// Mock the supabase client
jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}))

// Mock the cache and error handler
jest.mock('../../api/supabaseCache', () => ({
  invalidateProgramCache: jest.fn()
}))

jest.mock('../../utils/supabaseErrorHandler', () => ({
  executeSupabaseOperation: jest.fn((fn, operationName) => {
    // Execute the function directly for testing
    return fn()
  })
}))

describe('updateCompleteProgram - Rollback Functionality', () => {
  let mockFrom, mockSelect, mockEq, mockIn, mockDelete, mockUpdate, mockInsert, mockSingle

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Setup mock chain for Supabase operations
    mockSingle = jest.fn()
    mockSelect = jest.fn(() => ({ single: mockSingle }))
    mockEq = jest.fn(() => ({ select: mockSelect }))
    mockIn = jest.fn(() => ({}))
    mockDelete = jest.fn(() => ({ eq: mockEq, in: mockIn }))
    mockUpdate = jest.fn(() => ({ eq: mockEq }))
    mockInsert = jest.fn(() => ({ select: mockSelect }))
    mockFrom = jest.fn(() => ({
      update: mockUpdate,
      delete: mockDelete,
      insert: mockInsert,
      select: mockSelect
    }))

    supabase.from = mockFrom
  })

  describe('Backup Creation', () => {
    it('should create backup of current program state before operations', async () => {
      // Mock backup creation (program with workouts and exercises)
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'program-1',
          name: 'Original Program',
          duration: 2,
          user_id: 'user-1',
          program_workouts: [
            {
              id: 'workout-1',
              week_number: 1,
              day_number: 1,
              name: 'Day 1',
              program_exercises: [
                { id: 'ex-1', exercise_id: 'exercise-1', sets: 3, reps: '10' }
              ]
            }
          ]
        },
        error: null
      })

      // Mock program update failure to trigger rollback
      mockSingle.mockRejectedValueOnce(new Error('Program update failed'))

      const programData = { name: 'Updated Program', duration: 4 }
      const workoutsData = []

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Program update failed')

      // Verify backup was created by checking the first call was for backup
      expect(mockFrom).toHaveBeenCalledWith('programs')
      expect(mockSelect).toHaveBeenCalledWith(`
          *,
          program_workouts (
            *,
            program_exercises (*)
          )
        `)
    })

    it('should handle backup creation failure', async () => {
      // Mock backup creation failure
      mockSingle.mockRejectedValueOnce(new Error('Backup failed'))

      const programData = { name: 'Updated Program', duration: 4 }
      const workoutsData = []

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Failed to backup current program state: Backup failed')
    })
  })

  describe('Rollback on Program Update Failure', () => {
    it('should not perform rollback if program update fails (no changes made)', async () => {
      // Mock successful backup
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'program-1',
          name: 'Original Program',
          program_workouts: []
        },
        error: null
      })

      // Mock program update failure
      mockSingle.mockRejectedValueOnce(new Error('Program update failed'))

      const programData = { name: 'Updated Program', duration: 4 }
      const workoutsData = []

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Program update failed')

      // Verify no rollback operations were attempted (only backup and failed update)
      expect(mockFrom).toHaveBeenCalledTimes(2) // backup + failed update
    })
  })

  describe('Rollback on Workout Deletion Failure', () => {
    it('should restore program metadata when workout fetch fails', async () => {
      // Mock successful backup
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'program-1',
          name: 'Original Program',
          duration: 2,
          user_id: 'user-1',
          program_workouts: []
        },
        error: null
      })

      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock workout fetch failure
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Fetch failed', code: 'PGRST001' }
        })
      })

      // Mock successful rollback operations
      mockEq.mockResolvedValue({ error: null })

      const programData = { name: 'Updated Program', duration: 4 }
      const workoutsData = []

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Program update failed: Fetch failed')

      // Verify rollback was attempted (restore program metadata)
      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'Original Program',
        weight_unit: undefined,
        duration: 2,
        days_per_week: undefined,
        is_template: undefined,
        is_active: undefined,
        is_current: undefined,
        difficulty: undefined,
        goals: undefined,
        equipment: undefined,
        description: undefined,
        completed_weeks: undefined,
        start_date: undefined,
        updated_at: undefined
      })
    })
  })

  describe('Rollback on Workout Creation Failure', () => {
    it('should restore original workouts and exercises when workout creation fails', async () => {
      // Mock successful backup with original data
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'program-1',
          name: 'Original Program',
          duration: 2,
          user_id: 'user-1',
          program_workouts: [
            {
              id: 'original-workout-1',
              week_number: 1,
              day_number: 1,
              name: 'Original Day 1',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              program_exercises: [
                {
                  id: 'original-ex-1',
                  exercise_id: 'exercise-1',
                  sets: 3,
                  reps: '10',
                  rest_minutes: 60,
                  notes: 'Original note',
                  order_index: 0,
                  created_at: '2024-01-01T00:00:00Z',
                  updated_at: '2024-01-01T00:00:00Z'
                }
              ]
            }
          ]
        },
        error: null
      })

      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock successful workout fetch and deletion
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'old-workout-1' }],
          error: null
        })
      })
      mockIn.mockResolvedValue({ error: null })
      mockEq.mockResolvedValue({ error: null })

      // Mock workout creation failure
      mockSelect.mockRejectedValueOnce(new Error('Workout creation failed'))

      // Mock successful rollback operations
      mockSelect.mockResolvedValue({
        data: [{ id: 'restored-workout-1', week_number: 1, day_number: 1 }],
        error: null
      })
      mockInsert.mockResolvedValue({ error: null })
      mockUpdate.mockResolvedValue({ error: null })

      const programData = { name: 'Updated Program', duration: 4 }
      const workoutsData = [
        { week_number: 1, day_number: 1, name: 'New Day 1', exercises: [] }
      ]

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Program update failed: Workout creation failed')

      // Verify rollback restored original workouts
      expect(mockInsert).toHaveBeenCalledWith([{
        program_id: 'program-1',
        week_number: 1,
        day_number: 1,
        name: 'Original Day 1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }])

      // Verify rollback restored original exercises
      expect(mockInsert).toHaveBeenCalledWith([{
        workout_id: 'restored-workout-1',
        exercise_id: 'exercise-1',
        sets: 3,
        reps: '10',
        rest_minutes: 60,
        notes: 'Original note',
        order_index: 0,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      }])
    })
  })

  describe('Rollback on Exercise Creation Failure', () => {
    it('should restore complete original state when exercise creation fails', async () => {
      // Mock successful backup
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'program-1',
          name: 'Original Program',
          duration: 2,
          user_id: 'user-1',
          program_workouts: [
            {
              id: 'original-workout-1',
              week_number: 1,
              day_number: 1,
              name: 'Original Day 1',
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              program_exercises: []
            }
          ]
        },
        error: null
      })

      // Mock successful operations until exercise creation
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      })
      mockEq.mockResolvedValue({ error: null })

      mockSelect.mockResolvedValueOnce({
        data: [{ id: 'new-workout-1', week_number: 1, day_number: 1 }],
        error: null
      })

      // Mock exercise creation failure
      mockSelect.mockRejectedValueOnce(new Error('Exercise creation failed'))

      // Mock successful rollback operations
      mockSelect.mockResolvedValue({
        data: [{ id: 'restored-workout-1', week_number: 1, day_number: 1 }],
        error: null
      })
      mockInsert.mockResolvedValue({ error: null })
      mockUpdate.mockResolvedValue({ error: null })

      const programData = { name: 'Updated Program', duration: 4 }
      const workoutsData = [
        { 
          week_number: 1, 
          day_number: 1, 
          name: 'New Day 1', 
          exercises: [
            { exercise_id: 'exercise-1', sets: 3, reps: '10' }
          ]
        }
      ]

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Program update failed: Exercise creation failed')

      // Verify complete rollback was performed
      expect(mockUpdate).toHaveBeenCalledWith({
        name: 'Original Program',
        weight_unit: undefined,
        duration: 2,
        days_per_week: undefined,
        is_template: undefined,
        is_active: undefined,
        is_current: undefined,
        difficulty: undefined,
        goals: undefined,
        equipment: undefined,
        description: undefined,
        completed_weeks: undefined,
        start_date: undefined,
        updated_at: undefined
      })
    })
  })

  describe('Rollback Failure Handling', () => {
    it('should throw combined error when rollback fails', async () => {
      // Mock successful backup
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'program-1',
          name: 'Original Program',
          program_workouts: []
        },
        error: null
      })

      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock workout fetch failure (triggers rollback)
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Original error', code: 'PGRST001' }
        })
      })

      // Mock rollback failure
      mockUpdate.mockRejectedValue(new Error('Rollback failed'))

      const programData = { name: 'Updated Program', duration: 4 }
      const workoutsData = []

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Update failed: Original error. Rollback also failed: Rollback failed. Program may be in an inconsistent state.')
    })
  })

  describe('Successful Operation Cleanup', () => {
    it('should clear backup data on successful completion', async () => {
      // Mock successful backup
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'program-1',
          name: 'Original Program',
          program_workouts: []
        },
        error: null
      })

      // Mock all successful operations
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      })
      mockEq.mockResolvedValue({ error: null })
      mockSelect.mockResolvedValue({ data: [], error: null })

      const programData = { name: 'Updated Program', duration: 4 }
      const workoutsData = []

      const result = await updateCompleteProgram('program-1', programData, workoutsData)

      // Verify successful result
      expect(result).toHaveProperty('program')
      expect(result).toHaveProperty('workouts')
      expect(result).toHaveProperty('exercises')

      // Backup should be cleared (no rollback operations performed)
      const rollbackCalls = mockFrom.mock.calls.filter(call => 
        call[0] === 'programs' && mockUpdate.mock.calls.length > 1
      )
      expect(rollbackCalls).toHaveLength(0)
    })
  })
})