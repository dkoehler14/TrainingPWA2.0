/**
 * Development Debugging Utilities
 * 
 * Provides enhanced debugging capabilities including source map support,
 * service status logging, and development mode detection for error reporting.
 */

import { isDevelopment, getDevelopmentConfig, getEnvironmentInfo } from '../config/environment';

// Debug levels
export const DEBUG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

// Current debug level based on environment
const currentDebugLevel = isDevelopment ? 
  (process.env.REACT_APP_LOG_LEVEL === 'trace' ? DEBUG_LEVELS.TRACE :
   process.env.REACT_APP_LOG_LEVEL === 'debug' ? DEBUG_LEVELS.DEBUG :
   process.env.REACT_APP_LOG_LEVEL === 'info' ? DEBUG_LEVELS.INFO :
   process.env.REACT_APP_LOG_LEVEL === 'warn' ? DEBUG_LEVELS.WARN :
   DEBUG_LEVELS.ERROR) : DEBUG_LEVELS.ERROR;

// Service status tracking for debugging
const serviceDebugInfo = {
  react: { 
    status: 'initializing', 
    startTime: Date.now(), 
    hotReloadCount: 0,
    lastUpdate: null 
  },
  firebase: { 
    status: 'initializing', 
    services: {},
    connectionAttempts: 0,
    lastHealthCheck: null 
  },
  emulators: { 
    status: 'checking', 
    connectedServices: [],
    failedServices: [],
    lastConnectionAttempt: null 
  }
};

/**
 * Enhanced development logger with source map support
 */
export class DevelopmentLogger {
  constructor(context = 'App') {
    this.context = context;
    this.startTime = Date.now();
    this.logHistory = [];
  }

  /**
   * Log with enhanced debugging information
   * @param {string} level - Log level (error, warn, info, debug, trace)
   * @param {string} message - Log message
   * @param {any} data - Additional data to log
   * @param {Object} options - Logging options
   */
  log(level, message, data = null, options = {}) {
    const levelNum = DEBUG_LEVELS[level.toUpperCase()] || DEBUG_LEVELS.INFO;
    
    // Skip if below current debug level
    if (levelNum > currentDebugLevel) return;

    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    
    // Enhanced log entry with source information
    const logEntry = {
      timestamp,
      elapsed,
      level: level.toUpperCase(),
      context: this.context,
      message,
      data,
      stack: options.includeStack ? new Error().stack : null,
      sourceMap: options.includeSourceMap ? this.getSourceMapInfo() : null
    };

    // Store in history for debugging
    this.logHistory.push(logEntry);
    if (this.logHistory.length > 100) {
      this.logHistory.shift(); // Keep only last 100 entries
    }

    // Enhanced console output with colors and formatting
    this.outputToConsole(logEntry, options);

    // Store critical logs for debugging
    if (levelNum <= DEBUG_LEVELS.WARN) {
      this.storeCriticalLog(logEntry);
    }
  }

  /**
   * Output log entry to console with enhanced formatting
   * @param {Object} logEntry - Log entry object
   * @param {Object} options - Output options
   */
  outputToConsole(logEntry, options = {}) {
    const { timestamp, elapsed, level, context, message, data } = logEntry;
    
    // Color coding for different log levels
    const colors = {
      ERROR: 'color: #ff4444; font-weight: bold;',
      WARN: 'color: #ffaa00; font-weight: bold;',
      INFO: 'color: #4444ff;',
      DEBUG: 'color: #888888;',
      TRACE: 'color: #cccccc;'
    };

    const style = colors[level] || colors.INFO;
    const timeStyle = 'color: #666666; font-size: 0.9em;';
    const contextStyle = 'color: #0066cc; font-weight: bold;';

    // Enhanced console output
    if (options.group) {
      console.group(`%c[${level}] %c${context} %c(+${elapsed}ms)`, 
        style, contextStyle, timeStyle);
    }

    console.log(`%c[${level}] %c${context} %c(+${elapsed}ms) %c${message}`, 
      style, contextStyle, timeStyle, 'color: inherit;');

    if (data !== null && data !== undefined) {
      if (typeof data === 'object') {
        console.log('Data:', data);
      } else {
        console.log('Data:', data);
      }
    }

    // Include stack trace for errors or when requested
    if ((level === 'ERROR' || options.includeStack) && logEntry.stack) {
      console.log('Stack trace:', logEntry.stack);
    }

    // Include source map information when available
    if (options.includeSourceMap && logEntry.sourceMap) {
      console.log('Source:', logEntry.sourceMap);
    }

    if (options.group) {
      console.groupEnd();
    }
  }

