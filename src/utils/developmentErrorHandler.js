/**
 * Development Error Handler
 * 
 * Provides enhanced error handling, reporting, and recovery mechanisms
 * specifically for development environment issues.
 */

import { isDevelopment, getEmulatorConfig } from '../config/environment';

// Error types for categorization
export const ERROR_TYPES = {
  EMULATOR_CONNECTION: 'EMULATOR_CONNECTION',
  SERVICE_STARTUP: 'SERVICE_STARTUP',
  CONFIGURATION: 'CONFIGURATION',
  NETWORK: 'NETWORK',
  FIREBASE_INIT: 'FIREBASE_INIT'
};

// Service status tracking
const serviceStatus = {
  firestore: { connected: false, error: null, lastAttempt: null },
  auth: { connected: false, error: null, lastAttempt: null },
  functions: { connected: false, error: null, lastAttempt: null }
};

/**
 * Enhanced error reporting for development
 * @param {Error} error - The error object
 * @param {string} errorType - Type of error from ERROR_TYPES
 * @param {string} service - Service name (firestore, auth, functions)
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
    context
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
    case ERROR_TYPES.EMULATOR_CONNECTION:
      suggestions.push('🔧 Make sure Firebase emulators are running: firebase emulators:start');
      suggestions.push('🔧 Check if the emulator ports are available and not blocked');
      suggestions.push('🔧 Verify firebase.json emulator configuration');
      
      if (service === 'firestore') {
        suggestions.push('🔧 Firestore emulator should be on localhost:8080');
      } else if (service === 'auth') {
        suggestions.push('🔧 Auth emulator should be on localhost:9099');
      } else if (service === 'functions') {
        suggestions.push('🔧 Functions emulator should be on localhost:5001');
      }
      break;

    case ERROR_TYPES.SERVICE_STARTUP:
      suggestions.push('🔧 Try restarting the development server');
      suggestions.push('🔧 Clear browser cache and local storage');
      suggestions.push('🔧 Check for port conflicts with other running services');
      break;

    case ERROR_TYPES.CONFIGURATION:
      suggestions.push('🔧 Verify .env.development file exists and has correct values');
      suggestions.push('🔧 Check REACT_APP_USE_EMULATORS is set to "true"');
      suggestions.push('🔧 Ensure Firebase project ID is correctly configured');
      break;

    case ERROR_TYPES.NETWORK:
      suggestions.push('🔧 Check your internet connection');
      suggestions.push('🔧 Verify firewall settings are not blocking local connections');
      suggestions.push('🔧 Try disabling VPN if active');
      break;

    case ERROR_TYPES.FIREBASE_INIT:
      suggestions.push('🔧 Verify Firebase configuration object is valid');
      suggestions.push('🔧 Check if Firebase SDK versions are compatible');
      suggestions.push('🔧 Try clearing node_modules and reinstalling dependencies');
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
 * Check if emulator is likely running on specified port
 * @param {string} host - Host to check
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if port appears to be in use
 */
export const checkEmulatorAvailability = async (host = 'localhost', port) => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    await fetch(`http://${host}:${port}`, {
      method: 'GET',
      mode: 'no-cors',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    return true;
  } catch (fetchError) {
    // More specific error handling for different failure types
    if (fetchError.name === 'AbortError') {
      console.warn(`Timeout checking ${host}:${port} - emulator may not be running`);
    } else if (fetchError.message.includes('Failed to fetch')) {
      console.warn(`Network error checking ${host}:${port} - emulator likely not running`);
    }
    return false;
  }
};

/**
 * Attempt to recover from emulator connection failures
 * @param {string} service - Service to recover
 * @returns {Promise<boolean>} True if recovery was successful
 */
