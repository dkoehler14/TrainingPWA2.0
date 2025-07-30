# Supabase Cache Warming Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting steps for common issues with the Supabase Cache Warming Service. It includes diagnostic tools, common problems, solutions, and preventive measures.

## Quick Diagnostic Checklist

Before diving into specific issues, run this quick diagnostic:

```javascript
// Quick health check function
const performQuickDiagnostic = () => {
  const service = SupabaseCacheWarmingService.instance;
  
  if (!service) {
    console.error('❌ Service instance not found');
    return { status: 'critical', issue: 'service_not_initialized' };
  }
  
  const health = {
    serviceStarted: service.isStarted,
    currentlyWarming: service.isWarming,
    queueSize: service.queueManager?.getTotalQueueSize() || 0,
    activeWarming: service.queueManager?.activeWarming?.size || 0,
    uptime: service._startTime ? Date.now() - service._startTime : 0,
    lastError: null
  };
  
  // Get recent errors
  const stats = service.getWarmingStats();
  const recentErrors = stats.recentEvents
    .filter(event => !event.success)
    .slice(-5);
  
  if (recentErrors.length > 0) {
    health.lastError = recentErrors[0].error;
    health.errorRate = (stats.failedEvents / stats.totalEvents) * 100;
  }
  
  console.log('🔍 Quick Diagnostic Results:', health);
  return health;
};

// Run diagnostic
const diagnostic = performQuickDiagnostic();
```

## Common Issues and Solutions

### 1. Service Not Starting

#### Symptoms
- Cache warming not working
- No warming events in statistics
- `service.isStarted` returns `false`

#### Diagnosis
```javascript
const diagnoseStartupIssue = () => {
  const service = SupabaseCacheWarmingService.instance;
  
  console.log('Startup Diagnosis:', {
    instanceExists: !!service,
    isStarted: service?.isStarted,
    hasQueueManager: !!service?.queueManager,
    hasStatsTracker: !!service?.statsTracker,
    hasErrorHandler: !!service?.errorHandler,
    config: service?.config
  });
  
  // Check for initialization errors
  if (service && !service.isStarted) {
    try {
      service.start();
      console.log('✅ Service started successfully');
    } catch (error) {
      console.error('❌ Service startup failed:', error);
    }
  }
};
```

#### Solutions
1. **Manual Start**: Ensure `service.start()` is called
   ```javascript
   const service = new SupabaseCacheWarmingService();
   service.start(); // Don't forget this!
   ```

2. **Check Configuration**: Verify configuration is valid
   ```javascript
   const service = new SupabaseCacheWarmingService({
     maxRetries: 3, // Must be positive number
     retryDelays: [1000, 2000, 4000], // Must be array of numbers
     queueConfig: {
       maxQueueSize: 100, // Must be positive number
       maxConcurrentWarming: 3 // Must be positive number
     }
   });
   ```

3. **Check Dependencies**: Ensure all required imports are available
   ```javascript
   // Verify these imports work
   import { warmUserCache, warmAppCache, getCacheStats } from '../api/supabaseCache';
   import { authService } from './authService';
   ```

### 2. High Error Rates

#### Symptoms
- Success rate below 90%
- Frequent error messages in logs
- Poor cache performance

#### Diagnosis
```javascript
const diagnoseErrorRate = () => {
  const service = SupabaseCacheWarmingService.instance;
  const stats = service.getWarmingStats();
  
  const errorRate = (stats.failedEvents / stats.totalEvents) * 100;
  console.log(`Error Rate: ${errorRate.toFixed(2)}%`);
  
  // Analyze error patterns
  const recentErrors = stats.recentEvents
    .filter(event => !event.success)
    .slice(-20);
  
  const errorPatterns = recentErrors.reduce((patterns, event) => {
    const errorType = event.error?.includes('network') ? 'network' :
                     event.error?.includes('auth') ? 'auth' :
                     event.error?.includes('timeout') ? 'timeout' :
                     'other';
    
    patterns[errorType] = (patterns[errorType] || 0) + 1;
    return patterns;
  }, {});
  
  console.log('Error Patterns:', errorPatterns);
  
  // Check error handler status
  if (service.errorHandler) {
    console.log('Error Handler Config:', {
      maxRetries: service.errorHandler.config.maxRetries,
      baseRetryDelay: service.errorHandler.config.baseRetryDelay,
      enableErrorRateMonitoring: service.errorHandler.config.enableErrorRateMonitoring
    });
  }
  
  return { errorRate, errorPatterns, recentErrors };
};
```

