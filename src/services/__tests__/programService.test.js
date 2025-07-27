import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { createMockSupabaseClient } from '../../utils/testHelpers'
import {
  getUserPrograms,
  getProgramById,
  getCurrentProgram,
  createProgram,
  updateProgram,
  setCurrentProgram,
  deleteProgram,
  copyProgram
} from '../programService'

// Mock Supabase
const mockSupabase = createMockSupabaseClient()
jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase
}))

describe('Program Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getUserPrograms', () => {
    it('should fetch user programs with default ordering', async () => {
      const userId = 'user123'
      const mockPrograms = [
        { id: '1', name: 'Program 1', user_id: userId },
        { id: '2', name: 'Program 2', user_id: userId }
      ]

      mockSupabase.from().order.mockResolvedValue({ data: mockPrograms, error: null })

      const result = await getUserPrograms(userId)

      expect(mockSupabase.from).toHaveBeenCalledWith('programs')
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('user_id', userId)
      expect(mockSupabase.from().order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(result).toEqual(mockPrograms)
    })

    it('should apply isActive filter', async () => {
      const userId = 'user123'
      const filters = { isActive: true }
      mockSupabase.from().order.mockResolvedValue({ data: [], error: null })

      await getUserPrograms(userId, filters)

      expect(mockSupabase.from().eq).toHaveBeenCalledWith('is_active', true)
    })

    it('should apply isCurrent filter', async () => {
      const userId = 'user123'
      const filters = { isCurrent: true }
      mockSupabase.from().order.mockResolvedValue({ data: [], error: null })

      await getUserPrograms(userId, filters)

      expect(mockSupabase.from().eq).toHaveBeenCalledWith('is_current', true)
    })
  })

  describe('getProgramById', () => {
    it('should fetch program with full workout structure', async () => {
      const programId = 'prog123'
      const mockProgram = {
        id: programId,
        name: 'Test Program',
        program_workouts: [
          {
            id: 'workout1',
            week_number: 1,
            day_number: 1,
            program_exercises: [
              { id: 'ex1', order_index: 0, exercises: { name: 'Exercise 1' } },
              { id: 'ex2', order_index: 1, exercises: { name: 'Exercise 2' } }
            ]
          }
        ]
      }

      mockSupabase.from().single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await getProgramById(programId)

      expect(mockSupabase.from().select).toHaveBeenCalledWith(expect.stringContaining('program_workouts'))
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('id', programId)
      expect(result).toEqual(mockProgram)
    })
  })

  describe('getCurrentProgram', () => {
    it('should fetch current active program for user', async () => {
      const userId = 'user123'
      const mockProgram = {
        id: 'prog123',
        name: 'Current Program',
        is_current: true,
        is_active: true
      }

      mockSupabase.from().single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await getCurrentProgram(userId)

      expect(mockSupabase.from().eq).toHaveBeenCalledWith('user_id', userId)
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('is_current', true)
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('is_active', true)
      expect(result).toEqual(mockProgram)
    })

    it('should return null when no current program found', async () => {
      const userId = 'user123'
      mockSupabase.from().single.mockResolvedValue({ 
        data: null, 
        error: { code: 'PGRST116' } 
      })

      const result = await getCurrentProgram(userId)

      expect(result).toBeNull()
    })
  })

  describe('createProgram', () => {
    it('should create new program', async () => {
      const programData = {
        name: 'New Program',
        user_id: 'user123',
        duration: 12,
        days_per_week: 4
      }
      const mockCreatedProgram = { id: 'prog123', ...programData }

      mockSupabase.from().single.mockResolvedValue({ data: mockCreatedProgram, error: null })

      const result = await createProgram(programData)

      expect(mockSupabase.from().insert).toHaveBeenCalledWith([programData])
      expect(mockSupabase.from().select).toHaveBeenCalled()
      expect(result).toEqual(mockCreatedProgram)
    })
  })

  describe('updateProgram', () => {
    it('should update program with timestamp', async () => {
      const programId = 'prog123'
      const updates = { name: 'Updated Program' }
      const mockUpdatedProgram = { id: programId, ...updates }

      mockSupabase.from().single.mockResolvedValue({ data: mockUpdatedProgram, error: null })

      const result = await updateProgram(programId, updates)

      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          updated_at: expect.any(String)
        })
      )
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('id', programId)
      expect(result).toEqual(mockUpdatedProgram)
    })
  })

  describe('setCurrentProgram', () => {
    it('should set program as current', async () => {
      const programId = 'prog123'
      const userId = 'user123'
      const mockProgram = { id: programId, is_current: true }

      mockSupabase.from().single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await setCurrentProgram(programId, userId)

      expect(mockSupabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_current: true,
          updated_at: expect.any(String)
        })
      )
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('id', programId)
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('user_id', userId)
      expect(result).toEqual(mockProgram)
    })
  })

  describe('deleteProgram', () => {
    it('should delete program', async () => {
      const programId = 'prog123'
      const userId = 'user123'
      mockSupabase.from().delete.mockResolvedValue({ error: null })

      const result = await deleteProgram(programId, userId)

      expect(mockSupabase.from().delete).toHaveBeenCalled()
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('id', programId)
      expect(mockSupabase.from().eq).toHaveBeenCalledWith('user_id', userId)
      expect(result).toBe(true)
    })
  })
})