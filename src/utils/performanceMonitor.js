/**
 * Performance Monitoring Utility for Programs Data Fetching Optimization
 * 
 * This module provides comprehensive performance monitoring and logging for:
 * - Database query performance timing
 * - Cache hit/miss rates for unified cache approach
 * - Memory usage improvements from reduced cache duplication
 * - Debugging logs to help identify data flow issues
 */

import { createDebugLogger } from './debugUtils'

// Performance monitoring state
let performanceStats = {
  // Database query performance
  databaseQueries: {
    totalQueries: 0,
    totalTime: 0,
    averageTime: 0,
    slowestQuery: { time: 0, details: null },
    fastestQuery: { time: Infinity, details: null },
    queriesByTable: {},
    queriesByType: {
      getAllUserPrograms: { count: 0, totalTime: 0, avgTime: 0 },
      getUserPrograms: { count: 0, totalTime: 0, avgTime: 0 },
      getUserProgramsFiltered: { count: 0, totalTime: 0, avgTime: 0 }
    }
  },

  // Cache performance
  cachePerformance: {
    unifiedCacheHits: 0,
    unifiedCacheMisses: 0,
    legacyCacheHits: 0,
    legacyCacheMisses: 0,
    clientSideFilters: 0,
    cacheHitRate: 0,
    unifiedCacheHitRate: 0,
    legacyCacheHitRate: 0,
    cacheSizeReduction: 0,
    duplicateCacheEntriesAvoided: 0
  },

  // Memory usage tracking
  memoryUsage: {
    beforeOptimization: 0,
    afterOptimization: 0,
    reduction: 0,
    reductionPercentage: 0,
    peakUsage: 0,
    currentUsage: 0,
    cacheMemoryUsage: 0,
    duplicateCacheMemorySaved: 0
  },

  // Data flow debugging
  dataFlow: {
    programsFetched: 0,
    templateProgramsFiltered: 0,
    userProgramsFiltered: 0,
    transformationTime: 0,
    filteringTime: 0,
    dataFlowErrors: 0,
    dataInconsistencies: []
  },

  // Session tracking
  session: {
    startTime: Date.now(),
    optimizationEnabled: false,
    totalOptimizedQueries: 0,
    totalLegacyQueries: 0,
    performanceImprovement: 0
  }
}

// Performance measurement utilities
class PerformanceTimer {
  constructor(name, category = 'general') {
    this.name = name
    this.category = category
    this.startTime = performance.now()
    this.logger = createDebugLogger('PERFORMANCE_MONITOR', category.toUpperCase())
  }

  end(details = {}) {
    const endTime = performance.now()
    const duration = endTime - this.startTime

    this.logger.debug(`Performance measurement completed`, {
      name: this.name,
      category: this.category,
      durationMs: Math.round(duration * 100) / 100,
      details
    })

    return {
      name: this.name,
      category: this.category,
      duration,
      details,
      timestamp: Date.now()
    }
  }
}

/**
 * Track database query performance
 */
export function trackDatabaseQuery(queryType, table, startTime, endTime, details = {}) {
  const duration = endTime - startTime
  const stats = performanceStats.databaseQueries

  // Update overall stats
  stats.totalQueries++
  stats.totalTime += duration
  stats.averageTime = stats.totalTime / stats.totalQueries

  // Track slowest and fastest queries
  if (duration > stats.slowestQuery.time) {
    stats.slowestQuery = { time: duration, details: { queryType, table, ...details } }
  }
  if (duration < stats.fastestQuery.time) {
    stats.fastestQuery = { time: duration, details: { queryType, table, ...details } }
  }

  // Track by table
  if (!stats.queriesByTable[table]) {
    stats.queriesByTable[table] = { count: 0, totalTime: 0, avgTime: 0 }
  }
  stats.queriesByTable[table].count++
  stats.queriesByTable[table].totalTime += duration
  stats.queriesByTable[table].avgTime = stats.queriesByTable[table].totalTime / stats.queriesByTable[table].count

  // Track by query type
  if (stats.queriesByType[queryType]) {
    stats.queriesByType[queryType].count++
    stats.queriesByType[queryType].totalTime += duration
    stats.queriesByType[queryType].avgTime = stats.queriesByType[queryType].totalTime / stats.queriesByType[queryType].count
  }

  console.log(`📊 [DB_QUERY_PERFORMANCE] ${queryType} on ${table}:`, {
    durationMs: Math.round(duration * 100) / 100,
    avgTimeMs: Math.round(stats.averageTime * 100) / 100,
    totalQueries: stats.totalQueries,
    details
  })

  return {
    duration,
    queryType,
    table,
    details,
    timestamp: Date.now()
  }
}

