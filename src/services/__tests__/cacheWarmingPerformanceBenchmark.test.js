/**
 * Tests for Cache Warming Performance Benchmark Service
 */

import CacheWarmingPerformanceBenchmark from '../cacheWarmingPerformanceBenchmark';

// Mock dependencies
jest.mock('../../api/supabaseCache', () => ({
  getCacheStats: jest.fn()
}));

jest.mock('../../utils/performanceMonitor', () => ({
  performanceMonitor: {
    trackUserInteraction: jest.fn(),
    trackError: jest.fn()
  }
}));

// Mock performance API
const mockPerformance = {
  now: jest.fn(),
  memory: {
    usedJSHeapSize: 50 * 1024 * 1024, // 50MB
    totalJSHeapSize: 100 * 1024 * 1024, // 100MB
    jsHeapSizeLimit: 2 * 1024 * 1024 * 1024 // 2GB
  }
};

// Set up global performance mock
Object.defineProperty(global, 'performance', {
  value: mockPerformance,
  writable: true
});

describe('CacheWarmingPerformanceBenchmark', () => {
  let benchmark;
  let mockGetCacheStats;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset performance.now mock
    let timeCounter = 1000;
    mockPerformance.now.mockImplementation(() => timeCounter += 100);

    // Setup cache stats mock
    const { getCacheStats } = require('../../api/supabaseCache');
    mockGetCacheStats = getCacheStats;
    mockGetCacheStats.mockResolvedValue({
      cachePerformance: {
        readReductionRate: '65%'
      },
      totalReads: 1000,
      cachedReads: 650,
      cacheSize: 1024
    });

    benchmark = new CacheWarmingPerformanceBenchmark({
      benchmarkInterval: 100, // Fast interval for testing
      memoryTrackingInterval: 50,
      maxBenchmarkHistory: 10
    });
  });

  afterEach(() => {
    if (benchmark) {
      benchmark.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const defaultBenchmark = new CacheWarmingPerformanceBenchmark();
      
      expect(defaultBenchmark.config.benchmarkInterval).toBe(30000);
      expect(defaultBenchmark.config.memoryTrackingInterval).toBe(5000);
      expect(defaultBenchmark.config.maxBenchmarkHistory).toBe(100);
      expect(defaultBenchmark.isTracking).toBe(false);
    });

    test('should initialize with custom configuration', () => {
      const customBenchmark = new CacheWarmingPerformanceBenchmark({
        benchmarkInterval: 5000,
        memoryTrackingInterval: 1000,
        maxBenchmarkHistory: 50,
        performanceThresholds: {
          warmingSpeed: 1000,
          memoryUsage: 100 * 1024 * 1024
        }
      });

      expect(customBenchmark.config.benchmarkInterval).toBe(5000);
      expect(customBenchmark.config.memoryTrackingInterval).toBe(1000);
      expect(customBenchmark.config.maxBenchmarkHistory).toBe(50);
      expect(customBenchmark.config.performanceThresholds.warmingSpeed).toBe(1000);
    });

    test('should initialize metrics with default values', () => {
      expect(benchmark.metrics.warmingSpeed.current).toBe(0);
      expect(benchmark.metrics.warmingSpeed.min).toBe(Infinity);
      expect(benchmark.metrics.memoryUsage.current).toBe(0);
      expect(benchmark.metrics.cacheHitRate.improvement).toBe(0);
    });
  });

  describe('Baseline Establishment', () => {
    test('should establish performance baseline', async () => {
      await benchmark.establishBaseline();

      expect(benchmark.performanceBaseline).toBeDefined();
      expect(benchmark.performanceBaseline.timestamp).toBeGreaterThan(0);
      expect(benchmark.performanceBaseline.cacheStats).toBeDefined();
      expect(benchmark.performanceBaseline.memoryUsage).toBeDefined();
      expect(benchmark.performanceBaseline.warmingSpeed).toBeGreaterThan(0);
    });

    test('should update baseline metrics', async () => {
      await benchmark.establishBaseline();

      expect(benchmark.metrics.memoryUsage.baseline).toBe(50 * 1024 * 1024); // From mock
      expect(benchmark.metrics.cacheHitRate.before).toBe(65); // From mock
    });

    test('should handle baseline establishment errors', async () => {
      mockGetCacheStats.mockRejectedValue(new Error('Cache stats error'));

      await expect(benchmark.establishBaseline()).rejects.toThrow('Cache stats error');
    });
  });

  describe('Memory Tracking', () => {
    test('should capture memory snapshots', () => {
      benchmark.captureMemorySnapshot();

      expect(benchmark.memorySnapshots).toHaveLength(1);
      expect(benchmark.memorySnapshots[0].timestamp).toBeGreaterThan(0);
      expect(benchmark.memorySnapshots[0].usedJSHeapSize).toBe(50 * 1024 * 1024);
    });

    test('should update memory metrics from snapshots', () => {
      benchmark.captureMemorySnapshot();

      expect(benchmark.metrics.memoryUsage.current).toBe(50 * 1024 * 1024);
      expect(benchmark.metrics.memoryUsage.peak).toBe(50 * 1024 * 1024);
    });

    test('should limit memory snapshots to 1000', () => {
      // Add 1001 snapshots
      for (let i = 0; i < 1001; i++) {
        benchmark.captureMemorySnapshot();
      }

      expect(benchmark.memorySnapshots).toHaveLength(1000);
    });

    test('should calculate memory trends', () => {
      // Add snapshots with increasing memory usage
      for (let i = 0; i < 20; i++) {
        mockPerformance.memory.usedJSHeapSize = (50 + i * 2) * 1024 * 1024;
        benchmark.captureMemorySnapshot();
      }

      expect(benchmark.metrics.memoryUsage.trend).toBe('increasing');
    });
  });

  describe('Cache Statistics', () => {
    test('should get cache statistics', async () => {
      const stats = await benchmark.getCacheStatistics();

      expect(stats.hitRate).toBe(65);
      expect(stats.totalReads).toBe(1000);
      expect(stats.cachedReads).toBe(650);
      expect(stats.lastUpdated).toBeGreaterThan(0);
    });

    test('should handle cache statistics errors', async () => {
      mockGetCacheStats.mockRejectedValue(new Error('Stats error'));

      const stats = await benchmark.getCacheStatistics();

      expect(stats.hitRate).toBe(0);
      expect(stats.totalReads).toBe(0);
    });

    test('should calculate cache hit improvement', async () => {
      // Establish baseline
      await benchmark.establishBaseline();

      // Mock improved cache stats
      mockGetCacheStats.mockResolvedValue({
        cachePerformance: { readReductionRate: '75%' },
        totalReads: 1000,
        cachedReads: 750
      });

      const currentStats = await benchmark.getCacheStatistics();
      const improvement = benchmark.calculateCacheHitImprovement(currentStats);

      expect(improvement).toBe(10); // 75% - 65% = 10%
      expect(benchmark.metrics.cacheHitRate.improvement).toBe(10);
    });
  });

  describe('Cost Savings Verification', () => {
    test('should verify cost savings', async () => {
      const cacheStats = {
        cachedReads: 1000,
        totalReads: 1500
      };

      const costSavings = await benchmark.verifyCostSavings(cacheStats);

      expect(costSavings.readsSaved).toBe(1000);
      expect(costSavings.daily).toBe(0.1); // 1000 * 0.0001
      expect(costSavings.monthly).toBe(3); // 0.1 * 30
      expect(costSavings.annual).toBe(36.5); // 0.1 * 365
      expect(costSavings.verified).toBe(true); // Above default threshold
    });

    test('should handle cost savings calculation errors', async () => {
      const costSavings = await benchmark.verifyCostSavings({});

      expect(costSavings.daily).toBe(0);
      expect(costSavings.verified).toBe(false);
    });
  });

  describe('Performance Thresholds', () => {
    test('should check performance thresholds', () => {
      const isWithinThresholds = benchmark.checkPerformanceThresholds(
        1500, // warming speed (below 2000ms threshold)
        40 * 1024 * 1024, // memory usage (below 50MB threshold)
        5 // hit rate improvement (positive)
      );

      expect(isWithinThresholds).toBe(true);
    });

    test('should detect threshold violations', () => {
      const isWithinThresholds = benchmark.checkPerformanceThresholds(
        3000, // warming speed (above 2000ms threshold)
        60 * 1024 * 1024, // memory usage (above 50MB threshold)
        -5 // hit rate improvement (negative)
      );

      expect(isWithinThresholds).toBe(false);
    });
  });

  describe('Performance Regression Detection', () => {
    test('should detect performance regression', async () => {
      // Establish baseline
      await benchmark.establishBaseline();

      // Add several good benchmarks
      for (let i = 0; i < 5; i++) {
        benchmark.storeBenchmark({
          warmingSpeed: 1000,
          memoryUsage: 40 * 1024 * 1024,
          timestamp: Date.now() + i * 1000
        });
      }

      // Test with significantly worse performance
      const hasRegression = benchmark.detectPerformanceRegression(
        2500, // 2.5x slower than recent average
        80 * 1024 * 1024 // 2x more memory than recent average
      );

      expect(hasRegression).toBe(true);
    });

    test('should not detect regression with insufficient data', () => {
      const hasRegression = benchmark.detectPerformanceRegression(5000, 100 * 1024 * 1024);
      expect(hasRegression).toBe(false);
    });
  });

  describe('Benchmark Measurement', () => {
    test('should perform comprehensive benchmark measurement', async () => {
      await benchmark.establishBaseline();
      
      const benchmarkResult = await benchmark.performBenchmarkMeasurement();

      expect(benchmarkResult).toBeDefined();
      expect(benchmarkResult.id).toBeDefined();
      expect(benchmarkResult.timestamp).toBeGreaterThan(0);
      expect(benchmarkResult.warmingSpeed).toBeGreaterThan(0);
      expect(benchmarkResult.memoryUsage).toBe(50 * 1024 * 1024); // From mock
      expect(benchmarkResult.cacheStats).toBeDefined();
      expect(benchmarkResult.performance).toBeDefined();
    });

    test('should store benchmark results', async () => {
      await benchmark.establishBaseline();
      await benchmark.performBenchmarkMeasurement();

      expect(benchmark.benchmarkHistory).toHaveLength(1);
      expect(benchmark.currentBenchmark).toBeDefined();
    });

    test('should enforce benchmark history limit', async () => {
      await benchmark.establishBaseline();

      // Add more benchmarks than the limit
      for (let i = 0; i < 15; i++) {
        await benchmark.performBenchmarkMeasurement();
      }

      expect(benchmark.benchmarkHistory).toHaveLength(10); // maxBenchmarkHistory
    });
  });

  describe('Real-time Tracking', () => {
    test('should start and stop benchmarking', () => {
      expect(benchmark.isTracking).toBe(false);

      benchmark.startBenchmarking();
      expect(benchmark.isTracking).toBe(true);

      benchmark.stopBenchmarking();
      expect(benchmark.isTracking).toBe(false);
    });

    test('should not start benchmarking if already running', () => {
      benchmark.startBenchmarking();
      const firstTrackingInterval = benchmark.trackingInterval;

      benchmark.startBenchmarking(); // Try to start again
      expect(benchmark.trackingInterval).toBe(firstTrackingInterval);
    });

    test('should clear intervals when stopping', () => {
      benchmark.startBenchmarking();
      const trackingInterval = benchmark.trackingInterval;
      const memoryInterval = benchmark.memoryTrackingInterval;

      benchmark.stopBenchmarking();

      expect(benchmark.trackingInterval).toBeNull();
      expect(benchmark.memoryTrackingInterval).toBeNull();
    });
  });

  describe('Performance Report', () => {
    test('should generate comprehensive performance report', async () => {
      await benchmark.establishBaseline();
      await benchmark.performBenchmarkMeasurement();

      const report = benchmark.getPerformanceReport();

      expect(report.summary).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.baseline).toBeDefined();
      expect(report.currentBenchmark).toBeDefined();
      expect(report.thresholds).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    test('should generate performance recommendations', async () => {
      // Set up poor performance scenario
      benchmark.metrics.warmingSpeed.current = 5000; // Above threshold
      benchmark.metrics.memoryUsage.current = 100 * 1024 * 1024; // Above threshold
      benchmark.metrics.cacheHitRate.improvement = -5; // Below threshold
      benchmark.metrics.costSavings.verified = false;

      const recommendations = benchmark.generatePerformanceRecommendations();

      expect(recommendations).toHaveLength(4);
      expect(recommendations.some(r => r.type === 'performance')).toBe(true);
      expect(recommendations.some(r => r.type === 'memory')).toBe(true);
      expect(recommendations.some(r => r.type === 'cache')).toBe(true);
      expect(recommendations.some(r => r.type === 'cost')).toBe(true);
    });
  });

  describe('Data Export', () => {
    test('should export benchmark data as JSON', async () => {
      await benchmark.establishBaseline();
      await benchmark.performBenchmarkMeasurement();

      const jsonData = benchmark.exportBenchmarkData('json');
      const parsed = JSON.parse(jsonData);

      expect(parsed.exportTimestamp).toBeDefined();
      expect(parsed.config).toBeDefined();
      expect(parsed.metrics).toBeDefined();
      expect(parsed.baseline).toBeDefined();
      expect(parsed.benchmarkHistory).toBeDefined();
    });

    test('should export benchmark data as CSV', async () => {
      await benchmark.establishBaseline();
      await benchmark.performBenchmarkMeasurement();

      const csvData = benchmark.exportBenchmarkData('csv');
      const lines = csvData.split('\n');

      expect(lines[0]).toContain('timestamp,warmingSpeed,memoryUsage');
      expect(lines).toHaveLength(2); // Header + 1 data row
    });
  });

  describe('Utility Functions', () => {
    test('should format bytes correctly', () => {
      expect(benchmark.formatBytes(0)).toBe('0 B');
      expect(benchmark.formatBytes(1024)).toBe('1 KB');
      expect(benchmark.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(benchmark.formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    test('should generate unique benchmark IDs', () => {
      const id1 = benchmark.generateBenchmarkId();
      const id2 = benchmark.generateBenchmarkId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^benchmark_\d+_[a-z0-9]+$/);
    });
  });

  describe('Cleanup', () => {
    test('should reset benchmark data', () => {
      benchmark.benchmarkHistory = [{ id: 'test' }];
      benchmark.memorySnapshots = [{ timestamp: Date.now() }];
      benchmark.performanceBaseline = { timestamp: Date.now() };

      benchmark.resetBenchmarkData();

      expect(benchmark.benchmarkHistory).toHaveLength(0);
      expect(benchmark.memorySnapshots).toHaveLength(0);
      expect(benchmark.performanceBaseline).toBeNull();
    });

    test('should cleanup all resources', () => {
      benchmark.startBenchmarking();
      benchmark.benchmarkHistory = [{ id: 'test' }];

      benchmark.cleanup();

      expect(benchmark.isTracking).toBe(false);
      expect(benchmark.benchmarkHistory).toHaveLength(0);
      expect(benchmark.trackingInterval).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should handle measurement errors gracefully', async () => {
      // Mock getCacheStats to reject after baseline is established
      await benchmark.establishBaseline();
      mockGetCacheStats.mockRejectedValue(new Error('Measurement error'));

      const result = await benchmark.performBenchmarkMeasurement();

      expect(result).toBeNull();
    });

    test('should handle memory tracking without performance.memory', () => {
      delete global.performance.memory;

      const memoryUsage = benchmark.getCurrentMemoryUsage();
      expect(memoryUsage).toBe(0);

      benchmark.captureMemorySnapshot();
      expect(benchmark.memorySnapshots[0].usedJSHeapSize).toBe(0);
    });
  });
});