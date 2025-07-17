/**
 * Firebase emulator helper utilities
 * 
 * This module provides utilities for validating and connecting to Firebase emulators.
 */

const http = require('http');

// Emulator configuration
const EMULATOR_CONFIG = {
  auth: {
    name: 'Auth',
    port: 9099,
    host: 'localhost',
    healthPath: '/',
    timeout: 3000
  },
  firestore: {
    name: 'Firestore',
    port: 8080,
    host: 'localhost',
    healthPath: '/',
    timeout: 3000
  }
};

/**
 * Check if Firebase emulators are running
 * @returns {Promise<void>}
 * @throws {Error} If emulators are not running
 */
async function validateEmulators() {
  console.log('🔍 Validating Firebase emulator connectivity...');
  
  const emulators = Object.values(EMULATOR_CONFIG);
  const validationResults = [];

  for (const emulator of emulators) {
    try {
      await checkEmulatorHealth(emulator);
      console.log(`✅ ${emulator.name} emulator is running on port ${emulator.port}`);
      validationResults.push({ name: emulator.name, status: 'running' });
    } catch (error) {
      const errorMessage = handleEmulatorError(emulator.name, error);
      validationResults.push({ name: emulator.name, status: 'failed', error: errorMessage });
      throw new Error(errorMessage);
    }
  }

  console.log('✅ All Firebase emulators are running and accessible');
  return validationResults;
}

/**
 * Check if a specific emulator is healthy
 * @param {Object} emulator - Emulator configuration
 * @returns {Promise<void>}
 */
function checkEmulatorHealth(emulator) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: emulator.host,
      port: emulator.port,
      path: emulator.healthPath,
      method: 'GET',
      timeout: emulator.timeout
    }, (res) => {
      // Accept any response as a sign the emulator is running
      resolve();
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Handle emulator connection errors with helpful messages
 * @param {string} service - The emulator service name
 * @param {Error} error - The connection error
 * @returns {string} Formatted error message
 */
function handleEmulatorError(service, error) {
  console.error(`❌ ${service} emulator connection failed:`, error.message);
  
  let errorMessage = `Cannot seed data: ${service} emulator not available`;
  
  if (error.code === 'ECONNREFUSED') {
    console.log(`💡 Make sure ${service} emulator is running on the expected port`);
    console.log('   Run: npm run dev:firebase');
    errorMessage += ` (Connection refused - emulator not running)`;
  } else if (error.message === 'Request timeout') {
    console.log(`💡 ${service} emulator is not responding within the timeout period`);
    console.log('   Check if the emulator is overloaded or stuck');
    errorMessage += ` (Request timeout)`;
  } else if (error.code === 'ENOTFOUND') {
    console.log(`💡 Cannot resolve hostname for ${service} emulator`);
    console.log('   Check your network configuration');
    errorMessage += ` (Hostname not found)`;
  } else {
    console.log(`💡 Unexpected error connecting to ${service} emulator`);
    console.log(`   Error details: ${error.message}`);
    errorMessage += ` (${error.message})`;
  }
  
  return errorMessage;
}

/**
 * Validate connection to Auth emulator specifically
 * @returns {Promise<boolean>}
 */
async function validateAuthEmulator() {
  try {
    await checkEmulatorHealth(EMULATOR_CONFIG.auth);
    console.log(`✅ Auth emulator connectivity verified`);
    return true;
  } catch (error) {
    handleEmulatorError('Auth', error);
    return false;
  }
}

/**
 * Validate connection to Firestore emulator specifically
 * @returns {Promise<boolean>}
 */
async function validateFirestoreEmulator() {
  try {
    await checkEmulatorHealth(EMULATOR_CONFIG.firestore);
    console.log(`✅ Firestore emulator connectivity verified`);
    return true;
  } catch (error) {
    handleEmulatorError('Firestore', error);
    return false;
  }
}

/**
 * Get emulator configuration
 * @returns {Object} Emulator configuration object
 */
function getEmulatorConfig() {
  return EMULATOR_CONFIG;
}

module.exports = {
  validateEmulators,
  validateAuthEmulator,
  validateFirestoreEmulator,
  checkEmulatorHealth,
  handleEmulatorError,
  getEmulatorConfig
};