#### Solutions

1. **Network Errors**: Check connectivity and retry configuration
   ```javascript
   // Increase retry attempts for network issues
   const service = new SupabaseCacheWarmingService({
     maxRetries: 5,
     retryDelays: [1000, 2000, 4000, 8000, 16000]
   });
   ```

2. **Authentication Errors**: Verify user authentication
   ```javascript
   const checkAuth = async () => {
     try {
       const user = await authService.getCurrentUser();
       if (!user) {
         console.warn('⚠️ User not authenticated');
         return false;
       }
       console.log('✅ User authenticated:', user.uid);
       return true;
     } catch (error) {
       console.error('❌ Auth check failed:', error);
       return false;
     }
   };
   ```

3. **Timeout Errors**: Adjust timeout settings
   ```javascript
   // Increase timeout for slow connections
   const service = new SupabaseCacheWarmingService({
     queueConfig: {
       queueProcessingInterval: 1000, // Slower processing
       maxConcurrentWarming: 2 // Reduce concurrency
     }
   });
   ```

4. **Rate Limiting**: Implement backoff strategies
   ```javascript
   // Add exponential backoff for rate limiting
   const handleRateLimit = async (operation) => {
     let delay = 1000;
     let attempts = 0;
     const maxAttempts = 5;
     
     while (attempts < maxAttempts) {
       try {
         return await operation();
       } catch (error) {
         if (error.message.includes('rate limit') && attempts < maxAttempts - 1) {
           console.log(`Rate limited, waiting ${delay}ms...`);
           await new Promise(resolve => setTimeout(resolve, delay));
           delay *= 2; // Exponential backoff
           attempts++;
         } else {
           throw error;
         }
       }
     }
   };
   ```

### 3. Queue Overflow

#### Symptoms
- Warning messages about queue overflow
- Warming requests being dropped
- `stats.overflowCount` increasing

#### Diagnosis
```javascript
const diagnoseQueueOverflow = () => {
  const service = SupabaseCacheWarmingService.instance;
  const queueStatus = service.queueManager.getQueueStatus();
  
  console.log('Queue Diagnosis:', {
    currentSize: queueStatus.totalSize,
    maxSize: service.queueManager.config.maxQueueSize,
    utilizationRate: (queueStatus.totalSize / service.queueManager.config.maxQueueSize) * 100,
    activeWarming: queueStatus.activeWarming,
    maxConcurrent: queueStatus.maxConcurrent,
    isProcessing: queueStatus.isProcessing,
    overflowCount: queueStatus.stats.overflowCount,
    duplicatesPrevented: queueStatus.stats.duplicatesPrevented
  });
  
  // Check processing rate
  const processingRate = queueStatus.stats.totalProcessed / 
    ((Date.now() - service._startTime) / 1000); // per second
  
  console.log(`Processing Rate: ${processingRate.toFixed(2)} items/second`);
  
  return queueStatus;
};
```

#### Solutions

1. **Increase Queue Capacity**
   ```javascript
   const service = new SupabaseCacheWarmingService({
     queueConfig: {
       maxQueueSize: 200, // Increase from default 100
       maxConcurrentWarming: 6 // Increase processing speed
     }
   });
   ```

