/**
 * Query Optimizer for Supabase
 * 
 * This module provides query optimization capabilities including:
 * - Query performance analysis and monitoring
 * - Connection pooling management
 * - Query caching strategies
 * - Database query optimization recommendations
 */

import { supabase } from '../config/supabase'

// Query performance tracking
const queryPerformance = new Map()
const queryStats = {
  totalQueries: 0,
  slowQueries: 0,
  averageQueryTime: 0,
  queryTimesByTable: {},
  queryCountByTable: {},
  slowQueryThreshold: 1000, // 1 second
  optimizationSuggestions: []
}

// Connection pool configuration
const CONNECTION_POOL_CONFIG = {
  maxConnections: 20,
  idleTimeout: 30000, // 30 seconds
  connectionTimeout: 10000, // 10 seconds
  retryAttempts: 3,
  retryDelay: 1000 // 1 second
}

/**
 * Query Performance Monitor
 */
export class QueryPerformanceMonitor {
  constructor() {
    this.activeQueries = new Map()
    this.queryHistory = []
    this.maxHistorySize = 1000
  }

  /**
   * Start monitoring a query
   */
  startQuery(queryId, queryInfo) {
    this.activeQueries.set(queryId, {
      ...queryInfo,
      startTime: performance.now(),
      timestamp: Date.now()
    })
  }

  /**
   * End monitoring a query and record performance
   */
  endQuery(queryId, result = {}) {
    const queryInfo = this.activeQueries.get(queryId)
    if (!queryInfo) return

    const endTime = performance.now()
    const duration = endTime - queryInfo.startTime

    // Record performance data
    const performanceData = {
      ...queryInfo,
      duration,
      endTime,
      success: !result.error,
      error: result.error,
      rowCount: result.data ? (Array.isArray(result.data) ? result.data.length : 1) : 0,
      dataSize: result.data ? JSON.stringify(result.data).length : 0
    }

    this.recordQueryPerformance(performanceData)
    this.activeQueries.delete(queryId)

    return performanceData
  }

  /**
   * Record query performance data
   */
  recordQueryPerformance(data) {
    const { table, operation, duration, success, rowCount, dataSize } = data

    // Update global stats
    queryStats.totalQueries++
    queryStats.averageQueryTime = (queryStats.averageQueryTime * (queryStats.totalQueries - 1) + duration) / queryStats.totalQueries

    if (duration > queryStats.slowQueryThreshold) {
      queryStats.slowQueries++
    }

    // Update table-specific stats
    if (!queryStats.queryTimesByTable[table]) {
      queryStats.queryTimesByTable[table] = []
      queryStats.queryCountByTable[table] = 0
    }

    queryStats.queryTimesByTable[table].push(duration)
    queryStats.queryCountByTable[table]++

    // Keep only last 100 query times per table
    if (queryStats.queryTimesByTable[table].length > 100) {
      queryStats.queryTimesByTable[table].shift()
    }

    // Add to query history
    this.queryHistory.push(data)
    if (this.queryHistory.length > this.maxHistorySize) {
      this.queryHistory.shift()
    }

    // Generate optimization suggestions for slow queries
    if (duration > queryStats.slowQueryThreshold) {
      this.generateOptimizationSuggestion(data)
    }

    // Log performance data
    console.log(`📊 Query Performance: ${table}.${operation} - ${duration.toFixed(2)}ms (${rowCount} rows, ${this.formatBytes(dataSize)})`)
  }

  /**
   * Generate optimization suggestions for slow queries
   */
  generateOptimizationSuggestion(data) {
    const { table, operation, duration, queryDetails } = data
    
    const suggestion = {
      timestamp: Date.now(),
      table,
      operation,
      duration,
      type: 'slow_query',
      suggestions: []
    }

    // Analyze query patterns and suggest optimizations
    if (operation === 'select') {
      // Check for missing indexes
      if (queryDetails?.filters) {
        const filterColumns = Object.keys(queryDetails.filters)
        suggestion.suggestions.push({
          type: 'index',
          message: `Consider adding indexes on columns: ${filterColumns.join(', ')}`,
          priority: 'high'
        })
      }

      // Check for large result sets
      if (data.rowCount > 1000) {
        suggestion.suggestions.push({
          type: 'pagination',
          message: 'Consider implementing pagination for large result sets',
          priority: 'medium'
        })
      }

      // Check for complex joins
      if (queryDetails?.joins && queryDetails.joins.length > 2) {
        suggestion.suggestions.push({
          type: 'join_optimization',
          message: 'Consider optimizing complex joins or denormalizing data',
          priority: 'medium'
        })
      }
    }

    // Check for frequent queries that could benefit from caching
    const recentSimilarQueries = this.queryHistory
      .filter(q => q.table === table && q.operation === operation)
      .slice(-10)

    if (recentSimilarQueries.length >= 5) {
      suggestion.suggestions.push({
        type: 'caching',
        message: 'This query is executed frequently and could benefit from caching',
        priority: 'high'
      })
    }

    queryStats.optimizationSuggestions.push(suggestion)

    // Keep only last 50 suggestions
    if (queryStats.optimizationSuggestions.length > 50) {
      queryStats.optimizationSuggestions.shift()
    }
  }

