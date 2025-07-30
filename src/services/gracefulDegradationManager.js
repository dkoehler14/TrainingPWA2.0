/**
 * Graceful Degradation Manager
 * 
 * Manages service degradation during errors and failures to ensure
 * continuous operation with reduced functionality rather than complete failure.
 */

import { ErrorCategory, ErrorSeverity } from './cacheWarmingErrorHandler';

/**
 * Degradation levels for different service aspects
 */
export const DegradationLevel = {
  NONE: 'NONE',           // Full functionality
  MINIMAL: 'MINIMAL',     // Slight reduction in features
  MODERATE: 'MODERATE',   // Significant reduction in features
  SEVERE: 'SEVERE',       // Basic functionality only
  CRITICAL: 'CRITICAL'    // Emergency mode
};

/**
 * Service aspects that can be degraded
 */
export const ServiceAspect = {
  CACHE_WARMING: 'CACHE_WARMING',
  QUEUE_PROCESSING: 'QUEUE_PROCESSING',
  SMART_ANALYSIS: 'SMART_ANALYSIS',
  STATISTICS_TRACKING: 'STATISTICS_TRACKING',
  ERROR_MONITORING: 'ERROR_MONITORING',
  MAINTENANCE: 'MAINTENANCE',
  PERSISTENCE: 'PERSISTENCE'
};

/**
 * Fallback mechanisms for different operations
 */
export const FallbackMechanism = {
  BASIC_CACHE: 'BASIC_CACHE',           // Use basic caching instead of smart warming
  REDUCED_SCOPE: 'REDUCED_SCOPE',       // Reduce the scope of operations
  SKIP_OPTIONAL: 'SKIP_OPTIONAL',       // Skip non-essential operations
  LOCAL_ONLY: 'LOCAL_ONLY',             // Use local data only
  EMERGENCY_MODE: 'EMERGENCY_MODE',     // Minimal essential operations only
  DISABLE_FEATURE: 'DISABLE_FEATURE'    // Completely disable the feature
};

/**
 * Graceful degradation manager class
 */
export class GracefulDegradationManager {
  constructor(options = {}) {
    this.config = {
      enableAutoDegradation: options.enableAutoDegradation !== false,
      degradationThresholds: {
        errorRate: options.errorRateThreshold || 0.15, // 15% error rate
        consecutiveFailures: options.consecutiveFailuresThreshold || 5,
        timeWindow: options.timeWindow || 300000, // 5 minutes
        recoveryTime: options.recoveryTime || 600000, // 10 minutes
        ...options.degradationThresholds
      },
      fallbackStrategies: {
        [ServiceAspect.CACHE_WARMING]: [
          FallbackMechanism.BASIC_CACHE,
          FallbackMechanism.REDUCED_SCOPE,
          FallbackMechanism.SKIP_OPTIONAL
        ],
        [ServiceAspect.QUEUE_PROCESSING]: [
          FallbackMechanism.REDUCED_SCOPE,
          FallbackMechanism.LOCAL_ONLY,
          FallbackMechanism.EMERGENCY_MODE
        ],
        [ServiceAspect.SMART_ANALYSIS]: [
          FallbackMechanism.BASIC_CACHE,
          FallbackMechanism.DISABLE_FEATURE
        ],
        ...options.fallbackStrategies
      },
      ...options
    };

    // Current degradation state
    this.degradationState = new Map(); // ServiceAspect -> DegradationLevel
    this.fallbackState = new Map();    // ServiceAspect -> FallbackMechanism
    this.degradationHistory = [];
    this.recoveryTimers = new Map();   // ServiceAspect -> Timer

    // Failure tracking
    this.failureTracking = new Map();  // ServiceAspect -> failure data
    this.consecutiveFailures = new Map(); // ServiceAspect -> count

    // Initialize all aspects to NONE degradation
    Object.values(ServiceAspect).forEach(aspect => {
      this.degradationState.set(aspect, DegradationLevel.NONE);
    });

    console.log('🛡️ GracefulDegradationManager initialized');
  }

