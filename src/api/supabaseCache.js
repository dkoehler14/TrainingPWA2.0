/**
 * Enhanced Supabase Cache System
 * 
 * This module provides a comprehensive caching layer for Supabase queries with:
 * - TTL-based cache management
 * - Granular cache invalidation strategies
 * - Performance monitoring and statistics
 * - Query optimization and connection pooling
 * - Real-time subscription management
 */

import { supabase } from '../config/supabase'
import { getCollectionCached } from './supabaseCacheMigration'
import { createDebugLogger, logCacheOperation } from '../utils/debugUtils'
import { transformSupabaseProgramToWeeklyConfigs } from '../utils/dataTransformations'

// Cache storage and configuration
const cache = new Map()
const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes
const MAX_CACHE_SIZE = 1000 // Maximum number of cache entries
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

// Performance monitoring and statistics
let cacheStats = {
  // Basic cache metrics
  hits: 0,
  misses: 0,
  invalidations: 0,
  totalQueries: 0,
  averageQueryTime: 0,

  // Database read tracking
  supabaseReads: 0,           // Actual database reads
  cacheServedQueries: 0,      // Queries served from cache
  readReductionRate: 0,       // Percentage of reads avoided
  estimatedCost: 0,           // Estimated cost for database reads
  estimatedSavings: 0,        // Cost savings from cache hits
  readsByTable: {},           // Reads per table
  readsByTimeOfDay: {},       // Read patterns by hour
  readsByUser: {},            // Read patterns by user

  // Performance metrics
  avgDatabaseQueryTime: 0,    // Average database query time
  avgCacheQueryTime: 0,       // Average cache query time
  performanceImprovement: 0,  // Speed improvement percentage
  bandwidthUsed: 0,           // Data transferred from database (bytes)
  bandwidthSaved: 0,          // Data transfer saved through cache (bytes)

  // Session metrics
  sessionStartTime: Date.now(),
  readsThisSession: 0,
  cacheHitsThisSession: 0,

  // Detailed tracking
  queryHistory: [],           // Recent query history (last 100)
  maxHistorySize: 100,

  // Real-time subscriptions
  activeSubscriptions: 0,
  subscriptionsByTable: {}
}

// Query performance tracking
const queryPerformance = new Map()

// Supabase pricing constants (estimated)
const SUPABASE_READ_COST_PER_100K = 0.05 // Estimated $0.05 per 100,000 read
/**
 * Enhanced cache entry with metadata
 */
function createCacheEntry(data, ttl, queryInfo = {}) {
  const safeData = data || []
  return {
    data: safeData,
    expiry: Date.now() + ttl,
    createdAt: Date.now(),
    accessCount: 0,
    lastAccessed: Date.now(),
    size: JSON.stringify(safeData).length,
    queryInfo,
    tags: queryInfo.tags || []
  }
}

/**
 * Generate cache key from query parameters
 */
function getCacheKey(table, operation, params = {}) {
  const keyObj = {
    table,
    operation,
    params: {
      select: params.select,
      eq: params.eq,
      neq: params.neq,
      gt: params.gt,
      gte: params.gte,
      lt: params.lt,
      lte: params.lte,
      like: params.like,
      ilike: params.ilike,
      in: params.in,
      order: params.order,
      limit: params.limit,
      offset: params.offset,
      range: params.range
    }
  }

  return JSON.stringify(keyObj)
}

/**
 * Check if cache entry is expired
 */
function isExpired(entry) {
  return entry && entry.expiry < Date.now()
}

/**
 * Track database read operations
 */
function trackSupabaseRead(table, queryType, documentCount, dataSize, queryTime, userId = null) {
  cacheStats.supabaseReads++
  cacheStats.readsThisSession++

  // Track by table
  if (!cacheStats.readsByTable[table]) {
    cacheStats.readsByTable[table] = { reads: 0, totalTime: 0, avgTime: 0 }
  }
  cacheStats.readsByTable[table].reads++
  cacheStats.readsByTable[table].totalTime += queryTime
  cacheStats.readsByTable[table].avgTime =
    cacheStats.readsByTable[table].totalTime / cacheStats.readsByTable[table].reads

  // Track by time of day
  const hour = new Date().getHours()
  if (!cacheStats.readsByTimeOfDay[hour]) {
    cacheStats.readsByTimeOfDay[hour] = 0
  }
  cacheStats.readsByTimeOfDay[hour]++

  // Track by user if provided
  if (userId) {
    if (!cacheStats.readsByUser[userId]) {
      cacheStats.readsByUser[userId] = {
        totalReads: 0,
        cacheHits: 0,
        tables: {},
        lastActivity: Date.now(),
        estimatedCost: 0
      }
    }

    const userStats = cacheStats.readsByUser[userId]
    userStats.totalReads++
    userStats.lastActivity = Date.now()
    userStats.estimatedCost = (userStats.totalReads / 100000) * SUPABASE_READ_COST_PER_100K

    if (!userStats.tables[table]) {
      userStats.tables[table] = 0
    }
    userStats.tables[table]++
  }

  // Update bandwidth tracking
  cacheStats.bandwidthUsed += dataSize

  // Calculate estimated cost
  cacheStats.estimatedCost = (cacheStats.supabaseReads / 100000) * SUPABASE_READ_COST_PER_100K

  // Update average database query time
  cacheStats.avgDatabaseQueryTime = cacheStats.avgDatabaseQueryTime * 0.9 + queryTime * 0.1

  // Add to query history
  const historyEntry = {
    timestamp: Date.now(),
    type: 'database-read',
    table,
    queryType,
    documentCount,
    dataSize,
    queryTime,
    userId
  }

  cacheStats.queryHistory.push(historyEntry)
  if (cacheStats.queryHistory.length > cacheStats.maxHistorySize) {
    cacheStats.queryHistory.shift()
  }

  console.log(`🗄️ Supabase read: ${table} (${documentCount} rows, ${formatBytes(dataSize)}, ${queryTime.toFixed(2)}ms)`)
}/**
 
* Track cache hit operations
 */