/**
 * Track cache hit/miss rates for unified cache approach
 */
export function trackCacheOperation(operation, cacheType, cacheKey, details = {}) {
  const stats = performanceStats.cachePerformance
  const logger = createDebugLogger('PERFORMANCE_MONITOR', 'CACHE_TRACKING')

  switch (operation) {
    case 'unified_hit':
      stats.unifiedCacheHits++
      break
    case 'unified_miss':
      stats.unifiedCacheMisses++
      break
    case 'legacy_hit':
      stats.legacyCacheHits++
      break
    case 'legacy_miss':
      stats.legacyCacheMisses++
      break
    case 'client_filter':
      stats.clientSideFilters++
      break
    case 'duplicate_avoided':
      stats.duplicateCacheEntriesAvoided++
      break
  }

  // Calculate hit rates
  const totalUnified = stats.unifiedCacheHits + stats.unifiedCacheMisses
  const totalLegacy = stats.legacyCacheHits + stats.legacyCacheMisses
  const totalCache = totalUnified + totalLegacy

  stats.unifiedCacheHitRate = totalUnified > 0 ? (stats.unifiedCacheHits / totalUnified) * 100 : 0
  stats.legacyCacheHitRate = totalLegacy > 0 ? (stats.legacyCacheHits / totalLegacy) * 100 : 0
  stats.cacheHitRate = totalCache > 0 ? ((stats.unifiedCacheHits + stats.legacyCacheHits) / totalCache) * 100 : 0

  // Calculate cache size reduction
  const potentialDuplicates = stats.unifiedCacheHits + stats.unifiedCacheMisses
  stats.cacheSizeReduction = potentialDuplicates > 0 ? (stats.duplicateCacheEntriesAvoided / potentialDuplicates) * 100 : 0

  logger.debug(`Cache operation tracked`, {
    operation,
    cacheType,
    cacheKey: cacheKey?.substring(0, 50) + (cacheKey?.length > 50 ? '...' : ''),
    unifiedHitRate: `${stats.unifiedCacheHitRate.toFixed(2)}%`,
    legacyHitRate: `${stats.legacyCacheHitRate.toFixed(2)}%`,
    overallHitRate: `${stats.cacheHitRate.toFixed(2)}%`,
    cacheSizeReduction: `${stats.cacheSizeReduction.toFixed(2)}%`,
    details
  })

  console.log(`🎯 [CACHE_PERFORMANCE] ${operation} (${cacheType}):`, {
    cacheKey: cacheKey?.substring(0, 50) + (cacheKey?.length > 50 ? '...' : ''),
    unifiedHitRate: `${stats.unifiedCacheHitRate.toFixed(2)}%`,
    legacyHitRate: `${stats.legacyCacheHitRate.toFixed(2)}%`,
    overallHitRate: `${stats.cacheHitRate.toFixed(2)}%`,
    duplicatesAvoided: stats.duplicateCacheEntriesAvoided,
    details
  })

  return {
    operation,
    cacheType,
    cacheKey,
    stats: {
      unifiedHitRate: stats.unifiedCacheHitRate,
      legacyHitRate: stats.legacyCacheHitRate,
      overallHitRate: stats.cacheHitRate,
      cacheSizeReduction: stats.cacheSizeReduction
    },
    details,
    timestamp: Date.now()
  }
}