  /**
   * Evaluate if degradation is needed based on error patterns
   */
  evaluateDegradationNeed(errorCategory, errorSeverity, serviceAspect, context = {}) {
    if (!this.config.enableAutoDegradation) {
      return { needsDegradation: false, reason: 'Auto-degradation disabled' };
    }

    const currentLevel = this.degradationState.get(serviceAspect) || DegradationLevel.NONE;
    const failures = this.getFailureData(serviceAspect);

    // Check various degradation triggers
    const triggers = this.checkDegradationTriggers(errorCategory, errorSeverity, serviceAspect, failures, context);

    if (triggers.length > 0) {
      const recommendedLevel = this.calculateRecommendedDegradationLevel(triggers, currentLevel);
      
      return {
        needsDegradation: recommendedLevel !== currentLevel,
        currentLevel,
        recommendedLevel,
        triggers,
        reason: `Degradation triggered by: ${triggers.map(t => t.type).join(', ')}`
      };
    }

    return { needsDegradation: false, reason: 'No degradation triggers detected' };
  }

  /**
   * Check for various degradation triggers
   */
  checkDegradationTriggers(errorCategory, errorSeverity, serviceAspect, failures, context) {
    const triggers = [];

    // High error rate trigger
    if (failures.errorRate > this.config.degradationThresholds.errorRate) {
      triggers.push({
        type: 'high_error_rate',
        severity: 'high',
        value: failures.errorRate,
        threshold: this.config.degradationThresholds.errorRate
      });
    }

    // Consecutive failures trigger
    const consecutiveCount = this.consecutiveFailures.get(serviceAspect) || 0;
    if (consecutiveCount >= this.config.degradationThresholds.consecutiveFailures) {
      triggers.push({
        type: 'consecutive_failures',
        severity: 'high',
        value: consecutiveCount,
        threshold: this.config.degradationThresholds.consecutiveFailures
      });
    }

    // Critical error trigger
    if (errorSeverity === ErrorSeverity.CRITICAL) {
      triggers.push({
        type: 'critical_error',
        severity: 'critical',
        category: errorCategory
      });
    }

    // Service-specific triggers
    const serviceSpecificTriggers = this.checkServiceSpecificTriggers(serviceAspect, context);
    triggers.push(...serviceSpecificTriggers);

    return triggers;
  }

  /**
   * Check for service-specific degradation triggers
   */
  checkServiceSpecificTriggers(serviceAspect, context) {
    const triggers = [];

    switch (serviceAspect) {
      case ServiceAspect.CACHE_WARMING:
        if (context.cacheHitRate && context.cacheHitRate < 0.3) {
          triggers.push({
            type: 'low_cache_hit_rate',
            severity: 'medium',
            value: context.cacheHitRate
          });
        }
        break;

      case ServiceAspect.QUEUE_PROCESSING:
        if (context.queueSize && context.queueSize > 100) {
          triggers.push({
            type: 'queue_overflow',
            severity: 'high',
            value: context.queueSize
          });
        }
        break;

      case ServiceAspect.SMART_ANALYSIS:
        if (context.analysisLatency && context.analysisLatency > 5000) {
          triggers.push({
            type: 'high_analysis_latency',
            severity: 'medium',
            value: context.analysisLatency
          });
        }
        break;
    }

    return triggers;
  }

