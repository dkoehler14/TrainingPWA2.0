// Enhanced Firestore cache utility with granular invalidation and cache warming
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, query as fsQuery, where, orderBy as fsOrderBy, limit as fsLimit, startAt as fsStartAt, endAt as fsEndAt, startAfter as fsStartAfter, endBefore as fsEndBefore, collectionGroup } from 'firebase/firestore';

// Enhanced cache with metadata
const cache = new Map();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

// Enhanced cache statistics with database read tracking
let cacheStats = {
  // Basic cache metrics
  hits: 0,
  misses: 0,
  invalidations: 0,
  totalQueries: 0,
  averageQueryTime: 0,
  
  // Database read tracking
  firestoreReads: 0,           // Actual database reads
  cacheServedQueries: 0,       // Queries served from cache
  readReductionRate: 0,        // Percentage of reads avoided
  estimatedCost: 0,            // Cost in USD for database reads
  estimatedSavings: 0,         // Cost savings from cache hits
  readsByCollection: {},       // Reads per collection
  readsByTimeOfDay: {},        // Read patterns by hour
  readsByUser: {},             // Read patterns by user
  
  // Performance metrics
  avgDatabaseQueryTime: 0,     // Average database query time
  avgCacheQueryTime: 0,        // Average cache query time
  performanceImprovement: 0,   // Speed improvement percentage
  bandwidthUsed: 0,            // Data transferred from database (bytes)
  bandwidthSaved: 0,           // Data transfer saved through cache (bytes)
  
  // Session metrics
  sessionStartTime: Date.now(),
  readsThisSession: 0,
  cacheHitsThisSession: 0,
  
  // Detailed tracking
  queryHistory: [],            // Recent query history (last 100)
  maxHistorySize: 100
};

// Performance monitoring
const queryPerformance = new Map();

// Firestore pricing constants (as of 2024)
const FIRESTORE_READ_COST_PER_100K = 0.06; // $0.06 per 100,000 reads

// Database read tracking functions
function trackFirestoreRead(collection, queryType, documentCount, dataSize, queryTime, userId = null) {
  cacheStats.firestoreReads++;
  cacheStats.readsThisSession++;
  
  // Track by collection
  if (!cacheStats.readsByCollection[collection]) {
    cacheStats.readsByCollection[collection] = { reads: 0, totalTime: 0, avgTime: 0 };
  }
  cacheStats.readsByCollection[collection].reads++;
  cacheStats.readsByCollection[collection].totalTime += queryTime;
  cacheStats.readsByCollection[collection].avgTime =
    cacheStats.readsByCollection[collection].totalTime / cacheStats.readsByCollection[collection].reads;
  
  // Track by time of day
  const hour = new Date().getHours();
  if (!cacheStats.readsByTimeOfDay[hour]) {
    cacheStats.readsByTimeOfDay[hour] = 0;
  }
  cacheStats.readsByTimeOfDay[hour]++;
  
  // Track by user if provided
  if (userId) {
    if (!cacheStats.readsByUser[userId]) {
      cacheStats.readsByUser[userId] = {
        totalReads: 0,
        cacheHits: 0,
        collections: {},
        lastActivity: Date.now(),
        estimatedCost: 0
      };
    }
    
    const userStats = cacheStats.readsByUser[userId];
    userStats.totalReads++;
    userStats.lastActivity = Date.now();
    userStats.estimatedCost = (userStats.totalReads / 100000) * FIRESTORE_READ_COST_PER_100K;
    
    if (!userStats.collections[collection]) {
      userStats.collections[collection] = 0;
    }
    userStats.collections[collection]++;
  }
  
  // Update bandwidth tracking
  cacheStats.bandwidthUsed += dataSize;
  
  // Calculate cost (Firestore pricing)
  cacheStats.estimatedCost = (cacheStats.firestoreReads / 100000) * FIRESTORE_READ_COST_PER_100K;
  
  // Update average database query time
  cacheStats.avgDatabaseQueryTime = cacheStats.avgDatabaseQueryTime * 0.9 + queryTime * 0.1;
  
  // Add to query history
  const historyEntry = {
    timestamp: Date.now(),
    type: 'database-read',
    collection,
    queryType,
    documentCount,
    dataSize,
    queryTime,
    userId
  };
  
  cacheStats.queryHistory.push(historyEntry);
  if (cacheStats.queryHistory.length > cacheStats.maxHistorySize) {
    cacheStats.queryHistory.shift();
  }
  
  console.log(`🗄️ Database read: ${collection} (${documentCount} docs, ${formatBytes(dataSize)}, ${queryTime.toFixed(2)}ms)`);
}