/**
 * Track memory usage improvements
 */
export function trackMemoryUsage(phase, details = {}) {
  const currentUsage = getMemoryUsage()
  const stats = performanceStats.memoryUsage
  const logger = createDebugLogger('PERFORMANCE_MONITOR', 'MEMORY_TRACKING')

  stats.currentUsage = currentUsage
  if (currentUsage > stats.peakUsage) {
    stats.peakUsage = currentUsage
  }

  switch (phase) {
    case 'before_optimization':
      stats.beforeOptimization = currentUsage
      break
    case 'after_optimization':
      stats.afterOptimization = currentUsage
      stats.reduction = stats.beforeOptimization - stats.afterOptimization
      stats.reductionPercentage = stats.beforeOptimization > 0 ? 
        (stats.reduction / stats.beforeOptimization) * 100 : 0
      break
    case 'cache_memory_saved':
      stats.duplicateCacheMemorySaved += details.savedBytes || 0
      break
  }

  logger.debug(`Memory usage tracked`, {
    phase,
    currentUsage: formatBytes(currentUsage),
    peakUsage: formatBytes(stats.peakUsage),
    reduction: formatBytes(stats.reduction),
    reductionPercentage: `${stats.reductionPercentage.toFixed(2)}%`,
    details
  })

  console.log(`💾 [MEMORY_USAGE] ${phase}:`, {
    current: formatBytes(currentUsage),
    peak: formatBytes(stats.peakUsage),
    reduction: formatBytes(stats.reduction),
    reductionPercentage: `${stats.reductionPercentage.toFixed(2)}%`,
    cacheSaved: formatBytes(stats.duplicateCacheMemorySaved),
    details
  })

  return {
    phase,
    currentUsage,
    peakUsage: stats.peakUsage,
    reduction: stats.reduction,
    reductionPercentage: stats.reductionPercentage,
    details,
    timestamp: Date.now()
  }
}

/**
 * Track data flow for debugging
 */
export function trackDataFlow(operation, data, details = {}) {
  const stats = performanceStats.dataFlow
  const logger = createDebugLogger('PERFORMANCE_MONITOR', 'DATA_FLOW')

  switch (operation) {
    case 'programs_fetched':
      stats.programsFetched += data.count || 0
      break
    case 'template_programs_filtered':
      stats.templateProgramsFiltered += data.count || 0
      break
    case 'user_programs_filtered':
      stats.userProgramsFiltered += data.count || 0
      break
    case 'transformation_time':
      stats.transformationTime += data.duration || 0
      break
    case 'filtering_time':
      stats.filteringTime += data.duration || 0
      break
    case 'data_flow_error':
      stats.dataFlowErrors++
      break
    case 'data_inconsistency':
      stats.dataInconsistencies.push({
        type: data.type,
        description: data.description,
        details: data.details,
        timestamp: Date.now()
      })
      break
  }

  logger.debug(`Data flow tracked`, {
    operation,
    data,
    totalProgramsFetched: stats.programsFetched,
    totalTemplateFiltered: stats.templateProgramsFiltered,
    totalUserFiltered: stats.userProgramsFiltered,
    avgTransformTime: stats.transformationTime,
    avgFilterTime: stats.filteringTime,
    errors: stats.dataFlowErrors,
    inconsistencies: stats.dataInconsistencies.length,
    details
  })

  console.log(`🔄 [DATA_FLOW] ${operation}:`, {
    data,
    totalFetched: stats.programsFetched,
    templateFiltered: stats.templateProgramsFiltered,
    userFiltered: stats.userProgramsFiltered,
    transformTime: `${stats.transformationTime.toFixed(2)}ms`,
    filterTime: `${stats.filteringTime.toFixed(2)}ms`,
    errors: stats.dataFlowErrors,
    details
  })

  return {
    operation,
    data,
    stats,
    details,
    timestamp: Date.now()
  }
}