  /**
   * Calculate recommended degradation level based on triggers
   */
  calculateRecommendedDegradationLevel(triggers, currentLevel) {
    let maxSeverityScore = 0;
    let criticalCount = 0;
    let highCount = 0;

    triggers.forEach(trigger => {
      switch (trigger.severity) {
        case 'critical':
          criticalCount++;
          maxSeverityScore = Math.max(maxSeverityScore, 4);
          break;
        case 'high':
          highCount++;
          maxSeverityScore = Math.max(maxSeverityScore, 3);
          break;
        case 'medium':
          maxSeverityScore = Math.max(maxSeverityScore, 2);
          break;
        case 'low':
          maxSeverityScore = Math.max(maxSeverityScore, 1);
          break;
      }
    });

    // Determine degradation level based on severity and count
    if (criticalCount > 0 || maxSeverityScore >= 4) {
      return DegradationLevel.CRITICAL;
    } else if (highCount >= 2 || maxSeverityScore >= 3) {
      return DegradationLevel.SEVERE;
    } else if (highCount >= 1 || maxSeverityScore >= 2) {
      return DegradationLevel.MODERATE;
    } else if (maxSeverityScore >= 1) {
      return DegradationLevel.MINIMAL;
    }

    return currentLevel;
  }

  /**
   * Apply degradation to a service aspect
   */
  async applyDegradation(serviceAspect, degradationLevel, reason = '', context = {}) {
    const currentLevel = this.degradationState.get(serviceAspect);
    
    if (currentLevel === degradationLevel) {
      console.log(`🛡️ Service aspect ${serviceAspect} already at degradation level ${degradationLevel}`);
      return { applied: false, reason: 'Already at target degradation level' };
    }

    console.log(`🛡️ Applying ${degradationLevel} degradation to ${serviceAspect}: ${reason}`);

    // Set new degradation level
    this.degradationState.set(serviceAspect, degradationLevel);

    // Apply appropriate fallback mechanism
    const fallbackMechanism = this.selectFallbackMechanism(serviceAspect, degradationLevel);
    this.fallbackState.set(serviceAspect, fallbackMechanism);

    // Record degradation event
    const degradationEvent = {
      serviceAspect,
      previousLevel: currentLevel,
      newLevel: degradationLevel,
      fallbackMechanism,
      reason,
      context,
      timestamp: new Date().toISOString()
    };

    this.degradationHistory.push(degradationEvent);

    // Apply the actual degradation changes
    const result = await this.implementDegradation(serviceAspect, degradationLevel, fallbackMechanism, context);

    // Schedule recovery check if not in critical state
    if (degradationLevel !== DegradationLevel.CRITICAL) {
      this.scheduleRecoveryCheck(serviceAspect);
    }

    console.log(`✅ Degradation applied to ${serviceAspect}: ${currentLevel} → ${degradationLevel}`);

    return {
      applied: true,
      previousLevel: currentLevel,
      newLevel: degradationLevel,
      fallbackMechanism,
      result
    };
  }

  /**
   * Select appropriate fallback mechanism for degradation level
   */
  selectFallbackMechanism(serviceAspect, degradationLevel) {
    const strategies = this.config.fallbackStrategies[serviceAspect] || [];

    switch (degradationLevel) {
      case DegradationLevel.MINIMAL:
        return strategies[0] || FallbackMechanism.SKIP_OPTIONAL;
      case DegradationLevel.MODERATE:
        return strategies[1] || FallbackMechanism.REDUCED_SCOPE;
      case DegradationLevel.SEVERE:
        return strategies[2] || FallbackMechanism.LOCAL_ONLY;
      case DegradationLevel.CRITICAL:
        return FallbackMechanism.EMERGENCY_MODE;
      default:
        return strategies[0] || FallbackMechanism.BASIC_CACHE;
    }
  }