  /**
   * Get source map information for debugging
   * @returns {Object} Source map information
   */
  getSourceMapInfo() {
    if (!isDevelopment || !process.env.REACT_APP_SOURCE_MAPS) return null;

    try {
      const stack = new Error().stack;
      const stackLines = stack.split('\n');
      
      // Find the first non-logger stack frame
      for (let i = 2; i < stackLines.length; i++) {
        const line = stackLines[i];
        if (line && !line.includes('developmentDebugger.js')) {
          const match = line.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);
          if (match) {
            return {
              function: match[1],
              file: match[2],
              line: parseInt(match[3]),
              column: parseInt(match[4])
            };
          }
        }
      }
    } catch (error) {
      // Silently fail if source map extraction fails
    }

    return null;
  }

  /**
   * Store critical logs for later analysis
   * @param {Object} logEntry - Log entry to store
   */
  storeCriticalLog(logEntry) {
    try {
      const criticalLogs = JSON.parse(sessionStorage.getItem('dev_critical_logs') || '[]');
      criticalLogs.push(logEntry);
      
      // Keep only last 50 critical logs
      const recentLogs = criticalLogs.slice(-50);
      sessionStorage.setItem('dev_critical_logs', JSON.stringify(recentLogs));
    } catch (error) {
      console.warn('Failed to store critical log:', error);
    }
  }

  // Convenience methods
  error(message, data, options) { this.log('error', message, data, { includeStack: true, ...options }); }
  warn(message, data, options) { this.log('warn', message, data, options); }
  info(message, data, options) { this.log('info', message, data, options); }
  debug(message, data, options) { this.log('debug', message, data, options); }
  trace(message, data, options) { this.log('trace', message, data, { includeStack: true, ...options }); }
}

/**
 * Service Status Logger - Enhanced logging for service status and connections
 */
export class ServiceStatusLogger {
  constructor() {
    this.logger = new DevelopmentLogger('ServiceStatus');
    this.statusHistory = [];
  }

  /**
   * Log service initialization
   * @param {string} service - Service name
   * @param {Object} config - Service configuration
   */
  logServiceInitialization(service, config = {}) {
    const status = {
      service,
      action: 'initialization',
      timestamp: Date.now(),
      config,
      success: null
    };

    serviceDebugInfo.firebase.services[service] = {
      status: 'initializing',
      startTime: Date.now(),
      config
    };

    this.logger.info(`Initializing ${service} service`, {
      service,
      config,
      environment: getEnvironmentInfo()
    }, { group: true });

    this.statusHistory.push(status);
    return status;
  }

  /**
   * Log service initialization success
   * @param {string} service - Service name
   * @param {Object} result - Initialization result
   */
  logServiceSuccess(service, result = {}) {
    const status = this.statusHistory.find(s => 
      s.service === service && s.action === 'initialization' && s.success === null
    );

    if (status) {
      status.success = true;
      status.completedAt = Date.now();
      status.duration = status.completedAt - status.timestamp;
    }

    if (serviceDebugInfo.firebase.services[service]) {
      serviceDebugInfo.firebase.services[service].status = 'connected';
      serviceDebugInfo.firebase.services[service].connectedAt = Date.now();
    }

    this.logger.info(`✅ ${service} service initialized successfully`, {
      service,
      duration: status?.duration,
      result
    });
  }

  /**
   * Log service initialization failure
   * @param {string} service - Service name
   * @param {Error} error - Initialization error
   */
  logServiceFailure(service, error) {
    const status = this.statusHistory.find(s => 
      s.service === service && s.action === 'initialization' && s.success === null
    );

    if (status) {
      status.success = false;
      status.completedAt = Date.now();
      status.duration = status.completedAt - status.timestamp;
      status.error = error.message;
    }

    if (serviceDebugInfo.firebase.services[service]) {
      serviceDebugInfo.firebase.services[service].status = 'failed';
      serviceDebugInfo.firebase.services[service].error = error.message;
      serviceDebugInfo.firebase.services[service].failedAt = Date.now();
    }

    this.logger.error(`❌ ${service} service initialization failed`, {
      service,
      error: error.message,
      stack: error.stack,
      duration: status?.duration
    }, { includeStack: true, group: true });
  }

  /**
   * Log emulator connection attempt
   * @param {string} service - Service name
   * @param {string} host - Emulator host
   * @param {number} port - Emulator port
   */
  logEmulatorConnection(service, host, port) {
    serviceDebugInfo.emulators.lastConnectionAttempt = Date.now();
    serviceDebugInfo.emulators.connectionAttempts = 
      (serviceDebugInfo.emulators.connectionAttempts || 0) + 1;

    this.logger.debug(`Connecting to ${service} emulator`, {
      service,
      host,
      port,
      attempt: serviceDebugInfo.emulators.connectionAttempts
    });
  }

