/**
 * Performance Monitor for Quick Workout Caching Optimizations
 * 
 * Tracks cache performance metrics and database read counts
 * to measure the effectiveness of Phase 1 optimizations.
 */

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            databaseReads: 0,
            loadTimes: [],
            cacheWarmingEvents: 0,
            parallelLoadingEvents: 0
        };
        this.sessionStart = Date.now();
    }

    // Track cache performance
    recordCacheHit(cacheKey) {
        this.metrics.cacheHits++;
        console.log(`[Performance] Cache HIT for ${cacheKey} | Hit Rate: ${this.getCacheHitRate().toFixed(1)}%`);
    }

    recordCacheMiss(cacheKey) {
        this.metrics.cacheMisses++;
        console.log(`[Performance] Cache MISS for ${cacheKey} | Hit Rate: ${this.getCacheHitRate().toFixed(1)}%`);
    }

    // Track database operations
    recordDatabaseRead(collection, operation = 'read') {
        this.metrics.databaseReads++;
        console.log(`[Performance] DB Read: ${collection} (${operation}) | Total reads: ${this.metrics.databaseReads}`);
    }

    // Track loading performance
    recordLoadTime(operation, timeMs) {
        this.metrics.loadTimes.push({ operation, timeMs, timestamp: Date.now() });
        console.log(`[Performance] ${operation} completed in ${timeMs}ms`);
        
        // Keep only last 50 measurements
        if (this.metrics.loadTimes.length > 50) {
            this.metrics.loadTimes = this.metrics.loadTimes.slice(-50);
        }
    }

    // Track Phase 1 specific optimizations
    recordCacheWarming(context) {
        this.metrics.cacheWarmingEvents++;
        console.log(`[Performance] Cache warming triggered: ${context}`);
    }

    recordParallelLoading(operationCount) {
        this.metrics.parallelLoadingEvents++;
        console.log(`[Performance] Parallel loading: ${operationCount} operations`);
    }

    // Calculate metrics
    getCacheHitRate() {
        const total = this.metrics.cacheHits + this.metrics.cacheMisses;
        return total > 0 ? (this.metrics.cacheHits / total) * 100 : 0;
    }

    getAverageLoadTime(operation = null) {
        let relevantTimes = this.metrics.loadTimes;
        if (operation) {
            relevantTimes = this.metrics.loadTimes.filter(t => t.operation === operation);
        }
        
        if (relevantTimes.length === 0) return 0;
        
        const sum = relevantTimes.reduce((acc, t) => acc + t.timeMs, 0);
        return sum / relevantTimes.length;
    }

    // Generate performance report
    generateReport() {
        const sessionDuration = (Date.now() - this.sessionStart) / 1000 / 60; // minutes
        
        return {
            sessionDuration: `${sessionDuration.toFixed(1)} minutes`,
            cachePerformance: {
                hitRate: `${this.getCacheHitRate().toFixed(1)}%`,
                totalHits: this.metrics.cacheHits,
                totalMisses: this.metrics.cacheMisses
            },
            databaseUsage: {
                totalReads: this.metrics.databaseReads,
                readsPerMinute: (this.metrics.databaseReads / sessionDuration).toFixed(1)
            },
            loadingPerformance: {
                averageLoadTime: `${this.getAverageLoadTime().toFixed(0)}ms`,
                quickWorkoutAvg: `${this.getAverageLoadTime('QuickWorkout').toFixed(0)}ms`,
                historyAvg: `${this.getAverageLoadTime('QuickWorkoutHistory').toFixed(0)}ms`
            },
            phase1Optimizations: {
                cacheWarmingEvents: this.metrics.cacheWarmingEvents,
                parallelLoadingEvents: this.metrics.parallelLoadingEvents
            }
        };
    }

    // Log performance summary
    logSummary() {
        const report = this.generateReport();
        console.group('[Performance Monitor] Session Summary');
        console.log('📊 Cache Performance:', report.cachePerformance);
        console.log('🗄️ Database Usage:', report.databaseUsage);
        console.log('⚡ Loading Performance:', report.loadingPerformance);
        console.log('🚀 Phase 1 Optimizations:', report.phase1Optimizations);
        console.log('⏱️ Session Duration:', report.sessionDuration);
        console.groupEnd();
    }

    // Reset metrics (useful for testing)
    reset() {
        this.metrics = {
            cacheHits: 0,
            cacheMisses: 0,
            databaseReads: 0,
            loadTimes: [],
            cacheWarmingEvents: 0,
            parallelLoadingEvents: 0
        };
        this.sessionStart = Date.now();
        console.log('[Performance Monitor] Metrics reset');
    }

    // Additional methods for advanced performance monitoring
    startTiming(operation) {
        this.timingStart = this.timingStart || {};
        this.timingStart[operation] = Date.now();
    }

    endTiming(operation) {
        if (this.timingStart && this.timingStart[operation]) {
            const duration = Date.now() - this.timingStart[operation];
            this.recordLoadTime(operation, duration);
            delete this.timingStart[operation];
        }
    }

    monitorViewSwitch(fromView, toView, callback) {
        const startTime = Date.now();
        console.log(`[Performance] View switch: ${fromView} → ${toView}`);
        
        if (typeof callback === 'function') {
            callback();
        }
        
        const duration = Date.now() - startTime;
        this.recordLoadTime(`view_switch_${fromView}_to_${toView}`, duration);
    }

    monitorMemoryUsage(context) {
        if (performance.memory) {
            const memInfo = {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            };
            console.log(`[Performance] Memory usage (${context}):`, memInfo);
        }
    }

    trackCacheSize(cacheKey, data) {
        const size = JSON.stringify(data).length;
        console.log(`[Performance] Cache size for ${cacheKey}: ${(size / 1024).toFixed(1)}KB`);
    }

    getSummary() {
        return this.generateReport();
    }
}

// Export singleton instance
const performanceMonitor = new PerformanceMonitor();

// Auto-log summary every 5 minutes in development
if (process.env.NODE_ENV === 'development') {
    setInterval(() => {
        performanceMonitor.logSummary();
    }, 5 * 60 * 1000); // 5 minutes
}

export default performanceMonitor;