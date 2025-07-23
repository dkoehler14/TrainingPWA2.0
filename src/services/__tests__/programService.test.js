import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { supabase } from '../../config/supabase'
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
jest.mock('../../config/supabase')

describe('Program Service', () => {
  let mockQuery

  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis()
    }
    supabase.from.mockReturnValue(mockQuery)
  })

  describe('getUserPrograms', () => {
    it('should fetch user programs with default ordering', async () => {
      const userId = 'user123'
      const mockPrograms = [
        { id: '1', name: 'Program 1', user_id: userId },
        { id: '2', name: 'Program 2', user_id: userId }
      ]

      mockQuery.order.mockResolvedValue({ data: mockPrograms, error: null })

      const result = await getUserPrograms(userId)

      expect(supabase.from).toHaveBeenCalledWith('programs')
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', userId)
      expect(mockQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(result).toEqual(mockPrograms)
    })

    it('should apply isActive filter', async () => {
      const userId = 'user123'
      const filters = { isActive: true }
      mockQuery.order.mockResolvedValue({ data: [], error: null })

      await getUserPrograms(userId, filters)

      expect(mockQuery.eq).toHaveBeenCalledWith('is_active', true)
    })

    it('should apply isCurrent filter', async () => {
      const userId = 'user123'
      const filters = { isCurrent: true }
      mockQuery.order.mockResolvedValue({ data: [], error: null })

      await getUserPrograms(userId, filters)

      expect(mockQuery.eq).toHaveBeenCalledWith('is_current', true)
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

      mockQuery.single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await getProgramById(programId)

      expect(mockQuery.select).toHaveBeenCalledWith(expect.stringContaining('program_workouts'))
      expect(mockQuery.eq).toHaveBeenCalledWith('id', programId)
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

      mockQuery.single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await getCurrentProgram(userId)

      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', userId)
      expect(mockQuery.eq).toHaveBeenCalledWith('is_current', true)
      expect(mockQuery.eq).toHaveBeenCalledWith('is_active', true)
      expect(result).toEqual(mockProgram)
    })

    it('should return null when no current program found', async () => {
      const userId = 'user123'
      mockQuery.single.mockResolvedValue({ 
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

      mockQuery.single.mockResolvedValue({ data: mockCreatedProgram, error: null })

      const result = await createProgram(programData)

      expect(mockQuery.insert).toHaveBeenCalledWith([programData])
      expect(mockQuery.select).toHaveBeenCalled()
      expect(result).toEqual(mockCreatedProgram)
    })
  })

  describe('updateProgram', () => {
    it('should update program with timestamp', async () => {
      const programId = 'prog123'
      const updates = { name: 'Updated Program' }
      const mockUpdatedProgram = { id: programId, ...updates }

      mockQuery.single.mockResolvedValue({ data: mockUpdatedProgram, error: null })

      const result = await updateProgram(programId, updates)

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          updated_at: expect.any(String)
        })
      )
      expect(mockQuery.eq).toHaveBeenCalledWith('id', programId)
      expect(result).toEqual(mockUpdatedProgram)
    })
  })

  describe('setCurrentProgram', () => {
    it('should set program as current', async () => {
      const programId = 'prog123'
      const userId = 'user123'
      const mockProgram = { id: programId, is_current: true }

      mockQuery.single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await setCurrentProgram(programId, userId)

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_current: true,
          updated_at: expect.any(String)
        })
      )
      expect(mockQuery.eq).toHaveBeenCalledWith('id', programId)
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', userId)
      expect(result).toEqual(mockProgram)
    })
  })

  describe('deleteProgram', () => {
    it('should delete program', async () => {
      const programId = 'prog123'
      const userId = 'user123'
      mockQuery.delete.mockResolvedValue({ error: null })

      const result = await deleteProgram(programId, userId)

      expect(mockQuery.delete).toHaveBeenCalled()
      expect(mockQuery.eq).toHaveBeenCalledWith('id', programId)
      expect(mockQuery.eq).toHaveBeenCalledWith('user_id', userId)
      expect(result).toBe(true)
    })
  })
})