export const attemptServiceRecovery = async (service) => {
  if (!isDevelopment) return false;

  console.log(`🔄 Attempting to recover ${service} service...`);
  
  const emulatorConfig = getEmulatorConfig();
  const servicePort = emulatorConfig.ports[service];
  
  if (!servicePort) {
    console.warn(`No port configuration found for ${service}`);
    return false;
  }

  // Check if emulator is available
  const isAvailable = await checkEmulatorAvailability('localhost', servicePort);
  
  if (!isAvailable) {
    console.warn(`${service} emulator not available on port ${servicePort}`);
    reportDevelopmentError(
      new Error(`${service} emulator not responding`),
      ERROR_TYPES.EMULATOR_CONNECTION,
      service,
      { port: servicePort, recoveryAttempt: true }
    );
    return false;
  }

  console.log(`✅ ${service} emulator appears to be available on port ${servicePort}`);
  return true;
};

/**
 * Graceful fallback handler for when emulators are not available
 * @param {string} service - Service that failed
 * @param {Error} error - The connection error
 * @returns {Object} Fallback configuration or instructions
 */
export const handleEmulatorFallback = (service, error) => {
  console.warn(`⚠️  ${service} emulator not available, implementing fallback...`);
  
  reportDevelopmentError(error, ERROR_TYPES.EMULATOR_CONNECTION, service, {
    fallbackActivated: true
  });

  const fallbackOptions = {
    firestore: {
      message: 'Firestore emulator unavailable. Data operations will fail until emulator is started.',
      action: 'Start Firebase emulators with: firebase emulators:start',
      canContinue: false
    },
    auth: {
      message: 'Auth emulator unavailable. Authentication will fail until emulator is started.',
      action: 'Start Firebase emulators with: firebase emulators:start',
      canContinue: false
    },
    functions: {
      message: 'Functions emulator unavailable. API calls will fail until emulator is started.',
      action: 'Start Firebase emulators with: firebase emulators:start',
      canContinue: false
    }
  };

  const fallback = fallbackOptions[service] || {
    message: `${service} service unavailable`,
    action: 'Check service configuration',
    canContinue: false
  };

  console.warn(`💡 ${fallback.message}`);
  console.warn(`🔧 ${fallback.action}`);

  return fallback;
};

/**
 * Enhanced Firebase service initialization with error handling
 * @param {Function} initFunction - Firebase service initialization function
 * @param {string} serviceName - Name of the service being initialized
 * @param {Object} options - Additional options for initialization
 * @returns {Promise<any>} Initialized service or null if failed
 */