2. **Optimize Processing Speed**
   ```javascript
   const service = new SupabaseCacheWarmingService({
     queueConfig: {
       queueProcessingInterval: 200, // Faster processing (default: 500)
       maxConcurrentWarming: 8 // More concurrent operations
     }
   });
   ```

3. **Implement Request Deduplication**
   ```javascript
   // The service already prevents duplicates, but you can add custom logic
   const smartWarmWithDeduplication = async (userId, context) => {
     const service = SupabaseCacheWarmingService.instance;
     
     // Check if user is already being warmed
     if (service.queueManager.isUserInQueue(userId) || 
         service.queueManager.activeWarming.has(userId)) {
       console.log(`🔄 Skipping duplicate warming request for ${userId}`);
       return;
     }
     
     return service.smartWarmCache(userId, context);
   };
   ```

4. **Priority-Based Queue Management**
   ```javascript
   // Use different priorities to manage queue better
   const manageQueuePriorities = async (userId, context) => {
     const service = SupabaseCacheWarmingService.instance;
     const queueStatus = service.queueManager.getQueueStatus();
     
     // Use lower priority if queue is getting full
     let priority = 'normal';
     if (queueStatus.totalSize > queueStatus.maxQueueSize * 0.8) {
       priority = 'low';
     } else if (context.isUrgent) {
       priority = 'high';
     }
     
     return service.warmUserCacheWithRetry(userId, priority);
   };
   ```

### 4. Poor Cache Performance

#### Symptoms
- Low cache hit rates
- Minimal performance improvement
- High database query times

#### Diagnosis
```javascript
const diagnoseCachePerformance = async () => {
  const service = SupabaseCacheWarmingService.instance;
  const stats = service.getWarmingStats();
  
  // Get cache statistics from Supabase cache
  const cacheStats = await getCacheStats();
  
  console.log('Cache Performance Analysis:', {
    warmingStats: {
      successRate: stats.successRate,
      averageDuration: stats.averageDuration,
      totalEvents: stats.totalEvents
    },
    cacheStats: {
      hitRate: cacheStats.hitRate || 'N/A',
      totalQueries: cacheStats.totalQueries || 'N/A',
      cacheSize: cacheStats.cacheSize || 'N/A'
    },
    performanceMetrics: stats.performanceMetrics
  });
  
  // Analyze recent warming events
  const recentSuccessful = stats.recentEvents
    .filter(event => event.success)
    .slice(-10);
  
  const avgWarmingTime = recentSuccessful.reduce((sum, event) => 
    sum + (event.duration || 0), 0) / recentSuccessful.length;
  
  console.log(`Average Warming Time: ${avgWarmingTime.toFixed(0)}ms`);
  
  return { stats, cacheStats, avgWarmingTime };
};
```

#### Solutions

1. **Optimize Warming Strategies**
   ```javascript
   // Use progressive warming for better coverage
   const optimizeWarmingStrategy = async (userId) => {
     const service = SupabaseCacheWarmingService.instance;
     
     // Start with progressive warming
     await service.progressiveWarmCache(userId);
     
     // Follow up with smart warming based on context
     const context = {
       currentPage: 'LogWorkout',
       timeOfDay: new Date(),
       strategy: 'comprehensive'
     };
     
     await service.smartWarmCache(userId, context);
   };
   ```

2. **Adjust Cache TTL Settings**
   ```javascript
   // Work with your Supabase cache configuration
   // Ensure TTL values are appropriate for your data
   const optimizeCacheTTL = async () => {
     // This would be configured in your Supabase cache layer
     console.log('💡 Consider adjusting cache TTL values in supabaseCache.js');
     console.log('💡 Longer TTL for stable data, shorter TTL for frequently changing data');
   };
   ```

