/**
 * Cache Warming Performance Benchmark Service
 * 
 * Provides comprehensive performance benchmarking for cache warming operations.
 * Includes cache warming speed measurements, memory usage monitoring, 
 * cache hit rate improvement tracking, and cost savings verification.
 * 
 * Features:
 * - Real-time performance measurement
 * - Memory usage tracking and analysis
 * - Cache hit rate improvement calculation
 * - Cost savings verification and reporting
 * - Benchmark comparison and trending
 * - Performance regression detection
 */

import { getCacheStats } from '../api/supabaseCache';
import { performanceMonitor } from '../utils/performanceMonitor';

/**
 * Performance Benchmark Manager for Cache Warming
 */
class CacheWarmingPerformanceBenchmark {
  constructor(options = {}) {
    this.config = {
      benchmarkInterval: options.benchmarkInterval || 30000, // 30 seconds
      memoryTrackingInterval: options.memoryTrackingInterval || 5000, // 5 seconds
      maxBenchmarkHistory: options.maxBenchmarkHistory || 100,
      performanceThresholds: {
        warmingSpeed: options.warmingSpeedThreshold || 2000, // 2 seconds max
        memoryUsage: options.memoryUsageThreshold || 50 * 1024 * 1024, // 50MB
        cacheHitImprovement: options.cacheHitThreshold || 60, // 60% minimum
        costSavingsTarget: options.costSavingsTarget || 0.001 // $0.001 daily minimum
      },
      enableRealTimeTracking: options.enableRealTimeTracking !== false,
      enableMemoryProfiling: options.enableMemoryProfiling !== false,
      enableCostAnalysis: options.enableCostAnalysis !== false,
      ...options
    };

    // Benchmark data storage
    this.benchmarkHistory = [];
    this.memorySnapshots = [];
    this.performanceBaseline = null;
    this.currentBenchmark = null;

    // Real-time tracking state
    this.isTracking = false;
    this.trackingInterval = null;
    this.memoryTrackingInterval = null;

    // Performance metrics
    this.metrics = {
      warmingSpeed: {
        current: 0,
        average: 0,
        min: Infinity,
        max: 0,
        trend: 'stable'
      },
      memoryUsage: {
        current: 0,
        peak: 0,
        average: 0,
        baseline: 0,
        trend: 'stable'
      },
      cacheHitRate: {
        before: 0,
        after: 0,
        improvement: 0,
        target: this.config.performanceThresholds.cacheHitImprovement
      },
      costSavings: {
        daily: 0,
        monthly: 0,
        annual: 0,
        verified: false
      }
    };

    console.log('📊 CacheWarmingPerformanceBenchmark initialized with config:', this.config);
  }

  /**
   * Start performance benchmarking
   * Begins real-time tracking of cache warming performance
   */
  startBenchmarking() {
    if (this.isTracking) {
      console.log('📊 Performance benchmarking already running');
      return;
    }

    console.log('🚀 Starting cache warming performance benchmarking...');
    this.isTracking = true;

    // Establish performance baseline
    this.establishBaseline();

    // Start real-time tracking
    if (this.config.enableRealTimeTracking) {
      this.startRealTimeTracking();
    }

    // Start memory profiling
    if (this.config.enableMemoryProfiling) {
      this.startMemoryProfiling();
    }

    console.log('✅ Performance benchmarking started successfully');
  }

  /**
   * Stop performance benchmarking
   */
  stopBenchmarking() {
    if (!this.isTracking) {
      console.log('📊 Performance benchmarking not running');
      return;
    }

    console.log('🛑 Stopping cache warming performance benchmarking...');
    this.isTracking = false;

    // Clear intervals
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    if (this.memoryTrackingInterval) {
      clearInterval(this.memoryTrackingInterval);
      this.memoryTrackingInterval = null;
    }

    console.log('✅ Performance benchmarking stopped');
  }

