# Supabase Cache Warming Performance Tuning Guide

## Overview

This guide provides detailed instructions for optimizing the performance of the Supabase Cache Warming Service. It covers configuration tuning, monitoring strategies, and best practices for different usage scenarios.

## Performance Metrics

### Key Performance Indicators (KPIs)

1. **Cache Hit Rate**: Percentage of queries served from cache vs. database
2. **Warming Success Rate**: Percentage of successful warming operations
3. **Average Warming Time**: Time taken to complete warming operations
4. **Queue Processing Time**: Time items spend in the warming queue
5. **Memory Usage**: RAM consumed by the cache warming service
6. **Cost Savings**: Estimated savings from reduced database queries

### Target Performance Benchmarks

| Metric | Target | Good | Needs Improvement |
|--------|--------|------|-------------------|
| Cache Hit Rate | >80% | 70-80% | <70% |
| Warming Success Rate | >95% | 90-95% | <90% |
| Average Warming Time | <2s | 2-5s | >5s |
| Queue Processing Time | <1s | 1-3s | >3s |
| Memory Usage | <50MB | 50-100MB | >100MB |
| Error Rate | <2% | 2-5% | >5% |

## Configuration Optimization

### Basic Configuration

```javascript
// Optimized configuration for most applications
const service = new SupabaseCacheWarmingService({
  // Retry configuration - balance between reliability and speed
  maxRetries: 3,
  retryDelays: [1000, 2000, 4000], // 1s, 2s, 4s exponential backoff
  
  // Maintenance settings - adjust based on usage patterns
  maintenanceInterval: 15, // minutes - more frequent for high-traffic apps
  maxHistorySize: 100, // Keep more history for better analytics
  
  // Queue configuration - optimize for throughput
  queueConfig: {
    maxQueueSize: 150, // Increase for high-traffic applications
    maxConcurrentWarming: 4, // Balance between speed and resource usage
    queueProcessingInterval: 300, // ms - faster processing for responsive apps
    enablePersistence: true // Enable for critical applications
  }
});
```

### High-Traffic Application Configuration

```javascript
// Configuration for applications with >1000 daily active users
const highTrafficConfig = {
  maxRetries: 2, // Reduce retries for faster failure handling
  retryDelays: [500, 1500], // Shorter delays for faster recovery
  
  maintenanceInterval: 10, // More frequent maintenance
  maxHistorySize: 200, // More history for better pattern analysis
  
  queueConfig: {
    maxQueueSize: 300, // Large queue for burst traffic
    maxConcurrentWarming: 6, // Higher concurrency
    queueProcessingInterval: 200, // Faster processing
    enablePersistence: true
  },
  
  // Enhanced monitoring for high-traffic scenarios
  statsConfig: {
    enableMemoryTracking: true,
    enableBandwidthTracking: true,
    enableCostAnalysis: true,
    enableDetailedMetrics: true
  },
  
  // Aggressive error handling
  errorHandlerConfig: {
    enableErrorRateMonitoring: true,
    enableDetailedLogging: false, // Reduce log volume
    enableGracefulDegradation: true,
    errorRateThreshold: 0.05 // 5% error rate threshold
  }
};
```

### Low-Resource Environment Configuration

```javascript
// Configuration for resource-constrained environments
const lowResourceConfig = {
  maxRetries: 2,
  retryDelays: [2000, 5000], // Longer delays to reduce load
  
  maintenanceInterval: 30, // Less frequent maintenance
  maxHistorySize: 25, // Smaller history to save memory
  
  queueConfig: {
    maxQueueSize: 50, // Smaller queue
    maxConcurrentWarming: 2, // Lower concurrency
    queueProcessingInterval: 1000, // Slower processing
    enablePersistence: false // Disable to save storage
  },
  
  // Minimal monitoring to save resources
  statsConfig: {
    enableMemoryTracking: false,
    enableBandwidthTracking: false,
    enableCostAnalysis: true, // Keep cost analysis
    enableDetailedMetrics: false
  }
};
```

## Warming Strategy Optimization

### Context-Based Priority Tuning

