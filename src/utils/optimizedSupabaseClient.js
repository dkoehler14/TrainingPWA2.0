/**
 * Optimized Supabase Client Wrapper
 * 
 * This module provides an optimized wrapper around the Supabase client with:
 * - Automatic performance monitoring
 * - Query optimization
 * - Connection pooling
 * - Enhanced caching integration
 * - Error handling and retry logic
 */

import { supabase } from '../config/supabase'
import { supabaseCache } from '../api/supabaseCache'
import { executeOptimizedQuery, queryOptimizer, connectionPoolManager } from './queryOptimizer'
import { performanceMonitor } from './performanceMonitor'

/**
 * Optimized Supabase Client Class
 */
export class OptimizedSupabaseClient {
  constructor(client = supabase) {
    this.client = client
    this.defaultOptions = {
      useCache: true,
      useOptimization: true,
      useConnectionPool: true,
      usePerformanceMonitoring: true,
      retryOnFailure: true,
      maxRetries: 3
    }
  }

  /**
   * Create an optimized query builder
   */
  from(table) {
    return new OptimizedQueryBuilder(this.client.from(table), table, this.defaultOptions)
  }

  /**
   * Execute RPC with optimization
   */
  async rpc(functionName, params = {}, options = {}) {
    const mergedOptions = { ...this.defaultOptions, ...options }
    const startTime = performance.now()
    
    try {
      if (mergedOptions.usePerformanceMonitoring) {
        performanceMonitor.trackDatabaseOperation('rpc', functionName, 0, true, { params })
      }

      const result = mergedOptions.useConnectionPool
        ? await connectionPoolManager.executeWithPool(() => this.client.rpc(functionName, params))
        : await this.client.rpc(functionName, params)

      const duration = performance.now() - startTime
      
      if (mergedOptions.usePerformanceMonitoring) {
        performanceMonitor.trackDatabaseOperation('rpc', functionName, duration, !result.error, { 
          params,
          rowCount: result.data ? (Array.isArray(result.data) ? result.data.length : 1) : 0
        })
      }

      return result
    } catch (error) {
      const duration = performance.now() - startTime
      
      if (mergedOptions.usePerformanceMonitoring) {
        performanceMonitor.trackDatabaseOperation('rpc', functionName, duration, false, { params, error: error.message })
        performanceMonitor.trackError(error, { operation: 'rpc', functionName, params })
      }

      throw error
    }
  }

  /**
   * Get auth user with caching
   */
  async getUser(options = {}) {
    const mergedOptions = { ...this.defaultOptions, ...options }
    const cacheKey = 'auth_user'
    const cacheTTL = 5 * 60 * 1000 // 5 minutes

    if (mergedOptions.useCache) {
      return supabaseCache.getWithCache(
        cacheKey,
        () => this.client.auth.getUser(),
        { ttl: cacheTTL, table: 'auth', tags: ['auth', 'user'] }
      )
    }

    return this.client.auth.getUser()
  }

  /**
   * Get session with caching
   */
  async getSession(options = {}) {
    const mergedOptions = { ...this.defaultOptions, ...options }
    const cacheKey = 'auth_session'
    const cacheTTL = 5 * 60 * 1000 // 5 minutes

    if (mergedOptions.useCache) {
      return supabaseCache.getWithCache(
        cacheKey,
        () => this.client.auth.getSession(),
        { ttl: cacheTTL, table: 'auth', tags: ['auth', 'session'] }
      )
    }

    return this.client.auth.getSession()
  }

  /**
   * Access auth methods
   */
  get auth() {
    return this.client.auth
  }

  /**
   * Access realtime methods
   */
  get realtime() {
    return this.client.realtime
  }

  /**
   * Create realtime channel with monitoring
   */
  channel(name, options = {}) {
    const channel = this.client.channel(name, options)
    
    // Add performance monitoring to channel events
    const originalOn = channel.on.bind(channel)
    channel.on = (event, filter, callback) => {
      const wrappedCallback = (...args) => {
        const startTime = performance.now()
        try {
          const result = callback(...args)
          const duration = performance.now() - startTime
          performanceMonitor.trackUserInteraction(`realtime_${event}`, duration, { channel: name, filter })
          return result
        } catch (error) {
          performanceMonitor.trackError(error, { operation: 'realtime_callback', channel: name, event })
          throw error
        }
      }
      return originalOn(event, filter, wrappedCallback)
    }

    return channel
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      queryOptimizer: queryOptimizer.performanceMonitor.getPerformanceStats(),
      connectionPool: connectionPoolManager.getConnectionStats(),
      performance: performanceMonitor.getPerformanceDashboard(),
      cache: supabaseCache.getEnhancedStats()
    }
  }
}

/**
 * Optimized Query Builder Class
 */
export class OptimizedQueryBuilder {
  constructor(queryBuilder, table, defaultOptions = {}) {
    this.queryBuilder = queryBuilder
    this.table = table
    this.options = { ...defaultOptions }
    this.operation = 'select'
    this.queryMetadata = {
      filters: {},
      joins: [],
      orderBy: [],
      limit: null,
      select: '*'
    }
  }

