/**
 * Supabase Cache Migration Layer
 * 
 * This module provides backward-compatible wrapper functions that maintain
 * the same interface as the existing Firestore cache functions but use
 * the new Supabase cache system underneath.
 */

import { supabase } from '../config/supabase'
import { supabaseCache, getWithCache, invalidateCache as invalidateSupabaseCache } from './supabaseCache'

/**
 * Migration wrapper for getCollectionCached
 * Converts Firestore query parameters to Supabase query
 */
export async function getCollectionCached(tableName, queryParams = {}, ttl = 5 * 60 * 1000) {
  const cacheKey = generateCacheKey('collection', tableName, queryParams)
  
  const queryFn = async () => {
    let query = supabase.from(tableName).select('*')
    
    // Convert Firestore where clauses to Supabase filters
    if (queryParams.where) {
      for (const [field, operator, value] of queryParams.where) {
        switch (operator) {
          case '==':
            query = query.eq(field, value)
            break
          case '!=':
            query = query.neq(field, value)
            break
          case '>':
            query = query.gt(field, value)
            break
          case '>=':
            query = query.gte(field, value)
            break
          case '<':
            query = query.lt(field, value)
            break
          case '<=':
            query = query.lte(field, value)
            break
          case 'in':
            query = query.in(field, value)
            break
          case 'array-contains':
            // PostgreSQL array contains - need to use contains operator
            query = query.contains(field, [value])
            break
          case 'array-contains-any':
            // PostgreSQL overlaps operator
            query = query.overlaps(field, value)
            break
          default:
            console.warn(`Unsupported operator: ${operator}`)
        }
      }
    }
    
    // Convert Firestore orderBy to Supabase order
    if (queryParams.orderBy) {
      for (const [field, direction] of queryParams.orderBy) {
        const ascending = direction === 'asc' || direction === undefined
        query = query.order(field, { ascending })
      }
    }
    
    // Convert Firestore limit to Supabase limit
    if (queryParams.limit) {
      query = query.limit(queryParams.limit)
    }
    
    // Handle pagination (startAt, endAt, etc.)
    if (queryParams.offset) {
      query = query.range(queryParams.offset, queryParams.offset + (queryParams.limit || 1000) - 1)
    }
    
    return await query
  }
  
  const userId = extractUserIdFromQuery(queryParams)
  
  return await getWithCache(cacheKey, queryFn, {
    ttl,
    table: tableName,
    tags: [tableName],
    userId
  })
}

/**
 * Migration wrapper for getDocCached
 * Gets a single document by ID
 */
export async function getDocCached(tableName, docId, ttl = 5 * 60 * 1000) {
  const cacheKey = generateCacheKey('doc', `${tableName}/${docId}`)
  
  const queryFn = async () => {
    return await supabase
      .from(tableName)
      .select('*')
      .eq('id', docId)
      .single()
  }
  
  return await getWithCache(cacheKey, queryFn, {
    ttl,
    table: tableName,
    tags: [tableName, 'single-doc']
  })
}

/**
 * Migration wrapper for getSubcollectionCached
 * In PostgreSQL, this becomes a filtered query on a related table
 */
export async function getSubcollectionCached(parentPath, subcollectionName, queryParams = {}, ttl = 5 * 60 * 1000) {
  // Extract parent ID from path (e.g., "userAnalytics/userId" -> "userId")
  const pathParts = parentPath.split('/')
  const parentId = pathParts[pathParts.length - 1]
  const parentTable = pathParts[pathParts.length - 2]
  
  // Map Firestore subcollection patterns to PostgreSQL table relationships
  const tableMapping = {
    'userAnalytics/exerciseAnalytics': 'user_analytics',
    'userAnalytics/monthlyAnalytics': 'user_analytics', // Could be a separate table or filtered view
    'programs/workouts': 'program_workouts',
    'workouts/exercises': 'program_exercises'
  }
  
  const actualTable = tableMapping[`${parentTable}/${subcollectionName}`] || subcollectionName
  const cacheKey = generateCacheKey('subcollection', `${parentPath}/${subcollectionName}`, queryParams)
  
  const queryFn = async () => {
    let query = supabase.from(actualTable).select('*')
    
    // Add parent relationship filter
    const parentIdField = getParentIdField(parentTable, actualTable)
    if (parentIdField) {
      query = query.eq(parentIdField, parentId)
    }
    
    // Apply additional query parameters
    if (queryParams.where) {
      for (const [field, operator, value] of queryParams.where) {
        switch (operator) {
          case '==':
            query = query.eq(field, value)
            break
          case '!=':
            query = query.neq(field, value)
            break
          case '>':
            query = query.gt(field, value)
            break
          case '>=':
            query = query.gte(field, value)
            break
          case '<':
            query = query.lt(field, value)
            break
          case '<=':
            query = query.lte(field, value)
            break
          default:
            console.warn(`Unsupported operator in subcollection: ${operator}`)
        }
      }
    }
    
    if (queryParams.orderBy) {
      for (const [field, direction] of queryParams.orderBy) {
        const ascending = direction === 'asc' || direction === undefined
        query = query.order(field, { ascending })
      }
    }
    
    if (queryParams.limit) {
      query = query.limit(queryParams.limit)
    }
    
    return await query
  }
  
  return await getWithCache(cacheKey, queryFn, {
    ttl,
    table: actualTable,
    tags: [actualTable, parentTable, 'subcollection'],
    userId: parentId
  })
}

