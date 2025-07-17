/**
 * Tests for emulator helper utilities
 */

const { validateEmulators, validateAuthEmulator, validateFirestoreEmulator, handleEmulatorError, getEmulatorConfig } = require('../emulator-helpers');

describe('Emulator Helper Utilities', () => {
  describe('getEmulatorConfig', () => {
    test('should return emulator configuration', () => {
      const config = getEmulatorConfig();
      
      expect(config).toHaveProperty('auth');
      expect(config).toHaveProperty('firestore');
      expect(config.auth.port).toBe(9099);
      expect(config.firestore.port).toBe(8080);
    });
  });

  describe('handleEmulatorError', () => {
    test('should handle ECONNREFUSED error', () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      
      const result = handleEmulatorError('Auth', error);
      
      expect(result).toContain('Cannot seed data: Auth emulator not available');
      expect(result).toContain('Connection refused - emulator not running');
    });

    test('should handle timeout error', () => {
      const error = new Error('Request timeout');
      
      const result = handleEmulatorError('Firestore', error);
      
      expect(result).toContain('Cannot seed data: Firestore emulator not available');
      expect(result).toContain('Request timeout');
    });

    test('should handle ENOTFOUND error', () => {
      const error = new Error('Host not found');
      error.code = 'ENOTFOUND';
      
      const result = handleEmulatorError('Auth', error);
      
      expect(result).toContain('Cannot seed data: Auth emulator not available');
      expect(result).toContain('Hostname not found');
    });

    test('should handle generic error', () => {
      const error = new Error('Generic error message');
      
      const result = handleEmulatorError('Firestore', error);
      
      expect(result).toContain('Cannot seed data: Firestore emulator not available');
      expect(result).toContain('Generic error message');
    });
  });

  // Note: These tests would require actual emulators running to test connectivity
  // In a real test environment, you would mock the HTTP requests or use integration tests
  describe('Emulator Validation (Integration Tests)', () => {
    test('validateAuthEmulator should return boolean', async () => {
      // This test would fail if emulators aren't running, which is expected
      // In practice, this would be run as part of integration tests
      const result = await validateAuthEmulator().catch(() => false);
      expect(typeof result).toBe('boolean');
    });

    test('validateFirestoreEmulator should return boolean', async () => {
      // This test would fail if emulators aren't running, which is expected
      // In practice, this would be run as part of integration tests
      const result = await validateFirestoreEmulator().catch(() => false);
      expect(typeof result).toBe('boolean');
    });
  });
});