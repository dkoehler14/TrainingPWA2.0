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

/**
 * Context Analysis System
 * Analyzes user behavior patterns and environmental factors to determine
 * optimal cache warming strategies and priorities
 */
class ContextAnalyzer {
  /**
   * Analyze time-of-day patterns for workout hours
   * @param {Date} date - Date to analyze (defaults to current time)
   * @returns {Object} Time analysis with priority and context
   */
  static analyzeTimeOfDay(date = new Date()) {
    const hour = date.getHours();
    
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
   * @returns {Object} Day analysis with priority and context
   */
  static analyzeWorkoutDay(date = new Date()) {
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
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
   * @returns {Object} Combined priority analysis
   */
  static determinePriority(options = {}) {
    const {
      date = new Date(),
      pageName = null,
      previousPage = null,
      userPreferences = {},
      behaviorPatterns = {}
    } = options;
    
    // Analyze individual context factors
    const timeAnalysis = this.analyzeTimeOfDay(date);
    const dayAnalysis = this.analyzeWorkoutDay(date);
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
      ...options
    };

    // Service state
    this.isWarming = false;
    this.warmingQueue = new Set();
    this.warmingHistory = [];
    this.maintenanceSchedule = null;
    this.isStarted = false;
    
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

    // Clear warming queue
    this.warmingQueue.clear();
    this.isWarming = false;
    this.isStarted = false;

    console.log('✅ Supabase cache warming service stopped successfully');
  }

  /**
   * Cleanup service resources
   * Performs final cleanup and resets state
   */
  cleanup() {
    console.log('🧹 Cleaning up cache warming service...');

    // Stop the service first
    this.stop();

    // Clear history
    this.warmingHistory = [];

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

    this.isWarming = true;
    const startTime = Date.now();

    try {
      console.log('🚀 Initializing app cache warming...');

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

      return { success: true, duration };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ App cache initialization failed:', error);
      this.recordWarmingEvent('app-init', duration, false, error.message);
      throw error;
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warm user cache with retry logic and exponential backoff
   */
  async warmUserCacheWithRetry(userId, priority = 'normal', maxRetries = null) {
    if (!userId) {
      throw new Error('User ID is required for cache warming');
    }

    if (this.warmingQueue.has(userId)) {
      console.log(`🔥 User cache warming already queued for: ${userId}`);
      return;
    }

    const retries = maxRetries || this.config.maxRetries;
    this.warmingQueue.add(userId);
    const startTime = Date.now();
    let attempt = 0;

    while (attempt < retries) {
      try {
        console.log(`🔥 Warming user cache (attempt ${attempt + 1}/${retries}): ${userId} (priority: ${priority})`);

        // Use Supabase cache warming function
        const result = await warmUserCache(userId, priority);
        const duration = Date.now() - startTime;

        console.log(`✅ User cache warming completed in ${duration}ms:`, result);
        this.recordWarmingEvent('user-cache', duration, true, null, { userId, priority, result });

        this.warmingQueue.delete(userId);
        return result;

      } catch (error) {
        attempt++;
        console.error(`❌ User cache warming attempt ${attempt} failed:`, error);

        if (attempt >= retries) {
          const duration = Date.now() - startTime;
          this.recordWarmingEvent('user-cache', duration, false, error.message, { userId, priority });
          this.warmingQueue.delete(userId);
          throw error;
        }

        // Exponential backoff delay
        const delay = this.config.retryDelays[attempt - 1] || Math.pow(2, attempt) * 1000;
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Smart cache warming based on user behavior context
   * Analyzes current context and applies intelligent warming strategies
   * @param {string} userId - User ID to warm cache for
   * @param {Object} context - Additional context information
   * @param {Object} options - Warming options
   * @returns {Promise<Object>} Warming result with analysis
   */
  async smartWarmCache(userId, context = {}, options = {}) {
    if (!userId) {
      throw new Error('User ID is required for smart cache warming');
    }

    const startTime = Date.now();
    console.log(`🧠 Starting smart cache warming for user: ${userId}`);

    try {
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

      // Determine warming approach based on context
      let warmingResult;
      const warmingMetadata = {
        userId,
        contextAnalysis,
        originalContext: context,
        smartDecisions: []
      };

      // Apply context-based warming strategy
      switch (contextAnalysis.warmingStrategy) {
        case 'progressive':
          console.log('📈 Applying progressive warming strategy');
          warmingMetadata.smartDecisions.push('progressive-strategy-selected');
          warmingResult = await this.warmUserCacheWithRetry(
            userId, 
            contextAnalysis.finalPriority, 
            options.maxRetries
          );
          break;

        case 'targeted':
          console.log('🎯 Applying targeted warming strategy');
          warmingMetadata.smartDecisions.push('targeted-strategy-selected');
          
          // For targeted warming, we warm with normal priority but add context
          warmingResult = await this.warmUserCacheWithRetry(
            userId, 
            contextAnalysis.finalPriority, 
            options.maxRetries
          );
          break;

        case 'basic':
        default:
          console.log('📊 Applying basic warming strategy');
          warmingMetadata.smartDecisions.push('basic-strategy-selected');
          
          // Basic warming with determined priority
          warmingResult = await this.warmUserCacheWithRetry(
            userId, 
            contextAnalysis.finalPriority, 
            options.maxRetries
          );
          break;
      }

      // Apply context-based optimizations
      await this.applyContextOptimizations(userId, contextAnalysis, warmingMetadata);

      // Calculate total duration
      const totalDuration = Date.now() - startTime;
      
      // Record smart warming event
      this.recordWarmingEvent('smart-warm', totalDuration, true, null, warmingMetadata);

      console.log(`✅ Smart cache warming completed in ${totalDuration}ms`);

      return {
        success: true,
        duration: totalDuration,
        contextAnalysis,
        warmingResult,
        smartDecisions: warmingMetadata.smartDecisions,
        recommendations: contextAnalysis.recommendations
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Smart cache warming failed:', error);
      
      this.recordWarmingEvent('smart-warm', duration, false, error.message, {
        userId,
        context,
        error: error.message
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
   * @param {string} userId - User ID to warm cache for
   * @param {Object} options - Progressive warming options
   * @returns {Promise<Object>} Progressive warming results
   */
  async progressiveWarmCache(userId, options = {}) {
    if (!userId) {
      throw new Error('User ID is required for progressive cache warming');
    }

    const startTime = Date.now();
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

    const results = {
      userId,
      startTime,
      phases: {},
      totalDuration: 0,
      successfulPhases: 0,
      failedPhases: 0,
      overallSuccess: false,
      errors: []
    };

    try {
      // Analyze context for progressive warming optimization
      const contextAnalysis = this.analyzeCurrentContext();
      console.log('🎯 Progressive warming context:', {
        priority: contextAnalysis.finalPriority,
        strategy: contextAnalysis.warmingStrategy
      });

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
          contextAnalysis: contextAnalysis.finalPriority
        });

      console.log(`✅ Progressive cache warming completed in ${results.totalDuration}ms`);
      console.log(`📊 Results: ${results.successfulPhases}/${Object.keys(phaseConfig).length} phases successful`);

      return results;

    } catch (error) {
      results.totalDuration = Date.now() - startTime;
      results.overallSuccess = false;
      results.errors.push(error.message);

      console.error('❌ Progressive cache warming failed:', error);
      
      this.recordWarmingEvent('progressive-warm', results.totalDuration, false, error.message, {
        userId,
        phases: Object.keys(results.phases),
        error: error.message
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

      // Parse hit rate and trigger warming if low
      const hitRate = parseFloat(stats.hitRate);
      if (hitRate < 70) {
        console.log(`⚠️ Low cache hit rate (${hitRate}%), considering additional warming`);

        const currentUser = authService.getCurrentUser();
        if (currentUser) {
          await this.warmUserCacheWithRetry(currentUser.id, 'normal');
        }
      }

      // Clean up old warming history
      if (this.warmingHistory.length > this.config.maxHistorySize) {
        const removed = this.warmingHistory.length - this.config.maxHistorySize;
        this.warmingHistory = this.warmingHistory.slice(-this.config.maxHistorySize);
        console.log(`🧹 Cleaned up ${removed} old warming history entries`);
      }

      return stats;

    } catch (error) {
      console.error('❌ Cache maintenance failed:', error);
      throw error;
    }
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
   * Record warming events for analytics and monitoring
   */
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
    if (this.warmingHistory.length > this.config.maxHistorySize) {
      this.warmingHistory.shift();
    }

    console.log(`📝 Recorded warming event: ${type} (${success ? 'success' : 'failed'}) - ${duration}ms`);
  }

  /**
   * Get comprehensive warming statistics
   */
  getWarmingStats() {
    const totalEvents = this.warmingHistory.length;
    const successfulEvents = this.warmingHistory.filter(e => e.success).length;
    const failedEvents = totalEvents - successfulEvents;

    const averageDuration = totalEvents > 0 ?
      this.warmingHistory.reduce((sum, e) => sum + e.duration, 0) / totalEvents : 0;

    const recentEvents = this.warmingHistory.slice(-10);

    // Get cache statistics from Supabase cache
    const cacheStats = getCacheStats();

    return {
      // Warming service statistics
      totalEvents,
      successfulEvents,
      failedEvents,
      successRate: totalEvents > 0 ? (successfulEvents / totalEvents * 100).toFixed(2) + '%' : '0%',
      averageDuration: averageDuration.toFixed(2) + 'ms',
      recentEvents,
      currentlyWarming: this.isWarming,
      queueSize: this.warmingQueue.size,
      
      // Service state
      isStarted: this.isStarted,
      hasMaintenanceSchedule: !!this.maintenanceSchedule,
      
      // Context analysis
      currentContext: this.currentPageContext,
      behaviorInsights: this.getBehaviorInsights(),
      userPreferences: this.userPreferences,
      
      // Supabase cache statistics
      cacheStats
    };
  }

  /**
   * Start periodic maintenance schedule
   */
  startMaintenanceSchedule(intervalMinutes = 15) {
    // Clear existing schedule
    if (this.maintenanceSchedule) {
      clearInterval(this.maintenanceSchedule);
    }

    console.log(`⏰ Starting cache maintenance schedule (every ${intervalMinutes} minutes)`);

    this.maintenanceSchedule = setInterval(async () => {
      try {
        await this.performMaintenance();
      } catch (error) {
        console.error('❌ Scheduled maintenance failed:', error);
      }
    }, intervalMinutes * 60 * 1000);

    return this.maintenanceSchedule;
  }
}

// Create and export singleton instance
const supabaseCacheWarmingService = new SupabaseCacheWarmingService();

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
  getBehaviorInsights
} = supabaseCacheWarmingService;

// Auto-start the service in browser environment
if (typeof window !== 'undefined') {
  supabaseCacheWarmingService.start();
}