function trackCacheHit(table, dataSize, queryTime, userId = null) {
  cacheStats.cacheServedQueries++
  cacheStats.cacheHitsThisSession++

  // Track by user if provided
  if (userId) {
    if (!cacheStats.readsByUser[userId]) {
      cacheStats.readsByUser[userId] = {
        totalReads: 0,
        cacheHits: 0,
        tables: {},
        lastActivity: Date.now(),
        estimatedSavings: 0
      }
    }

    const userStats = cacheStats.readsByUser[userId]
    userStats.cacheHits++
    userStats.lastActivity = Date.now()
    userStats.estimatedSavings = (userStats.cacheHits / 100000) * SUPABASE_READ_COST_PER_100K
  }

  // Calculate bandwidth saved
  cacheStats.bandwidthSaved += dataSize

  // Calculate cost savings
  cacheStats.estimatedSavings = (cacheStats.cacheServedQueries / 100000) * SUPABASE_READ_COST_PER_100K

  // Update read reduction rate
  const totalQueries = cacheStats.supabaseReads + cacheStats.cacheServedQueries
  cacheStats.readReductionRate = totalQueries > 0 ?
    (cacheStats.cacheServedQueries / totalQueries * 100) : 0

  // Update average cache query time
  cacheStats.avgCacheQueryTime = cacheStats.avgCacheQueryTime * 0.9 + queryTime * 0.1

  // Calculate performance improvement
  if (cacheStats.avgDatabaseQueryTime > 0 && cacheStats.avgCacheQueryTime > 0) {
    cacheStats.performanceImprovement =
      ((cacheStats.avgDatabaseQueryTime - cacheStats.avgCacheQueryTime) / cacheStats.avgDatabaseQueryTime) * 100
  }

  // Add to query history
  const historyEntry = {
    timestamp: Date.now(),
    type: 'cache-hit',
    table,
    dataSize,
    queryTime,
    userId
  }

  cacheStats.queryHistory.push(historyEntry)
  if (cacheStats.queryHistory.length > cacheStats.maxHistorySize) {
    cacheStats.queryHistory.shift()
  }

  console.log(`⚡ Cache hit: ${table} (${formatBytes(dataSize)}, ${queryTime.toFixed(2)}ms)`)
}

/**
 * Update cache statistics
 */
function updateCacheStats(isHit, queryTime = 0) {
  cacheStats.totalQueries++
  if (isHit) {
    cacheStats.hits++
  } else {
    cacheStats.misses++
  }

  // Update average query time (exponential moving average)
  if (queryTime > 0) {
    cacheStats.averageQueryTime = cacheStats.averageQueryTime * 0.9 + queryTime * 0.1
  }
}

/**
 * Extract user ID from query parameters
 */
function extractUserId(queryBuilder) {
  // This is a simplified extraction - in practice, you might need more sophisticated logic
  // based on your query patterns
  return null // Will be enhanced based on actual usage patterns
}

/**
 * Helper function to fetch and transform programs with complete structure
 */