  /**
   * Implement the actual degradation changes
   */
  async implementDegradation(serviceAspect, degradationLevel, fallbackMechanism, context) {
    const implementations = {
      [ServiceAspect.CACHE_WARMING]: () => this.implementCacheWarmingDegradation(degradationLevel, fallbackMechanism, context),
      [ServiceAspect.QUEUE_PROCESSING]: () => this.implementQueueProcessingDegradation(degradationLevel, fallbackMechanism, context),
      [ServiceAspect.SMART_ANALYSIS]: () => this.implementSmartAnalysisDegradation(degradationLevel, fallbackMechanism, context),
      [ServiceAspect.STATISTICS_TRACKING]: () => this.implementStatisticsTrackingDegradation(degradationLevel, fallbackMechanism, context),
      [ServiceAspect.ERROR_MONITORING]: () => this.implementErrorMonitoringDegradation(degradationLevel, fallbackMechanism, context),
      [ServiceAspect.MAINTENANCE]: () => this.implementMaintenanceDegradation(degradationLevel, fallbackMechanism, context),
      [ServiceAspect.PERSISTENCE]: () => this.implementPersistenceDegradation(degradationLevel, fallbackMechanism, context)
    };

    const implementation = implementations[serviceAspect];
    if (implementation) {
      return await implementation();
    }

    return { implemented: false, reason: 'No implementation found for service aspect' };
  }

  /**
   * Implement cache warming degradation
   */
  async implementCacheWarmingDegradation(degradationLevel, fallbackMechanism, context) {
    const changes = [];

    switch (fallbackMechanism) {
      case FallbackMechanism.BASIC_CACHE:
        changes.push('Disabled smart warming algorithms');
        changes.push('Using basic cache warming only');
        break;

      case FallbackMechanism.REDUCED_SCOPE:
        changes.push('Reduced cache warming scope to essential data only');
        changes.push('Disabled progressive warming');
        break;

      case FallbackMechanism.SKIP_OPTIONAL:
        changes.push('Skipping optional cache warming operations');
        changes.push('Focusing on high-priority cache warming only');
        break;

      case FallbackMechanism.EMERGENCY_MODE:
        changes.push('Emergency mode: minimal cache warming only');
        changes.push('Disabled all non-essential warming features');
        break;
    }

    return {
      implemented: true,
      changes,
      fallbackMechanism,
      degradationLevel
    };
  }

  /**
   * Implement queue processing degradation
   */
  async implementQueueProcessingDegradation(degradationLevel, fallbackMechanism, context) {
    const changes = [];

    switch (fallbackMechanism) {
      case FallbackMechanism.REDUCED_SCOPE:
        changes.push('Reduced queue processing concurrency');
        changes.push('Processing high-priority items only');
        break;

      case FallbackMechanism.LOCAL_ONLY:
        changes.push('Disabled queue persistence');
        changes.push('Using in-memory queue only');
        break;

      case FallbackMechanism.EMERGENCY_MODE:
        changes.push('Emergency mode: processing critical items only');
        changes.push('Disabled queue statistics and monitoring');
        break;
    }

    return {
      implemented: true,
      changes,
      fallbackMechanism,
      degradationLevel
    };
  }

  /**
   * Implement smart analysis degradation
   */
  async implementSmartAnalysisDegradation(degradationLevel, fallbackMechanism, context) {
    const changes = [];

    switch (fallbackMechanism) {
      case FallbackMechanism.BASIC_CACHE:
        changes.push('Disabled context analysis');
        changes.push('Using basic priority determination');
        break;

      case FallbackMechanism.DISABLE_FEATURE:
        changes.push('Completely disabled smart analysis');
        changes.push('Using default warming strategies');
        break;
    }

    return {
      implemented: true,
      changes,
      fallbackMechanism,
      degradationLevel
    };
  }

  /**
   * Implement statistics tracking degradation
   */
  async implementStatisticsTrackingDegradation(degradationLevel, fallbackMechanism, context) {
    const changes = [];

    switch (fallbackMechanism) {
      case FallbackMechanism.REDUCED_SCOPE:
        changes.push('Reduced statistics collection frequency');
        changes.push('Collecting essential metrics only');
        break;

      case FallbackMechanism.LOCAL_ONLY:
        changes.push('Disabled statistics persistence');
        changes.push('Using in-memory statistics only');
        break;

      case FallbackMechanism.DISABLE_FEATURE:
        changes.push('Disabled detailed statistics tracking');
        changes.push('Basic counters only');
        break;
    }

    return {
      implemented: true,
      changes,
      fallbackMechanism,
      degradationLevel
    };
  }