  /**
   * Select columns with optimization hints
   */
  select(columns = '*', options = {}) {
    this.queryMetadata.select = columns
    this.queryBuilder = this.queryBuilder.select(columns, options)
    return this
  }

  /**
   * Filter with performance tracking
   */
  eq(column, value) {
    this.queryMetadata.filters[column] = { operator: 'eq', value }
    this.queryBuilder = this.queryBuilder.eq(column, value)
    return this
  }

  neq(column, value) {
    this.queryMetadata.filters[column] = { operator: 'neq', value }
    this.queryBuilder = this.queryBuilder.neq(column, value)
    return this
  }

  gt(column, value) {
    this.queryMetadata.filters[column] = { operator: 'gt', value }
    this.queryBuilder = this.queryBuilder.gt(column, value)
    return this
  }

  gte(column, value) {
    this.queryMetadata.filters[column] = { operator: 'gte', value }
    this.queryBuilder = this.queryBuilder.gte(column, value)
    return this
  }

  lt(column, value) {
    this.queryMetadata.filters[column] = { operator: 'lt', value }
    this.queryBuilder = this.queryBuilder.lt(column, value)
    return this
  }

  lte(column, value) {
    this.queryMetadata.filters[column] = { operator: 'lte', value }
    this.queryBuilder = this.queryBuilder.lte(column, value)
    return this
  }

  like(column, pattern) {
    this.queryMetadata.filters[column] = { operator: 'like', value: pattern }
    this.queryBuilder = this.queryBuilder.like(column, pattern)
    return this
  }

  ilike(column, pattern) {
    this.queryMetadata.filters[column] = { operator: 'ilike', value: pattern }
    this.queryBuilder = this.queryBuilder.ilike(column, pattern)
    return this
  }

  in(column, values) {
    this.queryMetadata.filters[column] = { operator: 'in', value: values }
    this.queryBuilder = this.queryBuilder.in(column, values)
    return this
  }

  /**
   * Order with optimization
   */
  order(column, options = {}) {
    this.queryMetadata.orderBy.push({ column, ...options })
    this.queryBuilder = this.queryBuilder.order(column, options)
    return this
  }

  /**
   * Limit with optimization
   */
  limit(count) {
    this.queryMetadata.limit = count
    this.queryBuilder = this.queryBuilder.limit(count)
    return this
  }

  /**
   * Range with optimization
   */
  range(from, to) {
    this.queryMetadata.range = { from, to }
    this.queryBuilder = this.queryBuilder.range(from, to)
    return this
  }

  /**
   * Single result with caching
   */
  single() {
    this.queryBuilder = this.queryBuilder.single()
    return this
  }

  /**
   * Maybe single result
   */
  maybeSingle() {
    this.queryBuilder = this.queryBuilder.maybeSingle()
    return this
  }

  /**
   * Insert with performance monitoring
   */
  insert(values, options = {}) {
    this.operation = 'insert'
    this.queryBuilder = this.queryBuilder.insert(values, options)
    return this
  }

  /**
   * Update with performance monitoring
   */
  update(values, options = {}) {
    this.operation = 'update'
    this.queryBuilder = this.queryBuilder.update(values, options)
    return this
  }

  /**
   * Delete with performance monitoring
   */
  delete(options = {}) {
    this.operation = 'delete'
    this.queryBuilder = this.queryBuilder.delete(options)
    return this
  }

  /**
   * Execute query with full optimization
   */
  async execute(options = {}) {
    const mergedOptions = { ...this.options, ...options }
    const startTime = performance.now()
    
    try {
      // Generate cache key for select operations
      let cacheKey = null
      if (this.operation === 'select' && mergedOptions.useCache) {
        cacheKey = this.generateCacheKey()
      }

      // Execute with caching if applicable
      if (cacheKey && mergedOptions.useCache) {
        const result = await supabaseCache.getWithCache(
          cacheKey,
          () => this.executeQuery(mergedOptions),
          {
            ttl: mergedOptions.cacheTTL || 15 * 60 * 1000,
            table: this.table,
            tags: [this.table, this.operation],
            userId: mergedOptions.userId
          }
        )
        return { data: result, error: null }
      }

      // Execute without caching
      return await this.executeQuery(mergedOptions)

    } catch (error) {
      const duration = performance.now() - startTime
      
      if (mergedOptions.usePerformanceMonitoring) {
        performanceMonitor.trackDatabaseOperation(
          this.operation, 
          this.table, 
          duration, 
          false, 
          { 
            queryMetadata: this.queryMetadata,
            error: error.message 
          }
        )
        performanceMonitor.trackError(error, { 
          operation: this.operation, 
          table: this.table, 
          queryMetadata: this.queryMetadata 
        })
      }

      throw error
    }
  }

