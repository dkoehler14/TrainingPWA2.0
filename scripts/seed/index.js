#!/usr/bin/env node

/**
 * Main entry point for test data seeding
 * 
 * This script orchestrates the seeding process for test data in Firebase emulators.
 * It provides a command-line interface for seeding different types of data and scenarios.
 */

const { seedAll, resetAll } = require('./seeder');
const { validateEmulators } = require('./utils/emulator-helpers');
const { logProgress, logSection } = require('./utils/logger');

/**
 * Parse command line arguments with enhanced options
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const options = {
    scenario: getArgValue(args, '--scenario') || 'basic',
    scenarios: getArgValue(args, '--scenarios') || null,
    verbose: args.includes('--verbose') || args.includes('-v'),
    force: args.includes('--force') || args.includes('-f'),
    quiet: args.includes('--quiet') || args.includes('-q'),
    includeHistoricalData: !args.includes('--no-history'),
    dryRun: args.includes('--dry-run'),
    help: args.includes('--help') || args.includes('-h'),
    version: args.includes('--version')
  };
  
  // Handle scenarios array
  if (options.scenarios) {
    options.scenarios = options.scenarios.split(',').map(s => s.trim());
  }
  
  return { command, options };
}

/**
 * Get argument value from command line args
 */
function getArgValue(args, flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

// Main execution function
async function main() {
  try {
    const { command, options } = parseArgs();
    
    // Handle version flag
    if (options.version) {
      showVersion();
      return;
    }
    
    // Show help without emulator validation
    if (command === 'help' || !command || options.help) {
      showHelp();
      return;
    }
    
    // Set up progress reporting based on options
    if (options.quiet) {
      // Suppress most output in quiet mode
      console.log = () => {};
    }
    
    // Validate emulators are running for other commands (unless dry run)
    if (!options.dryRun) {
      logProgress('Validating Firebase emulators...', 'info');
      await validateEmulators();
      logProgress('✅ Firebase emulators are running', 'success');
    } else {
      logProgress('🔍 Dry run mode - skipping emulator validation', 'warning');
    }
    
    const startTime = Date.now();
    
    switch (command) {
      case 'seed':
        await handleSeedCommand(options);
        break;
      case 'reset':
        await handleResetCommand(options);
        break;
      case 'status':
        await handleStatusCommand(options);
        break;
      default:
        logProgress(`Unknown command: ${command}`, 'error');
        showHelp();
        process.exit(1);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    if (!options.quiet) {
      logProgress(`Operation completed successfully in ${duration}s`, 'success');
    }
    
  } catch (error) {
    const { command, options } = parseArgs(); // Re-parse args for error handling
    logProgress(`Error: ${error.message}`, 'error');
    
    if (options?.verbose) {
      console.error('\nFull error details:');
      console.error(error);
    } else {
      console.log('\nUse --verbose flag for detailed error information.');
    }
    
    process.exit(1);
  }
}

/**
 * Handle seed command with enhanced options
 */
async function handleSeedCommand(options) {
  const { logSection, logSummary, logUserCredentials } = require('./utils/logger');
  
  logSection('Test Data Seeding');
  
  if (options.dryRun) {
    logProgress('🔍 Dry run mode - showing what would be seeded:', 'info');
    logSummary('Seeding Plan', {
      scenarios: options.scenarios || options.scenario,
      includeHistoricalData: options.includeHistoricalData,
      verboseOutput: options.verbose
    });
    return;
  }
  
  const seedOptions = {
    scenarios: options.scenarios || options.scenario,
    verbose: options.verbose,
    includeHistoricalData: options.includeHistoricalData
  };
  
  const result = await seedAll(seedOptions);
  
  if (result.success && !options.quiet) {
    logProgress('Seeding completed successfully!', 'complete');
    
    if (!options.verbose) {
      logSummary('Seeding Results', {
        usersCreated: result.summary.users,
        programsCreated: result.summary.programs,
        exercisesSeeded: result.summary.exercises,
        historicalData: result.summary.historicalData ? 'Generated' : 'Skipped',
        duration: `${result.summary.duration}s`
      });
      
      // Show user credentials for easy access
      if (result.users && result.users.length > 0) {
        logUserCredentials(result.users);
      }
    }
    
    console.log('\n🚀 Ready for testing! Your Firebase emulators now contain realistic test data.');
  }
}

/**
 * Handle reset command with enhanced options
 */
async function handleResetCommand(options) {
  const { logSection, logSummary } = require('./utils/logger');
  
  logSection('Test Data Reset');
  
  if (options.dryRun) {
    logProgress('🔍 Dry run mode - showing what would be reset:', 'info');
    logSummary('Reset Plan', {
      workoutLogs: 'All workout logs',
      workoutPrograms: 'All workout programs',
      testUsers: 'All test users',
      exerciseDatabase: 'Exercise database'
    });
    return;
  }
  
  const result = await resetAll(options);
  
  if (result.success && !options.quiet) {
    if (result.cancelled) {
      logProgress('Reset operation was cancelled', 'warning');
      return;
    }
    
    logProgress('Reset completed successfully!', 'complete');
    
    if (!options.verbose) {
      logSummary('Reset Results', {
        workoutLogsCleared: result.statistics.workoutLogs,
        programsCleared: result.statistics.programs,
        usersCleared: result.statistics.users,
        exercisesCleared: result.statistics.exercises,
        duration: `${result.statistics.duration}s`
      });
    }
    
    console.log('\n🧹 Firebase emulators have been reset to a clean state.');
  }
}

/**
 * Handle status command to show current data state
 */
async function handleStatusCommand(options) {
  logSection('Current Data Status');
  
  try {
    const { getFirestore } = require('./utils/firebase-config');
    const { getResetStatistics } = require('./utils/reset-helpers');
    
    const db = getFirestore();
    const stats = await getResetStatistics(db);
    
    console.log('Current data in Firebase emulators:');
    console.log('─'.repeat(40));
    console.log(`  Users: ${stats.users}`);
    console.log(`  Programs: ${stats.programs}`);
    console.log(`  Workout Logs: ${stats.workoutLogs}`);
    console.log(`  Exercises: ${stats.exercises}`);
    
    if (stats.users === 0) {
      console.log('\n💡 No test data found. Run "seed" command to populate emulators.');
    } else {
      console.log('\n✅ Test data is available for development and testing.');
    }
    
  } catch (error) {
    logProgress('Could not retrieve status - emulators may not be running', 'warning');
  }
}

/**
 * Show version information
 */
function showVersion() {
  const packageJson = require('../../package.json');
  console.log(`Test Data Seeding Tool v${packageJson.version}`);
}

/**
 * Show enhanced help information
 */
function showHelp() {
  console.log(`
🌱 Test Data Seeding Tool
=========================

DESCRIPTION:
  Manage test data for Firebase emulators with realistic user scenarios,
  workout programs, exercises, and historical data.

COMMANDS:
  seed              Seed test data into Firebase emulators
  reset             Reset all test data in Firebase emulators  
  status            Show current data status in emulators
  help              Show this help message

SEEDING OPTIONS:
  --scenario <name>     Single scenario (basic, beginner, intermediate, advanced)
  --scenarios <list>    Multiple scenarios (comma-separated)
  --no-history          Skip historical workout log generation
  --dry-run             Show what would be done without executing

GENERAL OPTIONS:
  -v, --verbose         Show detailed progress information
  -q, --quiet           Suppress most output (errors only)
  -f, --force           Skip confirmation prompts
  -h, --help            Show this help message
  --version             Show version information

EXAMPLES:
  # Basic seeding with default scenarios
  npm run seed:dev
  
  # Seed specific scenarios with verbose output
  npm run seed:dev -- --scenarios beginner,intermediate --verbose
  
  # Reset all data with confirmation
  npm run seed:reset
  
  # Force reset without confirmation
  npm run seed:reset -- --force
  
  # Check current data status
  node scripts/seed/index.js status
  
  # Dry run to see what would be seeded
  node scripts/seed/index.js seed --dry-run --verbose

AVAILABLE SCENARIOS:
  basic         - Simple test setup with one user of each type
  beginner      - New user with basic programs and minimal history
  intermediate  - Experienced user with varied programs and progress
  advanced      - Expert user with complex programs and extensive history
  comprehensive - All scenarios with maximum test data

NPM SCRIPTS:
  npm run seed:dev              # Seed basic test data
  npm run seed:reset            # Reset all test data
  npm run seed:scenarios        # Interactive scenario selection
  npm run seed:help             # Show this help
  `);
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { seedAll, resetAll };