  /**
   * Establish performance baseline
   * Creates initial measurements for comparison
   */
  async establishBaseline() {
    console.log('📏 Establishing performance baseline...');

    try {
      const baselineStart = performance.now();

      // Get initial cache statistics
      const initialCacheStats = await this.getCacheStatistics();
      
      // Get initial memory usage
      const initialMemory = this.getCurrentMemoryUsage();

      // Perform baseline cache warming test
      const baselineWarmingTime = await this.measureBaselineWarmingSpeed();

      const baselineEnd = performance.now();

      this.performanceBaseline = {
        timestamp: Date.now(),
        establishmentTime: baselineEnd - baselineStart,
        cacheStats: initialCacheStats,
        memoryUsage: initialMemory,
        warmingSpeed: baselineWarmingTime,
        version: '1.0.0'
      };

      // Update metrics baseline
      this.metrics.memoryUsage.baseline = initialMemory;
      this.metrics.cacheHitRate.before = initialCacheStats.hitRate || 0;

      console.log('✅ Performance baseline established:', this.performanceBaseline);

    } catch (error) {
      console.error('❌ Failed to establish performance baseline:', error);
      throw error;
    }
  }

  /**
   * Measure baseline cache warming speed
   * @returns {number} Baseline warming time in milliseconds
   */
  async measureBaselineWarmingSpeed() {
    const testStart = performance.now();

    try {
      // Simulate a standard cache warming operation
      // This would typically call the actual cache warming methods
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate async operation
      
      const testEnd = performance.now();
      const warmingTime = testEnd - testStart;

      console.log(`📏 Baseline warming speed measured: ${warmingTime.toFixed(2)}ms`);
      return warmingTime;

    } catch (error) {
      console.error('❌ Failed to measure baseline warming speed:', error);
      return 0;
    }
  }

  /**
   * Start real-time performance tracking
   */
  startRealTimeTracking() {
    console.log('⏱️ Starting real-time performance tracking...');

    this.trackingInterval = setInterval(async () => {
      await this.performBenchmarkMeasurement();
    }, this.config.benchmarkInterval);
  }

  /**
   * Start memory profiling
   */
  startMemoryProfiling() {
    console.log('🧠 Starting memory profiling...');

    this.memoryTrackingInterval = setInterval(() => {
      this.captureMemorySnapshot();
    }, this.config.memoryTrackingInterval);
  }

  /**
   * Perform comprehensive benchmark measurement
   */
  async performBenchmarkMeasurement() {
    const measurementStart = performance.now();

    try {
      // Measure cache warming speed
      const warmingSpeed = await this.measureCacheWarmingSpeed();

      // Get current memory usage
      const memoryUsage = this.getCurrentMemoryUsage();

      // Get cache statistics
      const cacheStats = await this.getCacheStatistics();

      // Calculate cache hit rate improvement
      const hitRateImprovement = this.calculateCacheHitImprovement(cacheStats);

      // Verify cost savings
      const costSavings = await this.verifyCostSavings(cacheStats);

      const measurementEnd = performance.now();

      // Create benchmark record
      const benchmark = {
        id: this.generateBenchmarkId(),
        timestamp: Date.now(),
        measurementDuration: measurementEnd - measurementStart,
        warmingSpeed,
        memoryUsage,
        cacheStats,
        hitRateImprovement,
        costSavings,
        performance: {
          isWithinThresholds: this.checkPerformanceThresholds(warmingSpeed, memoryUsage, hitRateImprovement),
          regressionDetected: this.detectPerformanceRegression(warmingSpeed, memoryUsage)
        }
      };

      // Store benchmark
      this.storeBenchmark(benchmark);

      // Update current metrics
      this.updateCurrentMetrics(benchmark);

      // Log performance status
      this.logPerformanceStatus(benchmark);

      return benchmark;

    } catch (error) {
      console.error('❌ Benchmark measurement failed:', error);
      return null;
    }
  }

  /**
   * Measure cache warming speed
   * @returns {number} Cache warming speed in milliseconds
   */
  async measureCacheWarmingSpeed() {
    const speedStart = performance.now();

    try {
      // This would integrate with the actual cache warming service
      // For now, we'll simulate the measurement
      await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));
      
