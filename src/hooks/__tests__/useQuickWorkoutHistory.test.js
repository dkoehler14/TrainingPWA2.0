/**
 * useQuickWorkoutHistory Hook Tests
 */

import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import useQuickWorkoutHistory from '../useQuickWorkoutHistory';
import { auth } from '../../firebase';
import { getCollectionCached } from '../../api/enhancedFirestoreCache';

// Mock Firebase auth
jest.mock('../../firebase', () => ({
  auth: {
    currentUser: null
  }
}));

// Mock enhanced cache
jest.mock('../../api/enhancedFirestoreCache', () => ({
  getCollectionCached: jest.fn()
}));

// Mock workout data
const mockWorkouts = [
  {
    id: 'workout1',
    userId: 'test-user',
    name: 'Upper Body',
    type: 'quick_workout',
    isWorkoutFinished: true,
    completedDate: { toDate: () => new Date('2024-01-15') },
    exercises: [
      { exerciseId: 'ex1', sets: 3, completed: [true, true, true] }
    ]
  },
  {
    id: 'workout2',
    userId: 'test-user',
    name: 'Lower Body',
    type: 'quick_workout',
    isWorkoutFinished: true,
    completedDate: { toDate: () => new Date('2024-01-14') },
    exercises: [
      { exerciseId: 'ex2', sets: 2, completed: [true, false] }
    ]
  }
];

