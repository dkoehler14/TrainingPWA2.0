/**
 * Test suite for saveMetadataOnly method
 */

import workoutLogService from '../services/workoutLogService';
import { supabase } from '../config/supabase';

// Mock supabase
jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      update: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(() => ({
            single: jest.fn()
          }))
        }))
      }))
    }))
  },
  withSupabaseErrorHandling: jest.fn((fn) => fn)
}));

// Mock logging utilities
jest.mock('../utils/workoutLogLogger', () => ({
  workoutLogLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  },
  OperationType: {
    UPDATE: 'update'
  },
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logDebug: jest.fn(),
  logCacheOperation: jest.fn(),
  logExerciseOperation: jest.fn(),
  startTimer: jest.fn(() => 'timer-id'),
  endTimer: jest.fn(() => ({ duration: 100 })),
  logPerformanceMetric: jest.fn()
}));

describe('WorkoutLogService - saveMetadataOnly', () => {
  let mockUpdate, mockEq, mockSelect, mockSingle;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mock chain
    mockSingle = jest.fn();
    mockSelect = jest.fn(() => ({ single: mockSingle }));
    mockEq = jest.fn(() => ({ select: mockSelect }));
    mockUpdate = jest.fn(() => ({ eq: mockEq }));
    
    supabase.from.mockReturnValue({
      update: mockUpdate
    });
  });

  test('should save metadata-only successfully', async () => {
    const workoutLogId = 'test-workout-id';
    const metadata = {
      is_finished: true,
      duration: 45,
      notes: 'Great workout!',
      completed_date: '2025-01-01T12:00:00Z'
    };

    const mockResult = {
      id: workoutLogId,
      is_finished: true,
      duration: 45,
      notes: 'Great workout!',
      completed_date: '2025-01-01T12:00:00Z',
      updated_at: '2025-01-01T12:00:00Z'
    };

    mockSingle.mockResolvedValue({ data: mockResult, error: null });

    const result = await workoutLogService.saveMetadataOnly(workoutLogId, metadata);

    expect(result.success).toBe(true);
    expect(result.operationType).toBe('metadata-only');
    expect(result.affectedTables).toEqual(['workout_logs']);
    expect(result.workoutLogId).toBe(workoutLogId);
    expect(result.performance.databaseWrites).toBe(1);

    // Verify supabase calls
    expect(supabase.from).toHaveBeenCalledWith('workout_logs');
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      is_finished: true,
      duration: 45,
      notes: 'Great workout!',
      completed_date: '2025-01-01T12:00:00Z',
      updated_at: expect.any(String)
    }));
    expect(mockEq).toHaveBeenCalledWith('id', workoutLogId);
  });

  test('should validate metadata fields', async () => {
    const workoutLogId = 'test-workout-id';
    const invalidMetadata = {
      invalid_field: 'should not be allowed',
      is_finished: true
    };

    await expect(
      workoutLogService.saveMetadataOnly(workoutLogId, invalidMetadata)
    ).rejects.toThrow('Invalid metadata fields provided: invalid_field');
  });

  test('should validate workout log ID', async () => {
    const metadata = { is_finished: true };

    await expect(
      workoutLogService.saveMetadataOnly(null, metadata)
    ).rejects.toThrow('Invalid workout log ID for metadata-only save');

    await expect(
      workoutLogService.saveMetadataOnly(123, metadata)
    ).rejects.toThrow('Invalid workout log ID for metadata-only save');
  });

  test('should validate metadata object', async () => {
    const workoutLogId = 'test-workout-id';

    await expect(
      workoutLogService.saveMetadataOnly(workoutLogId, null)
    ).rejects.toThrow('Metadata must be an object for metadata-only save');

    await expect(
      workoutLogService.saveMetadataOnly(workoutLogId, 'invalid')
    ).rejects.toThrow('Metadata must be an object for metadata-only save');
  });

  test('should handle database errors', async () => {
    const workoutLogId = 'test-workout-id';
    const metadata = { is_finished: true };

    const mockError = {
      message: 'Database connection failed',
      code: '08006'
    };

    mockSingle.mockResolvedValue({ data: null, error: mockError });

    await expect(
      workoutLogService.saveMetadataOnly(workoutLogId, metadata)
    ).rejects.toThrow('Failed to update workout log metadata');
  });

  test('should only update provided metadata fields', async () => {
    const workoutLogId = 'test-workout-id';
    const metadata = {
      is_finished: true,
      notes: 'Updated notes'
      // duration and completed_date not provided
    };

    const mockResult = { id: workoutLogId };
    mockSingle.mockResolvedValue({ data: mockResult, error: null });

    await workoutLogService.saveMetadataOnly(workoutLogId, metadata);

    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      is_finished: true,
      notes: 'Updated notes',
      updated_at: expect.any(String)
    }));

    // Should not include duration or completed_date
    const updateCall = mockUpdate.mock.calls[0][0];
    expect(updateCall).not.toHaveProperty('duration');
    expect(updateCall).not.toHaveProperty('completed_date');
  });
});