function trackCacheHit(collection, dataSize, queryTime, userId = null) {
  cacheStats.cacheServedQueries++;
  cacheStats.cacheHitsThisSession++;
  
  // Track by user if provided
  if (userId) {
    if (!cacheStats.readsByUser[userId]) {
      cacheStats.readsByUser[userId] = {
        totalReads: 0,
        cacheHits: 0,
        collections: {},
        lastActivity: Date.now(),
        estimatedSavings: 0
      };
    }
    
    const userStats = cacheStats.readsByUser[userId];
    userStats.cacheHits++;
    userStats.lastActivity = Date.now();
    userStats.estimatedSavings = (userStats.cacheHits / 100000) * FIRESTORE_READ_COST_PER_100K;
  }
  
  // Calculate bandwidth saved
  cacheStats.bandwidthSaved += dataSize;
  
  // Calculate cost savings
  cacheStats.estimatedSavings = (cacheStats.cacheServedQueries / 100000) * FIRESTORE_READ_COST_PER_100K;
  
  // Update read reduction rate
  const totalQueries = cacheStats.firestoreReads + cacheStats.cacheServedQueries;
  cacheStats.readReductionRate = totalQueries > 0 ?
    (cacheStats.cacheServedQueries / totalQueries * 100) : 0;
  
  // Update average cache query time
  cacheStats.avgCacheQueryTime = cacheStats.avgCacheQueryTime * 0.9 + queryTime * 0.1;
  
  // Calculate performance improvement
  if (cacheStats.avgDatabaseQueryTime > 0 && cacheStats.avgCacheQueryTime > 0) {
    cacheStats.performanceImprovement =
      ((cacheStats.avgDatabaseQueryTime - cacheStats.avgCacheQueryTime) / cacheStats.avgDatabaseQueryTime) * 100;
  }
  
  // Add to query history
  const historyEntry = {
    timestamp: Date.now(),
    type: 'cache-hit',
    collection,
    dataSize,
    queryTime,
    userId
  };
  
  cacheStats.queryHistory.push(historyEntry);
  if (cacheStats.queryHistory.length > cacheStats.maxHistorySize) {
    cacheStats.queryHistory.shift();
  }
  
  console.log(`⚡ Cache hit: ${collection} (${formatBytes(dataSize)}, ${queryTime.toFixed(2)}ms)`);
}

// Utility functions
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function extractUserId(queryParams) {
  // Try to extract userId from query parameters
  if (queryParams.where) {
    for (const [field, op, value] of queryParams.where) {
      if (field === 'userId' && op === '==') {
        return value;
      }
    }
  }
  return null;
}

function getCacheKey(type, path, params) {
  return JSON.stringify({ type, path, params });
}

function isExpired(entry) {
  return entry && entry.expiry < Date.now();
}

// Enhanced cache entry with metadata
function createCacheEntry(data, ttl, queryInfo = {}) {
  const entry = {
    data,
    expiry: Date.now() + ttl,
    createdAt: Date.now(),
    accessCount: 0,
    lastAccessed: Date.now(),
    size: JSON.stringify(data).length,
    queryInfo
  };
  return entry;
}

