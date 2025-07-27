#!/usr/bin/env node

/**
 * Comprehensive Seeding Scenarios Tool
 * 
 * This tool provides predefined seeding scenarios for different testing
 * and development needs, with realistic data patterns and user journeys.
 */

const { getSupabaseClient } = require('../utils/supabase-helpers');
const { seedDatabase } = require('./seed-database');
const { generateAdvancedTestData } = require('./data-generator');
const { logProgress, logSection, logSummary } = require('../utils/logger');

/**
 * Available seeding scenarios with their configurations
 */
const SCENARIOS = {
  minimal: {
    name: 'Minimal Test Data',
    description: 'Basic setup with one user of each experience level',
    config: {
      scenarios: ['basic'],
      includeHistoricalData: false,
      generateProgressiveData: false
    }
  },
  
  basic: {
    name: 'Basic Development Data',
    description: 'Standard development setup with varied users and some history',
    config: {
      scenarios: ['basic', 'beginner', 'intermediate'],
      includeHistoricalData: true,
      generateProgressiveData: true
    }
  },
  
  comprehensive: {
    name: 'Comprehensive Test Suite',
    description: 'Full test data with all user types and extensive history',
    config: {
      scenarios: ['comprehensive'],
      includeHistoricalData: true,
      generateProgressiveData: true
    }
  },
  
  performance: {
    name: 'Performance Testing Data',
    description: 'Large dataset for performance and load testing',
    config: {
      userCount: 50,
      weeksOfHistory: 12,
      includeVariations: true,
      generateAnalytics: true,
      useAdvancedGenerator: true
    }
  },
  
  userJourneys: {
    name: 'User Journey Testing',
    description: 'Realistic user progression scenarios for UX testing',
    config: {
      scenarios: ['beginner', 'intermediate', 'advanced'],
      includeHistoricalData: true,
      generateProgressiveData: true,
      focusOnProgression: true
    }
  },
  
  analytics: {
    name: 'Analytics and Reporting Data',
    description: 'Rich dataset optimized for analytics and reporting features',
    config: {
      userCount: 25,
      weeksOfHistory: 16,
      generateAnalytics: true,
      includeVariations: true,
      useAdvancedGenerator: true
    }
  },
  
  mobile: {
    name: 'Mobile App Testing',
    description: 'Optimized for mobile app testing with offline scenarios',
    config: {
      scenarios: ['basic', 'intermediate'],
      includeHistoricalData: true,
      generateProgressiveData: true,
      includeDraftWorkouts: true
    }
  },
  
  edge_cases: {
    name: 'Edge Cases and Error Handling',
    description: 'Data designed to test edge cases and error handling',
    config: {
      scenarios: ['comprehensive'],
      includeHistoricalData: true,
      generateEdgeCases: true,
      includeIncompleteData: true
    }
  }
};

/**
 * Execute a specific seeding scenario
 */
