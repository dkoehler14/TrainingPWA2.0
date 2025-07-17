/**
 * Main entry point for test data seeding
 * 
 * This script orchestrates the seeding process for test data in Firebase emulators.
 * It provides a command-line interface for seeding different types of data and scenarios.
 */

const { seedAll, resetAll } = require('./seeder');
const { validateEmulators } = require('./utils/emulator-helpers');

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const options = {
  scenario: args.includes('--scenario') ? args[args.indexOf('--scenario') + 1] : 'all',
  verbose: args.includes('--verbose'),
};

// Main execution function
async function main() {
  try {
    // Show help without emulator validation
    if (command === 'help' || !command) {
      showHelp();
      return;
    }
    
    // Validate emulators are running for other commands
    await validateEmulators();
    
    console.log('🌱 Starting test data seeding process...');
    
    switch (command) {
      case 'seed':
        await seedAll(options);
        break;
      case 'reset':
        await resetAll(options);
        break;
      default:
        showHelp();
        break;
    }
    
    console.log('✅ Operation completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Test Data Seeding Tool
======================

Commands:
  seed              Seed test data into Firebase emulators
  reset             Reset all test data in Firebase emulators
  help              Show this help message

Options:
  --scenario <name> Specify which scenario to seed (beginner, intermediate, advanced, all)
  --verbose         Show detailed progress information

Examples:
  node scripts/seed/index.js seed
  node scripts/seed/index.js seed --scenario beginner
  node scripts/seed/index.js reset
  `);
}

// Execute if run directly
if (require.main === module) {
  main();
}

module.exports = { seedAll, resetAll };