// Update cache statistics
function updateCacheStats(isHit, queryTime = 0) {
  cacheStats.totalQueries++;
  if (isHit) {
    cacheStats.hits++;
  } else {
    cacheStats.misses++;
  }
  
  // Update average query time (exponential moving average)
  if (queryTime > 0) {
    cacheStats.averageQueryTime = cacheStats.averageQueryTime * 0.9 + queryTime * 0.1;
  }
}

// Performance monitoring wrapper
function monitorQuery(queryName, queryFn) {
  return async (...args) => {
    const startTime = performance.now();
    try {
      const result = await queryFn(...args);
      const duration = performance.now() - startTime;
      
      // Track query performance
      if (!queryPerformance.has(queryName)) {
        queryPerformance.set(queryName, { count: 0, totalTime: 0, maxTime: 0, minTime: Infinity });
      }
      
      const perf = queryPerformance.get(queryName);
      perf.count++;
      perf.totalTime += duration;
      perf.maxTime = Math.max(perf.maxTime, duration);
      perf.minTime = Math.min(perf.minTime, duration);
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`🐌 Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`);
      }
      
      updateCacheStats(false, duration);
      return result;
    } catch (error) {
      console.error(`❌ Query failed: ${queryName}`, error);
      throw error;
    }
  };
}

// Generic getDocs with enhanced caching and read tracking
export async function getCollectionCached(collectionName, queryParams = {}, ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('collection', collectionName, queryParams);
  const cached = cache.get(cacheKey);
  const userId = extractUserId(queryParams);
  
  if (cached && !isExpired(cached)) {
    // Track cache hit
    const startTime = performance.now();
    cached.accessCount++;
    cached.lastAccessed = Date.now();
    const queryTime = performance.now() - startTime;
    const dataSize = JSON.stringify(cached.data).length;
    
    trackCacheHit(collectionName, dataSize, queryTime, userId);
    updateCacheStats(true);
    return cached.data;
  }

  // Database read required
  const queryFn = async () => {
    const startTime = performance.now();
    let q = collection(db, collectionName);
    const queryConstraints = [];

    // Build query constraints
    if (queryParams.where) {
      queryConstraints.push(...queryParams.where.map(([f, op, v]) => where(f, op, v)));
    }
    if (queryParams.orderBy) {
      queryConstraints.push(...queryParams.orderBy.map(([field, direction]) => fsOrderBy(field, direction)));
    }
    if (queryParams.limit) {
      queryConstraints.push(fsLimit(queryParams.limit));
    }
    if (queryParams.startAt) {
      queryConstraints.push(fsStartAt(queryParams.startAt));
    }
    if (queryParams.endAt) {
      queryConstraints.push(fsEndAt(queryParams.endAt));
    }
    if (queryParams.startAfter) {
      queryConstraints.push(fsStartAfter(queryParams.startAfter));
    }
    if (queryParams.endBefore) {
      queryConstraints.push(fsEndBefore(queryParams.endBefore));
    }

    if (queryConstraints.length > 0) {
      q = fsQuery(q, ...queryConstraints);
    }

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const queryTime = performance.now() - startTime;
    const dataSize = JSON.stringify(data).length;
    
    // Track database read
    trackFirestoreRead(collectionName, 'collection', data.length, dataSize, queryTime, userId);
    
    return data;
  };

  const data = await monitorQuery(`getCollection:${collectionName}`, queryFn)();
  const entry = createCacheEntry(data, ttl, { collectionName, queryParams });
  cache.set(cacheKey, entry);
  
  return data;
}

