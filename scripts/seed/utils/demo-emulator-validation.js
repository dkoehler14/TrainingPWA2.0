#!/usr/bin/env node

/**
 * Demo script showing emulator validation functionality
 * 
 * This script demonstrates how to use the emulator validation utilities
 * before attempting to seed test data.
 */

const { validateEmulators, validateAuthEmulator, validateFirestoreEmulator, getEmulatorConfig } = require('./emulator-helpers');

async function demoEmulatorValidation() {
  console.log('🚀 Firebase Emulator Validation Demo');
  console.log('=====================================\n');

  // Show emulator configuration
  console.log('📋 Emulator Configuration:');
  const config = getEmulatorConfig();
  console.log(`   Auth emulator: ${config.auth.host}:${config.auth.port}`);
  console.log(`   Firestore emulator: ${config.firestore.host}:${config.firestore.port}\n`);

  // Test individual emulator validation
  console.log('🔍 Testing individual emulator validation...\n');
  
  console.log('1. Validating Auth emulator:');
  const authResult = await validateAuthEmulator();
  console.log(`   Result: ${authResult ? 'Connected' : 'Failed'}\n`);
  
  console.log('2. Validating Firestore emulator:');
  const firestoreResult = await validateFirestoreEmulator();
  console.log(`   Result: ${firestoreResult ? 'Connected' : 'Failed'}\n`);

  // Test full validation
  console.log('🔍 Testing full emulator validation...\n');
  try {
    const results = await validateEmulators();
    console.log('✅ All emulators validated successfully!');
    console.log('   Ready to proceed with test data seeding.\n');
    return true;
  } catch (error) {
    console.log('❌ Emulator validation failed');
    console.log(`   Error: ${error.message}\n`);
    console.log('💡 To start emulators, run: npm run dev:firebase');
    return false;
  }
}

// Run the demo if this script is executed directly
if (require.main === module) {
  demoEmulatorValidation()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Demo failed:', error);
      process.exit(1);
    });
}

module.exports = { demoEmulatorValidation };