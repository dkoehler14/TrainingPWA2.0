/**
 * Comprehensive Unit Tests for WorkoutLogCacheManager
 * 
 * Tests cache operations, validation, cleanup, error handling, and performance
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
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
    
    // Reset supabase mocks
    const { __mocks } = require('../config/supabase.js');
    __mocks.mockSingle.mockReset();
    __mocks.mockEq.mockReset();
    __mocks.mockSelect.mockReset();
    __mocks.mockFrom.mockReset();
  });
  describe('Cache Key Generation', () => {
    it('should generate valid cache key from week and day indices', () => {
      const key = cacheManager.generateKey(1, 2);
      expect(key).toBe('1_2');
      expect(key).toMatch(/^\d+_\d+$/);
    });

    it('should generate cache key with prefix', () => {
      const key = cacheManager.generateKey(1, 2, 'test');
      expect(key).toBe('test_1_2');
    });

    it('should throw error for invalid indices', () => {
      expect(() => cacheManager.generateKey('invalid', 2)).toThrow();
      expect(() => cacheManager.generateKey(1, 'invalid')).toThrow();
      expect(() => cacheManager.generateKey(null, 2)).toThrow();
      expect(() => cacheManager.generateKey(1, undefined)).toThrow();
    });

    it('should handle edge case indices', () => {
      expect(cacheManager.generateKey(0, 0)).toBe('0_0');
      expect(cacheManager.generateKey(999, 999)).toBe('999_999');
      expect(cacheManager.generateKey(-1, -1)).toBe('-1_-1');
    });
  });

  describe('Cache Get Operations', () => {
    it('should return null for invalid cache key format', async () => {
      const invalidKeys = ['invalid_key', '1', 'a_b', '1_2_3', '', null, undefined];
      
      for (const key of invalidKeys) {
        const result = await cacheManager.get(key, mockCacheStore);
        expect(result).toBeNull();
      }
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
      const { __mocks } = require('../config/supabase.js');
      __mocks.mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });
      __mocks.mockEq.mockReturnValue({ single: __mocks.mockSingle });
      __mocks.mockSelect.mockReturnValue({ eq: __mocks.mockEq });
      __mocks.mockFrom.mockReturnValue({ select: __mocks.mockSelect });

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

    it('should handle stale cache entries', async () => {
      const staleCacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = staleCacheEntry;

      const result = await cacheManager.get('1_2', mockCacheStore, {
        maxCacheAge: 60 * 60 * 1000 // 1 hour max age
      });

      expect(result).toBeNull();
    });
  });
    describe('Cache Set Operations', () => {
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

    it('should add metadata to cache entries', async () => {
      const cacheValue = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      await cacheManager.set('1_2', cacheValue, mockCacheStore, mockSetCacheStore, {
        source: 'test_source'
      });

      expect(mockCacheStore['1_2'].cacheInfo.source).toBe('test_source');
      expect(mockCacheStore['1_2'].cacheInfo.lastSaved).toBeDefined();
    });
  });  
describe('Cache Validation', () => {
    it('should validate valid UUID', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const result = await cacheManager.validate('1_2', validUUID);

      expect(result.isValid).toBe(true);
      expect(result.reason).toBe('Validation successful');
    });

    it('should reject invalid UUID formats', async () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '123e4567-e89b-12d3-a456', // Too short
        '123e4567-e89b-12d3-a456-426614174000-extra', // Too long
        '123g4567-e89b-12d3-a456-426614174000', // Invalid character
        '', // Empty string
        null,
        undefined
      ];

      for (const uuid of invalidUUIDs) {
        const result = await cacheManager.validate('1_2', uuid);
        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('Invalid UUID format');
      }
    });

    it('should validate against database when requested', async () => {
      const { __mocks } = require('../config/supabase.js');
      __mocks.mockSingle.mockResolvedValue({ 
        data: { id: '123e4567-e89b-12d3-a456-426614174000' }, 
        error: null 
      });
      __mocks.mockEq.mockReturnValue({ single: __mocks.mockSingle });
      __mocks.mockSelect.mockReturnValue({ eq: __mocks.mockEq });
      __mocks.mockFrom.mockReturnValue({ select: __mocks.mockSelect });

      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const result = await cacheManager.validate('1_2', validUUID, { 
        validateInDatabase: true 
      });

      expect(result.isValid).toBe(true);
    });

    it('should reject UUID not found in database', async () => {
      const { __mocks } = require('../config/supabase.js');
      __mocks.mockSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } });
      __mocks.mockEq.mockReturnValue({ single: __mocks.mockSingle });
      __mocks.mockSelect.mockReturnValue({ eq: __mocks.mockEq });
      __mocks.mockFrom.mockReturnValue({ select: __mocks.mockSelect });

      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      const result = await cacheManager.validate('1_2', validUUID, { 
        validateInDatabase: true 
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Workout log not found in database');
    });

    it('should handle database connection errors', async () => {
      // Mock the entire supabase chain to throw an error
      const mockError = new Error('Database connection failed');
      const { __mocks } = require('../config/supabase.js');
      
      // Make the single() method throw the error
      __mocks.mockSingle.mockRejectedValue(mockError);
      __mocks.mockEq.mockReturnValue({ single: __mocks.mockSingle });
      __mocks.mockSelect.mockReturnValue({ eq: __mocks.mockEq });
      __mocks.mockFrom.mockReturnValue({ select: __mocks.mockSelect });

      const validUUID = '123e4567-e89b-12d3-a456-426614174000';
      
      // The validateWorkoutLogInDatabase function catches all errors and returns false,
      // so the validate method interprets this as "not found in database"
      const result = await cacheManager.validate('1_2', validUUID, { 
        validateInDatabase: true 
      });

      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('Workout log not found in database');
      expect(result.context.databaseChecked).toBe(true);
    });
  });  describe('Cache Invalidation', () => {
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

    it('should preserve original data during invalidation', async () => {
      const originalExercises = [
        {
          exerciseId: 'exercise_1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
      ];

      const cacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: originalExercises,
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = cacheEntry;

      await cacheManager.invalidate('1_2', mockCacheStore, mockSetCacheStore);

      expect(mockCacheStore['1_2'].exercises).toEqual(originalExercises);
      expect(mockCacheStore['1_2'].workoutLogId).toBe('123e4567-e89b-12d3-a456-426614174000');
    });
  }); 
 describe('Cache Cleanup', () => {
    it('should cleanup invalid cache entry while preserving data', async () => {
      const originalExercises = [
        {
          exerciseId: 'exercise_1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
      ];

      const cacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: originalExercises,
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = cacheEntry;

      await cacheManager.cleanup('1_2', mockCacheStore, mockSetCacheStore, {
        reason: 'test_cleanup'
      });

      expect(mockSetCacheStore).toHaveBeenCalled();
      expect(mockCacheStore['1_2'].workoutLogId).toBeNull();
      expect(mockCacheStore['1_2'].isValid).toBe(false);
      expect(mockCacheStore['1_2'].exercises).toEqual(originalExercises);
      expect(mockCacheStore['1_2'].metadata.cleanupReason).toBe('test_cleanup');
    });

    it('should handle non-existent cache entry gracefully', async () => {
      await cacheManager.cleanup('1_2', mockCacheStore, mockSetCacheStore);
      expect(mockSetCacheStore).not.toHaveBeenCalled();
    });

    it('should add cleanup metadata', async () => {
      const cacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false,
        metadata: {
          originalSource: 'user_input'
        }
      };

      mockCacheStore['1_2'] = cacheEntry;

      await cacheManager.cleanup('1_2', mockCacheStore, mockSetCacheStore, {
        reason: 'validation_failed'
      });

      expect(mockCacheStore['1_2'].metadata.cleanupReason).toBe('validation_failed');
      expect(mockCacheStore['1_2'].metadata.cleanedAt).toBeDefined();
      expect(mockCacheStore['1_2'].metadata.originalSource).toBe('user_input');
    });
  });  
describe('Cache Utility Operations', () => {
    it('should check if cache entry exists', async () => {
      mockCacheStore['1_2'] = { workoutLogId: 'test' };
      const exists = await cacheManager.exists('1_2', mockCacheStore);
      expect(exists).toBe(true);

      const notExists = await cacheManager.exists('2_3', mockCacheStore);
      expect(notExists).toBe(false);
    });

    it('should handle null and undefined cache entries', async () => {
      mockCacheStore['1_2'] = null;
      let exists = await cacheManager.exists('1_2', mockCacheStore);
      expect(exists).toBe(false);

      mockCacheStore['1_2'] = undefined;
      exists = await cacheManager.exists('1_2', mockCacheStore);
      expect(exists).toBe(false);
    });

    it('should clear all cache entries', async () => {
      mockCacheStore = { '1_2': {}, '2_3': {} };

      await cacheManager.clear(mockSetCacheStore);

      expect(mockSetCacheStore).toHaveBeenCalledWith({});
    });

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

    it('should handle empty cache store statistics', () => {
      const stats = cacheManager.getStats({});

      expect(stats.totalEntries).toBe(0);
      expect(stats.validEntries).toBe(0);
      expect(stats.invalidEntries).toBe(0);
      expect(stats.entriesWithWorkoutLogId).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.keys).toEqual([]);
    });
  }); 
 describe('Error Scenarios and Edge Cases', () => {
    it('should handle corrupted cache data gracefully', async () => {
      mockCacheStore['1_2'] = 'corrupted_string_data';

      const result = await cacheManager.get('1_2', mockCacheStore);
      expect(result).toBeNull();
    });

    it('should handle circular reference in cache data', async () => {
      const circularRef = { workoutLogId: '123e4567-e89b-12d3-a456-426614174000' };
      circularRef.self = circularRef;
      mockCacheStore['1_2'] = circularRef;

      const result = await cacheManager.get('1_2', mockCacheStore);
      expect(result).toBeNull();
    });

    it('should handle invalid exercise data in cache', async () => {
      const invalidExerciseCacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [
          {
            exerciseId: 'valid_exercise',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          },
          {
            // Invalid exercise - missing required fields
            exerciseId: 'invalid_exercise',
            sets: 'invalid_sets', // Should be number
            reps: 'invalid_reps', // Should be array
          }
        ],
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = invalidExerciseCacheEntry;

      const result = await cacheManager.get('1_2', mockCacheStore);
      expect(result).toBeNull();
    });

    it('should handle concurrent cache operations', async () => {
      const cacheValue = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      // Simulate concurrent set operations
      const promises = Array(10).fill(null).map((_, i) => 
        cacheManager.set(`1_${i}`, cacheValue, mockCacheStore, mockSetCacheStore)
      );

      await Promise.all(promises);

      expect(mockSetCacheStore).toHaveBeenCalledTimes(10);
    });

    it('should handle cache operations with missing setCacheStore function', async () => {
      const cacheValue = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      await expect(
        cacheManager.set('1_2', cacheValue, mockCacheStore, null)
      ).rejects.toThrow();
    });
  });  
  describe('Performance Tests', () => {
    it('should handle rapid cache get operations efficiently', async () => {
      const cacheEntry = {
        workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      };

      mockCacheStore['1_2'] = cacheEntry;

      const startTime = performance.now();
      
      // Perform 1000 get operations
      const promises = Array(1000).fill(null).map(() => 
        cacheManager.get('1_2', mockCacheStore)
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All operations should succeed
      results.forEach(result => {
        expect(result).toEqual(cacheEntry);
      });

      // Should complete within reasonable time (less than 1 second)
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should handle cache validation performance with large datasets', async () => {
      const { __mocks } = require('../config/supabase.js');
      __mocks.mockSingle.mockResolvedValue({ 
        data: { id: '123e4567-e89b-12d3-a456-426614174000' }, 
        error: null 
      });
      __mocks.mockEq.mockReturnValue({ single: __mocks.mockSingle });
      __mocks.mockSelect.mockReturnValue({ eq: __mocks.mockEq });
      __mocks.mockFrom.mockReturnValue({ select: __mocks.mockSelect });

      const startTime = performance.now();

      // Validate 100 UUIDs concurrently
      const promises = Array(100).fill(null).map((_, i) => 
        cacheManager.validate(`1_${i}`, '123e4567-e89b-12d3-a456-426614174000', {
          validateInDatabase: true
        })
      );

      const results = await Promise.all(promises);
      const endTime = performance.now();

      // All validations should succeed
      results.forEach(result => {
        expect(result.isValid).toBe(true);
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should efficiently handle cache cleanup operations', async () => {
      // Create 100 cache entries
      for (let i = 0; i < 100; i++) {
        mockCacheStore[`${i}_1`] = {
          workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
          lastSaved: new Date().toISOString(),
          isValid: true,
          exercises: [],
          isWorkoutFinished: false
        };
      }

      const startTime = performance.now();

      // Cleanup all entries
      const promises = Object.keys(mockCacheStore).map(key => 
        cacheManager.cleanup(key, mockCacheStore, mockSetCacheStore)
      );

      await Promise.all(promises);
      const endTime = performance.now();

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000);
    });

    it('should benchmark cache key generation performance', () => {
      const startTime = performance.now();

      // Generate 10000 cache keys
      const keys = [];
      for (let week = 1; week <= 100; week++) {
        for (let day = 1; day <= 100; day++) {
          keys.push(cacheManager.generateKey(week, day));
        }
      }

      const endTime = performance.now();

      expect(keys).toHaveLength(10000);
      expect(keys[0]).toBe('1_1');
      expect(keys[keys.length - 1]).toBe('100_100');
      
      // Should complete very quickly (less than 100ms)
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle memory usage efficiently with large cache stores', () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Create a large cache store
      const largeCacheStore = {};
      for (let i = 0; i < 1000; i++) {
        largeCacheStore[`${i}_1`] = {
          workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
          lastSaved: new Date().toISOString(),
          isValid: true,
          exercises: Array(10).fill(null).map((_, j) => ({
            exerciseId: `exercise_${j}`,
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          })),
          isWorkoutFinished: false
        };
      }

      const stats = cacheManager.getStats(largeCacheStore);
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      expect(stats.totalEntries).toBe(1000);
      expect(stats.validEntries).toBe(1000);
      
      // Memory increase should be reasonable (less than 50MB for this test)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });  
  describe('Cache Validation Logic', () => {
    it('should validate exercise data structure thoroughly', async () => {
      const testCases = [
        {
          name: 'valid exercise',
          exercise: {
            exerciseId: 'test_exercise',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          },
          expected: true
        },
        {
          name: 'missing exerciseId',
          exercise: {
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          },
          expected: false
        },
        {
          name: 'invalid sets type',
          exercise: {
            exerciseId: 'test_exercise',
            sets: '3', // Should be number
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true]
          },
          expected: false
        },
        {
          name: 'mismatched array lengths',
          exercise: {
            exerciseId: 'test_exercise',
            sets: 3,
            reps: [10, 10], // Length 2, should be 3
            weights: [100, 100, 100],
            completed: [true, true, true]
          },
          expected: false
        },
        {
          name: 'zero sets',
          exercise: {
            exerciseId: 'test_exercise',
            sets: 0,
            reps: [],
            weights: [],
            completed: []
          },
          expected: false
        }
      ];

      for (const testCase of testCases) {
        const cacheEntry = {
          workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
          lastSaved: new Date().toISOString(),
          isValid: true,
          exercises: [testCase.exercise],
          isWorkoutFinished: false
        };

        mockCacheStore['1_2'] = cacheEntry;

        const result = await cacheManager.get('1_2', mockCacheStore);
        
        if (testCase.expected) {
          expect(result).not.toBeNull();
        } else {
          expect(result).toBeNull();
        }
      }
    });

    it('should validate cache structure with various invalid scenarios', async () => {
      const invalidCacheStructures = [
        {
          name: 'missing workoutLogId field',
          cache: {
            lastSaved: new Date().toISOString(),
            isValid: true,
            exercises: [],
            isWorkoutFinished: false
          }
        },
        {
          name: 'invalid workoutLogId type',
          cache: {
            workoutLogId: 123, // Should be string or null
            lastSaved: new Date().toISOString(),
            isValid: true,
            exercises: [],
            isWorkoutFinished: false
          }
        },
        {
          name: 'missing lastSaved field',
          cache: {
            workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
            isValid: true,
            exercises: [],
            isWorkoutFinished: false
          }
        },
        {
          name: 'invalid exercises type',
          cache: {
            workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
            lastSaved: new Date().toISOString(),
            isValid: true,
            exercises: 'not_an_array',
            isWorkoutFinished: false
          }
        },
        {
          name: 'missing isWorkoutFinished field',
          cache: {
            workoutLogId: '123e4567-e89b-12d3-a456-426614174000',
            lastSaved: new Date().toISOString(),
            isValid: true,
            exercises: []
          }
        }
      ];

      for (const testCase of invalidCacheStructures) {
        mockCacheStore['1_2'] = testCase.cache;

        const result = await cacheManager.get('1_2', mockCacheStore);
        expect(result).toBeNull();
      }
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
      CacheLoggingUtils.logValidationFailure('1_2', 'Invalid structure');

      expect(console.error).toHaveBeenCalledWith(
        '❌ CACHE VALIDATION_FAILED: Cache validation failed',
        expect.objectContaining({
          operation: 'VALIDATION_FAILED',
          key: '1_2',
          reason: 'Invalid structure',
          validationResult: false
        })
      );
    });
  });

  describe('logCleanup', () => {
    it('should log cleanup with correct format', () => {
      CacheLoggingUtils.logCleanup('1_2', 'Stale data');

      expect(console.log).toHaveBeenCalledWith(
        '✅ CACHE CLEANUP: Removing invalid cache entry',
        expect.objectContaining({
          operation: 'CLEANUP',
          key: '1_2',
          reason: 'Stale data'
        })
      );
    });
  });

  describe('Enhanced Cache Structure for Change Tracking', () => {
  describe('createEnhancedCacheEntry', () => {
    it('should create enhanced cache entry with all required fields', () => {
      const data = {
        workoutLogId: 'test-id',
        exercises: [{ exerciseId: 'ex1', sets: 3, reps: [10, 10, 10], weights: [100, 100, 100], completed: [true, true, false] }],
        isWorkoutFinished: false
      };

      const options = {
        userId: 'user1',
        programId: 'prog1',
        weekIndex: 1,
        dayIndex: 2,
        source: 'test',
        saveStrategy: 'full-save'
      };

      const enhanced = cacheManager.createEnhancedCacheEntry(data, options);

      expect(enhanced).toMatchObject({
        workoutLogId: 'test-id',
        userId: 'user1',
        programId: 'prog1',
        weekIndex: 1,
        dayIndex: 2,
        exercises: data.exercises,
        metadata: expect.objectContaining({
          isFinished: false,
          isDraft: true
        }),
        cacheInfo: expect.objectContaining({
          source: 'test',
          saveStrategy: 'full-save',
          isValid: true
        }),
        changeTracking: expect.objectContaining({
          hasUnsavedExerciseChanges: false,
          hasUnsavedMetadataChanges: false,
          pendingSaveType: null
        })
      });

      expect(enhanced.cacheInfo.lastSaved).toBeDefined();
      expect(enhanced.cacheInfo.lastExerciseUpdate).toBeDefined();
      expect(enhanced.cacheInfo.lastMetadataUpdate).toBeDefined();
      expect(enhanced.changeTracking.lastUserInput).toBeDefined();
    });

    it('should handle minimal data with defaults', () => {
      const data = {};
      const enhanced = cacheManager.createEnhancedCacheEntry(data);

      expect(enhanced).toMatchObject({
        workoutLogId: null,
        exercises: [],
        metadata: expect.objectContaining({
          name: '',
          isFinished: false,
          isDraft: true,
          weightUnit: 'lbs'
        }),
        cacheInfo: expect.objectContaining({
          isValid: true,
          source: 'cache_manager',
          saveStrategy: 'unknown'
        }),
        changeTracking: expect.objectContaining({
          hasUnsavedExerciseChanges: false,
          hasUnsavedMetadataChanges: false,
          pendingSaveType: null
        })
      });
    });
  });

  describe('updateCacheEntryWithChangeTracking', () => {
    it('should update cache entry for exercise changes', () => {
      const existingEntry = cacheManager.createEnhancedCacheEntry({
        exercises: [{ exerciseId: 'ex1', sets: 3, reps: [10, 10, 10], weights: [100, 100, 100], completed: [true, true, false] }]
      });

      const updates = {
        exercises: [{ exerciseId: 'ex1', sets: 3, reps: [12, 12, 12], weights: [105, 105, 105], completed: [true, true, true] }]
      };

      const updated = cacheManager.updateCacheEntryWithChangeTracking(existingEntry, updates, 'exercise');

      expect(updated.exercises).toEqual(updates.exercises);
      expect(updated.changeTracking.hasUnsavedExerciseChanges).toBe(false);
      expect(updated.changeTracking.pendingSaveType).toBe(null);
      expect(updated.cacheInfo.lastExerciseUpdate).not.toBe(existingEntry.cacheInfo.lastExerciseUpdate);
      expect(updated.cacheInfo.lastMetadataUpdate).toBe(existingEntry.cacheInfo.lastMetadataUpdate);
    });

    it('should update cache entry for metadata changes', () => {
      const existingEntry = cacheManager.createEnhancedCacheEntry({
        metadata: { isFinished: false, notes: '' }
      });

      const updates = {
        metadata: { isFinished: true, notes: 'Great workout!' }
      };

      const updated = cacheManager.updateCacheEntryWithChangeTracking(existingEntry, updates, 'metadata');

      expect(updated.metadata).toEqual(updates.metadata);
      expect(updated.changeTracking.hasUnsavedMetadataChanges).toBe(false);
      expect(updated.changeTracking.pendingSaveType).toBe(null);
      expect(updated.cacheInfo.lastMetadataUpdate).not.toBe(existingEntry.cacheInfo.lastMetadataUpdate);
      expect(updated.cacheInfo.lastExerciseUpdate).toBe(existingEntry.cacheInfo.lastExerciseUpdate);
    });

    it('should update cache entry for both changes', () => {
      const existingEntry = cacheManager.createEnhancedCacheEntry({});

      const updates = {
        exercises: [{ exerciseId: 'ex1', sets: 3, reps: [10, 10, 10], weights: [100, 100, 100], completed: [true, true, false] }],
        metadata: { isFinished: true }
      };

      const updated = cacheManager.updateCacheEntryWithChangeTracking(existingEntry, updates, 'both');

      expect(updated.exercises).toEqual(updates.exercises);
      expect(updated.metadata).toEqual(updates.metadata);
      expect(updated.changeTracking.hasUnsavedExerciseChanges).toBe(false);
      expect(updated.changeTracking.hasUnsavedMetadataChanges).toBe(false);
      expect(updated.changeTracking.pendingSaveType).toBe(null);
      expect(updated.cacheInfo.lastExerciseUpdate).not.toBe(existingEntry.cacheInfo.lastExerciseUpdate);
      expect(updated.cacheInfo.lastMetadataUpdate).not.toBe(existingEntry.cacheInfo.lastMetadataUpdate);
    });
  });

  describe('Enhanced Cache Operations', () => {
    describe('updateCacheAfterExerciseSave', () => {
      it('should update cache after exercise-only save', async () => {
        const key = '1_2';
        const existingEntry = cacheManager.createEnhancedCacheEntry({
          exercises: [{ exerciseId: 'ex1', sets: 3, reps: [10, 10, 10], weights: [100, 100, 100], completed: [true, true, false] }]
        });
        mockCacheStore[key] = existingEntry;

        const updatedExercises = [{ exerciseId: 'ex1', sets: 3, reps: [12, 12, 12], weights: [105, 105, 105], completed: [true, true, true] }];

        await cacheManager.updateCacheAfterExerciseSave(key, updatedExercises, mockCacheStore, mockSetCacheStore);

        expect(mockSetCacheStore).toHaveBeenCalled();
        const updatedEntry = mockCacheStore[key];
        expect(updatedEntry.exercises).toEqual(updatedExercises);
        expect(updatedEntry.cacheInfo.saveStrategy).toBe('exercise-only');
        expect(updatedEntry.changeTracking.hasUnsavedExerciseChanges).toBe(false);
      });

      it('should throw error if cache entry not found', async () => {
        const key = '1_2';
        const updatedExercises = [{ exerciseId: 'ex1', sets: 3, reps: [12, 12, 12], weights: [105, 105, 105], completed: [true, true, true] }];

        await expect(
          cacheManager.updateCacheAfterExerciseSave(key, updatedExercises, mockCacheStore, mockSetCacheStore)
        ).rejects.toThrow('Cache entry not found for exercise update');
      });
    });

    describe('updateCacheAfterMetadataSave', () => {
      it('should update cache after metadata-only save', async () => {
        const key = '1_2';
        const existingEntry = cacheManager.createEnhancedCacheEntry({
          metadata: { isFinished: false, notes: '' }
        });
        mockCacheStore[key] = existingEntry;

        const updatedMetadata = { isFinished: true, notes: 'Great workout!' };

        await cacheManager.updateCacheAfterMetadataSave(key, updatedMetadata, mockCacheStore, mockSetCacheStore);

        expect(mockSetCacheStore).toHaveBeenCalled();
        const updatedEntry = mockCacheStore[key];
        expect(updatedEntry.metadata).toMatchObject(updatedMetadata);
        expect(updatedEntry.cacheInfo.saveStrategy).toBe('metadata-only');
        expect(updatedEntry.changeTracking.hasUnsavedMetadataChanges).toBe(false);
        expect(updatedEntry.isWorkoutFinished).toBe(true);
      });
    });

    describe('Enhanced Cache Statistics', () => {
      it('should provide enhanced statistics with change tracking info', () => {
        // Create various cache entries
        const enhancedEntry1 = cacheManager.createEnhancedCacheEntry({
          workoutLogId: 'id1'
        });
        enhancedEntry1.changeTracking.hasUnsavedExerciseChanges = true;
        enhancedEntry1.cacheInfo.saveStrategy = 'exercise-only';

        const enhancedEntry2 = cacheManager.createEnhancedCacheEntry({
          workoutLogId: 'id2'
        });
        enhancedEntry2.changeTracking.hasUnsavedMetadataChanges = true;
        enhancedEntry2.changeTracking.pendingSaveType = 'metadata-only';
        enhancedEntry2.cacheInfo.saveStrategy = 'metadata-only';

        const legacyEntry = {
          workoutLogId: 'id3',
          exercises: [],
          isWorkoutFinished: false,
          lastSaved: '2023-01-01T00:00:00.000Z',
          isValid: true
        };

        mockCacheStore = {
          '1_1': enhancedEntry1,
          '1_2': enhancedEntry2,
          '1_3': legacyEntry
        };

        const stats = cacheManager.getStats(mockCacheStore);

        expect(stats).toMatchObject({
          totalEntries: 3,
          validEntries: 3,
          entriesWithWorkoutLogId: 3,
          enhancedEntries: 2,
          enhancedPercentage: expect.closeTo(66.67, 1),
          entriesWithUnsavedExerciseChanges: 1,
          entriesWithUnsavedMetadataChanges: 1,
          entriesWithPendingSaves: 1,
          saveStrategyStats: {
            'exercise-only': 1,
            'metadata-only': 1,
            'unknown': 1
          }
        });

        expect(stats.keys).toEqual(['1_1', '1_2', '1_3']);
        expect(stats.lastUpdated).toBeDefined();
      });
    });
  });
});
});