// Get collection group with enhanced caching and read tracking
export async function getCollectionGroupCached(collectionName, queryParams = {}, ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('collectionGroup', collectionName, queryParams);
  const cached = cache.get(cacheKey);
  const userId = extractUserId(queryParams);
  
  if (cached && !isExpired(cached)) {
    // Track cache hit
    const startTime = performance.now();
    cached.accessCount++;
    cached.lastAccessed = Date.now();
    const queryTime = performance.now() - startTime;
    const dataSize = JSON.stringify(cached.data).length;
    
    trackCacheHit(`${collectionName}Group`, dataSize, queryTime, userId);
    updateCacheStats(true);
    return cached.data;
  }

  // Database read required
  const queryFn = async () => {
    const startTime = performance.now();
    let q = collectionGroup(db, collectionName);
    const queryConstraints = [];

    // Build query constraints (same as above)
    if (queryParams.where) {
      queryConstraints.push(...queryParams.where.map(([f, op, v]) => where(f, op, v)));
    }
    if (queryParams.orderBy) {
      queryConstraints.push(...queryParams.orderBy.map(([field, direction]) => fsOrderBy(field, direction)));
    }
    if (queryParams.limit) {
      queryConstraints.push(fsLimit(queryParams.limit));
    }
    if (queryParams.startAt) {
      queryConstraints.push(fsStartAt(queryParams.startAt));
    }
    if (queryParams.endAt) {
      queryConstraints.push(fsEndAt(queryParams.endAt));
    }
    if (queryParams.startAfter) {
      queryConstraints.push(fsStartAfter(queryParams.startAfter));
    }
    if (queryParams.endBefore) {
      queryConstraints.push(fsEndBefore(queryParams.endBefore));
    }

    if (queryConstraints.length > 0) {
      q = fsQuery(q, ...queryConstraints);
    }

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const queryTime = performance.now() - startTime;
    const dataSize = JSON.stringify(data).length;
    
    // Track database read
    trackFirestoreRead(`${collectionName}Group`, 'collectionGroup', data.length, dataSize, queryTime, userId);
    
    return data;
  };

  const data = await monitorQuery(`getCollectionGroup:${collectionName}`, queryFn)();
  const entry = createCacheEntry(data, ttl, { collectionName, queryParams, isCollectionGroup: true });
  cache.set(cacheKey, entry);
  
  return data;
}

// Get subcollection with enhanced caching and read tracking
export async function getSubcollectionCached(parentPath, subcollectionName, queryParams = {}, ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('subcollection', `${parentPath}/${subcollectionName}`, queryParams);
  const cached = cache.get(cacheKey);
  const userId = extractUserId(queryParams);
  
  if (cached && !isExpired(cached)) {
    // Track cache hit
    const startTime = performance.now();
    cached.accessCount++;
    cached.lastAccessed = Date.now();
    const queryTime = performance.now() - startTime;
    const dataSize = JSON.stringify(cached.data).length;
    
    trackCacheHit(`${parentPath}/${subcollectionName}`, dataSize, queryTime, userId);
    updateCacheStats(true);
    return cached.data;
  }

  // Database read required
  const queryFn = async () => {
    const startTime = performance.now();
    let q = collection(db, ...parentPath.split('/'), subcollectionName);
    const queryConstraints = [];

    // Build query constraints (same as above)
    if (queryParams.where) {
      queryConstraints.push(...queryParams.where.map(([f, op, v]) => where(f, op, v)));
    }
    if (queryParams.orderBy) {
      queryConstraints.push(...queryParams.orderBy.map(([field, direction]) => fsOrderBy(field, direction)));
    }
    if (queryParams.limit) {
      queryConstraints.push(fsLimit(queryParams.limit));
    }
    if (queryParams.startAt) {
      queryConstraints.push(fsStartAt(queryParams.startAt));
    }
    if (queryParams.endAt) {
      queryConstraints.push(fsEndAt(queryParams.endAt));
    }
    if (queryParams.startAfter) {
      queryConstraints.push(fsStartAfter(queryParams.startAfter));
    }
    if (queryParams.endBefore) {
      queryConstraints.push(fsEndBefore(queryParams.endBefore));
    }

    if (queryConstraints.length > 0) {
      q = fsQuery(q, ...queryConstraints);
    }

    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const queryTime = performance.now() - startTime;
    const dataSize = JSON.stringify(data).length;
    
    // Track database read
    trackFirestoreRead(`${parentPath}/${subcollectionName}`, 'subcollection', data.length, dataSize, queryTime, userId);
    
    return data;
  };

  const data = await monitorQuery(`getSubcollection:${parentPath}/${subcollectionName}`, queryFn)();
  const entry = createCacheEntry(data, ttl, { parentPath, subcollectionName, queryParams });
  cache.set(cacheKey, entry);
  
  return data;
}