  /**
   * Get query performance statistics
   */
  getPerformanceStats() {
    const tableStats = {}
    
    for (const [table, times] of Object.entries(queryStats.queryTimesByTable)) {
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length
      const maxTime = Math.max(...times)
      const minTime = Math.min(...times)
      
      tableStats[table] = {
        queryCount: queryStats.queryCountByTable[table],
        averageTime: avgTime.toFixed(2),
        maxTime: maxTime.toFixed(2),
        minTime: minTime.toFixed(2),
        slowQueries: times.filter(time => time > queryStats.slowQueryThreshold).length
      }
    }

    return {
      ...queryStats,
      tableStats,
      slowQueryPercentage: queryStats.totalQueries > 0 ? 
        ((queryStats.slowQueries / queryStats.totalQueries) * 100).toFixed(2) : 0,
      recentSuggestions: queryStats.optimizationSuggestions.slice(-10)
    }
  }

  /**
   * Get slow queries analysis
   */
  getSlowQueriesAnalysis() {
    const slowQueries = this.queryHistory
      .filter(q => q.duration > queryStats.slowQueryThreshold)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 20)

    return {
      count: slowQueries.length,
      queries: slowQueries.map(q => ({
        table: q.table,
        operation: q.operation,
        duration: q.duration.toFixed(2),
        timestamp: new Date(q.timestamp).toISOString(),
        rowCount: q.rowCount,
        dataSize: this.formatBytes(q.dataSize)
      }))
    }
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
}

/**
 * Query Optimizer class
 */
export class QueryOptimizer {
  constructor() {
    this.performanceMonitor = new QueryPerformanceMonitor()
    this.optimizedQueries = new Map()
    this.indexSuggestions = new Set()
  }

  /**
   * Optimize a Supabase query builder
   */
  optimizeQuery(queryBuilder, options = {}) {
    const {
      table,
      operation = 'select',
      useIndex = true,
      enablePagination = true,
      maxRows = 1000,
      cacheKey = null
    } = options

    // Generate unique query ID for monitoring
    const queryId = this.generateQueryId(table, operation)
    
    // Start performance monitoring
    this.performanceMonitor.startQuery(queryId, {
      table,
      operation,
      queryDetails: options
    })

    // Apply optimizations
    let optimizedQuery = queryBuilder

    // Add pagination for large result sets
    if (enablePagination && operation === 'select' && !options.limit) {
      optimizedQuery = optimizedQuery.limit(maxRows)
    }

    // Add query hints for better performance
    if (useIndex && options.indexHint) {
      // Note: Supabase/PostgreSQL doesn't support query hints like MySQL
      // But we can optimize the query structure
      optimizedQuery = this.applyIndexOptimizations(optimizedQuery, options.indexHint)
    }

    // Wrap the query execution with monitoring
    const originalExecute = optimizedQuery.then?.bind(optimizedQuery) || 
                           optimizedQuery.execute?.bind(optimizedQuery)

    if (originalExecute) {
      return originalExecute().then(result => {
        this.performanceMonitor.endQuery(queryId, result)
        return result
      }).catch(error => {
        this.performanceMonitor.endQuery(queryId, { error })
        throw error
      })
    }

    return optimizedQuery
  }

  /**
   * Apply index-based optimizations
   */
  applyIndexOptimizations(queryBuilder, indexHint) {
    // For PostgreSQL/Supabase, we can optimize by:
    // 1. Ensuring proper column order in WHERE clauses
    // 2. Using appropriate operators
    // 3. Structuring joins efficiently
    
    // This is a placeholder for more sophisticated optimizations
    return queryBuilder
  }

