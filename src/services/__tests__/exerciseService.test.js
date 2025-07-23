import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { supabase } from '../../config/supabase'
import {
  getExercises,
  searchExercises,
  getExerciseById,
  createExercise,
  updateExercise,
  deleteExercise,
  getAvailableExercises,
  getMuscleGroups,
  getExerciseTypes
} from '../exerciseService'

// Mock Supabase
jest.mock('../../config/supabase')

describe('Exercise Service', () => {
  let mockQuery

  beforeEach(() => {
    jest.clearAllMocks()
    mockQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis()
    }
    supabase.from.mockReturnValue(mockQuery)
  })

  describe('getExercises', () => {
    it('should fetch exercises with default ordering', async () => {
      const mockExercises = [
        { id: '1', name: 'Bench Press', primary_muscle_group: 'Chest' },
        { id: '2', name: 'Squat', primary_muscle_group: 'Legs' }
      ]

      mockQuery.order.mockResolvedValue({ data: mockExercises, error: null })

      const result = await getExercises()

      expect(supabase.from).toHaveBeenCalledWith('exercises')
      expect(mockQuery.select).toHaveBeenCalledWith('*')
      expect(mockQuery.order).toHaveBeenCalledWith('name')
      expect(result).toEqual(mockExercises)
    })

    it('should apply muscle group filter', async () => {
      const filters = { muscleGroup: 'Chest' }
      mockQuery.order.mockResolvedValue({ data: [], error: null })

      await getExercises(filters)

      expect(mockQuery.eq).toHaveBeenCalledWith('primary_muscle_group', 'Chest')
    })

    it('should apply exercise type filter', async () => {
      const filters = { exerciseType: 'Compound' }
      mockQuery.order.mockResolvedValue({ data: [], error: null })

      await getExercises(filters)

      expect(mockQuery.eq).toHaveBeenCalledWith('exercise_type', 'Compound')
    })

    it('should apply limit filter', async () => {
      const filters = { limit: 10 }
      mockQuery.order.mockResolvedValue({ data: [], error: null })

      await getExercises(filters)

      expect(mockQuery.limit).toHaveBeenCalledWith(10)
    })
  })

  describe('searchExercises', () => {
    it('should search exercises by name', async () => {
      const searchTerm = 'bench'
      const mockExercises = [
        { id: '1', name: 'Bench Press', primary_muscle_group: 'Chest' }
      ]

      mockQuery.order.mockResolvedValue({ data: mockExercises, error: null })

      const result = await searchExercises(searchTerm)

      expect(mockQuery.ilike).toHaveBeenCalledWith('name', '%bench%')
      expect(result).toEqual(mockExercises)
    })

    it('should apply default limit of 50', async () => {
      mockQuery.order.mockResolvedValue({ data: [], error: null })

      await searchExercises('test')

      expect(mockQuery.limit).toHaveBeenCalledWith(50)
    })
  })

  describe('getExerciseById', () => {
    it('should fetch single exercise by ID', async () => {
      const exerciseId = '123'
      const mockExercise = { id: '123', name: 'Bench Press' }

      mockQuery.single.mockResolvedValue({ data: mockExercise, error: null })

      const result = await getExerciseById(exerciseId)

      expect(mockQuery.eq).toHaveBeenCalledWith('id', exerciseId)
      expect(mockQuery.single).toHaveBeenCalled()
      expect(result).toEqual(mockExercise)
    })
  })

  describe('getAvailableExercises', () => {
    it('should get global and user-created exercises', async () => {
      const userId = 'user123'
      const mockExercises = [
        { id: '1', name: 'Bench Press', is_global: true },
        { id: '2', name: 'Custom Exercise', is_global: false, created_by: userId }
      ]

      mockQuery.order.mockResolvedValue({ data: mockExercises, error: null })

      const result = await getAvailableExercises(userId)

      expect(mockQuery.or).toHaveBeenCalledWith(`is_global.eq.true,created_by.eq.${userId}`)
      expect(result).toEqual(mockExercises)
    })

    it('should apply search filter', async () => {
      const userId = 'user123'
      const filters = { search: 'bench' }
      mockQuery.order.mockResolvedValue({ data: [], error: null })

      await getAvailableExercises(userId, filters)

      expect(mockQuery.ilike).toHaveBeenCalledWith('name', '%bench%')
    })
  })

  describe('createExercise', () => {
    it('should create new exercise', async () => {
      const exerciseData = {
        name: 'New Exercise',
        primary_muscle_group: 'Chest',
        exercise_type: 'Compound'
      }
      const mockCreatedExercise = { id: '123', ...exerciseData }

      mockQuery.single.mockResolvedValue({ data: mockCreatedExercise, error: null })

      const result = await createExercise(exerciseData)

      expect(mockQuery.insert).toHaveBeenCalledWith([exerciseData])
      expect(mockQuery.select).toHaveBeenCalled()
      expect(mockQuery.single).toHaveBeenCalled()
      expect(result).toEqual(mockCreatedExercise)
    })
  })

  describe('updateExercise', () => {
    it('should update exercise with timestamp', async () => {
      const exerciseId = '123'
      const updates = { name: 'Updated Exercise' }
      const mockUpdatedExercise = { id: exerciseId, ...updates }

      mockQuery.single.mockResolvedValue({ data: mockUpdatedExercise, error: null })

      const result = await updateExercise(exerciseId, updates)

      expect(mockQuery.update).toHaveBeenCalledWith(
        expect.objectContaining({
          ...updates,
          updated_at: expect.any(String)
        })
      )
      expect(mockQuery.eq).toHaveBeenCalledWith('id', exerciseId)
      expect(result).toEqual(mockUpdatedExercise)
    })
  })

  describe('deleteExercise', () => {
    it('should delete exercise', async () => {
      const exerciseId = '123'
      mockQuery.delete.mockResolvedValue({ error: null })

      const result = await deleteExercise(exerciseId)

      expect(mockQuery.delete).toHaveBeenCalled()
      expect(mockQuery.eq).toHaveBeenCalledWith('id', exerciseId)
      expect(result).toBe(true)
    })
  })

  describe('getMuscleGroups', () => {
    it('should get unique muscle groups', async () => {
      const mockData = [
        { primary_muscle_group: 'Chest' },
        { primary_muscle_group: 'Legs' },
        { primary_muscle_group: 'Chest' } // Duplicate
      ]

      mockQuery.order.mockResolvedValue({ data: mockData, error: null })

      const result = await getMuscleGroups()

      expect(mockQuery.select).toHaveBeenCalledWith('primary_muscle_group')
      expect(mockQuery.eq).toHaveBeenCalledWith('is_global', true)
      expect(result).toEqual(['Chest', 'Legs'])
    })
  })

  describe('getExerciseTypes', () => {
    it('should get unique exercise types', async () => {
      const mockData = [
        { exercise_type: 'Compound' },
        { exercise_type: 'Isolation' },
        { exercise_type: 'Compound' } // Duplicate
      ]

      mockQuery.order.mockResolvedValue({ data: mockData, error: null })

      const result = await getExerciseTypes()

      expect(mockQuery.select).toHaveBeenCalledWith('exercise_type')
      expect(mockQuery.eq).toHaveBeenCalledWith('is_global', true)
      expect(result).toEqual(['Compound', 'Isolation'])
    })
  })
})