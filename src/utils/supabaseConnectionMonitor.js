/**
 * Supabase Connection Monitoring Utilities
 * 
 * This module provides connection monitoring, health checks, and
 * connection recovery mechanisms for Supabase.
 */

import { executeSupabaseOperation } from './supabaseErrorHandler'

/**
 * Connection status constants
 */
export const CONNECTION_STATUS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  ERROR: 'error',
  UNKNOWN: 'unknown'
}

/**
 * Connection monitor class
 */
export class SupabaseConnectionMonitor {
  constructor(supabaseClient) {
    this.client = supabaseClient
    this.status = CONNECTION_STATUS.UNKNOWN
    this.lastHealthCheck = null
    this.healthCheckInterval = null
    this.listeners = new Set()
    this.realtimeChannel = null
    this.connectionMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastError: null
    }
  }

  /**
   * Start monitoring the connection
   */
  startMonitoring(options = {}) {
    const {
      healthCheckInterval = 30000, // 30 seconds
      enableRealtimeMonitoring = true
    } = options

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck()
    }, healthCheckInterval)

    // Set up realtime connection monitoring
    if (enableRealtimeMonitoring && this.client) {
      this.setupRealtimeMonitoring()
    }

    // Perform initial health check
    this.performHealthCheck()

    console.log('🔍 Supabase connection monitoring started')
  }

  /**
   * Stop monitoring the connection
   */
  stopMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }

    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe()
      this.realtimeChannel = null
    }

    console.log('🔍 Supabase connection monitoring stopped')
  }

  /**
   * Set up realtime connection monitoring
   */
  setupRealtimeMonitoring() {
    if (!this.client) return

    this.realtimeChannel = this.client.channel('connection-monitor')

    this.realtimeChannel
      .on('system', { event: 'connected' }, () => {
        this.updateStatus(CONNECTION_STATUS.CONNECTED)
        console.log('🔗 Supabase Realtime: Connected')
      })
      .on('system', { event: 'disconnected' }, () => {
        this.updateStatus(CONNECTION_STATUS.DISCONNECTED)
        console.log('🔌 Supabase Realtime: Disconnected')
      })
      .on('system', { event: 'error' }, (error) => {
        this.updateStatus(CONNECTION_STATUS.ERROR)
        this.connectionMetrics.lastError = error
        console.error('❌ Supabase Realtime Error:', error)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Realtime monitoring channel subscribed')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Realtime monitoring channel error')
          this.updateStatus(CONNECTION_STATUS.ERROR)
        }
      })
  }

  /**
   * Perform a health check
   */
  async performHealthCheck() {
    if (!this.client) {
      this.updateStatus(CONNECTION_STATUS.ERROR)
      return false
    }

    const startTime = Date.now()
    this.connectionMetrics.totalRequests++

    try {
      // Simple query to test connection
      const { data, error } = await executeSupabaseOperation(
        () => this.client.from('users').select('count').limit(1),
        'health-check'
      )

      const responseTime = Date.now() - startTime
      this.updateResponseTime(responseTime)

      if (error && error.code !== 'PGRST116') { // PGRST116 is "table not found" which is ok
        throw error
      }

      this.connectionMetrics.successfulRequests++
      this.updateStatus(CONNECTION_STATUS.CONNECTED)
      this.lastHealthCheck = {
        timestamp: new Date().toISOString(),
        status: 'success',
        responseTime
      }

      return true
    } catch (error) {
      this.connectionMetrics.failedRequests++
      this.connectionMetrics.lastError = error
      this.updateStatus(CONNECTION_STATUS.ERROR)
      this.lastHealthCheck = {
        timestamp: new Date().toISOString(),
        status: 'error',
        error: error.message
      }

      console.error('🏥 Supabase health check failed:', error.message)
      return false
    }
  }

  /**
   * Update connection status and notify listeners
   */
  updateStatus(newStatus) {
    if (this.status !== newStatus) {
      const previousStatus = this.status
      this.status = newStatus
      
      // Notify all listeners
      this.listeners.forEach(listener => {
        try {
          listener(newStatus, previousStatus)
        } catch (error) {
          console.error('Error in connection status listener:', error)
        }
      })
    }
  }

  /**
   * Update average response time
   */
  updateResponseTime(responseTime) {
    const { successfulRequests, averageResponseTime } = this.connectionMetrics
    this.connectionMetrics.averageResponseTime = 
      (averageResponseTime * (successfulRequests - 1) + responseTime) / successfulRequests
  }

  /**
   * Add a status change listener
   */
  addStatusListener(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Get current connection status
   */
  getStatus() {
    return this.status
  }

  /**
   * Get connection metrics
   */
  getMetrics() {
    return {
      ...this.connectionMetrics,
      status: this.status,
      lastHealthCheck: this.lastHealthCheck,
      successRate: this.connectionMetrics.totalRequests > 0 
        ? (this.connectionMetrics.successfulRequests / this.connectionMetrics.totalRequests) * 100 
        : 0
    }
  }

  /**
   * Check if connection is healthy
   */
  isHealthy() {
    return this.status === CONNECTION_STATUS.CONNECTED
  }

  /**
   * Force a connection recovery attempt
   */
  async attemptRecovery() {
    console.log('🔄 Attempting Supabase connection recovery...')
    
    this.updateStatus(CONNECTION_STATUS.CONNECTING)
    
    // Try to re-establish realtime connection
    if (this.realtimeChannel) {
      this.realtimeChannel.unsubscribe()
      this.setupRealtimeMonitoring()
    }
    
    // Perform health check
    const isHealthy = await this.performHealthCheck()
    
    if (isHealthy) {
      console.log('✅ Supabase connection recovery successful')
    } else {
      console.error('❌ Supabase connection recovery failed')
    }
    
    return isHealthy
  }
}

