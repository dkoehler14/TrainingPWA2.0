/**
 * Tests for Development Error Handler
 */

import {
  reportDevelopmentError,
  ERROR_TYPES,
  getServiceStatus,
  updateServiceStatus,
  handleEmulatorFallback,
  clearStoredErrors,
  getStoredErrors,
  handleServiceInitializationFallback,
  retryEmulatorConnection,
  performFirebaseHealthCheck,
  checkEmulatorAvailability
} from '../developmentErrorHandler';

// Mock the environment config module
jest.mock('../../config/environment', () => ({
  isDevelopment: true,
  getEmulatorConfig: () => ({
    ports: {
      firestore: 8080,
      auth: 9099,
      functions: 5001
    }
  })
}));

// Mock sessionStorage
const mockSessionStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  data: {}
};

// Make sessionStorage behave more like the real thing
mockSessionStorage.getItem.mockImplementation((key) => {
  return mockSessionStorage.data[key] || null;
});

mockSessionStorage.setItem.mockImplementation((key, value) => {
  mockSessionStorage.data[key] = value;
});

mockSessionStorage.removeItem.mockImplementation((key) => {
  delete mockSessionStorage.data[key];
});

Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage
});

// Mock environment
const originalEnv = process.env.NODE_ENV;

describe('Development Error Handler', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    // Reset mock data
    mockSessionStorage.data = {};
    mockSessionStorage.setItem.mockClear();
    mockSessionStorage.removeItem.mockClear();
    mockSessionStorage.getItem.mockClear();
    // Mock console methods
    jest.spyOn(console, 'group').mockImplementation(() => {});
    jest.spyOn(console, 'groupEnd').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  test('should report development errors correctly', () => {
    const testError = new Error('Test error');
    const context = { test: true };

    reportDevelopmentError(testError, ERROR_TYPES.EMULATOR_CONNECTION, 'firestore', context);

    expect(console.group).toHaveBeenCalledWith('🚨 Development Error [EMULATOR_CONNECTION]');
    expect(console.error).toHaveBeenCalledWith('Service: firestore');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Message: Test error'));
  });

  test('should update service status correctly', () => {
    const testError = new Error('Connection failed');
    
    updateServiceStatus('firestore', false, testError);
    
    const status = getServiceStatus();
    expect(status.firestore.connected).toBe(false);
    expect(status.firestore.error).toBe(testError);
    expect(status.firestore.lastAttempt).toBeDefined();
  });

  test('should handle emulator fallback correctly', () => {
    const testError = new Error('Emulator not available');
    
    const fallback = handleEmulatorFallback('firestore', testError);
    
    expect(fallback.message).toContain('Firestore emulator unavailable');
    expect(fallback.action).toContain('firebase emulators:start');
    expect(fallback.canContinue).toBe(false);
  });

  test('should store errors when sessionStorage is available', () => {
    const testError = new Error('Test error');
    
    // Test that reportDevelopmentError calls sessionStorage.setItem
    reportDevelopmentError(testError, ERROR_TYPES.CONFIGURATION, null, { test: true });
    
    expect(mockSessionStorage.setItem).toHaveBeenCalled();
  });

  test('should not report errors in production', () => {
    process.env.NODE_ENV = 'production';
    
    const testError = new Error('Test error');
    reportDevelopmentError(testError, ERROR_TYPES.EMULATOR_CONNECTION, 'firestore');
    
    expect(console.group).not.toHaveBeenCalled();
  });

  test('should handle service initialization fallback correctly', () => {
    const testError = new Error('Service init failed');
    
    const fallback = handleServiceInitializationFallback('auth', testError);
    
    expect(fallback.canContinue).toBe(true);
    expect(fallback.message).toContain('Auth initialization failed');
    expect(fallback.criticalityLevel).toBe('medium');
    expect(fallback.fallbackService).toBeDefined();
  });

  test('should handle critical service initialization fallback', () => {
    const testError = new Error('Firestore init failed');
    
    const fallback = handleServiceInitializationFallback('firestore', testError);
    
    expect(fallback.canContinue).toBe(false);
    expect(fallback.criticalityLevel).toBe('high');
    expect(fallback.fallbackService).toBeNull();
  });

  test('should perform health check correctly', async () => {
    // Mock fetch to simulate emulator availability
    global.fetch = jest.fn()
      .mockResolvedValueOnce({}) // firestore available
      .mockRejectedValueOnce(new Error('Connection failed')) // auth not available
      .mockResolvedValueOnce({}); // functions available

    const healthResults = await performFirebaseHealthCheck();
    
    expect(healthResults).toHaveProperty('healthy');
    expect(healthResults).toHaveProperty('services');
    expect(healthResults).toHaveProperty('recommendations');
    expect(healthResults.services).toHaveProperty('firestore');
    expect(healthResults.services).toHaveProperty('auth');
    expect(healthResults.services).toHaveProperty('functions');
  });

  test('should check emulator availability correctly', async () => {
    // Mock successful fetch
    global.fetch = jest.fn().mockResolvedValue({});
    
    const isAvailable = await checkEmulatorAvailability('localhost', 8080);
    
    expect(isAvailable).toBe(true);
    expect(fetch).toHaveBeenCalledWith('http://localhost:8080', expect.any(Object));
  });

  test('should handle emulator availability check timeout', async () => {
    // Mock fetch that times out
    global.fetch = jest.fn().mockImplementation(() => {
      return new Promise((_, reject) => {
        setTimeout(() => reject({ name: 'AbortError' }), 50);
      });
    });

    const isAvailable = await checkEmulatorAvailability('localhost', 8080);
    
    expect(isAvailable).toBe(false);
  });

  test('should create mock auth service for fallback', () => {
    const testError = new Error('Auth init failed');
    
    const fallback = handleServiceInitializationFallback('auth', testError);
    
    expect(fallback.fallbackService).toBeDefined();
    expect(fallback.fallbackService.onAuthStateChanged).toBeDefined();
    expect(fallback.fallbackService.signInWithEmailAndPassword).toBeDefined();
    expect(fallback.fallbackService.signOut).toBeDefined();
  });

  test('should create mock functions service for fallback', () => {
    const testError = new Error('Functions init failed');
    
    const fallback = handleServiceInitializationFallback('functions', testError);
    
    expect(fallback.fallbackService).toBeDefined();
    expect(fallback.fallbackService.httpsCallable).toBeDefined();
    
    // Test that httpsCallable returns a function
    const mockFunction = fallback.fallbackService.httpsCallable('testFunction');
    expect(typeof mockFunction).toBe('function');
  });
});