async function executeScenario(scenarioName, options = {}) {
  const { verbose = false, dryRun = false } = options;
  
  if (!SCENARIOS[scenarioName]) {
    throw new Error(`Unknown scenario: ${scenarioName}. Available: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  
  const scenario = SCENARIOS[scenarioName];
  const startTime = Date.now();
  
  if (verbose) {
    logSection(`Seeding Scenario: ${scenario.name}`);
    logProgress(scenario.description, 'info');
  }
  
  if (dryRun) {
    logProgress('🔍 Dry run mode - showing what would be seeded:', 'info');
    logSummary('Scenario Configuration', scenario.config);
    return {
      success: true,
      dryRun: true,
      scenario: scenarioName,
      config: scenario.config
    };
  }
  
  try {
    let result;
    
    if (scenario.config.useAdvancedGenerator) {
      // Use advanced data generator for complex scenarios
      result = await generateAdvancedTestData({
        ...scenario.config,
        verbose
      });
    } else {
      // Use standard seeding for simpler scenarios
      result = await seedDatabase({
        ...scenario.config,
        verbose
      });
    }
    
    if (result.success) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (verbose) {
        logProgress(`✅ Scenario '${scenarioName}' completed successfully`, 'success');
        logSummary('Seeding Results', {
          ...result.summary,
          scenario: scenario.name,
          duration: `${duration}s`
        });
      }
      
      return {
        success: true,
        scenario: scenarioName,
        scenarioName: scenario.name,
        description: scenario.description,
        duration,
        ...result
      };
    } else {
      throw new Error(result.error || 'Seeding failed');
    }
  } catch (error) {
    console.error(`Error executing scenario '${scenarioName}':`, error.message);
    return {
      success: false,
      scenario: scenarioName,
      error: error.message
    };
  }
}

/**
 * Execute multiple scenarios in sequence
 */
async function executeMultipleScenarios(scenarioNames, options = {}) {
  const { verbose = false, continueOnError = false } = options;
  
  if (verbose) {
    logSection(`Executing Multiple Scenarios`);
    logProgress(`Scenarios: ${scenarioNames.join(', ')}`, 'info');
  }
  
  const results = [];
  
  for (const scenarioName of scenarioNames) {
    try {
      const result = await executeScenario(scenarioName, options);
      results.push(result);
      
      if (!result.success && !continueOnError) {
        break;
      }
    } catch (error) {
      const errorResult = {
        success: false,
        scenario: scenarioName,
        error: error.message
      };
      results.push(errorResult);
      
      if (!continueOnError) {
        break;
      }
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  if (verbose) {
    logSummary('Multiple Scenarios Results', {
      totalScenarios: results.length,
      successful: successCount,
      failed: failureCount,
      scenarios: results.map(r => `${r.scenario}: ${r.success ? '✅' : '❌'}`).join(', ')
    });
  }
  
  return {
    success: failureCount === 0,
    results,
    summary: {
      total: results.length,
      successful: successCount,
      failed: failureCount
    }
  };
}

/**
 * Interactive scenario selection
 */
async function interactiveScenarioSelection() {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\n🌱 Available Seeding Scenarios:');
  console.log('═'.repeat(60));
  
  Object.entries(SCENARIOS).forEach(([key, scenario], index) => {
    console.log(`${index + 1}. ${scenario.name}`);
    console.log(`   ${scenario.description}`);
    console.log('');
  });
  
  const scenarioKeys = Object.keys(SCENARIOS);
  
  const answer = await new Promise(resolve => {
    rl.question('Select a scenario (1-' + scenarioKeys.length + ') or enter scenario name: ', resolve);
  });
  
  rl.close();
  
  // Check if it's a number
  const num = parseInt(answer);
  if (num >= 1 && num <= scenarioKeys.length) {
    return scenarioKeys[num - 1];
  }
  
  // Check if it's a scenario name
  if (SCENARIOS[answer]) {
    return answer;
  }
  
  throw new Error(`Invalid selection: ${answer}`);
}

/**
 * List all available scenarios
 */
function listScenarios(options = {}) {
  const { verbose = false } = options;
  
  console.log('\n🌱 Available Seeding Scenarios:');
  console.log('═'.repeat(80));
  
  Object.entries(SCENARIOS).forEach(([key, scenario]) => {
    console.log(`\n📋 ${key.toUpperCase()}`);
    console.log(`   Name: ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);
    
    if (verbose) {
      console.log(`   Configuration:`);
      Object.entries(scenario.config).forEach(([configKey, configValue]) => {
        console.log(`     ${configKey}: ${JSON.stringify(configValue)}`);
      });
    }
  });
  
  console.log('\n' + '═'.repeat(80));
  console.log(`Total scenarios available: ${Object.keys(SCENARIOS).length}`);
}

/**
 * Validate scenario configuration
 */
function validateScenarioConfig(scenarioName) {
  if (!SCENARIOS[scenarioName]) {
    return {
      valid: false,
      error: `Unknown scenario: ${scenarioName}`
    };
  }
  
  const scenario = SCENARIOS[scenarioName];
  const config = scenario.config;
  
  // Basic validation
  const validations = [];
  
  if (config.scenarios && !Array.isArray(config.scenarios)) {
    validations.push('scenarios must be an array');
  }
  
  if (config.userCount && (typeof config.userCount !== 'number' || config.userCount < 1)) {
    validations.push('userCount must be a positive number');
  }
  
  if (config.weeksOfHistory && (typeof config.weeksOfHistory !== 'number' || config.weeksOfHistory < 1)) {
    validations.push('weeksOfHistory must be a positive number');
  }
  
  return {
    valid: validations.length === 0,
    errors: validations,
    config
  };
}

/**
 * Get scenario recommendations based on use case
 */
