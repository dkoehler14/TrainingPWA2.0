# Migration Guide: Firestore to Supabase Cache Warming

## Overview

This guide provides step-by-step instructions for migrating from the Firestore-based cache warming system to the new Supabase Cache Warming Service. The migration maintains API compatibility while providing enhanced functionality and better integration with the Supabase infrastructure.

## Migration Checklist

- [ ] Update import statements
- [ ] Replace service initialization
- [ ] Update cache function calls
- [ ] Test warming functionality
- [ ] Remove old Firestore references
- [ ] Update configuration
- [ ] Verify performance improvements

## Step-by-Step Migration

### 1. Update Import Statements

#### Before (Firestore)
```javascript
// Old Firestore cache imports
import { 
  warmUserCache, 
  warmAppCache, 
  getCacheStats,
  invalidateCache,
  invalidateUserCache
} from '../api/enhancedFirestoreCache';

import { cacheWarmingService } from '../services/cacheWarmingService';
```

#### After (Supabase)
```javascript
// New Supabase cache imports
import { 
  warmUserCache, 
  warmAppCache, 
  getCacheStats 
} from '../api/supabaseCache';

import { SupabaseCacheWarmingService } from '../services/supabaseCacheWarmingService';
```

### 2. Service Initialization

#### Before (Firestore)
```javascript
// App.js - Old initialization
import { cacheWarmingService } from './services/cacheWarmingService';

function App() {
  useEffect(() => {
    // Initialize cache warming
    cacheWarmingService.initializeAppCache();
    
    if (user?.uid) {
      cacheWarmingService.warmUserCacheWithRetry(user.uid, 'high');
    }
  }, [user]);
}
```

#### After (Supabase)
```javascript
// App.js - New initialization
import { SupabaseCacheWarmingService } from './services/supabaseCacheWarmingService';

function App() {
  const [cacheService] = useState(() => new SupabaseCacheWarmingService());
  
  useEffect(() => {
    // Start the service
    cacheService.start();
    
    // Initialize app cache
    cacheService.initializeAppCache();
    
    // Cleanup on unmount
    return () => {
      cacheService.stop();
    };
  }, [cacheService]);
  
  useEffect(() => {
    if (user?.uid) {
      cacheService.warmUserCacheWithRetry(user.uid, 'high');
    }
  }, [user, cacheService]);
}
```

### 3. Component Updates

#### Before (Firestore)
```javascript
// Component using old cache service
import { cacheWarmingService } from '../services/cacheWarmingService';

const WorkoutComponent = () => {
  useEffect(() => {
    if (user?.uid) {
      cacheWarmingService.warmUserCacheWithRetry(user.uid, 'normal');
    }
  }, [user]);
  
  const handlePageChange = () => {
    cacheWarmingService.smartWarmCache(user.uid, { page: 'workout' });
  };
};
```

#### After (Supabase)
```javascript
// Component using new cache service
import { SupabaseCacheWarmingService } from '../services/supabaseCacheWarmingService';

const WorkoutComponent = () => {
  const cacheService = SupabaseCacheWarmingService.instance;
  
  useEffect(() => {
    if (user?.uid) {
      cacheService.warmUserCacheWithRetry(user.uid, 'normal');
    }
  }, [user]);
  
  const handlePageChange = () => {
    const context = {
      currentPage: 'LogWorkout',
      previousPage: 'Programs',
      timeOfDay: new Date()
    };
    cacheService.smartWarmCache(user.uid, context);
  };
};
```

### 4. Cache Function Updates

#### Before (Firestore)
```javascript
// Old cache invalidation
import { invalidateCache, invalidateUserCache } from '../api/enhancedFirestoreCache';

// Invalidate specific cache
await invalidateCache('workoutLogs');
await invalidateUserCache(userId, 'exercises');

// Get cache statistics
import { getCacheStats } from '../api/enhancedFirestoreCache';
const stats = getCacheStats();
```

#### After (Supabase)
```javascript
// New cache operations (handled automatically by service)
import { getCacheStats } from '../api/supabaseCache';

// Cache invalidation is handled automatically by Supabase cache
// No manual invalidation needed

// Get enhanced statistics from service
const service = SupabaseCacheWarmingService.instance;
const stats = service.getWarmingStats();
const cacheStats = await getCacheStats();
```

### 5. Configuration Migration