```javascript
// Custom priority determination for specific use cases
class CustomContextAnalyzer extends ContextAnalyzer {
  static determinePriority(options = {}) {
    const baseAnalysis = super.determinePriority(options);
    
    // Custom business logic adjustments
    const { userPreferences, behaviorPatterns } = options;
    
    // Boost priority for premium users
    if (userPreferences?.isPremium) {
      baseAnalysis.finalPriority = 'high';
      baseAnalysis.priorityScore = Math.min(baseAnalysis.priorityScore + 0.2, 1.0);
    }
    
    // Boost priority for frequent users
    if (behaviorPatterns?.sessionsPerWeek > 10) {
      baseAnalysis.priorityScore = Math.min(baseAnalysis.priorityScore + 0.1, 1.0);
    }
    
    // Reduce priority during maintenance windows
    const hour = new Date().getHours();
    if (hour >= 2 && hour <= 4) { // 2-4 AM maintenance window
      baseAnalysis.finalPriority = 'low';
      baseAnalysis.priorityScore *= 0.5;
    }
    
    return baseAnalysis;
  }
}

// Use custom analyzer
const service = new SupabaseCacheWarmingService();
service.contextAnalyzer = CustomContextAnalyzer;
```

### Progressive Warming Optimization

```javascript
// Optimize progressive warming phases based on data importance
const optimizeProgressiveWarming = async (userId) => {
  const service = SupabaseCacheWarmingService.instance;
  
  // Custom progressive warming with optimized phases
  const phases = [
    {
      name: 'critical',
      delay: 0,
      data: ['recent_workouts', 'active_programs', 'user_preferences'],
      timeout: 2000
    },
    {
      name: 'important',
      delay: 1000, // Reduced delay for important data
      data: ['exercise_history', 'progress_stats', 'achievements'],
      timeout: 3000
    },
    {
      name: 'extended',
      delay: 5000, // Longer delay for less critical data
      data: ['historical_data', 'recommendations', 'social_features'],
      timeout: 5000
    }
  ];
  
  for (const phase of phases) {
    setTimeout(async () => {
      try {
        await Promise.race([
          service.warmSpecificData(userId, phase.data),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Phase timeout')), phase.timeout)
          )
        ]);
        console.log(`✅ Phase ${phase.name} completed`);
      } catch (error) {
        console.warn(`⚠️ Phase ${phase.name} failed:`, error.message);
      }
    }, phase.delay);
  }
};
```

## Monitoring and Analytics

### Performance Monitoring Setup