function getScenarioRecommendations(useCase) {
  const recommendations = {
    development: ['basic', 'userJourneys'],
    testing: ['comprehensive', 'edge_cases'],
    performance: ['performance', 'analytics'],
    mobile: ['mobile', 'basic'],
    demo: ['userJourneys', 'analytics'],
    minimal: ['minimal']
  };
  
  return recommendations[useCase] || ['basic'];
}

// Export functions for use in other modules
module.exports = {
  SCENARIOS,
  executeScenario,
  executeMultipleScenarios,
  interactiveScenarioSelection,
  listScenarios,
  validateScenarioConfig,
  getScenarioRecommendations
};

// Allow running directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    dryRun: args.includes('--dry-run'),
    continueOnError: args.includes('--continue-on-error')
  };
  
  switch (command) {
    case 'list':
      listScenarios({ verbose: options.verbose });
      break;
    
    case 'interactive':
      interactiveScenarioSelection()
        .then(scenarioName => {
          console.log(`\nExecuting scenario: ${scenarioName}`);
          return executeScenario(scenarioName, options);
        })
        .then(result => {
          if (result.success) {
            console.log('✅ Scenario completed successfully');
          } else {
            console.error('❌ Scenario failed:', result.error);
            process.exit(1);
          }
        })
        .catch(error => {
          console.error('❌ Error:', error.message);
          process.exit(1);
        });
      break;
    
    case 'validate':
      const scenarioToValidate = args[1];
      if (!scenarioToValidate) {
        console.error('Please specify a scenario to validate');
        process.exit(1);
      }
      
      const validation = validateScenarioConfig(scenarioToValidate);
      if (validation.valid) {
        console.log(`✅ Scenario '${scenarioToValidate}' is valid`);
        if (options.verbose) {
          console.log('Configuration:', JSON.stringify(validation.config, null, 2));
        }
      } else {
        console.error(`❌ Scenario '${scenarioToValidate}' is invalid:`);
        validation.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }
      break;
    
    case 'recommend':
      const useCase = args[1];
      if (!useCase) {
        console.log('Available use cases: development, testing, performance, mobile, demo, minimal');
        process.exit(1);
      }
      
      const recommendations = getScenarioRecommendations(useCase);
      console.log(`Recommended scenarios for '${useCase}':`);
      recommendations.forEach(scenario => {
        console.log(`  - ${scenario}: ${SCENARIOS[scenario]?.name || 'Unknown'}`);
      });
      break;
    
    default:
      if (command && SCENARIOS[command]) {
        // Execute specific scenario
        executeScenario(command, options)
          .then(result => {
            if (result.success) {
              console.log(`✅ Scenario '${command}' completed successfully`);
            } else {
              console.error(`❌ Scenario '${command}' failed:`, result.error);
              process.exit(1);
            }
          })
          .catch(error => {
            console.error(`❌ Error executing scenario '${command}':`, error.message);
            process.exit(1);
          });
      } else if (command && command.includes(',')) {
        // Execute multiple scenarios
        const scenarioNames = command.split(',').map(s => s.trim());
        executeMultipleScenarios(scenarioNames, options)
          .then(result => {
            if (result.success) {
              console.log('✅ All scenarios completed successfully');
            } else {
              console.error('❌ Some scenarios failed');
              process.exit(1);
            }
          })
          .catch(error => {
            console.error('❌ Error executing scenarios:', error.message);
            process.exit(1);
          });
      } else {
        console.log(`
🌱 Seeding Scenarios Tool

USAGE:
  node seeding-scenarios.js [command|scenario] [options]

COMMANDS:
  list                    List all available scenarios
  interactive             Interactive scenario selection
  validate <scenario>     Validate scenario configuration
  recommend <use-case>    Get scenario recommendations
  <scenario-name>         Execute specific scenario
  <scenario1,scenario2>   Execute multiple scenarios

SCENARIOS:
  ${Object.keys(SCENARIOS).join(', ')}

OPTIONS:
  --dry-run              Show what would be done without executing
  --continue-on-error    Continue executing scenarios even if one fails
  -v, --verbose          Show detailed progress information

EXAMPLES:
  node seeding-scenarios.js list --verbose
  node seeding-scenarios.js basic --verbose
  node seeding-scenarios.js basic,performance --continue-on-error
  node seeding-scenarios.js interactive
  node seeding-scenarios.js recommend development
        `);
      }
      break;
  }
}