3. **Implement Data Preloading**
   ```javascript
   // Preload critical data during app initialization
   const preloadCriticalData = async () => {
     const service = SupabaseCacheWarmingService.instance;
     
     // Initialize app cache first
     await service.initializeAppCache();
     
     // Preload user-specific data if user is known
     const user = await authService.getCurrentUser();
     if (user) {
       await service.warmUserCacheWithRetry(user.uid, 'high');
     }
   };
   ```

### 5. Memory Leaks

#### Symptoms
- Continuously increasing memory usage
- Application becoming slow over time
- Browser/Node.js running out of memory

#### Diagnosis
```javascript
const diagnoseMemoryLeaks = () => {
  const service = SupabaseCacheWarmingService.instance;
  
  // Check service state sizes
  const diagnosis = {
    historySize: service.warmingHistory?.length || 0,
    statsHistorySize: service.statsTracker?.history?.length || 0,
    queueSizes: service.queueManager?.getQueueStatus()?.queueSizes || {},
    activeWarmingSize: service.queueManager?.activeWarming?.size || 0
  };
  
  // Check for memory usage if available
  if (typeof process !== 'undefined' && process.memoryUsage) {
    diagnosis.memoryUsage = process.memoryUsage();
  }
  
  console.log('Memory Diagnosis:', diagnosis);
  
  // Check for potential leaks
  const warnings = [];
  if (diagnosis.historySize > 1000) {
    warnings.push('Warming history is very large');
  }
  if (diagnosis.statsHistorySize > 1000) {
    warnings.push('Stats history is very large');
  }
  if (diagnosis.activeWarmingSize > 50) {
    warnings.push('Too many active warming operations');
  }
  
  if (warnings.length > 0) {
    console.warn('⚠️ Potential memory issues:', warnings);
  }
  
  return diagnosis;
};
```

#### Solutions

1. **Limit History Sizes**
   ```javascript
   const service = new SupabaseCacheWarmingService({
     maxHistorySize: 50, // Reduce from default
     statsConfig: {
       maxHistorySize: 100 // Limit stats history
     }
   });
   ```

2. **Implement Periodic Cleanup**
   ```javascript
   const implementPeriodicCleanup = () => {
     const service = SupabaseCacheWarmingService.instance;
     
     // Clean up every 30 minutes
     setInterval(() => {
       console.log('🧹 Performing memory cleanup...');
       
       // Clear old history
       if (service.warmingHistory && service.warmingHistory.length > 50) {
         service.warmingHistory = service.warmingHistory.slice(-50);
       }
       
       // Clear completed queue items
       service.queueManager.clearQueue('completed');
       
       // Force garbage collection if available
       if (global.gc) {
         global.gc();
       }
       
       console.log('✅ Memory cleanup completed');
     }, 30 * 60 * 1000);
   };
   ```

3. **Proper Service Shutdown**
   ```javascript
   // Ensure proper cleanup on app shutdown
   const setupGracefulShutdown = () => {
     const cleanup = () => {
       console.log('🛑 Shutting down cache warming service...');
       const service = SupabaseCacheWarmingService.instance;
       
       if (service) {
         service.stop();
         
         // Clear all data structures
         if (service.queueManager) {
           service.queueManager.cleanup();
         }
         
         if (service.statsTracker) {
           service.statsTracker.cleanup();
         }
       }
       
       console.log('✅ Cache warming service shutdown complete');
     };
     
     // Handle different shutdown signals
     process.on('SIGINT', cleanup);
     process.on('SIGTERM', cleanup);
     window?.addEventListener('beforeunload', cleanup);
   };
   ```

### 6. Authentication Issues

#### Symptoms
- Warming fails for authenticated users
- "User not authenticated" errors
- Inconsistent warming behavior

