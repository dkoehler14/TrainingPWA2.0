import { describe, it, expect, beforeEach, jest } from '@jest/globals'

// Mock the data transformation utility
const mockTransformSupabaseProgramToWeeklyConfigs = jest.fn((program) => ({
  ...program,
  weekly_configs: {}
}))

jest.mock('../../utils/dataTransformations', () => ({
  transformSupabaseProgramToWeeklyConfigs: mockTransformSupabaseProgramToWeeklyConfigs
}))

// Mock Supabase
const mockFrom = () => ({
  select: mockSelect,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete
})

const mockSelect = function() { return this }
const mockEq = function() { return this }
const mockOrder = function() { return this }
const mockSingle = function() { return Promise.resolve({ data: null, error: null }) }
const mockInsert = function() { return this }
const mockUpdate = function() { return this }
const mockDelete = function() { return this }

jest.mock('../../config/supabase', () => ({
  supabase: {
    from: mockFrom
  }
}))

// Import after mocking
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
import { supabase } from '../../config/supabase'

describe('Program Service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getUserPrograms', () => {
    beforeEach(() => {
      mockTransformSupabaseProgramToWeeklyConfigs.mockClear()
    })

    it('should fetch user programs with workout and exercise data', async () => {
      const userId = 'user123'
      const mockPrograms = [
        { 
          id: '1', 
          name: 'Program 1', 
          user_id: userId,
          program_workouts: [
            {
              id: 'workout1',
              week_number: 1,
              day_number: 1,
              program_exercises: [
                { id: 'ex1', order_index: 0 }
              ]
            }
          ]
        },
        { 
          id: '2', 
          name: 'Program 2', 
          user_id: userId,
          program_workouts: []
        }
      ]

      supabase.from().order.mockResolvedValue({ data: mockPrograms, error: null })

      const result = await getUserPrograms(userId)

      expect(supabase.from).toHaveBeenCalledWith('programs')
      expect(supabase.from().select).toHaveBeenCalledWith(expect.stringContaining('program_workouts'))
      expect(supabase.from().eq).toHaveBeenCalledWith('user_id', userId)
      expect(supabase.from().order).toHaveBeenCalledWith('created_at', { ascending: false })
      expect(mockTransformSupabaseProgramToWeeklyConfigs).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(2)
    })

    it('should apply isActive filter', async () => {
      const userId = 'user123'
      const filters = { isActive: true }
      supabase.from().order.mockResolvedValue({ data: [], error: null })

      await getUserPrograms(userId, filters)

      expect(supabase.from().eq).toHaveBeenCalledWith('is_active', true)
    })

    it('should apply isCurrent filter', async () => {
      const userId = 'user123'
      const filters = { isCurrent: true }
      supabase.from().order.mockResolvedValue({ data: [], error: null })

      await getUserPrograms(userId, filters)

      expect(supabase.from().eq).toHaveBeenCalledWith('is_current', true)
    })

    it('should sort workouts and exercises before transformation', async () => {
      const userId = 'user123'
      const mockPrograms = [
        { 
          id: '1', 
          name: 'Program 1', 
          user_id: userId,
          program_workouts: [
            {
              id: 'workout2',
              week_number: 2,
              day_number: 1,
              program_exercises: [
                { id: 'ex2', order_index: 1 },
                { id: 'ex1', order_index: 0 }
              ]
            },
            {
              id: 'workout1',
              week_number: 1,
              day_number: 2,
              program_exercises: []
            }
          ]
        }
      ]

      supabase.from().order.mockResolvedValue({ data: mockPrograms, error: null })

      await getUserPrograms(userId)

      // Verify that the transformation function was called with sorted data
      expect(mockTransformSupabaseProgramToWeeklyConfigs).toHaveBeenCalledWith(
        expect.objectContaining({
          program_workouts: expect.arrayContaining([
            expect.objectContaining({
              week_number: 1,
              day_number: 2,
              program_exercises: []
            }),
            expect.objectContaining({
              week_number: 2,
              day_number: 1,
              program_exercises: expect.arrayContaining([
                expect.objectContaining({ order_index: 0 }),
                expect.objectContaining({ order_index: 1 })
              ])
            })
          ])
        })
      )
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

      supabase.from().single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await getProgramById(programId)

      expect(supabase.from().select).toHaveBeenCalledWith(expect.stringContaining('program_workouts'))
      expect(supabase.from().eq).toHaveBeenCalledWith('id', programId)
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

      supabase.from().single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await getCurrentProgram(userId)

      expect(supabase.from().eq).toHaveBeenCalledWith('user_id', userId)
      expect(supabase.from().eq).toHaveBeenCalledWith('is_current', true)
      expect(supabase.from().eq).toHaveBeenCalledWith('is_active', true)
      expect(result).toEqual(mockProgram)
    })

    it('should return null when no current program found', async () => {
      const userId = 'user123'
      supabase.from().single.mockResolvedValue({ 
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

      supabase.from().single.mockResolvedValue({ data: mockCreatedProgram, error: null })

      const result = await createProgram(programData)

      expect(supabase.from().insert).toHaveBeenCalledWith([programData])
      expect(supabase.from().select).toHaveBeenCalled()
      expect(result).toEqual(mockCreatedProgram)
    })
  })

  describe('updateProgram', () => {
    it('should update program with timestamp', async () => {
      const programId = 'prog123'
      const updates = { name: 'Updated Program' }
      const mockUpdatedProgram = { id: programId, ...updates }

      supabase.from().single.mockResolvedValue({ data: mockUpdatedProgram, error: null })

      const result = await updateProgram(programId, updates)

      expect(supabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          updated_at: expect.any(String)
        })
      )
      expect(supabase.from().eq).toHaveBeenCalledWith('id', programId)
      expect(result).toEqual(mockUpdatedProgram)
    })
  })

  describe('setCurrentProgram', () => {
    it('should set program as current', async () => {
      const programId = 'prog123'
      const userId = 'user123'
      const mockProgram = { id: programId, is_current: true }

      supabase.from().single.mockResolvedValue({ data: mockProgram, error: null })

      const result = await setCurrentProgram(programId, userId)

      expect(supabase.from().update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_current: true,
          updated_at: expect.any(String)
        })
      )
      expect(supabase.from().eq).toHaveBeenCalledWith('id', programId)
      expect(supabase.from().eq).toHaveBeenCalledWith('user_id', userId)
      expect(result).toEqual(mockProgram)
    })
  })

  describe('deleteProgram', () => {
    it('should delete program', async () => {
      const programId = 'prog123'
      const userId = 'user123'
      supabase.from().delete.mockResolvedValue({ error: null })

      const result = await deleteProgram(programId, userId)

      expect(supabase.from().delete).toHaveBeenCalled()
      expect(supabase.from().eq).toHaveBeenCalledWith('id', programId)
      expect(supabase.from().eq).toHaveBeenCalledWith('user_id', userId)
      expect(result).toBe(true)
    })
  })
})