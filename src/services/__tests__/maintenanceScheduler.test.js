/**
 * Tests for enhanced maintenance scheduler functionality
 * Covers automatic scheduling, health monitoring, and maintenance operations
 */

import { jest } from '@jest/globals';
import SupabaseCacheWarmingService from '../supabaseCacheWarmingService.js';
import { getCacheStats } from '../../api/supabaseCache.js';
import { authService } from '../authService.js';

// Mock dependencies
jest.mock('../../api/supabaseCache.js');
jest.mock('../authService.js');

describe('Enhanced Maintenance Scheduler', () => {
  let service;
  let mockUser;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Create fresh service instance
    service = new SupabaseCacheWarmingService({
      maintenanceInterval: 1, // 1 minute for testing
      maxRetries: 2,
      enablePersistence: false
    });

    // Mock user
    mockUser = { id: 'test-user-123' };
    authService.getCurrentUser.mockReturnValue(mockUser);

    // Mock cache stats
    getCacheStats.mockReturnValue({
      hitRate: '75.5',
      missRate: '24.5',
      totalRequests: 1000,
      cacheHits: 755,
      cacheMisses: 245
    });
  });

  afterEach(() => {
    // Clean up service
    if (service) {
      service.cleanup();
    }
  });

  describe('Enhanced Maintenance Scheduler', () => {
    test('should start maintenance schedule with enhanced configuration', () => {
      const scheduler = service.startMaintenanceSchedule(15, {
        maxRetries: 3,
        enableHealthChecks: true,
        quietHours: { start: 23, end: 6 }
      });

      expect(scheduler).toBeDefined();
      expect(scheduler.config.intervalMinutes).toBe(15);
      expect(scheduler.config.maxRetries).toBe(3);
      expect(scheduler.config.quietHours).toEqual({ start: 23, end: 6 });
      expect(service.maintenanceState).toBeDefined();
      expect(service.maintenanceState.isRunning).toBe(false);
    });

    test('should provide scheduler control methods', () => {
      const scheduler = service.startMaintenanceSchedule(10);

      expect(typeof scheduler.stop).toBe('function');
      expect(typeof scheduler.restart).toBe('function');
      expect(typeof scheduler.getStatus).toBe('function');
      expect(typeof scheduler.forceRun).toBe('function');
      expect(typeof scheduler.updateConfig).toBe('function');
    });
  });
});  desc
ribe('Cache Health Monitoring', () => {
    test('should monitor cache health and return comprehensive analysis', async () => {
      const healthResult = await service.monitorCacheHealth();

      expect(healthResult).toBeDefined();
      expect(healthResult.status).toBeDefined();
      expect(healthResult.score).toBeGreaterThanOrEqual(0);
      expect(healthResult.score).toBeLessThanOrEqual(100);
      expect(healthResult.hitRate).toBe(75.5);
      expect(healthResult.recommendations).toBeInstanceOf(Array);
    });

    test('should detect critical health issues', async () => {
      // Mock low hit rate
      getCacheStats.mockReturnValue({
        hitRate: '45.0',
        missRate: '55.0',
        totalRequests: 1000,
        cacheHits: 450,
        cacheMisses: 550
      });

      const healthResult = await service.monitorCacheHealth();

      expect(healthResult.status).toBe('critical');
      expect(healthResult.issues).toContain('Very low cache hit rate: 45%');
      expect(healthResult.recommendations.length).toBeGreaterThan(0);
    });

    test('should calculate health score correctly', () => {
      const score = service.calculateHealthScore({
        hitRate: 80,
        queueHealth: 90,
        warmingHealth: 85
      });

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('Automatic Warming Triggers', () => {
    test('should trigger automatic warming on low hit rate', async () => {
      const mockCacheHealth = {
        status: 'warning',
        hitRate: 65,
        score: 70,
        issues: ['Low cache hit rate: 65%']
      };

      const warmingResult = await service.performAutomaticWarming(mockCacheHealth);

      expect(warmingResult.triggered).toBe(true);
      expect(warmingResult.reason).toContain('Low hit rate: 65%');
      expect(warmingResult.warmingRequests).toHaveLength(1);
    });

    test('should not trigger warming when health is acceptable', async () => {
      const mockCacheHealth = {
        status: 'healthy',
        hitRate: 85,
        score: 90,
        issues: []
      };

      const warmingResult = await service.performAutomaticWarming(mockCacheHealth);

      expect(warmingResult.triggered).toBe(false);
      expect(warmingResult.reason).toContain('Health status acceptable');
    });

    test('should determine appropriate warming strategy', () => {
      const criticalHealth = { status: 'critical', hitRate: 40 };
      const warningHealth = { status: 'warning', hitRate: 65 };
      const healthyHealth = { status: 'healthy', hitRate: 85 };

      expect(service.determineWarmingStrategy(criticalHealth)).toBe('progressive');
      expect(service.determineWarmingStrategy(warningHealth)).toBe('smart');
      expect(service.determineWarmingStrategy(healthyHealth)).toBe('basic');
    });
  });

  describe('Memory Cleanup and Garbage Collection', () => {
    test('should perform memory cleanup operations', async () => {
      // Add some history entries to test cleanup
      service.warmingHistory = new Array(60).fill().map((_, i) => ({
        id: i,
        timestamp: Date.now() - i * 1000,
        type: 'test'
      }));

      const cleanupResult = await service.performMemoryCleanup();

      expect(cleanupResult).toBeDefined();
      expect(cleanupResult.historyCleanup).toBeDefined();
      expect(cleanupResult.historyCleanup.removed).toBeGreaterThan(0);
      expect(service.warmingHistory.length).toBeLessThanOrEqual(service.config.maxHistorySize);
    });

    test('should handle garbage collection when available', async () => {
      // Mock global.gc
      const originalGc = global.gc;
      global.gc = jest.fn();

      const cleanupResult = await service.performMemoryCleanup();

      expect(cleanupResult.memoryOptimization).toBeDefined();
      expect(global.gc).toHaveBeenCalled();

      // Restore original gc
      global.gc = originalGc;
    });
  });

  describe('Performance Optimization', () => {
    test('should perform performance optimization', async () => {
      const optimizationResult = await service.performPerformanceOptimization();

      expect(optimizationResult).toBeDefined();
      expect(optimizationResult.configOptimization).toBeDefined();
      expect(optimizationResult.queueOptimization).toBeDefined();
      expect(optimizationResult.memoryOptimization).toBeDefined();
      expect(optimizationResult.recommendations).toBeInstanceOf(Array);
    });

    test('should generate configuration optimizations based on stats', async () => {
      // Mock low success rate stats
      service.getWarmingStats = jest.fn().mockReturnValue({
        successRate: 75,
        averageDuration: 5000,
        recentFailures: 3
      });

      const configOptimization = await service.optimizeConfiguration();

      expect(configOptimization.optimizations.length).toBeGreaterThan(0);
      expect(configOptimization.optimizations[0].setting).toBe('maxRetries');
    });
  });

  describe('Maintenance Reporting', () => {
    test('should generate comprehensive maintenance report', async () => {
      const mockResults = {
        success: true,
        duration: 5000,
        cacheHealth: {
          status: 'healthy',
          score: 85,
          hitRate: 80,
          issues: [],
          recommendations: []
        },
        automaticWarming: { triggered: false },
        performanceOptimization: { recommendations: [] },
        errors: []
      };

      const report = await service.generateMaintenanceReport(mockResults);

      expect(report).toBeDefined();
      expect(report.timestamp).toBeDefined();
      expect(report.success).toBe(true);
      expect(report.summary).toBeDefined();
      expect(report.details).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.nextActions).toBeInstanceOf(Array);
    });

    test('should consolidate recommendations from multiple sources', () => {
      const mockResults = {
        cacheHealth: {
          recommendations: [
            { action: 'increase-warming-frequency', priority: 'high' },
            { action: 'optimize-intervals', priority: 'low' }
          ]
        },
        performanceOptimization: {
          recommendations: [
            { action: 'scale-queue-capacity', priority: 'medium' },
            { action: 'increase-warming-frequency', priority: 'high' } // Duplicate
          ]
        }
      };

      const consolidated = service.consolidateRecommendations(mockResults);

      expect(consolidated).toHaveLength(3); // Duplicates removed
      expect(consolidated[0].priority).toBe('high'); // Sorted by priority
    });
  });

  describe('Maintenance State Management', () => {
    test('should track maintenance state correctly', () => {
      const scheduler = service.startMaintenanceSchedule(15);
      const status = scheduler.getStatus();

      expect(status.active).toBe(true);
      expect(status.totalRuns).toBe(0);
      expect(status.totalFailures).toBe(0);
      expect(status.config).toBeDefined();
    });

    test('should handle quiet hours correctly', () => {
      service.maintenanceState = {
        config: {
          quietHours: { start: 23, end: 6 }
        }
      };

      // Mock different hours
      const originalDate = Date;
      global.Date = jest.fn(() => ({ getHours: () => 2 })); // 2 AM
      expect(service.isInQuietHours()).toBe(true);

      global.Date = jest.fn(() => ({ getHours: () => 14 })); // 2 PM
      expect(service.isInQuietHours()).toBe(false);

      // Restore original Date
      global.Date = originalDate;
    });

    test('should detect high system load', () => {
      // Mock high queue utilization
      service.getQueueStatus = jest.fn().mockReturnValue({
        totalSize: 85,
        maxConcurrent: 3,
        activeWarming: 3
      });

      service.maintenanceState = {
        consecutiveFailures: 0
      };

      expect(service.isSystemUnderHighLoad()).toBe(true);
    });
  });

  describe('Enhanced Maintenance Execution', () => {
    test('should execute enhanced maintenance successfully', async () => {
      const result = await service.performEnhancedMaintenance();

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.cacheHealth).toBeDefined();
      expect(result.queueMaintenance).toBeDefined();
      expect(result.memoryCleanup).toBeDefined();
      expect(result.automaticWarming).toBeDefined();
      expect(result.performanceOptimization).toBeDefined();
      expect(result.reporting).toBeDefined();
    });

    test('should handle maintenance execution errors gracefully', async () => {
      // Mock an error in cache health monitoring
      service.monitorCacheHealth = jest.fn().mockRejectedValue(new Error('Health monitoring failed'));

      await expect(service.performEnhancedMaintenance()).rejects.toThrow('Health monitoring failed');
    });
  });

  describe('Backward Compatibility', () => {
    test('should maintain backward compatibility with legacy performMaintenance', async () => {
      const result = await service.performMaintenance();

      expect(result).toBeDefined();
      expect(result.cacheStats).toBeDefined();
      expect(result.queueMaintenance).toBeDefined();
      expect(result.historyCleanup).toBeDefined();
      expect(result.maintenanceCompleted).toBe(true);
    });
  });
});