/**
 * Global connection monitor instance
 */
let globalMonitor = null

/**
 * Initialize global connection monitoring
 */
export function initializeConnectionMonitoring(supabaseClient, options = {}) {
  if (globalMonitor) {
    globalMonitor.stopMonitoring()
  }
  
  globalMonitor = new SupabaseConnectionMonitor(supabaseClient)
  globalMonitor.startMonitoring(options)
  
  return globalMonitor
}

/**
 * Get the global connection monitor
 */
export function getConnectionMonitor() {
  return globalMonitor
}

/**
 * Stop global connection monitoring
 */
export function stopConnectionMonitoring() {
  if (globalMonitor) {
    globalMonitor.stopMonitoring()
    globalMonitor = null
  }
}

/**
 * React hook for connection status
 */
export function useConnectionStatus() {
  // Note: This hook requires React to be imported in the component using it
  // const [status, setStatus] = useState(globalMonitor ? globalMonitor.getStatus() : CONNECTION_STATUS.UNKNOWN)
  
  // For now, return a function that components can use to get status
  return function getConnectionStatus() {
    return {
      status: globalMonitor ? globalMonitor.getStatus() : CONNECTION_STATUS.UNKNOWN,
      isConnected: globalMonitor ? globalMonitor.getStatus() === CONNECTION_STATUS.CONNECTED : false,
      isConnecting: globalMonitor ? globalMonitor.getStatus() === CONNECTION_STATUS.CONNECTING : false,
      hasError: globalMonitor ? globalMonitor.getStatus() === CONNECTION_STATUS.ERROR : false,
      metrics: globalMonitor ? globalMonitor.getMetrics() : null,
      attemptRecovery: globalMonitor ? () => globalMonitor.attemptRecovery() : null
    }
  }
}

/**
 * Alternative hook implementation for React components
 * Usage: import { useState, useEffect } from 'react' in your component
 */
export function createConnectionStatusHook(useState, useEffect) {
  return function useConnectionStatus() {
    const [status, setStatus] = useState(
      globalMonitor ? globalMonitor.getStatus() : CONNECTION_STATUS.UNKNOWN
    )
    
    useEffect(() => {
      if (!globalMonitor) return
      
      // Set initial status
      setStatus(globalMonitor.getStatus())
      
      // Listen for status changes
      const unsubscribe = globalMonitor.addStatusListener((newStatus) => {
        setStatus(newStatus)
      })
      
      return unsubscribe
    }, [])
  
    return {
      status,
      isConnected: status === CONNECTION_STATUS.CONNECTED,
      isConnecting: status === CONNECTION_STATUS.CONNECTING,
      hasError: status === CONNECTION_STATUS.ERROR,
      metrics: globalMonitor ? globalMonitor.getMetrics() : null,
      attemptRecovery: globalMonitor ? () => globalMonitor.attemptRecovery() : null
    }
  }
}

/**
 * Utility to wait for connection to be established
 */
export function waitForConnection(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!globalMonitor) {
      reject(new Error('Connection monitor not initialized'))
      return
    }
    
    if (globalMonitor.isHealthy()) {
      resolve(true)
      return
    }
    
    const timeoutId = setTimeout(() => {
      unsubscribe()
      reject(new Error('Connection timeout'))
    }, timeout)
    
    const unsubscribe = globalMonitor.addStatusListener((status) => {
      if (status === CONNECTION_STATUS.CONNECTED) {
        clearTimeout(timeoutId)
        unsubscribe()
        resolve(true)
      } else if (status === CONNECTION_STATUS.ERROR) {
        clearTimeout(timeoutId)
        unsubscribe()
        reject(new Error('Connection failed'))
      }
    })
  })
}

/**
 * Development helper to log connection metrics
 */
export function logConnectionMetrics() {
  if (process.env.NODE_ENV === 'development' && globalMonitor) {
    const metrics = globalMonitor.getMetrics()
    console.table({
      'Connection Status': metrics.status,
      'Success Rate': `${metrics.successRate.toFixed(1)}%`,
      'Total Requests': metrics.totalRequests,
      'Successful Requests': metrics.successfulRequests,
      'Failed Requests': metrics.failedRequests,
      'Average Response Time': `${metrics.averageResponseTime.toFixed(0)}ms`,
      'Last Health Check': metrics.lastHealthCheck?.timestamp || 'Never'
    })
  }
}