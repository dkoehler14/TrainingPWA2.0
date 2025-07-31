/**
 * Development Error Handler
 * 
 * Provides enhanced error handling, reporting, and recovery mechanisms
 * specifically for development environment issues with Supabase.
 */

import { isDevelopment, getSupabaseConfig, shouldUseSupabase } from '../config/environment';
import { CONNECTION_STATUS, getConnectionMonitor } from './supabaseConnectionMonitor';
import { SupabaseError, classifySupabaseError } from './supabaseErrorHandler';

// Error types for categorization
export const ERROR_TYPES = {
  SUPABASE_CONNECTION: 'SUPABASE_CONNECTION',
  SERVICE_STARTUP: 'SERVICE_STARTUP',
  CONFIGURATION: 'CONFIGURATION',
  NETWORK: 'NETWORK',
  SUPABASE_INIT: 'SUPABASE_INIT',
  AUTH_ERROR: 'AUTH_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  REALTIME_ERROR: 'REALTIME_ERROR'
};

// Service status tracking for Supabase services
const serviceStatus = {
  database: { connected: false, error: null, lastAttempt: null },
  auth: { connected: false, error: null, lastAttempt: null },
  realtime: { connected: false, error: null, lastAttempt: null },
  storage: { connected: false, error: null, lastAttempt: null }
};

/**
 * Enhanced error reporting for development
 * @param {Error} error - The error object
 * @param {string} errorType - Type of error from ERROR_TYPES
 * @param {string} service - Service name (database, auth, realtime, storage)
 * @param {Object} context - Additional context information
 */
export const reportDevelopmentError = (error, errorType, service = null, context = {}) => {
  // Only report errors in development environment
  if (process.env.NODE_ENV !== 'development') return;

  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    type: errorType,
    service,
    message: error.message,
    stack: error.stack,
    context,
    supabaseErrorCode: error.code || null,
    supabaseErrorDetails: error.details || null
  };

  // Update service status if applicable
  if (service && serviceStatus[service]) {
    serviceStatus[service].error = error;
    serviceStatus[service].lastAttempt = timestamp;
  }

  // Console output with enhanced formatting
  console.group(`🚨 Development Error [${errorType}]`);
  console.error(`Service: ${service || 'General'}`);
  console.error(`Time: ${timestamp}`);
  console.error(`Message: ${error.message}`);
  
  if (error.code) {
    console.error(`Supabase Code: ${error.code}`);
  }
  
  if (error.details) {
    console.error(`Details: ${error.details}`);
  }
  
  if (context && Object.keys(context).length > 0) {
    console.error('Context:', context);
  }
  
  // Provide specific troubleshooting suggestions
  provideTroubleshootingSuggestions(errorType, service, error);
  
  if (process.env.REACT_APP_VERBOSE_LOGGING === 'true') {
    console.error('Stack trace:', error.stack);
  }
  
  console.groupEnd();

  // Store error for potential recovery attempts
  storeErrorForRecovery(errorInfo);
};

/**
 * Provide contextual troubleshooting suggestions
 * @param {string} errorType - Type of error
 * @param {string} service - Service name
 * @param {Error} error - The error object
 */
