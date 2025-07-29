/**
 * Application Performance Monitor
 * 
 * This module provides comprehensive performance monitoring for the application including:
 * - Database operation tracking
 * - Cache hit rate monitoring
 * - Query time analysis
 * - Performance dashboards and alerting
 * - Real-time performance metrics
 */

import { supabaseCache, getEnhancedCacheStats } from '../api/supabaseCache'
import { queryOptimizer, connectionPoolManager } from './queryOptimizer'

// Performance thresholds and configuration
const PERFORMANCE_THRESHOLDS = {
  QUERY_TIME: {
    GOOD: 100,      // < 100ms
    WARNING: 500,   // 100-500ms
    CRITICAL: 1000  // > 1000ms
  },
  CACHE_HIT_RATE: {
    GOOD: 80,       // > 80%
    WARNING: 60,    // 60-80%
    CRITICAL: 40    // < 40%
  },
  DATABASE_READS: {
    GOOD: 100,      // < 100 reads/minute
    WARNING: 200,   // 100-200 reads/minute
    CRITICAL: 300   // > 300 reads/minute
  }
}

// Performance metrics storage
let performanceMetrics = {
  // Application metrics
  appStartTime: Date.now(),
  totalPageLoads: 0,
  averagePageLoadTime: 0,
  
  // Database metrics
  totalDatabaseOperations: 0,
  databaseOperationsByType: {},
  averageDatabaseTime: 0,
  slowDatabaseOperations: 0,
  
  // Cache metrics
  cacheOperations: 0,
  cacheHitRate: 0,
  cacheMissRate: 0,
  
  // User interaction metrics
  userInteractions: 0,
  averageInteractionTime: 0,
  
  // Error tracking
  errors: [],
  errorsByType: {},
  
  // Performance alerts
  alerts: [],
  alertsByType: {},
  
  // Real-time metrics (last 5 minutes)
  realtimeMetrics: {
    timestamp: Date.now(),
    queriesPerMinute: 0,
    cacheHitsPerMinute: 0,
    errorsPerMinute: 0,
    averageResponseTime: 0
  }
}

/**
 * Performance Monitor Class
 */
export class PerformanceMonitor {
  constructor() {
    this.metricsHistory = []
    this.maxHistorySize = 1000
    this.alertCallbacks = []
    this.isMonitoring = false
    this.monitoringInterval = null
    
    // Start real-time monitoring
    this.startRealtimeMonitoring()
  }

  /**
   * Start real-time performance monitoring
   */
  startRealtimeMonitoring() {
    if (this.isMonitoring) return
    
    this.isMonitoring = true
    this.monitoringInterval = setInterval(() => {
      this.updateRealtimeMetrics()
      this.checkPerformanceThresholds()
    }, 60000) // Update every minute
    
    console.log('📊 Performance monitoring started')
  }

