/**
 * Test suite for Queue Management System
 * Verifies queue management functionality, priority handling, and concurrent request prevention
 */

// Mock the Supabase cache functions
jest.mock('../../api/supabaseCache', () => ({
  warmUserCache: jest.fn().mockResolvedValue({ success: true }),
  warmAppCache: jest.fn().mockResolvedValue({ success: true }),
  getCacheStats: jest.fn().mockReturnValue({ hitRate: '75%' })
}));

// Mock the auth service
jest.mock('../authService', () => ({
  authService: {
    getCurrentUser: jest.fn().mockReturnValue({ id: 'test-user-123' })
  }
}));

import supabaseCacheWarmingService from '../supabaseCacheWarmingService';

describe('Queue Management System', () => {
  let service;

  beforeEach(() => {
    // Get a fresh instance for each test
    service = supabaseCacheWarmingService;
    service.cleanup(); // Reset state
    
    // Create new instance with test configuration
    service.config = {
      maxRetries: 2,
      retryDelays: [100, 200],
      queueConfig: {
        maxQueueSize: 10,
        maxConcurrentWarming: 2,
        queueProcessingInterval: 50,
        enablePersistence: false
      }
    };
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('Queue Management', () => {
    test('should add items to queue with correct priority', () => {
      const userId1 = 'user-1';
      const userId2 = 'user-2';
      const userId3 = 'user-3';

      // Add items with different priorities
      const result1 = service.queueManager.addToQueue(userId1, 'high');
      const result2 = service.queueManager.addToQueue(userId2, 'normal');
      const result3 = service.queueManager.addToQueue(userId3, 'low');

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);

      const status = service.queueManager.getQueueStatus();
      expect(status.totalSize).toBe(3);
      expect(status.queueSizes.high).toBe(1);
      expect(status.queueSizes.normal).toBe(1);
      expect(status.queueSizes.low).toBe(1);
    });

    test('should prevent duplicate queue entries', () => {
      const userId = 'duplicate-user';

      // Add same user twice
      const result1 = service.queueManager.addToQueue(userId, 'high');
      const result2 = service.queueManager.addToQueue(userId, 'normal');

      expect(result1).toBe(true);
      expect(result2).toBe(false); // Should be prevented

      const status = service.queueManager.getQueueStatus();
      expect(status.totalSize).toBe(1);
      expect(status.stats.duplicatesPrevented).toBe(1);
    });

    test('should check if user is in queue', () => {
      const userId = 'test-user';
      
      expect(service.isUserInWarmingQueue(userId)).toBe(false);
      
      service.queueManager.addToQueue(userId, 'normal');
      
      expect(service.isUserInWarmingQueue(userId)).toBe(true);
    });

    test('should remove user from queue', () => {
      const userId = 'removable-user';
      
      service.queueManager.addToQueue(userId, 'normal');
      expect(service.isUserInWarmingQueue(userId)).toBe(true);
      
      const removed = service.removeUserFromWarmingQueue(userId);
      expect(removed).toBe(true);
      expect(service.isUserInWarmingQueue(userId)).toBe(false);
    });

    test('should clear queue by priority', () => {
      service.queueManager.addToQueue('user-1', 'high');
      service.queueManager.addToQueue('user-2', 'normal');
      service.queueManager.addToQueue('user-3', 'low');

      expect(service.queueManager.getTotalQueueSize()).toBe(3);

      service.clearWarmingQueue('high');
      expect(service.queueManager.getTotalQueueSize()).toBe(2);
      expect(service.queueManager.queues.high.length).toBe(0);

      service.clearWarmingQueue('all');
      expect(service.queueManager.getTotalQueueSize()).toBe(0);
    });
  });

  describe('Service Integration', () => {
    test('should integrate with warmUserCacheWithRetry', async () => {
      const userId = 'integration-user';
      
      const result = await service.warmUserCacheWithRetry(userId, 'high');
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Queued for processing');
      expect(result.userId).toBe(userId);
      expect(result.priority).toBe('high');
    });

    test('should integrate with smartWarmCache', async () => {
      const userId = 'smart-user';
      const context = { pageName: 'LogWorkout' };
      
      const result = await service.smartWarmCache(userId, context);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Queued for smart processing');
      expect(result.userId).toBe(userId);
      expect(result.contextAnalysis).toBeDefined();
    });

    test('should integrate with progressiveWarmCache', async () => {
      const userId = 'progressive-user';
      
      const result = await service.progressiveWarmCache(userId);
      
      expect(result.success).toBe(true);
      expect(result.message).toBe('Queued for progressive processing');
      expect(result.userId).toBe(userId);
      expect(result.phaseConfig).toBeDefined();
    });

    test('should provide queue status in warming stats', () => {
      service.queueManager.addToQueue('user-1', 'high');
      service.queueManager.addToQueue('user-2', 'normal');
      
      const stats = service.getWarmingStats();
      
      expect(stats.queueStatus).toBeDefined();
      expect(stats.queueStatus.totalSize).toBe(2);
      expect(stats.queueStatus.queueSizes.high).toBe(1);
      expect(stats.queueStatus.queueSizes.normal).toBe(1);
    });

    test('should handle queue maintenance', async () => {
      service.queueManager.addToQueue('user-1', 'normal');
      
      const maintenanceResult = await service.performQueueMaintenance();
      
      expect(maintenanceResult.maintenanceCompleted).toBe(true);
      expect(maintenanceResult.queueStatus).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid priority gracefully', () => {
      const userId = 'invalid-priority-user';
      
      const result = service.queueManager.addToQueue(userId, 'invalid');
      
      expect(result).toBe(true); // Should default to 'normal'
      const status = service.queueManager.getQueueStatus();
      expect(status.queueSizes.normal).toBe(1);
    });

    test('should handle empty userId', () => {
      const result = service.queueManager.addToQueue('', 'normal');
      
      expect(result).toBe(false);
    });

    test('should handle null userId', () => {
      const result = service.queueManager.addToQueue(null, 'normal');
      
      expect(result).toBe(false);
    });
  });

  describe('Queue Processing', () => {
    test('should track active warming', () => {
      const userId = 'active-user';
      
      expect(service.isUserBeingWarmed(userId)).toBe(false);
      
      service.queueManager.activeWarming.add(userId);
      expect(service.isUserBeingWarmed(userId)).toBe(true);
      
      service.queueManager.activeWarming.delete(userId);
      expect(service.isUserBeingWarmed(userId)).toBe(false);
    });
  });
});