export const initializeFirebaseServiceWithErrorHandling = async (initFunction, serviceName, options = {}) => {
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
      ERROR_TYPES.FIREBASE_INIT,
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
 * Handle Firebase service initialization failures with fallback options
 * @param {string} serviceName - Name of the service that failed
 * @param {Error} error - The initialization error
 * @param {Object} options - Initialization options
 * @returns {Object} Fallback configuration
 */
export const handleServiceInitializationFallback = (serviceName, error, options = {}) => {
  console.warn(`🔄 Handling ${serviceName} initialization failure...`);

  const fallbackStrategies = {
    firestore: {
      canContinue: false, // Firestore is critical for most operations
      message: 'Firestore initialization failed. Database operations will not work.',
      action: 'Check Firebase configuration and network connectivity',
      fallbackService: null,
      criticalityLevel: 'high'
    },
    auth: {
      canContinue: true, // App can run without auth in development
      message: 'Auth initialization failed. Authentication features will be disabled.',
      action: 'Check Firebase Auth configuration or continue without authentication',
      fallbackService: createMockAuthService(),
      criticalityLevel: 'medium'
    },
    functions: {
      canContinue: true, // App can run without functions in some cases
      message: 'Functions initialization failed. API calls may not work.',
      action: 'Check Firebase Functions configuration or use mock data',
      fallbackService: createMockFunctionsService(),
      criticalityLevel: 'medium'
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
    currentUser: null,
    onAuthStateChanged: (callback) => {
      console.warn('Mock auth: onAuthStateChanged called');
      callback(null);
      return () => {}; // Unsubscribe function
    },
    signInWithEmailAndPassword: () => {
      console.warn('Mock auth: signInWithEmailAndPassword called');
      return Promise.reject(new Error('Auth service not available in development'));
    },
    signOut: () => {
      console.warn('Mock auth: signOut called');
      return Promise.resolve();
    }
  };
};

/**
 * Create a mock functions service for development fallback
 * @returns {Object} Mock functions service
 */
const createMockFunctionsService = () => {
  console.warn('🎭 Creating mock functions service for development');
  return {
    httpsCallable: (functionName) => {
      console.warn(`Mock functions: httpsCallable(${functionName}) called`);
      return () => {
        console.warn(`Mock functions: Calling ${functionName}`);
        return Promise.reject(new Error(`Function ${functionName} not available in development`));
      };
    }
  };
};

/**
 * Enhanced emulator connection retry mechanism
 * @param {string} service - Service to retry connection for
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} retryDelay - Delay between retries in milliseconds
 * @returns {Promise<boolean>} True if connection was successful
 */
export const retryEmulatorConnection = async (service, maxRetries = 3, retryDelay = 2000) => {
  if (!isDevelopment) return false;

  console.log(`🔄 Starting retry sequence for ${service} emulator (max ${maxRetries} attempts)`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 Attempt ${attempt}/${maxRetries} for ${service} emulator`);
    
    const success = await attemptServiceRecovery(service);
    
    if (success) {
      console.log(`✅ ${service} emulator connection successful on attempt ${attempt}`);
      return true;
    }

    if (attempt < maxRetries) {
      console.log(`⏳ Waiting ${retryDelay}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  console.error(`❌ Failed to connect to ${service} emulator after ${maxRetries} attempts`);
  reportDevelopmentError(
    new Error(`${service} emulator connection failed after ${maxRetries} retries`),
    ERROR_TYPES.EMULATOR_CONNECTION,
    service,
    { maxRetries, retryDelay, finalAttempt: true }
  );

  return false;
};

/**
 * Validate Firebase service health and connectivity
 * @returns {Promise<Object>} Health check results
 */
export const performFirebaseHealthCheck = async () => {
  if (!isDevelopment) return { healthy: true, services: {} };

  console.log('🏥 Performing Firebase services health check...');
  
  const healthResults = {
    healthy: true,
    timestamp: new Date().toISOString(),
    services: {},
    recommendations: []
  };

  const emulatorConfig = getEmulatorConfig();
  
  for (const [service, port] of Object.entries(emulatorConfig.ports)) {
    if (service === 'ui') continue; // Skip UI port
    
    const isAvailable = await checkEmulatorAvailability('localhost', port);
    const serviceStatus = getServiceStatus()[service];
    
    healthResults.services[service] = {
      available: isAvailable,
      connected: serviceStatus?.connected || false,
      port,
      lastError: serviceStatus?.error?.message || null,
      lastAttempt: serviceStatus?.lastAttempt || null
    };

    if (!isAvailable) {
      healthResults.healthy = false;
      healthResults.recommendations.push(`Start ${service} emulator on port ${port}`);
    }
  }

  // Log health check results
  if (healthResults.healthy) {
    console.log('✅ All Firebase services are healthy');
  } else {
    console.warn('⚠️  Some Firebase services have issues:');
    healthResults.recommendations.forEach(rec => console.warn(`  - ${rec}`));
  }

  return healthResults;
};

/**
 * Initialize development error monitoring
 */
export const initializeDevelopmentErrorHandling = () => {
  if (!isDevelopment) return;

  console.log('🔧 Initializing development error handling...');

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
    reportDevelopmentError(
      event.reason instanceof Error ? event.reason : new Error(event.reason),
      ERROR_TYPES.SERVICE_STARTUP,
      null,
      { unhandledPromise: true }
    );
  });

  // Periodic service health check
  if (process.env.REACT_APP_USE_EMULATORS === 'true') {
    setInterval(async () => {
      const emulatorConfig = getEmulatorConfig();
      for (const [service, port] of Object.entries(emulatorConfig.ports)) {
        if (service !== 'ui') {
          const isAvailable = await checkEmulatorAvailability('localhost', port);
          updateServiceStatus(service, isAvailable);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  // Perform initial health check
  setTimeout(async () => {
    await performFirebaseHealthCheck();
  }, 5000); // Wait 5 seconds after initialization

  console.log('✅ Development error handling initialized');
};