```javascript
// Comprehensive performance monitoring
class PerformanceMonitor {
  constructor(service) {
    this.service = service;
    this.metrics = {
      warmingTimes: [],
      queueSizes: [],
      errorRates: [],
      memoryUsage: [],
      cacheHitRates: []
    };
    
    this.startMonitoring();
  }
  
  startMonitoring() {
    // Monitor every 30 seconds
    setInterval(() => {
      this.collectMetrics();
    }, 30000);
    
    // Generate reports every 5 minutes
    setInterval(() => {
      this.generateReport();
    }, 5 * 60 * 1000);
  }
  
  collectMetrics() {
    const stats = this.service.getWarmingStats();
    const queueStatus = this.service.queueManager.getQueueStatus();
    
    // Collect warming times
    const recentEvents = stats.recentEvents.slice(-10);
    const avgWarmingTime = recentEvents.reduce((sum, event) => 
      sum + (event.duration || 0), 0) / recentEvents.length;
    
    this.metrics.warmingTimes.push({
      timestamp: Date.now(),
      value: avgWarmingTime
    });
    
    // Collect queue sizes
    this.metrics.queueSizes.push({
      timestamp: Date.now(),
      value: queueStatus.totalSize
    });
    
    // Collect error rates
    const errorRate = (stats.failedEvents / stats.totalEvents) * 100;
    this.metrics.errorRates.push({
      timestamp: Date.now(),
      value: errorRate
    });
    
    // Collect memory usage (if available)
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      this.metrics.memoryUsage.push({
        timestamp: Date.now(),
        value: memUsage.heapUsed / 1024 / 1024 // MB
      });
    }
    
    // Keep only last 100 data points
    Object.keys(this.metrics).forEach(key => {
      if (this.metrics[key].length > 100) {
        this.metrics[key] = this.metrics[key].slice(-100);
      }
    });
  }
  
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      performance: this.analyzePerformance(),
      recommendations: this.generateRecommendations(),
      alerts: this.checkAlerts()
    };
    
    console.log('📊 Performance Report:', report);
    
    // Send to monitoring service if configured
    if (this.monitoringEndpoint) {
      this.sendToMonitoring(report);
    }
  }
  
  analyzePerformance() {
    const recent = (metric) => metric.slice(-20); // Last 20 data points
    
    return {
      avgWarmingTime: this.average(recent(this.metrics.warmingTimes)),
      avgQueueSize: this.average(recent(this.metrics.queueSizes)),
      avgErrorRate: this.average(recent(this.metrics.errorRates)),
      avgMemoryUsage: this.average(recent(this.metrics.memoryUsage)),
      trends: {
        warmingTime: this.calculateTrend(recent(this.metrics.warmingTimes)),
        queueSize: this.calculateTrend(recent(this.metrics.queueSizes)),
        errorRate: this.calculateTrend(recent(this.metrics.errorRates))
      }
    };
  }
  
  generateRecommendations() {
    const recommendations = [];
    const perf = this.analyzePerformance();
    
    // Warming time recommendations
    if (perf.avgWarmingTime > 3000) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'Average warming time is high. Consider increasing maxConcurrentWarming or reducing queue size.',
        action: 'increase_concurrency'
      });
    }
    
    // Queue size recommendations
    if (perf.avgQueueSize > 50) {
      recommendations.push({
        type: 'capacity',
        priority: 'medium',
        message: 'Queue size is consistently high. Consider increasing processing speed or queue capacity.',
        action: 'optimize_queue'
      });
    }
    
    // Error rate recommendations
    if (perf.avgErrorRate > 5) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        message: 'Error rate is above threshold. Check network connectivity and service health.',
        action: 'investigate_errors'
      });
    }
    
    // Memory usage recommendations
    if (perf.avgMemoryUsage > 100) {
      recommendations.push({
        type: 'resource',
        priority: 'medium',
        message: 'Memory usage is high. Consider reducing history size or enabling garbage collection.',
        action: 'optimize_memory'
      });
    }
    
    return recommendations;
  }
  
  checkAlerts() {
    const alerts = [];
    const stats = this.service.getWarmingStats();
    const queueStatus = this.service.queueManager.getQueueStatus();
    
    // Critical error rate
    const errorRate = (stats.failedEvents / stats.totalEvents) * 100;
    if (errorRate > 10) {
      alerts.push({
        level: 'critical',
        message: `Error rate is ${errorRate.toFixed(2)}% (threshold: 10%)`,
        action: 'immediate_investigation_required'
      });
    }
    
    // Queue overflow
    if (queueStatus.totalSize > queueStatus.maxQueueSize * 0.9) {
      alerts.push({
        level: 'warning',
        message: `Queue is near capacity: ${queueStatus.totalSize}/${queueStatus.maxQueueSize}`,
        action: 'increase_queue_capacity'
      });
    }
    
    // Service not responding
    if (!this.service.isStarted) {
      alerts.push({
        level: 'critical',
        message: 'Cache warming service is not started',
        action: 'restart_service'
      });
    }
    
    return alerts;
  }
  
  // Utility methods
  average(dataPoints) {
    if (!dataPoints.length) return 0;
    return dataPoints.reduce((sum, point) => sum + point.value, 0) / dataPoints.length;
  }
  
  calculateTrend(dataPoints) {
    if (dataPoints.length < 2) return 'insufficient_data';
    
    const first = dataPoints[0].value;
    const last = dataPoints[dataPoints.length - 1].value;
    const change = ((last - first) / first) * 100;
    
    if (Math.abs(change) < 5) return 'stable';
    return change > 0 ? 'increasing' : 'decreasing';
  }
}

// Initialize monitoring
const service = SupabaseCacheWarmingService.instance;
const monitor = new PerformanceMonitor(service);
```

