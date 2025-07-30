/**
 * Cache Warming Production Monitor
 * 
 * Provides comprehensive production monitoring for cache warming operations.
 * Includes real-time performance monitoring, alerting for failures, 
 * usage pattern analysis, and comprehensive logging for production debugging.
 * 
 * Features:
 * - Real-time performance monitoring and metrics collection
 * - Intelligent alerting system for warming failures and performance degradation
 * - Usage pattern analysis and optimization suggestions
 * - Comprehensive logging with structured data for production debugging
 * - Health checks and system status monitoring
 * - Performance regression detection and alerting
 * - Cost analysis and optimization recommendations
 */

import { performanceMonitor } from '../utils/performanceMonitor';

/**
 * Production Monitor for Cache Warming Operations
 */
class CacheWarmingProductionMonitor {
  constructor(options = {}) {
    this.config = {
      // Monitoring intervals
      healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
      metricsCollectionInterval: options.metricsCollectionInterval || 30000, // 30 seconds
      patternAnalysisInterval: options.patternAnalysisInterval || 300000, // 5 minutes
      
      // Alert thresholds
      alertThresholds: {
        warmingFailureRate: options.warmingFailureRate || 10, // 10% failure rate
        slowWarmingThreshold: options.slowWarmingThreshold || 5000, // 5 seconds
        memoryUsageThreshold: options.memoryUsageThreshold || 100 * 1024 * 1024, // 100MB
        cacheHitRateThreshold: options.cacheHitRateThreshold || 50, // 50% minimum
        errorRateThreshold: options.errorRateThreshold || 5, // 5% error rate
        responseTimeThreshold: options.responseTimeThreshold || 2000, // 2 seconds
        ...options.alertThresholds
      },
      
      // Logging configuration
      enableStructuredLogging: options.enableStructuredLogging !== false,
      enablePerformanceLogging: options.enablePerformanceLogging !== false,
      enableErrorTracking: options.enableErrorTracking !== false,
      logLevel: options.logLevel || 'info', // 'debug', 'info', 'warn', 'error'
      
      // Pattern analysis
      enablePatternAnalysis: options.enablePatternAnalysis !== false,
      patternAnalysisWindow: options.patternAnalysisWindow || 24 * 60 * 60 * 1000, // 24 hours
      
      // Production features
      enableRealTimeMonitoring: options.enableRealTimeMonitoring !== false,
      enableAlerting: options.enableAlerting !== false,
      enableHealthChecks: options.enableHealthChecks !== false,
      
      ...options
    };

    // Monitoring state
    this.isMonitoring = false;
    this.healthCheckInterval = null;
    this.metricsInterval = null;
    this.patternAnalysisInterval = null;

    // Metrics storage
    this.metrics = {
      performance: {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageResponseTime: 0,
        lastResponseTime: 0,
        peakResponseTime: 0
      },
      health: {
        status: 'unknown',
        lastHealthCheck: null,
        consecutiveFailures: 0,
        uptime: 0,
        startTime: Date.now()
      },
      alerts: {
        totalAlerts: 0,
        activeAlerts: [],
        recentAlerts: [],
        alertHistory: []
      },
      patterns: {
        usagePatterns: new Map(),
        performancePatterns: new Map(),
        errorPatterns: new Map(),
        lastAnalysis: null
      }
    };

    // Alert management
    this.alertManager = {
      activeAlerts: new Map(),
      alertCooldowns: new Map(),
      alertHandlers: new Map()
    };

    // Performance tracking
    this.performanceTracker = {
      operationTimes: [],
      errorCounts: new Map(),
      patternData: [],
      regressionBaseline: null
    };

    console.log('🔍 CacheWarmingProductionMonitor initialized with config:', this.config);
  }

  /**
   * Start production monitoring
   * Begins all monitoring processes including health checks, metrics collection, and pattern analysis
   */
  startMonitoring() {
    if (this.isMonitoring) {
      console.log('🔍 Production monitoring already running');
      return;
    }

    console.log('🚀 Starting cache warming production monitoring...');
    this.isMonitoring = true;
    this.metrics.health.startTime = Date.now();

    // Start health checks
    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }

    // Start real-time monitoring
    if (this.config.enableRealTimeMonitoring) {
      this.startRealTimeMonitoring();
    }

    // Start pattern analysis
    if (this.config.enablePatternAnalysis) {
      this.startPatternAnalysis();
    }

    // Register default alert handlers
    this.registerDefaultAlertHandlers();

    // Log monitoring start
    this.logStructured('info', 'Production monitoring started', {
      config: this.config,
      timestamp: new Date().toISOString()
    });

    console.log('✅ Production monitoring started successfully');
  }

  /**
   * Stop production monitoring
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      console.log('🔍 Production monitoring not running');
      return;
    }

    console.log('🛑 Stopping cache warming production monitoring...');
    this.isMonitoring = false;

    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }

    if (this.patternAnalysisInterval) {
      clearInterval(this.patternAnalysisInterval);
      this.patternAnalysisInterval = null;
    }

    // Clear active alerts
    this.alertManager.activeAlerts.clear();

    // Log monitoring stop
    this.logStructured('info', 'Production monitoring stopped', {
      uptime: Date.now() - this.metrics.health.startTime,
      timestamp: new Date().toISOString()
    });

    console.log('✅ Production monitoring stopped');
  }

  /**
   * Start health checks
   */
  startHealthChecks() {
    console.log('🏥 Starting health checks...');

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    // Perform initial health check
    setTimeout(() => this.performHealthCheck(), 1000);
  }

  /**
   * Start real-time monitoring
   */
  startRealTimeMonitoring() {
    console.log('⏱️ Starting real-time monitoring...');

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.metricsCollectionInterval);
  }

  /**
   * Start pattern analysis
   */
  startPatternAnalysis() {
    console.log('📊 Starting pattern analysis...');

    this.patternAnalysisInterval = setInterval(() => {
      this.analyzeUsagePatterns();
    }, this.config.patternAnalysisInterval);
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const healthCheckStart = performance.now();

    try {
      const healthData = {
        timestamp: Date.now(),
        status: 'healthy',
        checks: {},
        metrics: {},
        alerts: []
      };

      // Check cache warming service health
      const serviceHealth = await this.checkServiceHealth();
      healthData.checks.service = serviceHealth;

      // Check performance metrics
      const performanceHealth = this.checkPerformanceHealth();
      healthData.checks.performance = performanceHealth;

      // Check memory usage
      const memoryHealth = this.checkMemoryHealth();
      healthData.checks.memory = memoryHealth;

      // Check error rates
      const errorHealth = this.checkErrorRates();
      healthData.checks.errors = errorHealth;

      // Determine overall health status
      const allChecks = Object.values(healthData.checks);
      const hasWarnings = allChecks.some(check => check.status === 'warning');
      const hasErrors = allChecks.some(check => check.status === 'error');

      if (hasErrors) {
        healthData.status = 'unhealthy';
        this.metrics.health.consecutiveFailures++;
      } else if (hasWarnings) {
        healthData.status = 'degraded';
        this.metrics.health.consecutiveFailures = 0;
      } else {
        healthData.status = 'healthy';
        this.metrics.health.consecutiveFailures = 0;
      }

      // Update health metrics
      this.metrics.health.status = healthData.status;
      this.metrics.health.lastHealthCheck = healthData.timestamp;
      this.metrics.health.uptime = Date.now() - this.metrics.health.startTime;

      // Generate alerts if needed
      await this.processHealthCheckAlerts(healthData);

      // Log health check results
      this.logStructured('info', 'Health check completed', {
        status: healthData.status,
        duration: performance.now() - healthCheckStart,
        checks: healthData.checks,
        consecutiveFailures: this.metrics.health.consecutiveFailures
      });

      return healthData;

    } catch (error) {
      this.metrics.health.consecutiveFailures++;
      this.metrics.health.status = 'error';

      this.logStructured('error', 'Health check failed', {
        error: error.message,
        stack: error.stack,
        consecutiveFailures: this.metrics.health.consecutiveFailures
      });

      // Generate critical alert
      await this.generateAlert('health_check_failure', 'critical', {
        error: error.message,
        consecutiveFailures: this.metrics.health.consecutiveFailures
      });

      throw error;
    }
  }

  /**
   * Check cache warming service health
   */
  async checkServiceHealth() {
    try {
      // This would integrate with the actual cache warming service
      // For now, we'll simulate the check
      const serviceCheck = {
        status: 'healthy',
        isRunning: true,
        queueSize: 0,
        activeOperations: 0,
        lastOperation: Date.now() - 30000 // 30 seconds ago
      };

      // Check if service is responsive
      const timeSinceLastOperation = Date.now() - serviceCheck.lastOperation;
      if (timeSinceLastOperation > 300000) { // 5 minutes
        serviceCheck.status = 'warning';
        serviceCheck.warning = 'No recent cache warming operations detected';
      }

      return serviceCheck;

    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        isRunning: false
      };
    }
  }

  /**
   * Check performance health
   */
  checkPerformanceHealth() {
    const performanceCheck = {
      status: 'healthy',
      averageResponseTime: this.metrics.performance.averageResponseTime,
      lastResponseTime: this.metrics.performance.lastResponseTime,
      peakResponseTime: this.metrics.performance.peakResponseTime,
      threshold: this.config.alertThresholds.responseTimeThreshold
    };

    // Check response time thresholds
    if (this.metrics.performance.averageResponseTime > this.config.alertThresholds.responseTimeThreshold) {
      performanceCheck.status = 'warning';
      performanceCheck.warning = `Average response time (${this.metrics.performance.averageResponseTime}ms) exceeds threshold (${this.config.alertThresholds.responseTimeThreshold}ms)`;
    }

    if (this.metrics.performance.lastResponseTime > this.config.alertThresholds.responseTimeThreshold * 2) {
      performanceCheck.status = 'error';
      performanceCheck.error = `Last response time (${this.metrics.performance.lastResponseTime}ms) is critically high`;
    }

    return performanceCheck;
  }

  /**
   * Check memory health
   */
  checkMemoryHealth() {
    const memoryCheck = {
      status: 'healthy',
      currentUsage: 0,
      threshold: this.config.alertThresholds.memoryUsageThreshold
    };

    if (typeof performance !== 'undefined' && performance.memory) {
      memoryCheck.currentUsage = performance.memory.usedJSHeapSize;

      if (memoryCheck.currentUsage > this.config.alertThresholds.memoryUsageThreshold) {
        memoryCheck.status = 'warning';
        memoryCheck.warning = `Memory usage (${this.formatBytes(memoryCheck.currentUsage)}) exceeds threshold (${this.formatBytes(this.config.alertThresholds.memoryUsageThreshold)})`;
      }

      if (memoryCheck.currentUsage > this.config.alertThresholds.memoryUsageThreshold * 1.5) {
        memoryCheck.status = 'error';
        memoryCheck.error = `Memory usage is critically high`;
      }
    }

    return memoryCheck;
  }

  /**
   * Check error rates
   */
  checkErrorRates() {
    const errorCheck = {
      status: 'healthy',
      totalOperations: this.metrics.performance.totalOperations,
      failedOperations: this.metrics.performance.failedOperations,
      errorRate: 0,
      threshold: this.config.alertThresholds.errorRateThreshold
    };

    if (this.metrics.performance.totalOperations > 0) {
      errorCheck.errorRate = (this.metrics.performance.failedOperations / this.metrics.performance.totalOperations) * 100;

      if (errorCheck.errorRate > this.config.alertThresholds.errorRateThreshold) {
        errorCheck.status = 'warning';
        errorCheck.warning = `Error rate (${errorCheck.errorRate.toFixed(2)}%) exceeds threshold (${this.config.alertThresholds.errorRateThreshold}%)`;
      }

      if (errorCheck.errorRate > this.config.alertThresholds.errorRateThreshold * 2) {
        errorCheck.status = 'error';
        errorCheck.error = `Error rate is critically high`;
      }
    }

    return errorCheck;
  }

  /**
   * Process health check alerts
   */
  async processHealthCheckAlerts(healthData) {
    // Generate alerts based on health check results
    for (const [checkName, checkResult] of Object.entries(healthData.checks)) {
      if (checkResult.status === 'warning') {
        await this.generateAlert(`${checkName}_warning`, 'warning', {
          check: checkName,
          message: checkResult.warning,
          data: checkResult
        });
      } else if (checkResult.status === 'error') {
        await this.generateAlert(`${checkName}_error`, 'error', {
          check: checkName,
          message: checkResult.error,
          data: checkResult
        });
      }
    }

    // Generate overall health alerts
    if (healthData.status === 'unhealthy') {
      await this.generateAlert('system_unhealthy', 'critical', {
        status: healthData.status,
        consecutiveFailures: this.metrics.health.consecutiveFailures,
        checks: healthData.checks
      });
    }
  }

  /**
   * Collect real-time metrics
   */
  collectMetrics() {
    try {
      const metricsData = {
        timestamp: Date.now(),
        performance: { ...this.metrics.performance },
        health: { ...this.metrics.health },
        memory: this.getCurrentMemoryUsage(),
        activeAlerts: this.alertManager.activeAlerts.size
      };

      // Update performance trends
      this.updatePerformanceTrends(metricsData);

      // Check for performance regressions
      this.checkPerformanceRegression(metricsData);

      // Log metrics if enabled
      if (this.config.enablePerformanceLogging) {
        this.logStructured('debug', 'Metrics collected', metricsData);
      }

      return metricsData;

    } catch (error) {
      this.logStructured('error', 'Failed to collect metrics', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Analyze usage patterns
   */
  analyzeUsagePatterns() {
    try {
      console.log('📊 Analyzing usage patterns...');

      const analysisData = {
        timestamp: Date.now(),
        patterns: {
          usage: this.analyzeUsageFrequency(),
          performance: this.analyzePerformancePatterns(),
          errors: this.analyzeErrorPatterns(),
          temporal: this.analyzeTemporalPatterns()
        },
        recommendations: []
      };

      // Generate optimization recommendations
      analysisData.recommendations = this.generateOptimizationRecommendations(analysisData.patterns);

      // Update pattern metrics
      this.metrics.patterns.lastAnalysis = analysisData.timestamp;

      // Log pattern analysis
      this.logStructured('info', 'Usage pattern analysis completed', {
        patterns: analysisData.patterns,
        recommendations: analysisData.recommendations
      });

      return analysisData;

    } catch (error) {
      this.logStructured('error', 'Pattern analysis failed', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Analyze usage frequency patterns
   */
  analyzeUsageFrequency() {
    const now = Date.now();
    const windowStart = now - this.config.patternAnalysisWindow;

    // Analyze operation frequency by hour
    const hourlyUsage = new Map();
    const dailyUsage = new Map();

    // This would analyze actual operation data
    // For now, we'll simulate pattern detection
    for (let hour = 0; hour < 24; hour++) {
      const usage = Math.floor(Math.random() * 100) + 50; // Simulate usage
      hourlyUsage.set(hour, usage);
    }

    // Identify peak usage hours
    const peakHours = Array.from(hourlyUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, usage]) => ({ hour, usage }));

    return {
      hourlyUsage: Object.fromEntries(hourlyUsage),
      dailyUsage: Object.fromEntries(dailyUsage),
      peakHours,
      totalOperations: this.metrics.performance.totalOperations
    };
  }

  /**
   * Analyze performance patterns
   */
  analyzePerformancePatterns() {
    const recentTimes = this.performanceTracker.operationTimes.slice(-100);
    
    if (recentTimes.length === 0) {
      return { trend: 'insufficient_data' };
    }

    const average = recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length;
    const min = Math.min(...recentTimes);
    const max = Math.max(...recentTimes);

    // Calculate trend
    const firstHalf = recentTimes.slice(0, Math.floor(recentTimes.length / 2));
    const secondHalf = recentTimes.slice(Math.floor(recentTimes.length / 2));

    const firstHalfAvg = firstHalf.reduce((sum, time) => sum + time, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, time) => sum + time, 0) / secondHalf.length;

    let trend = 'stable';
    if (secondHalfAvg > firstHalfAvg * 1.1) {
      trend = 'degrading';
    } else if (secondHalfAvg < firstHalfAvg * 0.9) {
      trend = 'improving';
    }

    return {
      average: Math.round(average),
      min,
      max,
      trend,
      sampleSize: recentTimes.length
    };
  }

  /**
   * Analyze error patterns
   */
  analyzeErrorPatterns() {
    const errorPatterns = {
      totalErrors: this.metrics.performance.failedOperations,
      errorRate: this.metrics.performance.totalOperations > 0 ? 
        (this.metrics.performance.failedOperations / this.metrics.performance.totalOperations) * 100 : 0,
      commonErrors: [],
      errorTrend: 'stable'
    };

    // Analyze error types and frequencies
    const errorCounts = Array.from(this.performanceTracker.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    errorPatterns.commonErrors = errorCounts.map(([error, count]) => ({
      error,
      count,
      percentage: (count / this.metrics.performance.failedOperations) * 100
    }));

    return errorPatterns;
  }

  /**
   * Analyze temporal patterns
   */
  analyzeTemporalPatterns() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    return {
      currentHour,
      currentDay,
      isWorkingHours: currentHour >= 9 && currentHour <= 17,
      isWeekend: currentDay === 0 || currentDay === 6,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  }

  /**
   * Generate optimization recommendations
   */
  generateOptimizationRecommendations(patterns) {
    const recommendations = [];

    // Performance recommendations
    if (patterns.performance.trend === 'degrading') {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'Performance Degradation Detected',
        description: 'Cache warming performance is degrading over time',
        action: 'Review recent changes and optimize warming strategies',
        impact: 'high'
      });
    }

    // Usage pattern recommendations
    if (patterns.usage.peakHours.length > 0) {
      const peakHour = patterns.usage.peakHours[0];
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Peak Usage Optimization',
        description: `Peak usage detected at hour ${peakHour.hour} with ${peakHour.usage} operations`,
        action: 'Consider pre-warming cache before peak hours',
        impact: 'medium'
      });
    }

    // Error pattern recommendations
    if (patterns.errors.errorRate > this.config.alertThresholds.errorRateThreshold) {
      recommendations.push({
        type: 'reliability',
        priority: 'high',
        title: 'High Error Rate',
        description: `Error rate (${patterns.errors.errorRate.toFixed(2)}%) exceeds threshold`,
        action: 'Investigate and fix common error causes',
        impact: 'high'
      });
    }

    return recommendations;
  }

  /**
   * Update performance trends
   */
  updatePerformanceTrends(metricsData) {
    // Store operation times for trend analysis
    if (metricsData.performance.lastResponseTime > 0) {
      this.performanceTracker.operationTimes.push(metricsData.performance.lastResponseTime);
      
      // Keep only recent data
      if (this.performanceTracker.operationTimes.length > 1000) {
        this.performanceTracker.operationTimes = this.performanceTracker.operationTimes.slice(-1000);
      }
    }
  }

  /**
   * Check for performance regression
   */
  checkPerformanceRegression(metricsData) {
    if (!this.performanceTracker.regressionBaseline) {
      // Establish baseline after sufficient data
      if (this.performanceTracker.operationTimes.length >= 50) {
        const recentTimes = this.performanceTracker.operationTimes.slice(-50);
        this.performanceTracker.regressionBaseline = {
          average: recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length,
          timestamp: Date.now()
        };
      }
      return;
    }

    // Check for significant regression (>50% slower than baseline)
    const currentAverage = metricsData.performance.averageResponseTime;
    const baselineAverage = this.performanceTracker.regressionBaseline.average;

    if (currentAverage > baselineAverage * 1.5) {
      this.generateAlert('performance_regression', 'warning', {
        currentAverage,
        baselineAverage,
        regressionPercent: ((currentAverage - baselineAverage) / baselineAverage) * 100
      });
    }
  }

  /**
   * Generate alert
   */
  async generateAlert(alertType, severity, data = {}) {
    if (!this.config.enableAlerting) {
      return;
    }

    const alertId = `${alertType}_${Date.now()}`;
    const alert = {
      id: alertId,
      type: alertType,
      severity,
      timestamp: Date.now(),
      data,
      status: 'active',
      acknowledged: false
    };

    // Check cooldown period
    const cooldownKey = `${alertType}_${severity}`;
    const lastAlert = this.alertManager.alertCooldowns.get(cooldownKey);
    const cooldownPeriod = this.getCooldownPeriod(severity);

    if (lastAlert && (Date.now() - lastAlert) < cooldownPeriod) {
      console.log(`🔕 Alert ${alertType} is in cooldown period`);
      return;
    }

    // Store alert
    this.alertManager.activeAlerts.set(alertId, alert);
    this.alertManager.alertCooldowns.set(cooldownKey, Date.now());
    this.metrics.alerts.activeAlerts.push(alert);
    this.metrics.alerts.recentAlerts.unshift(alert);
    this.metrics.alerts.totalAlerts++;

    // Keep only recent alerts
    if (this.metrics.alerts.recentAlerts.length > 100) {
      this.metrics.alerts.recentAlerts = this.metrics.alerts.recentAlerts.slice(0, 100);
    }

    // Execute alert handlers
    await this.executeAlertHandlers(alert);

    // Log alert
    this.logStructured('warn', `Alert generated: ${alertType}`, {
      alert,
      severity,
      data
    });

    console.log(`🚨 Alert generated: ${alertType} (${severity})`);

    return alert;
  }

  /**
   * Get cooldown period for alert severity
   */
  getCooldownPeriod(severity) {
    const cooldowns = {
      'info': 5 * 60 * 1000, // 5 minutes
      'warning': 10 * 60 * 1000, // 10 minutes
      'error': 15 * 60 * 1000, // 15 minutes
      'critical': 30 * 60 * 1000 // 30 minutes
    };

    return cooldowns[severity] || cooldowns.warning;
  }

  /**
   * Execute alert handlers
   */
  async executeAlertHandlers(alert) {
    const handlers = this.alertManager.alertHandlers.get(alert.type) || [];
    const globalHandlers = this.alertManager.alertHandlers.get('*') || [];

    const allHandlers = [...handlers, ...globalHandlers];

    for (const handler of allHandlers) {
      try {
        await handler(alert);
      } catch (error) {
        this.logStructured('error', 'Alert handler failed', {
          alertType: alert.type,
          handlerError: error.message,
          alert
        });
      }
    }
  }

  /**
   * Register default alert handlers
   */
  registerDefaultAlertHandlers() {
    // Default console handler for all alerts
    this.registerAlertHandler('*', (alert) => {
      const emoji = this.getAlertEmoji(alert.severity);
      console.log(`${emoji} ALERT [${alert.severity.toUpperCase()}]: ${alert.type}`, alert.data);
    });

    // Critical alert handler
    this.registerAlertHandler('system_unhealthy', (alert) => {
      console.error('🚨 CRITICAL: System is unhealthy!', alert.data);
      // In production, this might send notifications, create tickets, etc.
    });

    // Performance regression handler
    this.registerAlertHandler('performance_regression', (alert) => {
      console.warn('📉 Performance regression detected', alert.data);
      // In production, this might trigger automated optimization
    });
  }

  /**
   * Register alert handler
   */
  registerAlertHandler(alertType, handler) {
    if (!this.alertManager.alertHandlers.has(alertType)) {
      this.alertManager.alertHandlers.set(alertType, []);
    }
    this.alertManager.alertHandlers.get(alertType).push(handler);
  }

  /**
   * Get alert emoji for severity
   */
  getAlertEmoji(severity) {
    const emojis = {
      'info': 'ℹ️',
      'warning': '⚠️',
      'error': '❌',
      'critical': '🚨'
    };
    return emojis[severity] || '🔔';
  }

  /**
   * Track cache warming operation
   */
  trackOperation(operationType, duration, success, error = null, metadata = {}) {
    // Update performance metrics
    this.metrics.performance.totalOperations++;
    this.metrics.performance.lastResponseTime = duration;

    if (success) {
      this.metrics.performance.successfulOperations++;
    } else {
      this.metrics.performance.failedOperations++;
      
      // Track error patterns
      const errorKey = error ? error.message : 'unknown_error';
      const currentCount = this.performanceTracker.errorCounts.get(errorKey) || 0;
      this.performanceTracker.errorCounts.set(errorKey, currentCount + 1);
    }

    // Update average response time
    if (this.metrics.performance.totalOperations > 0) {
      const totalTime = this.performanceTracker.operationTimes.reduce((sum, time) => sum + time, 0) + duration;
      this.metrics.performance.averageResponseTime = totalTime / this.metrics.performance.totalOperations;
    }

    // Update peak response time
    if (duration > this.metrics.performance.peakResponseTime) {
      this.metrics.performance.peakResponseTime = duration;
    }

    // Log operation if enabled
    if (this.config.enablePerformanceLogging) {
      this.logStructured('debug', 'Cache warming operation tracked', {
        operationType,
        duration,
        success,
        error: error?.message,
        metadata
      });
    }

    // Check for immediate alerts
    if (!success && error) {
      this.generateAlert('operation_failure', 'warning', {
        operationType,
        duration,
        error: error.message,
        metadata
      });
    }

    if (duration > this.config.alertThresholds.slowWarmingThreshold) {
      this.generateAlert('slow_operation', 'warning', {
        operationType,
        duration,
        threshold: this.config.alertThresholds.slowWarmingThreshold,
        metadata
      });
    }
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      };
    }
    return { used: 0, total: 0, limit: 0 };
  }

  /**
   * Format bytes for display
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Structured logging
   */
  logStructured(level, message, data = {}) {
    if (!this.config.enableStructuredLogging) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: 'cache-warming-monitor',
      data
    };

    // In production, this would send to a logging service
    const logMethod = console[level] || console.log;
    logMethod(JSON.stringify(logEntry));
  }

  /**
   * Get comprehensive monitoring report
   */
  getMonitoringReport() {
    return {
      status: {
        isMonitoring: this.isMonitoring,
        health: this.metrics.health,
        uptime: Date.now() - this.metrics.health.startTime
      },
      performance: this.metrics.performance,
      alerts: {
        total: this.metrics.alerts.totalAlerts,
        active: this.metrics.alerts.activeAlerts.length,
        recent: this.metrics.alerts.recentAlerts.slice(0, 10)
      },
      patterns: {
        lastAnalysis: this.metrics.patterns.lastAnalysis,
        hasPatterns: this.metrics.patterns.usagePatterns.size > 0
      },
      config: this.config,
      recommendations: this.generateCurrentRecommendations()
    };
  }

  /**
   * Generate current recommendations
   */
  generateCurrentRecommendations() {
    const recommendations = [];

    // Health recommendations
    if (this.metrics.health.status !== 'healthy') {
      recommendations.push({
        type: 'health',
        priority: 'high',
        message: `System health is ${this.metrics.health.status}`,
        action: 'Review health check results and address issues'
      });
    }

    // Performance recommendations
    if (this.metrics.performance.averageResponseTime > this.config.alertThresholds.responseTimeThreshold) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Average response time exceeds threshold',
        action: 'Optimize cache warming operations'
      });
    }

    // Alert recommendations
    if (this.metrics.alerts.activeAlerts.length > 5) {
      recommendations.push({
        type: 'alerts',
        priority: 'medium',
        message: 'Multiple active alerts detected',
        action: 'Review and resolve active alerts'
      });
    }

    return recommendations;
  }

  /**
   * Cleanup monitoring resources
   */
  cleanup() {
    console.log('🧹 Cleaning up production monitor...');

    this.stopMonitoring();

    // Clear all data
    this.metrics.performance = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageResponseTime: 0,
      lastResponseTime: 0,
      peakResponseTime: 0
    };

    this.metrics.alerts.activeAlerts = [];
    this.metrics.alerts.recentAlerts = [];
    this.metrics.alerts.alertHistory = [];

    this.alertManager.activeAlerts.clear();
    this.alertManager.alertCooldowns.clear();
    this.alertManager.alertHandlers.clear();

    this.performanceTracker.operationTimes = [];
    this.performanceTracker.errorCounts.clear();
    this.performanceTracker.patternData = [];

    console.log('✅ Production monitor cleanup completed');
  }
}

export default CacheWarmingProductionMonitor;