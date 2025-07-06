// Cache warming service for optimal app performance
import { warmUserCache, warmAppCache, getCacheStats } from '../api/enhancedFirestoreCache';
import { auth } from '../firebase';

class CacheWarmingService {
  constructor() {
    this.isWarming = false;
    this.warmingQueue = new Set();
    this.warmingHistory = [];
    this.maxHistorySize = 50;
  }

  // Initialize cache warming on app startup
  async initializeAppCache() {
    if (this.isWarming) {
      console.log('🔥 Cache warming already in progress...');
      return;
    }

    this.isWarming = true;
    const startTime = Date.now();

    try {
      console.log('🚀 Initializing app cache warming...');
      
      // Warm global app data
      await warmAppCache();
      
      // If user is already authenticated, warm their cache too
      const currentUser = auth.currentUser;
      if (currentUser) {
        await this.warmUserCacheWithRetry(currentUser.uid, 'high');
      }

      const duration = Date.now() - startTime;
      console.log(`✅ App cache initialization completed in ${duration}ms`);
      
      this.recordWarmingEvent('app-init', duration, true);
      
    } catch (error) {
      console.error('❌ App cache initialization failed:', error);
      this.recordWarmingEvent('app-init', Date.now() - startTime, false, error.message);
    } finally {
      this.isWarming = false;
    }
  }

