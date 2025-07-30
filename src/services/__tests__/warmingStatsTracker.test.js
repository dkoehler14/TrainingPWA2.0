/**
 * Tests for WarmingStatsTracker
 */

import WarmingStatsTracker from '../warmingStatsTracker';

describe('WarmingStatsTracker', () => {
  let statsTracker;

  beforeEach(() => {
    statsTracker = new WarmingStatsTracker({
      maxHistorySize: 10,
      enablePersistence: false,
      enableMemoryTracking: true,
      enableBandwidthTracking: true,
      enableCostAnalysis: true
    });
  });

  afterEach(() => {
    if (statsTracker) {
      statsTracker.cleanup();
    }
  });

  describe('Event Recording', () => {
    test('should record warming events with comprehensive metadata', () => {
      const event = statsTracker.recordEvent(
        'user-cache',
        1500,
        true,
        null,
        { userId: 'test-user', priority: 'high' }
      );

      expect(event).toBeDefined();
      expect(event.type).toBe('user-cache');
      expect(event.duration).toBe(1500);
      expect(event.success).toBe(true);
      expect(event.metadata.userId).toBe('test-user');
      expect(event.metadata.priority).toBe('high');
    });

    test('should record failed events with error information', () => {
      const event = statsTracker.recordEvent(
        'app-init',
        2000,
        false,
        'Connection timeout',
        { retryAttempt: 2 }
      );

      expect(event.success).toBe(false);
      expect(event.error).toBe('Connection timeout');
      expect(event.metadata.retryAttempt).toBe(2);
    });

    test('should enforce history size limit', () => {
      // Record more events than the limit
      for (let i = 0; i < 15; i++) {
        statsTracker.recordEvent('test-event', 100, true, null, { index: i });
      }

      expect(statsTracker.eventHistory.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Statistics Calculation', () => {
    beforeEach(() => {
      // Record some test events
      statsTracker.recordEvent('user-cache', 1000, true, null, { userId: 'user1' });
      statsTracker.recordEvent('user-cache', 1500, true, null, { userId: 'user2' });
      statsTracker.recordEvent('app-init', 2000, false, 'Error', {});
      statsTracker.recordEvent('smart-warm', 800, true, null, { priority: 'high' });
    });

    test('should calculate basic statistics correctly', () => {
      const stats = statsTracker.getStats();

      expect(stats.summary.totalEvents).toBe(4);
      expect(stats.summary.successfulEvents).toBe(3);
      expect(stats.summary.failedEvents).toBe(1);
      expect(stats.summary.successRate).toBe('75.00%');
    });

    test('should calculate timing metrics', () => {
      const stats = statsTracker.getStats();

      expect(stats.timing).toBeDefined();
      expect(stats.timing.averageDuration).toBeDefined();
      expect(stats.timing.minDuration).toBeDefined();
      expect(stats.timing.maxDuration).toBeDefined();
    });

    test('should provide event type breakdown', () => {
      const stats = statsTracker.getStats();

      expect(stats.eventTypes).toBeDefined();
      expect(stats.eventTypes['user-cache']).toBeDefined();
      expect(stats.eventTypes['user-cache'].total).toBe(2);
      expect(stats.eventTypes['user-cache'].successful).toBe(2);
      expect(stats.eventTypes['app-init']).toBeDefined();
      expect(stats.eventTypes['app-init'].failed).toBe(1);
    });

    test('should calculate performance metrics', () => {
      const stats = statsTracker.getStats();

      expect(stats.performance).toBeDefined();
      expect(stats.performance.throughput).toBeDefined();
      expect(stats.performance.errorRate).toBeDefined();
    });
  });

  describe('Cost Analysis', () => {
    test('should track cost savings when enabled', () => {
      // Record successful events to generate cost savings
      statsTracker.recordEvent('user-cache', 1000, true, null, { userId: 'user1' });
      statsTracker.recordEvent('smart-warm', 1200, true, null, { priority: 'high' });

      const stats = statsTracker.getStats({ includeCostAnalysis: true });

      expect(stats.costAnalysis).toBeDefined();
      expect(stats.costAnalysis.enabled).toBe(true);
      expect(stats.costAnalysis.cachedReads).toBeGreaterThan(0);
      expect(stats.costAnalysis.estimatedDailySavings).toBeDefined();
    });

    test('should handle disabled cost analysis', () => {
      const tracker = new WarmingStatsTracker({ enableCostAnalysis: false });
      const stats = tracker.getStats({ includeCostAnalysis: true });

      expect(stats.costAnalysis.enabled).toBe(false);
      
      tracker.cleanup();
    });
  });

  describe('Resource Tracking', () => {
    test('should track resource usage when enabled', () => {
      statsTracker.recordEvent('user-cache', 1000, true, null, { userId: 'user1' });

      const stats = statsTracker.getStats({ includeResourceTracking: true });

      expect(stats.resourceTracking).toBeDefined();
      expect(stats.resourceTracking.enabled).toBe(true);
      expect(stats.resourceTracking.totalRequests).toBeGreaterThan(0);
    });
  });

  describe('Pattern Analysis', () => {
    test('should detect patterns when requested', () => {
      // Record events with patterns
      for (let i = 0; i < 5; i++) {
        statsTracker.recordEvent('user-cache', 1000, true, null, { priority: 'high' });
      }

      const stats = statsTracker.getStats({ includePatterns: true });

      expect(stats.patterns).toBeDefined();
      expect(stats.patterns.commonPatterns).toBeDefined();
      expect(stats.patterns.commonPatterns.length).toBeGreaterThan(0);
    });
  });

  describe('Cleanup', () => {
    test('should cleanup resources properly', () => {
      statsTracker.recordEvent('test', 100, true);
      expect(statsTracker.eventHistory.length).toBe(1);

      statsTracker.cleanup();
      expect(statsTracker.eventHistory.length).toBe(0);
    });
  });
});