#### Diagnosis
```javascript
const diagnoseAuthIssues = async () => {
  console.log('🔐 Diagnosing authentication issues...');
  
  try {
    // Check auth service
    const user = await authService.getCurrentUser();
    console.log('Current user:', user ? user.uid : 'Not authenticated');
    
    // Check auth state
    const authState = authService.getAuthState?.() || 'Unknown';
    console.log('Auth state:', authState);
    
    // Test cache warming with current user
    if (user) {
      const service = SupabaseCacheWarmingService.instance;
      const result = await service.warmUserCacheWithRetry(user.uid, 'normal');
      console.log('Test warming result:', result);
    }
    
  } catch (error) {
    console.error('❌ Auth diagnosis failed:', error);
  }
};
```

#### Solutions

1. **Add Auth State Checking**
   ```javascript
   const safeWarmUserCache = async (userId, priority = 'normal') => {
     const service = SupabaseCacheWarmingService.instance;
     
     // Verify user is authenticated
     try {
       const currentUser = await authService.getCurrentUser();
       if (!currentUser || currentUser.uid !== userId) {
         console.warn('⚠️ User authentication mismatch, skipping warming');
         return { success: false, reason: 'auth_mismatch' };
       }
       
       return await service.warmUserCacheWithRetry(userId, priority);
     } catch (error) {
       console.error('❌ Auth check failed:', error);
       return { success: false, reason: 'auth_error', error };
     }
   };
   ```

2. **Implement Auth State Monitoring**
   ```javascript
   const monitorAuthState = () => {
     const service = SupabaseCacheWarmingService.instance;
     
     // Listen for auth state changes
     authService.onAuthStateChange?.((user) => {
       if (user) {
         console.log('✅ User authenticated, warming cache:', user.uid);
         service.warmUserCacheWithRetry(user.uid, 'high');
       } else {
         console.log('🚪 User signed out, clearing user-specific cache');
         // Clear user-specific warming queue items
         service.queueManager.clearUserFromQueue?.(user?.uid);
       }
     });
   };
   ```

3. **Add Auth Error Recovery**
   ```javascript
   const handleAuthErrors = async (operation, userId) => {
     const maxAuthRetries = 3;
     let authRetries = 0;
     
     while (authRetries < maxAuthRetries) {
       try {
         // Check auth before operation
         const user = await authService.getCurrentUser();
         if (!user) {
           throw new Error('User not authenticated');
         }
         
         return await operation(userId);
       } catch (error) {
         if (error.message.includes('auth') && authRetries < maxAuthRetries - 1) {
           console.log(`🔄 Auth error, retrying... (${authRetries + 1}/${maxAuthRetries})`);
           authRetries++;
           
           // Wait before retry
           await new Promise(resolve => setTimeout(resolve, 1000 * authRetries));
           
           // Try to refresh auth
           await authService.refreshAuth?.();
         } else {
           throw error;
         }
       }
     }
   };
   ```

## Debugging Tools

### 1. Debug Mode

```javascript
// Enable debug mode for detailed logging
const enableDebugMode = () => {
  const service = new SupabaseCacheWarmingService({
    enableDebugMode: true,
    errorHandlerConfig: {
      enableDetailedLogging: true
    }
  });
  
  // Override console methods to add timestamps
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = (...args) => originalLog(`[${new Date().toISOString()}] [LOG]`, ...args);
  console.error = (...args) => originalError(`[${new Date().toISOString()}] [ERROR]`, ...args);
  console.warn = (...args) => originalWarn(`[${new Date().toISOString()}] [WARN]`, ...args);
  
  return service;
};
```

### 2. Performance Profiler