### Custom Metrics Dashboard

```javascript
// Create a simple metrics dashboard
const createMetricsDashboard = () => {
  const service = SupabaseCacheWarmingService.instance;
  
  const dashboard = {
    getOverview: () => {
      const stats = service.getWarmingStats();
      const queueStatus = service.queueManager.getQueueStatus();
      
      return {
        status: service.isStarted ? 'running' : 'stopped',
        uptime: Date.now() - service._startTime,
        totalEvents: stats.totalEvents,
        successRate: stats.successRate,
        currentQueue: queueStatus.totalSize,
        activeWarming: queueStatus.activeWarming,
        lastMaintenance: service.lastMaintenanceTime
      };
    },
    
    getPerformanceMetrics: () => {
      const stats = service.getWarmingStats();
      
      return {
        averageWarmingTime: stats.averageDuration,
        cacheHitImprovement: stats.performanceMetrics?.cacheHitImprovement || 'N/A',
        costSavings: stats.costSavings?.estimatedSavings || '$0.00',
        bandwidthSaved: stats.costSavings?.bandwidthSaved || '0MB',
        readReductionRate: stats.costSavings?.readReductionRate || '0%'
      };
    },
    
    getRecentActivity: () => {
      const stats = service.getWarmingStats();
      
      return stats.recentEvents.slice(-10).map(event => ({
        timestamp: new Date(event.timestamp).toLocaleTimeString(),
        type: event.type,
        success: event.success,
        duration: event.duration ? `${event.duration}ms` : 'N/A',
        error: event.error || null
      }));
    },
    
    getQueueStatus: () => {
      return service.queueManager.getQueueStatus();
    }
  };
  
  return dashboard;
};

// Usage example
const dashboard = createMetricsDashboard();
console.log('Dashboard Overview:', dashboard.getOverview());
console.log('Performance Metrics:', dashboard.getPerformanceMetrics());
```

## Optimization Strategies

### 1. Time-Based Optimization

```javascript
// Optimize warming based on time patterns
const timeBasedOptimization = {
  // Peak hours: More aggressive warming
  peakHours: [7, 8, 9, 17, 18, 19, 20], // 7-9 AM, 5-8 PM
  
  // Off-peak hours: Reduced warming
  offPeakHours: [0, 1, 2, 3, 4, 5, 22, 23],
  
  getOptimalConfig: (hour = new Date().getHours()) => {
    if (timeBasedOptimization.peakHours.includes(hour)) {
      return {
        maxConcurrentWarming: 6,
        queueProcessingInterval: 200,
        priority: 'high'
      };
    } else if (timeBasedOptimization.offPeakHours.includes(hour)) {
      return {
        maxConcurrentWarming: 2,
        queueProcessingInterval: 1000,
        priority: 'low'
      };
    } else {
      return {
        maxConcurrentWarming: 4,
        queueProcessingInterval: 500,
        priority: 'normal'
      };
    }
  }
};

// Apply time-based optimization
const applyTimeBasedOptimization = () => {
  const config = timeBasedOptimization.getOptimalConfig();
  const service = SupabaseCacheWarmingService.instance;
  
  // Update queue manager configuration
  service.queueManager.config.maxConcurrentWarming = config.maxConcurrentWarming;
  service.queueManager.config.queueProcessingInterval = config.queueProcessingInterval;
  
  console.log(`⏰ Applied time-based optimization:`, config);
};

// Run optimization every hour
setInterval(applyTimeBasedOptimization, 60 * 60 * 1000);
```

### 2. User Behavior-Based Optimization