  /**
   * Log emulator connection success
   * @param {string} service - Service name
   * @param {string} host - Emulator host
   * @param {number} port - Emulator port
   */
  logEmulatorSuccess(service, host, port) {
    if (!serviceDebugInfo.emulators.connectedServices.includes(service)) {
      serviceDebugInfo.emulators.connectedServices.push(service);
    }

    // Remove from failed services if it was there
    serviceDebugInfo.emulators.failedServices = 
      serviceDebugInfo.emulators.failedServices.filter(s => s !== service);

    this.logger.info(`✅ Connected to ${service} emulator`, {
      service,
      host,
      port,
      connectedServices: serviceDebugInfo.emulators.connectedServices.length,
      totalAttempts: serviceDebugInfo.emulators.connectionAttempts
    });
  }

  /**
   * Log emulator connection failure
   * @param {string} service - Service name
   * @param {string} host - Emulator host
   * @param {number} port - Emulator port
   * @param {Error} error - Connection error
   */
  logEmulatorFailure(service, host, port, error) {
    if (!serviceDebugInfo.emulators.failedServices.includes(service)) {
      serviceDebugInfo.emulators.failedServices.push(service);
    }

    this.logger.warn(`⚠️ Failed to connect to ${service} emulator`, {
      service,
      host,
      port,
      error: error.message,
      failedServices: serviceDebugInfo.emulators.failedServices.length,
      connectedServices: serviceDebugInfo.emulators.connectedServices.length
    });
  }

  /**
   * Get current service status summary
   * @returns {Object} Service status summary
   */
  getServiceStatusSummary() {
    return {
      ...serviceDebugInfo,
      timestamp: Date.now(),
      environment: getEnvironmentInfo(),
      developmentConfig: getDevelopmentConfig()
    };
  }
}

/**
 * Development Mode Detection and Enhanced Error Reporting
 */
export class DevelopmentModeDetector {
  constructor() {
    this.logger = new DevelopmentLogger('DevModeDetector');
    this.capabilities = this.detectCapabilities();
    this.reportCapabilities();
  }

  /**
   * Detect development environment capabilities
   * @returns {Object} Detected capabilities
   */
  detectCapabilities() {
    const capabilities = {
      // Environment detection
      isDevelopment: process.env.NODE_ENV === 'development',
      isEmulatorMode: process.env.REACT_APP_USE_EMULATORS === 'true',
      
      // Source map support
      sourceMapSupport: {
        enabled: process.env.GENERATE_SOURCEMAP !== 'false',
        reactScripts: true, // React Scripts provides source maps by default
        customConfig: process.env.REACT_APP_SOURCE_MAPS === 'true'
      },
      
      // Debugging features
      debugging: {
        reactDevTools: typeof window !== 'undefined' && window.__REACT_DEVTOOLS_GLOBAL_HOOK__,
        consoleLogging: process.env.REACT_APP_CONSOLE_LOGGING === 'true',
        verboseLogging: process.env.REACT_APP_VERBOSE_LOGGING === 'true',
        errorReporting: process.env.REACT_APP_ERROR_REPORTING === 'true'
      },
      
      // Performance monitoring
      performance: {
        monitoring: process.env.REACT_APP_PERFORMANCE_MONITORING === 'true',
        webVitals: typeof window !== 'undefined' && 'PerformanceObserver' in window,
        memoryInfo: typeof window !== 'undefined' && window.performance && window.performance.memory
      },
      
      // Browser capabilities
      browser: typeof window !== 'undefined' ? {
        userAgent: window.navigator.userAgent,
        language: window.navigator.language,
        cookieEnabled: window.navigator.cookieEnabled,
        onLine: window.navigator.onLine,
        serviceWorker: 'serviceWorker' in window.navigator,
        localStorage: typeof window.localStorage !== 'undefined',
        sessionStorage: typeof window.sessionStorage !== 'undefined'
      } : null
    };

    return capabilities;
  }

  /**
   * Report detected capabilities
   */
  reportCapabilities() {
    this.logger.info('Development environment capabilities detected', this.capabilities, {
      group: true,
      includeSourceMap: true
    });

    // Report any missing capabilities
    const missing = [];
    
    if (!this.capabilities.sourceMapSupport.enabled) {
      missing.push('Source maps are disabled');
    }
    
    if (!this.capabilities.debugging.reactDevTools) {
      missing.push('React DevTools not detected');
    }
    
    if (!this.capabilities.performance.webVitals) {
      missing.push('Web Vitals API not available');
    }

    if (missing.length > 0) {
      this.logger.warn('Missing development capabilities', missing);
    }
  }