  /**
   * Stop real-time performance monitoring
   */
  stopRealtimeMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      this.isMonitoring = false
      console.log('📊 Performance monitoring stopped')
    }
  }

  /**
   * Track database operation performance
   */
  trackDatabaseOperation(operation, table, duration, success = true, metadata = {}) {
    performanceMetrics.totalDatabaseOperations++
    
    // Update average database time
    performanceMetrics.averageDatabaseTime = 
      (performanceMetrics.averageDatabaseTime * (performanceMetrics.totalDatabaseOperations - 1) + duration) / 
      performanceMetrics.totalDatabaseOperations
    
    // Track by operation type
    const operationType = `${table}.${operation}`
    if (!performanceMetrics.databaseOperationsByType[operationType]) {
      performanceMetrics.databaseOperationsByType[operationType] = {
        count: 0,
        totalTime: 0,
        averageTime: 0,
        slowOperations: 0,
        errors: 0
      }
    }
    
    const opStats = performanceMetrics.databaseOperationsByType[operationType]
    opStats.count++
    opStats.totalTime += duration
    opStats.averageTime = opStats.totalTime / opStats.count
    
    if (!success) {
      opStats.errors++
    }
    
    // Track slow operations
    if (duration > PERFORMANCE_THRESHOLDS.QUERY_TIME.CRITICAL) {
      performanceMetrics.slowDatabaseOperations++
      opStats.slowOperations++
      
      this.createAlert('slow_query', {
        operation: operationType,
        duration,
        threshold: PERFORMANCE_THRESHOLDS.QUERY_TIME.CRITICAL,
        metadata
      })
    }
    
    // Add to metrics history
    this.addToHistory({
      type: 'database_operation',
      operation: operationType,
      duration,
      success,
      timestamp: Date.now(),
      metadata
    })
  }

  /**
   * Track cache operation performance
   */
  trackCacheOperation(operation, hit, duration, metadata = {}) {
    performanceMetrics.cacheOperations++
    
    // Update cache hit/miss rates
    const cacheStats = getEnhancedCacheStats()
    if (cacheStats.cachePerformance) {
      const hitRate = parseFloat(cacheStats.cachePerformance.readReductionRate.replace('%', ''))
      performanceMetrics.cacheHitRate = hitRate
      performanceMetrics.cacheMissRate = 100 - hitRate
      
      // Check cache performance thresholds
      if (hitRate < PERFORMANCE_THRESHOLDS.CACHE_HIT_RATE.CRITICAL) {
        this.createAlert('low_cache_hit_rate', {
          currentRate: hitRate,
          threshold: PERFORMANCE_THRESHOLDS.CACHE_HIT_RATE.CRITICAL,
          suggestion: 'Consider increasing cache TTL or warming more data'
        })
      }
    }
    
    // Add to metrics history
    this.addToHistory({
      type: 'cache_operation',
      operation,
      hit,
      duration,
      timestamp: Date.now(),
      metadata
    })
  }

  /**
   * Track user interaction performance
   */
  trackUserInteraction(interaction, duration, metadata = {}) {
    performanceMetrics.userInteractions++
    
    // Update average interaction time
    performanceMetrics.averageInteractionTime = 
      (performanceMetrics.averageInteractionTime * (performanceMetrics.userInteractions - 1) + duration) / 
      performanceMetrics.userInteractions
    
    // Add to metrics history
    this.addToHistory({
      type: 'user_interaction',
      interaction,
      duration,
      timestamp: Date.now(),
      metadata
    })
  }

  /**
   * Track page load performance
   */
  trackPageLoad(page, duration, metadata = {}) {
    performanceMetrics.totalPageLoads++
    
    // Update average page load time
    performanceMetrics.averagePageLoadTime = 
      (performanceMetrics.averagePageLoadTime * (performanceMetrics.totalPageLoads - 1) + duration) / 
      performanceMetrics.totalPageLoads
    
    // Check page load thresholds
    if (duration > 3000) { // 3 seconds
      this.createAlert('slow_page_load', {
        page,
        duration,
        threshold: 3000,
        suggestion: 'Consider optimizing page load performance'
      })
    }
    
    // Add to metrics history
    this.addToHistory({
      type: 'page_load',
      page,
      duration,
      timestamp: Date.now(),
      metadata
    })
  }

  /**
   * Record load time (alias for trackPageLoad for backward compatibility)
   */
  recordLoadTime(component, duration, metadata = {}) {
    this.trackPageLoad(component, duration, metadata)
  }

  /**
   * Track application errors
   */
  trackError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name,
      timestamp: Date.now(),
      context
    }
    
    performanceMetrics.errors.push(errorInfo)
    
    // Keep only last 100 errors
    if (performanceMetrics.errors.length > 100) {
      performanceMetrics.errors.shift()
    }
    
    // Track by error type
    if (!performanceMetrics.errorsByType[errorInfo.type]) {
      performanceMetrics.errorsByType[errorInfo.type] = 0
    }
    performanceMetrics.errorsByType[errorInfo.type]++
    
    // Create alert for critical errors
    this.createAlert('application_error', {
      error: errorInfo,
      context
    })
    
    // Add to metrics history
    this.addToHistory({
      type: 'error',
      error: errorInfo,
      timestamp: Date.now()
    })
  }

  /**
   * Update real-time metrics
   */
  updateRealtimeMetrics() {
    const now = Date.now()
    const fiveMinutesAgo = now - (5 * 60 * 1000)
    
    // Filter recent metrics
    const recentMetrics = this.metricsHistory.filter(m => m.timestamp > fiveMinutesAgo)
    
    // Calculate per-minute rates
    const databaseOps = recentMetrics.filter(m => m.type === 'database_operation')
    const cacheOps = recentMetrics.filter(m => m.type === 'cache_operation')
    const errors = recentMetrics.filter(m => m.type === 'error')
    
    performanceMetrics.realtimeMetrics = {
      timestamp: now,
      queriesPerMinute: (databaseOps.length / 5).toFixed(1),
      cacheHitsPerMinute: (cacheOps.filter(op => op.hit).length / 5).toFixed(1),
      errorsPerMinute: (errors.length / 5).toFixed(1),
      averageResponseTime: databaseOps.length > 0 ? 
        (databaseOps.reduce((sum, op) => sum + op.duration, 0) / databaseOps.length).toFixed(2) : 0
    }
  }

  /**
   * Check performance thresholds and create alerts
   */
  checkPerformanceThresholds() {
    const realtimeMetrics = performanceMetrics.realtimeMetrics
    
    // Check database read rate
    const queriesPerMinute = parseFloat(realtimeMetrics.queriesPerMinute)
    if (queriesPerMinute > PERFORMANCE_THRESHOLDS.DATABASE_READS.CRITICAL) {
      this.createAlert('high_database_load', {
        currentRate: queriesPerMinute,
        threshold: PERFORMANCE_THRESHOLDS.DATABASE_READS.CRITICAL,
        suggestion: 'Consider implementing more aggressive caching or query optimization'
      })
    }
    
    // Check average response time
    const avgResponseTime = parseFloat(realtimeMetrics.averageResponseTime)
    if (avgResponseTime > PERFORMANCE_THRESHOLDS.QUERY_TIME.CRITICAL) {
      this.createAlert('slow_response_time', {
        currentTime: avgResponseTime,
        threshold: PERFORMANCE_THRESHOLDS.QUERY_TIME.CRITICAL,
        suggestion: 'Database queries are running slowly. Check for missing indexes or optimize queries.'
      })
    }
  }

  /**
   * Create performance alert
   */
  createAlert(type, data) {
    const alert = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity: this.getAlertSeverity(type, data),
      message: this.generateAlertMessage(type, data),
      data,
      timestamp: Date.now(),
      acknowledged: false
    }
    
    performanceMetrics.alerts.push(alert)
    
    // Keep only last 50 alerts
    if (performanceMetrics.alerts.length > 50) {
      performanceMetrics.alerts.shift()
    }
    
    // Track by alert type
    if (!performanceMetrics.alertsByType[type]) {
      performanceMetrics.alertsByType[type] = 0
    }
    performanceMetrics.alertsByType[type]++
    
    // Notify alert callbacks
    this.notifyAlertCallbacks(alert)
    
    console.warn(`🚨 Performance Alert [${alert.severity}]: ${alert.message}`)
    
    return alert
  }

  /**
   * Get alert severity based on type and data
   */
  getAlertSeverity(type, data) {
    switch (type) {
      case 'slow_query':
        return data.duration > 2000 ? 'critical' : 'warning'
      case 'low_cache_hit_rate':
        return data.currentRate < 40 ? 'critical' : 'warning'
      case 'high_database_load':
        return data.currentRate > 500 ? 'critical' : 'warning'
      case 'slow_response_time':
        return data.currentTime > 2000 ? 'critical' : 'warning'
      case 'application_error':
        return 'error'
      case 'slow_page_load':
        return 'warning'
      default:
        return 'info'
    }
  }

  /**
   * Generate alert message
   */
  generateAlertMessage(type, data) {
    switch (type) {
      case 'slow_query':
        return `Slow query detected: ${data.operation} took ${data.duration}ms (threshold: ${data.threshold}ms)`
      case 'low_cache_hit_rate':
        return `Low cache hit rate: ${data.currentRate}% (threshold: ${data.threshold}%)`
      case 'high_database_load':
        return `High database load: ${data.currentRate} queries/minute (threshold: ${data.threshold})`
      case 'slow_response_time':
        return `Slow response time: ${data.currentTime}ms average (threshold: ${data.threshold}ms)`
      case 'application_error':
        return `Application error: ${data.error.type} - ${data.error.message}`
      case 'slow_page_load':
        return `Slow page load: ${data.page} took ${data.duration}ms (threshold: ${data.threshold}ms)`
      default:
        return `Performance alert: ${type}`
    }
  }

  /**
   * Add metric to history
   */
  addToHistory(metric) {
    this.metricsHistory.push(metric)
    
    // Keep only recent history
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift()
    }
  }

  /**
   * Register alert callback
   */
  onAlert(callback) {
    this.alertCallbacks.push(callback)
  }

  /**
   * Notify alert callbacks
   */
  notifyAlertCallbacks(alert) {
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert)
      } catch (error) {
        console.error('Error in alert callback:', error)
      }
    })
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId) {
    const alert = performanceMetrics.alerts.find(a => a.id === alertId)
    if (alert) {
      alert.acknowledged = true
      alert.acknowledgedAt = Date.now()
    }
  }

  /**
   * Get performance dashboard data
   */
  getPerformanceDashboard() {
    const cacheStats = getEnhancedCacheStats()
    const queryStats = queryOptimizer.performanceMonitor.getPerformanceStats()
    const connectionStats = connectionPoolManager.getConnectionStats()
    
    return {
      // Overview metrics
      overview: {
        appUptime: this.formatDuration(Date.now() - performanceMetrics.appStartTime),
        totalDatabaseOperations: performanceMetrics.totalDatabaseOperations,
        averageDatabaseTime: `${performanceMetrics.averageDatabaseTime.toFixed(2)}ms`,
        cacheHitRate: `${performanceMetrics.cacheHitRate.toFixed(1)}%`,
        totalErrors: performanceMetrics.errors.length,
        activeAlerts: performanceMetrics.alerts.filter(a => !a.acknowledged).length
      },
      
      // Real-time metrics
      realtime: performanceMetrics.realtimeMetrics,
      
      // Database performance
      database: {
        operationsByType: performanceMetrics.databaseOperationsByType,
        slowOperations: performanceMetrics.slowDatabaseOperations,
        connectionPool: connectionStats,
        queryPerformance: queryStats.tableStats
      },
      
      // Cache performance
      cache: {
        hitRate: performanceMetrics.cacheHitRate,
        missRate: performanceMetrics.cacheMissRate,
        operations: performanceMetrics.cacheOperations,
        detailed: cacheStats
      },
      
      // User experience
      userExperience: {
        totalPageLoads: performanceMetrics.totalPageLoads,
        averagePageLoadTime: `${performanceMetrics.averagePageLoadTime.toFixed(2)}ms`,
        userInteractions: performanceMetrics.userInteractions,
        averageInteractionTime: `${performanceMetrics.averageInteractionTime.toFixed(2)}ms`
      },
      
      // Error tracking
      errors: {
        total: performanceMetrics.errors.length,
        byType: performanceMetrics.errorsByType,
        recent: performanceMetrics.errors.slice(-10)
      },
      
      // Alerts
      alerts: {
        total: performanceMetrics.alerts.length,
        unacknowledged: performanceMetrics.alerts.filter(a => !a.acknowledged).length,
        byType: performanceMetrics.alertsByType,
        recent: performanceMetrics.alerts.slice(-10)
      },
      
      // Performance trends (last hour)
      trends: this.getPerformanceTrends(),
      
      // Recommendations
      recommendations: this.getPerformanceRecommendations()
    }
  }

  /**
   * Get performance trends
   */
  getPerformanceTrends() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000)
    const recentMetrics = this.metricsHistory.filter(m => m.timestamp > oneHourAgo)
    
    // Group by 10-minute intervals
    const intervals = {}
    recentMetrics.forEach(metric => {
      const interval = Math.floor(metric.timestamp / (10 * 60 * 1000)) * (10 * 60 * 1000)
      if (!intervals[interval]) {
        intervals[interval] = {
          timestamp: interval,
          databaseOps: 0,
          cacheHits: 0,
          errors: 0,
          avgResponseTime: 0,
          responseTimes: []
        }
      }
      
      const intervalData = intervals[interval]
      
      if (metric.type === 'database_operation') {
        intervalData.databaseOps++
        intervalData.responseTimes.push(metric.duration)
      } else if (metric.type === 'cache_operation' && metric.hit) {
        intervalData.cacheHits++
      } else if (metric.type === 'error') {
        intervalData.errors++
      }
    })
    
    // Calculate average response times
    Object.values(intervals).forEach(interval => {
      if (interval.responseTimes.length > 0) {
        interval.avgResponseTime = interval.responseTimes.reduce((sum, time) => sum + time, 0) / interval.responseTimes.length
      }
      delete interval.responseTimes
    })
    
    return Object.values(intervals).sort((a, b) => a.timestamp - b.timestamp)
  }

  /**
   * Get performance recommendations
   */
  getPerformanceRecommendations() {
    const recommendations = []
    
    // Database recommendations
    if (performanceMetrics.averageDatabaseTime > PERFORMANCE_THRESHOLDS.QUERY_TIME.WARNING) {
      recommendations.push({
        type: 'database',
        priority: 'high',
        title: 'Optimize Database Queries',
        description: `Average query time is ${performanceMetrics.averageDatabaseTime.toFixed(2)}ms. Consider adding indexes or optimizing slow queries.`,
        action: 'Review slow queries and add appropriate indexes'
      })
    }
    
    // Cache recommendations
    if (performanceMetrics.cacheHitRate < PERFORMANCE_THRESHOLDS.CACHE_HIT_RATE.WARNING) {
      recommendations.push({
        type: 'cache',
        priority: 'medium',
        title: 'Improve Cache Hit Rate',
        description: `Cache hit rate is ${performanceMetrics.cacheHitRate.toFixed(1)}%. Consider increasing cache TTL or warming more data.`,
        action: 'Review caching strategy and increase cache coverage'
      })
    }
    
    // Error rate recommendations
    const errorRate = performanceMetrics.errors.length / performanceMetrics.totalDatabaseOperations * 100
    if (errorRate > 1) {
      recommendations.push({
        type: 'errors',
        priority: 'high',
        title: 'Reduce Error Rate',
        description: `Error rate is ${errorRate.toFixed(2)}%. Review and fix common error patterns.`,
        action: 'Investigate and fix recurring errors'
      })
    }
    
    return recommendations
  }

  /**
   * Format duration for display
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}d ${hours % 24}h`
    if (hours > 0) return `${hours}h ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  /**
   * Export performance data
   */
  exportPerformanceData(format = 'json') {
    const data = {
      metrics: performanceMetrics,
      history: this.metricsHistory,
      dashboard: this.getPerformanceDashboard(),
      exportedAt: new Date().toISOString()
    }
    
    if (format === 'csv') {
      return this.convertToCSV(data)
    }
    
    return JSON.stringify(data, null, 2)
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    // Simplified CSV export for metrics history
    const headers = ['timestamp', 'type', 'operation', 'duration', 'success']
    const rows = data.history.map(metric => [
      new Date(metric.timestamp).toISOString(),
      metric.type,
      metric.operation || metric.interaction || metric.page || 'unknown',
      metric.duration || 0,
      metric.success !== false
    ])
    
    return [headers, ...rows].map(row => row.join(',')).join('\n')
  }

  /**
   * Reset performance metrics
   */
  resetMetrics() {
    performanceMetrics = {
      appStartTime: Date.now(),
      totalPageLoads: 0,
      averagePageLoadTime: 0,
      totalDatabaseOperations: 0,
      databaseOperationsByType: {},
      averageDatabaseTime: 0,
      slowDatabaseOperations: 0,
      cacheOperations: 0,
      cacheHitRate: 0,
      cacheMissRate: 0,
      userInteractions: 0,
      averageInteractionTime: 0,
      errors: [],
      errorsByType: {},
      alerts: [],
      alertsByType: {},
      realtimeMetrics: {
        timestamp: Date.now(),
        queriesPerMinute: 0,
        cacheHitsPerMinute: 0,
        errorsPerMinute: 0,
        averageResponseTime: 0
      }
    }
    
    this.metricsHistory = []
    console.log('📊 Performance metrics reset')
  }
}