#### Before (Firestore)
```javascript
// Old configuration (if any)
const cacheConfig = {
  ttl: 5 * 60 * 1000, // 5 minutes
  maxRetries: 3
};
```

#### After (Supabase)
```javascript
// New comprehensive configuration
const cacheService = new SupabaseCacheWarmingService({
  // Retry configuration
  maxRetries: 3,
  retryDelays: [1000, 2000, 4000],
  
  // Maintenance settings
  maintenanceInterval: 15, // minutes
  maxHistorySize: 50,
  
  // Queue configuration
  queueConfig: {
    maxQueueSize: 100,
    maxConcurrentWarming: 3,
    queueProcessingInterval: 500,
    enablePersistence: false
  },
  
  // Enhanced features
  statsConfig: {
    enableMemoryTracking: true,
    enableBandwidthTracking: true,
    enableCostAnalysis: true
  }
});
```

## API Compatibility Matrix

| Firestore Method | Supabase Equivalent | Notes |
|------------------|-------------------|-------|
| `warmUserCache(userId)` | `warmUserCacheWithRetry(userId, priority)` | Enhanced with priority and retry logic |
| `warmAppCache()` | `initializeAppCache()` | Same functionality, better naming |
| `smartWarmCache(userId, context)` | `smartWarmCache(userId, context)` | Enhanced context analysis |
| `getCacheStats()` | `getWarmingStats()` | More comprehensive statistics |
| `invalidateCache(collection)` | Automatic invalidation | Handled by Supabase cache layer |
| `performMaintenance()` | `performMaintenance()` | Enhanced with queue management |

## Enhanced Features Available After Migration

### 1. Intelligent Context Analysis
```javascript
// New context-aware warming
const context = {
  currentPage: 'LogWorkout',
  previousPage: 'Programs',
  timeOfDay: new Date(),
  userPreferences: { workoutFocus: 'strength' },
  behaviorPatterns: { frequentPages: ['LogWorkout', 'ProgressTracker'] }
};

await cacheService.smartWarmCache(userId, context);
```

### 2. Progressive Warming
```javascript
// Multi-phase warming strategy
await cacheService.progressiveWarmCache(userId);
// Phase 1: Critical data (immediate)
// Phase 2: Analytics data (2s delay)
// Phase 3: Extended data (5s delay)
```

### 3. Priority-Based Queue Management
```javascript
// High priority for critical operations
await cacheService.warmUserCacheWithRetry(userId, 'high');

// Normal priority for general navigation
await cacheService.warmUserCacheWithRetry(userId, 'normal');

// Low priority for background operations
await cacheService.warmUserCacheWithRetry(userId, 'low');
```

### 4. Enhanced Statistics and Monitoring
```javascript
const stats = cacheService.getWarmingStats();

console.log('Success rate:', stats.successRate);
console.log('Cost savings:', stats.costSavings.estimatedSavings);
console.log('Performance improvement:', stats.performanceMetrics.cacheHitImprovement);
console.log('Queue status:', stats.queueSize);
```

## Testing Migration

### 1. Functional Testing
```javascript
// Test basic warming functionality
const testBasicWarming = async () => {
  const service = new SupabaseCacheWarmingService();
  service.start();
  
  // Test app cache initialization
  const appResult = await service.initializeAppCache();
  console.log('App cache warming:', appResult.success);
  
  // Test user cache warming
  const userResult = await service.warmUserCacheWithRetry('test-user', 'high');
  console.log('User cache warming:', userResult.success);
  
  service.stop();
};
```

### 2. Performance Testing
```javascript
// Compare performance before and after migration
const testPerformance = async () => {
  const service = SupabaseCacheWarmingService.instance;
  
  // Warm cache
  await service.initializeAppCache();
  await service.warmUserCacheWithRetry(userId, 'high');
  
  // Test query performance
  const startTime = Date.now();
  const data = await getWorkoutLogs(userId);
  const endTime = Date.now();
  
  console.log('Query time with cache:', endTime - startTime, 'ms');
  
  // Check cache statistics
  const stats = service.getWarmingStats();
  console.log('Cache performance:', stats.performanceMetrics);
};
```

### 3. Error Handling Testing
```javascript
// Test error scenarios
const testErrorHandling = async () => {
  const service = new SupabaseCacheWarmingService({
    maxRetries: 2,
    retryDelays: [500, 1000]
  });
  
  try {
    // Test with invalid user ID
    await service.warmUserCacheWithRetry('invalid-user', 'high');
  } catch (error) {
    console.log('Error handled gracefully:', error.message);
  }
  
  // Check error statistics
  const stats = service.getWarmingStats();
  console.log('Error rate:', (stats.failedEvents / stats.totalEvents) * 100, '%');
};
```