async function fetchAndTransformPrograms(query) {
  const { data, error } = await query

  if (error) throw error

  // Transform programs to include weekly_configs
  const transformedPrograms = (data || []).map(program => {
    // Sort workouts by week and day before transformation
    if (program.program_workouts) {
      program.program_workouts.sort((a, b) => {
        if (a.week_number !== b.week_number) {
          return a.week_number - b.week_number
        }
        return a.day_number - b.day_number
      })

      // Sort exercises within each workout by order_index
      program.program_workouts.forEach(workout => {
        if (workout.program_exercises) {
          workout.program_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })
    }

    return transformSupabaseProgramToWeeklyConfigs(program)
  })

  return transformedPrograms
}

/**
 * Helper function to create complete program query
 */
function createCompleteProgramQuery(baseQuery) {
  return baseQuery.select(`
    *,
    program_workouts (
      *,
      program_exercises (
        *,
        exercises (
          id,
          name,
          primary_muscle_group,
          exercise_type,
          instructions
        )
      )
    )
  `)
}

/**
 * Utility functions
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}
/**
 * Main SupabaseCache class
 */
export class SupabaseCache {
  constructor(options = {}) {
    this.defaultTTL = options.defaultTTL || DEFAULT_TTL
    this.maxCacheSize = options.maxCacheSize || MAX_CACHE_SIZE
    this.cleanupInterval = options.cleanupInterval || CLEANUP_INTERVAL

    // Start automatic cleanup
    this.startCleanupInterval()
  }

  /**
   * Get data with caching for Supabase queries
   */
  async getWithCache(cacheKey, queryFn, options = {}) {
    const {
      ttl = this.defaultTTL,
      tags = [],
      userId = null,
      bypassCache = false,
      table = 'unknown',
      onCacheHit = null,
      onCacheSet = null
    } = options

    const logger = createDebugLogger('SUPABASE_CACHE', 'GET_WITH_CACHE');

    logger.debug('Cache lookup initiated', {
      cacheKey: cacheKey.substring(0, 100) + (cacheKey.length > 100 ? '...' : ''),
      table,
      userId,
      bypassCache,
      ttl
    });

    // Check cache first (unless bypassed)
    if (!bypassCache) {
      const cached = cache.get(cacheKey)
      if (cached && !isExpired(cached)) {
        const startTime = performance.now()
        cached.accessCount++
        cached.lastAccessed = Date.now()
        const queryTime = performance.now() - startTime
        const dataSize = JSON.stringify(cached.data).length

        logCacheOperation('hit', 'SUPABASE_CACHE', 'Cache hit for query', {
          cacheKey: cacheKey.substring(0, 100) + (cacheKey.length > 100 ? '...' : ''),
          table,
          userId,
          dataSize: formatBytes(dataSize),
          queryTimeMs: Math.round(queryTime * 100) / 100,
          accessCount: cached.accessCount,
          age: formatDuration(Date.now() - cached.createdAt)
        });

        trackCacheHit(table, dataSize, queryTime, userId)
        updateCacheStats(true, queryTime)

        // Call onCacheHit callback if provided
        if (onCacheHit && typeof onCacheHit === 'function') {
          try {
            onCacheHit(cached.data);
          } catch (error) {
            logger.error('onCacheHit callback failed', { error: error.message });
          }
        }

        return cached.data
      } else if (cached && isExpired(cached)) {
        logger.warn('Cache entry expired', {
          cacheKey: cacheKey.substring(0, 100) + (cacheKey.length > 100 ? '...' : ''),
          table,
          expiredAt: new Date(cached.expiry).toISOString(),
          ageMs: Date.now() - cached.createdAt
        });
      }
    }

    // Execute database query
    logger.info('Executing database query', {
      table,
      userId,
      reason: bypassCache ? 'cache-bypassed' : 'cache-miss'
    });

    const startTime = performance.now()
    const result = await queryFn()
    const queryTime = performance.now() - startTime

    if (result.error) {
      logger.error('Database query failed', {
        table,
        error: result.error.message,
        code: result.error.code,
        queryTimeMs: Math.round(queryTime * 100) / 100
      });
      updateCacheStats(false, queryTime)
      throw result.error
    }

    // Track database read - handle undefined data
    const safeData = result.data || []
    const dataSize = JSON.stringify(safeData).length
    const documentCount = Array.isArray(safeData) ? safeData.length : 1

    logger.success('Database query completed', {
      table,
      documentCount,
      dataSize: formatBytes(dataSize),
      queryTimeMs: Math.round(queryTime * 100) / 100,
      userId
    });

    trackSupabaseRead(table, 'select', documentCount, dataSize, queryTime, userId)
    updateCacheStats(false, queryTime)

    // Cache the result - handle undefined data
    const entry = createCacheEntry(safeData, ttl, {
      table,
      tags: [...tags, table],
      userId,
      queryTime
    })

    this.setCacheEntry(cacheKey, entry)

    logCacheOperation('set', 'SUPABASE_CACHE', 'Data cached', {
      cacheKey: cacheKey.substring(0, 100) + (cacheKey.length > 100 ? '...' : ''),
      table,
      dataSize: formatBytes(dataSize),
      ttl: formatDuration(ttl),
      tags
    });

    // Call onCacheSet callback if provided
    if (onCacheSet && typeof onCacheSet === 'function') {
      try {
        onCacheSet(safeData);
      } catch (error) {
        logger.error('onCacheSet callback failed', { error: error.message });
      }
    }

    return safeData
  }

  /**
   * Set cache entry with size management
   */
  setCacheEntry(key, entry) {
    // Check cache size limit
    if (cache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed()
    }

    cache.set(key, entry)
  }

  /**
   * Evict least recently used entries
   */
  evictLeastRecentlyUsed() {
    let oldestKey = null
    let oldestTime = Date.now()

    for (const [key, entry] of cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey)
      console.log(`🗑️ Evicted LRU cache entry: ${oldestKey}`)
    }
  }

  /**
   * Invalidate cache entries by patterns
   */
  invalidate(patterns, options = {}) {
    const {
      exact = false,
      userId = null,
      tables = [],
      tags = [],
      reason = 'manual'
    } = options

    const logger = createDebugLogger('SUPABASE_CACHE', 'INVALIDATE');
    const startTime = performance.now();

    let invalidatedCount = 0
    const keysToDelete = []
    const matchedEntries = []

    // Convert single pattern to array
    const patternArray = Array.isArray(patterns) ? patterns : [patterns]

    logger.info('Starting cache invalidation', {
      patterns: patternArray,
      exact,
      userId,
      tables,
      tags,
      reason,
      totalCacheSize: cache.size
    });

    for (const [key, entry] of cache) {
      let shouldInvalidate = false
      let matchReason = null

      // Check pattern matching
      for (const pattern of patternArray) {
        if (exact) {
          if (key === pattern) {
            shouldInvalidate = true
            matchReason = `exact-match: ${pattern}`
            break
          }
        } else {
          if (key.includes(pattern)) {
            shouldInvalidate = true
            matchReason = `pattern-match: ${pattern}`
            break
          }
        }
      }

      // Additional filtering by tags
      if (shouldInvalidate && tags.length > 0) {
        const hasMatchingTag = entry.tags?.some(tag => tags.includes(tag))
        if (!hasMatchingTag) {
          shouldInvalidate = false
          matchReason = null
        } else {
          matchReason += ` + tag-match: ${tags.join(',')}`
        }
      }

      // Additional filtering by tables
      if (shouldInvalidate && tables.length > 0) {
        if (!tables.includes(entry.queryInfo?.table)) {
          shouldInvalidate = false
          matchReason = null
        } else {
          matchReason += ` + table-match: ${entry.queryInfo?.table}`
        }
      }

      // Additional filtering by userId
      if (shouldInvalidate && userId) {
        if (entry.queryInfo?.userId !== userId) {
          shouldInvalidate = false
          matchReason = null
        } else {
          matchReason += ` + user-match: ${userId}`
        }
      }

      if (shouldInvalidate) {
        keysToDelete.push(key)
        matchedEntries.push({
          key: key.substring(0, 100) + (key.length > 100 ? '...' : ''),
          table: entry.queryInfo?.table || 'unknown',
          size: formatBytes(entry.size),
          age: formatDuration(Date.now() - entry.createdAt),
          accessCount: entry.accessCount,
          matchReason
        })
      }
    }

    // Delete matched keys
    keysToDelete.forEach(key => {
      cache.delete(key)
      invalidatedCount++
    })

    cacheStats.invalidations += invalidatedCount

    const endTime = performance.now();
    const invalidationTime = endTime - startTime;

    logCacheOperation('invalidate', 'SUPABASE_CACHE', 'Cache invalidation completed', {
      patterns: patternArray,
      invalidatedCount,
      totalCacheSize: cache.size,
      reason,
      invalidationTimeMs: Math.round(invalidationTime * 100) / 100,
      matchedEntries: matchedEntries.slice(0, 10) // Log first 10 matches
    });

    if (matchedEntries.length > 10) {
      logger.debug(`Additional ${matchedEntries.length - 10} entries invalidated (not shown in log)`);
    }

    return invalidatedCount
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    let cleanedCount = 0
    const keysToDelete = []

    for (const [key, entry] of cache) {
      if (isExpired(entry)) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => {
      cache.delete(key)
      cleanedCount++
    })

    console.log(`🧹 Cache cleanup: ${cleanedCount} expired entries removed`)
    return cleanedCount
  }

  /**
   * Start automatic cleanup interval
   */
  startCleanupInterval() {
    setInterval(() => {
      this.cleanup()
    }, this.cleanupInterval)
  }  /**

   * Get cache statistics
   */
  getStats() {
    const hitRate = cacheStats.totalQueries > 0 ?
      (cacheStats.hits / cacheStats.totalQueries * 100).toFixed(2) : 0

    const cacheSize = cache.size
    const totalMemoryUsage = Array.from(cache.values())
      .reduce((total, entry) => total + entry.size, 0)

    return {
      ...cacheStats,
      hitRate: `${hitRate}%`,
      cacheSize,
      memoryUsage: formatBytes(totalMemoryUsage),
      queryPerformance: Object.fromEntries(
        Array.from(queryPerformance.entries()).map(([name, perf]) => [
          name,
          {
            ...perf,
            averageTime: perf.count > 0 ? (perf.totalTime / perf.count).toFixed(2) : 0
          }
        ])
      )
    }
  }

  /**
   * Get enhanced statistics with detailed tracking
   */
  getEnhancedStats() {
    const totalQueries = cacheStats.supabaseReads + cacheStats.cacheServedQueries
    const sessionDuration = Date.now() - cacheStats.sessionStartTime

    return {
      // Database Read Tracking
      databaseReads: {
        total: cacheStats.supabaseReads,
        thisSession: cacheStats.readsThisSession,
        byTable: cacheStats.readsByTable,
        byTimeOfDay: cacheStats.readsByTimeOfDay,
        byUser: Object.fromEntries(
          Object.entries(cacheStats.readsByUser).map(([userId, stats]) => [
            userId,
            {
              ...stats,
              lastActivityFormatted: new Date(stats.lastActivity).toLocaleString(),
              estimatedCostFormatted: `$${stats.estimatedCost.toFixed(4)}`
            }
          ])
        )
      },

      // Cache Performance
      cachePerformance: {
        totalQueries,
        cacheHits: cacheStats.cacheServedQueries,
        cacheHitsThisSession: cacheStats.cacheHitsThisSession,
        readReductionRate: `${cacheStats.readReductionRate.toFixed(2)}%`,
        performanceImprovement: `${cacheStats.performanceImprovement.toFixed(2)}%`,
        avgDatabaseQueryTime: `${cacheStats.avgDatabaseQueryTime.toFixed(2)}ms`,
        avgCacheQueryTime: `${cacheStats.avgCacheQueryTime.toFixed(2)}ms`
      },

      // Cost Analysis
      costAnalysis: {
        estimatedCost: `$${cacheStats.estimatedCost.toFixed(4)}`,
        estimatedSavings: `$${cacheStats.estimatedSavings.toFixed(4)}`,
        costPerRead: `$${(SUPABASE_READ_COST_PER_100K / 100000).toFixed(8)}`,
        projectedMonthlyCost: `$${(cacheStats.supabaseReads * 30 * (SUPABASE_READ_COST_PER_100K / 100000)).toFixed(2)}`,
        projectedMonthlySavings: `$${(cacheStats.cacheServedQueries * 30 * (SUPABASE_READ_COST_PER_100K / 100000)).toFixed(2)}`
      },

      // Bandwidth Tracking
      bandwidth: {
        databaseBandwidth: formatBytes(cacheStats.bandwidthUsed),
        cacheBandwidth: formatBytes(cacheStats.bandwidthSaved),
        totalBandwidthSaved: formatBytes(cacheStats.bandwidthSaved),
        bandwidthReductionRate: cacheStats.bandwidthUsed > 0 ?
          `${((cacheStats.bandwidthSaved / (cacheStats.bandwidthUsed + cacheStats.bandwidthSaved)) * 100).toFixed(2)}%` : '0%'
      },

      // Session Information
      session: {
        startTime: new Date(cacheStats.sessionStartTime).toLocaleString(),
        duration: formatDuration(sessionDuration),
        readsPerMinute: sessionDuration > 0 ?
          ((cacheStats.supabaseReads / (sessionDuration / 60000)).toFixed(2)) : '0',
        cacheHitsPerMinute: sessionDuration > 0 ?
          ((cacheStats.cacheServedQueries / (sessionDuration / 60000)).toFixed(2)) : '0'
      },

      // Recent Activity
      recentActivity: {
        queryHistory: cacheStats.queryHistory.slice(-10), // Last 10 queries
        topTables: Object.entries(cacheStats.readsByTable)
          .sort(([, a], [, b]) => b.reads - a.reads)
          .slice(0, 5)
          .map(([table, stats]) => ({
            table,
            reads: stats.reads,
            avgTime: `${stats.avgTime.toFixed(2)}ms`
          }))
      },

      // Cache Health
      cacheHealth: {
        size: cache.size,
        maxSize: this.maxCacheSize,
        memoryUsage: formatBytes(Array.from(cache.values()).reduce((total, entry) => total + entry.size, 0)),
        hitRate: totalQueries > 0 ? `${((cacheStats.cacheServedQueries / totalQueries) * 100).toFixed(2)}%` : '0%',
        invalidations: cacheStats.invalidations,
        avgQueryTime: `${cacheStats.averageQueryTime.toFixed(2)}ms`
      }
    }
  }

  /**
   * Debug cache contents
   */
  debug(pattern = null) {
    const entries = []

    for (const [key, entry] of cache) {
      if (!pattern || key.includes(pattern)) {
        entries.push({
          key: key.substring(0, 100) + (key.length > 100 ? '...' : ''),
          size: formatBytes(entry.size),
          accessCount: entry.accessCount,
          age: formatDuration(Date.now() - entry.createdAt),
          ttl: formatDuration(entry.expiry - Date.now()),
          expired: isExpired(entry),
          tags: entry.tags
        })
      }
    }

    return entries.sort((a, b) => b.accessCount - a.accessCount)
  }

  /**
   * Get cached data without executing a query (for fallback scenarios)
   */
  get(cacheKey) {
    const cached = cache.get(cacheKey)
    if (cached && !isExpired(cached)) {
      cached.accessCount++
      cached.lastAccessed = Date.now()
      return cached.data
    }
    return null
  }

  /**
   * Clear all cache entries
   */
  clear() {
    const size = cache.size
    cache.clear()
    console.log(`🗑️ Cache cleared: ${size} entries removed`)
    return size
  }
}
// Create default cache instance
export const supabaseCache = new SupabaseCache()