const provideTroubleshootingSuggestions = (errorType, service, error) => {
  const suggestions = [];

  switch (errorType) {
    case ERROR_TYPES.SUPABASE_CONNECTION:
      suggestions.push('🔧 Check your internet connection');
      suggestions.push('🔧 Verify Supabase project URL and API keys in .env file');
      suggestions.push('🔧 Check if Supabase project is active and not paused');
      
      if (service === 'database') {
        suggestions.push('🔧 Verify database connection and RLS policies');
        suggestions.push('🔧 Check if database tables exist and are accessible');
      } else if (service === 'auth') {
        suggestions.push('🔧 Verify auth configuration and providers');
        suggestions.push('🔧 Check if email confirmation is required');
      } else if (service === 'realtime') {
        suggestions.push('🔧 Check if realtime is enabled for your tables');
        suggestions.push('🔧 Verify realtime subscription permissions');
      } else if (service === 'storage') {
        suggestions.push('🔧 Check storage bucket configuration and policies');
        suggestions.push('🔧 Verify file upload permissions');
      }
      break;

    case ERROR_TYPES.SERVICE_STARTUP:
      suggestions.push('🔧 Try restarting the development server');
      suggestions.push('🔧 Clear browser cache and local storage');
      suggestions.push('🔧 Check for port conflicts with other running services');
      suggestions.push('🔧 Verify Supabase client initialization');
      break;

    case ERROR_TYPES.CONFIGURATION:
      suggestions.push('🔧 Verify .env.development file exists and has correct values');
      suggestions.push('🔧 Check REACT_APP_USE_SUPABASE is set to "true"');
      suggestions.push('🔧 Ensure REACT_APP_SUPABASE_URL is correctly configured');
      suggestions.push('🔧 Verify REACT_APP_SUPABASE_ANON_KEY is valid');
      break;

    case ERROR_TYPES.NETWORK:
      suggestions.push('🔧 Check your internet connection');
      suggestions.push('🔧 Verify firewall settings are not blocking Supabase connections');
      suggestions.push('🔧 Try disabling VPN if active');
      suggestions.push('🔧 Check if corporate proxy is interfering');
      break;

    case ERROR_TYPES.SUPABASE_INIT:
      suggestions.push('🔧 Verify Supabase configuration object is valid');
      suggestions.push('🔧 Check if Supabase client versions are compatible');
      suggestions.push('🔧 Try clearing node_modules and reinstalling dependencies');
      suggestions.push('🔧 Ensure environment variables are loaded correctly');
      break;

    case ERROR_TYPES.AUTH_ERROR:
      suggestions.push('🔧 Check user credentials and authentication state');
      suggestions.push('🔧 Verify email confirmation if required');
      suggestions.push('🔧 Check session expiration and refresh tokens');
      suggestions.push('🔧 Review auth provider configuration');
      break;

    case ERROR_TYPES.DATABASE_ERROR:
      suggestions.push('🔧 Check Row Level Security (RLS) policies');
      suggestions.push('🔧 Verify table permissions and access rights');
      suggestions.push('🔧 Check database schema and column names');
      suggestions.push('🔧 Review query syntax and parameters');
      break;

    case ERROR_TYPES.REALTIME_ERROR:
      suggestions.push('🔧 Check if realtime is enabled for the table');
      suggestions.push('🔧 Verify realtime subscription filters');
      suggestions.push('🔧 Check network connectivity for websockets');
      suggestions.push('🔧 Review realtime channel configuration');
      break;
  }

  if (suggestions.length > 0) {
    console.warn('💡 Troubleshooting suggestions:');
    suggestions.forEach(suggestion => console.warn(suggestion));
  }
};

/**
 * Store error information for potential recovery attempts
 * @param {Object} errorInfo - Error information object
 */
const storeErrorForRecovery = (errorInfo) => {
  // Only store errors in development environment
  if (process.env.NODE_ENV !== 'development') return;
  
  // Store in sessionStorage for persistence across page reloads
  try {
    const existingErrors = JSON.parse(sessionStorage.getItem('dev_errors') || '[]');
    existingErrors.push(errorInfo);
    
    // Keep only last 10 errors to prevent storage bloat
    const recentErrors = existingErrors.slice(-10);
    sessionStorage.setItem('dev_errors', JSON.stringify(recentErrors));
  } catch (storageError) {
    console.warn('Failed to store error for recovery:', storageError);
  }
};

/**
 * Get stored development errors
 * @returns {Array} Array of stored error objects
 */
export const getStoredErrors = () => {
  try {
    return JSON.parse(sessionStorage.getItem('dev_errors') || '[]');
  } catch (error) {
    console.warn('Failed to retrieve stored errors:', error);
    return [];
  }
};

/**
 * Clear stored development errors
 */
export const clearStoredErrors = () => {
  try {
    sessionStorage.removeItem('dev_errors');
    console.log('🧹 Cleared stored development errors');
  } catch (error) {
    console.warn('Failed to clear stored errors:', error);
  }
};

/**
 * Get current service status
 * @returns {Object} Current status of all services
 */
export const getServiceStatus = () => {
  return { ...serviceStatus };
};

/**
 * Update service connection status
 * @param {string} service - Service name
 * @param {boolean} connected - Connection status
 * @param {Error} error - Error if connection failed
 */
export const updateServiceStatus = (service, connected, error = null) => {
  if (serviceStatus[service]) {
    serviceStatus[service].connected = connected;
    serviceStatus[service].error = error;
    serviceStatus[service].lastAttempt = new Date().toISOString();
  }
};

/**
 * Check if Supabase service is available
 * @param {string} service - Service to check (database, auth, realtime, storage)
 * @returns {Promise<boolean>} True if service appears to be available
 */