```javascript
// Simple performance profiler for cache operations
class CachePerformanceProfiler {
  constructor() {
    this.profiles = new Map();
  }
  
  start(operationId) {
    this.profiles.set(operationId, {
      startTime: performance.now(),
      startMemory: this.getMemoryUsage()
    });
  }
  
  end(operationId) {
    const profile = this.profiles.get(operationId);
    if (!profile) return null;
    
    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();
    
    const result = {
      duration: endTime - profile.startTime,
      memoryDelta: endMemory - profile.startMemory,
      timestamp: new Date().toISOString()
    };
    
    this.profiles.delete(operationId);
    return result;
  }
  
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }
  
  profileOperation(operationName, operation) {
    return async (...args) => {
      const operationId = `${operationName}_${Date.now()}`;
      this.start(operationId);
      
      try {
        const result = await operation(...args);
        const profile = this.end(operationId);
        
        console.log(`📊 ${operationName} completed:`, {
          duration: `${profile.duration.toFixed(2)}ms`,
          memoryDelta: `${(profile.memoryDelta / 1024 / 1024).toFixed(2)}MB`,
          success: true
        });
        
        return result;
      } catch (error) {
        const profile = this.end(operationId);
        
        console.error(`📊 ${operationName} failed:`, {
          duration: `${profile.duration.toFixed(2)}ms`,
          memoryDelta: `${(profile.memoryDelta / 1024 / 1024).toFixed(2)}MB`,
          error: error.message
        });
        
        throw error;
      }
    };
  }
}

// Usage
const profiler = new CachePerformanceProfiler();
const service = SupabaseCacheWarmingService.instance;

// Profile warming operations
service.warmUserCacheWithRetry = profiler.profileOperation(
  'warmUserCache', 
  service.warmUserCacheWithRetry.bind(service)
);
```

### 3. Health Monitor

