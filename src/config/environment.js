/**
 * Environment Configuration System
 * 
 * This module handles environment detection and Firebase configuration switching
 * between development (with emulators) and production environments.
 */

// Environment detection
const isDevelopment = process.env.NODE_ENV === 'development';
const isEmulatorMode = process.env.REACT_APP_USE_EMULATORS === 'true';

// Production Firebase configuration (from environment variables)
const productionFirebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Development/Emulator configuration
const emulatorConfig = {
  // Use the same project ID for emulators
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'demo-project',
  // Emulator-specific settings will be handled by connection functions
  apiKey: 'demo-key',
  authDomain: 'localhost',
  storageBucket: 'demo-bucket',
  messagingSenderId: '123456789',
  appId: 'demo-app-id'
};

// Emulator ports configuration
const emulatorPorts = {
  functions: 5001,
  firestore: 8080,
  auth: 9099,
  ui: 4000
};

/**
 * Get the appropriate Firebase configuration based on environment
 * @returns {Object} Firebase configuration object
 */
export const getFirebaseConfig = () => {
  if (isDevelopment && isEmulatorMode) {
    console.log('🔧 Using Firebase Emulator configuration');
    return emulatorConfig;
  }
  
  console.log('🚀 Using Production Firebase configuration');
  return productionFirebaseConfig;
};

/**
 * Check if we should use Firebase emulators
 * @returns {boolean} True if emulators should be used
 */
export const shouldUseEmulators = () => {
  return isDevelopment && isEmulatorMode;
};

/**
 * Get emulator connection configuration
 * @returns {Object} Emulator ports and settings
 */
export const getEmulatorConfig = () => {
  return {
    ports: emulatorPorts,
    host: 'localhost',
    ui: {
      enabled: true,
      port: emulatorPorts.ui
    }
  };
};

/**
 * Validate required environment variables
 * @throws {Error} If required environment variables are missing
 */
export const validateEnvironmentConfig = () => {
  // In emulator mode, we don't need all production environment variables
  if (isDevelopment && isEmulatorMode) {
    // Only require project ID for emulators
    if (!process.env.REACT_APP_FIREBASE_PROJECT_ID) {
      console.warn('⚠️  REACT_APP_FIREBASE_PROJECT_ID not set, using demo-project');
    }
    return;
  }

  // For production, validate all required environment variables
  const requiredEnvVars = [
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID',
    'REACT_APP_FIREBASE_STORAGE_BUCKET',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
    'REACT_APP_FIREBASE_APP_ID'
  ];

  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingEnvVars.join(', ')}. Please check your .env file.`
    );
  }
};

/**
 * Get development-specific configuration flags
 * @returns {Object} Development configuration flags
 */
export const getDevelopmentConfig = () => {
  return {
    debugMode: process.env.REACT_APP_DEBUG_MODE === 'true',
    verboseLogging: process.env.REACT_APP_VERBOSE_LOGGING === 'true',
    enableDevTools: process.env.REACT_APP_ENABLE_DEV_TOOLS === 'true',
    testMode: process.env.REACT_APP_TEST_MODE === 'true',
    mockExternalApis: process.env.REACT_APP_MOCK_EXTERNAL_APIS === 'true',
    emulatorHost: process.env.REACT_APP_EMULATOR_HOST || 'localhost',
    errorReporting: process.env.REACT_APP_ERROR_REPORTING !== 'false', // Default to true
    autoRecovery: process.env.REACT_APP_AUTO_RECOVERY !== 'false', // Default to true
    healthChecks: process.env.REACT_APP_HEALTH_CHECKS !== 'false' // Default to true
  };
};

/**
 * Get Supabase configuration based on environment
 * @returns {Object} Supabase configuration object
 */
export const getSupabaseConfig = () => {
  const useSupabase = process.env.REACT_APP_USE_SUPABASE === 'true';
  const isLocalSupabase = isDevelopment && process.env.REACT_APP_SUPABASE_LOCAL_URL;
  
  if (!useSupabase) {
    return {
      enabled: false,
      reason: 'Supabase is disabled via REACT_APP_USE_SUPABASE'
    };
  }
  
  if (isLocalSupabase) {
    return {
      enabled: true,
      environment: 'local',
      url: process.env.REACT_APP_SUPABASE_LOCAL_URL || 'http://localhost:54321',
      anonKey: process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
    };
  }
  
  return {
    enabled: true,
    environment: 'remote',
    url: process.env.REACT_APP_SUPABASE_URL,
    anonKey: process.env.REACT_APP_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
  };
};

/**
 * Check if we should use Supabase instead of Firebase
 * @returns {boolean} True if Supabase should be used
 */
export const shouldUseSupabase = () => {
  const config = getSupabaseConfig();
  return config.enabled && !!(config.url && config.anonKey);
};

/**
 * Validate Supabase environment configuration
 * @throws {Error} If required Supabase environment variables are missing
 */
export const validateSupabaseConfig = () => {
  const config = getSupabaseConfig();
  
  if (!config.enabled) {
    return; // Supabase is disabled, no validation needed
  }
  
  const requiredVars = ['url', 'anonKey'];
  const missingVars = requiredVars.filter(key => !config[key]);
  
  if (missingVars.length > 0) {
    const envVarNames = missingVars.map(key => {
      switch (key) {
        case 'url': return config.environment === 'local' ? 'REACT_APP_SUPABASE_LOCAL_URL' : 'REACT_APP_SUPABASE_URL';
        case 'anonKey': return config.environment === 'local' ? 'REACT_APP_SUPABASE_LOCAL_ANON_KEY' : 'REACT_APP_SUPABASE_ANON_KEY';
        default: return key;
      }
    });
    
    throw new Error(
      `Missing required Supabase environment variables: ${envVarNames.join(', ')}. Please check your .env file.`
    );
  }
};

/**
 * Get current environment information for debugging
 * @returns {Object} Environment information
 */
export const getEnvironmentInfo = () => {
  const supabaseConfig = getSupabaseConfig();
  
  return {
    nodeEnv: process.env.NODE_ENV,
    isDevelopment,
    isEmulatorMode,
    shouldUseEmulators: shouldUseEmulators(),
    shouldUseSupabase: shouldUseSupabase(),
    emulatorPorts: shouldUseEmulators() ? emulatorPorts : null,
    supabaseConfig: {
      enabled: supabaseConfig.enabled,
      environment: supabaseConfig.environment,
      configured: !!(supabaseConfig.url && supabaseConfig.anonKey)
    },
    developmentConfig: isDevelopment ? getDevelopmentConfig() : null
  };
};

// Export environment flags for convenience
export { isDevelopment, isEmulatorMode };