export const checkSupabaseServiceAvailability = async (service = 'database') => {
  try {
    const supabaseConfig = getSupabaseConfig();
    if (!supabaseConfig.enabled || !supabaseConfig.url) {
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    let testUrl;
    switch (service) {
      case 'database':
        testUrl = `${supabaseConfig.url}/rest/v1/`;
        break;
      case 'auth':
        testUrl = `${supabaseConfig.url}/auth/v1/settings`;
        break;
      case 'realtime':
        testUrl = `${supabaseConfig.url}/realtime/v1/`;
        break;
      case 'storage':
        testUrl = `${supabaseConfig.url}/storage/v1/`;
        break;
      default:
        testUrl = `${supabaseConfig.url}/rest/v1/`;
    }

    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'apikey': supabaseConfig.anonKey,
        'Authorization': `Bearer ${supabaseConfig.anonKey}`
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return response.status < 500; // Accept any non-server error status
  } catch (fetchError) {
    // More specific error handling for different failure types
    if (fetchError.name === 'AbortError') {
      console.warn(`Timeout checking ${service} service - may not be available`);
    } else if (fetchError.message.includes('Failed to fetch')) {
      console.warn(`Network error checking ${service} service - likely not available`);
    }
    return false;
  }
};

/**
 * Attempt to recover from Supabase connection failures
 * @param {string} service - Service to recover
 * @returns {Promise<boolean>} True if recovery was successful
 */
export const attemptServiceRecovery = async (service) => {
  if (!isDevelopment) return false;

  console.log(`🔄 Attempting to recover ${service} service...`);
  
  // Check if service is available
  const isAvailable = await checkSupabaseServiceAvailability(service);
  
  if (!isAvailable) {
    console.warn(`${service} service not available`);
    reportDevelopmentError(
      new Error(`${service} service not responding`),
      ERROR_TYPES.SUPABASE_CONNECTION,
      service,
      { recoveryAttempt: true }
    );
    return false;
  }

  console.log(`✅ ${service} service appears to be available`);
  
  // Try to use connection monitor for additional recovery
  const connectionMonitor = getConnectionMonitor();
  if (connectionMonitor && service === 'database') {
    const recoverySuccess = await connectionMonitor.attemptRecovery();
    if (recoverySuccess) {
      updateServiceStatus(service, true);
      return true;
    }
  }
  
  updateServiceStatus(service, true);
  return true;
};

/**
 * Graceful fallback handler for when Supabase services are not available
 * @param {string} service - Service that failed
 * @param {Error} error - The connection error
 * @returns {Object} Fallback configuration or instructions
 */
export const handleSupabaseFallback = (service, error) => {
  console.warn(`⚠️  ${service} service not available, implementing fallback...`);
  
  reportDevelopmentError(error, ERROR_TYPES.SUPABASE_CONNECTION, service, {
    fallbackActivated: true
  });

  const fallbackOptions = {
    database: {
      message: 'Database service unavailable. Data operations will fail until connection is restored.',
      action: 'Check Supabase project status and network connectivity',
      canContinue: false
    },
    auth: {
      message: 'Auth service unavailable. Authentication will fail until service is restored.',
      action: 'Check Supabase auth configuration and project status',
      canContinue: false
    },
    realtime: {
      message: 'Realtime service unavailable. Live updates will not work until service is restored.',
      action: 'Check Supabase realtime configuration and websocket connectivity',
      canContinue: true
    },
    storage: {
      message: 'Storage service unavailable. File operations will fail until service is restored.',
      action: 'Check Supabase storage configuration and bucket policies',
      canContinue: true
    }
  };

  const fallback = fallbackOptions[service] || {
    message: `${service} service unavailable`,
    action: 'Check service configuration and connectivity',
    canContinue: false
  };

  console.warn(`💡 ${fallback.message}`);
  console.warn(`🔧 ${fallback.action}`);

  return fallback;
};

/**
 * Enhanced Supabase service initialization with error handling
 * @param {Function} initFunction - Supabase service initialization function
 * @param {string} serviceName - Name of the service being initialized
 * @param {Object} options - Additional options for initialization
 * @returns {Promise<any>} Initialized service or null if failed
 */
export const initializeSupabaseServiceWithErrorHandling = async (initFunction, serviceName, options = {}) => {
  if (!isDevelopment) {
    // In production, just run the initialization function
    return initFunction();
  }

  try {
    console.log(`🔧 Initializing ${serviceName} service...`);
    const service = await initFunction();
    console.log(`✅ ${serviceName} service initialized successfully`);
    updateServiceStatus(serviceName, true);
    return service;
  } catch (initError) {
    reportDevelopmentError(
      initError,
      ERROR_TYPES.SUPABASE_INIT,
      serviceName,
      {
        initializationPhase: true,
        options,
        timestamp: new Date().toISOString()
      }
    );

    // Attempt graceful fallback
    const fallback = handleServiceInitializationFallback(serviceName, initError, options);
    
    if (fallback.canContinue) {
      console.warn(`⚠️  Continuing with limited ${serviceName} functionality`);
      return fallback.fallbackService;
    } else {
      console.error(`❌ Critical ${serviceName} initialization failure`);
      updateServiceStatus(serviceName, false, initError);
      throw initError;
    }
  }
};

/**
 * Handle Supabase service initialization failures with fallback options
 * @param {string} serviceName - Name of the service that failed
 * @param {Error} error - The initialization error
 * @param {Object} options - Initialization options
 * @returns {Object} Fallback configuration
 */
export const handleServiceInitializationFallback = (serviceName, error, options = {}) => {
  console.warn(`🔄 Handling ${serviceName} initialization failure...`);

  const fallbackStrategies = {
    database: {
      canContinue: false, // Database is critical for most operations
      message: 'Database initialization failed. Database operations will not work.',
      action: 'Check Supabase configuration and network connectivity',
      fallbackService: null,
      criticalityLevel: 'high'
    },
    auth: {
      canContinue: true, // App can run without auth in development
      message: 'Auth initialization failed. Authentication features will be disabled.',
      action: 'Check Supabase Auth configuration or continue without authentication',
      fallbackService: createMockAuthService(),
      criticalityLevel: 'medium'
    },
    realtime: {
      canContinue: true, // App can run without realtime in some cases
      message: 'Realtime initialization failed. Live updates will not work.',
      action: 'Check Supabase Realtime configuration or use polling for updates',
      fallbackService: createMockRealtimeService(),
      criticalityLevel: 'medium'
    },
    storage: {
      canContinue: true, // App can run without storage in some cases
      message: 'Storage initialization failed. File operations will not work.',
      action: 'Check Supabase Storage configuration or disable file features',
      fallbackService: createMockStorageService(),
      criticalityLevel: 'low'
    }
  };

  const fallback = fallbackStrategies[serviceName] || {
    canContinue: false,
    message: `${serviceName} initialization failed`,
    action: 'Check service configuration',
    fallbackService: null,
    criticalityLevel: 'high'
  };

  console.warn(`💡 ${fallback.message}`);
  console.warn(`🔧 ${fallback.action}`);
  console.warn(`⚠️  Criticality: ${fallback.criticalityLevel}`);

  return fallback;
};

/**
 * Create a mock auth service for development fallback
 * @returns {Object} Mock auth service
 */
const createMockAuthService = () => {
  console.warn('🎭 Creating mock auth service for development');
  return {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: (callback) => {
      console.warn('Mock auth: onAuthStateChange called');
      callback('SIGNED_OUT', null);
      return { data: { subscription: { unsubscribe: () => {} } } };
    },
    signInWithPassword: () => {
      console.warn('Mock auth: signInWithPassword called');
      return Promise.resolve({ 
        data: { user: null, session: null }, 
        error: new Error('Auth service not available in development') 
      });
    },
    signOut: () => {
      console.warn('Mock auth: signOut called');
      return Promise.resolve({ error: null });
    }
  };
};

/**
 * Create a mock realtime service for development fallback
 * @returns {Object} Mock realtime service
 */
const createMockRealtimeService = () => {
  console.warn('🎭 Creating mock realtime service for development');
  return {
    channel: (name) => {
      console.warn(`Mock realtime: channel(${name}) called`);
      return {
        on: (event, filter, callback) => {
          console.warn(`Mock realtime: on(${event}) called`);
          return { unsubscribe: () => {} };
        },
        subscribe: (callback) => {
          console.warn('Mock realtime: subscribe called');
          if (callback) callback('SUBSCRIBED');
          return 'SUBSCRIBED';
        },
        unsubscribe: () => {
          console.warn('Mock realtime: unsubscribe called');
          return 'ok';
        }
      };
    }
  };
};

/**
 * Create a mock storage service for development fallback
 * @returns {Object} Mock storage service
 */
const createMockStorageService = () => {
  console.warn('🎭 Creating mock storage service for development');
  return {
    from: (bucket) => {
      console.warn(`Mock storage: from(${bucket}) called`);
      return {
        upload: () => {
          console.warn('Mock storage: upload called');
          return Promise.resolve({ 
            data: null, 
            error: new Error('Storage service not available in development') 
          });
        },
        download: () => {
          console.warn('Mock storage: download called');
          return Promise.resolve({ 
            data: null, 
            error: new Error('Storage service not available in development') 
          });
        }
      };
    }
  };
};

/**
 * Enhanced Supabase connection retry mechanism
 * @param {string} service - Service to retry connection for
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} retryDelay - Delay between retries in milliseconds
 * @returns {Promise<boolean>} True if connection was successful
 */
export const retrySupabaseConnection = async (service, maxRetries = 3, retryDelay = 2000) => {
  if (!isDevelopment) return false;

  console.log(`🔄 Starting retry sequence for ${service} service (max ${maxRetries} attempts)`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 Attempt ${attempt}/${maxRetries} for ${service} service`);
    
    const success = await attemptServiceRecovery(service);
    
    if (success) {
      console.log(`✅ ${service} service connection successful on attempt ${attempt}`);
      return true;
    }

    if (attempt < maxRetries) {
      console.log(`⏳ Waiting ${retryDelay}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  console.error(`❌ Failed to connect to ${service} service after ${maxRetries} attempts`);
  reportDevelopmentError(
    new Error(`${service} service connection failed after ${maxRetries} retries`),
    ERROR_TYPES.SUPABASE_CONNECTION,
    service,
    { maxRetries, retryDelay, finalAttempt: true }
  );

  return false;
};

/**
 * Validate Supabase service health and connectivity
 * @returns {Promise<Object>} Health check results
 */
export const performSupabaseHealthCheck = async () => {
  if (!isDevelopment) return { healthy: true, services: {} };

  console.log('🏥 Performing Supabase services health check...');
  
  const healthResults = {
    healthy: true,
    timestamp: new Date().toISOString(),
    services: {},
    recommendations: []
  };

  const supabaseConfig = getSupabaseConfig();
  
  if (!supabaseConfig.enabled) {
    healthResults.healthy = false;
    healthResults.recommendations.push('Enable Supabase by setting REACT_APP_USE_SUPABASE=true');
    return healthResults;
  }

  const services = ['database', 'auth', 'realtime', 'storage'];
  
  for (const service of services) {
    const isAvailable = await checkSupabaseServiceAvailability(service);
    const serviceStatus = getServiceStatus()[service];
    
    healthResults.services[service] = {
      available: isAvailable,
      connected: serviceStatus?.connected || false,
      lastError: serviceStatus?.error?.message || null,
      lastAttempt: serviceStatus?.lastAttempt || null
    };

    if (!isAvailable) {
      healthResults.healthy = false;
      healthResults.recommendations.push(`Check ${service} service connectivity and configuration`);
    }
  }

  // Check connection monitor status
  const connectionMonitor = getConnectionMonitor();
  if (connectionMonitor) {
    const monitorStatus = connectionMonitor.getStatus();
    healthResults.connectionMonitor = {
      status: monitorStatus,
      isHealthy: monitorStatus === CONNECTION_STATUS.CONNECTED
    };
    
    if (monitorStatus !== CONNECTION_STATUS.CONNECTED) {
      healthResults.healthy = false;
      healthResults.recommendations.push('Connection monitor reports unhealthy status');
    }
  }

  // Log health check results
  if (healthResults.healthy) {
    console.log('✅ All Supabase services are healthy');
  } else {
    console.warn('⚠️  Some Supabase services have issues:');
    healthResults.recommendations.forEach(rec => console.warn(`  - ${rec}`));
  }

  return healthResults;
};

/**
 * Initialize development error monitoring for Supabase
 */
export const initializeDevelopmentErrorHandling = () => {
  if (!isDevelopment) return;

  console.log('🔧 Initializing development error handling for Supabase...');

  // Global error handler for unhandled errors
  window.addEventListener('error', (event) => {
    reportDevelopmentError(
      event.error || new Error(event.message),
      ERROR_TYPES.SERVICE_STARTUP,
      null,
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    );
  });

  // Promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason instanceof Error ? event.reason : new Error(event.reason);
    const errorType = error instanceof SupabaseError ? 
      (error.name.includes('Auth') ? ERROR_TYPES.AUTH_ERROR : 
       error.name.includes('Connection') ? ERROR_TYPES.SUPABASE_CONNECTION : 
       ERROR_TYPES.DATABASE_ERROR) : 
      ERROR_TYPES.SERVICE_STARTUP;
    
    reportDevelopmentError(
      error,
      errorType,
      null,
      { unhandledPromise: true }
    );
  });

  // Periodic service health check
  if (shouldUseSupabase()) {
    setInterval(async () => {
      const services = ['database', 'auth', 'realtime', 'storage'];
      for (const service of services) {
        const isAvailable = await checkSupabaseServiceAvailability(service);
        updateServiceStatus(service, isAvailable);
      }
    }, 30000); // Check every 30 seconds
  }

  // Perform initial health check
  setTimeout(async () => {
    await performSupabaseHealthCheck();
  }, 5000); // Wait 5 seconds after initialization

  console.log('✅ Development error handling for Supabase initialized');
};