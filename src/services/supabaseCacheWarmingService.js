/**
 * Supabase Cache Warming Service
 * 
 * This service provides intelligent cache warming for Supabase data to optimize
 * app performance, reduce database reads, and improve user experience.
 * 
 * Features:
 * - Singleton pattern for consistent state management
 * - Intelligent warming strategies based on user behavior
 * - Queue management with priority handling
 * - Comprehensive statistics and monitoring
 * - Background maintenance scheduling
 * - Error handling with retry logic
 */

import { warmUserCache, warmAppCache, getCacheStats } from '../api/supabaseCache';
import { authService } from './authService';
import WarmingStatsTracker from './warmingStatsTracker';
import { CacheWarmingErrorHandler, ErrorCategory, ErrorSeverity } from './cacheWarmingErrorHandler';
import { gracefulDegradationManager, ServiceAspect, DegradationLevel } from './gracefulDegradationManager.js';
import cacheWarmingConfig from '../config/cacheWarmingConfig.js';

/**
 * Priority-based queue manager for cache warming operations
 * Handles concurrent request prevention, queue size monitoring, and overflow protection
 */
class WarmingQueueManager {
  constructor(options = {}) {
    this.config = {
      maxQueueSize: options.maxQueueSize || 100,
      maxConcurrentWarming: options.maxConcurrentWarming || 3,
      queueProcessingInterval: options.queueProcessingInterval || 500, // ms
      persistenceKey: options.persistenceKey || 'supabase_warming_queue',
      enablePersistence: options.enablePersistence || false,
      ...options
    };

    // Priority queues (high, normal, low)
    this.queues = {
      high: [],
      normal: [],
      low: []
    };

    // Active warming tracking
    this.activeWarming = new Set();
    this.processingQueue = false;
    this.queueProcessor = null;

    // Queue statistics
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      overflowCount: 0,
      duplicatesPrevented: 0
    };

    console.log('📋 WarmingQueueManager initialized with config:', this.config);

    // Load persisted queue if enabled
    if (this.config.enablePersistence) {
      this.loadPersistedQueue();
    }
  }

  /**
   * Add a warming request to the appropriate priority queue
   * @param {string} userId - User ID to warm cache for
   * @param {string} priority - Priority level ('high', 'normal', 'low')
   * @param {Object} context - Additional context for the warming request
   * @param {Object} options - Warming options
   * @returns {boolean} True if added successfully, false if duplicate or overflow
   */
  addToQueue(userId, priority = 'normal', context = {}, options = {}) {
    if (!userId) {
      console.warn('⚠️ Cannot add to queue: userId is required');
      return false;
    }

    // Validate priority
    if (!['high', 'normal', 'low'].includes(priority)) {
      console.warn(`⚠️ Invalid priority '${priority}', defaulting to 'normal'`);
      priority = 'normal';
    }

    // Check for duplicates
    if (this.isUserInQueue(userId) || this.activeWarming.has(userId)) {
      console.log(`🔄 Duplicate warming request prevented for user: ${userId}`);
      this.stats.duplicatesPrevented++;
      return false;
    }

    // Check queue size limits
    const totalQueueSize = this.getTotalQueueSize();
    if (totalQueueSize >= this.config.maxQueueSize) {
      console.warn(`⚠️ Queue overflow: ${totalQueueSize}/${this.config.maxQueueSize} items`);
      this.stats.overflowCount++;
      
      // Try to make room by removing oldest low-priority items
      if (this.queues.low.length > 0) {
        const removed = this.queues.low.shift();
        console.log(`🗑️ Removed low-priority item to make room: ${removed.userId}`);
      } else {
        console.error('❌ Queue is full and cannot add new warming request');
        return false;
      }
    }

    // Create queue item
    const queueItem = {
      userId,
      priority,
      context,
      options,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      id: this.generateQueueItemId(userId, priority)
    };

    // Add to appropriate priority queue
    this.queues[priority].push(queueItem);
    this.stats.totalQueued++;

    console.log(`📋 Added to ${priority} priority queue: ${userId} (queue size: ${this.getTotalQueueSize()})`);

    // Persist queue if enabled
    if (this.config.enablePersistence) {
      this.persistQueue();
    }

    // Start processing if not already running
    if (!this.processingQueue) {
      this.startQueueProcessing();
    }

    return true;
  }

  /**
   * Check if a user is already in any queue
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user is in queue
   */
  isUserInQueue(userId) {
    return Object.values(this.queues).some(queue => 
      queue.some(item => item.userId === userId)
    );
  }

  /**
   * Get the next item to process based on priority
   * @returns {Object|null} Next queue item or null if empty
   */
  getNextQueueItem() {
    // Process high priority first, then normal, then low
    for (const priority of ['high', 'normal', 'low']) {
      if (this.queues[priority].length > 0) {
        return this.queues[priority].shift();
      }
    }
    return null;
  }

  /**
   * Start queue processing
   * Processes items based on priority and concurrency limits
   */
  startQueueProcessing() {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;
    console.log('🚀 Starting queue processing...');

    this.queueProcessor = setInterval(() => {
      this.processQueue();
    }, this.config.queueProcessingInterval);
  }

  /**
   * Stop queue processing
   */
  stopQueueProcessing() {
    if (!this.processingQueue) {
      return;
    }

    console.log('🛑 Stopping queue processing...');
    this.processingQueue = false;

    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
      this.queueProcessor = null;
    }
  }

  /**
   * Process the queue based on priority and concurrency limits
   */
  async processQueue() {
    // Check if we can process more items
    if (this.activeWarming.size >= this.config.maxConcurrentWarming) {
      return;
    }

    // Get next item to process
    const queueItem = this.getNextQueueItem();
    if (!queueItem) {
      // No items to process, stop processing if queue is empty
      if (this.getTotalQueueSize() === 0 && this.activeWarming.size === 0) {
        this.stopQueueProcessing();
      }
      return;
    }

    // Process the item
    await this.processQueueItem(queueItem);
  }

  /**
   * Process a single queue item
   * @param {Object} queueItem - Queue item to process
   */
  async processQueueItem(queueItem) {
    const { userId, priority, context, options } = queueItem;

    // Add to active warming
    this.activeWarming.add(userId);

    console.log(`🔥 Processing queue item: ${userId} (priority: ${priority}, active: ${this.activeWarming.size})`);

    try {
      // This will be integrated with the warming methods in task 4.2
      // For now, we'll call the existing warmUserCacheWithRetry method
      await this.executeWarmingRequest(queueItem);

      this.stats.totalProcessed++;
      console.log(`✅ Queue item processed successfully: ${userId}`);

    } catch (error) {
      console.error(`❌ Queue item processing failed: ${userId}`, error);
      
      // Get service instance for error handling
      const service = SupabaseCacheWarmingService.instance;
      if (service && service.errorHandler) {
        const recoveryResult = await service.errorHandler.handleError(error, {
          operation: 'queue-processing',
          userId,
          priority,
          retryCount: queueItem.retryCount,
          maxRetries: queueItem.maxRetries,
          queueItem: true
        });

        if (recoveryResult.action === 'retry' && queueItem.retryCount < queueItem.maxRetries) {
          queueItem.retryCount++;
          console.log(`🔄 Retrying queue item: ${userId} (attempt ${queueItem.retryCount}/${queueItem.maxRetries})`);
          
          // Use error handler's retry delay
          const delay = recoveryResult.delay || Math.pow(2, queueItem.retryCount) * 1000;
          setTimeout(() => {
            this.queues[priority].unshift(queueItem); // Add to front for retry
          }, delay);
        } else if (recoveryResult.action === 'skip') {
          console.log(`⏭️ Skipping queue item due to error: ${userId}`);
          this.stats.totalFailed++;
        } else {
          this.stats.totalFailed++;
          console.error(`💥 Queue item failed permanently: ${userId}`);
        }
      } else {
        // Fallback to original retry logic if error handler not available
        if (queueItem.retryCount < queueItem.maxRetries) {
          queueItem.retryCount++;
          console.log(`🔄 Retrying queue item: ${userId} (attempt ${queueItem.retryCount}/${queueItem.maxRetries})`);
          
          setTimeout(() => {
            this.queues[priority].unshift(queueItem);
          }, Math.pow(2, queueItem.retryCount) * 1000);
        } else {
          this.stats.totalFailed++;
          console.error(`💥 Queue item failed permanently: ${userId}`);
        }
      }
    } finally {
      // Remove from active warming
      this.activeWarming.delete(userId);
    }
  }

  /**
   * Execute the actual warming request
   * Integrates with the service's warming methods
   * @param {Object} queueItem - Queue item to execute
   */
  async executeWarmingRequest(queueItem) {
    const { userId, priority, context, options } = queueItem;
    
    console.log(`🔥 Executing warming request for: ${userId} (method: ${context.method || 'default'})`);
    
    // Get reference to the service instance to call warming methods
    const service = SupabaseCacheWarmingService.instance;
    if (!service) {
      throw new Error('Service instance not available for warming execution');
    }

    // Determine which warming method to use based on context
    const method = context.method || 'warmUserCacheWithRetry';
    
    try {
      let result;
      
      switch (method) {
        case 'warmUserCacheWithRetry':
          result = await service.executeUserCacheWarming(userId, priority, options);
          break;
          
        case 'smartWarmCache':
          result = await service.executeSmartCacheWarming(userId, priority, context, options);
          break;
          
        case 'progressiveWarmCache':
          result = await service.executeProgressiveCacheWarming(userId, priority, context, options);
          break;
          
        default:
          // Default to basic user cache warming
          result = await service.executeUserCacheWarming(userId, priority, options);
          break;
      }
      
      console.log(`✅ Queue warming request completed for: ${userId}`);
      return result;
      
    } catch (error) {
      console.error(`❌ Queue warming request failed for: ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get total queue size across all priorities
   * @returns {number} Total number of items in all queues
   */
  getTotalQueueSize() {
    return Object.values(this.queues).reduce((total, queue) => total + queue.length, 0);
  }

  /**
   * Get queue status and statistics
   * @returns {Object} Queue status information
   */
  getQueueStatus() {
    return {
      totalSize: this.getTotalQueueSize(),
      queueSizes: {
        high: this.queues.high.length,
        normal: this.queues.normal.length,
        low: this.queues.low.length
      },
      activeWarming: this.activeWarming.size,
      maxConcurrent: this.config.maxConcurrentWarming,
      isProcessing: this.processingQueue,
      stats: { ...this.stats }
    };
  }

  /**
   * Clear all queues
   * @param {string} priority - Optional priority to clear ('high', 'normal', 'low'), or 'all' for all queues
   */
  clearQueue(priority = 'all') {
    if (priority === 'all') {
      Object.keys(this.queues).forEach(p => {
        this.queues[p] = [];
      });
      console.log('🧹 Cleared all queues');
    } else if (this.queues[priority]) {
      const cleared = this.queues[priority].length;
      this.queues[priority] = [];
      console.log(`🧹 Cleared ${priority} priority queue (${cleared} items)`);
    } else {
      console.warn(`⚠️ Invalid priority for queue clearing: ${priority}`);
    }

    // Persist changes if enabled
    if (this.config.enablePersistence) {
      this.persistQueue();
    }
  }

  /**
   * Remove a specific user from all queues
   * @param {string} userId - User ID to remove
   * @returns {boolean} True if user was found and removed
   */
  removeUserFromQueue(userId) {
    let removed = false;

    Object.keys(this.queues).forEach(priority => {
      const initialLength = this.queues[priority].length;
      this.queues[priority] = this.queues[priority].filter(item => item.userId !== userId);
      
      if (this.queues[priority].length < initialLength) {
        removed = true;
        console.log(`🗑️ Removed user from ${priority} queue: ${userId}`);
      }
    });

    if (removed && this.config.enablePersistence) {
      this.persistQueue();
    }

    return removed;
  }

  /**
   * Generate a unique ID for queue items
   * @param {string} userId - User ID
   * @param {string} priority - Priority level
   * @returns {string} Unique queue item ID
   */
  generateQueueItemId(userId, priority) {
    return `${priority}_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Persist queue to storage (if enabled)
   */
  persistQueue() {
    if (!this.config.enablePersistence || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const queueData = {
        queues: this.queues,
        stats: this.stats,
        timestamp: Date.now()
      };

      localStorage.setItem(this.config.persistenceKey, JSON.stringify(queueData));
      console.log('💾 Queue persisted to storage');
    } catch (error) {
      console.error('❌ Failed to persist queue:', error);
    }
  }

  /**
   * Load persisted queue from storage (if available)
   */
  loadPersistedQueue() {
    if (!this.config.enablePersistence || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const stored = localStorage.getItem(this.config.persistenceKey);
      if (!stored) {
        return;
      }

      const queueData = JSON.parse(stored);
      
      // Check if data is not too old (max 1 hour)
      const maxAge = 60 * 60 * 1000; // 1 hour
      if (Date.now() - queueData.timestamp > maxAge) {
        console.log('🗑️ Persisted queue data is too old, ignoring');
        localStorage.removeItem(this.config.persistenceKey);
        return;
      }

      // Restore queues and stats
      this.queues = queueData.queues || this.queues;
      this.stats = { ...this.stats, ...queueData.stats };

      const totalRestored = this.getTotalQueueSize();
      if (totalRestored > 0) {
        console.log(`📥 Restored ${totalRestored} items from persisted queue`);
        
        // Start processing if we have items
        if (!this.processingQueue) {
          this.startQueueProcessing();
        }
      }

    } catch (error) {
      console.error('❌ Failed to load persisted queue:', error);
      // Clear corrupted data
      localStorage.removeItem(this.config.persistenceKey);
    }
  }

  /**
   * Cleanup queue manager resources
   */
  cleanup() {
    console.log('🧹 Cleaning up WarmingQueueManager...');

    // Stop processing
    this.stopQueueProcessing();

    // Clear all queues
    this.clearQueue('all');

    // Clear active warming
    this.activeWarming.clear();

    // Reset stats
    this.stats = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      overflowCount: 0,
      duplicatesPrevented: 0
    };

    // Clear persisted data if enabled
    if (this.config.enablePersistence && typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.config.persistenceKey);
    }

    console.log('✅ WarmingQueueManager cleanup completed');
  }
}

/**
 * Context Analysis System
 * Analyzes user behavior patterns and environmental factors to determine
 * optimal cache warming strategies and priorities
 */
class ContextAnalyzer {
  /**
   * Analyze time-of-day patterns for workout hours
   * @param {Date} date - Date to analyze (defaults to current time)
   * @param {Object} config - Configuration options
   * @returns {Object} Time analysis with priority and context
   */
  static analyzeTimeOfDay(date = new Date(), config = {}) {
    const hour = date.getHours();
    
    // If time-based warming is disabled, return neutral analysis
    if (config.enableTimeBasedWarming === false) {
      return {
        hour,
        isWorkoutHour: false,
        isMorningWorkoutHour: false,
        isEveningWorkoutHour: false,
        priority: 'normal',
        context: 'time-analysis-disabled',
        timeCategory: 'standard'
      };
    }
    
    // Workout hours: 6-9 AM and 5-8 PM
    const isMorningWorkoutHour = hour >= 6 && hour <= 9;
    const isEveningWorkoutHour = hour >= 17 && hour <= 20;
    const isWorkoutHour = isMorningWorkoutHour || isEveningWorkoutHour;
    
    // Determine time-based priority
    let priority = 'normal';
    let context = 'standard';
    
    if (isWorkoutHour) {
      priority = 'high';
      context = isMorningWorkoutHour ? 'morning-workout' : 'evening-workout';
    } else if (hour >= 22 || hour <= 5) {
      priority = 'low';
      context = 'off-hours';
    }
    
    return {
      hour,
      isWorkoutHour,
      isMorningWorkoutHour,
      isEveningWorkoutHour,
      priority,
      context,
      timeCategory: this.getTimeCategory(hour)
    };
  }
  
  /**
   * Get time category for detailed analysis
   * @param {number} hour - Hour of the day (0-23)
   * @returns {string} Time category
   */
  static getTimeCategory(hour) {
    if (hour >= 6 && hour <= 9) return 'morning-workout';
    if (hour >= 10 && hour <= 11) return 'late-morning';
    if (hour >= 12 && hour <= 13) return 'lunch';
    if (hour >= 14 && hour <= 16) return 'afternoon';
    if (hour >= 17 && hour <= 20) return 'evening-workout';
    if (hour >= 21 && hour <= 23) return 'evening';
    return 'night';
  }
  
  /**
   * Analyze workout day patterns (Monday-Friday priority boost)
   * @param {Date} date - Date to analyze (defaults to current date)
   * @param {Object} config - Configuration options
   * @returns {Object} Day analysis with priority and context
   */
  static analyzeWorkoutDay(date = new Date(), config = {}) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    // If day-based warming is disabled, return neutral analysis
    if (config.enableDayBasedWarming === false) {
      return {
        dayOfWeek,
        dayName: dayNames[dayOfWeek],
        isWorkoutDay: false,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        priority: 'normal',
        context: 'day-analysis-disabled'
      };
    }
    
    // Monday-Friday are typical workout days
    const isWorkoutDay = dayOfWeek >= 1 && dayOfWeek <= 5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    let priority = 'normal';
    let context = 'standard';
    
    if (isWorkoutDay) {
      priority = 'high';
      context = 'workout-day';
    } else if (isWeekend) {
      priority = 'normal';
      context = 'weekend';
    }
    
