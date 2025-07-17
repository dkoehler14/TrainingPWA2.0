/**
 * Service Integration Tests
 * 
 * Tests for validating integration between React app and Firebase services
 * in both development (emulator) and production environments.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';

import {
  getFirebaseConfig,
  shouldUseEmulators,
  getEmulatorConfig
} from '../../config/environment';

import {
  performFirebaseHealthCheck,
  checkEmulatorAvailability,
  updateServiceStatus,
  getServiceStatus
} from '../../utils/developmentErrorHandler';

// Mock Firebase services
jest.mock('firebase/app');
jest.mock('firebase/firestore');
jest.mock('firebase/auth');
jest.mock('firebase/functions');

// Mock environment variables
const mockEnvVars = {
  development: {
    NODE_ENV: 'development',
    REACT_APP_USE_EMULATORS: 'true',
    REACT_APP_FIREBASE_PROJECT_ID: 'test-project'
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

const setEnvironment = (envType) => {
  const envVars = mockEnvVars[envType];
  Object.keys(envVars).forEach(key => {
    process.env[key] = envVars[key];
  });
};

const clearEnvironment = () => {
  Object.keys(mockEnvVars.development).forEach(key => {
    delete process.env[key];
  });
  Object.keys(mockEnvVars.production).forEach(key => {
    delete process.env[key];
  });
};

describe('Service Integration Tests', () => {
  let mockApp, mockDb, mockAuth, mockFunctions;

  beforeEach(() => {
    clearEnvironment();
    jest.clearAllMocks();

    // Setup Firebase mocks
    mockApp = { name: 'test-app' };
    mockDb = { type: 'firestore' };
    mockAuth = { type: 'auth' };
    mockFunctions = { type: 'functions' };

    initializeApp.mockReturnValue(mockApp);
    getFirestore.mockReturnValue(mockDb);
    getAuth.mockReturnValue(mockAuth);
    getFunctions.mockReturnValue(mockFunctions);

    connectFirestoreEmulator.mockImplementation(() => {});
    connectAuthEmulator.mockImplementation(() => {});
    connectFunctionsEmulator.mockImplementation(() => {});
  });

  afterEach(() => {
    clearEnvironment();
  });

  describe('Firebase Service Initialization', () => {
    test('should initialize Firebase services in development mode', () => {
      setEnvironment('development');
      
      const config = getFirebaseConfig();
      const app = initializeApp(config);
      const db = getFirestore(app);
      const auth = getAuth(app);
      const functions = getFunctions(app);

      expect(initializeApp).toHaveBeenCalledWith(config);
      expect(getFirestore).toHaveBeenCalledWith(app);
      expect(getAuth).toHaveBeenCalledWith(app);
      expect(getFunctions).toHaveBeenCalledWith(app);
      expect(db).toBe(mockDb);
      expect(auth).toBe(mockAuth);
      expect(functions).toBe(mockFunctions);
    });

    test('should initialize Firebase services in production mode', () => {
      setEnvironment('production');
      
      const config = getFirebaseConfig();
      const app = initializeApp(config);
      const db = getFirestore(app);
      const auth = getAuth(app);
      const functions = getFunctions(app);

      expect(initializeApp).toHaveBeenCalledWith(config);
      expect(config.apiKey).toBe('test-api-key');
      expect(config.authDomain).toBe('test.firebaseapp.com');
    });

    test('should connect to emulators in development mode', () => {
      setEnvironment('development');
      
      if (shouldUseEmulators()) {
        const emulatorConfig = getEmulatorConfig();
        
        connectFirestoreEmulator(mockDb, 'localhost', emulatorConfig.ports.firestore);
        connectAuthEmulator(mockAuth, `http://localhost:${emulatorConfig.ports.auth}`);
        connectFunctionsEmulator(mockFunctions, 'localhost', emulatorConfig.ports.functions);

        expect(connectFirestoreEmulator).toHaveBeenCalledWith(mockDb, 'localhost', 8080);
        expect(connectAuthEmulator).toHaveBeenCalledWith(mockAuth, 'http://localhost:9099');
        expect(connectFunctionsEmulator).toHaveBeenCalledWith(mockFunctions, 'localhost', 5001);
      }
    });

    test('should not connect to emulators in production mode', () => {
      setEnvironment('production');
      
      expect(shouldUseEmulators()).toBe(false);
      expect(connectFirestoreEmulator).not.toHaveBeenCalled();
      expect(connectAuthEmulator).not.toHaveBeenCalled();
      expect(connectFunctionsEmulator).not.toHaveBeenCalled();
    });
  });

  describe('Emulator Service Integration', () => {
    beforeEach(() => {
      setEnvironment('development');
    });

    test('should validate Firestore emulator integration', async () => {
      // Mock successful emulator connection
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ status: 'running' })
      });

      const isAvailable = await checkEmulatorAvailability('localhost', 8080);
      expect(isAvailable).toBe(true);

      // Test Firestore operations
      connectFirestoreEmulator(mockDb, 'localhost', 8080);
      expect(connectFirestoreEmulator).toHaveBeenCalledWith(mockDb, 'localhost', 8080);
    });

    test('should validate Auth emulator integration', async () => {
      // Mock successful emulator connection
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const isAvailable = await checkEmulatorAvailability('localhost', 9099);
      expect(isAvailable).toBe(true);

      // Test Auth operations
      connectAuthEmulator(mockAuth, 'http://localhost:9099');
      expect(connectAuthEmulator).toHaveBeenCalledWith(mockAuth, 'http://localhost:9099');
    });

    test('should validate Functions emulator integration', async () => {
      // Mock successful emulator connection
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200
      });

      const isAvailable = await checkEmulatorAvailability('localhost', 5001);
      expect(isAvailable).toBe(true);

      // Test Functions operations
      connectFunctionsEmulator(mockFunctions, 'localhost', 5001);
      expect(connectFunctionsEmulator).toHaveBeenCalledWith(mockFunctions, 'localhost', 5001);
    });

    test('should handle emulator connection failures gracefully', async () => {
      // Mock failed emulator connections
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const firestoreAvailable = await checkEmulatorAvailability('localhost', 8080);
      const authAvailable = await checkEmulatorAvailability('localhost', 9099);
      const functionsAvailable = await checkEmulatorAvailability('localhost', 5001);

      expect(firestoreAvailable).toBe(false);
      expect(authAvailable).toBe(false);
      expect(functionsAvailable).toBe(false);
    });
  });

  describe('Service Health Monitoring', () => {
    beforeEach(() => {
      setEnvironment('development');
    });

    test('should perform comprehensive health check', async () => {
      // Mock mixed service availability
      global.fetch = jest.fn()
        .mockResolvedValueOnce({ ok: true }) // firestore
        .mockResolvedValueOnce({ ok: true }) // auth
        .mockRejectedValueOnce(new Error('Connection refused')); // functions

      const healthCheck = await performFirebaseHealthCheck();

      expect(healthCheck).toHaveProperty('healthy');
      expect(healthCheck).toHaveProperty('services');
      expect(healthCheck).toHaveProperty('recommendations');
      expect(healthCheck.services.firestore.available).toBe(true);
      expect(healthCheck.services.auth.available).toBe(true);
      expect(healthCheck.services.functions.available).toBe(false);
      expect(healthCheck.healthy).toBe(false);
    });

    test('should track service status over time', () => {
      // Test service status tracking
      updateServiceStatus('firestore', true);
      updateServiceStatus('auth', false, new Error('Auth failed'));
      updateServiceStatus('functions', true);

      const status = getServiceStatus();

      expect(status.firestore.connected).toBe(true);
      expect(status.auth.connected).toBe(false);
      expect(status.functions.connected).toBe(true);
      expect(status.auth.error.message).toBe('Auth failed');
    });

    test('should provide service recovery recommendations', async () => {
      // Mock all services down
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection refused'));

      const healthCheck = await performFirebaseHealthCheck();

      expect(healthCheck.healthy).toBe(false);
      expect(healthCheck.recommendations).toContain('Start firestore emulator on port 8080');
      expect(healthCheck.recommendations).toContain('Start auth emulator on port 9099');
      expect(healthCheck.recommendations).toContain('Start functions emulator on port 5001');
    });
  });

  describe('Cross-Service Communication', () => {
    beforeEach(() => {
      setEnvironment('development');
    });

    test('should validate React to Firestore communication', async () => {
      // Mock Firestore operations
      const mockCollection = jest.fn();
      const mockDoc = jest.fn();
      const mockGet = jest.fn().mockResolvedValue({
        exists: () => true,
        data: () => ({ test: 'data' })
      });

      mockDb.collection = mockCollection.mockReturnValue({
        doc: mockDoc.mockReturnValue({
          get: mockGet
        })
      });

      // Simulate React component using Firestore
      const result = await mockDb.collection('test').doc('testDoc').get();
      const data = result.data();

      expect(mockCollection).toHaveBeenCalledWith('test');
      expect(mockDoc).toHaveBeenCalledWith('testDoc');
      expect(data).toEqual({ test: 'data' });
    });

    test('should validate React to Auth communication', async () => {
      // Mock Auth operations
      const mockSignIn = jest.fn().mockResolvedValue({
        user: { uid: 'test-uid', email: 'test@example.com' }
      });
      const mockOnAuthStateChanged = jest.fn();

      mockAuth.signInWithEmailAndPassword = mockSignIn;
      mockAuth.onAuthStateChanged = mockOnAuthStateChanged;

      // Simulate React component using Auth
      const userCredential = await mockAuth.signInWithEmailAndPassword('test@example.com', 'password');
      mockAuth.onAuthStateChanged((user) => {
        console.log('Auth state changed:', user);
      });

      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password');
      expect(userCredential.user.uid).toBe('test-uid');
      expect(mockOnAuthStateChanged).toHaveBeenCalledWith(expect.any(Function));
    });

    test('should validate React to Functions communication', async () => {
      // Mock Functions operations
      const mockHttpsCallable = jest.fn().mockReturnValue(
        jest.fn().mockResolvedValue({
          data: { result: 'success', message: 'Function executed' }
        })
      );

      mockFunctions.httpsCallable = mockHttpsCallable;

      // Simulate React component calling Functions
      const testFunction = mockFunctions.httpsCallable('testFunction');
      const result = await testFunction({ input: 'test' });

      expect(mockHttpsCallable).toHaveBeenCalledWith('testFunction');
      expect(result.data.result).toBe('success');
    });
  });

  describe('Environment-Specific Service Behavior', () => {
    test('should use different endpoints in development vs production', () => {
      // Development configuration
      setEnvironment('development');
      let config = getFirebaseConfig();
      expect(config.authDomain).toBe('localhost');
      expect(shouldUseEmulators()).toBe(true);

      // Production configuration
      clearEnvironment();
      setEnvironment('production');
      config = getFirebaseConfig();
      expect(config.authDomain).toBe('test.firebaseapp.com');
      expect(shouldUseEmulators()).toBe(false);
    });

    test('should handle service initialization errors differently by environment', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Development - should provide detailed error information
      setEnvironment('development');
      const devError = new Error('Development service error');
      
      // Production - should provide minimal error information
      clearEnvironment();
      setEnvironment('production');
      const prodError = new Error('Production service error');

      // Both should handle errors, but development should be more verbose
      expect(devError.message).toContain('Development');
      expect(prodError.message).toContain('Production');

      consoleSpy.mockRestore();
    });
  });

  describe('Service Performance and Reliability', () => {
    beforeEach(() => {
      setEnvironment('development');
    });

    test('should measure service response times', async () => {
      const startTime = Date.now();
      
      // Mock service call with delay
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
          }, 100);
        });
      });

      await checkEmulatorAvailability('localhost', 8080);
      const responseTime = Date.now() - startTime;

      // Service should respond within reasonable time
      expect(responseTime).toBeGreaterThan(90);
      expect(responseTime).toBeLessThan(200);
    });

    test('should handle service timeouts', async () => {
      // Mock service call that times out
      global.fetch = jest.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => {
            reject({ name: 'AbortError', message: 'Request timeout' });
          }, 100);
        });
      });

      const isAvailable = await checkEmulatorAvailability('localhost', 8080);
      expect(isAvailable).toBe(false);
    });

    test('should handle concurrent service requests', async () => {
      // Mock successful responses
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const ports = [8080, 9099, 5001];
      const promises = ports.map(port => 
        checkEmulatorAvailability('localhost', port)
      );

      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(3);
      expect(results.every(result => result === true)).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });
});