/**
 * Performance Integration Examples
 * 
 * This file demonstrates how to integrate performance monitoring
 * into existing services and components.
 */

import { optimizedSupabase } from '../utils/optimizedSupabaseClient'
import { performanceMonitoringService, withPerformanceMonitoring, usePerformanceMonitoring } from '../services/performanceMonitoringService'
import { performanceMonitor } from '../utils/performanceMonitor'

/**
 * Example 1: Using Optimized Supabase Client
 * 
 * Replace regular supabase calls with optimized client for automatic monitoring
 */

// Before (regular supabase)
// const { data, error } = await supabase.from('users').select('*').eq('id', userId)

// After (optimized with monitoring)
const getUserWithMonitoring = async (userId) => {
  const result = await optimizedSupabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .cache({ cacheTTL: 10 * 60 * 1000 }) // 10 minutes cache
    .optimize({ useIndex: true })
    .monitor({ userId })
    .execute()
  
  return result
}

/**
 * Example 2: Manual Performance Tracking
 */

const processUserData = async (userData) => {
  const startTime = performance.now()
  
  try {
    // Your processing logic here
    const processedData = await someProcessingFunction(userData)
    
    const duration = performance.now() - startTime
    performanceMonitoringService.trackCustomMetric('user_data_processing', duration, {
      userCount: userData.length,
      success: true
    })
    
    return processedData
  } catch (error) {
    const duration = performance.now() - startTime
    performanceMonitoringService.trackCustomMetric('user_data_processing', duration, {
      userCount: userData.length,
      success: false,
      error: error.message
    })
    
    performanceMonitoringService.trackError(error, {
      operation: 'user_data_processing',
      userCount: userData.length
    })
    
    throw error
  }
}

/**
 * Example 3: Using Performance Monitoring Hook in React Components
 */

import React, { useEffect, useState } from 'react'

const UserProfileComponent = ({ userId }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  
  // Use performance monitoring hook
  const { trackMetric, trackFeature, trackError } = usePerformanceMonitoring('UserProfile')
  
  useEffect(() => {
    const loadUser = async () => {
      const startTime = performance.now()
      
      try {
        setLoading(true)
        
        const userData = await getUserWithMonitoring(userId)
        setUser(userData.data)
        
        const loadTime = performance.now() - startTime
        trackMetric('user_load_time', loadTime, { userId })
        trackFeature('user_profile_view', loadTime, { userId })
        
      } catch (error) {
        trackError(error, { operation: 'load_user', userId })
      } finally {
        setLoading(false)
      }
    }
    
    if (userId) {
      loadUser()
    }
  }, [userId, trackMetric, trackFeature, trackError])
  
  const handleUserUpdate = async (updates) => {
    const startTime = performance.now()
    
    try {
      await optimizedSupabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .monitor({ operation: 'user_update', userId })
        .execute()
      
      const updateTime = performance.now() - startTime
      trackFeature('user_update', updateTime, { userId, fieldsUpdated: Object.keys(updates).length })
      
      // Refresh user data
      const refreshedUser = await getUserWithMonitoring(userId)
      setUser(refreshedUser.data)
      
    } catch (error) {
      trackError(error, { operation: 'user_update', userId })
    }
  }
  
  if (loading) return <div>Loading...</div>
  
  return (
    <div>
      <h2>{user?.name}</h2>
      <p>{user?.email}</p>
      <button onClick={() => handleUserUpdate({ last_seen: new Date().toISOString() })}>
        Update Last Seen
      </button>
    </div>
  )
}

/**
 * Example 4: Higher-Order Component with Performance Monitoring
 */

const EnhancedUserProfile = withPerformanceMonitoring(UserProfileComponent, 'UserProfile')

/**
 * Example 5: Service Class with Performance Monitoring
 */

class UserService {
  constructor() {
    this.cache = new Map()
  }
  
  async getUser(userId) {
    const startTime = performance.now()
    
    try {
      // Check cache first
      if (this.cache.has(userId)) {
        const duration = performance.now() - startTime
        performanceMonitor.trackCacheOperation('user_get', true, duration, { userId })
        return this.cache.get(userId)
      }
      
      // Fetch from database
      const result = await optimizedSupabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .cache({ cacheTTL: 5 * 60 * 1000 })
        .execute()
      
      if (result.data) {
        this.cache.set(userId, result.data)
      }
      
      const duration = performance.now() - startTime
      performanceMonitor.trackDatabaseOperation('select', 'users', duration, !result.error, {
        userId,
        cached: false
      })
      
      return result.data
    } catch (error) {
      const duration = performance.now() - startTime
      performanceMonitor.trackDatabaseOperation('select', 'users', duration, false, {
        userId,
        error: error.message
      })
      
      performanceMonitor.trackError(error, {
        service: 'UserService',
        method: 'getUser',
        userId
      })
      
      throw error
    }
  }
  