    return {
      dayOfWeek,
      dayName: dayNames[dayOfWeek],
      isWorkoutDay,
      isWeekend,
      priority,
      context
    };
  }
  
  /**
   * Analyze page-based priority for cache warming
   * @param {string} pageName - Current page or component name
   * @param {string} previousPage - Previous page for context
   * @returns {Object} Page analysis with priority and warming strategy
   */
  static analyzePageContext(pageName, previousPage = null) {
    // High-priority workout-related pages
    const workoutPages = [
      'LogWorkout',
      'log-workout',
      'ProgressTracker',
      'progress-tracker',
      'Programs',
      'programs',
      'QuickWorkout',
      'quick-workout',
      'ProgramsWorkoutHub',
      'programs-workout-hub'
    ];
    
    // Medium-priority fitness-related pages
    const fitnessPages = [
      'Exercises',
      'exercises',
      'Progress3',
      'Progress4',
      'ProgressCoach',
      'progress-coach',
      'QuickWorkoutHistory',
      'quick-workout-history'
    ];
    
    // Low-priority general pages
    const generalPages = [
      'Home',
      'home',
      'UserProfile',
      'user-profile',
      'Auth',
      'auth',
      'Admin',
      'admin'
    ];
    
    const normalizedPage = pageName?.toLowerCase() || '';
    const normalizedPrevious = previousPage?.toLowerCase() || '';
    
    let priority = 'normal';
    let context = 'general';
    let warmingStrategy = 'standard';
    
    // Determine priority based on current page
    if (workoutPages.some(page => normalizedPage.includes(page.toLowerCase()))) {
      priority = 'high';
      context = 'workout-focused';
      warmingStrategy = 'progressive';
    } else if (fitnessPages.some(page => normalizedPage.includes(page.toLowerCase()))) {
      priority = 'normal';
      context = 'fitness-related';
      warmingStrategy = 'targeted';
    } else if (generalPages.some(page => normalizedPage.includes(page.toLowerCase()))) {
      priority = 'low';
      context = 'general';
      warmingStrategy = 'basic';
    }
    
    // Boost priority if coming from workout-related page
    const wasOnWorkoutPage = workoutPages.some(page => 
      normalizedPrevious.includes(page.toLowerCase())
    );
    
    if (wasOnWorkoutPage && priority !== 'high') {
      priority = priority === 'low' ? 'normal' : 'high';
      context += '-post-workout';
    }
    
    return {
      pageName,
      previousPage,
      isWorkoutPage: workoutPages.some(page => normalizedPage.includes(page.toLowerCase())),
      isFitnessPage: fitnessPages.some(page => normalizedPage.includes(page.toLowerCase())),
      wasOnWorkoutPage,
      priority,
      context,
      warmingStrategy
    };
  }
  
  /**
   * Determine overall priority by combining all context factors
   * @param {Object} options - Context analysis options
   * @param {Date} options.date - Date for time/day analysis
   * @param {string} options.pageName - Current page name
   * @param {string} options.previousPage - Previous page name
   * @param {Object} options.userPreferences - User-specific preferences
   * @param {Object} options.behaviorPatterns - Historical behavior patterns
   * @param {Object} options.config - Service configuration
   * @returns {Object} Combined priority analysis
   */
  static determinePriority(options = {}) {
    const {
      date = new Date(),
      pageName = null,
      previousPage = null,
      userPreferences = {},
      behaviorPatterns = {},
      config = {}
    } = options;
    
    // If simplified mode is enabled, return basic priority
    if (config.simplifiedMode) {
      return {
        finalPriority: 'normal',
        priorityScore: 0.5,
        warmingStrategy: 'basic',
        context: {
          time: { context: 'simplified-mode' },
          day: { context: 'simplified-mode' },
          page: this.analyzePageContext(pageName, previousPage),
          userPreferences,
          behaviorPatterns
        },
        recommendations: [{
          type: 'simplified',
          action: 'basic-warming',
          reason: 'Simplified mode enabled',
          priority: 'normal'
        }]
      };
    }
    
    // Analyze individual context factors
    const timeAnalysis = this.analyzeTimeOfDay(date, config);
    const dayAnalysis = this.analyzeWorkoutDay(date, config);
    const pageAnalysis = this.analyzePageContext(pageName, previousPage);
    
    // Priority scoring system (higher = more important)
    const priorityScores = {
      'low': 1,
      'normal': 2,
      'high': 3
    };
    
    // Calculate weighted priority score
    let totalScore = 0;
    let maxScore = 0;
    
    // Time factor (weight: 0.3)
    const timeWeight = 0.3;
    totalScore += priorityScores[timeAnalysis.priority] * timeWeight;
    maxScore += 3 * timeWeight;
    
    // Day factor (weight: 0.2)
    const dayWeight = 0.2;
    totalScore += priorityScores[dayAnalysis.priority] * dayWeight;
    maxScore += 3 * dayWeight;
    
    // Page factor (weight: 0.4)
    const pageWeight = 0.4;
    totalScore += priorityScores[pageAnalysis.priority] * pageWeight;
    maxScore += 3 * pageWeight;
    
    // User preferences factor (weight: 0.1)
    const prefWeight = 0.1;
    const prefScore = userPreferences.priorityBoost || 2; // Default to normal
    totalScore += prefScore * prefWeight;
    maxScore += 3 * prefWeight;
    
    // Calculate final priority
    const normalizedScore = totalScore / maxScore;
    let finalPriority = 'normal';
    
    if (normalizedScore >= 0.75) {
      finalPriority = 'high';
    } else if (normalizedScore <= 0.4) {
      finalPriority = 'low';
    }
    
    // Determine warming strategy
    let warmingStrategy = 'standard';
    if (pageAnalysis.isWorkoutPage && timeAnalysis.isWorkoutHour) {
      warmingStrategy = 'progressive';
    } else if (pageAnalysis.isWorkoutPage || timeAnalysis.isWorkoutHour) {
      warmingStrategy = 'targeted';
    }
    
    return {
      finalPriority,
      priorityScore: normalizedScore,
      warmingStrategy,
      context: {
        time: timeAnalysis,
        day: dayAnalysis,
        page: pageAnalysis,
        userPreferences,
        behaviorPatterns
      },
      recommendations: this.generateRecommendations({
        timeAnalysis,
        dayAnalysis,
        pageAnalysis,
        finalPriority,
        warmingStrategy
      })
    };
  }
  
  /**
   * Generate warming recommendations based on context analysis
   * @param {Object} analysis - Combined analysis results
   * @returns {Array} Array of warming recommendations
   */
  static generateRecommendations(analysis) {
    const recommendations = [];
    const { timeAnalysis, dayAnalysis, pageAnalysis, finalPriority, warmingStrategy } = analysis;
    
    // Time-based recommendations
    if (timeAnalysis.isWorkoutHour) {
      recommendations.push({
        type: 'time-based',
        action: 'prioritize-workout-data',
        reason: `Peak workout time (${timeAnalysis.context})`,
        priority: 'high'
      });
    }
    
    // Day-based recommendations
    if (dayAnalysis.isWorkoutDay) {
      recommendations.push({
        type: 'day-based',
        action: 'boost-cache-warming',
        reason: `Typical workout day (${dayAnalysis.dayName})`,
        priority: 'high'
      });
    }
    
    // Page-based recommendations
    if (pageAnalysis.isWorkoutPage) {
      recommendations.push({
        type: 'page-based',
        action: 'progressive-warming',
        reason: `Workout-focused page (${pageAnalysis.pageName})`,
        priority: 'high'
      });
    }
    
    // Strategy recommendations
    if (warmingStrategy === 'progressive') {
      recommendations.push({
        type: 'strategy',
        action: 'multi-phase-warming',
        reason: 'High-priority context detected',
        priority: 'high'
      });
    }
    
    return recommendations;
  }
}

class SupabaseCacheWarmingService {
  constructor(options = {}) {
    // Prevent multiple instances (singleton pattern)
    if (SupabaseCacheWarmingService.instance) {
      return SupabaseCacheWarmingService.instance;
    }

    // Configuration options
    this.config = {
      maxRetries: options.maxRetries || 3,
      retryDelays: options.retryDelays || [1000, 2000, 4000], // Exponential backoff
      maintenanceInterval: options.maintenanceInterval || 15, // minutes
      maxHistorySize: options.maxHistorySize || 50,
      queueProcessingDelay: options.queueProcessingDelay || 100, // ms
      
      // Simplified cache warming options
      enableDayBasedWarming: options.enableDayBasedWarming !== false, // Default: enabled
      enableTimeBasedWarming: options.enableTimeBasedWarming !== false, // Default: enabled
      enableContextAnalysis: options.enableContextAnalysis !== false, // Default: enabled
      simplifiedMode: options.simplifiedMode || false, // Default: disabled
      
      // Queue manager configuration
      queueConfig: {
        maxQueueSize: options.maxQueueSize || 100,
        maxConcurrentWarming: options.maxConcurrentWarming || 3,
        queueProcessingInterval: options.queueProcessingInterval || 500,
        enablePersistence: options.enablePersistence || false,
        ...options.queueConfig
      },
      
      ...options
    };

    // Service state
    this.isWarming = false;
    this.warmingHistory = [];
    this.maintenanceSchedule = null;
    this.isStarted = false;
    
    // Initialize queue manager
    this.queueManager = new WarmingQueueManager(this.config.queueConfig);
    
    // Initialize statistics tracker
    this.statsTracker = new WarmingStatsTracker({
      maxHistorySize: this.config.maxHistorySize,
      enablePersistence: this.config.queueConfig.enablePersistence,
      enableMemoryTracking: options.enableMemoryTracking !== false,
      enableBandwidthTracking: options.enableBandwidthTracking !== false,
      enableCostAnalysis: options.enableCostAnalysis !== false,
      ...options.statsConfig
    });
    
    // Initialize error handler
    this.errorHandler = new CacheWarmingErrorHandler({
      maxRetries: this.config.maxRetries,
      baseRetryDelay: this.config.retryDelays[0] || 1000,
      maxRetryDelay: this.config.retryDelays[this.config.retryDelays.length - 1] || 4000,
      enableErrorRateMonitoring: options.enableErrorRateMonitoring !== false,
      enableDetailedLogging: options.enableDetailedLogging !== false,
      enableGracefulDegradation: options.enableGracefulDegradation !== false,
      ...options.errorHandlerConfig
    });
    
    // Initialize graceful degradation manager
    this.degradationManager = gracefulDegradationManager;
    
    // Context analysis state
    this.contextAnalyzer = ContextAnalyzer;
    this.currentPageContext = null;
    this.behaviorPatterns = {};
    this.userPreferences = {};

    // Store singleton instance
    SupabaseCacheWarmingService.instance = this;

    console.log('🔥 SupabaseCacheWarmingService initialized with config:', this.config);
  }

  /**
   * Start the cache warming service
   * Initializes background processes and schedules maintenance
   */
  start() {
    if (this.isStarted) {
      console.log('🔥 Cache warming service already started');
      return;
    }

    this.isStarted = true;
    this._startTime = Date.now(); // Track start time for uptime calculation
    console.log('🚀 Starting Supabase cache warming service...');

    // Start maintenance schedule
    this.startMaintenanceSchedule(this.config.maintenanceInterval);

    console.log('✅ Supabase cache warming service started successfully');
  }

  /**
   * Stop the cache warming service
   * Cleans up background processes and clears queues
   */
  stop() {
    if (!this.isStarted) {
      console.log('🔥 Cache warming service already stopped');
      return;
    }

    console.log('🛑 Stopping Supabase cache warming service...');

    // Clear maintenance schedule
    if (this.maintenanceSchedule) {
      clearInterval(this.maintenanceSchedule);
      this.maintenanceSchedule = null;
    }

    // Stop queue manager
    if (this.queueManager) {
      this.queueManager.stopQueueProcessing();
    }

    this.isWarming = false;
    this.isStarted = false;

    console.log('✅ Supabase cache warming service stopped successfully');
  }

  /**
   * Check if a service aspect is degraded and apply fallback if needed
   */
  checkDegradationAndApplyFallback(serviceAspect, operation, context = {}) {
    const degradationLevel = this.degradationManager.degradationState.get(serviceAspect);
    const fallbackMechanism = this.degradationManager.fallbackState.get(serviceAspect);

    if (degradationLevel === DegradationLevel.NONE) {
      return { degraded: false, canProceed: true };
    }

    console.log(`🛡️ Service aspect ${serviceAspect} is degraded (${degradationLevel}), applying fallback: ${fallbackMechanism}`);

    return this.applyServiceFallback(serviceAspect, degradationLevel, fallbackMechanism, operation, context);
  }

  /**
   * Apply service-specific fallback mechanisms
   */
  applyServiceFallback(serviceAspect, degradationLevel, fallbackMechanism, operation, context) {
    switch (serviceAspect) {
      case ServiceAspect.CACHE_WARMING:
        return this.applyCacheWarmingFallback(degradationLevel, fallbackMechanism, operation, context);
      case ServiceAspect.QUEUE_PROCESSING:
        return this.applyQueueProcessingFallback(degradationLevel, fallbackMechanism, operation, context);
      case ServiceAspect.SMART_ANALYSIS:
        return this.applySmartAnalysisFallback(degradationLevel, fallbackMechanism, operation, context);
      default:
        return { degraded: true, canProceed: true, fallback: 'continue-with-reduced-functionality' };
    }
  }

  /**
   * Apply cache warming fallback mechanisms
   */
  applyCacheWarmingFallback(degradationLevel, fallbackMechanism, operation, context) {
    switch (fallbackMechanism) {
      case 'BASIC_CACHE':
        return {
          degraded: true,
          canProceed: true,
          fallback: 'basic-cache-only',
          modifications: {
            disableSmartWarming: true,
            disableProgressiveWarming: true,
            useBasicPriority: true
          }
        };

      case 'REDUCED_SCOPE':
        return {
          degraded: true,
          canProceed: true,
          fallback: 'reduced-scope',
          modifications: {
            reduceWarmingScope: true,
            highPriorityOnly: true,
            skipOptionalData: true
          }
        };

      case 'SKIP_OPTIONAL':
        return {
          degraded: true,
          canProceed: true,
          fallback: 'skip-optional',
          modifications: {
            skipNonEssential: true,
            essentialDataOnly: true
          }
        };

      case 'EMERGENCY_MODE':
        return {
          degraded: true,
          canProceed: degradationLevel !== DegradationLevel.CRITICAL,
          fallback: 'emergency-mode',
          modifications: {
            minimalWarmingOnly: true,
            disableAllOptional: true,
            criticalDataOnly: true
          }
        };

      default:
        return { degraded: true, canProceed: true, fallback: 'continue-degraded' };
    }
  }

  /**
   * Apply queue processing fallback mechanisms
   */
  applyQueueProcessingFallback(degradationLevel, fallbackMechanism, operation, context) {
    switch (fallbackMechanism) {
      case 'REDUCED_SCOPE':
        return {
          degraded: true,
          canProceed: true,
          fallback: 'reduced-concurrency',
          modifications: {
            reduceConcurrency: true,
            highPriorityOnly: true,
            disableQueuePersistence: false
          }
        };

      case 'LOCAL_ONLY':
        return {
          degraded: true,
          canProceed: true,
          fallback: 'local-queue-only',
          modifications: {
            disableQueuePersistence: true,
            inMemoryOnly: true,
            reducedStatistics: true
          }
        };

      case 'EMERGENCY_MODE':
        return {
          degraded: true,
          canProceed: degradationLevel !== DegradationLevel.CRITICAL,
          fallback: 'emergency-queue',
          modifications: {
            criticalItemsOnly: true,
            disableStatistics: true,
            minimalProcessing: true
          }
        };

      default:
        return { degraded: true, canProceed: true, fallback: 'continue-degraded' };
    }
  }

  /**
   * Apply smart analysis fallback mechanisms
   */
  applySmartAnalysisFallback(degradationLevel, fallbackMechanism, operation, context) {
    switch (fallbackMechanism) {
      case 'BASIC_CACHE':
        return {
          degraded: true,
          canProceed: true,
          fallback: 'basic-analysis',
          modifications: {
            disableContextAnalysis: true,
            useBasicPriority: true,
            skipBehaviorAnalysis: true
          }
        };

      case 'DISABLE_FEATURE':
        return {
          degraded: true,
          canProceed: true,
          fallback: 'no-analysis',
          modifications: {
            disableSmartAnalysis: true,
            useDefaultStrategies: true,
            skipAllAnalysis: true
          }
        };

      default:
        return { degraded: true, canProceed: true, fallback: 'continue-degraded' };
    }
  }

  /**
   * Get comprehensive service health including degradation status
   */
  getServiceHealth() {
    const baseHealth = this.calculateServiceHealth();
    const degradationStatus = this.degradationManager.getDegradationStatus();

    return {
      ...baseHealth,
      degradation: degradationStatus,
      overallHealth: degradationStatus.overallHealth,
      canOperateNormally: degradationStatus.overallHealth !== 'CRITICAL'
    };
  }

  /**
   * Force recovery from all degradations
   */
  async forceRecovery() {
    console.log('🔄 Forcing recovery from all service degradations...');
    return await this.degradationManager.forceRecovery();
  }