describe('useQuickWorkoutHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Reset auth mock
    auth.currentUser = { uid: 'test-user' };
    
    // Reset cache mock
    getCollectionCached.mockResolvedValue(mockWorkouts);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('fetches workouts successfully when user is authenticated', async () => {
    const { result } = renderHook(() => useQuickWorkoutHistory());

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.workouts).toEqual([]);
    expect(result.current.error).toBeNull();

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.workouts).toEqual(mockWorkouts);
    expect(result.current.error).toBeNull();
    expect(getCollectionCached).toHaveBeenCalledWith(
      'workoutLogs',
      {
        where: [
          ['userId', '==', 'test-user'],
          ['type', '==', 'quick_workout'],
          ['isWorkoutFinished', '==', true]
        ],
        orderBy: [['completedDate', 'desc']]
      },
      15 * 60 * 1000 // 15 minutes TTL
    );
  });

  test('handles unauthenticated user', async () => {
    auth.currentUser = null;

    const { result } = renderHook(() => useQuickWorkoutHistory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.workouts).toEqual([]);
    expect(result.current.error).toBe('Please sign in to view your workout history');
    expect(getCollectionCached).not.toHaveBeenCalled();
  });

  test('handles fetch errors with user-friendly messages', async () => {
    const testCases = [
      {
        error: { code: 'permission-denied' },
        expectedMessage: 'You don\'t have permission to access this data. Please sign in again.'
      },
      {
        error: { code: 'unavailable' },
        expectedMessage: 'Service temporarily unavailable. Please check your internet connection and try again.'
      },
      {
        error: { code: 'deadline-exceeded' },
        expectedMessage: 'Request timed out. Please check your internet connection and try again.'
      },
      {
        error: { message: 'timeout error' },
        expectedMessage: 'Request timed out. Please check your internet connection and try again.'
      },
      {
        error: { message: 'Network error occurred' },
        expectedMessage: 'Network error. Please check your internet connection and try again.'
      },
      {
        error: { message: 'Firebase connection failed' },
        expectedMessage: 'Database connection error. Please try again in a moment.'
      },
      {
        error: { message: 'Firestore error' },
        expectedMessage: 'Database connection error. Please try again in a moment.'
      },
      {
        error: { message: 'Unknown error' },
        expectedMessage: 'Failed to load workout history'
      }
    ];

    for (const { error, expectedMessage } of testCases) {
      getCollectionCached.mockRejectedValueOnce(error);

      const { result } = renderHook(() => useQuickWorkoutHistory());

      await waitFor(() => {
        expect(result.current.error).toBe(expectedMessage);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.workouts).toEqual([]);
    }
  });

  test('filters out invalid workout data', async () => {
    const mixedWorkouts = [
      ...mockWorkouts,
      null, // Invalid workout
      'invalid-string', // Invalid type
      { id: 'valid-workout', name: 'Valid' } // Valid workout
    ];

    getCollectionCached.mockResolvedValue(mixedWorkouts);

    const { result } = renderHook(() => useQuickWorkoutHistory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should only include valid workouts
    expect(result.current.workouts).toHaveLength(3); // 2 mock + 1 valid
    expect(result.current.workouts).toEqual([
      ...mockWorkouts,
      { id: 'valid-workout', name: 'Valid' }
    ]);
  });

  test('refetch function works correctly', async () => {
    const { result } = renderHook(() => useQuickWorkoutHistory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear the mock to test refetch
    getCollectionCached.mockClear();
    getCollectionCached.mockResolvedValue([mockWorkouts[0]]); // Return different data

    await act(async () => {
      await result.current.refetch();
    });

    expect(getCollectionCached).toHaveBeenCalledTimes(1);
    expect(result.current.workouts).toEqual([mockWorkouts[0]]);
  });

  test('auto-retry functionality works with exponential backoff', async () => {
    jest.useFakeTimers();

    // Mock first call to fail, second to succeed
    getCollectionCached
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockWorkouts);

    const { result } = renderHook(() => useQuickWorkoutHistory());

    // Initial fetch fails
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.retryCount).toBe(0);
    });

    // Fast-forward to trigger retry
    act(() => {
      jest.advanceTimersByTime(1000); // First retry after 1 second
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.workouts).toEqual(mockWorkouts);
      expect(result.current.error).toBeNull();
    });

    expect(getCollectionCached).toHaveBeenCalledTimes(2);
  });

  test('stops auto-retry after maximum attempts', async () => {
    jest.useFakeTimers();
    jest.setTimeout(10000); // Increase timeout for this test

    // Mock all calls to fail
    getCollectionCached.mockRejectedValue(new Error('Persistent error'));

    const { result } = renderHook(() => useQuickWorkoutHistory());

    // Initial fetch fails
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    // Trigger first retry
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.retryCount).toBe(1);
    }, { timeout: 3000 });

    // Trigger second retry
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(result.current.retryCount).toBe(2);
    }, { timeout: 3000 });

    // Should not trigger third retry (max is 2)
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(getCollectionCached).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  test('resets retry count on successful refetch', async () => {
    jest.useFakeTimers();

    // Mock first call to fail, manual refetch to succeed
    getCollectionCached
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(mockWorkouts);

    const { result } = renderHook(() => useQuickWorkoutHistory());

    // Initial fetch fails
    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    // Trigger auto-retry
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(result.current.retryCount).toBe(0); // Should reset on success
      expect(result.current.workouts).toEqual(mockWorkouts);
    });
  });

  test('handles component unmount during fetch', async () => {
    let resolvePromise;
    const pendingPromise = new Promise(resolve => {
      resolvePromise = resolve;
    });

    getCollectionCached.mockReturnValue(pendingPromise);

    const { result, unmount } = renderHook(() => useQuickWorkoutHistory());

    expect(result.current.isLoading).toBe(true);

    // Unmount before promise resolves
    unmount();

    // Resolve the promise after unmount
    resolvePromise(mockWorkouts);

    // Wait a bit to ensure no state updates after unmount
    await new Promise(resolve => setTimeout(resolve, 100));

    // No assertions needed - this test passes if no warnings are thrown
  });

  test('handles concurrent fetch calls correctly', async () => {
    const { result } = renderHook(() => useQuickWorkoutHistory());

    // Wait for initial fetch
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear mock and set up new response
    getCollectionCached.mockClear();
    getCollectionCached.mockResolvedValue([mockWorkouts[0]]);

    // Trigger multiple concurrent refetches
    await act(async () => {
      await Promise.all([
        result.current.refetch(),
        result.current.refetch(),
        result.current.refetch()
      ]);
    });

    // Should handle concurrent calls gracefully
    expect(result.current.workouts).toEqual([mockWorkouts[0]]);
  });

  test('preserves workout data structure', async () => {
    const { result } = renderHook(() => useQuickWorkoutHistory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.workouts).toEqual(mockWorkouts);
    expect(result.current.workouts[0]).toHaveProperty('id');
    expect(result.current.workouts[0]).toHaveProperty('userId');
    expect(result.current.workouts[0]).toHaveProperty('name');
    expect(result.current.workouts[0]).toHaveProperty('type');
    expect(result.current.workouts[0]).toHaveProperty('exercises');
  });

  test('returns all expected hook values', async () => {
    const { result } = renderHook(() => useQuickWorkoutHistory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current).toHaveProperty('workouts');
    expect(result.current).toHaveProperty('isLoading');
    expect(result.current).toHaveProperty('error');
    expect(result.current).toHaveProperty('refetch');
    expect(result.current).toHaveProperty('retryCount');

    expect(typeof result.current.refetch).toBe('function');
    expect(typeof result.current.retryCount).toBe('number');
  });
});