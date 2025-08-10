/**
 * Exercise Upsert Operations Test Suite
 * 
 * Tests the new upsert functionality for workout exercises
 * to ensure it properly replaces the delete-and-recreate approach
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import WorkoutLogService from '../services/workoutLogService.js';
import { supabase } from '../config/supabase.js';

// Mock Supabase
jest.mock('../config/supabase.js', () => {
  const mockFn = jest.fn;
  return {
    supabase: {
      from: mockFn(() => ({
        select: mockFn(() => ({
          eq: mockFn(() => ({
            order: mockFn(() => ({
              then: mockFn()
            })),
            single: mockFn(() => ({
              then: mockFn()
            }))
          }))
        })),
        insert: mockFn(() => ({
          select: mockFn(() => ({
            then: mockFn()
          }))
        })),
        update: mockFn(() => ({
          eq: mockFn(() => ({
            then: mockFn()
          }))
        })),
        delete: mockFn(() => ({
          eq: mockFn(() => ({
            then: mockFn()
          })),
          in: mockFn(() => ({
            then: mockFn()
          }))
        }))
      }))
    },
    withSupabaseErrorHandling: mockFn((fn) => fn)
  };
});

// Mock the exercise change detection utility
jest.mock('../utils/exerciseChangeDetection.js', () => ({
  ExerciseChangeDetector: class MockExerciseChangeDetector {
    constructor(options = {}) {
      this.options = options;
    }

    compareExercises(existing, updated) {
      // Mock comparison result for testing
      return {
        hasChanges: existing.length !== updated.length || 
                   JSON.stringify(existing) !== JSON.stringify(updated),
        changes: {
          toInsert: updated.filter(u => !existing.find(e => e.id === u.id)),
          toUpdate: updated.filter(u => existing.find(e => e.id === u.id && 
            JSON.stringify(e) !== JSON.stringify(u))),
          toDelete: existing.filter(e => !updated.find(u => u.id === e.id)).map(e => e.id),
          orderChanged: false,
          metadata: {
            totalChanges: 1,
            changeTypes: 'INSERT,UPDATE,DELETE',
            timestamp: new Date().toISOString()
          }
        },
        summary: {
          inserted: updated.filter(u => !existing.find(e => e.id === u.id)).length,
          updated: updated.filter(u => existing.find(e => e.id === u.id)).length,
          deleted: existing.filter(e => !updated.find(u => u.id === e.id)).length,
          orderChanged: false,
          totalOperations: 1
        }
      };
    }
  }
}));

describe('Exercise Upsert Operations', () => {
  let workoutLogService;
  let mockSupabaseChain;

  beforeEach(() => {
    workoutLogService = new WorkoutLogService();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create a mock chain for Supabase operations
    mockSupabaseChain = {
      select: jest.fn(() => mockSupabaseChain),
      eq: jest.fn(() => mockSupabaseChain),
      order: jest.fn(() => mockSupabaseChain),
      insert: jest.fn(() => mockSupabaseChain),
      update: jest.fn(() => mockSupabaseChain),
      delete: jest.fn(() => mockSupabaseChain),
      in: jest.fn(() => mockSupabaseChain),
      single: jest.fn(() => Promise.resolve({ data: null, error: null })),
      then: jest.fn(() => Promise.resolve({ data: [], error: null }))
    };

    supabase.from.mockReturnValue(mockSupabaseChain);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('upsertWorkoutExercises', () => {
    it('should validate input parameters', async () => {
      // Test invalid workout log ID
      await expect(
        workoutLogService.upsertWorkoutExercises(null, [])
      ).rejects.toThrow('Invalid workout log ID');

      await expect(
        workoutLogService.upsertWorkoutExercises('', [])
      ).rejects.toThrow('Invalid workout log ID');

      // Test invalid exercises parameter
      await expect(
        workoutLogService.upsertWorkoutExercises('workout-id', 'not-an-array')
      ).rejects.toThrow('Exercises must be an array');
    });

    it('should fetch existing exercises from database', async () => {
      const workoutLogId = 'test-workout-id';
      const exercises = [
        {
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
      ];

      // Mock successful fetch of existing exercises
      mockSupabaseChain.then.mockResolvedValueOnce({
        data: [],
        error: null
      });

      await workoutLogService.upsertWorkoutExercises(workoutLogId, exercises);

      // Verify that select was called to fetch existing exercises
      expect(supabase.from).toHaveBeenCalledWith('workout_log_exercises');
      expect(mockSupabaseChain.select).toHaveBeenCalledWith('*');
      expect(mockSupabaseChain.eq).toHaveBeenCalledWith('workout_log_id', workoutLogId);
      expect(mockSupabaseChain.order).toHaveBeenCalledWith('order_index', { ascending: true });
    });

    it('should handle database fetch errors', async () => {
      const workoutLogId = 'test-workout-id';
      const exercises = [];

      // Mock database error
      mockSupabaseChain.then.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection failed', code: '08000' }
      });

      await expect(
        workoutLogService.upsertWorkoutExercises(workoutLogId, exercises)
      ).rejects.toThrow('Failed to fetch existing exercises');
    });

    it('should skip operations when no changes are detected', async () => {
      const workoutLogId = 'test-workout-id';
      const exercises = [
        {
          id: 'existing-1',
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
      ];

      // Mock existing exercises (same as updated)
      mockSupabaseChain.then.mockResolvedValueOnce({
        data: exercises,
        error: null
      });

      // Mock change detector to return no changes
      const mockDetector = {
        compareExercises: jest.fn(() => ({
          hasChanges: false,
          changes: {
            toInsert: [],
            toUpdate: [],
            toDelete: [],
            orderChanged: false,
            metadata: { changeTypes: 'NONE' }
          },
          summary: { inserted: 0, updated: 0, deleted: 0, orderChanged: false }
        }))
      };

      // Mock the import to return our mock detector
      jest.doMock('../utils/exerciseChangeDetection.js', () => ({
        ExerciseChangeDetector: jest.fn(() => mockDetector)
      }));

      const result = await workoutLogService.upsertWorkoutExercises(workoutLogId, exercises);

      expect(result.success).toBe(true);
      expect(result.message).toBe('No changes detected');
      expect(result.operations).toEqual({ inserted: 0, updated: 0, deleted: 0 });
    });

    it('should execute insert operations for new exercises', async () => {
      const workoutLogId = 'test-workout-id';
      const newExercises = [
        {
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true],
          orderIndex: 0
        }
      ];

      // Mock empty existing exercises
      mockSupabaseChain.then
        .mockResolvedValueOnce({ data: [], error: null }) // fetch existing
        .mockResolvedValueOnce({ data: [{ id: 'new-id-1' }], error: null }); // insert

      const result = await workoutLogService.upsertWorkoutExercises(workoutLogId, newExercises);

      expect(result.success).toBe(true);
      expect(mockSupabaseChain.insert).toHaveBeenCalled();
    });

    it('should execute update operations for modified exercises', async () => {
      const workoutLogId = 'test-workout-id';
      const existingExercises = [
        {
          id: 'existing-1',
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
      ];
      const updatedExercises = [
        {
          id: 'existing-1',
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [12, 12, 12], // Changed reps
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
      ];

      // Mock existing exercises and update operation
      mockSupabaseChain.then
        .mockResolvedValueOnce({ data: existingExercises, error: null }) // fetch existing
        .mockResolvedValueOnce({ data: null, error: null }); // update

      const result = await workoutLogService.upsertWorkoutExercises(workoutLogId, updatedExercises);

      expect(result.success).toBe(true);
      expect(mockSupabaseChain.update).toHaveBeenCalled();
    });

    it('should execute delete operations for removed exercises', async () => {
      const workoutLogId = 'test-workout-id';
      const existingExercises = [
        {
          id: 'existing-1',
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        },
        {
          id: 'existing-2',
          exerciseId: 'exercise-2',
          sets: 2,
          reps: [8, 8],
          weights: [50, 50],
          completed: [true, true]
        }
      ];
      const updatedExercises = [
        {
          id: 'existing-1',
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
        // existing-2 is removed
      ];

      // Mock existing exercises and delete operation
      mockSupabaseChain.then
        .mockResolvedValueOnce({ data: existingExercises, error: null }) // fetch existing
        .mockResolvedValueOnce({ data: null, error: null }); // delete

      const result = await workoutLogService.upsertWorkoutExercises(workoutLogId, updatedExercises);

      expect(result.success).toBe(true);
      expect(mockSupabaseChain.delete).toHaveBeenCalled();
      expect(mockSupabaseChain.in).toHaveBeenCalledWith('id', ['existing-2']);
    });

    it('should handle exercise data preparation correctly', () => {
      const exercise = {
        exerciseId: 'test-exercise',
        sets: 3,
        reps: [10, 8, 6],
        weights: [100, 110, 120],
        completed: [true, true, false],
        notes: 'Test notes',
        bodyweight: 180,
        orderIndex: 0
      };

      const prepared = workoutLogService._prepareExerciseData(exercise, 'workout-id');

      expect(prepared).toEqual({
        workout_log_id: 'workout-id',
        exercise_id: 'test-exercise',
        sets: 3,
        reps: [10, 8, 6],
        weights: [100, 110, 120],
        completed: [true, true, false],
        bodyweight: 180,
        notes: 'Test notes',
        is_added: false,
        added_type: null,
        original_index: -1,
        order_index: 0
      });
    });

    it('should validate required exercise fields during preparation', () => {
      const invalidExercise = {
        sets: 3,
        reps: [10, 10, 10],
        weights: [100, 100, 100],
        completed: [true, true, true]
        // Missing exerciseId
      };

      expect(() => {
        workoutLogService._prepareExerciseData(invalidExercise, 'workout-id');
      }).toThrow('Exercise ID is required');
    });

    it('should handle array padding and trimming correctly', () => {
      const exercise = {
        exerciseId: 'test-exercise',
        sets: 4,
        reps: [10, 8], // Too short
        weights: [100, 110, 120, 130, 140], // Too long
        completed: [true, true, false], // Just right but one short
        orderIndex: 0
      };

      const prepared = workoutLogService._prepareExerciseData(exercise, 'workout-id');

      expect(prepared.reps).toEqual([10, 8, null, null]); // Padded with null
      expect(prepared.weights).toEqual([100, 110, 120, 130]); // Trimmed to 4
      expect(prepared.completed).toEqual([true, true, false, false]); // Padded with false
    });
  });

  describe('reorderExercises', () => {
    it('should update order_index for exercises with IDs', async () => {
      const workoutLogId = 'test-workout-id';
      const exercises = [
        { id: 'ex-1', exerciseId: 'exercise-1' },
        { id: 'ex-2', exerciseId: 'exercise-2' },
        { exerciseId: 'exercise-3' } // No ID - should be skipped
      ];

      // Mock successful updates
      mockSupabaseChain.then.mockResolvedValue({ data: null, error: null });

      await workoutLogService.reorderExercises(workoutLogId, exercises);

      // Should call update twice (for exercises with IDs)
      expect(mockSupabaseChain.update).toHaveBeenCalledTimes(2);
      expect(mockSupabaseChain.update).toHaveBeenCalledWith({ order_index: 0 });
      expect(mockSupabaseChain.update).toHaveBeenCalledWith({ order_index: 1 });
    });

    it('should handle empty exercise array', async () => {
      const workoutLogId = 'test-workout-id';
      const exercises = [];

      // Should complete without any database calls
      await workoutLogService.reorderExercises(workoutLogId, exercises);

      expect(mockSupabaseChain.update).not.toHaveBeenCalled();
    });

    it('should handle reorder errors gracefully', async () => {
      const workoutLogId = 'test-workout-id';
      const exercises = [{ id: 'ex-1', exerciseId: 'exercise-1' }];

      // Mock update error
      mockSupabaseChain.then.mockResolvedValue({
        data: null,
        error: { message: 'Update failed', code: '23505' }
      });

      await expect(
        workoutLogService.reorderExercises(workoutLogId, exercises)
      ).rejects.toThrow('Failed to update exercise order');
    });
  });

  describe('Legacy updateWorkoutLogExercises', () => {
    it('should redirect to upsert method', async () => {
      const workoutLogId = 'test-workout-id';
      const exercises = [
        {
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
      ];

      // Mock the upsert method
      const upsertSpy = jest.spyOn(workoutLogService, 'upsertWorkoutExercises')
        .mockResolvedValue({
          success: true,
          operations: { inserted: 1, updated: 0, deleted: 0 }
        });

      const result = await workoutLogService.updateWorkoutLogExercises(workoutLogId, exercises);

      expect(upsertSpy).toHaveBeenCalledWith(workoutLogId, exercises, {
        logOperations: true,
        useTransaction: true,
        validateData: true
      });
      expect(result.success).toBe(true);
    });
  });
});