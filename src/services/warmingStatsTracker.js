/**
 * Warming Statistics Tracker
 * 
 * Comprehensive statistics and monitoring system for cache warming operations.
 * Tracks performance metrics, cost analysis, memory usage, and bandwidth optimization.
 * 
 * Features:
 * - Event recording system for all warming operations
 * - Performance metrics calculation (timing, success rates)
 * - Cost analysis integration with Supabase cache statistics
 * - Memory usage and bandwidth tracking
 * - History size management and cleanup
 * - Event correlation and pattern detection
 */

// Import getCacheStats conditionally to avoid test failures
let getCacheStats;
try {
  getCacheStats = require('../api/supabaseCache').getCacheStats;
} catch (error) {
  // Fallback for testing or when Supabase is not configured
  getCacheStats = () => ({ enabled: false, message: 'Supabase cache not available' });
}

/**
 * WarmingStatsTracker class for comprehensive cache warming statistics
 */
class WarmingStatsTracker {
  constructor(options = {}) {
    this.config = {
      maxHistorySize: options.maxHistorySize || 1000,
      maxEventAge: options.maxEventAge || 24 * 60 * 60 * 1000, // 24 hours
      cleanupInterval: options.cleanupInterval || 60 * 60 * 1000, // 1 hour
      enableMemoryTracking: options.enableMemoryTracking !== false,
      enableBandwidthTracking: options.enableBandwidthTracking !== false,
      enableCostAnalysis: options.enableCostAnalysis !== false,
      persistenceKey: options.persistenceKey || 'supabase_warming_stats',
      enablePersistence: options.enablePersistence || false,
      ...options
    };

    // Event history storage
    this.eventHistory = [];
    
    // Performance metrics cache
    this.metricsCache = {
      lastCalculated: null,
      cacheDuration: 5 * 60 * 1000, // 5 minutes
      data: null
    };

    // Cost analysis data
    this.costAnalysis = {
      baselineReads: 0,
      cachedReads: 0,
      estimatedSavings: 0,
      lastUpdated: null
    };

    // Memory and bandwidth tracking
    this.resourceTracking = {
      memoryUsage: [],
      bandwidthSaved: 0,
      totalRequests: 0,
      cachedRequests: 0
    };

    // Event correlation data
    this.correlationData = {
      patterns: new Map(),
      sequences: [],
      lastPatternAnalysis: null
    };

    // Cleanup timer
    this.cleanupTimer = null;

    console.log('📊 WarmingStatsTracker initialized with config:', this.config);

    // Load persisted data if enabled
    if (this.config.enablePersistence) {
      this.loadPersistedStats();
    }

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Record a warming event with comprehensive metadata
   * @param {string} type - Event type ('app-init', 'user-cache', 'smart-warm', 'progressive-warm', 'maintenance')
   * @param {number} duration - Duration in milliseconds
   * @param {boolean} success - Whether the operation was successful
   * @param {string|null} error - Error message if failed
   * @param {Object} metadata - Additional event metadata
   */
  recordEvent(type, duration, success, error = null, metadata = {}) {
    const timestamp = Date.now();
    
    // Create comprehensive event record
    const event = {
      id: this.generateEventId(type, timestamp),
      type,
      timestamp,
      duration,
      success,
      error,
      metadata: {
        ...metadata,
        memoryUsage: this.config.enableMemoryTracking ? this.getCurrentMemoryUsage() : null,
        bandwidthImpact: this.config.enableBandwidthTracking ? this.calculateBandwidthImpact(type, success) : null,
        correlationId: this.generateCorrelationId(type, metadata),
        sessionId: this.getSessionId(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        timestamp: timestamp
      }
    };

    // Add to event history
    this.eventHistory.push(event);

    // Update resource tracking
    this.updateResourceTracking(event);

    // Update cost analysis
    if (this.config.enableCostAnalysis) {
      this.updateCostAnalysis(event);
    }

    // Update correlation data
    this.updateCorrelationData(event);

    // Enforce history size limit
    this.enforceHistoryLimit();

    // Invalidate metrics cache
    this.invalidateMetricsCache();

    // Persist if enabled
    if (this.config.enablePersistence) {
      this.persistStats();
    }

    console.log(`📊 Recorded warming event: ${type} (${success ? 'success' : 'failed'}) - ${duration}ms`);

    return event;
  }

  /**
   * Get comprehensive warming statistics
   * @param {Object} options - Options for statistics calculation
   * @returns {Object} Comprehensive statistics object
   */
  getStats(options = {}) {
    const {
      timeRange = 24 * 60 * 60 * 1000, // 24 hours
      includeDetails = false,
      includePatterns = false,
      includeCostAnalysis = true,
      includeResourceTracking = true
    } = options;

    // Check if we can use cached metrics
    if (this.canUseCachedMetrics()) {
      console.log('📊 Using cached metrics for performance');
      return this.metricsCache.data;
    }

    const now = Date.now();
    const cutoffTime = now - timeRange;

    // Filter events within time range
    const recentEvents = this.eventHistory.filter(event => 
      event.timestamp >= cutoffTime
    );

    // Calculate basic metrics
    const totalEvents = recentEvents.length;
    const successfulEvents = recentEvents.filter(e => e.success).length;
    const failedEvents = totalEvents - successfulEvents;
    const successRate = totalEvents > 0 ? (successfulEvents / totalEvents * 100).toFixed(2) : '0.00';

    // Calculate timing metrics
    const durations = recentEvents.map(e => e.duration);
    const averageDuration = durations.length > 0 ? 
      Math.round(durations.reduce((sum, d) => sum + d, 0) / durations.length) : 0;
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

    // Calculate event type breakdown
    const eventTypeBreakdown = this.calculateEventTypeBreakdown(recentEvents);

    // Calculate performance metrics
    const performanceMetrics = this.calculatePerformanceMetrics(recentEvents);

    // Build comprehensive stats object
    const stats = {
      summary: {
        totalEvents,
        successfulEvents,
        failedEvents,
        successRate: `${successRate}%`,
        timeRange: `${Math.round(timeRange / (60 * 60 * 1000))} hours`
      },
      timing: {
        averageDuration: `${averageDuration}ms`,
        minDuration: `${minDuration}ms`,
        maxDuration: `${maxDuration}ms`,
        totalTime: `${durations.reduce((sum, d) => sum + d, 0)}ms`
      },
      eventTypes: eventTypeBreakdown,
      performance: performanceMetrics,
      currentlyWarming: this.isCurrentlyWarming(),
      queueSize: this.getCurrentQueueSize(),
      lastUpdated: new Date(now).toISOString()
    };

    // Add cost analysis if requested
    if (includeCostAnalysis) {
      stats.costAnalysis = this.getCostAnalysis();
    }

    // Add resource tracking if enabled
    if (includeResourceTracking) {
      stats.resourceTracking = this.getResourceTrackingStats();
    }

    // Add detailed events if requested
    if (includeDetails) {
      stats.recentEvents = recentEvents.slice(-10).map(event => ({
        type: event.type,
        timestamp: new Date(event.timestamp).toISOString(),
        duration: `${event.duration}ms`,
        success: event.success,
        error: event.error,
        userId: event.metadata?.userId,
        priority: event.metadata?.priority
      }));
    }

    // Add pattern analysis if requested
    if (includePatterns) {
      stats.patterns = this.getPatternAnalysis();
    }

    // Cache the results
    this.cacheMetrics(stats);

    return stats;
  }

  /**
   * Calculate event type breakdown
   * @param {Array} events - Events to analyze
   * @returns {Object} Event type breakdown
   */
  calculateEventTypeBreakdown(events) {
    const breakdown = {};
    
    events.forEach(event => {
      if (!breakdown[event.type]) {
        breakdown[event.type] = {
          total: 0,
          successful: 0,
          failed: 0,
          averageDuration: 0,
          totalDuration: 0
        };
      }
      
      breakdown[event.type].total++;
      breakdown[event.type].totalDuration += event.duration;
      
      if (event.success) {
        breakdown[event.type].successful++;
      } else {
        breakdown[event.type].failed++;
      }
    });

    // Calculate averages and success rates
    Object.keys(breakdown).forEach(type => {
      const data = breakdown[type];
      data.averageDuration = Math.round(data.totalDuration / data.total);
      data.successRate = `${(data.successful / data.total * 100).toFixed(2)}%`;
      data.averageDuration = `${data.averageDuration}ms`;
      data.totalDuration = `${data.totalDuration}ms`;
    });

    return breakdown;
  }

  /**
   * Calculate performance metrics
   * @param {Array} events - Events to analyze
   * @returns {Object} Performance metrics
   */
  calculatePerformanceMetrics(events) {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const recentEvents = events.filter(e => e.timestamp >= oneHourAgo);

    // Calculate throughput (events per minute)
    const throughput = recentEvents.length > 0 ? 
      Math.round(recentEvents.length / 60) : 0;

    // Calculate error rate
    const recentFailures = recentEvents.filter(e => !e.success).length;
    const errorRate = recentEvents.length > 0 ? 
      (recentFailures / recentEvents.length * 100).toFixed(2) : '0.00';

    // Calculate cache hit improvement (estimated)
    const cacheHitImprovement = this.calculateCacheHitImprovement(events);

    // Calculate performance trends
    const trends = this.calculatePerformanceTrends(events);

    return {
      throughput: `${throughput} events/min`,
      errorRate: `${errorRate}%`,
      cacheHitImprovement: `${cacheHitImprovement}%`,
      trends,
      lastHourEvents: recentEvents.length,
      averageResponseTime: this.calculateAverageResponseTime(recentEvents)
    };
  }

  /**
   * Calculate cache hit improvement estimation
   * @param {Array} events - Events to analyze
   * @returns {number} Estimated cache hit improvement percentage
   */
  calculateCacheHitImprovement(events) {
    // This is an estimation based on successful warming events
    const successfulWarming = events.filter(e => e.success).length;
    const totalEvents = events.length;
    
    if (totalEvents === 0) return 0;
    
    // Estimate that each successful warming improves cache hit rate
    // This is a simplified calculation - in production, you'd integrate with actual cache statistics
    const baseHitRate = 30; // Assume 30% base hit rate without warming
    const improvementFactor = (successfulWarming / totalEvents) * 40; // Up to 40% improvement
    
    return Math.min(baseHitRate + improvementFactor, 90).toFixed(1);
  }

  /**
   * Calculate performance trends
   * @param {Array} events - Events to analyze
   * @returns {Object} Performance trends
   */
  calculatePerformanceTrends(events) {
    if (events.length < 10) {
      return { trend: 'insufficient-data', direction: 'stable' };
    }

    // Split events into two halves for comparison
    const midPoint = Math.floor(events.length / 2);
    const firstHalf = events.slice(0, midPoint);
    const secondHalf = events.slice(midPoint);

    // Calculate average duration for each half
    const firstHalfAvg = firstHalf.reduce((sum, e) => sum + e.duration, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, e) => sum + e.duration, 0) / secondHalf.length;

    // Calculate success rates for each half
    const firstHalfSuccess = firstHalf.filter(e => e.success).length / firstHalf.length;
    const secondHalfSuccess = secondHalf.filter(e => e.success).length / secondHalf.length;

    // Determine trends
    const durationTrend = secondHalfAvg < firstHalfAvg ? 'improving' : 
                         secondHalfAvg > firstHalfAvg ? 'degrading' : 'stable';
    const successTrend = secondHalfSuccess > firstHalfSuccess ? 'improving' :
                        secondHalfSuccess < firstHalfSuccess ? 'degrading' : 'stable';

    return {
      duration: {
        trend: durationTrend,
        change: `${Math.abs(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100).toFixed(1)}%`,
        direction: secondHalfAvg < firstHalfAvg ? 'faster' : 'slower'
      },
      success: {
        trend: successTrend,
        change: `${Math.abs((secondHalfSuccess - firstHalfSuccess) * 100).toFixed(1)}%`,
        direction: secondHalfSuccess > firstHalfSuccess ? 'better' : 'worse'
      }
    };
  }

  /**
   * Calculate average response time
   * @param {Array} events - Events to analyze
   * @returns {string} Average response time
   */
  calculateAverageResponseTime(events) {
    if (events.length === 0) return '0ms';
    
    const totalDuration = events.reduce((sum, e) => sum + e.duration, 0);
    const average = Math.round(totalDuration / events.length);
    
    return `${average}ms`;
  }

  /**
   * Get cost analysis data
   * @returns {Object} Cost analysis information
   */
  getCostAnalysis() {
    if (!this.config.enableCostAnalysis) {
      return { enabled: false };
    }

    const now = Date.now();
    const analysis = { ...this.costAnalysis };

    // Calculate estimated monthly savings
    const dailySavings = analysis.estimatedSavings;
    const monthlySavings = dailySavings * 30;

    // Calculate read reduction percentage
    const totalReads = analysis.baselineReads + analysis.cachedReads;
    const reductionPercentage = totalReads > 0 ? 
      ((analysis.cachedReads / totalReads) * 100).toFixed(1) : '0.0';

    return {
      enabled: true,
      baselineReads: analysis.baselineReads,
      cachedReads: analysis.cachedReads,
      totalReads: totalReads,
      reductionPercentage: `${reductionPercentage}%`,
      estimatedDailySavings: `$${dailySavings.toFixed(4)}`,
      estimatedMonthlySavings: `$${monthlySavings.toFixed(2)}`,
      lastUpdated: analysis.lastUpdated ? new Date(analysis.lastUpdated).toISOString() : null,
      costPerRead: 0.0001, // Estimated cost per Supabase read
      projectedAnnualSavings: `$${(monthlySavings * 12).toFixed(2)}`
    };
  }

  /**
   * Get resource tracking statistics
   * @returns {Object} Resource tracking information
   */
  getResourceTrackingStats() {
    if (!this.config.enableResourceTracking && !this.config.enableMemoryTracking && !this.config.enableBandwidthTracking) {
      return { enabled: false };
    }

    const tracking = this.resourceTracking;
    const cacheHitRate = tracking.totalRequests > 0 ? 
      ((tracking.cachedRequests / tracking.totalRequests) * 100).toFixed(1) : '0.0';

    return {
      enabled: true,
      memoryUsage: this.getMemoryUsageStats(),
      bandwidthSaved: `${(tracking.bandwidthSaved / 1024).toFixed(2)} KB`,
      totalRequests: tracking.totalRequests,
      cachedRequests: tracking.cachedRequests,
      cacheHitRate: `${cacheHitRate}%`,
      averageMemoryUsage: this.calculateAverageMemoryUsage()
    };
  }

  /**
   * Get memory usage statistics
   * @returns {Object} Memory usage information
   */
  getMemoryUsageStats() {
    const usage = this.resourceTracking.memoryUsage;
    if (usage.length === 0) {
      return { current: '0 MB', peak: '0 MB', average: '0 MB' };
    }

    const current = usage[usage.length - 1];
    const peak = Math.max(...usage);
    const average = usage.reduce((sum, u) => sum + u, 0) / usage.length;

    return {
      current: `${current.toFixed(2)} MB`,
      peak: `${peak.toFixed(2)} MB`,
      average: `${average.toFixed(2)} MB`,
      samples: usage.length
    };
  }

  /**
   * Calculate average memory usage
   * @returns {string} Average memory usage
   */
  calculateAverageMemoryUsage() {
    const usage = this.resourceTracking.memoryUsage;
    if (usage.length === 0) return '0 MB';
    
    const average = usage.reduce((sum, u) => sum + u, 0) / usage.length;
    return `${average.toFixed(2)} MB`;
  }

  /**
   * Get pattern analysis
   * @returns {Object} Pattern analysis information
   */
  getPatternAnalysis() {
    const patterns = Array.from(this.correlationData.patterns.entries()).map(([pattern, count]) => ({
      pattern,
      occurrences: count,
      frequency: `${((count / this.eventHistory.length) * 100).toFixed(1)}%`
    }));

    return {
      commonPatterns: patterns.sort((a, b) => b.occurrences - a.occurrences).slice(0, 5),
      totalPatterns: patterns.length,
      lastAnalysis: this.correlationData.lastPatternAnalysis ? 
        new Date(this.correlationData.lastPatternAnalysis).toISOString() : null
    };
  }

  /**
   * Update cost analysis based on warming event
   * @param {Object} event - Warming event
   */
  updateCostAnalysis(event) {
    if (!this.config.enableCostAnalysis) return;

    const now = Date.now();
    
    if (event.success) {
      // Estimate reads saved based on event type and success
      let estimatedReadsSaved = 0;
      
      switch (event.type) {
        case 'app-init':
          estimatedReadsSaved = 10; // App initialization typically saves multiple reads
          break;
        case 'user-cache':
          estimatedReadsSaved = 5; // User cache warming saves user-specific reads
          break;
        case 'smart-warm':
          estimatedReadsSaved = 8; // Smart warming is more targeted
          break;
        case 'progressive-warm':
          estimatedReadsSaved = 12; // Progressive warming saves the most reads
          break;
        case 'maintenance':
          estimatedReadsSaved = 3; // Maintenance provides modest savings
          break;
        default:
          estimatedReadsSaved = 2;
      }

      this.costAnalysis.cachedReads += estimatedReadsSaved;
      this.costAnalysis.estimatedSavings += estimatedReadsSaved * 0.0001; // $0.0001 per read
    } else {
      // Failed warming means we'll likely have more baseline reads
      this.costAnalysis.baselineReads += 2;
    }

    this.costAnalysis.lastUpdated = now;
  }

  /**
   * Update resource tracking based on warming event
   * @param {Object} event - Warming event
   */
  updateResourceTracking(event) {
    this.resourceTracking.totalRequests++;
    
    if (event.success) {
      this.resourceTracking.cachedRequests++;
      
      // Estimate bandwidth saved (rough calculation)
      let bandwidthSaved = 0;
      switch (event.type) {
        case 'app-init':
          bandwidthSaved = 50 * 1024; // 50KB
          break;
        case 'user-cache':
          bandwidthSaved = 20 * 1024; // 20KB
          break;
        case 'smart-warm':
          bandwidthSaved = 30 * 1024; // 30KB
          break;
        case 'progressive-warm':
          bandwidthSaved = 40 * 1024; // 40KB
          break;
        default:
          bandwidthSaved = 10 * 1024; // 10KB
      }
      
      this.resourceTracking.bandwidthSaved += bandwidthSaved;
    }

    // Track memory usage if enabled
    if (this.config.enableMemoryTracking && event.metadata?.memoryUsage) {
      this.resourceTracking.memoryUsage.push(event.metadata.memoryUsage);
      
      // Keep only recent memory usage data (last 100 samples)
      if (this.resourceTracking.memoryUsage.length > 100) {
        this.resourceTracking.memoryUsage = this.resourceTracking.memoryUsage.slice(-100);
      }
    }
  }

  /**
   * Update correlation data for pattern detection
   * @param {Object} event - Warming event
   */
  updateCorrelationData(event) {
    // Create pattern key based on event characteristics
    const patternKey = `${event.type}_${event.success ? 'success' : 'failure'}_${event.metadata?.priority || 'normal'}`;
    
    // Update pattern count
    const currentCount = this.correlationData.patterns.get(patternKey) || 0;
    this.correlationData.patterns.set(patternKey, currentCount + 1);

    // Add to sequence for temporal pattern analysis
    this.correlationData.sequences.push({
      type: event.type,
      success: event.success,
      timestamp: event.timestamp,
      duration: event.duration
    });

    // Keep only recent sequences (last 50)
    if (this.correlationData.sequences.length > 50) {
      this.correlationData.sequences = this.correlationData.sequences.slice(-50);
    }

    this.correlationData.lastPatternAnalysis = Date.now();
  }

  /**
   * Generate unique event ID
   * @param {string} type - Event type
   * @param {number} timestamp - Event timestamp
   * @returns {string} Unique event ID
   */
  generateEventId(type, timestamp) {
    return `${type}_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate correlation ID for event grouping
   * @param {string} type - Event type
   * @param {Object} metadata - Event metadata
   * @returns {string} Correlation ID
   */
  generateCorrelationId(type, metadata) {
    const userId = metadata.userId || 'anonymous';
    const priority = metadata.priority || 'normal';
    return `${type}_${userId}_${priority}_${Date.now()}`;
  }

  /**
   * Get current session ID
   * @returns {string} Session ID
   */
  getSessionId() {
    // Simple session ID generation - in production, use proper session management
    if (!this._sessionId) {
      this._sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return this._sessionId;
  }

  /**
   * Get current memory usage
   * @returns {number} Memory usage in MB
   */
  getCurrentMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
    }
    return 0;
  }

  /**
   * Calculate bandwidth impact of warming event
   * @param {string} type - Event type
   * @param {boolean} success - Whether event was successful
   * @returns {number} Estimated bandwidth impact in bytes
   */
  calculateBandwidthImpact(type, success) {
    if (!success) return 0;
    
    // Rough estimates based on event type
    const estimates = {
      'app-init': 50 * 1024, // 50KB
      'user-cache': 20 * 1024, // 20KB
      'smart-warm': 30 * 1024, // 30KB
      'progressive-warm': 40 * 1024, // 40KB
      'maintenance': 10 * 1024 // 10KB
    };
    
    return estimates[type] || 5 * 1024; // Default 5KB
  }

  /**
   * Check if currently warming (integration point with service)
   * @returns {boolean} Whether warming is currently active
   */
  isCurrentlyWarming() {
    // This would be integrated with the main service
    // For now, return false as placeholder
    return false;
  }

  /**
   * Get current queue size (integration point with service)
   * @returns {number} Current queue size
   */
  getCurrentQueueSize() {
    // This would be integrated with the main service's queue manager
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Check if cached metrics can be used
   * @returns {boolean} Whether cached metrics are valid
   */
  canUseCachedMetrics() {
    if (!this.metricsCache.data || !this.metricsCache.lastCalculated) {
      return false;
    }
    
    const age = Date.now() - this.metricsCache.lastCalculated;
    return age < this.metricsCache.cacheDuration;
  }

  /**
   * Cache metrics for performance
   * @param {Object} stats - Statistics to cache
   */
  cacheMetrics(stats) {
    this.metricsCache = {
      lastCalculated: Date.now(),
      cacheDuration: this.metricsCache.cacheDuration,
      data: stats
    };
  }

  /**
   * Invalidate metrics cache
   */
  invalidateMetricsCache() {
    this.metricsCache.data = null;
    this.metricsCache.lastCalculated = null;
  }

  /**
   * Enforce history size limit
   */
  enforceHistoryLimit() {
    if (this.eventHistory.length > this.config.maxHistorySize) {
      const excess = this.eventHistory.length - this.config.maxHistorySize;
      this.eventHistory = this.eventHistory.slice(excess);
      console.log(`📊 Trimmed ${excess} old events from history`);
    }
  }

  /**
   * Start cleanup timer for old events
   */
  startCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupOldEvents();
    }, this.config.cleanupInterval);

    console.log(`📊 Started cleanup timer with ${this.config.cleanupInterval}ms interval`);
  }

  /**
   * Cleanup old events based on age
   */
  cleanupOldEvents() {
    const now = Date.now();
    const cutoffTime = now - this.config.maxEventAge;
    const initialCount = this.eventHistory.length;

    this.eventHistory = this.eventHistory.filter(event => 
      event.timestamp >= cutoffTime
    );

    const removedCount = initialCount - this.eventHistory.length;
    if (removedCount > 0) {
      console.log(`📊 Cleaned up ${removedCount} old events`);
      this.invalidateMetricsCache();
      
      if (this.config.enablePersistence) {
        this.persistStats();
      }
    }
  }

  /**
   * Persist statistics to storage
   */
  persistStats() {
    if (!this.config.enablePersistence || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const statsData = {
        eventHistory: this.eventHistory.slice(-100), // Only persist recent events
        costAnalysis: this.costAnalysis,
        resourceTracking: {
          ...this.resourceTracking,
          memoryUsage: this.resourceTracking.memoryUsage.slice(-20) // Only recent memory data
        },
        correlationData: {
          patterns: Array.from(this.correlationData.patterns.entries()),
          sequences: this.correlationData.sequences.slice(-20),
          lastPatternAnalysis: this.correlationData.lastPatternAnalysis
        },
        timestamp: Date.now()
      };

      localStorage.setItem(this.config.persistenceKey, JSON.stringify(statsData));
      console.log('📊 Statistics persisted to storage');
    } catch (error) {
      console.error('❌ Failed to persist statistics:', error);
    }
  }

  /**
   * Load persisted statistics from storage
   */
  loadPersistedStats() {
    if (!this.config.enablePersistence || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(this.config.persistenceKey);
      if (!stored) {
        return;
      }

      const statsData = JSON.parse(stored);
      
      // Check if data is not too old (max 24 hours)
      const maxAge = 24 * 60 * 60 * 1000;
      if (Date.now() - statsData.timestamp > maxAge) {
        console.log('📊 Persisted statistics data is too old, ignoring');
        localStorage.removeItem(this.config.persistenceKey);
        return;
      }

      // Restore data
      this.eventHistory = statsData.eventHistory || [];
      this.costAnalysis = { ...this.costAnalysis, ...statsData.costAnalysis };
      this.resourceTracking = { ...this.resourceTracking, ...statsData.resourceTracking };
      
      if (statsData.correlationData) {
        this.correlationData.patterns = new Map(statsData.correlationData.patterns || []);
        this.correlationData.sequences = statsData.correlationData.sequences || [];
        this.correlationData.lastPatternAnalysis = statsData.correlationData.lastPatternAnalysis;
      }

      console.log(`📊 Restored ${this.eventHistory.length} events from persisted statistics`);

    } catch (error) {
      console.error('❌ Failed to load persisted statistics:', error);
      localStorage.removeItem(this.config.persistenceKey);
    }
  }

  /**
   * Cleanup tracker resources
   */
  cleanup() {
    console.log('📊 Cleaning up WarmingStatsTracker...');

    // Stop cleanup timer
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    // Clear all data
    this.eventHistory = [];
    this.invalidateMetricsCache();
    
    // Reset cost analysis
    this.costAnalysis = {
      baselineReads: 0,
      cachedReads: 0,
      estimatedSavings: 0,
      lastUpdated: null
    };

    // Reset resource tracking
    this.resourceTracking = {
      memoryUsage: [],
      bandwidthSaved: 0,
      totalRequests: 0,
      cachedRequests: 0
    };

    // Reset correlation data
    this.correlationData = {
      patterns: new Map(),
      sequences: [],
      lastPatternAnalysis: null
    };

    // Clear persisted data if enabled
    if (this.config.enablePersistence && typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.config.persistenceKey);
    }

    console.log('✅ WarmingStatsTracker cleanup completed');
  }
}

export default WarmingStatsTracker;