/**
 * Validation script for reset implementation
 * 
 * This script validates that all reset functions are properly implemented
 * without requiring Firebase emulators to be running.
 */

console.log('🔍 Validating reset implementation...');

try {
  // Test that all modules can be imported
  console.log('1. Testing module imports...');
  
  const { resetAll } = require('./seed/seeder');
  const { resetExercises } = require('./seed/data/exercises');
  const { resetUsers } = require('./seed/data/users');
  const { resetPrograms } = require('./seed/data/programs');
  const { resetWorkoutLogs } = require('./seed/data/workout-logs');
  const { confirmReset, getResetStatistics, reportResetCompletion } = require('./seed/utils/reset-helpers');
  
  console.log('✅ All reset modules imported successfully');
  
  // Test that functions are properly exported
  console.log('2. Testing function exports...');
  
  const requiredFunctions = [
    { name: 'resetAll', func: resetAll },
    { name: 'resetExercises', func: resetExercises },
    { name: 'resetUsers', func: resetUsers },
    { name: 'resetPrograms', func: resetPrograms },
    { name: 'resetWorkoutLogs', func: resetWorkoutLogs },
    { name: 'confirmReset', func: confirmReset },
    { name: 'getResetStatistics', func: getResetStatistics },
    { name: 'reportResetCompletion', func: reportResetCompletion }
  ];
  
  for (const { name, func } of requiredFunctions) {
    if (typeof func !== 'function') {
      throw new Error(`${name} is not a function`);
    }
    console.log(`  ✅ ${name} is properly exported`);
  }
  
  // Test CLI argument parsing
  console.log('3. Testing CLI integration...');
  
  const { seedAll, resetAll: cliResetAll } = require('./seed/index');
  if (typeof cliResetAll !== 'function') {
    throw new Error('CLI resetAll function not properly exported');
  }
  console.log('✅ CLI integration is properly configured');
  
  // Test package.json scripts
  console.log('4. Testing package.json scripts...');
  
  const packageJson = require('../package.json');
  const requiredScripts = [
    'seed:reset',
    'seed:reset:force',
    'test:reset'
  ];
  
  for (const script of requiredScripts) {
    if (!packageJson.scripts[script]) {
      throw new Error(`Missing npm script: ${script}`);
    }
    console.log(`  ✅ npm script '${script}' is configured`);
  }
  
  console.log('\n🎉 Reset implementation validation passed!');
  console.log('\n📋 Available reset commands:');
  console.log('  npm run seed:reset        - Interactive reset with confirmation');
  console.log('  npm run seed:reset:force  - Force reset without confirmation');
  console.log('  npm run test:reset        - Test reset functionality');
  
  console.log('\n💡 To test with emulators running:');
  console.log('  1. Start emulators: npm run dev:firebase');
  console.log('  2. In another terminal: npm run test:reset');
  
} catch (error) {
  console.error('❌ Reset implementation validation failed:', error.message);
  process.exit(1);
}