/**
 * Performance Monitoring Service
 * 
 * This service provides easy integration of performance monitoring
 * into existing components and services. It includes:
 * - Automatic performance tracking for common operations
 * - Integration with existing services
 * - Performance alerting and notifications
 * - Automated performance reporting
 */

import { performanceMonitor } from '../utils/performanceMonitor'
import { optimizedSupabase } from '../utils/optimizedSupabaseClient'
import { supabaseCache } from '../api/supabaseCache'

/**
 * Performance Monitoring Service Class
 */
export class PerformanceMonitoringService {
  constructor() {
    this.isEnabled = process.env.NODE_ENV !== 'production' || process.env.REACT_APP_ENABLE_PERFORMANCE_MONITORING === 'true'
    this.alertThresholds = {
      slowQuery: 1000, // 1 second
      lowCacheHitRate: 60, // 60%
      highErrorRate: 5, // 5%
      highMemoryUsage: 100 * 1024 * 1024 // 100MB
    }
    
    this.setupAutomaticMonitoring()
  }

  /**
   * Setup automatic monitoring for common operations
   */
  setupAutomaticMonitoring() {
    if (!this.isEnabled) return

    // Monitor page navigation
    this.monitorPageNavigation()
    
    // Monitor user interactions
    this.monitorUserInteractions()
    
    // Monitor API calls
    this.monitorApiCalls()
    
    // Setup periodic health checks
    this.setupHealthChecks()
    
    console.log('🔍 Performance monitoring service initialized')
  }