```javascript
// Continuous health monitoring
class CacheHealthMonitor {
  constructor(service, options = {}) {
    this.service = service;
    this.options = {
      checkInterval: options.checkInterval || 60000, // 1 minute
      alertThresholds: {
        errorRate: options.errorRateThreshold || 10, // 10%
        queueSize: options.queueSizeThreshold || 80, // 80% of max
        responseTime: options.responseTimeThreshold || 5000, // 5 seconds
        memoryUsage: options.memoryThreshold || 100 * 1024 * 1024 // 100MB
      },
      ...options
    };
    
    this.alerts = [];
    this.isMonitoring = false;
  }
  
  start() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🏥 Starting cache health monitoring...');
    
    this.monitorInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.options.checkInterval);
  }
  
  stop() {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    console.log('🏥 Stopping cache health monitoring...');
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
  
  performHealthCheck() {
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      issues: [],
      metrics: this.collectMetrics()
    };
    
    // Check error rate
    if (health.metrics.errorRate > this.options.alertThresholds.errorRate) {
      health.issues.push({
        type: 'high_error_rate',
        severity: 'warning',
        message: `Error rate is ${health.metrics.errorRate.toFixed(2)}% (threshold: ${this.options.alertThresholds.errorRate}%)`
      });
    }
    
    // Check queue size
    const queueUtilization = (health.metrics.queueSize / health.metrics.maxQueueSize) * 100;
    if (queueUtilization > this.options.alertThresholds.queueSize) {
      health.issues.push({
        type: 'high_queue_utilization',
        severity: 'warning',
        message: `Queue utilization is ${queueUtilization.toFixed(1)}% (threshold: ${this.options.alertThresholds.queueSize}%)`
      });
    }
    
    // Check response time
    if (health.metrics.avgResponseTime > this.options.alertThresholds.responseTime) {
      health.issues.push({
        type: 'slow_response_time',
        severity: 'warning',
        message: `Average response time is ${health.metrics.avgResponseTime}ms (threshold: ${this.options.alertThresholds.responseTime}ms)`
      });
    }
    
    // Check memory usage
    if (health.metrics.memoryUsage > this.options.alertThresholds.memoryUsage) {
      health.issues.push({
        type: 'high_memory_usage',
        severity: 'warning',
        message: `Memory usage is ${(health.metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB (threshold: ${(this.options.alertThresholds.memoryUsage / 1024 / 1024).toFixed(2)}MB)`
      });
    }
    
    // Update status based on issues
    if (health.issues.length > 0) {
      health.status = health.issues.some(issue => issue.severity === 'critical') ? 'critical' : 'warning';
    }
    
    // Log health status
    if (health.status !== 'healthy') {
      console.warn('🏥 Health check issues detected:', health);
    } else {
      console.log('🏥 Health check passed:', health.metrics);
    }
    
    // Store alerts
    this.alerts.push(health);
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
    
    return health;
  }
  
  collectMetrics() {
    const stats = this.service.getWarmingStats();
    const queueStatus = this.service.queueManager.getQueueStatus();
    
    const recentEvents = stats.recentEvents.slice(-20);
    const avgResponseTime = recentEvents.reduce((sum, event) => 
      sum + (event.duration || 0), 0) / recentEvents.length;
    
    return {
      errorRate: (stats.failedEvents / stats.totalEvents) * 100,
      successRate: parseFloat(stats.successRate),
      queueSize: queueStatus.totalSize,
      maxQueueSize: this.service.queueManager.config.maxQueueSize,
      activeWarming: queueStatus.activeWarming,
      avgResponseTime: avgResponseTime || 0,
      memoryUsage: this.getMemoryUsage(),
      uptime: Date.now() - this.service._startTime
    };
  }
  
  getMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }
  
  getRecentAlerts(count = 10) {
    return this.alerts
      .filter(alert => alert.status !== 'healthy')
      .slice(-count);
  }
}

// Usage
const service = SupabaseCacheWarmingService.instance;
const healthMonitor = new CacheHealthMonitor(service, {
  checkInterval: 30000, // Check every 30 seconds
  errorRateThreshold: 5, // 5% error rate threshold
  queueSizeThreshold: 70 // 70% queue utilization threshold
});

healthMonitor.start();
```

## Prevention Strategies

### 1. Proactive Monitoring

```javascript
// Set up proactive monitoring
const setupProactiveMonitoring = () => {
  const service = SupabaseCacheWarmingService.instance;
  
  // Monitor key metrics every minute
  setInterval(() => {
    const stats = service.getWarmingStats();
    const errorRate = (stats.failedEvents / stats.totalEvents) * 100;
    
    // Alert if error rate is trending upward
    if (errorRate > 5) {
      console.warn(`⚠️ Error rate alert: ${errorRate.toFixed(2)}%`);
      
      // Implement automatic remediation
      if (errorRate > 15) {
        console.log('🔧 Implementing automatic remediation...');
        
        // Reduce concurrency to stabilize
        service.queueManager.config.maxConcurrentWarming = Math.max(
          service.queueManager.config.maxConcurrentWarming - 1, 
          1
        );
        
        // Increase retry delays
        service.config.retryDelays = service.config.retryDelays.map(delay => delay * 1.5);
      }
    }
  }, 60000);
};
```

### 2. Configuration Validation

```javascript
// Validate configuration before starting service
const validateConfiguration = (config) => {
  const errors = [];
  
  // Check required fields
  if (!config.maxRetries || config.maxRetries < 1) {
    errors.push('maxRetries must be a positive number');
  }
  
  if (!config.retryDelays || !Array.isArray(config.retryDelays)) {
    errors.push('retryDelays must be an array');
  }
  
  if (config.queueConfig) {
    if (!config.queueConfig.maxQueueSize || config.queueConfig.maxQueueSize < 1) {
      errors.push('queueConfig.maxQueueSize must be a positive number');
    }
    
    if (!config.queueConfig.maxConcurrentWarming || config.queueConfig.maxConcurrentWarming < 1) {
      errors.push('queueConfig.maxConcurrentWarming must be a positive number');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
  }
  
  console.log('✅ Configuration validation passed');
  return true;
};

// Use validation
try {
  const config = {
    maxRetries: 3,
    retryDelays: [1000, 2000, 4000],
    queueConfig: {
      maxQueueSize: 100,
      maxConcurrentWarming: 4
    }
  };
  
  validateConfiguration(config);
  const service = new SupabaseCacheWarmingService(config);
} catch (error) {
  console.error('❌ Configuration error:', error.message);
}
```

### 3. Graceful Degradation

```javascript
// Implement graceful degradation strategies
const implementGracefulDegradation = () => {
  const service = SupabaseCacheWarmingService.instance;
  
  // Monitor service health and degrade gracefully
  const checkAndDegrade = () => {
    const stats = service.getWarmingStats();
    const errorRate = (stats.failedEvents / stats.totalEvents) * 100;
    
    if (errorRate > 20) {
      console.warn('🔻 High error rate detected, enabling graceful degradation');
      
      // Reduce service load
      service.queueManager.config.maxConcurrentWarming = 1;
      service.queueManager.config.queueProcessingInterval = 2000;
      
      // Skip non-critical warming
      service.degradationMode = true;
      
    } else if (errorRate < 5 && service.degradationMode) {
      console.log('📈 Error rate normalized, disabling graceful degradation');
      
      // Restore normal operation
      service.queueManager.config.maxConcurrentWarming = 4;
      service.queueManager.config.queueProcessingInterval = 500;
      service.degradationMode = false;
    }
  };
  
  // Check every 2 minutes
  setInterval(checkAndDegrade, 2 * 60 * 1000);
};
```

## Emergency Procedures

### Service Recovery

```javascript
// Emergency service recovery procedure
const emergencyRecovery = async () => {
  console.log('🚨 Initiating emergency recovery procedure...');
  
  try {
    const service = SupabaseCacheWarmingService.instance;
    
    // Step 1: Stop current operations
    service.stop();
    console.log('✅ Service stopped');
    
    // Step 2: Clear all queues
    if (service.queueManager) {
      service.queueManager.clearQueue('all');
      console.log('✅ Queues cleared');
    }
    
    // Step 3: Reset configuration to safe defaults
    const safeConfig = {
      maxRetries: 2,
      retryDelays: [2000, 5000],
      maintenanceInterval: 30,
      queueConfig: {
        maxQueueSize: 50,
        maxConcurrentWarming: 2,
        queueProcessingInterval: 1000,
        enablePersistence: false
      }
    };
    
    // Step 4: Reinitialize with safe configuration
    Object.assign(service.config, safeConfig);
    console.log('✅ Configuration reset to safe defaults');
    
    // Step 5: Restart service
    service.start();
    console.log('✅ Service restarted');
    
    // Step 6: Verify operation
    await new Promise(resolve => setTimeout(resolve, 5000));
    const stats = service.getWarmingStats();
    console.log('✅ Recovery completed. Service status:', {
      isStarted: service.isStarted,
      queueSize: service.queueManager.getTotalQueueSize(),
      recentEvents: stats.recentEvents.length
    });
    
  } catch (error) {
    console.error('❌ Emergency recovery failed:', error);
    throw error;
  }
};
```

### Data Recovery

```javascript
// Recover from corrupted data states
const recoverCorruptedData = () => {
  console.log('🔧 Recovering from corrupted data...');
  
  const service = SupabaseCacheWarmingService.instance;
  
  // Clear potentially corrupted data
  service.warmingHistory = [];
  
  if (service.statsTracker) {
    service.statsTracker.history = [];
    service.statsTracker.metrics = {};
  }
  
  if (service.queueManager) {
    service.queueManager.clearQueue('all');
    service.queueManager.activeWarming.clear();
    service.queueManager.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      overflowCount: 0,
      duplicatesPrevented: 0
    };
  }
  
  // Clear localStorage if persistence is enabled
  if (typeof localStorage !== 'undefined') {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes('supabase_warming') || key.includes('cache_warming')) {
        localStorage.removeItem(key);
      }
    });
  }
  
  console.log('✅ Data recovery completed');
};
```

This troubleshooting guide provides comprehensive solutions for common issues with the Supabase Cache Warming Service. Use the diagnostic tools to identify problems quickly and apply the appropriate solutions based on your specific situation.