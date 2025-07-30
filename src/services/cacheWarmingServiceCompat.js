// Backward compatibility layer for cache warming service
// This file provides the same API as the old cacheWarmingService but uses the new SupabaseCacheWarmingService

import supabaseCacheWarmingService from './supabaseCacheWarmingService';

// Create a compatibility wrapper that maintains the old API
class CacheWarmingServiceCompat {
  constructor() {
    this.service = supabaseCacheWarmingService;
  }

  // Map old API methods to new service methods
  async initializeAppCache() {
    return await this.service.initializeAppCache();
  }

  async warmUserCacheWithRetry(userId, priority = 'normal', maxRetries = 3) {
    return await this.service.warmUserCacheWithRetry(userId, priority, maxRetries);
  }

  async smartWarmCache(userId, context = {}) {
    return await this.service.smartWarmCache(userId, context);
  }

  async progressiveWarmCache(userId) {
    return await this.service.progressiveWarmCache(userId);
  }

  async performMaintenance() {
    return await this.service.performMaintenance();
  }

  recordWarmingEvent(type, duration, success, error = null, metadata = {}) {
    return this.service.recordWarmingEvent(type, duration, success, error, metadata);
  }

  getWarmingStats() {
    return this.service.getWarmingStats();
  }

  startMaintenanceSchedule(intervalMinutes = 15) {
    return this.service.startMaintenanceSchedule(intervalMinutes);
  }

  stop() {
    return this.service.stop();
  }

  // Expose properties for compatibility
  get isWarming() {
    return this.service.isWarming || false;
  }

  get warmingQueue() {
    return this.service.warmingQueue || new Set();
  }

  get warmingHistory() {
    return this.service.warmingHistory || [];
  }
}

// Create singleton instance
const cacheWarmingServiceCompat = new CacheWarmingServiceCompat();

// Export service and convenience functions (maintaining old API)
export default cacheWarmingServiceCompat;

export const {
  initializeAppCache,
  warmUserCacheWithRetry,
  smartWarmCache,
  progressiveWarmCache,
  performMaintenance,
  getWarmingStats,
  startMaintenanceSchedule,
  stop
} = cacheWarmingServiceCompat;