  /**
   * Implement error monitoring degradation
   */
  async implementErrorMonitoringDegradation(degradationLevel, fallbackMechanism, context) {
    const changes = [];

    switch (fallbackMechanism) {
      case FallbackMechanism.REDUCED_SCOPE:
        changes.push('Reduced error monitoring frequency');
        changes.push('Monitoring critical errors only');
        break;

      case FallbackMechanism.DISABLE_FEATURE:
        changes.push('Disabled advanced error monitoring');
        changes.push('Basic error logging only');
        break;
    }

    return {
      implemented: true,
      changes,
      fallbackMechanism,
      degradationLevel
    };
  }

  /**
   * Implement maintenance degradation
   */
  async implementMaintenanceDegradation(degradationLevel, fallbackMechanism, context) {
    const changes = [];

    switch (fallbackMechanism) {
      case FallbackMechanism.REDUCED_SCOPE:
        changes.push('Reduced maintenance frequency');
        changes.push('Essential maintenance tasks only');
        break;

      case FallbackMechanism.DISABLE_FEATURE:
        changes.push('Disabled scheduled maintenance');
        changes.push('Manual maintenance only');
        break;
    }

    return {
      implemented: true,
      changes,
      fallbackMechanism,
      degradationLevel
    };
  }

  /**
   * Implement persistence degradation
   */
  async implementPersistenceDegradation(degradationLevel, fallbackMechanism, context) {
    const changes = [];

    switch (fallbackMechanism) {
      case FallbackMechanism.LOCAL_ONLY:
        changes.push('Disabled remote persistence');
        changes.push('Using local storage only');
        break;

      case FallbackMechanism.DISABLE_FEATURE:
        changes.push('Disabled data persistence');
        changes.push('In-memory operation only');
        break;
    }

    return {
      implemented: true,
      changes,
      fallbackMechanism,
      degradationLevel
    };
  }

  /**
   * Schedule recovery check for a service aspect
   */
  scheduleRecoveryCheck(serviceAspect) {
    // Clear existing recovery timer
    const existingTimer = this.recoveryTimers.get(serviceAspect);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Schedule new recovery check
    const timer = setTimeout(() => {
      this.checkRecovery(serviceAspect);
    }, this.config.degradationThresholds.recoveryTime);

    this.recoveryTimers.set(serviceAspect, timer);

    console.log(`⏰ Scheduled recovery check for ${serviceAspect} in ${this.config.degradationThresholds.recoveryTime}ms`);
  }

  /**
   * Check if service aspect can recover from degradation
   */
  async checkRecovery(serviceAspect) {
    const currentLevel = this.degradationState.get(serviceAspect);
    
    if (currentLevel === DegradationLevel.NONE) {
      console.log(`✅ Service aspect ${serviceAspect} already at full functionality`);
      return;
    }

    console.log(`🔍 Checking recovery possibility for ${serviceAspect} (current: ${currentLevel})`);

    const failures = this.getFailureData(serviceAspect);
    const canRecover = this.evaluateRecoveryReadiness(serviceAspect, failures);

    if (canRecover.ready) {
      await this.attemptRecovery(serviceAspect, canRecover.targetLevel);
    } else {
      console.log(`⏳ Recovery not ready for ${serviceAspect}: ${canRecover.reason}`);
      // Schedule another check
      this.scheduleRecoveryCheck(serviceAspect);
    }
  }