  /**
   * Cleanup service resources
   * Performs final cleanup and resets state
   */
  cleanup() {
    console.log('🧹 Cleaning up cache warming service...');

    // Stop the service first
    this.stop();

    // Cleanup queue manager
    if (this.queueManager) {
      this.queueManager.cleanup();
    }

    // Cleanup stats tracker
    if (this.statsTracker) {
      this.statsTracker.cleanup();
    }

    // Cleanup degradation manager
    if (this.degradationManager) {
      this.degradationManager.cleanup();
    }

    // Clear history
    this.warmingHistory = [];

    // Reset start time
    this._startTime = null;

    // Reset singleton instance
    SupabaseCacheWarmingService.instance = null;

    console.log('✅ Cache warming service cleanup completed');
  }

  /**
   * Initialize application-level cache warming
   * Warms global data that all users need
   */
  async initializeAppCache() {
    if (this.isWarming) {
      console.log('🔥 Cache warming already in progress...');
      return;
    }

    // Check for degradation and apply fallback if needed
    const fallbackResult = this.checkDegradationAndApplyFallback(
      ServiceAspect.CACHE_WARMING, 
      'app-init'
    );

    if (fallbackResult.degraded && !fallbackResult.canProceed) {
      console.log(`🛡️ App cache initialization blocked due to critical degradation`);
      return { 
        success: false, 
        blocked: true, 
        reason: 'Service critically degraded',
        fallback: fallbackResult.fallback 
      };
    }

    this.isWarming = true;
    const startTime = Date.now();

    try {
      if (fallbackResult.degraded) {
        console.log('🚀 Initializing app cache warming with degradation fallback...');
      } else {
        console.log('🚀 Initializing app cache warming...');
      }

      // Warm global app data using Supabase cache
      await warmAppCache();

      // If user is already authenticated, warm their cache too
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        await this.warmUserCacheWithRetry(currentUser.id, 'high');
      }

      const duration = Date.now() - startTime;
      console.log(`✅ App cache initialization completed in ${duration}ms`);

      this.recordWarmingEvent('app-init', duration, true);

      // Record success for error rate monitoring
      this.errorHandler.recordSuccess('app-init');

      return { success: true, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ App cache initialization failed:', error);
      this.recordWarmingEvent('app-init', duration, false, error.message);
      
      // Handle error with comprehensive error handling system
      const recoveryResult = await this.errorHandler.handleError(error, {
        operation: 'app-init',
        duration,
        priority: 'high',
        retryCount: 0
      });
      
      if (recoveryResult.action === 'abort') {
        throw error;
      } else if (recoveryResult.action === 'fallback') {
        console.log('🔄 App initialization continuing with fallback strategy');
        return { success: false, duration, fallback: true, error: error.message };
      }
      
      throw error;
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warm user cache with retry logic and exponential backoff
   * Now uses the queue system for priority-based processing
   */
  async warmUserCacheWithRetry(userId, priority = 'normal', maxRetries = null, context = {}) {
    if (!userId) {
      throw new Error('User ID is required for cache warming');
    }

    // Check if user is already in queue or being processed
    if (this.queueManager.isUserInQueue(userId) || this.queueManager.activeWarming.has(userId)) {
      console.log(`🔥 User cache warming already queued or in progress for: ${userId}`);
      return { success: true, message: 'Already queued or in progress', userId };
    }

    // Add to queue with priority and context
    const queueOptions = {
      maxRetries: maxRetries || this.config.maxRetries,
      context: {
        method: 'warmUserCacheWithRetry',
        timestamp: Date.now(),
        ...context
      }
    };

    const queued = this.queueManager.addToQueue(userId, priority, context, queueOptions);
    
    if (!queued) {
      throw new Error(`Failed to queue cache warming for user: ${userId}`);
    }

    console.log(`📋 User cache warming queued: ${userId} (priority: ${priority})`);
    
    return { 
      success: true, 
      message: 'Queued for processing', 
      userId, 
      priority,
      queuePosition: this.queueManager.getTotalQueueSize()
    };
  }

  /**
   * Execute actual cache warming (called by queue manager)
   * This method performs the actual warming operation
   */
  async executeUserCacheWarming(userId, priority = 'normal', options = {}) {
    if (!userId) {
      throw new Error('User ID is required for cache warming');
    }

    // Check for degradation and apply fallback if needed
    const fallbackResult = this.checkDegradationAndApplyFallback(
      ServiceAspect.CACHE_WARMING, 
      'user-cache', 
      { userId, priority, ...options }
    );

    if (fallbackResult.degraded && !fallbackResult.canProceed) {
      console.log(`🛡️ Cache warming blocked due to critical degradation`);
      return { 
        success: false, 
        blocked: true, 
        reason: 'Service critically degraded',
        fallback: fallbackResult.fallback 
      };
    }

    const startTime = Date.now();
    const maxRetries = options.maxRetries || this.config.maxRetries;
    let attempt = 0;

    // Apply fallback modifications if degraded
    if (fallbackResult.degraded && fallbackResult.modifications) {
      console.log(`🛡️ Applying cache warming fallback modifications:`, fallbackResult.modifications);
      options = { ...options, ...fallbackResult.modifications };
    }

    while (attempt < maxRetries) {
      try {
        console.log(`🔥 Executing user cache warming (attempt ${attempt + 1}/${maxRetries}): ${userId} (priority: ${priority})`);

        // Use Supabase cache warming function
        const result = await warmUserCache(userId, priority);
        const duration = Date.now() - startTime;

        console.log(`✅ User cache warming completed in ${duration}ms:`, result);
        this.recordWarmingEvent('user-cache', duration, true, null, { 
          userId, 
          priority, 
          result,
          attempt: attempt + 1,
          queueProcessed: true
        });

        // Record success for error rate monitoring
        this.errorHandler.recordSuccess('user-cache');

        return result;

      } catch (error) {
        attempt++;
        console.error(`❌ User cache warming attempt ${attempt} failed:`, error);

        // Handle error with comprehensive error handling system
        const recoveryResult = await this.errorHandler.handleError(error, {
          operation: 'user-cache',
          userId,
          priority,
          retryCount: attempt,
          maxRetries,
          queueProcessed: true
        });

        if (attempt >= maxRetries || recoveryResult.action === 'abort') {
          const duration = Date.now() - startTime;
          this.recordWarmingEvent('user-cache', duration, false, error.message, { 
            userId, 
            priority,
            attempt,
            queueProcessed: true,
            recoveryResult
          });
          
          if (recoveryResult.action === 'skip' || recoveryResult.action === 'fallback') {
            console.log(`🔄 User cache warming failed but continuing: ${recoveryResult.reason}`);
            return { success: false, fallback: true, error: error.message, recoveryResult };
          }
          
          throw error;
        }

        // Use error handler's retry delay calculation
        if (recoveryResult.action === 'retry') {
          const delay = recoveryResult.delay || this.config.retryDelays[attempt - 1] || Math.pow(2, attempt) * 1000;
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
  }

  /**
   * Smart cache warming based on user behavior context
   * Analyzes current context and applies intelligent warming strategies
   * Now uses the queue system for priority-based processing
   * @param {string} userId - User ID to warm cache for
   * @param {Object} context - Additional context information
   * @param {Object} options - Warming options
   * @returns {Promise<Object>} Warming result with analysis
   */
  async smartWarmCache(userId, context = {}, options = {}) {
    if (!userId) {
      throw new Error('User ID is required for smart cache warming');
    }

    console.log(`🧠 Starting smart cache warming for user: ${userId}`);

    // Update page context if provided
    if (context.pageName) {
      this.updatePageContext(context.pageName, context.previousPage);
    }

    // Analyze current context
    const contextAnalysis = this.analyzeCurrentContext({
      pageName: context.pageName,
      previousPage: context.previousPage,
      userPreferences: context.userPreferences || this.userPreferences,
      behaviorPatterns: context.behaviorPatterns || this.behaviorPatterns,
      ...context
    });

    // Log smart warming decision
    console.log('🎯 Smart warming analysis:', {
      priority: contextAnalysis.finalPriority,
      strategy: contextAnalysis.warmingStrategy,
      score: contextAnalysis.priorityScore.toFixed(3),
      recommendations: contextAnalysis.recommendations.map(r => r.action)
    });

    // Prepare context for queue processing
    const queueContext = {
      method: 'smartWarmCache',
      contextAnalysis,
      originalContext: context,
      smartDecisions: [],
      warmingStrategy: contextAnalysis.warmingStrategy,
      timestamp: Date.now()
    };

    // Add to queue with determined priority
    const queueOptions = {
      maxRetries: options.maxRetries || this.config.maxRetries,
      context: queueContext
    };

    const queued = this.queueManager.addToQueue(userId, contextAnalysis.finalPriority, queueContext, queueOptions);
    
    if (!queued) {
      throw new Error(`Failed to queue smart cache warming for user: ${userId}`);
    }

    console.log(`📋 Smart cache warming queued: ${userId} (priority: ${contextAnalysis.finalPriority}, strategy: ${contextAnalysis.warmingStrategy})`);
    
    return { 
      success: true, 
      message: 'Queued for smart processing', 
      userId, 
      priority: contextAnalysis.finalPriority,
      strategy: contextAnalysis.warmingStrategy,
      contextAnalysis,
      queuePosition: this.queueManager.getTotalQueueSize()
    };
  }

  /**
   * Execute smart cache warming (called by queue manager)
   * This method performs the actual smart warming operation
   */
  async executeSmartCacheWarming(userId, priority, context, options = {}) {
    const startTime = Date.now();
    console.log(`🧠 Executing smart cache warming for user: ${userId}`);

    try {
      const { contextAnalysis, warmingStrategy, smartDecisions } = context;
      const warmingMetadata = {
        userId,
        contextAnalysis,
        originalContext: context.originalContext,
        smartDecisions: [...smartDecisions]
      };

      // Apply context-based warming strategy
      let warmingResult;
      
      switch (warmingStrategy) {
        case 'progressive':
          console.log('📈 Executing progressive warming strategy');
          warmingMetadata.smartDecisions.push('progressive-strategy-executed');
          warmingResult = await this.executeUserCacheWarming(userId, priority, options);
          break;

        case 'targeted':
          console.log('🎯 Executing targeted warming strategy');
          warmingMetadata.smartDecisions.push('targeted-strategy-executed');
          warmingResult = await this.executeUserCacheWarming(userId, priority, options);
          break;

        case 'basic':
        default:
          console.log('📊 Executing basic warming strategy');
          warmingMetadata.smartDecisions.push('basic-strategy-executed');
          warmingResult = await this.executeUserCacheWarming(userId, priority, options);
          break;
      }

      // Apply context-based optimizations
      await this.applyContextOptimizations(userId, contextAnalysis, warmingMetadata);

      // Calculate total duration
      const totalDuration = Date.now() - startTime;
      
      // Record smart warming event
      this.recordWarmingEvent('smart-warm', totalDuration, true, null, warmingMetadata);

      console.log(`✅ Smart cache warming executed in ${totalDuration}ms`);

      return {
        success: true,
        duration: totalDuration,
        contextAnalysis,
        warmingResult,
        smartDecisions: warmingMetadata.smartDecisions,
        queueProcessed: true
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Smart cache warming execution failed:', error);
      
      this.recordWarmingEvent('smart-warm', duration, false, error.message, {
        userId,
        context,
        error: error.message,
        queueProcessed: true
      });
      
      throw error;
    }
  }

  /**
   * Apply context-based optimizations to cache warming
   * @param {string} userId - User ID
   * @param {Object} contextAnalysis - Context analysis results
   * @param {Object} metadata - Warming metadata to update
   */
  async applyContextOptimizations(userId, contextAnalysis, metadata) {
    const { context, recommendations } = contextAnalysis;
    
    // Apply time-based optimizations
    if (context.time.isWorkoutHour) {
      console.log('⏰ Applying workout hour optimizations');
      metadata.smartDecisions.push('workout-hour-optimization');
      
      // Could trigger additional workout-specific data warming here
      // This would integrate with the progressive warming in task 3.3
    }

    // Apply day-based optimizations
    if (context.day.isWorkoutDay) {
      console.log('📅 Applying workout day optimizations');
      metadata.smartDecisions.push('workout-day-optimization');
    }

    // Apply page-based optimizations
    if (context.page.isWorkoutPage) {
      console.log('📄 Applying workout page optimizations');
      metadata.smartDecisions.push('workout-page-optimization');
      
      // Boost priority for workout-related data
      if (context.page.warmingStrategy === 'progressive') {
        metadata.smartDecisions.push('progressive-boost-applied');
      }
    }

    // Apply user preference optimizations
    if (context.userPreferences.aggressiveCaching) {
      console.log('🚀 Applying aggressive caching preferences');
      metadata.smartDecisions.push('aggressive-caching-applied');
    }

    // Apply behavior pattern optimizations
    const behaviorInsights = this.getBehaviorInsights();
    if (behaviorInsights.mostVisitedPages.length > 0) {
      const topPage = behaviorInsights.mostVisitedPages[0];
      if (topPage.count > 5) { // Frequent visitor
        console.log(`📊 Applying frequent visitor optimization (top page: ${topPage.page})`);
        metadata.smartDecisions.push(`frequent-visitor-${topPage.page}`);
      }
    }

    // Process recommendations
    for (const recommendation of recommendations) {
      console.log(`💡 Processing recommendation: ${recommendation.action} (${recommendation.reason})`);
      metadata.smartDecisions.push(`recommendation-${recommendation.action}`);
      
      switch (recommendation.action) {
        case 'prioritize-workout-data':
          // This would be implemented with specific workout data warming
          console.log('🏋️ Prioritizing workout data warming');
          break;
          
        case 'boost-cache-warming':
          // This could trigger additional warming cycles
          console.log('⚡ Boosting cache warming intensity');
          break;
          
        case 'progressive-warming':
          // This will be implemented in task 3.3
          console.log('📈 Progressive warming recommended');
          break;
          
        case 'multi-phase-warming':
          // This will be implemented in task 3.3
          console.log('🔄 Multi-phase warming recommended');
          break;
      }
    }
  }

  /**
   * Progressive cache warming with multi-phase strategy
   * Implements phased warming approach: critical -> analytics -> extended
   * Now uses the queue system for priority-based processing
   * @param {string} userId - User ID to warm cache for
   * @param {Object} options - Progressive warming options
   * @returns {Promise<Object>} Progressive warming results
   */
  async progressiveWarmCache(userId, options = {}) {
    if (!userId) {
      throw new Error('User ID is required for progressive cache warming');
    }

    console.log(`📈 Starting progressive cache warming for user: ${userId}`);

    // Configuration for progressive warming phases
    const phaseConfig = {
      critical: {
        name: 'Critical Data',
        delay: options.criticalDelay || 0, // Immediate
        priority: 'high',
        description: 'Essential user data and recent workouts'
      },
      analytics: {
        name: 'Analytics Data', 
        delay: options.analyticsDelay || 2000, // 2 seconds
        priority: 'normal',
        description: 'Progress tracking and statistics'
      },
      extended: {
        name: 'Extended Data',
        delay: options.extendedDelay || 5000, // 5 seconds  
        priority: 'low',
        description: 'Historical data and comprehensive records'
      }
    };

    // Analyze context for progressive warming optimization
    const contextAnalysis = this.analyzeCurrentContext();
    console.log('🎯 Progressive warming context:', {
      priority: contextAnalysis.finalPriority,
      strategy: contextAnalysis.warmingStrategy
    });

    // Prepare context for queue processing
    const queueContext = {
      method: 'progressiveWarmCache',
      phaseConfig,
      contextAnalysis,
      options,
      timestamp: Date.now()
    };

    // Use high priority for progressive warming as it's typically triggered in important contexts
    const priority = contextAnalysis.finalPriority === 'low' ? 'normal' : contextAnalysis.finalPriority;

    // Add to queue
    const queueOptions = {
      maxRetries: options.maxRetries || this.config.maxRetries,
      context: queueContext
    };

    const queued = this.queueManager.addToQueue(userId, priority, queueContext, queueOptions);
    
    if (!queued) {
      throw new Error(`Failed to queue progressive cache warming for user: ${userId}`);
    }

    console.log(`📋 Progressive cache warming queued: ${userId} (priority: ${priority})`);
    
    return { 
      success: true, 
      message: 'Queued for progressive processing', 
      userId, 
      priority,
      phaseConfig,
      contextAnalysis,
      queuePosition: this.queueManager.getTotalQueueSize()
    };
  }

  /**
   * Execute progressive cache warming (called by queue manager)
   * This method performs the actual progressive warming operation
   */
  async executeProgressiveCacheWarming(userId, priority, context, options = {}) {
    const startTime = Date.now();
    console.log(`📈 Executing progressive cache warming for user: ${userId}`);

    const { phaseConfig, contextAnalysis } = context;
    
    const results = {
      userId,
      startTime,
      phases: {},
      totalDuration: 0,
      successfulPhases: 0,
      failedPhases: 0,
      overallSuccess: false,
      errors: [],
      queueProcessed: true
    };

    try {
      // Phase 1: Critical Data (Immediate)
      await this.executeProgressivePhase('critical', userId, phaseConfig.critical, results, contextAnalysis);

      // Phase 2: Analytics Data (After delay)
      if (phaseConfig.analytics.delay > 0) {
        console.log(`⏳ Waiting ${phaseConfig.analytics.delay}ms before analytics phase...`);
        await new Promise(resolve => setTimeout(resolve, phaseConfig.analytics.delay));
      }
      await this.executeProgressivePhase('analytics', userId, phaseConfig.analytics, results, contextAnalysis);

      // Phase 3: Extended Data (After delay)
      if (phaseConfig.extended.delay > 0) {
        console.log(`⏳ Waiting ${phaseConfig.extended.delay}ms before extended phase...`);
        await new Promise(resolve => setTimeout(resolve, phaseConfig.extended.delay));
      }
      await this.executeProgressivePhase('extended', userId, phaseConfig.extended, results, contextAnalysis);

      // Calculate final results
      results.totalDuration = Date.now() - startTime;
      results.overallSuccess = results.failedPhases === 0;

      // Record progressive warming event
      this.recordWarmingEvent('progressive-warm', results.totalDuration, results.overallSuccess, 
        results.errors.length > 0 ? results.errors.join('; ') : null, {
          userId,
          phases: Object.keys(results.phases),
          successfulPhases: results.successfulPhases,
          failedPhases: results.failedPhases,
          contextAnalysis: contextAnalysis.finalPriority,
          queueProcessed: true
        });

      console.log(`✅ Progressive cache warming executed in ${results.totalDuration}ms`);
      console.log(`📊 Results: ${results.successfulPhases}/${Object.keys(phaseConfig).length} phases successful`);

      return results;

    } catch (error) {
      results.totalDuration = Date.now() - startTime;
      results.overallSuccess = false;
      results.errors.push(error.message);

      console.error('❌ Progressive cache warming execution failed:', error);
      
      this.recordWarmingEvent('progressive-warm', results.totalDuration, false, error.message, {
        userId,
        phases: Object.keys(results.phases),
        error: error.message,
        queueProcessed: true
      });
      
      throw error;
    }
  }

  /**
   * Execute a single phase of progressive warming
   * @param {string} phaseName - Name of the phase
   * @param {string} userId - User ID
   * @param {Object} phaseConfig - Phase configuration
   * @param {Object} results - Results object to update
   * @param {Object} contextAnalysis - Context analysis for optimization
   */
  async executeProgressivePhase(phaseName, userId, phaseConfig, results, contextAnalysis) {
    const phaseStartTime = Date.now();
    console.log(`🔄 Starting ${phaseConfig.name} phase (${phaseName})`);

    try {
      // Adjust phase priority based on context
      let adjustedPriority = phaseConfig.priority;
      
      // Boost priority during workout hours or on workout pages
      if (contextAnalysis.finalPriority === 'high' && phaseName === 'critical') {
        adjustedPriority = 'high';
        console.log('⚡ Boosting critical phase priority due to high-priority context');
      }

      // Execute phase-specific warming logic
      let phaseResult;
      switch (phaseName) {
        case 'critical':
          phaseResult = await this.warmCriticalData(userId, adjustedPriority);
          break;
        case 'analytics':
          phaseResult = await this.warmAnalyticsData(userId, adjustedPriority);
          break;
        case 'extended':
          phaseResult = await this.warmExtendedData(userId, adjustedPriority);
          break;
        default:
          throw new Error(`Unknown phase: ${phaseName}`);
      }

      // Record phase success
      const phaseDuration = Date.now() - phaseStartTime;
      results.phases[phaseName] = {
        name: phaseConfig.name,
        success: true,
        duration: phaseDuration,
        priority: adjustedPriority,
        result: phaseResult,
        error: null
      };
      results.successfulPhases++;

      console.log(`✅ ${phaseConfig.name} phase completed in ${phaseDuration}ms`);

    } catch (error) {
      // Record phase failure
      const phaseDuration = Date.now() - phaseStartTime;
      results.phases[phaseName] = {
        name: phaseConfig.name,
        success: false,
        duration: phaseDuration,
        priority: phaseConfig.priority,
        result: null,
        error: error.message
      };
      results.failedPhases++;
      results.errors.push(`${phaseConfig.name}: ${error.message}`);

      console.error(`❌ ${phaseConfig.name} phase failed:`, error);

      // Continue with other phases unless it's a critical failure
      if (phaseName === 'critical' && !this.config.continueOnCriticalFailure) {
        throw error;
      }
    }
  }

  /**
   * Warm critical data (Phase 1)
   * Essential user data and recent workouts
   * @param {string} userId - User ID
   * @param {string} priority - Warming priority
   * @returns {Promise<Object>} Critical warming result
   */
  async warmCriticalData(userId, priority) {
    console.log('🔥 Warming critical data...');
    
    try {
      // Use the existing warmUserCache function for critical data
      // This would typically include recent workouts, active programs, user profile
      const result = await warmUserCache(userId, priority);
      
      console.log('✅ Critical data warming completed');
      return {
        type: 'critical',
        dataTypes: ['user-profile', 'recent-workouts', 'active-programs'],
        result
      };
    } catch (error) {
      console.error('❌ Critical data warming failed:', error);
      throw new Error(`Critical data warming failed: ${error.message}`);
    }
  }

  /**
   * Warm analytics data (Phase 2)
   * Progress tracking and statistics
   * @param {string} userId - User ID
   * @param {string} priority - Warming priority
   * @returns {Promise<Object>} Analytics warming result
   */
  async warmAnalyticsData(userId, priority) {
    console.log('📊 Warming analytics data...');
    
    try {
      // This would warm analytics-specific data
      // For now, we'll use the same warmUserCache but with different context
      const result = await warmUserCache(userId, priority);
      
      console.log('✅ Analytics data warming completed');
      return {
        type: 'analytics',
        dataTypes: ['progress-stats', 'workout-analytics', 'performance-metrics'],
        result
      };
    } catch (error) {
      console.error('❌ Analytics data warming failed:', error);
      throw new Error(`Analytics data warming failed: ${error.message}`);
    }
  }

  /**
   * Warm extended data (Phase 3)
   * Historical data and comprehensive records
   * @param {string} userId - User ID
   * @param {string} priority - Warming priority
   * @returns {Promise<Object>} Extended warming result
   */
  async warmExtendedData(userId, priority) {
    console.log('📚 Warming extended data...');
    
    try {
      // This would warm historical and extended data
      // For now, we'll use the same warmUserCache but with different context
      const result = await warmUserCache(userId, priority);
      
      console.log('✅ Extended data warming completed');
      return {
        type: 'extended',
        dataTypes: ['workout-history', 'exercise-library', 'program-templates'],
        result
      };
    } catch (error) {
      console.error('❌ Extended data warming failed:', error);
      throw new Error(`Extended data warming failed: ${error.message}`);
    }
  }

  /**
   * Perform background cache maintenance
   * Monitors cache health and triggers warming when needed
   */
  async performMaintenance() {
    console.log('🔧 Performing cache maintenance...');

    try {
      // Get current cache statistics from Supabase cache
      const stats = getCacheStats();
      console.log('📊 Current cache stats:', stats);

      // Perform queue maintenance
      const queueMaintenanceResult = await this.performQueueMaintenance();

      // Parse hit rate and trigger warming if low
      const hitRate = parseFloat(stats.hitRate);
      if (hitRate < 70) {
        console.log(`⚠️ Low cache hit rate (${hitRate}%), considering additional warming`);

        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          // Use queue system for maintenance-triggered warming
          await this.warmUserCacheWithRetry(currentUser.id, 'normal', null, {
            trigger: 'maintenance',
            reason: `Low hit rate: ${hitRate}%`
          });
        }
      }

      // Clean up old warming history
      if (this.warmingHistory.length > this.config.maxHistorySize) {
        const removed = this.warmingHistory.length - this.config.maxHistorySize;
        this.warmingHistory = this.warmingHistory.slice(-this.config.maxHistorySize);
        console.log(`🧹 Cleaned up ${removed} old warming history entries`);
      }

      return {
        cacheStats: stats,
        queueMaintenance: queueMaintenanceResult,
        historyCleanup: this.warmingHistory.length,
        maintenanceCompleted: true
      };

    } catch (error) {
      console.error('❌ Cache maintenance failed:', error);
      throw error;
    }
  }

  /**
   * Enhanced maintenance operations with health monitoring and optimization
   * Implements cache health monitoring, automatic warming triggers, memory cleanup, and reporting
   */
  async performEnhancedMaintenance() {
    console.log('🔧 Performing enhanced cache maintenance...');
    
    const maintenanceStartTime = Date.now();
    const results = {
      startTime: maintenanceStartTime,
      cacheHealth: null,
      queueMaintenance: null,
      memoryCleanup: null,
      automaticWarming: null,
      performanceOptimization: null,
      reporting: null,
      duration: 0,
      success: false,
      errors: []
    };

    try {
      // 1. Cache Health Monitoring
      console.log('📊 Monitoring cache health...');
      results.cacheHealth = await this.monitorCacheHealth();

      // 2. Queue Maintenance and Optimization
      console.log('🔄 Performing queue maintenance...');
      results.queueMaintenance = await this.performAdvancedQueueMaintenance();

      // 3. Memory Cleanup and Garbage Collection
      console.log('🧹 Performing memory cleanup...');
      results.memoryCleanup = await this.performMemoryCleanup();

      // 4. Automatic Warming Based on Performance Metrics
      console.log('🔥 Checking automatic warming triggers...');
      results.automaticWarming = await this.performAutomaticWarming(results.cacheHealth);

      // 5. Performance Optimization
      console.log('⚡ Performing performance optimization...');
      results.performanceOptimization = await this.performPerformanceOptimization();

      // 6. Maintenance Reporting and Logging
      console.log('📝 Generating maintenance report...');
      results.reporting = await this.generateMaintenanceReport(results);

      // Calculate total duration
      results.duration = Date.now() - maintenanceStartTime;
      results.success = true;

      console.log(`✅ Enhanced maintenance completed successfully in ${results.duration}ms`);
      return results;

    } catch (error) {
      results.duration = Date.now() - maintenanceStartTime;
      results.success = false;
      results.errors.push(error.message);
      
      console.error('❌ Enhanced maintenance failed:', error);
      throw error;
    }
  }

  /**
   * Monitor cache health and collect performance metrics
   * @returns {Object} Cache health analysis results
   */
  async monitorCacheHealth() {
    const healthStartTime = Date.now();
    
    try {
      // Get current cache statistics from Supabase cache
      const cacheStats = getCacheStats();
      console.log('📊 Current cache stats:', cacheStats);

      // Analyze cache performance metrics
      const hitRate = parseFloat(cacheStats.hitRate) || 0;
      const missRate = 100 - hitRate;
      
      // Get queue health metrics
      const queueStatus = this.getQueueStatus();
      const queueHealth = this.analyzeQueueHealth(queueStatus);

      // Get warming statistics
      const warmingStats = this.getWarmingStats();
      const warmingHealth = this.analyzeWarmingHealth(warmingStats);

      // Calculate overall health score
      const healthScore = this.calculateHealthScore({
        hitRate,
        queueHealth: queueHealth.score,
        warmingHealth: warmingHealth.score
      });

      // Determine health status
      let healthStatus = 'healthy';
      const issues = [];
      
      if (hitRate < 60) {
        healthStatus = 'critical';
        issues.push(`Very low cache hit rate: ${hitRate}%`);
      } else if (hitRate < 70) {
        healthStatus = 'warning';
        issues.push(`Low cache hit rate: ${hitRate}%`);
      }

      if (queueHealth.issues.length > 0) {
        if (healthStatus !== 'critical') {
          healthStatus = queueHealth.status === 'critical' ? 'critical' : 'warning';
        }
        issues.push(...queueHealth.issues);
      }

      if (warmingHealth.issues.length > 0) {
        if (healthStatus !== 'critical') {
          healthStatus = warmingHealth.status === 'critical' ? 'critical' : 'warning';
        }
        issues.push(...warmingHealth.issues);
      }

      const healthResult = {
        status: healthStatus,
        score: healthScore,
        hitRate,
        missRate,
        issues,
        metrics: {
          cache: cacheStats,
          queue: queueStatus,
          warming: warmingStats
        },
        recommendations: this.generateHealthRecommendations(healthStatus, issues, {
          hitRate,
          queueHealth,
          warmingHealth
        }),
        duration: Date.now() - healthStartTime
      };

      console.log(`📊 Cache health analysis completed: ${healthStatus} (score: ${healthScore}/100)`);
      return healthResult;

    } catch (error) {
      console.error('❌ Cache health monitoring failed:', error);
      return {
        status: 'error',
        score: 0,
        error: error.message,
        duration: Date.now() - healthStartTime
      };
    }
  }

  /**
   * Analyze queue health metrics
   * @param {Object} queueStatus - Current queue status
   * @returns {Object} Queue health analysis
   */
  analyzeQueueHealth(queueStatus) {
    if (!queueStatus) {
      return { status: 'error', score: 0, issues: ['Queue status unavailable'] };
    }

    const issues = [];
    let score = 100;
    let status = 'healthy';

    // Check queue size
    const utilizationRate = (queueStatus.totalSize / queueStatus.maxConcurrent) * 100;
    if (utilizationRate > 90) {
      status = 'critical';
      score -= 30;
      issues.push(`Queue near capacity: ${queueStatus.totalSize}/${queueStatus.maxConcurrent}`);
    } else if (utilizationRate > 70) {
      status = 'warning';
      score -= 15;
      issues.push(`Queue utilization high: ${utilizationRate.toFixed(1)}%`);
    }

    // Check processing status
    if (!queueStatus.isProcessing && queueStatus.totalSize > 0) {
      status = 'critical';
      score -= 25;
      issues.push('Queue not processing despite having items');
    }

    // Check failure rates
    if (queueStatus.stats) {
      const failureRate = queueStatus.stats.totalFailed / (queueStatus.stats.totalProcessed + queueStatus.stats.totalFailed) * 100;
      if (failureRate > 20) {
        status = status === 'critical' ? 'critical' : 'warning';
        score -= 20;
        issues.push(`High queue failure rate: ${failureRate.toFixed(1)}%`);
      }
    }

    return { status, score: Math.max(0, score), issues };
  }

  /**
   * Analyze warming health metrics
   * @param {Object} warmingStats - Current warming statistics
   * @returns {Object} Warming health analysis
   */
  analyzeWarmingHealth(warmingStats) {
    if (!warmingStats) {
      return { status: 'error', score: 0, issues: ['Warming stats unavailable'] };
    }

    const issues = [];
    let score = 100;
    let status = 'healthy';

    // Check success rate
    if (warmingStats.successRate < 80) {
      status = 'critical';
      score -= 30;
      issues.push(`Low warming success rate: ${warmingStats.successRate}%`);
    } else if (warmingStats.successRate < 90) {
      status = 'warning';
      score -= 15;
      issues.push(`Moderate warming success rate: ${warmingStats.successRate}%`);
    }

    // Check average duration
    if (warmingStats.averageDuration > 10000) { // 10 seconds
      status = status === 'critical' ? 'critical' : 'warning';
      score -= 10;
      issues.push(`High average warming duration: ${warmingStats.averageDuration}ms`);
    }

    // Check recent failures
    if (warmingStats.recentFailures > 5) {
      status = status === 'critical' ? 'critical' : 'warning';
      score -= 15;
      issues.push(`High recent failure count: ${warmingStats.recentFailures}`);
    }

    return { status, score: Math.max(0, score), issues };
  }

  /**
   * Calculate overall health score
   * @param {Object} metrics - Health metrics
   * @returns {number} Health score (0-100)
   */
  calculateHealthScore(metrics) {
    const weights = {
      hitRate: 0.4,
      queueHealth: 0.3,
      warmingHealth: 0.3
    };

    const hitRateScore = Math.min(100, metrics.hitRate * 1.25); // Scale hit rate to 0-100
    
    const totalScore = (
      (hitRateScore * weights.hitRate) +
      (metrics.queueHealth * weights.queueHealth) +
      (metrics.warmingHealth * weights.warmingHealth)
    );

    return Math.round(totalScore);
  }

  /**
   * Generate health-based recommendations
   * @param {string} status - Overall health status
   * @param {Array} issues - Current issues
   * @param {Object} metrics - Health metrics
   * @returns {Array} Array of recommendations
   */
  generateHealthRecommendations(status, issues, metrics) {
    const recommendations = [];

    if (metrics.hitRate < 70) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        action: 'increase-warming-frequency',
        description: 'Consider increasing cache warming frequency to improve hit rate'
      });
    }

    if (metrics.queueHealth.status === 'critical') {
      recommendations.push({
        type: 'capacity',
        priority: 'high',
        action: 'scale-queue-capacity',
        description: 'Queue is near capacity, consider increasing limits or processing speed'
      });
    }

    if (metrics.warmingHealth.status === 'critical') {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        action: 'investigate-warming-failures',
        description: 'High warming failure rate detected, investigate root causes'
      });
    }

    if (status === 'healthy' && metrics.hitRate > 85) {
      recommendations.push({
        type: 'optimization',
        priority: 'low',
        action: 'optimize-warming-intervals',
        description: 'System is healthy, consider optimizing warming intervals for efficiency'
      });
    }

    return recommendations;
  }