// Generic getDoc with enhanced caching and read tracking
export async function getDocCached(collectionName, docId, ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('doc', `${collectionName}/${docId}`);
  const cached = cache.get(cacheKey);
  
  if (cached && !isExpired(cached)) {
    // Track cache hit
    const startTime = performance.now();
    cached.accessCount++;
    cached.lastAccessed = Date.now();
    const queryTime = performance.now() - startTime;
    const dataSize = JSON.stringify(cached.data).length;
    
    trackCacheHit(collectionName, dataSize, queryTime);
    updateCacheStats(true);
    return cached.data;
  }

  // Database read required
  const queryFn = async () => {
    const startTime = performance.now();
    const docRef = doc(db, collectionName, docId);
    const snapshot = await getDoc(docRef);
    const data = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
    const queryTime = performance.now() - startTime;
    const dataSize = data ? JSON.stringify(data).length : 0;
    
    // Track database read (single document = 1 read)
    trackFirestoreRead(collectionName, 'document', 1, dataSize, queryTime);
    
    return data;
  };

  const data = await monitorQuery(`getDoc:${collectionName}/${docId}`, queryFn)();
  const entry = createCacheEntry(data, ttl, { collectionName, docId });
  cache.set(cacheKey, entry);
  
  return data;
}

// Enhanced granular cache invalidation
export function invalidateCache(patterns, options = {}) {
  const { 
    exact = false, 
    userId = null, 
    collections = [], 
    reason = 'manual' 
  } = options;
  
  let invalidatedCount = 0;
  const keysToDelete = [];
  
  // Convert single pattern to array
  const patternArray = Array.isArray(patterns) ? patterns : [patterns];
  
  for (const [key] of cache) {
    let shouldInvalidate = false;
    
    // Check pattern matching
    for (const pattern of patternArray) {
      if (exact) {
        if (key.includes(`"path":"${pattern}"`)) {
          shouldInvalidate = true;
          break;
        }
      } else {
        if (key.includes(pattern)) {
          shouldInvalidate = true;
          break;
        }
      }
    }
    
    // Additional filtering by userId
    if (shouldInvalidate && userId) {
      const keyObj = JSON.parse(key);
      if (keyObj.params?.where) {
        const hasUserFilter = keyObj.params.where.some(([field, op, value]) => 
          field === 'userId' && value === userId
        );
        if (!hasUserFilter) {
          shouldInvalidate = false;
        }
      }
    }
    
    // Additional filtering by collections
    if (shouldInvalidate && collections.length > 0) {
      const keyObj = JSON.parse(key);
      if (!collections.includes(keyObj.path)) {
        shouldInvalidate = false;
      }
    }
    
    if (shouldInvalidate) {
      keysToDelete.push(key);
    }
  }
  
  // Delete matched keys
  keysToDelete.forEach(key => {
    cache.delete(key);
    invalidatedCount++;
  });
  
  cacheStats.invalidations += invalidatedCount;
  
  console.log(`🗑️ Cache invalidation: ${invalidatedCount} entries removed (reason: ${reason})`);
  return invalidatedCount;
}

// Selective cache invalidation for specific use cases
export function invalidateUserCache(userId) {
  return invalidateCache(['workoutLogs', 'programs', 'userAnalytics'], { 
    userId, 
    reason: 'user-specific' 
  });
}

