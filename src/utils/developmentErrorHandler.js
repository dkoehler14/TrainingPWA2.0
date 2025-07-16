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
  if (!isDevelopment) return;

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
    const response = await fetch(`http://${host}:${port}`, {
      method: 'GET',
      mode: 'no-cors',
      signal: AbortSignal.timeout(2000) // 2 second timeout
    });
    return true;
  } catch (error) {
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

  console.log('✅ Development error handling initialized');
};