// Specialized cache invalidation functions
export function invalidateUserCache(userId) {
  return supabaseCache.invalidate(['workout_logs', 'programs', 'user_analytics'], {
    userId,
    reason: 'user-specific'
  })
}

export function invalidateWorkoutCache(userId) {
  return supabaseCache.invalidate(['workout_logs'], {
    userId,
    reason: 'workout-update'
  })
}

export function invalidateProgramCache(userId) {
  // Unified cache invalidation to support both old and new cache key patterns
  const cacheKeysToInvalidate = [
    // New unified cache keys
    `user_programs_all_${userId}`,

    // Pattern-based invalidation for any filtered versions
    `user_programs_all_${userId}_`,
  ];

  console.log('🗑️ [CACHE_INVALIDATE] Invalidating program cache with unified approach:', {
    userId,
    cacheKeys: cacheKeysToInvalidate,
    reason: 'program-update'
  });

  return supabaseCache.invalidate(cacheKeysToInvalidate, {
    userId,
    reason: 'program-update'
  });
}

export function invalidateExerciseCache() {
  return supabaseCache.invalidate(['exercises'], {
    reason: 'exercise-update'
  })
}

// Cache warming strategies for Supabase
export async function warmUserCache(userId, priority = 'normal') {
  console.log(`🔥 Warming cache for user: ${userId} (priority: ${priority})`)

  const warmingPromises = []

  try {
    // High priority: Essential data
    if (priority === 'high' || priority === 'normal') {
      // Global exercises (long TTL)
      // These are cached in the AppCache functions
      // warmingPromises.push(
      //   supabaseCache.getWithCache(
      //     `exercises_global`,
      //     () => supabase.from('exercises').select('*').eq('is_global', true),
      //     { ttl: 60 * 60 * 1000, table: 'exercises', tags: ['exercises', 'global'] }
      //   )
      // )

      // All user programs (both user and template) with complete workout structure
      // This matches the unified cache key expected by Programs.js
      warmingPromises.push(
        supabaseCache.getWithCache(
          `user_programs_all_${userId}`,
          () => fetchAndTransformPrograms(
            createCompleteProgramQuery(supabase.from('programs'))
              .eq('user_id', userId)
              .order('created_at', { ascending: false })
          ),
          { ttl: 30 * 60 * 1000, table: 'programs', tags: ['programs', 'user', 'all_programs'], userId }
        )
      )

      // User-specific exercises (both global and user-created)
      warmingPromises.push(
        supabaseCache.getWithCache(
          `exercises_user_${userId}`,
          async () => {
            // Fetch both global exercises and user-created exercises
            const { data: globalExercises, error: globalError } = await supabase
              .from('exercises')
              .select('*')
              .eq('is_global', true)

            if (globalError) throw globalError

            const { data: userExercises, error: userError } = await supabase
              .from('exercises')
              .select('*')
              .eq('created_by', userId)
              .eq('is_global', false)

            if (userError) throw userError

            // Combine and return all available exercises for the user
            return [...(globalExercises || []), ...(userExercises || [])]
          },
          { ttl: 30 * 60 * 1000, table: 'exercises', tags: ['exercises', 'user'], userId }
        )
      )

      // Recent workout logs
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      warmingPromises.push(
        supabaseCache.getWithCache(
          `workout_logs_recent_${userId}`,
          () => supabase
            .from('workout_logs')
            .select('*')
            .eq('user_id', userId)
            .gte('date', sevenDaysAgo)
            .order('date', { ascending: false })
            .limit(20),
          { ttl: 15 * 60 * 1000, table: 'workout_logs', tags: ['workout_logs', 'user'], userId }
        )
      )
    }

    // Execute warming promises
    const results = await Promise.allSettled(warmingPromises)
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    console.log(`✅ Cache warming completed: ${successful} successful, ${failed} failed`)

    return { successful, failed, total: warmingPromises.length }
  } catch (error) {
    console.error('❌ Cache warming failed:', error)
    throw error
  }
}