  /**
   * Generate unique query ID
   */
  generateQueryId(table, operation) {
    return `${table}_${operation}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Analyze query patterns and suggest indexes
   */
  analyzeAndSuggestIndexes() {
    const stats = this.performanceMonitor.getPerformanceStats()
    const suggestions = []

    // Analyze slow queries by table
    for (const [table, tableStats] of Object.entries(stats.tableStats)) {
      if (tableStats.slowQueries > 0) {
        // Suggest indexes based on common query patterns
        const commonFilters = this.getCommonFiltersForTable(table)
        
        if (commonFilters.length > 0) {
          suggestions.push({
            table,
            type: 'composite_index',
            columns: commonFilters,
            reason: `${tableStats.slowQueries} slow queries detected`,
            priority: tableStats.slowQueries > 5 ? 'high' : 'medium',
            estimatedImprovement: this.estimateIndexImprovement(tableStats)
          })
        }
      }
    }

    return suggestions
  }

  /**
   * Get common filter columns for a table
   */
  getCommonFiltersForTable(table) {
    const recentQueries = this.performanceMonitor.queryHistory
      .filter(q => q.table === table && q.queryDetails?.filters)
      .slice(-50)

    const filterCounts = {}
    
    recentQueries.forEach(query => {
      if (query.queryDetails?.filters) {
        Object.keys(query.queryDetails.filters).forEach(column => {
          filterCounts[column] = (filterCounts[column] || 0) + 1
        })
      }
    })

    // Return columns used in more than 20% of queries
    const threshold = Math.max(1, Math.floor(recentQueries.length * 0.2))
    return Object.entries(filterCounts)
      .filter(([, count]) => count >= threshold)
      .sort(([, a], [, b]) => b - a)
      .map(([column]) => column)
  }

  /**
   * Estimate performance improvement from index
   */
  estimateIndexImprovement(tableStats) {
    const avgTime = parseFloat(tableStats.averageTime)
    const slowQueries = tableStats.slowQueries
    
    if (avgTime > 1000) {
      return '50-70%'
    } else if (avgTime > 500) {
      return '30-50%'
    } else if (slowQueries > 0) {
      return '20-30%'
    }
    
    return '10-20%'
  }

  /**
   * Get optimization recommendations
   */
  getOptimizationRecommendations() {
    const stats = this.performanceMonitor.getPerformanceStats()
    const indexSuggestions = this.analyzeAndSuggestIndexes()
    const slowQueries = this.performanceMonitor.getSlowQueriesAnalysis()

    return {
      summary: {
        totalQueries: stats.totalQueries,
        slowQueries: stats.slowQueries,
        slowQueryPercentage: stats.slowQueryPercentage,
        averageQueryTime: stats.averageQueryTime.toFixed(2)
      },
      indexSuggestions,
      slowQueries: slowQueries.queries.slice(0, 10),
      recentSuggestions: stats.recentSuggestions,
      tablePerformance: stats.tableStats
    }
  }
}

/**
 * Connection Pool Manager
 */
export class ConnectionPoolManager {
  constructor(config = CONNECTION_POOL_CONFIG) {
    this.config = config
    this.activeConnections = 0
    this.connectionQueue = []
    this.connectionStats = {
      totalConnections: 0,
      activeConnections: 0,
      queuedRequests: 0,
      connectionErrors: 0,
      averageConnectionTime: 0
    }
  }

  /**
   * Execute query with connection pooling
   */
  async executeWithPool(queryFn, options = {}) {
    const startTime = performance.now()
    
    try {
      // Check connection limits
      if (this.activeConnections >= this.config.maxConnections) {
        await this.waitForConnection()
      }

      this.activeConnections++
      this.connectionStats.activeConnections = this.activeConnections
      this.connectionStats.totalConnections++

      // Execute query with timeout
      const result = await Promise.race([
        queryFn(),
        this.createTimeoutPromise(this.config.connectionTimeout)
      ])

      const connectionTime = performance.now() - startTime
      this.updateConnectionStats(connectionTime, true)

      return result

    } catch (error) {
      this.connectionStats.connectionErrors++
      this.updateConnectionStats(performance.now() - startTime, false)
      
      // Retry logic
      if (options.retry !== false && this.shouldRetry(error)) {
        return this.retryWithBackoff(queryFn, options)
      }
      
      throw error
    } finally {
      this.activeConnections--
      this.connectionStats.activeConnections = this.activeConnections
      this.processConnectionQueue()
    }
  }

  /**
   * Wait for available connection
   */
  async waitForConnection() {
    return new Promise((resolve) => {
      this.connectionQueue.push(resolve)
      this.connectionStats.queuedRequests = this.connectionQueue.length
    })
  }

  /**
   * Process connection queue
   */
  processConnectionQueue() {
    if (this.connectionQueue.length > 0 && this.activeConnections < this.config.maxConnections) {
      const resolve = this.connectionQueue.shift()
      this.connectionStats.queuedRequests = this.connectionQueue.length
      resolve()
    }
  }

  /**
   * Create timeout promise
   */
  createTimeoutPromise(timeout) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Query timeout after ${timeout}ms`))
      }, timeout)
    })
  }

  /**
   * Check if error should trigger retry
   */
  shouldRetry(error) {
    // Retry on connection errors, timeouts, and temporary failures
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'Query timeout',
      'Connection lost'
    ]

    return retryableErrors.some(errorType => 
      error.message?.includes(errorType) || error.code === errorType
    )
  }

  /**
   * Retry with exponential backoff
   */
  async retryWithBackoff(queryFn, options, attempt = 1) {
    if (attempt > this.config.retryAttempts) {
      throw new Error(`Query failed after ${this.config.retryAttempts} attempts`)
    }

    const delay = this.config.retryDelay * Math.pow(2, attempt - 1)
    await new Promise(resolve => setTimeout(resolve, delay))

    console.log(`🔄 Retrying query (attempt ${attempt}/${this.config.retryAttempts})`)

    try {
      return await this.executeWithPool(queryFn, { ...options, retry: false })
    } catch (error) {
      return this.retryWithBackoff(queryFn, options, attempt + 1)
    }
  }

  /**
   * Update connection statistics
   */
  updateConnectionStats(connectionTime, success) {
    if (success) {
      this.connectionStats.averageConnectionTime = 
        (this.connectionStats.averageConnectionTime * (this.connectionStats.totalConnections - 1) + connectionTime) / 
        this.connectionStats.totalConnections
    }
  }

  /**
   * Get connection pool statistics
   */
  getConnectionStats() {
    return {
      ...this.connectionStats,
      maxConnections: this.config.maxConnections,
      queueLength: this.connectionQueue.length,
      connectionUtilization: ((this.activeConnections / this.config.maxConnections) * 100).toFixed(2) + '%',
      errorRate: this.connectionStats.totalConnections > 0 ? 
        ((this.connectionStats.connectionErrors / this.connectionStats.totalConnections) * 100).toFixed(2) + '%' : '0%'
    }
  }
}