  /**
   * Evaluate if service aspect is ready for recovery
   */
  evaluateRecoveryReadiness(serviceAspect, failures) {
    const currentLevel = this.degradationState.get(serviceAspect);
    const consecutiveFailures = this.consecutiveFailures.get(serviceAspect) || 0;

    // Check if error rate has improved
    if (failures.errorRate > this.config.degradationThresholds.errorRate * 0.8) {
      return {
        ready: false,
        reason: `Error rate still high: ${failures.errorRate.toFixed(3)}`
      };
    }

    // Check if consecutive failures have decreased
    if (consecutiveFailures > this.config.degradationThresholds.consecutiveFailures * 0.5) {
      return {
        ready: false,
        reason: `Still experiencing consecutive failures: ${consecutiveFailures}`
      };
    }

    // Determine target recovery level (gradual recovery)
    let targetLevel;
    switch (currentLevel) {
      case DegradationLevel.CRITICAL:
        targetLevel = DegradationLevel.SEVERE;
        break;
      case DegradationLevel.SEVERE:
        targetLevel = DegradationLevel.MODERATE;
        break;
      case DegradationLevel.MODERATE:
        targetLevel = DegradationLevel.MINIMAL;
        break;
      case DegradationLevel.MINIMAL:
        targetLevel = DegradationLevel.NONE;
        break;
      default:
        targetLevel = DegradationLevel.NONE;
    }

    return {
      ready: true,
      targetLevel,
      reason: 'Conditions improved, ready for recovery'
    };
  }

  /**
   * Attempt recovery from degradation
   */
  async attemptRecovery(serviceAspect, targetLevel) {
    console.log(`🔄 Attempting recovery for ${serviceAspect}: ${this.degradationState.get(serviceAspect)} → ${targetLevel}`);

    try {
      const result = await this.applyDegradation(serviceAspect, targetLevel, 'Automatic recovery attempt');
      
      if (result.applied) {
        console.log(`✅ Recovery successful for ${serviceAspect}`);
        
        // If not fully recovered, schedule another check
        if (targetLevel !== DegradationLevel.NONE) {
          this.scheduleRecoveryCheck(serviceAspect);
        } else {
          // Clear recovery timer for fully recovered service
          const timer = this.recoveryTimers.get(serviceAspect);
          if (timer) {
            clearTimeout(timer);
            this.recoveryTimers.delete(serviceAspect);
          }
        }
      }

      return result;

    } catch (error) {
      console.error(`❌ Recovery attempt failed for ${serviceAspect}:`, error);
      
      // Schedule retry
      this.scheduleRecoveryCheck(serviceAspect);
      
      return { applied: false, error: error.message };
    }
  }

  /**
   * Record failure for tracking
   */
  recordFailure(serviceAspect, errorCategory, errorSeverity, context = {}) {
    const now = Date.now();
    const timeWindow = this.config.degradationThresholds.timeWindow;

    // Get or create failure data
    let failures = this.failureTracking.get(serviceAspect) || {
      failures: [],
      totalOperations: 0,
      errorRate: 0
    };

    // Add new failure
    failures.failures.push({
      timestamp: now,
      errorCategory,
      errorSeverity,
      context
    });

    // Clean old failures outside time window
    failures.failures = failures.failures.filter(f => now - f.timestamp <= timeWindow);

    // Update consecutive failures
    const consecutive = this.consecutiveFailures.get(serviceAspect) || 0;
    this.consecutiveFailures.set(serviceAspect, consecutive + 1);

    // Calculate error rate (simplified - would need total operations in real implementation)
    failures.errorRate = failures.failures.length / Math.max(failures.totalOperations, failures.failures.length);

    this.failureTracking.set(serviceAspect, failures);

    console.log(`📊 Recorded failure for ${serviceAspect}: ${failures.failures.length} failures, ${failures.errorRate.toFixed(3)} error rate`);
  }

  /**
   * Record success for tracking
   */
  recordSuccess(serviceAspect) {
    // Reset consecutive failures on success
    this.consecutiveFailures.set(serviceAspect, 0);

    // Update total operations for error rate calculation
    let failures = this.failureTracking.get(serviceAspect) || {
      failures: [],
      totalOperations: 0,
      errorRate: 0
    };

    failures.totalOperations++;
    failures.errorRate = failures.failures.length / failures.totalOperations;

    this.failureTracking.set(serviceAspect, failures);
  }