  // Warm user cache with retry logic
  async warmUserCacheWithRetry(userId, priority = 'normal', maxRetries = 3) {
    if (this.warmingQueue.has(userId)) {
      console.log(`🔥 User cache warming already queued for: ${userId}`);
      return;
    }

    this.warmingQueue.add(userId);
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        console.log(`🔥 Warming user cache (attempt ${attempt + 1}/${maxRetries}): ${userId}`);
        
        const result = await warmUserCache(userId, priority);
        const duration = Date.now() - startTime;
        
        console.log(`✅ User cache warming completed in ${duration}ms:`, result);
        this.recordWarmingEvent('user-cache', duration, true, null, { userId, priority, result });
        
        this.warmingQueue.delete(userId);
        return result;
        
      } catch (error) {
        attempt++;
        console.error(`❌ User cache warming attempt ${attempt} failed:`, error);
        
        if (attempt >= maxRetries) {
          const duration = Date.now() - startTime;
          this.recordWarmingEvent('user-cache', duration, false, error.message, { userId, priority });
          this.warmingQueue.delete(userId);
          throw error;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Smart cache warming based on user behavior patterns
  async smartWarmCache(userId, context = {}) {
    const { 
      lastVisitedPage = null, 
      timeOfDay = new Date().getHours(),
      dayOfWeek = new Date().getDay(),
      userPreferences = {}
    } = context;

    console.log(`🧠 Smart cache warming for user: ${userId}`, context);

    try {
      // Determine priority based on context
      let priority = 'normal';
      
      // High priority during typical workout hours (6-9 AM, 5-8 PM)
      if ((timeOfDay >= 6 && timeOfDay <= 9) || (timeOfDay >= 17 && timeOfDay <= 20)) {
        priority = 'high';
      }
      
      // High priority on typical workout days (Mon-Fri)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        priority = 'high';
      }
      
      // Adjust based on last visited page
      if (lastVisitedPage === 'LogWorkout' || lastVisitedPage === 'ProgressTracker') {
        priority = 'high';
      }

      return await this.warmUserCacheWithRetry(userId, priority);
      
    } catch (error) {
      console.error('❌ Smart cache warming failed:', error);
      throw error;
    }
  }

  // Progressive cache warming for better UX
  async progressiveWarmCache(userId) {
    console.log(`📈 Progressive cache warming for user: ${userId}`);
    
    const phases = [
      {
        name: 'critical',
        priority: 'high',
        delay: 0,
        description: 'Critical user data'
      },
      {
        name: 'analytics',
        priority: 'normal', 
        delay: 2000,
        description: 'Analytics and historical data'
      },
      {
        name: 'extended',
        priority: 'low',
        delay: 5000,
        description: 'Extended historical data'
      }
    ];

    const results = [];

    for (const phase of phases) {
      try {
        if (phase.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, phase.delay));
        }
        
        console.log(`🔄 Starting ${phase.name} phase: ${phase.description}`);
        const result = await this.warmUserCacheWithRetry(userId, phase.priority, 2);
        
        results.push({
          phase: phase.name,
          success: true,
          result
        });
        
      } catch (error) {
        console.error(`❌ Progressive warming phase ${phase.name} failed:`, error);
        results.push({
          phase: phase.name,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  // Background cache maintenance
  async performMaintenance() {
    console.log('🔧 Performing cache maintenance...');
    
    try {
      const stats = getCacheStats();
      console.log('📊 Current cache stats:', stats);
      
      // If hit rate is low, consider warming more data
      const hitRate = parseFloat(stats.hitRate);
      if (hitRate < 70) {
        console.log(`⚠️ Low cache hit rate (${hitRate}%), considering additional warming`);
        
        const currentUser = auth.currentUser;
        if (currentUser) {
          await this.warmUserCacheWithRetry(currentUser.uid, 'normal');
        }
      }
      
      // Clean up old warming history
      if (this.warmingHistory.length > this.maxHistorySize) {
        this.warmingHistory = this.warmingHistory.slice(-this.maxHistorySize);
      }
      
      return stats;
      
    } catch (error) {
      console.error('❌ Cache maintenance failed:', error);
      throw error;
    }
  }

  // Record warming events for analytics
  recordWarmingEvent(type, duration, success, error = null, metadata = {}) {
    const event = {
      type,
      timestamp: Date.now(),
      duration,
      success,
      error,
      metadata
    };
    
    this.warmingHistory.push(event);
    
    // Keep only recent history
    if (this.warmingHistory.length > this.maxHistorySize) {
      this.warmingHistory.shift();
    }
  }

  // Get warming statistics
  getWarmingStats() {
    const totalEvents = this.warmingHistory.length;
    const successfulEvents = this.warmingHistory.filter(e => e.success).length;
    const failedEvents = totalEvents - successfulEvents;
    
    const averageDuration = totalEvents > 0 ? 
      this.warmingHistory.reduce((sum, e) => sum + e.duration, 0) / totalEvents : 0;
    
    const recentEvents = this.warmingHistory.slice(-10);
    
    return {
      totalEvents,
      successfulEvents,
      failedEvents,
      successRate: totalEvents > 0 ? (successfulEvents / totalEvents * 100).toFixed(2) + '%' : '0%',
      averageDuration: averageDuration.toFixed(2) + 'ms',
      recentEvents,
      currentlyWarming: this.isWarming,
      queueSize: this.warmingQueue.size
    };
  }

  // Schedule periodic maintenance
  startMaintenanceSchedule(intervalMinutes = 15) {
    console.log(`⏰ Starting cache maintenance schedule (every ${intervalMinutes} minutes)`);
    
    const interval = setInterval(async () => {
      try {
        await this.performMaintenance();
      } catch (error) {
        console.error('❌ Scheduled maintenance failed:', error);
      }
    }, intervalMinutes * 60 * 1000);

    return interval;
  }

  // Stop all warming activities
  stop() {
    this.warmingQueue.clear();
    this.isWarming = false;
    console.log('🛑 Cache warming service stopped');
  }
}

// Create singleton instance
const cacheWarmingService = new CacheWarmingService();

// Export service and convenience functions
export default cacheWarmingService;

export const {
  initializeAppCache,
  warmUserCacheWithRetry,
  smartWarmCache,
  progressiveWarmCache,
  performMaintenance,
  getWarmingStats,
  startMaintenanceSchedule,
  stop
} = cacheWarmingService;

// Auto-start maintenance schedule
if (typeof window !== 'undefined') {
  cacheWarmingService.startMaintenanceSchedule(15); // Every 15 minutes
}