## Common Migration Issues

### Issue 1: Import Errors
**Problem**: `Cannot resolve module '../services/cacheWarmingService'`

**Solution**: Update import paths to use the new service:
```javascript
// Change this:
import { cacheWarmingService } from '../services/cacheWarmingService';

// To this:
import { SupabaseCacheWarmingService } from '../services/supabaseCacheWarmingService';
```

### Issue 2: Service Not Starting
**Problem**: Cache warming not working after migration

**Solution**: Ensure service is properly started:
```javascript
const service = new SupabaseCacheWarmingService();
service.start(); // Don't forget this!
```

### Issue 3: Context Object Changes
**Problem**: Smart warming not working with old context format

**Solution**: Update context object structure:
```javascript
// Old format:
const context = { page: 'workout' };

// New format:
const context = {
  currentPage: 'LogWorkout',
  previousPage: 'Programs',
  timeOfDay: new Date()
};
```

### Issue 4: Statistics Format Changes
**Problem**: Code expecting old statistics format breaks

**Solution**: Update statistics access:
```javascript
// Old format:
const hitRate = stats.hits / (stats.hits + stats.misses);

// New format:
const hitRate = parseFloat(stats.successRate) / 100;
```

## Performance Comparison

### Before Migration (Firestore)
- Basic cache warming without context awareness
- Manual cache invalidation required
- Limited retry logic
- Basic statistics tracking
- No queue management

### After Migration (Supabase)
- Intelligent context-aware warming
- Automatic cache management
- Robust retry logic with exponential backoff
- Comprehensive statistics and monitoring
- Priority-based queue management
- Background maintenance scheduling
- Enhanced error handling and graceful degradation

## Rollback Plan

If issues arise during migration, you can temporarily rollback:

### 1. Revert Import Changes
```javascript
// Temporarily revert to old imports
import { cacheWarmingService } from '../services/cacheWarmingService';
```

### 2. Keep Both Services Running
```javascript
// Run both services temporarily for comparison
import { cacheWarmingService } from '../services/cacheWarmingService';
import { SupabaseCacheWarmingService } from '../services/supabaseCacheWarmingService';

const oldService = cacheWarmingService;
const newService = new SupabaseCacheWarmingService();

// Use old service as fallback
const warmCache = async (userId) => {
  try {
    await newService.warmUserCacheWithRetry(userId, 'high');
  } catch (error) {
    console.warn('New service failed, using fallback:', error);
    await oldService.warmUserCacheWithRetry(userId, 'high');
  }
};
```

## Post-Migration Verification

### 1. Functionality Verification
- [ ] App cache warming works on startup
- [ ] User cache warming works on authentication
- [ ] Smart warming triggers on page navigation
- [ ] Statistics are being collected
- [ ] Error handling works properly
- [ ] Background maintenance runs

### 2. Performance Verification
- [ ] Cache hit rates are maintained or improved
- [ ] Query response times are faster
- [ ] Memory usage is reasonable
- [ ] No memory leaks detected
- [ ] Error rates are low (<5%)

### 3. Monitoring Setup
- [ ] Statistics monitoring implemented
- [ ] Error rate alerts configured
- [ ] Performance metrics tracked
- [ ] Queue overflow monitoring active
- [ ] Health checks implemented

## Support and Troubleshooting

If you encounter issues during migration:

1. **Check the logs**: Enable detailed logging for debugging
2. **Verify configuration**: Ensure all configuration options are correct
3. **Test incrementally**: Migrate one component at a time
4. **Monitor statistics**: Use the enhanced statistics to identify issues
5. **Use health checks**: Implement health monitoring to catch problems early

For additional support, refer to the [Troubleshooting Guide](./SUPABASE_CACHE_WARMING_SERVICE.md#troubleshooting-guide) in the main documentation.

## Conclusion

The migration to the Supabase Cache Warming Service provides significant improvements in functionality, performance, and maintainability. The enhanced features like intelligent context analysis, priority-based queue management, and comprehensive monitoring make the cache warming system more effective and easier to manage.

Take time to test thoroughly and monitor performance after migration to ensure optimal results.