// Progressive cache warming on app startup
export async function warmAppCache() {
  console.log('🚀 Starting app cache warming...')

  try {
    // Warm global exercises first
    await supabaseCache.getWithCache(
      'exercises_global_all',
      () => supabase.from('exercises').select('*').eq('is_global', true),
      { ttl: 60 * 60 * 1000, table: 'exercises', tags: ['exercises', 'global'] }
    )

    // Also warm template programs with complete structure
    await supabaseCache.getWithCache(
      'template_programs_all',
      () => fetchAndTransformPrograms(
        createCompleteProgramQuery(supabase.from('programs'))
          .eq('is_template', true)
          .order('created_at', { ascending: false })
      ),
      { ttl: 60 * 60 * 1000, table: 'programs', tags: ['programs', 'templates'] }
    )

    console.log('✅ App cache warming completed')
  } catch (error) {
    console.error('❌ App cache warming failed:', error)
  }
}

// Export convenience functions for backward compatibility
export async function getWithCache(cacheKey, queryFn, options = {}) {
  return supabaseCache.getWithCache(cacheKey, queryFn, options)
}

export function invalidateCache(patterns, options = {}) {
  return supabaseCache.invalidate(patterns, options)
}

export function getCacheStats() {
  return supabaseCache.getStats()
}

