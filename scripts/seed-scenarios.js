#!/usr/bin/env node

/**
 * Scenario-based test data seeding CLI
 * 
 * This script provides a command-line interface for seeding Firebase emulators
 * with realistic test data using different user personas and scenarios.
 */

const { seedAll } = require('./seed/seeder');
const { 
  parseScenarioArgs, 
  prepareScenarioConfig, 
  displayScenarioSummary, 
  displayHelp,
  validateWithSuggestions 
} = require('./seed/utils/scenario-selector');
const { logProgress } = require('./seed/utils/logger');
const { validateEmulators } = require('./seed/utils/emulator-helpers');

/**
 * Main CLI function
 */
async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const config = parseScenarioArgs(args);
    
    // Show help if requested
    if (config.help) {
      displayHelp();
      process.exit(0);
    }
    
    // Validate and prepare scenario configuration
    let scenarioConfig;
    try {
      scenarioConfig = prepareScenarioConfig(config.scenarios, {
        verbose: config.verbose,
        includeHistoricalData: config.includeHistoricalData
      });
    } catch (error) {
      logProgress(`Configuration Error: ${error.message}`, 'error');
      
      // Provide helpful suggestions for invalid scenarios
      const validation = validateWithSuggestions(config.scenarios);
      if (validation.suggestions && validation.suggestions.length > 0) {
        console.log('\n💡 Suggestions:');
        validation.suggestions.forEach(suggestion => {
          console.log(`  ${suggestion}`);
        });
      }
      
      console.log('\n📋 Available options:');
      console.log(`  Scenarios: ${validation.availableScenarios?.join(', ')}`);
      console.log(`  Groups: ${validation.availableGroups?.join(', ')}`);
      console.log('\nUse --help for more information.');
      process.exit(1);
    }
    
    // Display configuration summary
    if (config.verbose) {
      displayScenarioSummary(scenarioConfig);
    }
    
    // Validate emulators are running
    logProgress('Validating Firebase emulators...', 'info');
    try {
      await validateEmulators();
      logProgress('✅ Firebase emulators are running', 'success');
    } catch (error) {
      logProgress('❌ Firebase emulators validation failed', 'error');
      console.log('\n💡 Make sure Firebase emulators are running:');
      console.log('   npm run dev:firebase');
      console.log('   or');
      console.log('   firebase emulators:start');
      process.exit(1);
    }
    
    // Confirm seeding operation
    if (!config.verbose) {
      console.log(`\n🌱 About to seed ${scenarioConfig.totalUsers} test users with scenarios: ${scenarioConfig.scenarios.join(', ')}`);
      console.log('   Use --verbose flag for detailed configuration.');
    }
    
    // Start seeding process
    logProgress('Starting scenario-based test data seeding...', 'info');
    const startTime = Date.now();
    
    const result = await seedAll({
      scenarios: config.scenarios,
      verbose: config.verbose,
      includeHistoricalData: config.includeHistoricalData
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Display success summary
    if (result.success) {
      console.log('\n🎉 Scenario-based seeding completed successfully!');
      console.log('─'.repeat(50));
      console.log(`  Duration: ${duration}s`);
      console.log(`  Users created: ${result.summary.users}`);
      console.log(`  Programs created: ${result.summary.programs}`);
      console.log(`  Exercises seeded: ${result.summary.exercises}`);
      console.log(`  Historical data: ${result.summary.historicalData ? 'Generated' : 'Skipped'}`);
      
      console.log('\n📧 Test User Credentials:');
      console.log('─'.repeat(50));
      scenarioConfig.scenarioConfigs.forEach(scenario => {
        console.log(`  ${scenario.email} (${scenario.name}) - Password: test123`);
      });
      
      console.log('\n🚀 Ready for testing! Your Firebase emulators now contain realistic test data.');
    }
    
  } catch (error) {
    logProgress(`Seeding failed: ${error.message}`, 'error');
    
    if (config?.verbose) {
      console.error('\nFull error details:');
      console.error(error);
    } else {
      console.log('\nUse --verbose flag for detailed error information.');
    }
    
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Run the CLI
if (require.main === module) {
  main();
}

module.exports = { main };