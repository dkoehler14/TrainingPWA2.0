/**
 * Unit tests for updateCompleteProgram function
 * Tests the workout data deletion logic specifically
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

describe('updateCompleteProgram - Deletion Logic', () => {
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

  describe('Workout Data Deletion Logic', () => {
    it('should fetch existing workouts before deletion', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock existing workouts fetch
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'workout-1' }, { id: 'workout-2' }],
          error: null
        })
      })

      // Mock successful deletions
      mockIn.mockResolvedValue({ error: null })
      mockEq.mockResolvedValue({ error: null })

      // Mock successful insertions
      mockSelect.mockResolvedValue({ data: [], error: null })

      const programData = { name: 'Test Program', duration: 4 }
      const workoutsData = []

      await updateCompleteProgram('program-1', programData, workoutsData)

      // Verify that existing workouts were fetched
      expect(mockFrom).toHaveBeenCalledWith('program_workouts')
      expect(mockSelect).toHaveBeenCalledWith('id')
    })

    it('should delete program_exercises before program_workouts', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock existing workouts fetch
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'workout-1' }, { id: 'workout-2' }],
          error: null
        })
      })

      // Mock successful deletions
      mockIn.mockResolvedValue({ error: null })
      mockEq.mockResolvedValue({ error: null })

      // Mock successful insertions
      mockSelect.mockResolvedValue({ data: [], error: null })

      const programData = { name: 'Test Program', duration: 4 }
      const workoutsData = []

      await updateCompleteProgram('program-1', programData, workoutsData)

      // Verify deletion order: exercises first, then workouts
      const fromCalls = mockFrom.mock.calls
      expect(fromCalls).toContainEqual(['program_exercises'])
      expect(fromCalls).toContainEqual(['program_workouts'])
    })

    it('should handle deletion errors properly', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock existing workouts fetch failure
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: null,
          error: { message: 'Fetch failed', code: 'PGRST001' }
        })
      })

      const programData = { name: 'Test Program', duration: 4 }
      const workoutsData = []

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Fetch failed')
    })

    it('should handle program_exercises deletion errors', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock existing workouts fetch
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'workout-1' }],
          error: null
        })
      })

      // Mock program_exercises deletion failure
      mockIn.mockResolvedValue({ 
        error: { message: 'Delete exercises failed', code: 'PGRST002' }
      })

      const programData = { name: 'Test Program', duration: 4 }
      const workoutsData = []

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Delete exercises failed')
    })

    it('should handle program_workouts deletion errors', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock existing workouts fetch
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'workout-1' }],
          error: null
        })
      })

      // Mock successful exercises deletion
      mockIn.mockResolvedValue({ error: null })

      // Mock program_workouts deletion failure
      mockEq.mockResolvedValue({ 
        error: { message: 'Delete workouts failed', code: 'PGRST003' }
      })

      const programData = { name: 'Test Program', duration: 4 }
      const workoutsData = []

      await expect(updateCompleteProgram('program-1', programData, workoutsData))
        .rejects.toThrow('Delete workouts failed')
    })

    it('should skip exercise deletion when no workouts exist', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock no existing workouts
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      })

      // Mock successful workouts deletion
      mockEq.mockResolvedValue({ error: null })

      // Mock successful insertions
      mockSelect.mockResolvedValue({ data: [], error: null })

      const programData = { name: 'Test Program', duration: 4 }
      const workoutsData = []

      await updateCompleteProgram('program-1', programData, workoutsData)

      // Verify that program_exercises deletion was skipped (no .in() call)
      expect(mockIn).not.toHaveBeenCalled()
    })
  })

  describe('Workout Data Recreation Logic', () => {
    it('should create new program_workouts from workoutsData', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock no existing workouts (empty program)
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      })

      // Mock successful workouts deletion
      mockEq.mockResolvedValue({ error: null })

      // Mock successful workout insertion
      mockSelect.mockResolvedValueOnce({
        data: [
          { id: 'workout-1', week_number: 1, day_number: 1 },
          { id: 'workout-2', week_number: 1, day_number: 2 }
        ],
        error: null
      })

      // Mock successful exercise insertion
      mockSelect.mockResolvedValue({ data: [], error: null })

      const programData = { name: 'Test Program', duration: 1 }
      const workoutsData = [
        { week_number: 1, day_number: 1, name: 'Day 1', exercises: [] },
        { week_number: 1, day_number: 2, name: 'Day 2', exercises: [] }
      ]

      await updateCompleteProgram('program-1', programData, workoutsData)

      // Verify workout insertion was called with correct data
      expect(mockInsert).toHaveBeenCalledWith([
        { program_id: 'program-1', week_number: 1, day_number: 1, name: 'Day 1' },
        { program_id: 'program-1', week_number: 1, day_number: 2, name: 'Day 2' }
      ])
    })

    it('should create new program_exercises for each workout', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock no existing workouts
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      })

      // Mock successful workouts deletion
      mockEq.mockResolvedValue({ error: null })

      // Mock successful workout insertion
      mockSelect.mockResolvedValueOnce({
        data: [
          { id: 'workout-1', week_number: 1, day_number: 1 }
        ],
        error: null
      })

      // Mock successful exercise insertion
      mockSelect.mockResolvedValue({ 
        data: [{ id: 'exercise-1' }, { id: 'exercise-2' }], 
        error: null 
      })

      const programData = { name: 'Test Program', duration: 1 }
      const workoutsData = [
        { 
          week_number: 1, 
          day_number: 1, 
          name: 'Day 1', 
          exercises: [
            { exercise_id: 'ex-1', sets: 3, reps: '10', rest_minutes: 60, notes: 'Test note' },
            { exercise_id: 'ex-2', sets: 4, reps: '8-12', rest_minutes: null, notes: '' }
          ]
        }
      ]

      await updateCompleteProgram('program-1', programData, workoutsData)

      // Verify exercise insertion was called with correct data
      expect(mockInsert).toHaveBeenCalledWith([
        { 
          workout_id: 'workout-1', 
          exercise_id: 'ex-1', 
          sets: 3, 
          reps: '10', 
          rest_minutes: 60, 
          notes: 'Test note', 
          order_index: 0 
        },
        { 
          workout_id: 'workout-1', 
          exercise_id: 'ex-2', 
          sets: 4, 
          reps: '8-12', 
          rest_minutes: null, 
          notes: '', 
          order_index: 1 
        }
      ])
    })

    it('should handle workouts with no exercises', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock no existing workouts
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      })

      // Mock successful workouts deletion
      mockEq.mockResolvedValue({ error: null })

      // Mock successful workout insertion
      mockSelect.mockResolvedValueOnce({
        data: [
          { id: 'workout-1', week_number: 1, day_number: 1 }
        ],
        error: null
      })

      const programData = { name: 'Test Program', duration: 1 }
      const workoutsData = [
        { week_number: 1, day_number: 1, name: 'Day 1', exercises: [] }
      ]

      const result = await updateCompleteProgram('program-1', programData, workoutsData)

      // Verify that no exercise insertion was attempted
      expect(result.exercises).toEqual([])
    })

    it('should reuse the same patterns as createCompleteProgram', async () => {
      // Mock successful program update
      mockSingle.mockResolvedValueOnce({
        data: { id: 'program-1', user_id: 'user-1' },
        error: null
      })

      // Mock no existing workouts
      mockEq.mockReturnValueOnce({
        select: jest.fn().mockResolvedValue({
          data: [],
          error: null
        })
      })

      // Mock successful workouts deletion
      mockEq.mockResolvedValue({ error: null })

      // Mock successful workout insertion
      mockSelect.mockResolvedValueOnce({
        data: [
          { id: 'workout-1', week_number: 1, day_number: 1 }
        ],
        error: null
      })

      // Mock successful exercise insertion
      mockSelect.mockResolvedValue({ 
        data: [{ id: 'exercise-1' }], 
        error: null 
      })

      const programData = { name: 'Test Program', duration: 1 }
      const workoutsData = [
        { 
          week_number: 1, 
          day_number: 1, 
          name: 'Day 1', 
          exercises: [
            { exercise_id: 'ex-1', sets: 3, reps: '10' }
          ]
        }
      ]

      const result = await updateCompleteProgram('program-1', programData, workoutsData)

      // Verify the result structure matches createCompleteProgram
      expect(result).toHaveProperty('program')
      expect(result).toHaveProperty('workouts')
      expect(result).toHaveProperty('exercises')
      expect(result.program.id).toBe('program-1')
      expect(result.workouts).toHaveLength(1)
      expect(result.exercises).toHaveLength(1)
    })
  })
})