export function getEnhancedCacheStats() {
  return supabaseCache.getEnhancedStats()
}

export function debugCache(pattern = null) {
  return supabaseCache.debug(pattern)
}

export function clearCache() {
  return supabaseCache.clear()
}

// Export cache instance for direct access
export { cache }/*
*
 * Advanced Cache Management and Memory Optimization
 */

// Memory management configuration
const MEMORY_THRESHOLDS = {
  WARNING: 50 * 1024 * 1024,    // 50MB
  CRITICAL: 100 * 1024 * 1024,  // 100MB
  MAX: 150 * 1024 * 1024        // 150MB
}

// Cache cleanup strategies
export class CacheCleanupManager {
  constructor(cacheInstance) {
    this.cache = cacheInstance
    this.cleanupStrategies = [
      this.removeExpiredEntries.bind(this),
      this.removeLeastRecentlyUsed.bind(this),
      this.removeOldestEntries.bind(this),
      this.removeLargestEntries.bind(this)
    ]
  }

  /**
   * Perform intelligent cache cleanup based on memory usage
   */
  async performCleanup(targetReduction = 0.3) {
    const initialSize = this.getCurrentMemoryUsage()
    const targetSize = initialSize * (1 - targetReduction)

    console.log(`🧹 Starting intelligent cache cleanup (target: ${formatBytes(targetSize)})`)

    let currentSize = initialSize
    let strategyIndex = 0

    while (currentSize > targetSize && strategyIndex < this.cleanupStrategies.length) {
      const strategy = this.cleanupStrategies[strategyIndex]
      const removedCount = await strategy()

      currentSize = this.getCurrentMemoryUsage()
      console.log(`Strategy ${strategyIndex + 1}: Removed ${removedCount} entries, current size: ${formatBytes(currentSize)}`)

      strategyIndex++
    }

    const finalReduction = ((initialSize - currentSize) / initialSize) * 100
    console.log(`✅ Cache cleanup completed: ${finalReduction.toFixed(1)}% reduction`)

    return {
      initialSize: formatBytes(initialSize),
      finalSize: formatBytes(currentSize),
      reductionPercentage: finalReduction.toFixed(1)
    }
  }

