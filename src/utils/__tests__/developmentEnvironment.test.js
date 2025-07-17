/**
 * Development Environment Integration Tests
 * 
 * Tests for validating local development environment setup including:
 * - Emulator connectivity and service integration
 * - Environment switching between development and production
 * - Service initialization and error handling
 */

import {
  getFirebaseConfig,
  shouldUseEmulators,
  validateEnvironmentConfig,
  getEnvironmentInfo,
  getDevelopmentConfig,
  getEmulatorConfig
} from '../../config/environment';

import {
  performFirebaseHealthCheck,
  checkEmulatorAvailability,
  getServiceStatus,
  updateServiceStatus,
  clearStoredErrors
} from '../../utils/developmentErrorHandler';

// Mock environment variables for testing
const mockEnvVars = {
  development: {
    NODE_ENV: 'development',
    REACT_APP_USE_EMULATORS: 'true',
    REACT_APP_FIREBASE_PROJECT_ID: 'test-project',
    REACT_APP_DEBUG_MODE: 'true'
  },
  production: {
    NODE_ENV: 'production',
    REACT_APP_USE_EMULATORS: 'false',
    REACT_APP_FIREBASE_API_KEY: 'test-api-key',
    REACT_APP_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
    REACT_APP_FIREBASE_PROJECT_ID: 'test-project',
    REACT_APP_FIREBASE_STORAGE_BUCKET: 'test.appspot.com',
    REACT_APP_FIREBASE_MESSAGING_SENDER_ID: '123456789',
    REACT_APP_FIREBASE_APP_ID: 'test-app-id'
  }
};

// Helper function to set environment variables
const setEnvironment = (envType) => {
  const envVars = mockEnvVars[envType];
  Object.keys(envVars).forEach(key => {
    process.env[key] = envVars[key];
  });
  
  // Clear require cache to get fresh config
  delete require.cache[require.resolve('../../config/environment')];
};

// Helper function to clear environment variables
const clearEnvironment = () => {
  Object.keys(mockEnvVars.development).forEach(key => {
    delete process.env[key];
  });
  Object.keys(mockEnvVars.production).forEach(key => {
    delete process.env[key];
  });
  
  // Clear require cache to get fresh config
  delete require.cache[require.resolve('../../config/environment')];
};