// Create global instances
export const queryOptimizer = new QueryOptimizer()
export const connectionPoolManager = new ConnectionPoolManager()

/**
 * Optimized query execution wrapper
 */
export async function executeOptimizedQuery(queryBuilder, options = {}) {
  const {
    table = 'unknown',
    operation = 'select',
    useConnectionPool = true,
    ...optimizationOptions
  } = options

  // Apply query optimizations
  const optimizedQuery = queryOptimizer.optimizeQuery(queryBuilder, {
    table,
    operation,
    ...optimizationOptions
  })

  // Execute with connection pooling if enabled
  if (useConnectionPool) {
    return connectionPoolManager.executeWithPool(() => optimizedQuery, options)
  }

  return optimizedQuery
}

/**
 * Get comprehensive performance report
 */
export function getPerformanceReport() {
  return {
    queryPerformance: queryOptimizer.performanceMonitor.getPerformanceStats(),
    connectionPool: connectionPoolManager.getConnectionStats(),
    optimizationRecommendations: queryOptimizer.getOptimizationRecommendations(),
    slowQueries: queryOptimizer.performanceMonitor.getSlowQueriesAnalysis(),
    timestamp: new Date().toISOString()
  }
}

/**
 * Export monitoring functions for external use
 */
export const monitoring = {
  startQuery: (queryId, queryInfo) => queryOptimizer.performanceMonitor.startQuery(queryId, queryInfo),
  endQuery: (queryId, result) => queryOptimizer.performanceMonitor.endQuery(queryId, result),
  getStats: () => queryOptimizer.performanceMonitor.getPerformanceStats(),
  getSlowQueries: () => queryOptimizer.performanceMonitor.getSlowQueriesAnalysis()
}