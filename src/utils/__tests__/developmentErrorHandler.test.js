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
  getStoredErrors
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
  removeItem: jest.fn()
};
Object.defineProperty(window, 'sessionStorage', {
  value: mockSessionStorage
});

// Mock environment
const originalEnv = process.env.NODE_ENV;

describe('Development Error Handler', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    // Reset mocks
    mockSessionStorage.getItem.mockReturnValue('[]');
    mockSessionStorage.setItem.mockClear();
    mockSessionStorage.removeItem.mockClear();
    clearStoredErrors();
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

  test('should store and retrieve errors correctly', () => {
    const testError = new Error('Test error');
    
    reportDevelopmentError(testError, ERROR_TYPES.CONFIGURATION, null, { test: true });
    
    const storedErrors = getStoredErrors();
    expect(storedErrors).toHaveLength(1);
    expect(storedErrors[0].type).toBe(ERROR_TYPES.CONFIGURATION);
    expect(storedErrors[0].message).toBe('Test error');
  });

  test('should not report errors in production', () => {
    process.env.NODE_ENV = 'production';
    
    const testError = new Error('Test error');
    reportDevelopmentError(testError, ERROR_TYPES.EMULATOR_CONNECTION, 'firestore');
    
    expect(console.group).not.toHaveBeenCalled();
  });
});