describe('Development Environment Integration Tests', () => {
  beforeEach(() => {
    clearEnvironment();
    clearStoredErrors();
    jest.clearAllMocks();
  });

  afterEach(() => {
    clearEnvironment();
  });

  describe('Environment Configuration Tests', () => {
    test('should detect development environment correctly', () => {
      setEnvironment('development');
      
      const envInfo = getEnvironmentInfo();
      
      expect(envInfo.isDevelopment).toBe(true);
      expect(envInfo.isEmulatorMode).toBe(true);
      expect(envInfo.shouldUseEmulators).toBe(true);
      expect(envInfo.emulatorPorts).toBeDefined();
      expect(envInfo.developmentConfig).toBeDefined();
    });

    test('should detect production environment correctly', () => {
      setEnvironment('production');
      
      const envInfo = getEnvironmentInfo();
      
      expect(envInfo.isDevelopment).toBe(false);
      expect(envInfo.isEmulatorMode).toBe(false);
      expect(envInfo.shouldUseEmulators).toBe(false);
      expect(envInfo.emulatorPorts).toBeNull();
      expect(envInfo.developmentConfig).toBeNull();
    });

    test('should return correct Firebase config for development', () => {
      setEnvironment('development');
      
      const config = getFirebaseConfig();
      
      expect(config.projectId).toBe('test-project');
      expect(config.apiKey).toBe('demo-key');
      expect(config.authDomain).toBe('localhost');
    });

    test('should return correct Firebase config for production', () => {
      setEnvironment('production');
      
      const config = getFirebaseConfig();
      
      expect(config.apiKey).toBe('test-api-key');
      expect(config.authDomain).toBe('test.firebaseapp.com');
      expect(config.projectId).toBe('test-project');
    });

    test('should validate environment configuration in development', () => {
      setEnvironment('development');
      
      expect(() => validateEnvironmentConfig()).not.toThrow();
    });

    test('should validate environment configuration in production', () => {
      setEnvironment('production');
      
      expect(() => validateEnvironmentConfig()).not.toThrow();
    });

    test('should throw error for missing production environment variables', () => {
      process.env.NODE_ENV = 'production';
      process.env.REACT_APP_USE_EMULATORS = 'false';
      // Missing other required variables
      
      expect(() => validateEnvironmentConfig()).toThrow(/Missing required environment variables/);
    });
  });

  describe('Emulator Connectivity Tests', () => {
    beforeEach(() => {
      setEnvironment('development');
    });

    test('should get emulator configuration correctly', () => {
      const emulatorConfig = getEmulatorConfig();
      
      expect(emulatorConfig.ports.firestore).toBe(8080);
      expect(emulatorConfig.ports.auth).toBe(9099);
      expect(emulatorConfig.ports.functions).toBe(5001);
      expect(emulatorConfig.ports.ui).toBe(4000);
      expect(emulatorConfig.host).toBe('localhost');
      expect(emulatorConfig.ui.enabled).toBe(true);
    });

    test('should check emulator availability', async () => {
      // Mock successful fetch for emulator availability
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const isAvailable = await checkEmulatorAvailability('localhost', 8080);
      
      expect(isAvailable).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8080',
        expect.objectContaining({
          method: 'GET',
          signal: expect.any(AbortSignal)
        })
      );
    });

    test('should handle emulator unavailability', async () => {
      // Mock failed fetch for emulator unavailability
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const isAvailable = await checkEmulatorAvailability('localhost', 8080);
      
      expect(isAvailable).toBe(false);
    });

    test('should perform comprehensive Firebase health check', async () => {
      // Mock fetch responses for different services
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true }) // firestore
        .mockResolvedValueOnce({ ok: true }) // auth
        .mockResolvedValueOnce({ ok: true }); // functions

      const healthCheck = await performFirebaseHealthCheck();
      
      expect(healthCheck).toHaveProperty('healthy');
      expect(healthCheck).toHaveProperty('services');
      expect(healthCheck).toHaveProperty('recommendations');
      expect(healthCheck.services.firestore.available).toBe(true);
      expect(healthCheck.services.auth.available).toBe(true);
      expect(healthCheck.services.functions.available).toBe(true);
    });

    test('should handle partial service availability in health check', async () => {
      // Mock mixed responses - some services available, some not
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true }) // firestore available
        .mockRejectedValueOnce(new Error('Connection refused')) // auth unavailable
        .mockResolvedValueOnce({ ok: true }); // functions available

      const healthCheck = await performFirebaseHealthCheck();
      
      expect(healthCheck.healthy).toBe(false);
      expect(healthCheck.services.firestore.available).toBe(true);
      expect(healthCheck.services.auth.available).toBe(false);
      expect(healthCheck.services.functions.available).toBe(true);
      expect(healthCheck.recommendations).toContain('Start auth emulator on port 9099');
    });
  });

  describe('Service Status Management Tests', () => {
    beforeEach(() => {
      setEnvironment('development');
    });

    test('should update and retrieve service status correctly', () => {
      const testError = new Error('Connection failed');
      
      updateServiceStatus('firestore', false, testError);
      
      const status = getServiceStatus();
      
      expect(status.firestore.connected).toBe(false);
      expect(status.firestore.error).toBe(testError);
      expect(status.firestore.lastAttempt).toBeDefined();
    });

    test('should update service status for successful connection', () => {
      updateServiceStatus('auth', true);
      
      const status = getServiceStatus();
      
      expect(status.auth.connected).toBe(true);
      expect(status.auth.error).toBeNull();
      expect(status.auth.lastAttempt).toBeDefined();
    });

    test('should handle multiple service status updates', () => {
      updateServiceStatus('firestore', true);
      updateServiceStatus('auth', false, new Error('Auth failed'));
      updateServiceStatus('functions', true);
      
      const status = getServiceStatus();
      
      expect(status.firestore.connected).toBe(true);
      expect(status.auth.connected).toBe(false);
      expect(status.functions.connected).toBe(true);
      expect(status.auth.error.message).toBe('Auth failed');
    });
  });

  describe('Development Configuration Tests', () => {
    test('should get development configuration flags', () => {
      setEnvironment('development');
      
      const devConfig = getDevelopmentConfig();
      
      expect(devConfig.debugMode).toBe(true);
      expect(devConfig.errorReporting).toBe(true);
      expect(devConfig.autoRecovery).toBe(true);
      expect(devConfig.healthChecks).toBe(true);
      expect(devConfig.emulatorHost).toBe('localhost');
    });

    test('should handle missing development configuration gracefully', () => {
      process.env.NODE_ENV = 'development';
      // Don't set other development flags
      
      const devConfig = getDevelopmentConfig();
      
      // Should use defaults
      expect(devConfig.debugMode).toBe(false);
      expect(devConfig.verboseLogging).toBe(false);
      expect(devConfig.errorReporting).toBe(true); // Default to true
      expect(devConfig.autoRecovery).toBe(true); // Default to true
    });
  });

  describe('Environment Switching Tests', () => {
    test('should switch from development to production configuration', () => {
      // Start in development
      setEnvironment('development');
      let config = getFirebaseConfig();
      expect(config.apiKey).toBe('demo-key');
      expect(shouldUseEmulators()).toBe(true);
      
      // Switch to production
      clearEnvironment();
      setEnvironment('production');
      config = getFirebaseConfig();
      expect(config.apiKey).toBe('test-api-key');
      expect(shouldUseEmulators()).toBe(false);
    });

    test('should switch from production to development configuration', () => {
      // Start in production
      setEnvironment('production');
      let config = getFirebaseConfig();
      expect(config.apiKey).toBe('test-api-key');
      expect(shouldUseEmulators()).toBe(false);
      
      // Switch to development
      clearEnvironment();
      setEnvironment('development');
      config = getFirebaseConfig();
      expect(config.apiKey).toBe('demo-key');
      expect(shouldUseEmulators()).toBe(true);
    });

    test('should handle environment switching with partial configuration', () => {
      // Set development environment but disable emulators
      process.env.NODE_ENV = 'development';
      process.env.REACT_APP_USE_EMULATORS = 'false';
      process.env.REACT_APP_FIREBASE_PROJECT_ID = 'test-project';
      
      expect(shouldUseEmulators()).toBe(false);
      
      // Enable emulators
      process.env.REACT_APP_USE_EMULATORS = 'true';
      expect(shouldUseEmulators()).toBe(true);
    });
  });
});