  async updateUser(userId, updates) {
    const startTime = performance.now()
    
    try {
      const result = await optimizedSupabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .monitor({ operation: 'user_update', userId })
        .execute()
      
      // Invalidate cache
      this.cache.delete(userId)
      
      const duration = performance.now() - startTime
      performanceMonitoringService.trackBusinessMetric('user_updates', 1, {
        userId,
        fieldsUpdated: Object.keys(updates).length,
        duration
      })
      
      return result.data
    } catch (error) {
      const duration = performance.now() - startTime
      performanceMonitor.trackError(error, {
        service: 'UserService',
        method: 'updateUser',
        userId,
        duration
      })
      
      throw error
    }
  }
}

/**
 * Example 6: Batch Operations with Performance Monitoring
 */

const processBatchUsers = async (userIds) => {
  const startTime = performance.now()
  
  try {
    // Create optimized queries for batch processing
    const queries = userIds.map(userId => 
      optimizedSupabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .cache({ cacheTTL: 5 * 60 * 1000 })
        .optimize({ useConnectionPool: true })
    )
    
    // Execute batch with monitoring
    const results = await Promise.allSettled(queries.map(q => q.execute()))
    
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    
    const duration = performance.now() - startTime
    performanceMonitoringService.trackCustomMetric('batch_user_processing', duration, {
      totalUsers: userIds.length,
      successful,
      failed,
      batchSize: userIds.length
    })
    
    return results
  } catch (error) {
    const duration = performance.now() - startTime
    performanceMonitoringService.trackError(error, {
      operation: 'batch_user_processing',
      userCount: userIds.length,
      duration
    })
    
    throw error
  }
}

/**
 * Example 7: Real-time Performance Monitoring Setup
 */

const setupRealtimeMonitoring = () => {
  // Monitor page visibility changes
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      performanceMonitoringService.trackFeatureUsage('page_hidden', 0)
    } else {
      performanceMonitoringService.trackFeatureUsage('page_visible', 0)
    }
  })
  
  // Monitor network status changes
  window.addEventListener('online', () => {
    performanceMonitoringService.trackCustomMetric('network_status', 0, { status: 'online' })
  })
  
  window.addEventListener('offline', () => {
    performanceMonitoringService.trackCustomMetric('network_status', 0, { status: 'offline' })
  })
  
  // Monitor memory usage (if available)
  if (performance.memory) {
    setInterval(() => {
      const memoryInfo = performance.memory
      performanceMonitoringService.trackCustomMetric('memory_usage', memoryInfo.usedJSHeapSize, {
        totalHeapSize: memoryInfo.totalJSHeapSize,
        heapSizeLimit: memoryInfo.jsHeapSizeLimit
      })
    }, 30000) // Every 30 seconds
  }
  
  // Set up performance observer for Core Web Vitals
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'largest-contentful-paint') {
          performanceMonitoringService.trackCustomMetric('lcp', entry.startTime, {
            element: entry.element?.tagName
          })
        } else if (entry.entryType === 'first-input') {
          performanceMonitoringService.trackCustomMetric('fid', entry.processingStart - entry.startTime, {
            eventType: entry.name
          })
        } else if (entry.entryType === 'layout-shift') {
          performanceMonitoringService.trackCustomMetric('cls', entry.value, {
            hadRecentInput: entry.hadRecentInput
          })
        }
      }
    })
    
    observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] })
  }
}

/**
 * Example 8: Performance Alerts and Notifications
 */

const setupPerformanceAlerts = () => {
  // Listen for performance alerts
  performanceMonitor.onAlert((alert) => {
    console.warn('Performance Alert:', alert)
    
    // You could integrate with notification systems here
    if (alert.severity === 'critical') {
      // Send to error tracking service
      // notificationService.sendAlert(alert)
    }
    
    // Show user-friendly notification for severe issues
    if (alert.type === 'slow_response_time' && alert.data.currentTime > 5000) {
      // showUserNotification('The application is running slowly. Please check your connection.')
    }
  })
}

// Initialize monitoring when the module loads
if (typeof window !== 'undefined') {
  setupRealtimeMonitoring()
  setupPerformanceAlerts()
}

export {
  getUserWithMonitoring,
  processUserData,
  UserProfileComponent,
  EnhancedUserProfile,
  UserService,
  processBatchUsers,
  setupRealtimeMonitoring,
  setupPerformanceAlerts
}