  /**
   * Remove expired entries
   */
  removeExpiredEntries() {
    let removedCount = 0
    const keysToDelete = []

    for (const [key, entry] of cache) {
      if (isExpired(entry)) {
        keysToDelete.push(key)
      }
    }

    keysToDelete.forEach(key => {
      cache.delete(key)
      removedCount++
    })

    return removedCount
  }

  /**
   * Remove least recently used entries
   */
  removeLeastRecentlyUsed(maxToRemove = 100) {
    const entries = Array.from(cache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed)
      .slice(0, maxToRemove)

    entries.forEach(([key]) => cache.delete(key))

    return entries.length
  }

  /**
   * Remove oldest entries
   */
  removeOldestEntries(maxToRemove = 100) {
    const entries = Array.from(cache.entries())
      .sort(([, a], [, b]) => a.createdAt - b.createdAt)
      .slice(0, maxToRemove)

    entries.forEach(([key]) => cache.delete(key))

    return entries.length
  }

  /**
   * Remove largest entries
   */
  removeLargestEntries(maxToRemove = 50) {
    const entries = Array.from(cache.entries())
      .sort(([, a], [, b]) => b.size - a.size)
      .slice(0, maxToRemove)

    entries.forEach(([key]) => cache.delete(key))

    return entries.length
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage() {
    return Array.from(cache.values()).reduce((total, entry) => total + entry.size, 0)
  }

  /**
   * Check if cleanup is needed
   */
  isCleanupNeeded() {
    const currentUsage = this.getCurrentMemoryUsage()
    return {
      needed: currentUsage > MEMORY_THRESHOLDS.WARNING,
      critical: currentUsage > MEMORY_THRESHOLDS.CRITICAL,
      emergency: currentUsage > MEMORY_THRESHOLDS.MAX,
      currentUsage: formatBytes(currentUsage),
      threshold: formatBytes(MEMORY_THRESHOLDS.WARNING)
    }
  }
}

// Create cleanup manager instance
export const cacheCleanupManager = new CacheCleanupManager(supabaseCache)

/**
 * Automatic memory monitoring and cleanup
 */
class MemoryMonitor {
  constructor() {
    this.monitoringInterval = null
    this.checkInterval = 30 * 1000 // Check every 30 seconds
  }

  start() {
    if (this.monitoringInterval) return

    this.monitoringInterval = setInterval(() => {
      this.checkMemoryUsage()
    }, this.checkInterval)

    console.log('🔍 Memory monitoring started')
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
      console.log('🔍 Memory monitoring stopped')
    }
  }

  async checkMemoryUsage() {
    const status = cacheCleanupManager.isCleanupNeeded()

    if (status.emergency) {
      console.warn('🚨 Emergency cache cleanup needed!', status)
      await cacheCleanupManager.performCleanup(0.5) // Remove 50%
    } else if (status.critical) {
      console.warn('⚠️ Critical cache cleanup needed', status)
      await cacheCleanupManager.performCleanup(0.3) // Remove 30%
    } else if (status.needed) {
      console.log('ℹ️ Routine cache cleanup triggered', status)
      await cacheCleanupManager.performCleanup(0.2) // Remove 20%
    }
  }
}

