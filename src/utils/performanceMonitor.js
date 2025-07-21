/**
 * Performance Monitor Utility
 * 
 * Provides utilities for monitoring and optimizing component performance
 * in the ProgramsWorkoutHub consolidated page.
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.observers = new Map();
    this.isEnabled = process.env.NODE_ENV === 'development';
  }

  // Start timing a performance metric
  startTiming(key) {
    if (!this.isEnabled) return;
    
    this.metrics.set(key, {
      startTime: performance.now(),
      endTime: null,
      duration: null
    });
  }

  // End timing and calculate duration
  endTiming(key) {
    if (!this.isEnabled) return null;
    
    const metric = this.metrics.get(key);
    if (metric) {
      metric.endTime = performance.now();
      metric.duration = metric.endTime - metric.startTime;
      
      // Log performance metrics in development
      console.log(`[Performance] ${key}: ${metric.duration.toFixed(2)}ms`);
      
      return metric.duration;
    }
    return null;
  }

  // Monitor component render performance
  monitorRender(componentName, renderFn) {
    if (!this.isEnabled) return renderFn();
    
    const key = `${componentName}_render`;
    this.startTiming(key);
    
    try {
      const result = renderFn();
      this.endTiming(key);
      return result;
    } catch (error) {
      this.endTiming(key);
      throw error;
    }
  }

  // Monitor view switching performance
  monitorViewSwitch(fromView, toView, switchFn) {
    if (!this.isEnabled) return switchFn();
    
    const key = `view_switch_${fromView}_to_${toView}`;
    this.startTiming(key);
    
    return Promise.resolve(switchFn()).then(result => {
      this.endTiming(key);
      return result;
    }).catch(error => {
      this.endTiming(key);
      throw error;
    });
  }

  // Monitor memory usage for state caching
  monitorMemoryUsage(label = 'memory_check') {
    if (!this.isEnabled || !performance.memory) return;
    
    const memory = performance.memory;
    console.log(`[Memory] ${label}:`, {
      used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`
    });
  }

  // Track state cache size
  trackCacheSize(cacheName, cacheObject) {
    if (!this.isEnabled) return;
    
    const size = JSON.stringify(cacheObject).length;
    console.log(`[Cache] ${cacheName} size: ${(size / 1024).toFixed(2)} KB`);
  }

  // Get performance summary
  getSummary() {
    if (!this.isEnabled) return {};
    
    const summary = {};
    this.metrics.forEach((metric, key) => {
      if (metric.duration !== null) {
        summary[key] = {
          duration: metric.duration,
          timestamp: metric.startTime
        };
      }
    });
    
    return summary;
  }

  // Clear metrics
  clear() {
    this.metrics.clear();
  }

  // Observer pattern for performance events
  subscribe(event, callback) {
    if (!this.observers.has(event)) {
      this.observers.set(event, new Set());
    }
    this.observers.get(event).add(callback);
  }

  unsubscribe(event, callback) {
    if (this.observers.has(event)) {
      this.observers.get(event).delete(callback);
    }
  }

  emit(event, data) {
    if (this.observers.has(event)) {
      this.observers.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[Performance] Observer error for ${event}:`, error);
        }
      });
    }
  }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// React hook for performance monitoring
export const usePerformanceMonitor = () => {
  return {
    startTiming: performanceMonitor.startTiming.bind(performanceMonitor),
    endTiming: performanceMonitor.endTiming.bind(performanceMonitor),
    monitorRender: performanceMonitor.monitorRender.bind(performanceMonitor),
    monitorViewSwitch: performanceMonitor.monitorViewSwitch.bind(performanceMonitor),
    monitorMemoryUsage: performanceMonitor.monitorMemoryUsage.bind(performanceMonitor),
    trackCacheSize: performanceMonitor.trackCacheSize.bind(performanceMonitor),
    getSummary: performanceMonitor.getSummary.bind(performanceMonitor)
  };
};

export default performanceMonitor;