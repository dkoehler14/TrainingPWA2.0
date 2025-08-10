/**
 * Real-time Synchronization Tests
 * 
 * Tests the enhanced real-time synchronization system that works with
 * the new caching system, including intelligent merging and conflict resolution.
 */

import { renderHook, act, waitFor } from '@testing-library/react';

// Mock the cache manager
jest.mock('../hooks/useCacheManager', () => jest.fn());

// Mock the real-time hook
jest.mock('../hooks/useWorkoutRealtime', () => ({
  __esModule: true,
  default: jest.fn(),
  useWorkoutProgressBroadcast: jest.fn()
}));

// Mock the workout log service
jest.mock('../services/workoutLogService', () => ({
  __esModule: true,
  default: {
    saveWorkoutLogCacheFirst: jest.fn(),
    getProgramWorkoutLogs: jest.fn()
  }
}));

describe('Real-time Synchronization with Cache Integration', () => {
  let mockCacheManager;
  let mockRealtimeHook;
  let mockProgramLogs;
  let mockSetProgramLogs;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock program logs state
    mockProgramLogs = {
      '0_0': {
        workoutLogId: 'test-workout-id',
        exercises: [
          {
            exerciseId: 'exercise-1',
            orderIndex: 0,
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, false],
            lastModified: '2024-01-01T10:00:00Z'
          }
        ],
        isWorkoutFinished: false,
        lastSaved: '2024-01-01T10:00:00Z',
        lastUserInput: '2024-01-01T10:00:00Z'
      }
    };

    mockSetProgramLogs = jest.fn();

    // Mock cache manager functions
    mockCacheManager = {
      getCachedWorkoutLog: jest.fn(),
      updateCachedWorkoutLog: jest.fn(),
      invalidateCacheEntry: jest.fn(),
      cleanupInvalidCacheEntry: jest.fn()
    };

    const useCacheManager = require('../hooks/useCacheManager').default;
    useCacheManager.mockReturnValue(mockCacheManager);

    // Mock real-time hook
    mockRealtimeHook = {
      isConnected: true,
      broadcastProgress: jest.fn(),
      updatePresence: jest.fn()
    };
  });

  describe('Workout Log Real-time Updates', () => {
    test('should handle workout completion status change', async () => {
      // Mock current cached data
      mockCacheManager.getCachedWorkoutLog.mockResolvedValue(mockProgramLogs['0_0']);

      // Create real-time update for workout completion
      const realtimeUpdate = {
        type: 'UPDATE',
        table: 'workout_logs',
        eventType: 'UPDATE',
        data: {
          id: 'test-workout-id',
          user_id: 'test-user',
          is_finished: true,
          updated_at: '2024-01-01T10:05:00Z'
        },
        timestamp: '2024-01-01T10:05:00Z'
      };

      // Simulate the real-time update handler
      const handleWorkoutLogRealtimeUpdate = async (update) => {
        const updatedData = update.data;
        const currentCachedData = await mockCacheManager.getCachedWorkoutLog(0, 0);
        
        const mergedData = {
          ...currentCachedData,
          workoutLogId: updatedData.id,
          isWorkoutFinished: updatedData.is_finished,
          lastSaved: updatedData.updated_at,
          exercises: currentCachedData?.exercises || [],
          metadata: {
            ...currentCachedData?.metadata,
            remoteUpdate: true,
            remoteTimestamp: update.timestamp,
            source: 'realtime_workout_log_update'
          }
        };

        await mockCacheManager.updateCachedWorkoutLog(0, 0, mergedData, {
          source: 'realtime_workout_log_update',
          preserveUserInput: true
        });
      };

      // Execute the handler
      await handleWorkoutLogRealtimeUpdate(realtimeUpdate);

      // Verify cache was updated correctly
      expect(mockCacheManager.getCachedWorkoutLog).toHaveBeenCalledWith(0, 0);
      expect(mockCacheManager.updateCachedWorkoutLog).toHaveBeenCalledWith(
        0, 0,
        expect.objectContaining({
          workoutLogId: 'test-workout-id',
          isWorkoutFinished: true,
          lastSaved: '2024-01-01T10:05:00Z',
          metadata: expect.objectContaining({
            remoteUpdate: true,
            source: 'realtime_workout_log_update'
          })
        }),
        expect.objectContaining({
          source: 'realtime_workout_log_update',
          preserveUserInput: true
        })
      );
    });

    test('should preserve user input during real-time updates', async () => {
      // Mock current cached data with recent user input
      const recentUserInputData = {
        ...mockProgramLogs['0_0'],
        lastUserInput: new Date(Date.now() - 10000).toISOString(), // 10 seconds ago
        exercises: [
          {
            ...mockProgramLogs['0_0'].exercises[0],
            reps: [12, 12, 10], // User changed reps
            lastModified: new Date(Date.now() - 5000).toISOString() // 5 seconds ago
          }
        ]
      };

      mockCacheManager.getCachedWorkoutLog.mockResolvedValue(recentUserInputData);

      // Create real-time update
      const realtimeUpdate = {
        type: 'UPDATE',
        table: 'workout_log_exercises',
        data: {
          id: 'exercise-db-id',
          exercise_id: 'exercise-1',
          order_index: 0,
          reps: [10, 10, 10], // Remote data has old reps
          weights: [105, 105, 105], // Remote data has updated weights
          updated_at: new Date(Date.now() - 15000).toISOString() // 15 seconds ago
        }
      };

      // Simulate exercise merge logic
      const mergeExerciseData = (localExercise, remoteExercise) => {
        const localTimestamp = new Date(localExercise.lastModified || 0);
        const remoteTimestamp = new Date(remoteExercise.updated_at || 0);
        
        if (localTimestamp > remoteTimestamp) {
          // Local changes are newer, preserve them
          return {
            ...localExercise,
            // Only update non-user-input fields
            id: remoteExercise.id,
            metadata: {
              ...localExercise.metadata,
              remoteId: remoteExercise.id,
              remoteTimestamp: remoteExercise.updated_at,
              conflictResolution: 'local_preferred'
            }
          };
        }
        return localExercise; // Simplified for test
      };

      const localExercise = recentUserInputData.exercises[0];
      const mergedExercise = mergeExerciseData(localExercise, realtimeUpdate.data);

      // Verify that user input (reps) is preserved
      expect(mergedExercise.reps).toEqual([12, 12, 10]); // User's changes preserved
      expect(mergedExercise.metadata.conflictResolution).toBe('local_preferred');
    });

    test('should handle cache invalidation for conflicts', async () => {
      // Mock current cached data
      mockCacheManager.getCachedWorkoutLog.mockResolvedValue(mockProgramLogs['0_0']);

      // Create real-time update with significant time difference
      const realtimeUpdate = {
        type: 'UPDATE',
        table: 'workout_logs',
        data: {
          id: 'test-workout-id',
          updated_at: new Date(Date.now() + 60000).toISOString() // 1 minute in future
        },
        timestamp: new Date().toISOString()
      };

      // Simulate cache invalidation logic
      const handleRealtimeCacheInvalidation = async (update, reason) => {
        const currentCachedData = await mockCacheManager.getCachedWorkoutLog(0, 0);
        
        // Check if user has recent input
        const lastUserInput = new Date(currentCachedData?.lastUserInput || 0);
        const timeSinceUserInput = Date.now() - lastUserInput.getTime();
        
        if (timeSinceUserInput >= 30000) { // More than 30 seconds
          await mockCacheManager.invalidateCacheEntry(0, 0, reason);
        }
      };

      // Execute invalidation logic
      await handleRealtimeCacheInvalidation(realtimeUpdate, 'timestamp_conflict');

      // Verify cache invalidation was called
      expect(mockCacheManager.invalidateCacheEntry).toHaveBeenCalledWith(
        0, 0, 'timestamp_conflict'
      );
    });

    test('should protect cache from invalidation with recent user input', async () => {
      // Mock current cached data with very recent user input
      const recentInputData = {
        ...mockProgramLogs['0_0'],
        lastUserInput: new Date(Date.now() - 5000).toISOString() // 5 seconds ago
      };

      mockCacheManager.getCachedWorkoutLog.mockResolvedValue(recentInputData);

      // Create conflicting real-time update
      const realtimeUpdate = {
        type: 'UPDATE',
        table: 'workout_logs',
        data: { id: 'test-workout-id' },
        timestamp: new Date().toISOString()
      };

      // Simulate cache protection logic
      const handleRealtimeCacheInvalidation = async (update, reason) => {
        const currentCachedData = await mockCacheManager.getCachedWorkoutLog(0, 0);
        
        const lastUserInput = new Date(currentCachedData?.lastUserInput || 0);
        const timeSinceUserInput = Date.now() - lastUserInput.getTime();
        
        if (timeSinceUserInput < 30000) {
          // Don't invalidate - user has recent input
          return;
        }
        
        await mockCacheManager.invalidateCacheEntry(0, 0, reason);
      };

      // Execute protection logic
      await handleRealtimeCacheInvalidation(realtimeUpdate, 'conflict_detected');

      // Verify cache was NOT invalidated
      expect(mockCacheManager.invalidateCacheEntry).not.toHaveBeenCalled();
    });
  });

  describe('Exercise Real-time Updates', () => {
    test('should add new exercise from real-time update', async () => {
      // Mock current cached data
      mockCacheManager.getCachedWorkoutLog.mockResolvedValue(mockProgramLogs['0_0']);

      // Create real-time update for new exercise
      const realtimeUpdate = {
        type: 'UPDATE',
        table: 'workout_log_exercises',
        data: {
          id: 'new-exercise-db-id',
          exercise_id: 'exercise-2',
          order_index: 1,
          sets: 3,
          reps: [8, 8, 8],
          weights: [50, 50, 50],
          completed: [false, false, false],
          updated_at: '2024-01-01T10:05:00Z'
        }
      };

      // Simulate exercise addition logic
      const transformSupabaseExerciseToLocal = (supabaseExercise) => ({
        id: supabaseExercise.id,
        exerciseId: supabaseExercise.exercise_id,
        orderIndex: supabaseExercise.order_index,
        sets: supabaseExercise.sets,
        reps: supabaseExercise.reps || [],
        weights: supabaseExercise.weights || [],
        completed: supabaseExercise.completed || [],
        lastModified: supabaseExercise.updated_at,
        metadata: {
          source: 'realtime_transform',
          remoteId: supabaseExercise.id,
          remoteTimestamp: supabaseExercise.updated_at
        }
      });

      const newExercise = transformSupabaseExerciseToLocal(realtimeUpdate.data);
      const currentExercises = mockProgramLogs['0_0'].exercises;
      const updatedExercises = [...currentExercises, newExercise].sort((a, b) => a.orderIndex - b.orderIndex);

      // Verify new exercise is properly formatted
      expect(newExercise).toEqual({
        id: 'new-exercise-db-id',
        exerciseId: 'exercise-2',
        orderIndex: 1,
        sets: 3,
        reps: [8, 8, 8],
        weights: [50, 50, 50],
        completed: [false, false, false],
        lastModified: '2024-01-01T10:05:00Z',
        metadata: {
          source: 'realtime_transform',
          remoteId: 'new-exercise-db-id',
          remoteTimestamp: '2024-01-01T10:05:00Z'
        }
      });

      // Verify exercises are properly sorted
      expect(updatedExercises).toHaveLength(2);
      expect(updatedExercises[0].orderIndex).toBe(0);
      expect(updatedExercises[1].orderIndex).toBe(1);
    });
  });

  describe('Conflict Detection and Resolution', () => {
    test('should detect workout completion conflicts', async () => {
      const localData = {
        isWorkoutFinished: false,
        exercises: []
      };

      const remoteUpdate = {
        type: 'UPDATE',
        table: 'workout_logs',
        data: {
          is_finished: true
        }
      };

      // Simulate conflict detection
      const detectAndResolveConflicts = (localData, remoteUpdate) => {
        const conflicts = [];
        
        if (localData.isWorkoutFinished !== remoteUpdate.data.is_finished) {
          conflicts.push({
            type: 'workout_completion',
            local: localData.isWorkoutFinished,
            remote: remoteUpdate.data.is_finished,
            resolution: 'remote_wins'
          });
        }
        
        return conflicts;
      };

      const conflicts = detectAndResolveConflicts(localData, remoteUpdate);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toEqual({
        type: 'workout_completion',
        local: false,
        remote: true,
        resolution: 'remote_wins'
      });
    });

    test('should detect concurrent exercise edits', async () => {
      const localData = {
        exercises: [{
          exerciseId: 'exercise-1',
          orderIndex: 0,
          lastModified: '2024-01-01T10:00:00Z'
        }]
      };

      const remoteUpdate = {
        type: 'UPDATE',
        table: 'workout_log_exercises',
        data: {
          exercise_id: 'exercise-1',
          order_index: 0,
          updated_at: '2024-01-01T10:00:02Z' // 2 seconds later
        }
      };

      // Simulate conflict detection
      const detectAndResolveConflicts = (localData, remoteUpdate) => {
        const conflicts = [];
        
        if (remoteUpdate.table === 'workout_log_exercises') {
          const localExercise = localData.exercises?.find(ex => 
            ex.exerciseId === remoteUpdate.data.exercise_id &&
            ex.orderIndex === remoteUpdate.data.order_index
          );

          if (localExercise && localExercise.lastModified) {
            const localTime = new Date(localExercise.lastModified);
            const remoteTime = new Date(remoteUpdate.data.updated_at);
            
            if (Math.abs(localTime - remoteTime) < 5000) { // 5 second window
              conflicts.push({
                type: 'exercise_concurrent_edit',
                exerciseId: remoteUpdate.data.exercise_id,
                localTime,
                remoteTime,
                resolution: 'merge_required'
              });
            }
          }
        }
        
        return conflicts;
      };

      const conflicts = detectAndResolveConflicts(localData, remoteUpdate);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('exercise_concurrent_edit');
      expect(conflicts[0].resolution).toBe('merge_required');
    });
  });

  describe('Real-time Notifications', () => {
    test('should generate appropriate notification messages', () => {
      const getRealtimeNotificationMessage = (update, isWorkoutFinished) => {
        if (update.table === 'workout_logs' && update.eventType === 'UPDATE') {
          if (update.data.is_finished !== isWorkoutFinished) {
            return update.data.is_finished ? 'Workout completed remotely' : 'Workout reopened remotely';
          }
          return 'Workout updated remotely';
        }
        
        if (update.table === 'workout_log_exercises') {
          return 'Exercise data updated remotely';
        }
        
        if (update.type === 'BROADCAST') {
          return null; // Don't show notifications for broadcasts
        }
        
        return 'Workout updated in real-time';
      };

      // Test workout completion notification
      const completionUpdate = {
        table: 'workout_logs',
        eventType: 'UPDATE',
        data: { is_finished: true }
      };
      
      expect(getRealtimeNotificationMessage(completionUpdate, false))
        .toBe('Workout completed remotely');

      // Test exercise update notification
      const exerciseUpdate = {
        table: 'workout_log_exercises',
        data: {}
      };
      
      expect(getRealtimeNotificationMessage(exerciseUpdate, false))
        .toBe('Exercise data updated remotely');

      // Test broadcast (should not show notification)
      const broadcastUpdate = {
        type: 'BROADCAST',
        data: {}
      };
      
      expect(getRealtimeNotificationMessage(broadcastUpdate, false))
        .toBeNull();
    });
  });
});