// Create and start memory monitor
export const memoryMonitor = new MemoryMonitor()

// Auto-start memory monitoring in browser environment
if (typeof window !== 'undefined') {
  memoryMonitor.start()
}

/**
 * Cache warming strategies with intelligent prioritization
 */
export class CacheWarmingManager {
  constructor() {
    this.warmingQueue = []
    this.isWarming = false
  }

  /**
   * Add cache warming task to queue
   */
  queueWarming(task) {
    this.warmingQueue.push({
      ...task,
      priority: task.priority || 'normal',
      timestamp: Date.now()
    })

    // Sort by priority
    this.warmingQueue.sort((a, b) => {
      const priorityOrder = { high: 3, normal: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })

    this.processQueue()
  }

  /**
   * Process warming queue
   */
  async processQueue() {
    if (this.isWarming || this.warmingQueue.length === 0) return

    this.isWarming = true

    while (this.warmingQueue.length > 0) {
      const task = this.warmingQueue.shift()

      try {
        console.log(`🔥 Processing cache warming task: ${task.name} (${task.priority})`)
        await task.execute()
      } catch (error) {
        console.error(`❌ Cache warming task failed: ${task.name}`, error)
      }
    }

    this.isWarming = false
  }

  /**
   * Warm cache for specific user with intelligent prioritization
   */
  async warmUserCacheIntelligent(userId, userActivity = {}) {
    const tasks = []

    // High priority: Recently accessed data
    if (userActivity.recentWorkouts) {
      tasks.push({
        name: `recent-workouts-${userId}`,
        priority: 'high',
        execute: () => getCollectionCached('workout_logs', {
          where: [['user_id', '==', userId]],
          orderBy: [['date', 'desc']],
          limit: 10
        }, 30 * 60 * 1000)
      })
    }

    // Normal priority: User programs with complete structure
    tasks.push({
      name: `programs-${userId}`,
      priority: 'normal',
      execute: () => supabaseCache.getWithCache(
        `user_programs_all_${userId}`,
        () => fetchAndTransformPrograms(
          createCompleteProgramQuery(supabase.from('programs'))
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
        ),
        { ttl: 30 * 60 * 1000, table: 'programs', tags: ['programs', 'user'], userId }
      )
    })

    // Low priority: Analytics data
    tasks.push({
      name: `analytics-${userId}`,
      priority: 'low',
      execute: () => getCollectionCached('user_analytics', {
        where: [['user_id', '==', userId]]
      }, 15 * 60 * 1000)
    })

    // Queue all tasks
    tasks.forEach(task => this.queueWarming(task))
  }
}

// Create cache warming manager
export const cacheWarmingManager = new CacheWarmingManager()

/**
 * Export enhanced cache management functions
 */
export function startCacheMonitoring() {
  memoryMonitor.start()
}

export function stopCacheMonitoring() {
  memoryMonitor.stop()
}

export function performCacheCleanup(targetReduction = 0.3) {
  return cacheCleanupManager.performCleanup(targetReduction)
}

export function getCacheMemoryStatus() {
  return cacheCleanupManager.isCleanupNeeded()
}

export function queueCacheWarming(task) {
  return cacheWarmingManager.queueWarming(task)
}

export function warmUserCacheIntelligent(userId, userActivity = {}) {
  return cacheWarmingManager.warmUserCacheIntelligent(userId, userActivity)
}

/**
 * Get available exercises for a user (both global and user-created) with caching
 * This function matches the pattern used by the Programs.js component
 */
export async function getAvailableExercisesCached(userId) {
  return supabaseCache.getWithCache(
    `exercises_user_${userId}`,
    async () => {
      // Fetch both global exercises and user-created exercises
      const { data: globalExercises, error: globalError } = await supabase
        .from('exercises')
        .select('*')
        .eq('is_global', true)

      if (globalError) throw globalError

      const { data: userExercises, error: userError } = await supabase
        .from('exercises')
        .select('*')
        .eq('created_by', userId)
        .eq('is_global', false)

      if (userError) throw userError

      // Combine and return all available exercises for the user
      return [...(globalExercises || []), ...(userExercises || [])]
    },
    {
      ttl: 30 * 60 * 1000,
      table: 'exercises',
      tags: ['exercises', 'user'],
      userId
    }
  )
}

/**
 * Get all programs for a user (both user and template programs) with caching
 * This function matches the unified cache approach used by the Programs.js component
 */
export async function getAllUserProgramsCached(userId) {
  return supabaseCache.getWithCache(
    `user_programs_all_${userId}`,
    () => fetchAndTransformPrograms(
      createCompleteProgramQuery(supabase.from('programs'))
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    ),
    {
      ttl: 30 * 60 * 1000,
      table: 'programs',
      tags: ['programs', 'user', 'all_programs'],
      userId
    }
  )
}