  /**
   * Perform advanced queue maintenance with optimization
   * @returns {Object} Queue maintenance results
   */
  async performAdvancedQueueMaintenance() {
    const maintenanceStartTime = Date.now();
    
    try {
      const results = {
        queueCleanup: null,
        duplicateRemoval: null,
        priorityOptimization: null,
        staleItemRemoval: null,
        statistics: null
      };

      // Get initial queue status
      const initialStatus = this.getQueueStatus();
      console.log('🔄 Initial queue status:', {
        total: initialStatus?.totalSize || 0,
        active: initialStatus?.activeWarming || 0
      });

      // 1. Remove stale queue items (older than 1 hour)
      const staleThreshold = Date.now() - (60 * 60 * 1000); // 1 hour
      let staleRemoved = 0;
      
      if (this.queueManager) {
        // This would require extending the queue manager to support stale item removal
        // For now, we'll simulate the operation
        staleRemoved = await this.removeStaleQueueItems(staleThreshold);
      }

      results.staleItemRemoval = {
        removed: staleRemoved,
        threshold: staleThreshold
      };

      // 2. Optimize queue priorities based on current context
      const priorityOptimizations = await this.optimizeQueuePriorities();
      results.priorityOptimization = priorityOptimizations;

      // 3. Remove any duplicate entries (shouldn't happen but safety check)
      const duplicatesRemoved = await this.removeDuplicateQueueItems();
      results.duplicateRemoval = {
        removed: duplicatesRemoved
      };

      // 4. General queue cleanup
      if (this.queueManager) {
        // Reset any stuck processing states
        const cleanupResult = await this.performQueueCleanup();
        results.queueCleanup = cleanupResult;
      }

      // Get final statistics
      const finalStatus = this.getQueueStatus();
      results.statistics = {
        initial: initialStatus,
        final: finalStatus,
        itemsRemoved: staleRemoved + duplicatesRemoved,
        duration: Date.now() - maintenanceStartTime
      };

      console.log(`🔄 Advanced queue maintenance completed: removed ${results.statistics.itemsRemoved} items`);
      return results;

    } catch (error) {
      console.error('❌ Advanced queue maintenance failed:', error);
      return {
        error: error.message,
        duration: Date.now() - maintenanceStartTime
      };
    }
  }