  /**
   * Execute the actual query
   */
  async executeQuery(options) {
    const startTime = performance.now()

    // Apply query optimization
    const result = options.useOptimization
      ? await executeOptimizedQuery(this.queryBuilder, {
          table: this.table,
          operation: this.operation,
          useConnectionPool: options.useConnectionPool,
          ...this.queryMetadata
        })
      : await this.queryBuilder

    const duration = performance.now() - startTime

    // Track performance
    if (options.usePerformanceMonitoring) {
      performanceMonitor.trackDatabaseOperation(
        this.operation,
        this.table,
        duration,
        !result.error,
        {
          queryMetadata: this.queryMetadata,
          rowCount: result.data ? (Array.isArray(result.data) ? result.data.length : 1) : 0,
          dataSize: result.data ? JSON.stringify(result.data).length : 0
        }
      )
    }

    return result
  }

  /**
   * Generate cache key based on query parameters
   */
  generateCacheKey() {
    const keyData = {
      table: this.table,
      operation: this.operation,
      select: this.queryMetadata.select,
      filters: this.queryMetadata.filters,
      orderBy: this.queryMetadata.orderBy,
      limit: this.queryMetadata.limit,
      range: this.queryMetadata.range
    }
    
    return `optimized_${JSON.stringify(keyData)}`
  }

  /**
   * Set cache options
   */
  cache(options = {}) {
    this.options = { ...this.options, ...options, useCache: true }
    return this
  }

  /**
   * Disable caching for this query
   */
  noCache() {
    this.options = { ...this.options, useCache: false }
    return this
  }

  /**
   * Set optimization options
   */
  optimize(options = {}) {
    this.options = { ...this.options, ...options, useOptimization: true }
    return this
  }

  /**
   * Disable optimization for this query
   */
  noOptimize() {
    this.options = { ...this.options, useOptimization: false }
    return this
  }

  /**
   * Set performance monitoring options
   */
  monitor(options = {}) {
    this.options = { ...this.options, ...options, usePerformanceMonitoring: true }
    return this
  }

  /**
   * Disable performance monitoring for this query
   */
  noMonitor() {
    this.options = { ...this.options, usePerformanceMonitoring: false }
    return this
  }

  /**
   * Promise interface for backward compatibility
   */
  then(onFulfilled, onRejected) {
    return this.execute().then(onFulfilled, onRejected)
  }

  catch(onRejected) {
    return this.execute().catch(onRejected)
  }

  finally(onFinally) {
    return this.execute().finally(onFinally)
  }
}

// Create optimized client instance
export const optimizedSupabase = new OptimizedSupabaseClient()

/**
 * Convenience functions for common operations
 */

/**
 * Execute a cached query with automatic optimization
 */
export async function cachedQuery(table, queryFn, options = {}) {
  const {
    cacheKey,
    cacheTTL = 15 * 60 * 1000,
    userId = null,
    tags = []
  } = options

  const key = cacheKey || `cached_query_${table}_${Date.now()}`
  
  return supabaseCache.getWithCache(
    key,
    async () => {
      const result = await queryFn(optimizedSupabase.from(table))
      return result.data
    },
    {
      ttl: cacheTTL,
      table,
      tags: [table, ...tags],
      userId
    }
  )
}

/**
 * Execute a query with full performance monitoring
 */
export async function monitoredQuery(table, queryFn, options = {}) {
  const startTime = performance.now()
  const operation = options.operation || 'select'
  
  try {
    const result = await queryFn(optimizedSupabase.from(table))
    const duration = performance.now() - startTime
    
    performanceMonitor.trackDatabaseOperation(
      operation,
      table,
      duration,
      !result.error,
      {
        rowCount: result.data ? (Array.isArray(result.data) ? result.data.length : 1) : 0,
        ...options.metadata
      }
    )
    
    return result
  } catch (error) {
    const duration = performance.now() - startTime
    
    performanceMonitor.trackDatabaseOperation(operation, table, duration, false, {
      error: error.message,
      ...options.metadata
    })
    
    performanceMonitor.trackError(error, { operation, table })
    throw error
  }
}

/**
 * Batch execute multiple queries with optimization
 */
export async function batchExecute(queries, options = {}) {
  const {
    useConnectionPool = true,
    maxConcurrency = 5,
    retryOnFailure = true
  } = options

  const startTime = performance.now()
  
  try {
    // Execute queries in batches to avoid overwhelming the connection pool
    const results = []
    for (let i = 0; i < queries.length; i += maxConcurrency) {
      const batch = queries.slice(i, i + maxConcurrency)
      const batchPromises = batch.map(async (query, index) => {
        try {
          return await query.execute({ useConnectionPool, retryOnFailure })
        } catch (error) {
          console.error(`Batch query ${i + index} failed:`, error)
          return { data: null, error }
        }
      })
      
      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }
    
    const duration = performance.now() - startTime
    performanceMonitor.trackDatabaseOperation('batch', 'multiple', duration, true, {
      queryCount: queries.length,
      successCount: results.filter(r => !r.error).length
    })
    
    return results
  } catch (error) {
    const duration = performance.now() - startTime
    performanceMonitor.trackDatabaseOperation('batch', 'multiple', duration, false, {
      queryCount: queries.length,
      error: error.message
    })
    
    throw error
  }
}

export default optimizedSupabase