/**
 * Create a performance timer for measuring operations
 */
export function createPerformanceTimer(name, category = 'general') {
  return new PerformanceTimer(name, category)
}

/**
 * Get current memory usage (approximation)
 */
function getMemoryUsage() {
  if (performance.memory) {
    return performance.memory.usedJSHeapSize
  }
  // Fallback estimation
  return 0
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Get comprehensive performance statistics
 */
export function getPerformanceStats() {
  const sessionDuration = Date.now() - performanceStats.session.startTime
  const dbStats = performanceStats.databaseQueries
  const cacheStats = performanceStats.cachePerformance
  const memStats = performanceStats.memoryUsage
  const dataStats = performanceStats.dataFlow

  return {
    // Database Performance Summary
    databasePerformance: {
      totalQueries: dbStats.totalQueries,
      averageQueryTime: `${dbStats.averageTime.toFixed(2)}ms`,
      slowestQuery: {
        time: `${dbStats.slowestQuery.time.toFixed(2)}ms`,
        details: dbStats.slowestQuery.details
      },
      fastestQuery: {
        time: `${dbStats.fastestQuery.time.toFixed(2)}ms`,
        details: dbStats.fastestQuery.details
      },
      queriesByTable: Object.fromEntries(
        Object.entries(dbStats.queriesByTable).map(([table, stats]) => [
          table,
          {
            count: stats.count,
            avgTime: `${stats.avgTime.toFixed(2)}ms`,
            totalTime: `${stats.totalTime.toFixed(2)}ms`
          }
        ])
      ),
      queriesByType: Object.fromEntries(
        Object.entries(dbStats.queriesByType).map(([type, stats]) => [
          type,
          {
            count: stats.count,
            avgTime: `${stats.avgTime.toFixed(2)}ms`,
            totalTime: `${stats.totalTime.toFixed(2)}ms`
          }
        ])
      )
    },

    // Cache Performance Summary
    cachePerformance: {
      unifiedCacheHitRate: `${cacheStats.unifiedCacheHitRate.toFixed(2)}%`,
      legacyCacheHitRate: `${cacheStats.legacyCacheHitRate.toFixed(2)}%`,
      overallCacheHitRate: `${cacheStats.cacheHitRate.toFixed(2)}%`,
      cacheSizeReduction: `${cacheStats.cacheSizeReduction.toFixed(2)}%`,
      unifiedCacheHits: cacheStats.unifiedCacheHits,
      unifiedCacheMisses: cacheStats.unifiedCacheMisses,
      legacyCacheHits: cacheStats.legacyCacheHits,
      legacyCacheMisses: cacheStats.legacyCacheMisses,
      clientSideFilters: cacheStats.clientSideFilters,
      duplicateCacheEntriesAvoided: cacheStats.duplicateCacheEntriesAvoided
    },

    // Memory Usage Summary
    memoryUsage: {
      currentUsage: formatBytes(memStats.currentUsage),
      peakUsage: formatBytes(memStats.peakUsage),
      beforeOptimization: formatBytes(memStats.beforeOptimization),
      afterOptimization: formatBytes(memStats.afterOptimization),
      reduction: formatBytes(memStats.reduction),
      reductionPercentage: `${memStats.reductionPercentage.toFixed(2)}%`,
      duplicateCacheMemorySaved: formatBytes(memStats.duplicateCacheMemorySaved)
    },

    // Data Flow Summary
    dataFlow: {
      totalProgramsFetched: dataStats.programsFetched,
      templateProgramsFiltered: dataStats.templateProgramsFiltered,
      userProgramsFiltered: dataStats.userProgramsFiltered,
      averageTransformationTime: `${dataStats.transformationTime.toFixed(2)}ms`,
      averageFilteringTime: `${dataStats.filteringTime.toFixed(2)}ms`,
      dataFlowErrors: dataStats.dataFlowErrors,
      dataInconsistencies: dataStats.dataInconsistencies.length,
      recentInconsistencies: dataStats.dataInconsistencies.slice(-5)
    },

    // Session Summary
    session: {
      duration: formatDuration(sessionDuration),
      optimizationEnabled: performanceStats.session.optimizationEnabled,
      totalOptimizedQueries: performanceStats.session.totalOptimizedQueries,
      totalLegacyQueries: performanceStats.session.totalLegacyQueries,
      performanceImprovement: `${performanceStats.session.performanceImprovement.toFixed(2)}%`,
      queriesPerMinute: sessionDuration > 0 ? 
        ((dbStats.totalQueries / (sessionDuration / 60000)).toFixed(2)) : '0'
    }
  }
}

/**
 * Format duration in milliseconds to human readable format
 */
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

/**
 * Log performance summary
 */
export function logPerformanceSummary() {
  const stats = getPerformanceStats()
  const logger = createDebugLogger('PERFORMANCE_MONITOR', 'SUMMARY')

  logger.info('Performance Summary Report', {
    databaseQueries: stats.databasePerformance.totalQueries,
    avgQueryTime: stats.databasePerformance.averageQueryTime,
    cacheHitRate: stats.cachePerformance.overallCacheHitRate,
    memoryReduction: stats.memoryUsage.reductionPercentage,
    sessionDuration: stats.session.duration
  })

  console.log('📈 [PERFORMANCE_SUMMARY] Complete Performance Report:', stats)

  return stats
}

/**
 * Reset performance statistics
 */
export function resetPerformanceStats() {
  performanceStats = {
    databaseQueries: {
      totalQueries: 0,
      totalTime: 0,
      averageTime: 0,
      slowestQuery: { time: 0, details: null },
      fastestQuery: { time: Infinity, details: null },
      queriesByTable: {},
      queriesByType: {
        getAllUserPrograms: { count: 0, totalTime: 0, avgTime: 0 },
        getUserPrograms: { count: 0, totalTime: 0, avgTime: 0 },
        getUserProgramsFiltered: { count: 0, totalTime: 0, avgTime: 0 }
      }
    },
    cachePerformance: {
      unifiedCacheHits: 0,
      unifiedCacheMisses: 0,
      legacyCacheHits: 0,
      legacyCacheMisses: 0,
      clientSideFilters: 0,
      cacheHitRate: 0,
      unifiedCacheHitRate: 0,
      legacyCacheHitRate: 0,
      cacheSizeReduction: 0,
      duplicateCacheEntriesAvoided: 0
    },
    memoryUsage: {
      beforeOptimization: 0,
      afterOptimization: 0,
      reduction: 0,
      reductionPercentage: 0,
      peakUsage: 0,
      currentUsage: 0,
      cacheMemoryUsage: 0,
      duplicateCacheMemorySaved: 0
    },
    dataFlow: {
      programsFetched: 0,
      templateProgramsFiltered: 0,
      userProgramsFiltered: 0,
      transformationTime: 0,
      filteringTime: 0,
      dataFlowErrors: 0,
      dataInconsistencies: []
    },
    session: {
      startTime: Date.now(),
      optimizationEnabled: false,
      totalOptimizedQueries: 0,
      totalLegacyQueries: 0,
      performanceImprovement: 0
    }
  }

  console.log('🔄 [PERFORMANCE_MONITOR] Performance statistics reset')
}

/**
 * Enable optimization tracking
 */
export function enableOptimizationTracking() {
  performanceStats.session.optimizationEnabled = true
  console.log('✅ [PERFORMANCE_MONITOR] Optimization tracking enabled')
}

/**
 * Export performance stats for external monitoring
 */
export { performanceStats }