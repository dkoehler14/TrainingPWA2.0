/**
 * Scenario selection utility
 * 
 * This module provides utilities for selecting and configuring scenarios
 * for test data seeding, including CLI prompts and validation.
 */

const { getAvailableOptions, validateScenarios, getSeedingConfig } = require('../config/scenarios');
const { logProgress } = require('./logger');

/**
 * Display available scenario options
 */
function displayAvailableScenarios() {
  const options = getAvailableOptions();
  
  console.log('\n📋 Available User Scenarios:');
  console.log('─'.repeat(50));
  
  options.scenarios.forEach(scenario => {
    console.log(`  ${scenario.id.padEnd(20)} - ${scenario.name}`);
    console.log(`  ${' '.repeat(20)}   ${scenario.description}`);
  });
  
  console.log('\n📦 Scenario Groups:');
  console.log('─'.repeat(50));
  
  options.groups.forEach(group => {
    console.log(`  ${group.id.padEnd(20)} - ${group.count} scenarios: ${group.scenarios.join(', ')}`);
  });
  
  console.log('\n💡 Usage Examples:');
  console.log('─'.repeat(50));
  console.log('  npm run seed:dev -- --scenarios=basic');
  console.log('  npm run seed:dev -- --scenarios=beginner,intermediate');
  console.log('  npm run seed:dev -- --scenarios=comprehensive');
  console.log('  npm run seed:dev -- --scenarios=all');
  console.log('');
}

/**
 * Parse scenario selection from command line arguments
 * @param {Array<string>} args - Command line arguments
 * @returns {Object} Parsed scenario configuration
 */
function parseScenarioArgs(args) {
  const config = {
    scenarios: 'basic',
    verbose: false,
    includeHistoricalData: true,
    help: false
  };
  
  args.forEach(arg => {
    if (arg.startsWith('--scenarios=')) {
      const scenarioValue = arg.split('=')[1];
      // Handle comma-separated scenarios
      if (scenarioValue.includes(',')) {
        config.scenarios = scenarioValue.split(',').map(s => s.trim());
      } else {
        config.scenarios = scenarioValue;
      }
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--no-history') {
      config.includeHistoricalData = false;
    } else if (arg === '--help' || arg === '-h') {
      config.help = true;
    }
  });
  
  return config;
}

/**
 * Validate and prepare scenario configuration
 * @param {string|Array<string>} scenarios - Scenario selection
 * @param {Object} options - Additional options
 * @returns {Object} Validated configuration
 */
function prepareScenarioConfig(scenarios, options = {}) {
  try {
    // Validate scenarios
    const validation = validateScenarios(scenarios);
    
    if (!validation.isValid) {
      throw new Error(`Invalid scenarios: ${validation.invalid.join(', ')}`);
    }
    
    // Get full seeding configuration
    const seedingConfig = getSeedingConfig(scenarios, options);
    
    return {
      ...seedingConfig,
      validation
    };
  } catch (error) {
    throw new Error(`Scenario configuration error: ${error.message}`);
  }
}

/**
 * Display scenario configuration summary
 * @param {Object} config - Scenario configuration
 */
function displayScenarioSummary(config) {
  console.log('\n🎯 Seeding Configuration Summary:');
  console.log('─'.repeat(50));
  console.log(`  Selected scenarios: ${config.scenarios.join(', ')}`);
  console.log(`  Total users to create: ${config.totalUsers}`);
  console.log(`  Include historical data: ${config.includeHistoricalData ? 'Yes' : 'No'}`);
  console.log(`  Verbose logging: ${config.verbose ? 'Yes' : 'No'}`);
  
  console.log('\n👥 User Personas:');
  console.log('─'.repeat(50));
  
  config.scenarioConfigs.forEach(scenario => {
    const patterns = scenario.dataPatterns;
    console.log(`  ${scenario.name} (${scenario.id}):`);
    console.log(`    Email: ${scenario.email}`);
    console.log(`    Experience: ${scenario.profile.experienceLevel}`);
    console.log(`    Workout frequency: ${scenario.profile.workoutFrequency} days/week`);
    console.log(`    Completion rate: ${(patterns.workoutConsistency * 100).toFixed(0)}%`);
    console.log(`    History weeks: ${patterns.historyWeeks}`);
    console.log('');
  });
}

/**
 * Interactive scenario selection (for future CLI enhancement)
 * @returns {Promise<Object>} Selected configuration
 */
async function interactiveScenarioSelection() {
  // This could be enhanced with a proper CLI library like inquirer
  // For now, we'll provide a simple implementation
  
  console.log('\n🔧 Interactive Scenario Selection');
  console.log('─'.repeat(50));
  console.log('This feature will be enhanced in future versions.');
  console.log('For now, use command line arguments:');
  console.log('');
  displayAvailableScenarios();
  
  return { scenarios: 'basic', verbose: false };
}

/**
 * Display help information
 */
function displayHelp() {
  console.log('\n🚀 Test Data Seeding - Scenario-Based Configuration');
  console.log('═'.repeat(60));
  
  console.log('\nDESCRIPTION:');
  console.log('  Seed Firebase emulators with realistic test data using different');
  console.log('  user personas and scenarios. Each scenario represents a different');
  console.log('  type of user with unique characteristics and data patterns.');
  
  console.log('\nUSAGE:');
  console.log('  npm run seed:dev [options]');
  console.log('  node scripts/seed-test-data.js [options]');
  
  console.log('\nOPTIONS:');
  console.log('  --scenarios=<selection>    Scenario selection (default: basic)');
  console.log('  --verbose, -v              Enable verbose logging');
  console.log('  --no-history               Skip historical workout log generation');
  console.log('  --help, -h                 Show this help message');
  
  console.log('\nSCENARIO SELECTION:');
  console.log('  Individual scenarios:      beginner, intermediate, advanced, etc.');
  console.log('  Multiple scenarios:        beginner,intermediate,advanced');
  console.log('  Predefined groups:         basic, extended, comprehensive, all');
  
  displayAvailableScenarios();
  
  console.log('\nEXAMPLES:');
  console.log('  npm run seed:dev                                    # Basic scenarios');
  console.log('  npm run seed:dev -- --scenarios=comprehensive      # All persona types');
  console.log('  npm run seed:dev -- --scenarios=beginner --verbose # Single scenario with logs');
  console.log('  npm run seed:dev -- --scenarios=all --no-history   # All scenarios, no history');
  console.log('');
}

/**
 * Validate scenario selection and provide helpful error messages
 * @param {string|Array<string>} scenarios - Scenario selection
 * @returns {Object} Validation result with suggestions
 */
function validateWithSuggestions(scenarios) {
  const validation = validateScenarios(scenarios);
  const options = getAvailableOptions();
  
  if (!validation.isValid) {
    const suggestions = [];
    
    validation.invalid.forEach(invalid => {
      // Find similar scenario names
      const similar = options.scenarios.filter(s => 
        s.id.includes(invalid) || invalid.includes(s.id)
      );
      
      if (similar.length > 0) {
        suggestions.push(`Did you mean: ${similar.map(s => s.id).join(', ')}?`);
      }
    });
    
    return {
      ...validation,
      suggestions,
      availableScenarios: options.scenarios.map(s => s.id),
      availableGroups: options.groups.map(g => g.id)
    };
  }
  
  return validation;
}

module.exports = {
  displayAvailableScenarios,
  parseScenarioArgs,
  prepareScenarioConfig,
  displayScenarioSummary,
  interactiveScenarioSelection,
  displayHelp,
  validateWithSuggestions
};