  /**
   * Enhanced error reporting with development context
   * @param {Error} error - Error to report
   * @param {Object} context - Additional context
   * @returns {Object} Enhanced error report
   */
  createEnhancedErrorReport(error, context = {}) {
    const report = {
      // Basic error information
      message: error.message,
      name: error.name,
      stack: error.stack,
      
      // Development context
      environment: {
        isDevelopment: this.capabilities.isDevelopment,
        isEmulatorMode: this.capabilities.isEmulatorMode,
        nodeEnv: process.env.NODE_ENV
      },
      
      // Source map information
      sourceMap: this.capabilities.sourceMapSupport.enabled ? 
        this.extractSourceMapInfo(error) : null,
      
      // Browser context
      browser: this.capabilities.browser,
      
      // Performance context
      performance: this.getPerformanceContext(),
      
      // Service status
      services: serviceDebugInfo,
      
      // Additional context
      context,
      
      // Timestamp
      timestamp: new Date().toISOString(),
      reportId: this.generateReportId()
    };

    return report;
  }

  /**
   * Extract source map information from error
   * @param {Error} error - Error object
   * @returns {Object|null} Source map information
   */
  extractSourceMapInfo(error) {
    if (!error.stack) return null;

    try {
      const stackLines = error.stack.split('\n');
      const sourceInfo = [];

      for (const line of stackLines) {
        const match = line.match(/at\s+(.+)\s+\((.+):(\d+):(\d+)\)/);
        if (match) {
          sourceInfo.push({
            function: match[1],
            file: match[2],
            line: parseInt(match[3]),
            column: parseInt(match[4])
          });
        }
      }

      return sourceInfo.length > 0 ? sourceInfo : null;
    } catch (extractError) {
      this.logger.warn('Failed to extract source map info', extractError);
      return null;
    }
  }

  /**
   * Get performance context for error reporting
   * @returns {Object} Performance context
   */
  getPerformanceContext() {
    if (typeof window === 'undefined' || !window.performance) return null;

    try {
      return {
        timing: {
          navigationStart: window.performance.timing.navigationStart,
          loadEventEnd: window.performance.timing.loadEventEnd,
          domContentLoaded: window.performance.timing.domContentLoadedEventEnd
        },
        memory: window.performance.memory ? {
          usedJSHeapSize: window.performance.memory.usedJSHeapSize,
          totalJSHeapSize: window.performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit
        } : null,
        now: window.performance.now()
      };
    } catch (perfError) {
      this.logger.warn('Failed to get performance context', perfError);
      return null;
    }
  }

  /**
   * Generate unique report ID
   * @returns {string} Unique report ID
   */
  generateReportId() {
    return `dev-error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Global instances
export const developmentLogger = new DevelopmentLogger('Global');
export const serviceStatusLogger = new ServiceStatusLogger();
export const developmentModeDetector = new DevelopmentModeDetector();

/**
 * Initialize development debugging system
 */
export const initializeDevelopmentDebugging = () => {
  if (!isDevelopment) return;

  developmentLogger.info('Initializing development debugging system', {
    capabilities: developmentModeDetector.capabilities,
    config: getDevelopmentConfig()
  });

  // Enhanced global error handling
  window.addEventListener('error', (event) => {
    const report = developmentModeDetector.createEnhancedErrorReport(
      event.error || new Error(event.message),
      {
        type: 'global_error',
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    );

    developmentLogger.error('Global error caught', report, {
      includeStack: true,
      includeSourceMap: true,
      group: true
    });
  });

  // Enhanced promise rejection handling
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(event.reason);
    const report = developmentModeDetector.createEnhancedErrorReport(error, {
      type: 'unhandled_promise_rejection'
    });

    developmentLogger.error('Unhandled promise rejection', report, {
      includeStack: true,
      includeSourceMap: true,
      group: true
    });
  });

  // Performance monitoring
  if (developmentModeDetector.capabilities.performance.monitoring) {
    setTimeout(() => {
      developmentLogger.info('Performance snapshot', {
        performance: developmentModeDetector.getPerformanceContext(),
        services: serviceStatusLogger.getServiceStatusSummary()
      });
    }, 5000);
  }

  developmentLogger.info('✅ Development debugging system initialized');
};

/**
 * Get development debugging status
 * @returns {Object} Current debugging status
 */
export const getDevelopmentDebuggingStatus = () => {
  return {
    initialized: true,
    capabilities: developmentModeDetector.capabilities,
    services: serviceStatusLogger.getServiceStatusSummary(),
    environment: getEnvironmentInfo(),
    timestamp: Date.now()
  };
};