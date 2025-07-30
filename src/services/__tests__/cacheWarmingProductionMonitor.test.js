/**
 * Tests for Cache Warming Production Monitor
 */

import CacheWarmingProductionMonitor from '../cacheWarmingProductionMonitor';

// Mock dependencies
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

Object.defineProperty(global, 'performance', {
  value: mockPerformance,
  writable: true
});

// Mock console methods to avoid test output noise
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

describe('CacheWarmingProductionMonitor', () => {
  let monitor;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset performance.now mock
    let timeCounter = 1000;
    mockPerformance.now.mockImplementation(() => timeCounter += 100);

    monitor = new CacheWarmingProductionMonitor({
      healthCheckInterval: 100, // Fast interval for testing
      metricsCollectionInterval: 50,
      patternAnalysisInterval: 200,
      alertThresholds: {
        warmingFailureRate: 10,
        slowWarmingThreshold: 1000,
        memoryUsageThreshold: 100 * 1024 * 1024,
        responseTimeThreshold: 500
      }
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.cleanup();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const defaultMonitor = new CacheWarmingProductionMonitor();
      
      expect(defaultMonitor.config.healthCheckInterval).toBe(60000);
      expect(defaultMonitor.config.metricsCollectionInterval).toBe(30000);
      expect(defaultMonitor.config.enableRealTimeMonitoring).toBe(true);
      expect(defaultMonitor.isMonitoring).toBe(false);
    });

    test('should initialize with custom configuration', () => {
      const customMonitor = new CacheWarmingProductionMonitor({
        healthCheckInterval: 5000,
        enableAlerting: false,
        logLevel: 'debug'
      });

      expect(customMonitor.config.healthCheckInterval).toBe(5000);
      expect(customMonitor.config.enableAlerting).toBe(false);
      expect(customMonitor.config.logLevel).toBe('debug');
    });

    test('should initialize metrics with default values', () => {
      expect(monitor.metrics.performance.totalOperations).toBe(0);
      expect(monitor.metrics.health.status).toBe('unknown');
      expect(monitor.metrics.alerts.totalAlerts).toBe(0);
    });
  });

  describe('Monitoring Lifecycle', () => {
    test('should start monitoring successfully', () => {
      expect(monitor.isMonitoring).toBe(false);

      monitor.startMonitoring();

      expect(monitor.isMonitoring).toBe(true);
      expect(monitor.metrics.health.startTime).toBeGreaterThan(0);
    });

    test('should stop monitoring successfully', () => {
      monitor.startMonitoring();
      expect(monitor.isMonitoring).toBe(true);

      monitor.stopMonitoring();

      expect(monitor.isMonitoring).toBe(false);
      expect(monitor.healthCheckInterval).toBeNull();
      expect(monitor.metricsInterval).toBeNull();
    });

    test('should not start monitoring if already running', () => {
      monitor.startMonitoring();
      const firstStartTime = monitor.metrics.health.startTime;

      monitor.startMonitoring(); // Try to start again

      expect(monitor.metrics.health.startTime).toBe(firstStartTime);
    });

    test('should clear intervals when stopping', () => {
      monitor.startMonitoring();
      const healthInterval = monitor.healthCheckInterval;
      const metricsInterval = monitor.metricsInterval;

      monitor.stopMonitoring();

      expect(monitor.healthCheckInterval).toBeNull();
      expect(monitor.metricsInterval).toBeNull();
    });
  });

  describe('Health Checks', () => {
    test('should perform comprehensive health check', async () => {
      const healthData = await monitor.performHealthCheck();

      expect(healthData).toBeDefined();
      expect(healthData.timestamp).toBeGreaterThan(0);
      expect(healthData.status).toBeDefined();
      expect(healthData.checks).toBeDefined();
      expect(healthData.checks.service).toBeDefined();
      expect(healthData.checks.performance).toBeDefined();
      expect(healthData.checks.memory).toBeDefined();
      expect(healthData.checks.errors).toBeDefined();
    });

    test('should update health metrics after check', async () => {
      // Set start time to ensure uptime calculation
      monitor.metrics.health.startTime = Date.now() - 1000; // 1 second ago
      
      await monitor.performHealthCheck();

      expect(monitor.metrics.health.lastHealthCheck).toBeGreaterThan(0);
      expect(monitor.metrics.health.uptime).toBeGreaterThan(0);
      expect(['healthy', 'degraded', 'unhealthy', 'error']).toContain(monitor.metrics.health.status);
    });

    test('should detect service health issues', async () => {
      // Mock service health check to return warning
      const originalCheckServiceHealth = monitor.checkServiceHealth;
      monitor.checkServiceHealth = jest.fn().mockResolvedValue({
        status: 'warning',
        warning: 'No recent operations detected'
      });

      const healthData = await monitor.performHealthCheck();

      expect(healthData.checks.service.status).toBe('warning');
      expect(healthData.status).toBe('degraded');

      // Restore original method
      monitor.checkServiceHealth = originalCheckServiceHealth;
    });

    test('should handle health check errors', async () => {
      // Mock service health check to throw error
      monitor.checkServiceHealth = jest.fn().mockRejectedValue(new Error('Health check failed'));

      await expect(monitor.performHealthCheck()).rejects.toThrow('Health check failed');
      expect(monitor.metrics.health.consecutiveFailures).toBeGreaterThan(0);
      expect(monitor.metrics.health.status).toBe('error');
    });
  });

  describe('Performance Health Checks', () => {
    test('should check performance health correctly', () => {
      monitor.metrics.performance.averageResponseTime = 300;
      monitor.metrics.performance.lastResponseTime = 250;

      const performanceHealth = monitor.checkPerformanceHealth();

      expect(performanceHealth.status).toBe('healthy');
      expect(performanceHealth.averageResponseTime).toBe(300);
    });

    test('should detect performance warnings', () => {
      monitor.metrics.performance.averageResponseTime = 600; // Above 500ms threshold

      const performanceHealth = monitor.checkPerformanceHealth();

      expect(performanceHealth.status).toBe('warning');
      expect(performanceHealth.warning).toContain('Average response time');
    });

    test('should detect critical performance issues', () => {
      monitor.metrics.performance.lastResponseTime = 1200; // Above 2x threshold

      const performanceHealth = monitor.checkPerformanceHealth();

      expect(performanceHealth.status).toBe('error');
      expect(performanceHealth.error).toContain('critically high');
    });
  });

  describe('Memory Health Checks', () => {
    test('should check memory health correctly', () => {
      const memoryHealth = monitor.checkMemoryHealth();

      expect(memoryHealth.status).toBe('healthy');
      expect(memoryHealth.currentUsage).toBe(50 * 1024 * 1024);
      expect(memoryHealth.threshold).toBe(100 * 1024 * 1024);
    });

    test('should detect memory warnings', () => {
      mockPerformance.memory.usedJSHeapSize = 120 * 1024 * 1024; // Above threshold

      const memoryHealth = monitor.checkMemoryHealth();

      expect(memoryHealth.status).toBe('warning');
      expect(memoryHealth.warning).toContain('Memory usage');
    });

    test('should handle missing performance.memory', () => {
      const originalMemory = mockPerformance.memory;
      delete mockPerformance.memory;

      const memoryHealth = monitor.checkMemoryHealth();

      expect(memoryHealth.status).toBe('healthy');
      expect(memoryHealth.currentUsage).toBe(0);

      // Restore memory
      mockPerformance.memory = originalMemory;
    });
  });

  describe('Error Rate Checks', () => {
    test('should check error rates correctly', () => {
      monitor.metrics.performance.totalOperations = 100;
      monitor.metrics.performance.failedOperations = 5;

      const errorHealth = monitor.checkErrorRates();

      expect(errorHealth.status).toBe('healthy');
      expect(errorHealth.errorRate).toBe(5);
    });

    test('should detect high error rates', () => {
      monitor.metrics.performance.totalOperations = 100;
      monitor.metrics.performance.failedOperations = 15; // 15% error rate
      monitor.config.alertThresholds.errorRateThreshold = 10; // Set threshold to 10%

      const errorHealth = monitor.checkErrorRates();

      expect(errorHealth.status).toBe('warning');
      expect(errorHealth.warning).toContain('Error rate');
    });

    test('should handle zero operations', () => {
      monitor.metrics.performance.totalOperations = 0;
      monitor.metrics.performance.failedOperations = 0;

      const errorHealth = monitor.checkErrorRates();

      expect(errorHealth.status).toBe('healthy');
      expect(errorHealth.errorRate).toBe(0);
    });
  });

  describe('Metrics Collection', () => {
    test('should collect metrics successfully', () => {
      const metricsData = monitor.collectMetrics();

      expect(metricsData).toBeDefined();
      expect(metricsData.timestamp).toBeGreaterThan(0);
      expect(metricsData.performance).toBeDefined();
      expect(metricsData.health).toBeDefined();
      expect(metricsData.memory).toBeDefined();
    });

    test('should handle metrics collection errors', () => {
      // Mock getCurrentMemoryUsage to throw error
      monitor.getCurrentMemoryUsage = jest.fn().mockImplementation(() => {
        throw new Error('Memory error');
      });

      const metricsData = monitor.collectMetrics();

      expect(metricsData).toBeUndefined();
    });
  });

  describe('Pattern Analysis', () => {
    test('should analyze usage patterns', () => {
      const analysisData = monitor.analyzeUsagePatterns();

      expect(analysisData).toBeDefined();
      expect(analysisData.timestamp).toBeGreaterThan(0);
      expect(analysisData.patterns).toBeDefined();
      expect(analysisData.patterns.usage).toBeDefined();
      expect(analysisData.patterns.performance).toBeDefined();
      expect(analysisData.patterns.errors).toBeDefined();
      expect(analysisData.recommendations).toBeDefined();
    });

    test('should analyze usage frequency patterns', () => {
      const usagePatterns = monitor.analyzeUsageFrequency();

      expect(usagePatterns.hourlyUsage).toBeDefined();
      expect(usagePatterns.peakHours).toBeDefined();
      expect(Array.isArray(usagePatterns.peakHours)).toBe(true);
    });

    test('should analyze performance patterns', () => {
      // Add some operation times
      monitor.performanceTracker.operationTimes = [100, 200, 150, 300, 250];

      const performancePatterns = monitor.analyzePerformancePatterns();

      expect(performancePatterns.average).toBeDefined();
      expect(performancePatterns.min).toBe(100);
      expect(performancePatterns.max).toBe(300);
      expect(performancePatterns.trend).toBeDefined();
    });

    test('should handle insufficient performance data', () => {
      monitor.performanceTracker.operationTimes = [];

      const performancePatterns = monitor.analyzePerformancePatterns();

      expect(performancePatterns.trend).toBe('insufficient_data');
    });

    test('should analyze error patterns', () => {
      monitor.metrics.performance.totalOperations = 100;
      monitor.metrics.performance.failedOperations = 10;
      monitor.performanceTracker.errorCounts.set('Network Error', 5);
      monitor.performanceTracker.errorCounts.set('Timeout Error', 3);

      const errorPatterns = monitor.analyzeErrorPatterns();

      expect(errorPatterns.totalErrors).toBe(10);
      expect(errorPatterns.errorRate).toBe(10);
      expect(errorPatterns.commonErrors).toHaveLength(2);
    });
  });

  describe('Alert Management', () => {
    test('should generate alerts successfully', async () => {
      const alert = await monitor.generateAlert('test_alert', 'warning', { test: 'data' });

      expect(alert).toBeDefined();
      expect(alert.type).toBe('test_alert');
      expect(alert.severity).toBe('warning');
      expect(alert.data.test).toBe('data');
      expect(monitor.metrics.alerts.totalAlerts).toBe(1);
    });

    test('should respect alert cooldown periods', async () => {
      await monitor.generateAlert('test_alert', 'warning');
      const secondAlert = await monitor.generateAlert('test_alert', 'warning');

      expect(secondAlert).toBeUndefined();
      expect(monitor.metrics.alerts.totalAlerts).toBe(1);
    });

    test('should register and execute alert handlers', async () => {
      const mockHandler = jest.fn();
      monitor.registerAlertHandler('test_alert', mockHandler);

      await monitor.generateAlert('test_alert', 'warning', { test: 'data' });

      expect(mockHandler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'test_alert',
        severity: 'warning'
      }));
    });

    test('should handle alert handler errors', async () => {
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      monitor.registerAlertHandler('test_alert', errorHandler);

      await monitor.generateAlert('test_alert', 'error');

      expect(errorHandler).toHaveBeenCalled();
      // Should not throw error, just log it
    });

    test('should get correct cooldown periods', () => {
      expect(monitor.getCooldownPeriod('info')).toBe(5 * 60 * 1000);
      expect(monitor.getCooldownPeriod('warning')).toBe(10 * 60 * 1000);
      expect(monitor.getCooldownPeriod('error')).toBe(15 * 60 * 1000);
      expect(monitor.getCooldownPeriod('critical')).toBe(30 * 60 * 1000);
    });
  });

  describe('Operation Tracking', () => {
    test('should track successful operations', () => {
      monitor.trackOperation('cache_warm', 500, true, null, { userId: 'test' });

      expect(monitor.metrics.performance.totalOperations).toBe(1);
      expect(monitor.metrics.performance.successfulOperations).toBe(1);
      expect(monitor.metrics.performance.failedOperations).toBe(0);
      expect(monitor.metrics.performance.lastResponseTime).toBe(500);
    });

    test('should track failed operations', () => {
      const error = new Error('Operation failed');
      monitor.trackOperation('cache_warm', 1000, false, error, { userId: 'test' });

      expect(monitor.metrics.performance.totalOperations).toBe(1);
      expect(monitor.metrics.performance.successfulOperations).toBe(0);
      expect(monitor.metrics.performance.failedOperations).toBe(1);
      expect(monitor.performanceTracker.errorCounts.get('Operation failed')).toBe(1);
    });

    test('should update average response time', () => {
      // Clear any existing operation times
      monitor.performanceTracker.operationTimes = [];
      
      monitor.trackOperation('cache_warm', 400, true);
      monitor.trackOperation('cache_warm', 600, true);

      // Average should be calculated from the operation times array
      expect(monitor.metrics.performance.averageResponseTime).toBeCloseTo(500, 0);
    });

    test('should update peak response time', () => {
      monitor.trackOperation('cache_warm', 300, true);
      monitor.trackOperation('cache_warm', 800, true);
      monitor.trackOperation('cache_warm', 400, true);

      expect(monitor.metrics.performance.peakResponseTime).toBe(800);
    });

    test('should generate alerts for slow operations', async () => {
      monitor.config.enableAlerting = true;
      
      monitor.trackOperation('cache_warm', 1500, true); // Above 1000ms threshold

      expect(monitor.metrics.alerts.totalAlerts).toBe(1);
      expect(monitor.metrics.alerts.activeAlerts[0].type).toBe('slow_operation');
    });
  });

  describe('Optimization Recommendations', () => {
    test('should generate performance recommendations', () => {
      // Set threshold to ensure error rate recommendation is generated
      monitor.config.alertThresholds.errorRateThreshold = 10;
      
      const patterns = {
        performance: { trend: 'degrading' },
        usage: { peakHours: [{ hour: 9, usage: 150 }] },
        errors: { errorRate: 15 } // Above 10% threshold
      };

      const recommendations = monitor.generateOptimizationRecommendations(patterns);

      expect(recommendations).toHaveLength(3);
      expect(recommendations.some(r => r.type === 'performance')).toBe(true);
      expect(recommendations.some(r => r.type === 'optimization')).toBe(true);
      expect(recommendations.some(r => r.type === 'reliability')).toBe(true);
    });

    test('should generate current recommendations', () => {
      monitor.metrics.health.status = 'degraded';
      monitor.metrics.performance.averageResponseTime = 600;
      monitor.metrics.alerts.activeAlerts = new Array(6).fill({});

      const recommendations = monitor.generateCurrentRecommendations();

      expect(recommendations).toHaveLength(3);
      expect(recommendations.some(r => r.type === 'health')).toBe(true);
      expect(recommendations.some(r => r.type === 'performance')).toBe(true);
      expect(recommendations.some(r => r.type === 'alerts')).toBe(true);
    });
  });

  describe('Monitoring Report', () => {
    test('should generate comprehensive monitoring report', () => {
      monitor.startMonitoring();
      monitor.trackOperation('test', 500, true);

      const report = monitor.getMonitoringReport();

      expect(report.status).toBeDefined();
      expect(report.status.isMonitoring).toBe(true);
      expect(report.performance).toBeDefined();
      expect(report.alerts).toBeDefined();
      expect(report.patterns).toBeDefined();
      expect(report.config).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });
  });

  describe('Utility Functions', () => {
    test('should format bytes correctly', () => {
      expect(monitor.formatBytes(0)).toBe('0 B');
      expect(monitor.formatBytes(1024)).toBe('1 KB');
      expect(monitor.formatBytes(1024 * 1024)).toBe('1 MB');
      expect(monitor.formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    });

    test('should get current memory usage', () => {
      const memoryUsage = monitor.getCurrentMemoryUsage();

      expect(memoryUsage.used).toBe(mockPerformance.memory.usedJSHeapSize);
      expect(memoryUsage.total).toBe(mockPerformance.memory.totalJSHeapSize);
      expect(memoryUsage.limit).toBe(mockPerformance.memory.jsHeapSizeLimit);
    });

    test('should handle missing performance.memory in getCurrentMemoryUsage', () => {
      const originalMemory = mockPerformance.memory;
      delete mockPerformance.memory;

      const memoryUsage = monitor.getCurrentMemoryUsage();

      expect(memoryUsage.used).toBe(0);
      expect(memoryUsage.total).toBe(0);
      expect(memoryUsage.limit).toBe(0);

      // Restore memory
      mockPerformance.memory = originalMemory;
    });

    test('should get correct alert emojis', () => {
      expect(monitor.getAlertEmoji('info')).toBe('ℹ️');
      expect(monitor.getAlertEmoji('warning')).toBe('⚠️');
      expect(monitor.getAlertEmoji('error')).toBe('❌');
      expect(monitor.getAlertEmoji('critical')).toBe('🚨');
      expect(monitor.getAlertEmoji('unknown')).toBe('🔔');
    });
  });

  describe('Performance Regression Detection', () => {
    test('should establish regression baseline', () => {
      // Add sufficient operation times
      for (let i = 0; i < 50; i++) {
        monitor.performanceTracker.operationTimes.push(200 + Math.random() * 100);
      }

      const metricsData = { performance: { averageResponseTime: 250 } };
      monitor.checkPerformanceRegression(metricsData);

      expect(monitor.performanceTracker.regressionBaseline).toBeDefined();
      expect(monitor.performanceTracker.regressionBaseline.average).toBeGreaterThan(0);
    });

    test('should detect performance regression', async () => {
      // Establish baseline
      monitor.performanceTracker.regressionBaseline = {
        average: 200,
        timestamp: Date.now()
      };

      monitor.config.enableAlerting = true;

      const metricsData = { performance: { averageResponseTime: 350 } }; // 75% slower
      monitor.checkPerformanceRegression(metricsData);

      expect(monitor.metrics.alerts.totalAlerts).toBe(1);
      expect(monitor.metrics.alerts.activeAlerts[0].type).toBe('performance_regression');
    });
  });

  describe('Structured Logging', () => {
    test('should log structured data when enabled', () => {
      monitor.config.enableStructuredLogging = true;
      const consoleSpy = jest.spyOn(console, 'info'); // Use info instead of log

      monitor.logStructured('info', 'Test message', { test: 'data' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"info"')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test message"')
      );
    });

    test('should not log when structured logging is disabled', () => {
      // Create a fresh monitor with structured logging disabled
      const disabledMonitor = new CacheWarmingProductionMonitor({
        enableStructuredLogging: false
      });
      
      const consoleSpy = jest.spyOn(console, 'info');
      consoleSpy.mockClear(); // Clear any previous calls

      disabledMonitor.logStructured('info', 'Test message', { test: 'data' });

      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('"message":"Test message"')
      );
    });
  });

  describe('Cleanup', () => {
    test('should cleanup all resources', () => {
      monitor.startMonitoring();
      monitor.trackOperation('test', 500, true);
      monitor.metrics.alerts.activeAlerts.push({ id: 'test' });

      monitor.cleanup();

      expect(monitor.isMonitoring).toBe(false);
      expect(monitor.metrics.performance.totalOperations).toBe(0);
      expect(monitor.metrics.alerts.activeAlerts).toHaveLength(0);
      expect(monitor.alertManager.activeAlerts.size).toBe(0);
      expect(monitor.performanceTracker.operationTimes).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle pattern analysis errors', () => {
      // Mock analyzeUsageFrequency to throw error
      monitor.analyzeUsageFrequency = jest.fn().mockImplementation(() => {
        throw new Error('Analysis error');
      });

      const result = monitor.analyzeUsagePatterns();

      expect(result).toBeUndefined();
    });

    test('should handle alert generation when alerting is disabled', async () => {
      monitor.config.enableAlerting = false;

      const alert = await monitor.generateAlert('test_alert', 'warning');

      expect(alert).toBeUndefined();
      expect(monitor.metrics.alerts.totalAlerts).toBe(0);
    });
  });
});