```javascript
// Optimize based on user behavior patterns
const behaviorBasedOptimization = {
  analyzeUserBehavior: (userId) => {
    // This would typically come from analytics data
    return {
      averageSessionLength: 25, // minutes
      frequentPages: ['LogWorkout', 'ProgressTracker'],
      peakUsageHours: [7, 18],
      workoutFrequency: 4, // times per week
      lastActiveDate: new Date(),
      preferredFeatures: ['quick-workout', 'progress-tracking']
    };
  },
  
  getOptimalWarmingStrategy: (behavior) => {
    const strategies = [];
    
    // High-frequency users get progressive warming
    if (behavior.workoutFrequency >= 4) {
      strategies.push('progressive');
    }
    
    // Users with long sessions get extended warming
    if (behavior.averageSessionLength > 20) {
      strategies.push('extended');
    }
    
    // Users focused on specific features get targeted warming
    if (behavior.preferredFeatures.length > 0) {
      strategies.push('targeted');
    }
    
    return strategies.length > 0 ? strategies : ['standard'];
  },
  
  optimizeForUser: async (userId) => {
    const behavior = behaviorBasedOptimization.analyzeUserBehavior(userId);
    const strategies = behaviorBasedOptimization.getOptimalWarmingStrategy(behavior);
    const service = SupabaseCacheWarmingService.instance;
    
    const context = {
      currentPage: behavior.frequentPages[0] || 'Home',
      userPreferences: {
        workoutFrequency: behavior.workoutFrequency,
        preferredFeatures: behavior.preferredFeatures
      },
      behaviorPatterns: behavior
    };
    
    // Apply optimal strategy
    if (strategies.includes('progressive')) {
      await service.progressiveWarmCache(userId);
    } else if (strategies.includes('targeted')) {
      await service.smartWarmCache(userId, context);
    } else {
      await service.warmUserCacheWithRetry(userId, 'normal');
    }
    
    console.log(`👤 Applied behavior-based optimization for ${userId}:`, strategies);
  }
};
```

### 3. Resource-Based Optimization

```javascript
// Optimize based on available system resources
const resourceBasedOptimization = {
  getSystemResources: () => {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memory = process.memoryUsage();
      return {
        memoryUsage: memory.heapUsed / memory.heapTotal,
        availableMemory: memory.heapTotal - memory.heapUsed,
        cpuUsage: process.cpuUsage ? process.cpuUsage() : null
      };
    }
    
    // Browser environment - limited resource info
    return {
      memoryUsage: 0.5, // Assume 50% usage
      availableMemory: 100 * 1024 * 1024, // Assume 100MB available
      cpuUsage: null
    };
  },
  
  getOptimalConfiguration: (resources) => {
    const config = {
      maxConcurrentWarming: 4,
      queueProcessingInterval: 500,
      maxQueueSize: 100
    };
    
    // Reduce concurrency if memory usage is high
    if (resources.memoryUsage > 0.8) {
      config.maxConcurrentWarming = 2;
      config.queueProcessingInterval = 1000;
      config.maxQueueSize = 50;
    }
    
    // Increase concurrency if resources are abundant
    if (resources.memoryUsage < 0.3 && resources.availableMemory > 200 * 1024 * 1024) {
      config.maxConcurrentWarming = 6;
      config.queueProcessingInterval = 300;
      config.maxQueueSize = 200;
    }
    
    return config;
  },
  
  applyResourceOptimization: () => {
    const resources = resourceBasedOptimization.getSystemResources();
    const config = resourceBasedOptimization.getOptimalConfiguration(resources);
    const service = SupabaseCacheWarmingService.instance;
    
    // Apply configuration
    Object.assign(service.queueManager.config, config);
    
    console.log(`💾 Applied resource-based optimization:`, {
      memoryUsage: `${(resources.memoryUsage * 100).toFixed(1)}%`,
      config
    });
  }
};

// Run resource optimization every 5 minutes
setInterval(resourceBasedOptimization.applyResourceOptimization, 5 * 60 * 1000);
```

## Troubleshooting Performance Issues

### Common Performance Problems