  /**
   * Monitor page navigation performance
   */
  monitorPageNavigation() {
    if (typeof window === 'undefined') return

    // Monitor initial page load
    window.addEventListener('load', () => {
      const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart
      performanceMonitor.trackPageLoad(window.location.pathname, loadTime, {
        type: 'initial_load',
        referrer: document.referrer
      })
    })

    // Monitor route changes (for SPAs)
    let lastPath = window.location.pathname
    const observer = new MutationObserver(() => {
      const currentPath = window.location.pathname
      if (currentPath !== lastPath) {
        const navigationTime = performance.now()
        performanceMonitor.trackPageLoad(currentPath, navigationTime, {
          type: 'route_change',
          previousPath: lastPath
        })
        lastPath = currentPath
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  /**
   * Monitor user interactions
   */
  monitorUserInteractions() {
    if (typeof window === 'undefined') return

    // Monitor click interactions
    document.addEventListener('click', (event) => {
      const startTime = performance.now()
      
      // Use requestAnimationFrame to measure interaction response time
      requestAnimationFrame(() => {
        const duration = performance.now() - startTime
        const target = event.target
        const interaction = this.getInteractionName(target)
        
        performanceMonitor.trackUserInteraction(interaction, duration, {
          element: target.tagName,
          className: target.className,
          id: target.id
        })
      })
    })

    // Monitor form submissions
    document.addEventListener('submit', (event) => {
      const startTime = performance.now()
      const form = event.target
      
      setTimeout(() => {
        const duration = performance.now() - startTime
        performanceMonitor.trackUserInteraction('form_submit', duration, {
          formId: form.id,
          formAction: form.action
        })
      }, 0)
    })
  }

  /**
   * Get interaction name from element
   */
  getInteractionName(element) {
    if (element.id) return `click_${element.id}`
    if (element.className) return `click_${element.className.split(' ')[0]}`
    if (element.tagName === 'BUTTON') return 'button_click'
    if (element.tagName === 'A') return 'link_click'
    return 'element_click'
  }

  /**
   * Monitor API calls and database operations
   */
  monitorApiCalls() {
    // This would typically be integrated at the HTTP client level
    // For now, we'll rely on the optimized Supabase client monitoring
    console.log('📡 API call monitoring enabled via optimized Supabase client')
  }

  /**
   * Setup periodic health checks
   */
  setupHealthChecks() {
    // Run health checks every 5 minutes
    setInterval(() => {
      this.performHealthCheck()
    }, 5 * 60 * 1000)

    // Initial health check
    setTimeout(() => this.performHealthCheck(), 10000) // After 10 seconds
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    if (!this.isEnabled) return

    try {
      const healthData = {
        timestamp: Date.now(),
        checks: {}
      }

      // Check cache performance
      const cacheStats = supabaseCache.getEnhancedStats()
      const cacheHitRate = parseFloat(cacheStats.cachePerformance?.readReductionRate?.replace('%', '') || '0')
      
      healthData.checks.cache = {
        status: cacheHitRate >= this.alertThresholds.lowCacheHitRate ? 'healthy' : 'warning',
        hitRate: cacheHitRate,
        threshold: this.alertThresholds.lowCacheHitRate
      }

      // Check database performance
      const dbStats = optimizedSupabase.getStats()
      const avgQueryTime = parseFloat(dbStats.performance?.overview?.averageDatabaseTime?.replace('ms', '') || '0')
      
      healthData.checks.database = {
        status: avgQueryTime <= this.alertThresholds.slowQuery ? 'healthy' : 'warning',
        averageTime: avgQueryTime,
        threshold: this.alertThresholds.slowQuery
      }

      // Check memory usage (if available)
      if (performance.memory) {
        const memoryUsage = performance.memory.usedJSHeapSize
        healthData.checks.memory = {
          status: memoryUsage <= this.alertThresholds.highMemoryUsage ? 'healthy' : 'warning',
          usage: memoryUsage,
          threshold: this.alertThresholds.highMemoryUsage
        }
      }

      // Log health check results
      console.log('🏥 Health check completed:', healthData)

      // Create alerts for unhealthy checks
      Object.entries(healthData.checks).forEach(([checkName, check]) => {
        if (check.status === 'warning') {
          this.createHealthAlert(checkName, check)
        }
      })

    } catch (error) {
      console.error('❌ Health check failed:', error)
      performanceMonitor.trackError(error, { operation: 'health_check' })
    }
  }

  /**
   * Create health alert
   */
  createHealthAlert(checkName, checkData) {
    const alertMessages = {
      cache: `Cache hit rate is ${checkData.hitRate}% (threshold: ${checkData.threshold}%)`,
      database: `Average query time is ${checkData.averageTime}ms (threshold: ${checkData.threshold}ms)`,
      memory: `Memory usage is ${this.formatBytes(checkData.usage)} (threshold: ${this.formatBytes(checkData.threshold)})`
    }

    console.warn(`⚠️ Health Alert [${checkName}]: ${alertMessages[checkName]}`)
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  /**
   * Track custom performance metric
   */
  trackCustomMetric(name, value, metadata = {}) {
    if (!this.isEnabled) return

    performanceMonitor.trackUserInteraction(`custom_${name}`, value, {
      type: 'custom_metric',
      ...metadata
    })
  }

  /**
   * Track business metric
   */
  trackBusinessMetric(metric, value, metadata = {}) {
    if (!this.isEnabled) return

    performanceMonitor.trackUserInteraction(`business_${metric}`, 0, {
      type: 'business_metric',
      value,
      ...metadata
    })
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(feature, duration = 0, metadata = {}) {
    if (!this.isEnabled) return

    performanceMonitor.trackUserInteraction(`feature_${feature}`, duration, {
      type: 'feature_usage',
      ...metadata
    })
  }

  /**
   * Track error with context
   */
  trackError(error, context = {}) {
    if (!this.isEnabled) return

    performanceMonitor.trackError(error, {
      service: 'performance_monitoring',
      ...context
    })
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    if (!this.isEnabled) return null

    return performanceMonitor.getPerformanceDashboard()
  }

  /**
   * Export performance data
   */
  exportPerformanceData(format = 'json') {
    if (!this.isEnabled) return null

    return performanceMonitor.exportPerformanceData(format)
  }

  /**
   * Reset performance metrics
   */
  resetMetrics() {
    if (!this.isEnabled) return

    performanceMonitor.resetMetrics()
    console.log('📊 Performance metrics reset')
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled) {
    this.isEnabled = enabled
    console.log(`🔍 Performance monitoring ${enabled ? 'enabled' : 'disabled'}`)
  }

  /**
   * Update alert thresholds
   */
  updateThresholds(newThresholds) {
    this.alertThresholds = { ...this.alertThresholds, ...newThresholds }
    console.log('⚙️ Performance alert thresholds updated:', this.alertThresholds)
  }
}

/**
 * Higher-order component for automatic performance monitoring
 */
export function withPerformanceMonitoring(WrappedComponent, componentName) {
  return function PerformanceMonitoredComponent(props) {
    const startTime = performance.now()

    React.useEffect(() => {
      const mountTime = performance.now() - startTime
      performanceMonitoringService.trackCustomMetric(`component_mount_${componentName}`, mountTime, {
        component: componentName
      })

      return () => {
        const unmountTime = performance.now()
        performanceMonitoringService.trackCustomMetric(`component_unmount_${componentName}`, unmountTime - startTime, {
          component: componentName
        })
      }
    }, [])

    return React.createElement(WrappedComponent, props)
  }
}

/**
 * Hook for performance monitoring in functional components
 */
export function usePerformanceMonitoring(componentName) {
  const [renderCount, setRenderCount] = React.useState(0)
  const mountTime = React.useRef(performance.now())

  React.useEffect(() => {
    setRenderCount(prev => prev + 1)
  })

  React.useEffect(() => {
    const mountDuration = performance.now() - mountTime.current
    performanceMonitoringService.trackCustomMetric(`component_mount_${componentName}`, mountDuration, {
      component: componentName
    })

    return () => {
      const totalTime = performance.now() - mountTime.current
      performanceMonitoringService.trackCustomMetric(`component_lifetime_${componentName}`, totalTime, {
        component: componentName,
        renderCount
      })
    }
  }, [componentName, renderCount])

  return {
    trackMetric: (name, value, metadata) => 
      performanceMonitoringService.trackCustomMetric(`${componentName}_${name}`, value, metadata),
    trackFeature: (feature, duration, metadata) => 
      performanceMonitoringService.trackFeatureUsage(`${componentName}_${feature}`, duration, metadata),
    trackError: (error, context) => 
      performanceMonitoringService.trackError(error, { component: componentName, ...context })
  }
}

/**
 * Decorator for automatic method performance monitoring
 */
export function monitorPerformance(target, propertyName, descriptor) {
  const originalMethod = descriptor.value

  descriptor.value = async function(...args) {
    const startTime = performance.now()
    const methodName = `${target.constructor.name}.${propertyName}`

    try {
      const result = await originalMethod.apply(this, args)
      const duration = performance.now() - startTime
      
      performanceMonitoringService.trackCustomMetric(`method_${methodName}`, duration, {
        method: methodName,
        args: args.length
      })

      return result
    } catch (error) {
      const duration = performance.now() - startTime
      
      performanceMonitoringService.trackCustomMetric(`method_${methodName}`, duration, {
        method: methodName,
        args: args.length,
        error: true
      })

      performanceMonitoringService.trackError(error, {
        method: methodName
      })

      throw error
    }
  }

  return descriptor
}

// Create global service instance
export const performanceMonitoringService = new PerformanceMonitoringService()

// Convenience functions
export const trackCustomMetric = (name, value, metadata) => 
  performanceMonitoringService.trackCustomMetric(name, value, metadata)

export const trackBusinessMetric = (metric, value, metadata) => 
  performanceMonitoringService.trackBusinessMetric(metric, value, metadata)

export const trackFeatureUsage = (feature, duration, metadata) => 
  performanceMonitoringService.trackFeatureUsage(feature, duration, metadata)

export const trackError = (error, context) => 
  performanceMonitoringService.trackError(error, context)

export const getPerformanceSummary = () => 
  performanceMonitoringService.getPerformanceSummary()

export default performanceMonitoringService