// Create global performance monitor instance
export const performanceMonitor = new PerformanceMonitor()

// Convenience functions for tracking
export const trackDatabaseOperation = (operation, table, duration, success, metadata) => 
  performanceMonitor.trackDatabaseOperation(operation, table, duration, success, metadata)

export const trackCacheOperation = (operation, hit, duration, metadata) => 
  performanceMonitor.trackCacheOperation(operation, hit, duration, metadata)

export const trackUserInteraction = (interaction, duration, metadata) => 
  performanceMonitor.trackUserInteraction(interaction, duration, metadata)

export const trackPageLoad = (page, duration, metadata) => 
  performanceMonitor.trackPageLoad(page, duration, metadata)

export const recordLoadTime = (component, duration, metadata) => 
  performanceMonitor.recordLoadTime(component, duration, metadata)

export const trackError = (error, context) => 
  performanceMonitor.trackError(error, context)

// Export performance dashboard
export const getPerformanceDashboard = () => 
  performanceMonitor.getPerformanceDashboard()

// Export performance data
export const exportPerformanceData = (format) => 
  performanceMonitor.exportPerformanceData(format)

// Auto-start monitoring in browser environment
if (typeof window !== 'undefined') {
  // Track page load performance
  window.addEventListener('load', () => {
    const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart
    trackPageLoad(window.location.pathname, loadTime)
  })
  
  // Track unhandled errors
  window.addEventListener('error', (event) => {
    trackError(new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    })
  })
  
  // Track unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    trackError(new Error(event.reason), {
      type: 'unhandled_promise_rejection'
    })
  })
}

export default performanceMonitor