/**
 * Migration wrapper for getCollectionGroupCached
 * In PostgreSQL, this becomes a query across all related tables
 */
export async function getCollectionGroupCached(collectionName, queryParams = {}, ttl = 5 * 60 * 1000) {
  // Collection groups in Firestore are like querying all subcollections with the same name
  // In PostgreSQL, this is typically just a regular table query
  return await getCollectionCached(collectionName, queryParams, ttl)
}

/**
 * Migration wrapper for getAllExercisesMetadata
 * Fetches all global exercises from the exercises table
 */
export async function getAllExercisesMetadata(ttl = 5 * 60 * 1000) {
  const cacheKey = 'exercises_metadata_all'
  
  const queryFn = async () => {
    return await supabase
      .from('exercises')
      .select('*')
      .eq('is_global', true)
  }
  
  return await getWithCache(cacheKey, queryFn, {
    ttl,
    table: 'exercises',
    tags: ['exercises', 'global', 'metadata']
  })
}

/**
 * Cache invalidation functions - migrated to use Supabase cache
 */
export function invalidateCache(patterns) {
  return invalidateSupabaseCache(patterns)
}

export function invalidateUserCache(userId) {
  return invalidateSupabaseCache(['workout_logs', 'programs', 'user_analytics'], { 
    userId, 
    reason: 'user-specific' 
  })
}

export function invalidateWorkoutCache(userId) {
  return invalidateSupabaseCache(['workout_logs'], { 
    userId, 
    reason: 'workout-update' 
  })
}

export function invalidateProgramCache(userId) {
  return invalidateSupabaseCache(['programs'], { 
    userId, 
    reason: 'program-update' 
  })
}

export function invalidateExerciseCache() {
  return invalidateSupabaseCache(['exercises'], {
    reason: 'exercise-update'
  })
}

/**
 * Cache warming functions - migrated to use Supabase cache
 */
export async function warmUserCache(userId, priority = 'normal') {
  console.log(`🔥 Warming Supabase cache for user: ${userId} (priority: ${priority})`)
  
  const warmingPromises = []
  
  try {
    // High priority: Essential data
    if (priority === 'high' || priority === 'normal') {
      // Global exercises
      warmingPromises.push(getAllExercisesMetadata(60 * 60 * 1000))
      
      // User programs
      warmingPromises.push(
        getCollectionCached('programs', {
          where: [['user_id', '==', userId]]
        }, 30 * 60 * 1000)
      )
      
      // Recent workout logs
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      warmingPromises.push(
        getCollectionCached('workout_logs', {
          where: [
            ['user_id', '==', userId],
            ['date', '>=', sevenDaysAgo]
          ],
          orderBy: [['date', 'desc']],
          limit: 20
        }, 15 * 60 * 1000)
      )
    }
    
    // Execute warming promises
    const results = await Promise.allSettled(warmingPromises)
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length
    
    console.log(`✅ Supabase cache warming completed: ${successful} successful, ${failed} failed`)
    
    return { successful, failed, total: warmingPromises.length }
  } catch (error) {
    console.error('❌ Supabase cache warming failed:', error)
    throw error
  }
}

/**
 * Cache statistics functions - migrated to use Supabase cache
 */
export function getCacheStats() {
  return supabaseCache.getStats()
}

export function getEnhancedCacheStats() {
  return supabaseCache.getEnhancedStats()
}

/**
 * Helper functions
 */
function generateCacheKey(type, path, params = {}) {
  return JSON.stringify({ type, path, params })
}

function extractUserIdFromQuery(queryParams) {
  if (queryParams.where) {
    for (const [field, operator, value] of queryParams.where) {
      if ((field === 'userId' || field === 'user_id') && operator === '==') {
        return value
      }
    }
  }
  return null
}

function getParentIdField(parentTable, childTable) {
  // Map parent table to foreign key field in child table
  const fieldMapping = {
    'userAnalytics': 'user_id',
    'programs': 'program_id',
    'workouts': 'workout_id',
    'users': 'user_id'
  }
  
  return fieldMapping[parentTable] || `${parentTable.slice(0, -1)}_id` // Remove 's' and add '_id'
}

// Export all functions for backward compatibility
export {
  // Main cache functions
  getCollectionCached,
  getDocCached,
  getSubcollectionCached,
  getCollectionGroupCached,
  getAllExercisesMetadata,
  
  // Cache management
  invalidateCache,
  invalidateUserCache,
  invalidateWorkoutCache,
  invalidateProgramCache,
  invalidateExerciseCache,
  
  // Cache warming
  warmUserCache,
  
  // Statistics
  getCacheStats,
  getEnhancedCacheStats
}