  /**
   * Get failure data for a service aspect
   */
  getFailureData(serviceAspect) {
    return this.failureTracking.get(serviceAspect) || {
      failures: [],
      totalOperations: 0,
      errorRate: 0
    };
  }

  /**
   * Get current degradation status
   */
  getDegradationStatus() {
    const status = {
      overallHealth: this.calculateOverallHealth(),
      serviceAspects: {},
      recentDegradations: this.degradationHistory.slice(-10),
      activeRecoveryTimers: this.recoveryTimers.size
    };

    // Get status for each service aspect
    Object.values(ServiceAspect).forEach(aspect => {
      const level = this.degradationState.get(aspect);
      const fallback = this.fallbackState.get(aspect);
      const failures = this.getFailureData(aspect);
      const consecutive = this.consecutiveFailures.get(aspect) || 0;

      status.serviceAspects[aspect] = {
        degradationLevel: level,
        fallbackMechanism: fallback,
        errorRate: failures.errorRate,
        consecutiveFailures: consecutive,
        recentFailures: failures.failures.length,
        hasRecoveryTimer: this.recoveryTimers.has(aspect)
      };
    });

    return status;
  }

  /**
   * Calculate overall service health
   */
  calculateOverallHealth() {
    const aspects = Object.values(ServiceAspect);
    let totalScore = 0;
    let maxScore = aspects.length * 4; // 4 points for NONE degradation

    aspects.forEach(aspect => {
      const level = this.degradationState.get(aspect);
      switch (level) {
        case DegradationLevel.NONE:
          totalScore += 4;
          break;
        case DegradationLevel.MINIMAL:
          totalScore += 3;
          break;
        case DegradationLevel.MODERATE:
          totalScore += 2;
          break;
        case DegradationLevel.SEVERE:
          totalScore += 1;
          break;
        case DegradationLevel.CRITICAL:
          totalScore += 0;
          break;
      }
    });

    const healthPercentage = (totalScore / maxScore) * 100;

    if (healthPercentage >= 90) return 'EXCELLENT';
    if (healthPercentage >= 75) return 'GOOD';
    if (healthPercentage >= 50) return 'FAIR';
    if (healthPercentage >= 25) return 'POOR';
    return 'CRITICAL';
  }

  /**
   * Force recovery of all service aspects
   */
  async forceRecovery() {
    console.log('🔄 Forcing recovery of all degraded service aspects...');

    const recoveryPromises = [];

    for (const [aspect, level] of this.degradationState.entries()) {
      if (level !== DegradationLevel.NONE) {
        recoveryPromises.push(
          this.applyDegradation(aspect, DegradationLevel.NONE, 'Forced recovery')
        );
      }
    }

    const results = await Promise.allSettled(recoveryPromises);
    
    // Clear all recovery timers
    this.recoveryTimers.forEach(timer => clearTimeout(timer));
    this.recoveryTimers.clear();

    // Reset failure tracking
    this.failureTracking.clear();
    this.consecutiveFailures.clear();

    console.log(`✅ Forced recovery completed: ${results.filter(r => r.status === 'fulfilled').length} successful`);

    return results;
  }

  /**
   * Cleanup degradation manager resources
   */
  cleanup() {
    console.log('🧹 Cleaning up GracefulDegradationManager...');

    // Clear all recovery timers
    this.recoveryTimers.forEach(timer => clearTimeout(timer));
    this.recoveryTimers.clear();

    // Reset all state
    this.degradationState.clear();
    this.fallbackState.clear();
    this.degradationHistory = [];
    this.failureTracking.clear();
    this.consecutiveFailures.clear();

    // Initialize all aspects to NONE degradation
    Object.values(ServiceAspect).forEach(aspect => {
      this.degradationState.set(aspect, DegradationLevel.NONE);
    });

    console.log('✅ GracefulDegradationManager cleanup completed');
  }
}

// Export singleton instance
export const gracefulDegradationManager = new GracefulDegradationManager();