export function invalidateWorkoutCache(userId) {
  return invalidateCache(['workoutLogs'], { 
    userId, 
    reason: 'workout-update' 
  });
}

export function invalidateProgramCache(userId) {
  return invalidateCache(['programs'], { 
    userId, 
    reason: 'program-update' 
  });
}

export function invalidateExerciseCache() {
  return invalidateCache(['exercises', 'exercises_metadata'], {
    reason: 'exercise-update'
  });
}

// Cache warming strategies
export async function warmUserCache(userId, priority = 'normal') {
  console.log(`🔥 Warming cache for user: ${userId} (priority: ${priority})`);
  
  const warmingPromises = [];
  
  try {
    // High priority: Essential data
    if (priority === 'high' || priority === 'normal') {
      warmingPromises.push(
        // Global exercises metadata (long TTL)
        getAllExercisesMetadata(60 * 60 * 1000), // 1 hour
        
        // User-specific exercises metadata
        getDocCached('exercises_metadata', userId, 60 * 60 * 1000).catch(() => null), // May not exist
        
        // User programs
        getCollectionCached('programs', {
          where: [['userId', '==', userId]]
        }, 30 * 60 * 1000), // 30 minutes
        
        // Recent workout logs
        getCollectionCached('workoutLogs', {
          where: [
            ['userId', '==', userId],
            ['date', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)] // Last 7 days
          ],
          orderBy: [['date', 'desc']],
          limit: 20
        }, 15 * 60 * 1000) // 15 minutes
      );
    }
    
    // Normal priority: Analytics data
    // if (priority === 'normal') {
    //   warmingPromises.push(
    //     // User analytics
    //     getSubcollectionCached(`userAnalytics/${userId}`, 'exerciseAnalytics', {}, 15 * 60 * 1000),
        
    //     // Monthly analytics
    //     getSubcollectionCached(`userAnalytics/${userId}`, 'monthlyAnalytics', {}, 30 * 60 * 1000)
    //   );
    // }
    
    // Execute warming promises
    const results = await Promise.allSettled(warmingPromises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Cache warming completed: ${successful} successful, ${failed} failed`);
    
    return { successful, failed, total: warmingPromises.length };
  } catch (error) {
    console.error('❌ Cache warming failed:', error);
    throw error;
  }
}

// Progressive cache warming on app startup
export async function warmAppCache() {
  console.log('🚀 Starting app cache warming...');
  
  try {
    // Warm global exercises metadata first
    await getAllExercisesMetadata(60 * 60 * 1000); // 1 hour TTL
    
    console.log('✅ App cache warming completed');
  } catch (error) {
    console.error('❌ App cache warming failed:', error);
  }
}

// Cache cleanup - remove expired entries
export function cleanupCache() {
  let cleanedCount = 0;
  const keysToDelete = [];
  
  for (const [key, entry] of cache) {
    if (isExpired(entry)) {
      keysToDelete.push(key);
    }
  }
  
  keysToDelete.forEach(key => {
    cache.delete(key);
    cleanedCount++;
  });
  
  console.log(`🧹 Cache cleanup: ${cleanedCount} expired entries removed`);
  return cleanedCount;
}

// Cache statistics and monitoring
export function getCacheStats() {
  const hitRate = cacheStats.totalQueries > 0 ?
    (cacheStats.hits / cacheStats.totalQueries * 100).toFixed(2) : 0;
  
  const cacheSize = cache.size;
  const totalMemoryUsage = Array.from(cache.values())
    .reduce((total, entry) => total + entry.size, 0);
  
  return {
    ...cacheStats,
    hitRate: `${hitRate}%`,
    cacheSize,
    memoryUsage: `${(totalMemoryUsage / 1024).toFixed(2)} KB`,
    queryPerformance: Object.fromEntries(
      Array.from(queryPerformance.entries()).map(([name, perf]) => [
        name,
        {
          ...perf,
          averageTime: perf.count > 0 ? (perf.totalTime / perf.count).toFixed(2) : 0
        }
      ])
    )
  };
}

// Enhanced statistics function with detailed read tracking
export function getEnhancedCacheStats() {
  const totalQueries = cacheStats.firestoreReads + cacheStats.cacheServedQueries;
  const sessionDuration = Date.now() - cacheStats.sessionStartTime;
  
  return {
    // Database Read Tracking
    databaseReads: {
      total: cacheStats.firestoreReads,
      thisSession: cacheStats.readsThisSession,
      byCollection: cacheStats.readsByCollection,
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
      costPerRead: `$${(FIRESTORE_READ_COST_PER_100K / 100000).toFixed(8)}`,
      projectedMonthlyCost: `$${(cacheStats.firestoreReads * 30 * (FIRESTORE_READ_COST_PER_100K / 100000)).toFixed(2)}`,
      projectedMonthlySavings: `$${(cacheStats.cacheServedQueries * 30 * (FIRESTORE_READ_COST_PER_100K / 100000)).toFixed(2)}`
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
        ((cacheStats.firestoreReads / (sessionDuration / 60000)).toFixed(2)) : '0',
      cacheHitsPerMinute: sessionDuration > 0 ?
        ((cacheStats.cacheServedQueries / (sessionDuration / 60000)).toFixed(2)) : '0'
    },
    
    // Recent Activity
    recentActivity: {
      queryHistory: cacheStats.queryHistory.slice(-10), // Last 10 queries
      topCollections: Object.entries(cacheStats.readsByCollection)
        .sort(([,a], [,b]) => b.reads - a.reads)
        .slice(0, 5)
        .map(([collection, stats]) => ({
          collection,
          reads: stats.reads,
          avgTime: `${stats.avgTime.toFixed(2)}ms`
        }))
    },
    
    // Cache Health
    cacheHealth: {
      size: cache.size,
      memoryUsage: formatBytes(Array.from(cache.values()).reduce((total, entry) => total + entry.size, 0)),
      hitRate: totalQueries > 0 ? `${((cacheStats.cacheServedQueries / totalQueries) * 100).toFixed(2)}%` : '0%',
      invalidations: cacheStats.invalidations,
      avgQueryTime: `${cacheStats.averageQueryTime.toFixed(2)}ms`
    }
  };
}

// Debug function to inspect cache contents
export function debugCache(pattern = null) {
  const entries = [];
  
  for (const [key, entry] of cache) {
    if (!pattern || key.includes(pattern)) {
      const keyObj = JSON.parse(key);
      entries.push({
        key: keyObj,
        size: entry.size,
        accessCount: entry.accessCount,
        age: Date.now() - entry.createdAt,
        ttl: entry.expiry - Date.now(),
        expired: isExpired(entry)
      });
    }
  }
  
  return entries.sort((a, b) => b.accessCount - a.accessCount);
}

// Auto cleanup interval (run every 5 minutes)
setInterval(cleanupCache, 5 * 60 * 1000);

// Export legacy functions for backward compatibility
export { invalidateCache as invalidateCacheLegacy };

// Fetch all exercises from the exercises_metadata/all_exercises document
export async function getAllExercisesMetadata(ttl = DEFAULT_TTL) {
  const cacheKey = getCacheKey('exercises_metadata', 'all_exercises', {});
  const cached = cache.get(cacheKey);
  if (cached && !isExpired(cached)) {
    return cached.data;
  }

  // Fetch the single metadata document
  const docRef = doc(db, 'exercises_metadata', 'all_exercises');
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) {
    throw new Error('exercises_metadata/all_exercises document does not exist');
  }
  const data = docSnap.data();
  // Convert the map to an array, including the id
  const exercisesMap = data.exercises || {};
  const exercisesArr = Object.entries(exercisesMap).map(([id, ex]) => ({ id, ...ex }));
  cache.set(cacheKey, { data: exercisesArr, expiry: Date.now() + ttl });
  return exercisesArr;
}