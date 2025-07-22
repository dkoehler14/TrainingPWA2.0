/**
 * Unit tests for useAutoSave hook
 */

import { renderHook } from '@testing-library/react';
import useAutoSave from '../useAutoSave';
import quickWorkoutDraftService from '../../services/quickWorkoutDraftService';

// Mock the quickWorkoutDraftService
jest.mock('../../services/quickWorkoutDraftService', () => ({
  saveDraft: jest.fn(),
  deleteDraft: jest.fn(),
}));

// Mock lodash debounce to make tests more predictable
jest.mock('lodash', () => ({
  debounce: (fn, delay) => {
    const debouncedFn = jest.fn(fn);
    debouncedFn.cancel = jest.fn();
    return debouncedFn;
  },
}));

describe('useAutoSave', () => {
  const mockUser = { uid: 'test-user-id' };
  const mockExercises = [
    {
      exerciseId: 'exercise-1',
      sets: 3,
      reps: [10, 10, 10],
      weights: [100, 100, 100],
      completed: [true, true, false],
      notes: 'Test notes',
      bodyweight: null
    }
  ];
  const mockWorkoutName = 'Test Workout';

  beforeEach(() => {
    jest.clearAllMocks();
    quickWorkoutDraftService.saveDraft.mockResolvedValue({
      id: 'draft-123',
      userId: 'test-user-id',
      name: mockWorkoutName,
      exercises: mockExercises
    });
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => 
      useAutoSave(null, [], '') // Start with no user and no exercises
    );

    expect(result.current.currentDraftId).toBeNull();
    expect(result.current.isAutoSaving).toBe(false);
    expect(result.current.lastSaveTime).toBeNull();
    expect(result.current.autoSaveError).toBeNull();
    expect(typeof result.current.debouncedSave).toBe('function');
    expect(typeof result.current.clearDraft).toBe('function');
  });

  it('should provide debounced save function', () => {
    const { result } = renderHook(() => 
      useAutoSave(mockUser, mockExercises, mockWorkoutName)
    );

    expect(typeof result.current.debouncedSave).toBe('function');
    expect(typeof result.current.debouncedSave.cancel).toBe('function');
  });

  it('should provide clear draft function', () => {
    const { result } = renderHook(() => 
      useAutoSave(mockUser, mockExercises, mockWorkoutName)
    );

    expect(typeof result.current.clearDraft).toBe('function');
  });

  it('should not save when exercises array is empty', () => {
    renderHook(() => 
      useAutoSave(mockUser, [], mockWorkoutName)
    );

    expect(quickWorkoutDraftService.saveDraft).not.toHaveBeenCalled();
  });

  it('should not save when user is null', () => {
    renderHook(() => 
      useAutoSave(null, mockExercises, mockWorkoutName)
    );

    expect(quickWorkoutDraftService.saveDraft).not.toHaveBeenCalled();
  });

  it('should cancel debounced save on unmount', () => {
    const { result, unmount } = renderHook(() => 
      useAutoSave(mockUser, mockExercises, mockWorkoutName)
    );

    const cancelSpy = jest.spyOn(result.current.debouncedSave, 'cancel');
    
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
  });
});