// Cache warming service for optimal app performance
// This file now exports the new SupabaseCacheWarmingService with backward compatibility

import supabaseCacheWarmingService from './supabaseCacheWarmingService';

// Export the new Supabase service as default (drop-in replacement)
export default supabaseCacheWarmingService;

// Export individual methods for convenience (maintaining API compatibility)
export const {
  initializeAppCache,
  warmUserCacheWithRetry,
  smartWarmCache,
  progressiveWarmCache,
  performMaintenance,
  getWarmingStats,
  recordWarmingEvent,
  startMaintenanceSchedule,
  stop
} = supabaseCacheWarmingService;