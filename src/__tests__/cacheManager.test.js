/**
 * Unit Tests for WorkoutLogCacheManager
 * 
 * Tests cache operations, validation, cleanup, and error handling
 */

import { WorkoutLogCacheManager, CacheLoggingUtils } from '../utils/cacheManager.js';

// Mock the supabase client to avoid database calls in tests
jest.mock('../config/supabase.js', () => {
  const mockSingle = jest.fn();
  const mockEq = jest.fn(() => ({ single: mockSingle }));
  const mockSelect = jest.fn(() => ({ eq: mockEq }));
  const mockFrom = jest.fn(() => ({ select: mockSelect }));
  
  return {
    supabase: {
      from: mockFrom
    },
    // Export mocks for use in tests
    __mocks: {
      mockSingle,
      mockEq,
      mockSelect,
      mockFrom
    }
  };
});

// Mock console methods to avoid noise in tests
const originalConsole = { ...console };
beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  console.debug = jest.fn();
});

afterAll(() => {
  Object.assign(console, originalConsole);
});

describe('WorkoutLogCacheManager', () => {
  let cacheManager;
  let mockCacheStore;
  let mockSetCacheStore;

  beforeEach(() => {
    cacheManager = new WorkoutLogCacheManager({
      validateInDatabase: false,
      autoCleanup: true,
      maxCacheAge: 60 * 60 * 1000,
      logOperations: false // Disable logging for cleaner tests
    });

    mockCacheStore = {};
    mockSetCacheStore = jest.fn((updater) => {
      if (typeof updater === 'function') {
        mockCacheStore = updater(mockCacheStore);
      } else {
        mockCacheStore = updater;
      }
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('generateKey', () => {
    it('should generate valid cache key from week and day indices', () => {
      const key = cacheManager.generateKey(1, 2);
      expect(key).toBe('1_2');
      // Test that the key follows the expected format
      expect(key).toMatch(/^\d+_\d+$/);
    });

    it('should generate cache key with prefix', () => {
      const key = cacheManager.generateKey(1, 2, 'test');
      expect(key).toBe('test_1_2');
    });

    it('should throw error for invalid indices', () => {
      expect(() => cacheManager.generateKey('invalid', 2)).toThrow();
      expect(() => cacheManager.generateKey(1, 'invalid')).toThrow();
    });
  });

  describe('get', () => {
    it('should return null for invalid cache key', async () => {
      const result = await cacheManager.get('invalid_key', mockCacheStore);
      expect(result).toBeNull();
    });

    it('should return null for non-existent cache entry', async () => {
      const result = await cacheManager.get('1_2', mockCacheStore);
      expect(result).toBeNull();
    });

    it('should return valid cache entry', async () => {
      const validCacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = validCacheEntry;

      const result = await cacheManager.get('1_2', mockCacheStore);
      expect(result).toEqual(validCacheEntry);
    });

    it('should return null and cleanup invalid cache structure', async () => {
      const invalidCacheEntry = {
        workoutLogId: 'invalid-uuid',
        // Missing required fields
      };

      mockCacheStore['1_2'] = invalidCacheEntry;

      const result = await cacheManager.get('1_2', mockCacheStore, { autoCleanup: true });
      expect(result).toBeNull();
    });

    it('should validate against database when requested', async () => {
      // Mock supabase to return no data (workout log not found)
      const { __mocks } = require('../config/supabase.js');
      __mocks.mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const cacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = cacheEntry;

      const result = await cacheManager.get('1_2', mockCacheStore, { 
        validateInDatabase: true,
        autoCleanup: true 
      });
      
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set valid cache entry', async () => {
      const cacheValue = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      await cacheManager.set('1_2', cacheValue, mockCacheStore, mockSetCacheStore);

      expect(mockSetCacheStore).toHaveBeenCalled();
      expect(mockCacheStore['1_2']).toMatchObject({
        ...cacheValue,
        cacheKey: '1_2',
        version: 1
      });
    });

    it('should throw error for invalid cache key', async () => {
      const cacheValue = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      await expect(
        cacheManager.set('invalid_key', cacheValue, mockCacheStore, mockSetCacheStore)
      ).rejects.toThrow('Invalid cache key format');
    });

    it('should throw error for invalid cache structure', async () => {
      const invalidCacheValue = {
        workoutLogId: 'invalid-uuid'
        // Missing required fields
      };

      await expect(
        cacheManager.set('1_2', invalidCacheValue, mockCacheStore, mockSetCacheStore)
      ).rejects.toThrow('Invalid cache structure');
    });

    it('should increment version for existing entries', async () => {
      const cacheValue = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      // Set initial entry
      mockCacheStore['1_2'] = { ...cacheValue, version: 5 };

      await cacheManager.set('1_2', cacheValue, mockCacheStore, mockSetCacheStore);

      expect(mockCacheStore['1_2'].version).toBe(6);
    });
  });

  describe('validate', () => {
    it('should validate valid UUID', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const result = await cacheManager.validate('1_2', validUUID);

      expect(result.isValid).toBe(true);
      expect(result.reason).toBe('Validation successful');
    });

    it('should reject invalid UUID', async () => {
      const invalidUUID = 'invalid-uuid';
      const result = await cacheManager.validate('1_2', invalidUUID);

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Invalid UUID format');
    });

    it('should validate against database when requested', async () => {
      // Mock supabase to return data (workout log found)
      const { __mocks } = require('../config/supabase.js');
      __mocks.mockSingle.mockResolvedValue({ data: { id: '123e4567-e89b-12d3-a456-426614174000' }, error: null });

      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const result = await cacheManager.validate('1_2', validUUID, { 
        validateInDatabase: true 
      });

      expect(result.isValid).toBe(true);
    });

    it('should reject UUID not found in database', async () => {
      // Mock supabase to return no data (workout log not found)
      const { __mocks } = require('../config/supabase.js');
      __mocks.mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });

      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const result = await cacheManager.validate('1_2', validUUID, { 
        validateInDatabase: true 
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Workout log not found in database');
    });
  });

  describe('invalidate', () => {
    it('should invalidate existing cache entry', async () => {
      const cacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = cacheEntry;

      await cacheManager.invalidate('1_2', mockCacheStore, mockSetCacheStore, {
        reason: 'test_invalidation'
      });

      expect(mockSetCacheStore).toHaveBeenCalled();
      expect(mockCacheStore['1_2'].isValid).toBe(false);
      expect(mockCacheStore['1_2'].metadata.invalidationReason).toBe('test_invalidation');
    });

    it('should handle non-existent cache entry gracefully', async () => {
      await cacheManager.invalidate('1_2', mockCacheStore, mockSetCacheStore);
      expect(mockSetCacheStore).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should cleanup invalid cache entry while preserving data', async () => {
      const cacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [{ exerciseId: 'test', sets: 3, reps: [10, 10, 10], weights: [100, 100, 100], completed: [true, true, true] }],
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = cacheEntry;

      await cacheManager.cleanup('1_2', mockCacheStore, mockSetCacheStore, {
        reason: 'test_cleanup'
      });

      expect(mockSetCacheStore).toHaveBeenCalled();
      expect(mockCacheStore['1_2'].workoutLogId).toBeNull();
      expect(mockCacheStore['1_2'].isValid).toBe(false);
      expect(mockCacheStore['1_2'].exercises).toEqual(cacheEntry.exercises); // Data preserved
      expect(mockCacheStore['1_2'].metadata.cleanupReason).toBe('test_cleanup');
    });

    it('should handle non-existent cache entry gracefully', async () => {
      await cacheManager.cleanup('1_2', mockCacheStore, mockSetCacheStore);
      expect(mockSetCacheStore).not.toHaveBeenCalled();
    });
  });

  describe('exists', () => {
    it('should return true for existing cache entry', async () => {
      mockCacheStore['1_2'] = { workoutLogId: 'test' };
      const exists = await cacheManager.exists('1_2', mockCacheStore);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent cache entry', async () => {
      const exists = await cacheManager.exists('1_2', mockCacheStore);
      expect(exists).toBe(false);
    });

    it('should return false for null cache entry', async () => {
      mockCacheStore['1_2'] = null;
      const exists = await cacheManager.exists('1_2', mockCacheStore);
      expect(exists).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all cache entries', async () => {
      mockCacheStore = { '1_2': {}, '2_3': {} };

      await cacheManager.clear(mockSetCacheStore);

      expect(mockSetCacheStore).toHaveBeenCalledWith({});
    });
  });

  describe('getStats', () => {
    it('should return correct cache statistics', () => {
      mockCacheStore = {
        '1_2': {
          workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
          isValid: true
        },
        '2_3': {
          workoutLogId: null,
          isValid: false
        },
        '3_4': {
          workoutLogId: '456e7890-e89b-12d3-a456-426614174001',
          isValid: true
        }
      };

      const stats = cacheManager.getStats(mockCacheStore);

      expect(stats.totalEntries).toBe(3);
      expect(stats.validEntries).toBe(2);
      expect(stats.invalidEntries).toBe(1);
      expect(stats.entriesWithWorkoutLogId).toBe(2);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
      expect(stats.keys).toEqual(['1_2', '2_3', '3_4']);
    });

    it('should handle empty cache store', () => {
      const stats = cacheManager.getStats({});

      expect(stats.totalEntries).toBe(0);
      expect(stats.validEntries).toBe(0);
      expect(stats.invalidEntries).toBe(0);
      expect(stats.entriesWithWorkoutLogId).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  });
});

describe('CacheLoggingUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('logOperation', () => {
    it('should log with correct format and level', () => {
      CacheLoggingUtils.logOperation('TEST', 'info', 'Test message', { key: 'test' });

      expect(console.log).toHaveBeenCalledWith(
        '✅ CACHE TEST: Test message',
        expect.objectContaining({
          operation: 'TEST',
          message: 'Test message',
          key: 'test',
          timestamp: expect.any(String)
        })
      );
    });

    it('should use appropriate console method for error level', () => {
      CacheLoggingUtils.logOperation('TEST', 'error', 'Error message');
      expect(console.error).toHaveBeenCalled();
    });

    it('should use appropriate console method for warn level', () => {
      CacheLoggingUtils.logOperation('TEST', 'warn', 'Warning message');
      expect(console.warn).toHaveBeenCalled();
    });

    it('should use appropriate console method for debug level', () => {
      CacheLoggingUtils.logOperation('TEST', 'debug', 'Debug message');
      expect(console.debug).toHaveBeenCalled();
    });
  });

  describe('logCacheHit', () => {
    it('should log cache hit with correct format', () => {
      CacheLoggingUtils.logCacheHit('1_2', { workoutLogId: 'test-id' });

      expect(console.log).toHaveBeenCalledWith(
        '✅ CACHE HIT: Found valid cached workout log ID',
        expect.objectContaining({
          operation: 'HIT',
          key: '1_2',
          cacheSource: 'programLogs',
          validationPassed: true,
          workoutLogId: 'test-id'
        })
      );
    });
  });

  describe('logCacheMiss', () => {
    it('should log cache miss with correct format', () => {
      CacheLoggingUtils.logCacheMiss('1_2');

      expect(console.debug).toHaveBeenCalledWith(
        '🔍 CACHE MISS: No cached workout log ID found',
        expect.objectContaining({
          operation: 'MISS',
          key: '1_2',
          cacheSource: 'programLogs',
          reason: 'key_not_found'
        })
      );
    });
  });

  describe('logValidationFailure', () => {
    it('should log validation failure with correct format', () => {
      CacheLoggingUtils.logValidationFailure('1_2', 'Invalid UUID');

      expect(console.error).toHaveBeenCalledWith(
        '❌ CACHE VALIDATION_FAILED: Cache validation failed',
        expect.objectContaining({
          operation: 'VALIDATION_FAILED',
          key: '1_2',
          reason: 'Invalid UUID',
          validationResult: false
        })
      );
    });
  });

  describe('logCleanup', () => {
    it('should log cleanup with correct format', () => {
      CacheLoggingUtils.logCleanup('1_2', 'Invalid structure');

      expect(console.log).toHaveBeenCalledWith(
        '✅ CACHE CLEANUP: Removing invalid cache entry',
        expect.objectContaining({
          operation: 'CLEANUP',
          key: '1_2',
          reason: 'Invalid structure'
        })
      );
    });
  });
});