#### 1. Slow Warming Times
**Symptoms**: Average warming time > 5 seconds
**Diagnosis**:
```javascript
const diagnoseSlowWarming = () => {
  const stats = service.getWarmingStats();
  const recentEvents = stats.recentEvents.slice(-20);
  
  const slowEvents = recentEvents.filter(event => event.duration > 5000);
  console.log('Slow warming events:', slowEvents);
  
  // Check for patterns
  const errorPatterns = slowEvents.reduce((patterns, event) => {
    const key = event.error || 'no-error';
    patterns[key] = (patterns[key] || 0) + 1;
    return patterns;
  }, {});
  
  console.log('Error patterns in slow events:', errorPatterns);
};
```

**Solutions**:
- Increase `maxConcurrentWarming`
- Reduce `queueProcessingInterval`
- Check network connectivity
- Optimize Supabase queries

#### 2. High Memory Usage
**Symptoms**: Memory usage > 100MB
**Diagnosis**:
```javascript
const diagnoseMemoryUsage = () => {
  const service = SupabaseCacheWarmingService.instance;
  const stats = service.getWarmingStats();
  
  console.log('Service state:', {
    historySize: stats.recentEvents.length,
    queueSize: service.queueManager.getTotalQueueSize(),
    activeWarming: service.queueManager.activeWarming.size,
    cacheSize: Object.keys(service.cache || {}).length
  });
  
  if (typeof process !== 'undefined') {
    console.log('Memory usage:', process.memoryUsage());
  }
};
```

**Solutions**:
- Reduce `maxHistorySize`
- Enable garbage collection
- Clear old cache entries
- Reduce queue size

#### 3. Queue Overflow
**Symptoms**: Frequent queue overflow warnings
**Diagnosis**:
```javascript
const diagnoseQueueOverflow = () => {
  const queueStatus = service.queueManager.getQueueStatus();
  const stats = queueStatus.stats;
  
  console.log('Queue analysis:', {
    currentSize: queueStatus.totalSize,
    maxSize: service.queueManager.config.maxQueueSize,
    overflowCount: stats.overflowCount,
    processingRate: stats.totalProcessed / (Date.now() - service._startTime) * 1000, // per second
    duplicatesPrevented: stats.duplicatesPrevented
  });
};
```

**Solutions**:
- Increase `maxQueueSize`
- Increase `maxConcurrentWarming`
- Reduce `queueProcessingInterval`
- Implement request deduplication

## Best Practices Summary

1. **Start with baseline configuration** and adjust based on monitoring data
2. **Monitor key metrics** continuously and set up alerts
3. **Optimize for your usage patterns** - peak hours, user behavior, resource constraints
4. **Test configuration changes** in development before applying to production
5. **Use progressive warming** for high-priority users and critical data
6. **Implement proper error handling** and graceful degradation
7. **Regular maintenance** - clean up old data and optimize cache usage
8. **Document your optimizations** and their impact on performance

## Configuration Templates

### Small Application (< 100 users)
```javascript
const smallAppConfig = {
  maxRetries: 2,
  retryDelays: [1000, 3000],
  maintenanceInterval: 30,
  maxHistorySize: 25,
  queueConfig: {
    maxQueueSize: 50,
    maxConcurrentWarming: 2,
    queueProcessingInterval: 1000,
    enablePersistence: false
  }
};
```

### Medium Application (100-1000 users)
```javascript
const mediumAppConfig = {
  maxRetries: 3,
  retryDelays: [1000, 2000, 4000],
  maintenanceInterval: 15,
  maxHistorySize: 50,
  queueConfig: {
    maxQueueSize: 100,
    maxConcurrentWarming: 4,
    queueProcessingInterval: 500,
    enablePersistence: true
  }
};
```

### Large Application (> 1000 users)
```javascript
const largeAppConfig = {
  maxRetries: 2,
  retryDelays: [500, 1500],
  maintenanceInterval: 10,
  maxHistorySize: 100,
  queueConfig: {
    maxQueueSize: 300,
    maxConcurrentWarming: 8,
    queueProcessingInterval: 200,
    enablePersistence: true
  },
  statsConfig: {
    enableMemoryTracking: true,
    enableBandwidthTracking: true,
    enableCostAnalysis: true
  }
};
```

Use these templates as starting points and adjust based on your specific requirements and monitoring data.