/**
 * Basic Upsert Functionality Test
 * Simple test to verify the upsert method exists and can be called
 */

import workoutLogService from '../services/workoutLogService.js';

// Mock Supabase
jest.mock('../config/supabase.js', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          order: jest.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    }))
  },
  withSupabaseErrorHandling: jest.fn((fn) => fn)
}));

// Mock the exercise change detection utility
jest.mock('../utils/exerciseChangeDetection.js', () => ({
  ExerciseChangeDetector: class MockExerciseChangeDetector {
    compareExercises() {
      return {
        hasChanges: false,
        changes: {
          toInsert: [],
          toUpdate: [],
          toDelete: [],
          orderChanged: false,
          metadata: { changeTypes: 'NONE' }
        },
        summary: { inserted: 0, updated: 0, deleted: 0, orderChanged: false }
      };
    }
  }
}));

describe('Basic Upsert Functionality', () => {
  beforeEach(() => {
    // Reset any spies
    jest.clearAllMocks();
  });

  it('should have upsertWorkoutExercises method', () => {
    expect(typeof workoutLogService.upsertWorkoutExercises).toBe('function');
  });

  it('should have reorderExercises method', () => {
    expect(typeof workoutLogService.reorderExercises).toBe('function');
  });

  it('should have _prepareExerciseData method', () => {
    expect(typeof workoutLogService._prepareExerciseData).toBe('function');
  });

  it('should call upsert when updateWorkoutLogExercises is called', async () => {
    const upsertSpy = jest.spyOn(workoutLogService, 'upsertWorkoutExercises')
      .mockResolvedValue({ success: true, operations: { inserted: 0, updated: 0, deleted: 0 } });

    await workoutLogService.updateWorkoutLogExercises('test-id', []);

    expect(upsertSpy).toHaveBeenCalledWith('test-id', [], {
      logOperations: true,
      useTransaction: true,
      validateData: true
    });
  });

  it('should return success when no changes detected', async () => {
    const result = await workoutLogService.upsertWorkoutExercises('test-id', []);
    
    expect(result.success).toBe(true);
    expect(result.message).toBe('No changes detected');
    expect(result.operations).toEqual({ inserted: 0, updated: 0, deleted: 0 });
  });
});