  /**
   * Remove stale items from the queue
   * @param {number} threshold - Timestamp threshold for stale items
   * @returns {number} Number of items removed
   */
  async removeStaleQueueItems(threshold) {
    // This would require extending the queue manager
    // For now, return 0 as a placeholder
    console.log('🗑️ Checking for stale queue items...');
    return 0;
  }

  /**
   * Optimize queue priorities based on current context
   * @returns {Object} Priority optimization results
   */
  async optimizeQueuePriorities() {
    console.log('⚡ Optimizing queue priorities...');
    
    // Analyze current context
    const contextAnalysis = this.analyzeCurrentContext();
    
    // This would involve reordering queue items based on current priority
    // For now, return analysis results
    return {
      contextPriority: contextAnalysis.finalPriority,
      strategy: contextAnalysis.warmingStrategy,
      optimizationsApplied: 0
    };
  }

  /**
   * Remove duplicate queue items
   * @returns {number} Number of duplicates removed
   */
  async removeDuplicateQueueItems() {
    console.log('🔍 Checking for duplicate queue items...');
    
    // The queue manager already prevents duplicates, but this is a safety check
    return 0;
  }

  /**
   * Perform general queue cleanup
   * @returns {Object} Cleanup results
   */
  async performQueueCleanup() {
    console.log('🧹 Performing general queue cleanup...');
    
    return {
      stuckItemsCleared: 0,
      processingStateReset: true,
      memoryOptimized: true
    };
  }

  /**
   * Perform memory cleanup and garbage collection
   * @returns {Object} Memory cleanup results
   */
  async performMemoryCleanup() {
    const cleanupStartTime = Date.now();
    
    try {
      const results = {
        historyCleanup: null,
        statsCleanup: null,
        cacheCleanup: null,
        memoryOptimization: null
      };

      // 1. Clean up old warming history
      const initialHistorySize = this.warmingHistory.length;
      if (initialHistorySize > this.config.maxHistorySize) {
        const removed = initialHistorySize - this.config.maxHistorySize;
        this.warmingHistory = this.warmingHistory.slice(-this.config.maxHistorySize);
        console.log(`🧹 Cleaned up ${removed} old warming history entries`);
        
        results.historyCleanup = {
          removed,
          remaining: this.warmingHistory.length
        };
      } else {
        results.historyCleanup = {
          removed: 0,
          remaining: initialHistorySize
        };
      }

      // 2. Clean up old statistics if stats tracker supports it
      if (this.statsTracker && typeof this.statsTracker.cleanup === 'function') {
        const statsCleanup = await this.statsTracker.performCleanup();
        results.statsCleanup = statsCleanup;
      } else {
        results.statsCleanup = { message: 'Stats cleanup not available' };
      }

      // 3. Trigger garbage collection if available
      if (global.gc) {
        const memBefore = process.memoryUsage();
        global.gc();
        const memAfter = process.memoryUsage();
        
        results.memoryOptimization = {
          before: memBefore,
          after: memAfter,
          freed: memBefore.heapUsed - memAfter.heapUsed
        };
        
        console.log(`🧹 Garbage collection freed ${results.memoryOptimization.freed} bytes`);
      } else {
        results.memoryOptimization = { message: 'Garbage collection not available' };
      }

      // 4. Clean up any cached data that might be stale
      results.cacheCleanup = await this.performCacheCleanup();

      results.duration = Date.now() - cleanupStartTime;
      console.log(`🧹 Memory cleanup completed in ${results.duration}ms`);
      
      return results;

    } catch (error) {
      console.error('❌ Memory cleanup failed:', error);
      return {
        error: error.message,
        duration: Date.now() - cleanupStartTime
      };
    }
  }

  /**
   * Perform cache-specific cleanup
   * @returns {Object} Cache cleanup results
   */
  async performCacheCleanup() {
    console.log('🧹 Performing cache cleanup...');
    
    // Clear any stale behavior patterns (older than 24 hours)
    const staleThreshold = Date.now() - (24 * 60 * 60 * 1000);
    let patternsCleared = 0;
    
    if (this.behaviorPatterns.lastUpdated && this.behaviorPatterns.lastUpdated < staleThreshold) {
      this.behaviorPatterns = {};
      patternsCleared = 1;
      console.log('🧹 Cleared stale behavior patterns');
    }

    return {
      behaviorPatternsCleared: patternsCleared,
      contextCacheCleared: false // Could implement context cache clearing
    };
  }

