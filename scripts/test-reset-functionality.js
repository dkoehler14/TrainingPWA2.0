/**
 * Test script for reset functionality
 * 
 * This script tests the reset functionality without requiring user interaction.
 */

const { resetAll } = require('./seed/seeder');
const { validateEmulators } = require('./seed/utils/emulator-helpers');

async function testResetFunctionality() {
  console.log('🧪 Testing reset functionality...');
  
  try {
    // Validate emulators are running
    console.log('1. Validating emulator connectivity...');
    await validateEmulators();
    console.log('✅ Emulators are running');
    
    // Test reset with force flag (no user interaction)
    console.log('2. Testing reset functionality...');
    const result = await resetAll({ 
      force: true, 
      verbose: true 
    });
    
    if (result.success) {
      console.log('✅ Reset functionality test passed');
      console.log('📊 Reset statistics:', result.statistics);
    } else if (result.cancelled) {
      console.log('⚠️  Reset was cancelled (unexpected with force flag)');
    } else {
      console.log('❌ Reset functionality test failed');
    }
    
  } catch (error) {
    console.error('❌ Reset functionality test failed:', error.message);
    
    if (error.message.includes('emulator not available')) {
      console.log('💡 Make sure Firebase emulators are running:');
      console.log('   npm run dev:firebase');
    }
    
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  testResetFunctionality();
}

module.exports = { testResetFunctionality };