      const speedEnd = performance.now();
      const warmingSpeed = speedEnd - speedStart;

      return warmingSpeed;

    } catch (error) {
      console.error('❌ Failed to measure cache warming speed:', error);
      return 0;
    }
  }

  /**
   * Get current memory usage
   * @returns {number} Memory usage in bytes
   */
  getCurrentMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    
    // Fallback estimation
    return 0;
  }

  /**
   * Capture memory snapshot
   */
  captureMemorySnapshot() {
    const snapshot = {
      timestamp: Date.now(),
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0
    };

    if (typeof performance !== 'undefined' && performance.memory) {
      snapshot.usedJSHeapSize = performance.memory.usedJSHeapSize;
      snapshot.totalJSHeapSize = performance.memory.totalJSHeapSize;
      snapshot.jsHeapSizeLimit = performance.memory.jsHeapSizeLimit;
    }

    this.memorySnapshots.push(snapshot);

    // Keep only recent snapshots
    if (this.memorySnapshots.length > 1000) {
      this.memorySnapshots = this.memorySnapshots.slice(-1000);
    }

    // Update memory metrics
    this.updateMemoryMetrics(snapshot);
  }

  /**
   * Update memory metrics
   * @param {Object} snapshot - Memory snapshot
   */
  updateMemoryMetrics(snapshot) {
    const memoryUsage = snapshot.usedJSHeapSize;

    this.metrics.memoryUsage.current = memoryUsage;
    
    if (memoryUsage > this.metrics.memoryUsage.peak) {
      this.metrics.memoryUsage.peak = memoryUsage;
    }

    // Calculate average memory usage
    const recentSnapshots = this.memorySnapshots.slice(-20); // Last 20 snapshots
    const averageMemory = recentSnapshots.reduce((sum, s) => sum + s.usedJSHeapSize, 0) / recentSnapshots.length;
    this.metrics.memoryUsage.average = averageMemory;

    // Determine memory trend
    if (recentSnapshots.length >= 10) {
      const firstHalf = recentSnapshots.slice(0, 10);
      const secondHalf = recentSnapshots.slice(-10);
      
      const firstHalfAvg = firstHalf.reduce((sum, s) => sum + s.usedJSHeapSize, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((sum, s) => sum + s.usedJSHeapSize, 0) / secondHalf.length;
      
      const changePercent = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;
      
      if (changePercent > 5) {
        this.metrics.memoryUsage.trend = 'increasing';
      } else if (changePercent < -5) {
        this.metrics.memoryUsage.trend = 'decreasing';
      } else {
        this.metrics.memoryUsage.trend = 'stable';
      }
    }
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  async getCacheStatistics() {
    try {
      const cacheStats = await getCacheStats();
      
      // Parse hit rate from cache stats
      let hitRate = 0;
      if (cacheStats && cacheStats.cachePerformance && cacheStats.cachePerformance.readReductionRate) {
        hitRate = parseFloat(cacheStats.cachePerformance.readReductionRate.replace('%', ''));
      }

      return {
        hitRate,
        totalReads: cacheStats?.totalReads || 0,
        cachedReads: cacheStats?.cachedReads || 0,
        cacheSize: cacheStats?.cacheSize || 0,
        lastUpdated: Date.now()
      };

    } catch (error) {
      console.error('❌ Failed to get cache statistics:', error);
      return {
        hitRate: 0,
        totalReads: 0,
        cachedReads: 0,
        cacheSize: 0,
        lastUpdated: Date.now()
      };
    }
  }

  /**
   * Calculate cache hit rate improvement
   * @param {Object} currentStats - Current cache statistics
   * @returns {number} Hit rate improvement percentage
   */
  calculateCacheHitImprovement(currentStats) {
    if (!this.performanceBaseline) {
      return 0;
    }

    const baselineHitRate = this.performanceBaseline.cacheStats.hitRate || 0;
    const currentHitRate = currentStats.hitRate || 0;
    
    const improvement = currentHitRate - baselineHitRate;
    
    // Update metrics
    this.metrics.cacheHitRate.before = baselineHitRate;
    this.metrics.cacheHitRate.after = currentHitRate;
    this.metrics.cacheHitRate.improvement = improvement;

    return improvement;
  }

  /**
   * Verify cost savings from cache warming
   * @param {Object} cacheStats - Current cache statistics
   * @returns {Object} Cost savings analysis
   */
  async verifyCostSavings(cacheStats) {
    try {
      // Calculate reads saved through caching
      const readsSaved = cacheStats.cachedReads || 0;
      
      // Estimate cost per read (Supabase pricing)
      const costPerRead = 0.0001; // $0.0001 per read (estimated)
      
      // Calculate daily savings
      const dailySavings = readsSaved * costPerRead;
      const monthlySavings = dailySavings * 30;
      const annualSavings = dailySavings * 365;

      // Verify against target
      const verified = dailySavings >= this.config.performanceThresholds.costSavingsTarget;

      const costSavings = {
        readsSaved,
        costPerRead,
        daily: dailySavings,
        monthly: monthlySavings,
        annual: annualSavings,
        verified,
        target: this.config.performanceThresholds.costSavingsTarget,
        lastCalculated: Date.now()
      };

      // Update metrics
      this.metrics.costSavings = costSavings;

      return costSavings;

    } catch (error) {
      console.error('❌ Failed to verify cost savings:', error);
      return {
        daily: 0,
        monthly: 0,
        annual: 0,
        verified: false,
        lastCalculated: Date.now()
      };
    }
  }

  /**
   * Check if performance is within thresholds
   * @param {number} warmingSpeed - Cache warming speed
   * @param {number} memoryUsage - Memory usage
   * @param {number} hitRateImprovement - Cache hit rate improvement
   * @returns {boolean} Whether performance is within thresholds
   */
  checkPerformanceThresholds(warmingSpeed, memoryUsage, hitRateImprovement) {
    const thresholds = this.config.performanceThresholds;
    
    const speedOk = warmingSpeed <= thresholds.warmingSpeed;
    const memoryOk = memoryUsage <= thresholds.memoryUsage;
    const hitRateOk = hitRateImprovement >= 0; // Any improvement is good
    
    return speedOk && memoryOk && hitRateOk;
  }

  /**
   * Detect performance regression
   * @param {number} warmingSpeed - Current warming speed
   * @param {number} memoryUsage - Current memory usage
   * @returns {boolean} Whether regression is detected
   */
  detectPerformanceRegression(warmingSpeed, memoryUsage) {
    if (!this.performanceBaseline || this.benchmarkHistory.length < 5) {
      return false;
    }

    // Get recent benchmarks for comparison
    const recentBenchmarks = this.benchmarkHistory.slice(-5);
    const averageRecentSpeed = recentBenchmarks.reduce((sum, b) => sum + b.warmingSpeed, 0) / recentBenchmarks.length;
    const averageRecentMemory = recentBenchmarks.reduce((sum, b) => sum + b.memoryUsage, 0) / recentBenchmarks.length;

    // Check for significant degradation (>20% worse than recent average)
    const speedRegression = warmingSpeed > averageRecentSpeed * 1.2;
    const memoryRegression = memoryUsage > averageRecentMemory * 1.2;

    return speedRegression || memoryRegression;
  }

  /**
   * Store benchmark result
   * @param {Object} benchmark - Benchmark data
   */
  storeBenchmark(benchmark) {
    this.benchmarkHistory.push(benchmark);

    // Enforce history limit
    if (this.benchmarkHistory.length > this.config.maxBenchmarkHistory) {
      this.benchmarkHistory = this.benchmarkHistory.slice(-this.config.maxBenchmarkHistory);
    }

    // Set as current benchmark
    this.currentBenchmark = benchmark;
  }

  /**
   * Update current metrics
   * @param {Object} benchmark - Benchmark data
   */
  updateCurrentMetrics(benchmark) {
    // Update warming speed metrics
    this.metrics.warmingSpeed.current = benchmark.warmingSpeed;
    
    if (benchmark.warmingSpeed < this.metrics.warmingSpeed.min) {
      this.metrics.warmingSpeed.min = benchmark.warmingSpeed;
    }
    
    if (benchmark.warmingSpeed > this.metrics.warmingSpeed.max) {
      this.metrics.warmingSpeed.max = benchmark.warmingSpeed;
    }

    // Calculate average warming speed
    if (this.benchmarkHistory.length > 0) {
      const totalSpeed = this.benchmarkHistory.reduce((sum, b) => sum + b.warmingSpeed, 0);
      this.metrics.warmingSpeed.average = totalSpeed / this.benchmarkHistory.length;
    }

    // Determine warming speed trend
    if (this.benchmarkHistory.length >= 10) {
      const recent = this.benchmarkHistory.slice(-5);
      const older = this.benchmarkHistory.slice(-10, -5);
      
      const recentAvg = recent.reduce((sum, b) => sum + b.warmingSpeed, 0) / recent.length;
      const olderAvg = older.reduce((sum, b) => sum + b.warmingSpeed, 0) / older.length;
      
      if (recentAvg < olderAvg * 0.9) {
        this.metrics.warmingSpeed.trend = 'improving';
      } else if (recentAvg > olderAvg * 1.1) {
        this.metrics.warmingSpeed.trend = 'degrading';
      } else {
        this.metrics.warmingSpeed.trend = 'stable';
      }
    }
  }

  /**
   * Log performance status
   * @param {Object} benchmark - Benchmark data
   */
  logPerformanceStatus(benchmark) {
    const status = benchmark.performance.isWithinThresholds ? '✅' : '⚠️';
    const regression = benchmark.performance.regressionDetected ? ' 📉 REGRESSION' : '';
    
    console.log(`${status} Performance Benchmark: ${benchmark.warmingSpeed.toFixed(2)}ms warming, ${this.formatBytes(benchmark.memoryUsage)} memory, ${benchmark.hitRateImprovement.toFixed(1)}% hit rate improvement${regression}`);
    
    if (benchmark.performance.regressionDetected) {
      console.warn('⚠️ Performance regression detected! Consider investigating cache warming efficiency.');
    }
  }

  /**
   * Generate unique benchmark ID
   * @returns {string} Unique benchmark ID
   */
  generateBenchmarkId() {
    return `benchmark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Format bytes for display
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted bytes string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Get comprehensive performance report
   * @returns {Object} Performance report
   */
  getPerformanceReport() {
    return {
      summary: {
        isTracking: this.isTracking,
        totalBenchmarks: this.benchmarkHistory.length,
        hasBaseline: !!this.performanceBaseline,
        lastBenchmark: this.currentBenchmark?.timestamp ? new Date(this.currentBenchmark.timestamp).toISOString() : null
      },
      metrics: this.metrics,
      baseline: this.performanceBaseline,
      currentBenchmark: this.currentBenchmark,
      recentBenchmarks: this.benchmarkHistory.slice(-10),
      memoryProfile: {
        snapshots: this.memorySnapshots.length,
        recentSnapshots: this.memorySnapshots.slice(-20)
      },
      thresholds: this.config.performanceThresholds,
      recommendations: this.generatePerformanceRecommendations()
    };
  }

  /**
   * Generate performance recommendations
   * @returns {Array} Performance recommendations
   */
  generatePerformanceRecommendations() {
    const recommendations = [];

    // Check warming speed
    if (this.metrics.warmingSpeed.current > this.config.performanceThresholds.warmingSpeed) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        issue: 'Slow cache warming',
        recommendation: 'Consider optimizing cache warming queries or reducing data volume',
        metric: `Current: ${this.metrics.warmingSpeed.current.toFixed(2)}ms, Threshold: ${this.config.performanceThresholds.warmingSpeed}ms`
      });
    }

    // Check memory usage
    if (this.metrics.memoryUsage.current > this.config.performanceThresholds.memoryUsage) {
      recommendations.push({
        type: 'memory',
        priority: 'medium',
        issue: 'High memory usage',
        recommendation: 'Consider implementing memory cleanup or reducing cache size',
        metric: `Current: ${this.formatBytes(this.metrics.memoryUsage.current)}, Threshold: ${this.formatBytes(this.config.performanceThresholds.memoryUsage)}`
      });
    }

    // Check cache hit improvement
    if (this.metrics.cacheHitRate.improvement < this.config.performanceThresholds.cacheHitImprovement) {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        issue: 'Low cache hit rate improvement',
        recommendation: 'Review cache warming strategy and target more frequently accessed data',
        metric: `Current improvement: ${this.metrics.cacheHitRate.improvement.toFixed(1)}%, Target: ${this.config.performanceThresholds.cacheHitImprovement}%`
      });
    }

    // Check cost savings
    if (!this.metrics.costSavings.verified) {
      recommendations.push({
        type: 'cost',
        priority: 'low',
        issue: 'Cost savings below target',
        recommendation: 'Optimize cache warming to target higher-value data or increase warming frequency',
        metric: `Current daily savings: $${this.metrics.costSavings.daily.toFixed(4)}, Target: $${this.config.performanceThresholds.costSavingsTarget.toFixed(4)}`
      });
    }

    // Check trends
    if (this.metrics.warmingSpeed.trend === 'degrading') {
      recommendations.push({
        type: 'trend',
        priority: 'medium',
        issue: 'Performance degrading over time',
        recommendation: 'Investigate recent changes that may have impacted cache warming performance',
        metric: `Trend: ${this.metrics.warmingSpeed.trend}`
      });
    }

    return recommendations;
  }

  /**
   * Export benchmark data
   * @param {string} format - Export format ('json', 'csv')
   * @returns {string} Exported data
   */
  exportBenchmarkData(format = 'json') {
    const data = {
      exportTimestamp: new Date().toISOString(),
      config: this.config,
      metrics: this.metrics,
      baseline: this.performanceBaseline,
      benchmarkHistory: this.benchmarkHistory,
      memorySnapshots: this.memorySnapshots.slice(-100) // Last 100 snapshots
    };

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else if (format === 'csv') {
      // Convert benchmark history to CSV
      const headers = ['timestamp', 'warmingSpeed', 'memoryUsage', 'hitRateImprovement', 'costSavingsDaily', 'withinThresholds', 'regressionDetected'];
      const rows = this.benchmarkHistory.map(b => [
        new Date(b.timestamp).toISOString(),
        b.warmingSpeed.toFixed(2),
        b.memoryUsage,
        b.hitRateImprovement.toFixed(2),
        b.costSavings.daily.toFixed(6),
        b.performance.isWithinThresholds,
        b.performance.regressionDetected
      ]);

      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }

    return JSON.stringify(data);
  }

  /**
   * Reset benchmark data
   */
  resetBenchmarkData() {
    console.log('🔄 Resetting benchmark data...');

    this.benchmarkHistory = [];
    this.memorySnapshots = [];
    this.performanceBaseline = null;
    this.currentBenchmark = null;

    // Reset metrics
    this.metrics = {
      warmingSpeed: {
        current: 0,
        average: 0,
        min: Infinity,
        max: 0,
        trend: 'stable'
      },
      memoryUsage: {
        current: 0,
        peak: 0,
        average: 0,
        baseline: 0,
        trend: 'stable'
      },
      cacheHitRate: {
        before: 0,
        after: 0,
        improvement: 0,
        target: this.config.performanceThresholds.cacheHitImprovement
      },
      costSavings: {
        daily: 0,
        monthly: 0,
        annual: 0,
        verified: false
      }
    };

    console.log('✅ Benchmark data reset completed');
  }

  /**
   * Cleanup benchmark resources
   */
  cleanup() {
    console.log('🧹 Cleaning up performance benchmark...');

    this.stopBenchmarking();
    this.resetBenchmarkData();

    console.log('✅ Performance benchmark cleanup completed');
  }
}

export default CacheWarmingPerformanceBenchmark;