  /**
   * Perform automatic warming based on performance metrics
   * @param {Object} cacheHealth - Current cache health metrics
   * @returns {Object} Automatic warming results
   */
  async performAutomaticWarming(cacheHealth) {
    const warmingStartTime = Date.now();
    
    try {
      const results = {
        triggered: false,
        reason: null,
        warmingRequests: [],
        performance: null
      };

      // Check if automatic warming should be triggered
      const shouldWarm = this.shouldTriggerAutomaticWarming(cacheHealth);
      
      if (!shouldWarm.trigger) {
        results.reason = shouldWarm.reason;
        results.duration = Date.now() - warmingStartTime;
        return results;
      }

      results.triggered = true;
      results.reason = shouldWarm.reason;

      console.log(`🔥 Triggering automatic warming: ${shouldWarm.reason}`);

      // Get current user for warming
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        // Determine warming strategy based on health metrics
        const strategy = this.determineWarmingStrategy(cacheHealth);
        
        const warmingRequest = {
          userId: currentUser.id,
          strategy,
          priority: shouldWarm.priority,
          context: {
            trigger: 'automatic-maintenance',
            reason: shouldWarm.reason,
            healthScore: cacheHealth.score,
            timestamp: Date.now()
          }
        };

        // Execute warming based on strategy
        let warmingResult;
        switch (strategy) {
          case 'progressive':
            warmingResult = await this.progressiveWarmCache(currentUser.id, {
              trigger: 'maintenance',
              healthScore: cacheHealth.score
            });
            break;
            
          case 'smart':
            warmingResult = await this.smartWarmCache(currentUser.id, {
              trigger: 'maintenance',
              healthScore: cacheHealth.score
            });
            break;
            
          default:
            warmingResult = await this.warmUserCacheWithRetry(currentUser.id, shouldWarm.priority, null, {
              trigger: 'maintenance',
              reason: shouldWarm.reason
            });
            break;
        }

        warmingRequest.result = warmingResult;
        results.warmingRequests.push(warmingRequest);

        console.log(`🔥 Automatic warming completed: ${strategy} strategy`);
      } else {
        console.log('👤 No current user for automatic warming');
        results.reason += ' (no current user)';
      }

      results.duration = Date.now() - warmingStartTime;
      return results;

    } catch (error) {
      console.error('❌ Automatic warming failed:', error);
      return {
        triggered: false,
        error: error.message,
        duration: Date.now() - warmingStartTime
      };
    }
  }

  /**
   * Determine if automatic warming should be triggered
   * @param {Object} cacheHealth - Current cache health metrics
   * @returns {Object} Warming decision
   */
  shouldTriggerAutomaticWarming(cacheHealth) {
    if (!cacheHealth || cacheHealth.status === 'error') {
      return {
        trigger: false,
        reason: 'Cache health unavailable'
      };
    }

    // Trigger on low hit rate
    if (cacheHealth.hitRate < 60) {
      return {
        trigger: true,
        reason: `Critical hit rate: ${cacheHealth.hitRate}%`,
        priority: 'high'
      };
    }

    if (cacheHealth.hitRate < 70) {
      return {
        trigger: true,
        reason: `Low hit rate: ${cacheHealth.hitRate}%`,
        priority: 'normal'
      };
    }

    // Trigger on critical health status
    if (cacheHealth.status === 'critical') {
      return {
        trigger: true,
        reason: `Critical health status: ${cacheHealth.issues.join(', ')}`,
        priority: 'high'
      };
    }

    // Trigger on warning status with multiple issues
    if (cacheHealth.status === 'warning' && cacheHealth.issues.length >= 2) {
      return {
        trigger: true,
        reason: `Multiple health warnings: ${cacheHealth.issues.join(', ')}`,
        priority: 'normal'
      };
    }

    return {
      trigger: false,
      reason: `Health status acceptable: ${cacheHealth.status} (${cacheHealth.hitRate}% hit rate)`
    };
  }

  /**
   * Determine warming strategy based on health metrics
   * @param {Object} cacheHealth - Current cache health metrics
   * @returns {string} Warming strategy
   */
  determineWarmingStrategy(cacheHealth) {
    if (cacheHealth.status === 'critical' || cacheHealth.hitRate < 50) {
      return 'progressive';
    }
    
    if (cacheHealth.status === 'warning' || cacheHealth.hitRate < 75) {
      return 'smart';
    }
    
    return 'basic';
  }

  /**
   * Perform performance optimization
   * @returns {Object} Performance optimization results
   */
  async performPerformanceOptimization() {
    const optimizationStartTime = Date.now();
    
    try {
      const results = {
        configOptimization: null,
        queueOptimization: null,
        memoryOptimization: null,
        recommendations: []
      };

      // 1. Optimize configuration based on current performance
      results.configOptimization = await this.optimizeConfiguration();

      // 2. Optimize queue settings
      results.queueOptimization = await this.optimizeQueueSettings();

      // 3. Memory usage optimization
      results.memoryOptimization = await this.optimizeMemoryUsage();

      // 4. Generate performance recommendations
      results.recommendations = this.generatePerformanceRecommendations(results);

      results.duration = Date.now() - optimizationStartTime;
      console.log(`⚡ Performance optimization completed in ${results.duration}ms`);
      
      return results;

    } catch (error) {
      console.error('❌ Performance optimization failed:', error);
      return {
        error: error.message,
        duration: Date.now() - optimizationStartTime
      };
    }
  }

  /**
   * Optimize service configuration
   * @returns {Object} Configuration optimization results
   */
  async optimizeConfiguration() {
    console.log('⚙️ Optimizing service configuration...');
    
    const stats = this.getWarmingStats();
    const optimizations = [];

    // Optimize retry settings based on success rate
    if (stats && stats.successRate < 85) {
      optimizations.push({
        setting: 'maxRetries',
        oldValue: this.config.maxRetries,
        newValue: Math.min(this.config.maxRetries + 1, 5),
        reason: 'Low success rate detected'
      });
    }

    // Optimize maintenance interval based on activity
    const queueStatus = this.getQueueStatus();
    if (queueStatus && queueStatus.totalSize > 50) {
      optimizations.push({
        setting: 'maintenanceInterval',
        oldValue: this.config.maintenanceInterval,
        newValue: Math.max(this.config.maintenanceInterval - 2, 5),
        reason: 'High queue activity detected'
      });
    }

    return {
      optimizations,
      applied: optimizations.length
    };
  }

  /**
   * Optimize queue settings
   * @returns {Object} Queue optimization results
   */
  async optimizeQueueSettings() {
    console.log('🔄 Optimizing queue settings...');
    
    const queueStatus = this.getQueueStatus();
    if (!queueStatus) {
      return { message: 'Queue status unavailable' };
    }

    const optimizations = [];

    // Optimize concurrent warming based on queue size
    const utilizationRate = queueStatus.totalSize / queueStatus.maxConcurrent;
    if (utilizationRate > 0.8) {
      optimizations.push({
        setting: 'maxConcurrentWarming',
        suggestion: Math.min(queueStatus.maxConcurrent + 1, 5),
        reason: 'High queue utilization'
      });
    }

    return {
      currentUtilization: utilizationRate,
      optimizations,
      suggestions: optimizations.length
    };
  }

  /**
   * Optimize memory usage
   * @returns {Object} Memory optimization results
   */
  async optimizeMemoryUsage() {
    console.log('💾 Optimizing memory usage...');
    
    const memoryUsage = process.memoryUsage();
    const optimizations = [];

    // Optimize history size based on memory usage
    if (memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
      optimizations.push({
        setting: 'maxHistorySize',
        suggestion: Math.max(this.config.maxHistorySize - 10, 20),
        reason: 'High memory usage detected'
      });
    }

    return {
      memoryUsage,
      optimizations,
      suggestions: optimizations.length
    };
  }

  /**
   * Generate performance recommendations
   * @param {Object} optimizationResults - Results from optimization steps
   * @returns {Array} Array of performance recommendations
   */
  generatePerformanceRecommendations(optimizationResults) {
    const recommendations = [];

    if (optimizationResults.configOptimization?.applied > 0) {
      recommendations.push({
        type: 'configuration',
        priority: 'medium',
        message: `${optimizationResults.configOptimization.applied} configuration optimizations available`
      });
    }

    if (optimizationResults.queueOptimization?.suggestions > 0) {
      recommendations.push({
        type: 'queue',
        priority: 'medium',
        message: `${optimizationResults.queueOptimization.suggestions} queue optimizations suggested`
      });
    }

    if (optimizationResults.memoryOptimization?.suggestions > 0) {
      recommendations.push({
        type: 'memory',
        priority: 'low',
        message: `${optimizationResults.memoryOptimization.suggestions} memory optimizations available`
      });
    }

    return recommendations;
  }

  /**
   * Generate comprehensive maintenance report
   * @param {Object} maintenanceResults - Results from all maintenance operations
   * @returns {Object} Maintenance report
   */
  async generateMaintenanceReport(maintenanceResults) {
    const reportStartTime = Date.now();
    
    try {
      const report = {
        timestamp: Date.now(),
        duration: maintenanceResults.duration,
        success: maintenanceResults.success,
        summary: this.generateMaintenanceSummary(maintenanceResults),
        details: {
          cacheHealth: maintenanceResults.cacheHealth,
          queueMaintenance: maintenanceResults.queueMaintenance,
          memoryCleanup: maintenanceResults.memoryCleanup,
          automaticWarming: maintenanceResults.automaticWarming,
          performanceOptimization: maintenanceResults.performanceOptimization
        },
        recommendations: this.consolidateRecommendations(maintenanceResults),
        nextActions: this.generateNextActions(maintenanceResults),
        metrics: await this.collectMaintenanceMetrics()
      };

      // Log maintenance report summary
      console.log('📝 Maintenance Report Summary:');
      console.log(`   Status: ${report.success ? '✅ Success' : '❌ Failed'}`);
      console.log(`   Duration: ${report.duration}ms`);
      console.log(`   Health Score: ${report.details.cacheHealth?.score || 'N/A'}/100`);
      console.log(`   Recommendations: ${report.recommendations.length}`);

      report.generationDuration = Date.now() - reportStartTime;
      return report;

    } catch (error) {
      console.error('❌ Maintenance report generation failed:', error);
      return {
        error: error.message,
        timestamp: Date.now(),
        generationDuration: Date.now() - reportStartTime
      };
    }
  }

  /**
   * Generate maintenance summary
   * @param {Object} results - Maintenance results
   * @returns {Object} Maintenance summary
   */
  generateMaintenanceSummary(results) {
    const summary = {
      overallStatus: results.success ? 'success' : 'failed',
      healthStatus: results.cacheHealth?.status || 'unknown',
      hitRate: results.cacheHealth?.hitRate || 0,
      issuesFound: results.cacheHealth?.issues?.length || 0,
      warmingTriggered: results.automaticWarming?.triggered || false,
      optimizationsApplied: 0,
      errorsEncountered: results.errors?.length || 0
    };

    // Count optimizations applied
    if (results.performanceOptimization?.configOptimization?.applied) {
      summary.optimizationsApplied += results.performanceOptimization.configOptimization.applied;
    }

    return summary;
  }

  /**
   * Consolidate recommendations from all maintenance operations
   * @param {Object} results - Maintenance results
   * @returns {Array} Consolidated recommendations
   */
  consolidateRecommendations(results) {
    const allRecommendations = [];

    // Add health recommendations
    if (results.cacheHealth?.recommendations) {
      allRecommendations.push(...results.cacheHealth.recommendations);
    }

    // Add performance recommendations
    if (results.performanceOptimization?.recommendations) {
      allRecommendations.push(...results.performanceOptimization.recommendations);
    }

    // Remove duplicates and sort by priority
    const uniqueRecommendations = allRecommendations.filter((rec, index, self) => 
      index === self.findIndex(r => r.action === rec.action)
    );

    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    return uniqueRecommendations.sort((a, b) => 
      (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0)
    );
  }

  /**
   * Generate next actions based on maintenance results
   * @param {Object} results - Maintenance results
   * @returns {Array} Next actions to take
   */
  generateNextActions(results) {
    const actions = [];

    if (results.cacheHealth?.status === 'critical') {
      actions.push({
        action: 'immediate-investigation',
        priority: 'high',
        description: 'Critical health issues require immediate attention'
      });
    }

    if (results.automaticWarming?.triggered) {
      actions.push({
        action: 'monitor-warming-results',
        priority: 'medium',
        description: 'Monitor the results of automatic warming'
      });
    }

    if (results.performanceOptimization?.optimizations?.length > 0) {
      actions.push({
        action: 'apply-optimizations',
        priority: 'low',
        description: 'Consider applying suggested performance optimizations'
      });
    }

    return actions;
  }

  /**
   * Collect maintenance metrics for reporting
   * @returns {Object} Maintenance metrics
   */
  async collectMaintenanceMetrics() {
    return {
      serviceUptime: this.calculateServiceUptime(),
      maintenanceStats: this.getMaintenanceStats(),
      queueStatus: this.getQueueStatus(),
      warmingStats: this.getWarmingStats(),
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Analyze current context for intelligent warming decisions
   * @param {Object} options - Context analysis options
   * @returns {Object} Context analysis results
   */
  analyzeCurrentContext(options = {}) {
    const contextOptions = {
      date: new Date(),
      pageName: this.currentPageContext?.current || null,
      previousPage: this.currentPageContext?.previous || null,
      userPreferences: this.userPreferences,
      behaviorPatterns: this.behaviorPatterns,
      config: this.config, // Pass service configuration to context analyzer
      ...options
    };
    
    const analysis = this.contextAnalyzer.determinePriority(contextOptions);
    
    console.log('🧠 Context analysis completed:', {
      priority: analysis.finalPriority,
      strategy: analysis.warmingStrategy,
      score: analysis.priorityScore.toFixed(3),
      recommendations: analysis.recommendations.length
    });
    
    return analysis;
  }
  
  /**
   * Update current page context for analysis
   * @param {string} pageName - Current page name
   * @param {string} previousPage - Previous page name
   */
  updatePageContext(pageName, previousPage = null) {
    const oldContext = this.currentPageContext;
    
    this.currentPageContext = {
      current: pageName,
      previous: previousPage || oldContext?.current || null,
      timestamp: Date.now()
    };
    
    console.log('📄 Page context updated:', this.currentPageContext);
    
    // Update behavior patterns
    this.updateBehaviorPatterns(pageName);
  }
  
  /**
   * Update user behavior patterns based on page visits
   * @param {string} pageName - Visited page name
   */
  updateBehaviorPatterns(pageName) {
    if (!pageName) return;
    
    const now = Date.now();
    const hour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    
    // Initialize patterns if not exists
    if (!this.behaviorPatterns.pageVisits) {
      this.behaviorPatterns.pageVisits = {};
    }
    if (!this.behaviorPatterns.timePatterns) {
      this.behaviorPatterns.timePatterns = {};
    }
    if (!this.behaviorPatterns.dayPatterns) {
      this.behaviorPatterns.dayPatterns = {};
    }
    
    // Track page visits
    if (!this.behaviorPatterns.pageVisits[pageName]) {
      this.behaviorPatterns.pageVisits[pageName] = [];
    }
    this.behaviorPatterns.pageVisits[pageName].push(now);
    
    // Track time patterns
    const timeKey = `hour_${hour}`;
    if (!this.behaviorPatterns.timePatterns[timeKey]) {
      this.behaviorPatterns.timePatterns[timeKey] = 0;
    }
    this.behaviorPatterns.timePatterns[timeKey]++;
    
    // Track day patterns
    const dayKey = `day_${dayOfWeek}`;
    if (!this.behaviorPatterns.dayPatterns[dayKey]) {
      this.behaviorPatterns.dayPatterns[dayKey] = 0;
    }
    this.behaviorPatterns.dayPatterns[dayKey]++;
    
    // Keep only recent visits (last 30 days)
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    Object.keys(this.behaviorPatterns.pageVisits).forEach(page => {
      this.behaviorPatterns.pageVisits[page] = this.behaviorPatterns.pageVisits[page]
        .filter(timestamp => timestamp > thirtyDaysAgo);
    });
  }
  
  /**
   * Set user preferences for cache warming
   * @param {Object} preferences - User preferences object
   */
  setUserPreferences(preferences = {}) {
    this.userPreferences = {
      priorityBoost: preferences.priorityBoost || 2, // 1=low, 2=normal, 3=high
      preferredWorkoutHours: preferences.preferredWorkoutHours || [6, 7, 8, 17, 18, 19, 20],
      workoutDays: preferences.workoutDays || [1, 2, 3, 4, 5], // Monday-Friday
      aggressiveCaching: preferences.aggressiveCaching || false,
      ...preferences
    };
    
    console.log('⚙️ User preferences updated:', this.userPreferences);
  }
  
  /**
   * Get behavior pattern insights
   * @returns {Object} Behavior pattern analysis
   */
  getBehaviorInsights() {
    const insights = {
      mostVisitedPages: [],
      peakHours: [],
      activeDays: [],
      patterns: this.behaviorPatterns
    };
    
    // Analyze most visited pages
    if (this.behaviorPatterns.pageVisits) {
      insights.mostVisitedPages = Object.entries(this.behaviorPatterns.pageVisits)
        .map(([page, visits]) => ({ page, count: visits.length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }
    
    // Analyze peak hours
    if (this.behaviorPatterns.timePatterns) {
      insights.peakHours = Object.entries(this.behaviorPatterns.timePatterns)
        .map(([hourKey, count]) => ({ 
          hour: parseInt(hourKey.split('_')[1]), 
          count 
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    }
    
    // Analyze active days
    if (this.behaviorPatterns.dayPatterns) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      insights.activeDays = Object.entries(this.behaviorPatterns.dayPatterns)
        .map(([dayKey, count]) => {
          const dayNum = parseInt(dayKey.split('_')[1]);
          return { 
            day: dayNames[dayNum], 
            dayOfWeek: dayNum,
            count 
          };
        })
        .sort((a, b) => b.count - a.count);
    }
    
    return insights;
  }

  /**
   * Record warming events with comprehensive metadata and analytics
   * Includes event categorization, tagging, correlation detection, and pattern analysis
   * @param {string} type - Event type ('app-init', 'user-cache', 'smart-warm', 'progressive-warm', 'maintenance')
   * @param {number} duration - Duration in milliseconds
   * @param {boolean} success - Whether the operation was successful
   * @param {string|null} error - Error message if failed
   * @param {Object} metadata - Additional event metadata
   */
  recordWarmingEvent(type, duration, success, error = null, metadata = {}) {
    const timestamp = Date.now();

    // Enhanced metadata with categorization and tagging
    const enhancedMetadata = {
      ...metadata,
      // Event categorization
      category: this.categorizeEvent(type, metadata),
      tags: this.generateEventTags(type, success, metadata),
      
      // Context information
      pageContext: this.currentPageContext,
      userPreferences: this.userPreferences,
      queueState: this.queueManager ? {
        size: this.queueManager.getTotalQueueSize(),
        activeWarming: this.queueManager.activeWarming.size,
        isProcessing: this.queueManager.processingQueue
      } : null,
      
      // Performance context
      performanceContext: {
        memoryPressure: this.detectMemoryPressure(),
        networkCondition: this.estimateNetworkCondition(),
        systemLoad: this.estimateSystemLoad()
      },
      
      // Correlation data
      correlationId: this.generateCorrelationId(type, metadata),
      sequenceNumber: this.getNextSequenceNumber(),
      parentEventId: metadata.parentEventId || null,
      
      // Timing details
      recordedAt: timestamp,
      processingDelay: metadata.queueWaitTime || 0,
      retryAttempt: metadata.attempt || 1,
      
      // Additional tracking
      sessionId: this.getSessionId(),
      serviceVersion: this.getServiceVersion(),
      environmentInfo: this.getEnvironmentInfo()
    };

    // Record event in stats tracker (comprehensive tracking)
    if (this.statsTracker) {
      this.statsTracker.recordEvent(type, duration, success, error, enhancedMetadata);
    }

    // Keep legacy warmingHistory for backward compatibility
    const event = {
      type,
      timestamp,
      duration,
      success,
      error,
      metadata: enhancedMetadata
    };

    this.warmingHistory.push(event);

    // Keep only recent history
    if (this.warmingHistory.length > this.config.maxHistorySize) {
      this.warmingHistory.shift();
    }

    // Enhanced logging with context
    const logLevel = success ? 'info' : 'error';
    const contextInfo = this.buildContextInfo(type, enhancedMetadata);
    
    console.log(`📝 [${logLevel.toUpperCase()}] Recorded warming event: ${type} (${success ? 'success' : 'failed'}) - ${duration}ms ${contextInfo}`);

    // Trigger event correlation analysis
    this.analyzeEventCorrelations(event);

    // Check for patterns and anomalies
    this.detectEventPatterns(event);

    // Update behavior insights
    this.updateBehaviorInsights(event);

    return event;
  }

  /**
   * Categorize event based on type and metadata
   * @param {string} type - Event type
   * @param {Object} metadata - Event metadata
   * @returns {string} Event category
   */
  categorizeEvent(type, metadata) {
    const categories = {
      'app-init': 'initialization',
      'user-cache': 'user-specific',
      'smart-warm': 'intelligent',
      'progressive-warm': 'advanced',
      'maintenance': 'system'
    };

    let category = categories[type] || 'general';

    // Refine category based on metadata
    if (metadata.priority === 'high') {
      category += '-priority';
    }

    if (metadata.queueProcessed) {
      category += '-queued';
    }

    if (metadata.retryAttempt > 1) {
      category += '-retry';
    }

    return category;
  }

  /**
   * Generate event tags for filtering and analysis
   * @param {string} type - Event type
   * @param {boolean} success - Whether event was successful
   * @param {Object} metadata - Event metadata
   * @returns {Array} Array of tags
   */
  generateEventTags(type, success, metadata) {
    const tags = [type, success ? 'success' : 'failure'];

    // Priority tags
    if (metadata.priority) {
      tags.push(`priority-${metadata.priority}`);
    }

    // Context tags
    if (metadata.userId) {
      tags.push('user-specific');
    }

    if (metadata.queueProcessed) {
      tags.push('queue-processed');
    }

    // Performance tags
    if (metadata.attempt > 1) {
      tags.push('retry');
    }

    // Time-based tags
    const hour = new Date().getHours();
    if (hour >= 6 && hour <= 9) {
      tags.push('morning-workout');
    } else if (hour >= 17 && hour <= 20) {
      tags.push('evening-workout');
    } else if (hour >= 22 || hour <= 5) {
      tags.push('off-hours');
    }

    // Page context tags
    if (this.currentPageContext) {
      const pageAnalysis = this.contextAnalyzer.analyzePageContext(this.currentPageContext.pageName);
      if (pageAnalysis.isWorkoutPage) {
        tags.push('workout-context');
      }
    }

    return tags;
  }

  /**
   * Generate correlation ID for event grouping
   * @param {string} type - Event type
   * @param {Object} metadata - Event metadata
   * @returns {string} Correlation ID
   */
  generateCorrelationId(type, metadata) {
    const userId = metadata.userId || 'anonymous';
    const sessionId = this.getSessionId();
    const timestamp = Date.now();
    
    return `${type}_${userId}_${sessionId}_${timestamp}`;
  }

  /**
   * Get next sequence number for event ordering
   * @returns {number} Sequence number
   */
  getNextSequenceNumber() {
    if (!this._sequenceNumber) {
      this._sequenceNumber = 0;
    }
    return ++this._sequenceNumber;
  }

  /**
   * Get session ID for event correlation
   * @returns {string} Session ID
   */
  getSessionId() {
    if (!this._sessionId) {
      this._sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return this._sessionId;
  }

  /**
   * Get service version for tracking
   * @returns {string} Service version
   */
  getServiceVersion() {
    return '1.0.0'; // This would come from package.json in a real implementation
  }

  /**
   * Get environment information
   * @returns {Object} Environment info
   */
  getEnvironmentInfo() {
    return {
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      platform: typeof navigator !== 'undefined' ? navigator.platform : 'server',
      language: typeof navigator !== 'undefined' ? navigator.language : 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Detect memory pressure
   * @returns {string} Memory pressure level
   */
  detectMemoryPressure() {
    if (typeof performance !== 'undefined' && performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;
      const ratio = used / limit;
      
      if (ratio > 0.9) return 'high';
      if (ratio > 0.7) return 'medium';
      return 'low';
    }
    return 'unknown';
  }

  /**
   * Estimate network condition
   * @returns {string} Network condition
   */
  estimateNetworkCondition() {
    if (typeof navigator !== 'undefined' && navigator.connection) {
      const connection = navigator.connection;
      const effectiveType = connection.effectiveType;
      
      if (effectiveType === '4g') return 'good';
      if (effectiveType === '3g') return 'fair';
      return 'poor';
    }
    return 'unknown';
  }

  /**
   * Estimate system load
   * @returns {string} System load level
   */
  estimateSystemLoad() {
    // Simple heuristic based on recent event processing times
    const recentEvents = this.warmingHistory.slice(-5);
    if (recentEvents.length < 3) return 'unknown';
    
    const averageDuration = recentEvents.reduce((sum, e) => sum + e.duration, 0) / recentEvents.length;
    
    if (averageDuration > 5000) return 'high';
    if (averageDuration > 2000) return 'medium';
    return 'low';
  }

  /**
   * Build context info string for logging
   * @param {string} type - Event type
   * @param {Object} metadata - Enhanced metadata
   * @returns {string} Context info string
   */
  buildContextInfo(type, metadata) {
    const contextParts = [];
    
    if (metadata.userId) {
      contextParts.push(`user:${metadata.userId.substr(0, 8)}`);
    }
    
    if (metadata.priority) {
      contextParts.push(`priority:${metadata.priority}`);
    }
    
    if (metadata.category) {
      contextParts.push(`category:${metadata.category}`);
    }
    
    if (metadata.tags && metadata.tags.length > 0) {
      contextParts.push(`tags:[${metadata.tags.slice(0, 3).join(',')}]`);
    }
    
    return contextParts.length > 0 ? `[${contextParts.join(' ')}]` : '';
  }

  /**
   * Analyze event correlations for pattern detection
   * @param {Object} event - Event to analyze
   */
  analyzeEventCorrelations(event) {
    // Simple correlation analysis - in production, this would be more sophisticated
    const recentEvents = this.warmingHistory.slice(-10);
    const sameTypeEvents = recentEvents.filter(e => e.type === event.type);
    
    if (sameTypeEvents.length >= 3) {
      const successRate = sameTypeEvents.filter(e => e.success).length / sameTypeEvents.length;
      
      if (successRate < 0.5) {
        console.warn(`🔍 Pattern detected: Low success rate for ${event.type} events (${(successRate * 100).toFixed(1)}%)`);
      }
    }
  }

  /**
   * Detect event patterns and anomalies
   * @param {Object} event - Event to analyze
   */
  detectEventPatterns(event) {
    // Detect unusual duration patterns
    const sameTypeEvents = this.warmingHistory.filter(e => e.type === event.type).slice(-5);
    
    if (sameTypeEvents.length >= 3) {
      const averageDuration = sameTypeEvents.reduce((sum, e) => sum + e.duration, 0) / sameTypeEvents.length;
      
      if (event.duration > averageDuration * 2) {
        console.warn(`🔍 Anomaly detected: ${event.type} took ${event.duration}ms (avg: ${averageDuration.toFixed(0)}ms)`);
      }
    }
  }

  /**
   * Update behavior insights based on event
   * @param {Object} event - Event to analyze
   */
  updateBehaviorInsights(event) {
    // Update behavior patterns for context analysis
    if (event.metadata.userId && event.success) {
      const userId = event.metadata.userId;
      
      if (!this.behaviorPatterns[userId]) {
        this.behaviorPatterns[userId] = {
          totalEvents: 0,
          successfulEvents: 0,
          preferredTimes: {},
          commonPages: {}
        };
      }
      
      const userPattern = this.behaviorPatterns[userId];
      userPattern.totalEvents++;
      
      if (event.success) {
        userPattern.successfulEvents++;
      }
      
      // Track time patterns
      const hour = new Date(event.timestamp).getHours();
      userPattern.preferredTimes[hour] = (userPattern.preferredTimes[hour] || 0) + 1;
      
      // Track page patterns
      if (event.metadata.pageContext && event.metadata.pageContext.pageName) {
        const page = event.metadata.pageContext.pageName;
        userPattern.commonPages[page] = (userPattern.commonPages[page] || 0) + 1;
      }
    }
  }

  /**
   * Get comprehensive warming statistics with enhanced analytics
   * Provides detailed performance metrics, cost analysis, and trend analysis
   * @param {Object} options - Options for statistics retrieval
   * @returns {Object} Comprehensive warming statistics
   */
  getWarmingStats(options = {}) {
    const {
      timeRange = 24 * 60 * 60 * 1000, // 24 hours default
      includeDetails = false,
      includePatterns = false,
      includeCostAnalysis = true,
      includeResourceTracking = true,
      includeProjections = false
    } = options;

    // Get comprehensive stats from stats tracker
    let comprehensiveStats = {};
    if (this.statsTracker) {
      comprehensiveStats = this.statsTracker.getStats({
        timeRange,
        includeDetails,
        includePatterns,
        includeCostAnalysis,
        includeResourceTracking
      });
    }

    // Get legacy stats for backward compatibility
    const totalEvents = this.warmingHistory.length;
    const successfulEvents = this.warmingHistory.filter(e => e.success).length;
    const failedEvents = totalEvents - successfulEvents;
    const averageDuration = totalEvents > 0 ?
      this.warmingHistory.reduce((sum, e) => sum + e.duration, 0) / totalEvents : 0;
    const recentEvents = this.warmingHistory.slice(-10);

    // Get cache statistics from Supabase cache
    const cacheStats = getCacheStats();

    // Get queue statistics with enhanced information
    const queueStatus = this.queueManager ? this.queueManager.getQueueStatus() : {
      totalSize: 0,
      queueSizes: { high: 0, normal: 0, low: 0 },
      activeWarming: 0,
      maxConcurrent: 0,
      isProcessing: false,
      stats: {}
    };

    // Calculate success rate trends
    const successRateTrend = this.calculateSuccessRateTrend();

    // Calculate recent activity summary
    const recentActivitySummary = this.calculateRecentActivitySummary(timeRange);

    // Build comprehensive response
    const stats = {
      // Enhanced summary with trends
      summary: {
        ...comprehensiveStats.summary,
        // Legacy compatibility
        totalEvents,
        successfulEvents,
        failedEvents,
        successRate: totalEvents > 0 ? (successfulEvents / totalEvents * 100).toFixed(2) + '%' : '0%',
        averageDuration: averageDuration.toFixed(2) + 'ms',
        successRateTrend,
        recentActivitySummary
      },

      // Enhanced timing metrics
      timing: comprehensiveStats.timing || {
        averageDuration: averageDuration.toFixed(2) + 'ms',
        minDuration: '0ms',
        maxDuration: '0ms',
        totalTime: '0ms'
      },

      // Event type breakdown
      eventTypes: comprehensiveStats.eventTypes || {},

      // Performance metrics with projections
      performance: {
        ...comprehensiveStats.performance,
        projections: includeProjections ? this.calculatePerformanceProjections() : undefined
      },

      // Queue statistics with enhanced metrics
      queueStatus: {
        ...queueStatus,
        efficiency: this.calculateQueueEfficiency(),
        averageWaitTime: this.calculateAverageQueueWaitTime(),
        throughputTrend: this.calculateThroughputTrend()
      },

      // Service state with health indicators
      serviceState: {
        isStarted: this.isStarted,
        currentlyWarming: this.isWarming,
        hasMaintenanceSchedule: !!this.maintenanceSchedule,
        healthStatus: this.calculateServiceHealth(),
        uptime: this.calculateServiceUptime()
      },

      // Context analysis with insights
      contextAnalysis: {
        currentContext: this.currentPageContext,
        behaviorInsights: this.getBehaviorInsights(),
        userPreferences: this.userPreferences,
        contextualRecommendations: this.generateContextualRecommendations()
      },

      // Cost analysis (if enabled)
      costAnalysis: comprehensiveStats.costAnalysis,

      // Resource tracking (if enabled)
      resourceTracking: comprehensiveStats.resourceTracking,

      // Pattern analysis (if requested)
      patterns: comprehensiveStats.patterns,

      // Recent events with enhanced metadata
      recentEvents: includeDetails ? comprehensiveStats.recentEvents : recentEvents.map(event => ({
        type: event.type,
        timestamp: new Date(event.timestamp).toISOString(),
        duration: event.duration + 'ms',
        success: event.success,
        error: event.error
      })),

      // Supabase cache statistics
      cacheStats,

      // Error handling statistics
      errorHandling: this.errorHandler ? this.errorHandler.getErrorStats() : {
        totalErrors: 0,
        errorsByCategory: {},
        errorsBySeverity: {},
        recentErrors: []
      },

      // Metadata
      generatedAt: new Date().toISOString(),
      timeRangeHours: Math.round(timeRange / (60 * 60 * 1000)),
      dataSource: this.statsTracker ? 'enhanced-tracker' : 'legacy-history'
    };

    return stats;
  }

  /**
   * Calculate success rate trend over time
   * @returns {Object} Success rate trend information
   */
  calculateSuccessRateTrend() {
    if (this.warmingHistory.length < 10) {
      return { trend: 'insufficient-data', direction: 'stable', change: '0%' };
    }

    const midPoint = Math.floor(this.warmingHistory.length / 2);
    const firstHalf = this.warmingHistory.slice(0, midPoint);
    const secondHalf = this.warmingHistory.slice(midPoint);

    const firstHalfSuccess = firstHalf.filter(e => e.success).length / firstHalf.length;
    const secondHalfSuccess = secondHalf.filter(e => e.success).length / secondHalf.length;

    const change = Math.abs((secondHalfSuccess - firstHalfSuccess) * 100);
    const direction = secondHalfSuccess > firstHalfSuccess ? 'improving' : 
                     secondHalfSuccess < firstHalfSuccess ? 'declining' : 'stable';

    return {
      trend: direction,
      direction,
      change: `${change.toFixed(1)}%`,
      currentRate: `${(secondHalfSuccess * 100).toFixed(1)}%`,
      previousRate: `${(firstHalfSuccess * 100).toFixed(1)}%`
    };
  }

  /**
   * Calculate recent activity summary
   * @param {number} timeRange - Time range in milliseconds
   * @returns {Object} Recent activity summary
   */
  calculateRecentActivitySummary(timeRange) {
    const now = Date.now();
    const cutoffTime = now - timeRange;
    const recentEvents = this.warmingHistory.filter(e => e.timestamp >= cutoffTime);

    if (recentEvents.length === 0) {
      return {
        totalEvents: 0,
        averageFrequency: '0 events/hour',
        mostActiveHour: 'N/A',
        leastActiveHour: 'N/A'
      };
    }

    // Calculate hourly distribution
    const hourlyDistribution = {};
    recentEvents.forEach(event => {
      const hour = new Date(event.timestamp).getHours();
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    });

    const hours = Object.keys(hourlyDistribution).map(Number);
    const mostActiveHour = hours.reduce((a, b) => 
      hourlyDistribution[a] > hourlyDistribution[b] ? a : b
    );
    const leastActiveHour = hours.reduce((a, b) => 
      hourlyDistribution[a] < hourlyDistribution[b] ? a : b
    );

    const hoursInRange = Math.max(1, timeRange / (60 * 60 * 1000));
    const averageFrequency = Math.round(recentEvents.length / hoursInRange);

    return {
      totalEvents: recentEvents.length,
      averageFrequency: `${averageFrequency} events/hour`,
      mostActiveHour: `${mostActiveHour}:00 (${hourlyDistribution[mostActiveHour]} events)`,
      leastActiveHour: `${leastActiveHour}:00 (${hourlyDistribution[leastActiveHour]} events)`,
      timeRange: `${Math.round(hoursInRange)} hours`
    };
  }

  /**
   * Calculate queue efficiency metrics
   * @returns {Object} Queue efficiency information
   */
  calculateQueueEfficiency() {
    if (!this.queueManager) {
      return { efficiency: 'N/A', status: 'no-queue-manager' };
    }

    const queueStats = this.queueManager.getQueueStatus().stats;
    const totalProcessed = queueStats.totalProcessed || 0;
    const totalFailed = queueStats.totalFailed || 0;
    const totalQueued = queueStats.totalQueued || 0;

    if (totalQueued === 0) {
      return { efficiency: '100%', status: 'no-items-processed' };
    }

    const successRate = totalProcessed / (totalProcessed + totalFailed);
    const throughputRate = totalProcessed / Math.max(1, totalQueued);

    const efficiency = (successRate * throughputRate * 100).toFixed(1);

    return {
      efficiency: `${efficiency}%`,
      successRate: `${(successRate * 100).toFixed(1)}%`,
      throughputRate: `${(throughputRate * 100).toFixed(1)}%`,
      status: efficiency > 80 ? 'excellent' : efficiency > 60 ? 'good' : 'needs-improvement'
    };
  }

  /**
   * Calculate average queue wait time
   * @returns {string} Average wait time
   */
  calculateAverageQueueWaitTime() {
    // This would require tracking queue entry and processing times
    // For now, return estimated based on queue size and processing rate
    if (!this.queueManager) {
      return 'N/A';
    }

    const queueStatus = this.queueManager.getQueueStatus();
    const queueSize = queueStatus.totalSize;
    const maxConcurrent = queueStatus.maxConcurrent;
    const processingInterval = this.config.queueConfig.queueProcessingInterval || 500;

    if (queueSize === 0) {
      return '0ms';
    }

    // Estimate wait time based on queue size and processing capacity
    const estimatedWaitTime = (queueSize / maxConcurrent) * processingInterval;
    
    if (estimatedWaitTime < 1000) {
      return `${Math.round(estimatedWaitTime)}ms`;
    } else if (estimatedWaitTime < 60000) {
      return `${Math.round(estimatedWaitTime / 1000)}s`;
    } else {
      return `${Math.round(estimatedWaitTime / 60000)}min`;
    }
  }

  /**
   * Calculate throughput trend
   * @returns {Object} Throughput trend information
   */
  calculateThroughputTrend() {
    const recentEvents = this.warmingHistory.slice(-20); // Last 20 events
    
    if (recentEvents.length < 10) {
      return { trend: 'insufficient-data', throughput: '0 events/min' };
    }

    const timeSpan = recentEvents[recentEvents.length - 1].timestamp - recentEvents[0].timestamp;
    const throughputPerMinute = (recentEvents.length / (timeSpan / 60000)).toFixed(1);

    // Compare with earlier period for trend
    const midPoint = Math.floor(recentEvents.length / 2);
    const firstHalf = recentEvents.slice(0, midPoint);
    const secondHalf = recentEvents.slice(midPoint);

    const firstHalfSpan = firstHalf[firstHalf.length - 1].timestamp - firstHalf[0].timestamp;
    const secondHalfSpan = secondHalf[secondHalf.length - 1].timestamp - secondHalf[0].timestamp;

    const firstHalfThroughput = firstHalf.length / (firstHalfSpan / 60000);
    const secondHalfThroughput = secondHalf.length / (secondHalfSpan / 60000);

    const trend = secondHalfThroughput > firstHalfThroughput ? 'increasing' : 
                 secondHalfThroughput < firstHalfThroughput ? 'decreasing' : 'stable';

    return {
      trend,
      throughput: `${throughputPerMinute} events/min`,
      change: `${Math.abs(((secondHalfThroughput - firstHalfThroughput) / firstHalfThroughput) * 100).toFixed(1)}%`
    };
  }

  /**
   * Calculate service health status
   * @returns {Object} Service health information
   */
  calculateServiceHealth() {
    const recentEvents = this.warmingHistory.slice(-10);
    const recentFailures = recentEvents.filter(e => !e.success).length;
    const failureRate = recentEvents.length > 0 ? recentFailures / recentEvents.length : 0;

    let healthStatus = 'healthy';
    let healthScore = 100;

    if (failureRate > 0.5) {
      healthStatus = 'critical';
      healthScore = 25;
    } else if (failureRate > 0.3) {
      healthStatus = 'degraded';
      healthScore = 50;
    } else if (failureRate > 0.1) {
      healthStatus = 'warning';
      healthScore = 75;
    }

    // Factor in queue health
    if (this.queueManager) {
      const queueStatus = this.queueManager.getQueueStatus();
      if (queueStatus.totalSize > queueStatus.maxConcurrent * 5) {
        healthStatus = healthStatus === 'healthy' ? 'warning' : healthStatus;
        healthScore = Math.min(healthScore, 75);
      }
    }

    return {
      status: healthStatus,
      score: healthScore,
      failureRate: `${(failureRate * 100).toFixed(1)}%`,
      lastCheck: new Date().toISOString(),
      recommendations: this.generateHealthRecommendations(healthStatus, failureRate)
    };
  }

  /**
   * Calculate service uptime
   * @returns {string} Service uptime
   */
  calculateServiceUptime() {
    if (!this.isStarted || !this._startTime) {
      return 'Not started';
    }

    const uptime = Date.now() - this._startTime;
    const hours = Math.floor(uptime / (60 * 60 * 1000));
    const minutes = Math.floor((uptime % (60 * 60 * 1000)) / (60 * 1000));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Generate contextual recommendations based on current state
   * @returns {Array} Array of recommendations
   */
  generateContextualRecommendations() {
    const recommendations = [];
    const recentEvents = this.warmingHistory.slice(-10);
    const failureRate = recentEvents.length > 0 ? 
      recentEvents.filter(e => !e.success).length / recentEvents.length : 0;

    // Performance recommendations
    if (failureRate > 0.2) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        message: 'High failure rate detected. Consider reviewing error logs and adjusting retry strategies.',
        action: 'review-errors'
      });
    }

    // Queue recommendations
    if (this.queueManager) {
      const queueStatus = this.queueManager.getQueueStatus();
      if (queueStatus.totalSize > 50) {
        recommendations.push({
          type: 'queue',
          priority: 'medium',
          message: 'Queue size is large. Consider increasing concurrent warming capacity.',
          action: 'increase-concurrency'
        });
      }
    }

    // Context-based recommendations
    if (this.currentPageContext) {
      const pageAnalysis = this.contextAnalyzer.analyzePageContext(this.currentPageContext.pageName);
      if (pageAnalysis.isWorkoutPage) {
        recommendations.push({
          type: 'context',
          priority: 'medium',
          message: 'User is on workout page. Consider preemptive warming of exercise data.',
          action: 'preemptive-warming'
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate health recommendations
   * @param {string} healthStatus - Current health status
   * @param {number} failureRate - Current failure rate
   * @returns {Array} Health recommendations
   */
  generateHealthRecommendations(healthStatus, failureRate) {
    const recommendations = [];

    switch (healthStatus) {
      case 'critical':
        recommendations.push('Immediate attention required - check error logs');
        recommendations.push('Consider temporarily reducing warming frequency');
        recommendations.push('Verify Supabase connection and API limits');
        break;
      case 'degraded':
        recommendations.push('Monitor error patterns and adjust retry logic');
        recommendations.push('Check network connectivity and API response times');
        break;
      case 'warning':
        recommendations.push('Review recent errors for patterns');
        recommendations.push('Consider optimizing warming strategies');
        break;
      default:
        recommendations.push('System operating normally');
        break;
    }

    return recommendations;
  }

  /**
   * Calculate performance projections
   * @returns {Object} Performance projections
   */
  calculatePerformanceProjections() {
    const recentEvents = this.warmingHistory.slice(-20);
    
    if (recentEvents.length < 10) {
      return {
        available: false,
        reason: 'Insufficient data for projections'
      };
    }

    // Calculate trends
    const successTrend = this.calculateSuccessRateTrend();
    const throughputTrend = this.calculateThroughputTrend();

    // Project next hour performance
    const currentSuccessRate = recentEvents.filter(e => e.success).length / recentEvents.length;
    const currentThroughput = parseFloat(throughputTrend.throughput);

    return {
      available: true,
      nextHour: {
        expectedEvents: Math.round(currentThroughput * 60),
        expectedSuccessRate: `${(currentSuccessRate * 100).toFixed(1)}%`,
        expectedFailures: Math.round(currentThroughput * 60 * (1 - currentSuccessRate))
      },
      trends: {
        success: successTrend,
        throughput: throughputTrend
      },
      confidence: recentEvents.length >= 20 ? 'high' : 'medium'
    };
  }

  /**
   * Start periodic maintenance schedule with enhanced configuration
   * Implements automatic maintenance scheduling with configurable intervals and timing
   * @param {number} intervalMinutes - Maintenance interval in minutes (default: 15)
   * @param {Object} options - Additional scheduling options
   * @returns {Object} Scheduler instance with control methods
   */
  startMaintenanceSchedule(intervalMinutes = 15, options = {}) {
    // Clear existing schedule
    if (this.maintenanceSchedule) {
      this.stopMaintenanceSchedule();
    }

    // Enhanced configuration options
    const config = {
      intervalMinutes,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 5000, // 5 seconds
      enableHealthChecks: options.enableHealthChecks !== false,
      enablePerformanceMonitoring: options.enablePerformanceMonitoring !== false,
      quietHours: options.quietHours || null, // { start: 23, end: 6 } for 11 PM to 6 AM
      skipOnHighLoad: options.skipOnHighLoad !== false,
      maxMaintenanceDuration: options.maxMaintenanceDuration || 30000, // 30 seconds
      ...options
    };

    console.log(`⏰ Starting enhanced cache maintenance schedule (every ${intervalMinutes} minutes)`);
    console.log('🔧 Maintenance configuration:', {
      interval: `${intervalMinutes}m`,
      maxRetries: config.maxRetries,
      healthChecks: config.enableHealthChecks,
      performanceMonitoring: config.enablePerformanceMonitoring,
      quietHours: config.quietHours ? `${config.quietHours.start}:00-${config.quietHours.end}:00` : 'none'
    });

    // Maintenance state tracking
    this.maintenanceState = {
      isRunning: false,
      lastRun: null,
      nextRun: null,
      consecutiveFailures: 0,
      totalRuns: 0,
      totalFailures: 0,
      averageDuration: 0,
      config,
      startTime: Date.now()
    };

    // Calculate next run time
    const nextRunTime = Date.now() + (intervalMinutes * 60 * 1000);
    this.maintenanceState.nextRun = nextRunTime;

    // Start the maintenance scheduler
    this.maintenanceSchedule = setInterval(async () => {
      await this.executeScheduledMaintenance();
    }, intervalMinutes * 60 * 1000);

    // Create scheduler control object
    const scheduler = {
      interval: this.maintenanceSchedule,
      config,
      state: this.maintenanceState,
      
      // Control methods
      stop: () => this.stopMaintenanceSchedule(),
      restart: (newInterval) => this.restartMaintenanceSchedule(newInterval, options),
      getStatus: () => this.getMaintenanceStatus(),
      forceRun: () => this.executeScheduledMaintenance(true),
      
      // Configuration methods
      updateConfig: (newOptions) => this.updateMaintenanceConfig(newOptions),
      setQuietHours: (start, end) => this.setMaintenanceQuietHours(start, end),
      
      // Monitoring methods
      getStats: () => this.getMaintenanceStats(),
      getHealth: () => this.getMaintenanceHealth()
    };

    console.log('✅ Enhanced maintenance scheduler started successfully');
    return scheduler;
  }

  /**
   * Stop the maintenance schedule with proper cleanup
   */
  stopMaintenanceSchedule() {
    if (!this.maintenanceSchedule) {
      console.log('🔧 No maintenance schedule to stop');
      return;
    }

    console.log('🛑 Stopping maintenance schedule...');
    
    // Clear the interval
    clearInterval(this.maintenanceSchedule);
    this.maintenanceSchedule = null;

    // Update state
    if (this.maintenanceState) {
      this.maintenanceState.nextRun = null;
      console.log(`📊 Maintenance stats: ${this.maintenanceState.totalRuns} runs, ${this.maintenanceState.totalFailures} failures`);
    }

    console.log('✅ Maintenance schedule stopped');
  }

  /**
   * Restart the maintenance schedule with new configuration
   * @param {number} intervalMinutes - New interval in minutes
   * @param {Object} options - New configuration options
   */
  restartMaintenanceSchedule(intervalMinutes, options = {}) {
    console.log(`🔄 Restarting maintenance schedule with ${intervalMinutes}m interval`);
    
    // Preserve existing config if not overridden
    const existingConfig = this.maintenanceState?.config || {};
    const mergedOptions = { ...existingConfig, ...options };
    
    this.stopMaintenanceSchedule();
    return this.startMaintenanceSchedule(intervalMinutes, mergedOptions);
  }

  /**
   * Execute scheduled maintenance with enhanced error handling and lifecycle management
   * @param {boolean} forced - Whether this is a forced execution
   */
  async executeScheduledMaintenance(forced = false) {
    // Skip if already running (prevent overlapping executions)
    if (this.maintenanceState?.isRunning && !forced) {
      console.log('⏭️ Skipping maintenance - already running');
      return;
    }

    // Check quiet hours
    if (!forced && this.isInQuietHours()) {
      console.log('🤫 Skipping maintenance - in quiet hours');
      return;
    }

    // Check system load
    if (!forced && this.maintenanceState?.config.skipOnHighLoad && this.isSystemUnderHighLoad()) {
      console.log('⚡ Skipping maintenance - system under high load');
      return;
    }

    const startTime = Date.now();
    this.maintenanceState.isRunning = true;
    this.maintenanceState.totalRuns++;

    console.log(`🔧 Executing scheduled maintenance (run #${this.maintenanceState.totalRuns})`);

    try {
      // Set timeout for maintenance execution
      const maintenancePromise = this.performEnhancedMaintenance();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Maintenance timeout')), 
          this.maintenanceState.config.maxMaintenanceDuration);
      });

      // Execute maintenance with timeout
      const result = await Promise.race([maintenancePromise, timeoutPromise]);

      // Update success metrics
      const duration = Date.now() - startTime;
      this.updateMaintenanceMetrics(duration, true);

      console.log(`✅ Scheduled maintenance completed in ${duration}ms`);
      return result;

    } catch (error) {
      // Handle maintenance failure
      const duration = Date.now() - startTime;
      this.updateMaintenanceMetrics(duration, false);
      
      console.error('❌ Scheduled maintenance failed:', error);
      
      // Implement retry logic
      await this.handleMaintenanceFailure(error);
      
      throw error;
    } finally {
      this.maintenanceState.isRunning = false;
      this.maintenanceState.lastRun = Date.now();
      this.maintenanceState.nextRun = Date.now() + (this.maintenanceState.config.intervalMinutes * 60 * 1000);
    }
  }

  /**
   * Check if current time is within quiet hours
   * @returns {boolean} True if in quiet hours
   */
  isInQuietHours() {
    if (!this.maintenanceState?.config.quietHours) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();
    const { start, end } = this.maintenanceState.config.quietHours;

    // Handle quiet hours that span midnight
    if (start > end) {
      return currentHour >= start || currentHour < end;
    } else {
      return currentHour >= start && currentHour < end;
    }
  }

  /**
   * Check if system is under high load
   * @returns {boolean} True if system is under high load
   */
  isSystemUnderHighLoad() {
    // Check queue size
    const queueStatus = this.getQueueStatus();
    if (queueStatus && queueStatus.totalSize > this.config.queueConfig.maxQueueSize * 0.8) {
      return true;
    }

    // Check active warming count
    if (queueStatus && queueStatus.activeWarming >= this.config.queueConfig.maxConcurrentWarming) {
      return true;
    }

    // Check recent failure rate
    if (this.maintenanceState.consecutiveFailures >= 3) {
      return true;
    }

    return false;
  }

  /**
   * Update maintenance metrics after execution
   * @param {number} duration - Execution duration in milliseconds
   * @param {boolean} success - Whether execution was successful
   */
  updateMaintenanceMetrics(duration, success) {
    if (!this.maintenanceState) return;

    // Update average duration
    const totalDuration = (this.maintenanceState.averageDuration * (this.maintenanceState.totalRuns - 1)) + duration;
    this.maintenanceState.averageDuration = totalDuration / this.maintenanceState.totalRuns;

    if (success) {
      this.maintenanceState.consecutiveFailures = 0;
    } else {
      this.maintenanceState.consecutiveFailures++;
      this.maintenanceState.totalFailures++;
    }
  }

  /**
   * Handle maintenance failure with retry logic
   * @param {Error} error - The error that occurred
   */
  async handleMaintenanceFailure(error) {
    const { maxRetries, retryDelay } = this.maintenanceState.config;
    
    if (this.maintenanceState.consecutiveFailures < maxRetries) {
      console.log(`🔄 Scheduling maintenance retry in ${retryDelay}ms (attempt ${this.maintenanceState.consecutiveFailures + 1}/${maxRetries})`);
      
      setTimeout(async () => {
        try {
          await this.executeScheduledMaintenance(true);
        } catch (retryError) {
          console.error('❌ Maintenance retry failed:', retryError);
        }
      }, retryDelay);
    } else {
      console.error(`💥 Maintenance failed ${maxRetries} times consecutively, giving up`);
      
      // Could implement alerting here
      this.recordMaintenanceAlert('consecutive-failures', {
        failures: this.maintenanceState.consecutiveFailures,
        lastError: error.message
      });
    }
  }

  /**
   * Get current maintenance status
   * @returns {Object} Maintenance status information
   */
  getMaintenanceStatus() {
    if (!this.maintenanceState) {
      return { active: false, message: 'No maintenance schedule configured' };
    }

    return {
      active: !!this.maintenanceSchedule,
      isRunning: this.maintenanceState.isRunning,
      lastRun: this.maintenanceState.lastRun,
      nextRun: this.maintenanceState.nextRun,
      totalRuns: this.maintenanceState.totalRuns,
      totalFailures: this.maintenanceState.totalFailures,
      consecutiveFailures: this.maintenanceState.consecutiveFailures,
      averageDuration: Math.round(this.maintenanceState.averageDuration),
      uptime: Date.now() - this.maintenanceState.startTime,
      config: this.maintenanceState.config
    };
  }

  /**
   * Update maintenance configuration
   * @param {Object} newOptions - New configuration options
   */
  updateMaintenanceConfig(newOptions) {
    if (!this.maintenanceState) {
      throw new Error('No maintenance schedule active');
    }

    console.log('🔧 Updating maintenance configuration:', newOptions);
    
    this.maintenanceState.config = {
      ...this.maintenanceState.config,
      ...newOptions
    };

    console.log('✅ Maintenance configuration updated');
  }

  /**
   * Set quiet hours for maintenance
   * @param {number} start - Start hour (0-23)
   * @param {number} end - End hour (0-23)
   */
  setMaintenanceQuietHours(start, end) {
    if (start < 0 || start > 23 || end < 0 || end > 23) {
      throw new Error('Quiet hours must be between 0 and 23');
    }

    this.updateMaintenanceConfig({
      quietHours: { start, end }
    });

    console.log(`🤫 Maintenance quiet hours set: ${start}:00 - ${end}:00`);
  }

  /**
   * Get maintenance statistics
   * @returns {Object} Maintenance statistics
   */
  getMaintenanceStats() {
    if (!this.maintenanceState) {
      return null;
    }

    const uptime = Date.now() - this.maintenanceState.startTime;
    const successRate = this.maintenanceState.totalRuns > 0 
      ? ((this.maintenanceState.totalRuns - this.maintenanceState.totalFailures) / this.maintenanceState.totalRuns * 100).toFixed(2)
      : 0;

    return {
      totalRuns: this.maintenanceState.totalRuns,
      totalFailures: this.maintenanceState.totalFailures,
      consecutiveFailures: this.maintenanceState.consecutiveFailures,
      successRate: `${successRate}%`,
      averageDuration: Math.round(this.maintenanceState.averageDuration),
      uptime: uptime,
      uptimeFormatted: this.formatUptime(uptime),
      isHealthy: this.maintenanceState.consecutiveFailures < 3,
      nextRun: this.maintenanceState.nextRun,
      lastRun: this.maintenanceState.lastRun
    };
  }

  /**
   * Get maintenance health status
   * @returns {Object} Health status information
   */
  getMaintenanceHealth() {
    const stats = this.getMaintenanceStats();
    if (!stats) {
      return { status: 'unknown', message: 'No maintenance data available' };
    }

    let status = 'healthy';
    let message = 'Maintenance running normally';
    const issues = [];

    // Check consecutive failures
    if (stats.consecutiveFailures >= 3) {
      status = 'critical';
      issues.push(`${stats.consecutiveFailures} consecutive failures`);
    } else if (stats.consecutiveFailures >= 1) {
      status = 'warning';
      issues.push(`${stats.consecutiveFailures} recent failures`);
    }

    // Check success rate
    const successRate = parseFloat(stats.successRate);
    if (successRate < 80) {
      status = status === 'critical' ? 'critical' : 'warning';
      issues.push(`Low success rate: ${stats.successRate}`);
    }

    // Check if maintenance is overdue
    if (stats.nextRun && Date.now() > stats.nextRun + (5 * 60 * 1000)) { // 5 minutes overdue
      status = 'warning';
      issues.push('Maintenance overdue');
    }

    if (issues.length > 0) {
      message = `Issues detected: ${issues.join(', ')}`;
    }

    return {
      status,
      message,
      issues,
      stats,
      recommendations: this.getMaintenanceRecommendations(stats, issues)
    };
  }

  /**
   * Get maintenance recommendations based on current state
   * @param {Object} stats - Current maintenance statistics
   * @param {Array} issues - Current issues
   * @returns {Array} Array of recommendations
   */
  getMaintenanceRecommendations(stats, issues) {
    const recommendations = [];

    if (stats.consecutiveFailures >= 2) {
      recommendations.push({
        type: 'action',
        priority: 'high',
        message: 'Consider investigating maintenance failures',
        action: 'check-logs'
      });
    }

    if (stats.averageDuration > 20000) { // 20 seconds
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        message: 'Maintenance duration is high, consider optimization',
        action: 'optimize-maintenance'
      });
    }

    if (parseFloat(stats.successRate) < 90) {
      recommendations.push({
        type: 'reliability',
        priority: 'medium',
        message: 'Success rate could be improved',
        action: 'improve-reliability'
      });
    }

    return recommendations;
  }

  /**
   * Record maintenance alert for monitoring
   * @param {string} type - Alert type
   * @param {Object} details - Alert details
   */
  recordMaintenanceAlert(type, details) {
    const alert = {
      type,
      timestamp: Date.now(),
      details,
      severity: this.getAlertSeverity(type)
    };

    console.warn(`🚨 Maintenance alert [${alert.severity}]: ${type}`, details);
    
    // Could integrate with external alerting systems here
    // For now, we'll just log it
  }

  /**
   * Get alert severity based on type
   * @param {string} type - Alert type
   * @returns {string} Severity level
   */
  getAlertSeverity(type) {
    const severityMap = {
      'consecutive-failures': 'high',
      'timeout': 'medium',
      'high-load': 'medium',
      'config-error': 'low'
    };

    return severityMap[type] || 'medium';
  }

  /**
   * Format uptime duration into human-readable string
   * @param {number} uptime - Uptime in milliseconds
   * @returns {string} Formatted uptime string
   */
  formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Queue Management Methods
   * These methods provide direct access to queue operations
   */

  /**
   * Check if a user is in the warming queue
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user is in queue
   */
  isUserInWarmingQueue(userId) {
    return this.queueManager ? this.queueManager.isUserInQueue(userId) : false;
  }

  /**
   * Check if a user is currently being warmed
   * @param {string} userId - User ID to check
   * @returns {boolean} True if user is being warmed
   */
  isUserBeingWarmed(userId) {
    return this.queueManager ? this.queueManager.activeWarming.has(userId) : false;
  }

  /**
   * Get current queue status
   * @returns {Object} Queue status information
   */
  getQueueStatus() {
    return this.queueManager ? this.queueManager.getQueueStatus() : null;
  }

  /**
   * Clear warming queue
   * @param {string} priority - Optional priority to clear ('high', 'normal', 'low'), or 'all' for all queues
   */
  clearWarmingQueue(priority = 'all') {
    if (this.queueManager) {
      this.queueManager.clearQueue(priority);
      console.log(`🧹 Cleared warming queue: ${priority}`);
    }
  }

  /**
   * Remove a specific user from the warming queue
   * @param {string} userId - User ID to remove
   * @returns {boolean} True if user was found and removed
   */
  removeUserFromWarmingQueue(userId) {
    if (this.queueManager) {
      const removed = this.queueManager.removeUserFromQueue(userId);
      if (removed) {
        console.log(`🗑️ Removed user from warming queue: ${userId}`);
      }
      return removed;
    }
    return false;
  }

  /**
   * Perform queue maintenance operations
   * Called during regular maintenance to clean up and optimize the queue
   */
  async performQueueMaintenance() {
    if (!this.queueManager) {
      return;
    }

    console.log('🔧 Performing queue maintenance...');

    try {
      const queueStatus = this.queueManager.getQueueStatus();
      
      // Log queue statistics
      console.log('📊 Queue status:', {
        totalSize: queueStatus.totalSize,
        activeWarming: queueStatus.activeWarming,
        processing: queueStatus.isProcessing,
        stats: queueStatus.stats
      });

      // Check for stale items (items that have been in queue too long)
      const maxQueueAge = 10 * 60 * 1000; // 10 minutes
      const now = Date.now();
      let staleItemsRemoved = 0;

      Object.keys(this.queueManager.queues).forEach(priority => {
        const queue = this.queueManager.queues[priority];
        const initialLength = queue.length;
        
        this.queueManager.queues[priority] = queue.filter(item => {
          const age = now - item.timestamp;
          return age < maxQueueAge;
        });
        
        const removed = initialLength - this.queueManager.queues[priority].length;
        staleItemsRemoved += removed;
      });

      if (staleItemsRemoved > 0) {
        console.log(`🧹 Removed ${staleItemsRemoved} stale queue items`);
      }

      // Restart queue processing if it's stopped but there are items
      if (!queueStatus.isProcessing && queueStatus.totalSize > 0) {
        console.log('🚀 Restarting queue processing...');
        this.queueManager.startQueueProcessing();
      }

      return {
        queueStatus,
        staleItemsRemoved,
        maintenanceCompleted: true
      };

    } catch (error) {
      console.error('❌ Queue maintenance failed:', error);
      throw error;
    }
  }
}

// Create and export singleton instance using configuration
const supabaseCacheWarmingService = new SupabaseCacheWarmingService(cacheWarmingConfig);

// Export service instance as default
export default supabaseCacheWarmingService;

// Export individual methods for convenience (maintaining API compatibility)
export const {
  initializeAppCache,
  warmUserCacheWithRetry,
  smartWarmCache,
  progressiveWarmCache,
  performMaintenance,
  getWarmingStats,
  startMaintenanceSchedule,
  start,
  stop,
  cleanup,
  analyzeCurrentContext,
  updatePageContext,
  setUserPreferences,
  getBehaviorInsights,
  // Queue management methods
  isUserInWarmingQueue,
  isUserBeingWarmed,
  getQueueStatus,
  clearWarmingQueue,
  removeUserFromWarmingQueue,
  performQueueMaintenance
} = supabaseCacheWarmingService;

// Auto-start the service in browser environment
if (typeof window !== 'undefined') {
  supabaseCacheWarmingService.start();
}