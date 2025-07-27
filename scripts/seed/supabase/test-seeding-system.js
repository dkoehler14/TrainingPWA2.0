#!/usr/bin/env node

/**
 * Comprehensive Test Suite for Supabase Seeding System
 * 
 * This script tests all components of the seeding system to ensure
 * they work correctly and meet the requirements.
 */

const { SupabaseSeedingSystem } = require('./seeding-system');
const { validateSupabaseConnection } = require('../utils/supabase-helpers');
const { logProgress, logSection, logSummary, logError } = require('../utils/logger');

/**
 * Test suite configuration
 */
const TEST_CONFIG = {
  verbose: true,
  timeout: 30000, // 30 seconds per test
  cleanup: true
};

/**
 * Test results tracking
 */
let testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: []
};

/**
 * Main test runner
 */
async function runTestSuite() {
  const startTime = Date.now();
  
  logSection('Supabase Seeding System Test Suite');
  
  try {
    // Initialize seeding system
    const system = new SupabaseSeedingSystem({ 
      verbose: TEST_CONFIG.verbose,
      force: true 
    });
    
    // Test 1: System Initialization
    await runTest('System Initialization', async () => {
      const result = await system.initialize();
      if (!result.success) {
        throw new Error(`Initialization failed: ${result.error}`);
      }
      return { message: 'System initialized successfully' };
    });
    
    // Test 2: Database Connection
    await runTest('Database Connection', async () => {
      await validateSupabaseConnection();
      return { message: 'Database connection validated' };
    });
    
    // Test 3: Database Status Check
    await runTest('Database Status Check', async () => {
      const result = await system.getStatus();
      if (!result.success) {
        throw new Error(`Status check failed: ${result.error}`);
      }
      return { 
        message: 'Status check completed',
        details: { totalRecords: result.totalRecords }
      };
    });
    
    // Test 4: Database Reset
    await runTest('Database Reset', async () => {
      const result = await system.reset('full', { force: true });
      if (!result.success) {
        throw new Error(`Reset failed: ${result.error}`);
      }
      return { 
        message: 'Database reset completed',
        details: result.statistics
      };
    });
    
    // Test 5: Basic Seeding
    await runTest('Basic Seeding', async () => {
      const result = await system.seed('basic');
      if (!result.success) {
        throw new Error(`Basic seeding failed: ${result.error}`);
      }
      return { 
        message: 'Basic seeding completed',
        details: result.summary
      };
    });
    
    // Test 6: Advanced Seeding
    await runTest('Advanced Seeding', async () => {
      await system.reset('full', { force: true });
      const result = await system.seed('advanced', { 
        userCount: 5, 
        weeksOfHistory: 2 
      });
      if (!result.success) {
        throw new Error(`Advanced seeding failed: ${result.error}`);
      }
      return { 
        message: 'Advanced seeding completed',
        details: result.summary
      };
    });
    
    // Test 7: Scenario Execution
    await runTest('Scenario Execution', async () => {
      await system.reset('full', { force: true });
      const result = await system.seed('scenario', { scenario: 'basic' });
      if (!result.success) {
        throw new Error(`Scenario execution failed: ${result.error}`);
      }
      return { 
        message: 'Scenario execution completed',
        details: result.summary
      };
    });
    
    // Test 8: Database Validation
    await runTest('Database Validation', async () => {
      const result = await system.validate();
      if (!result.success) {
        throw new Error(`Validation failed: ${result.error}`);
      }
      return { 
        message: 'Database validation completed',
        details: { 
          isHealthy: result.isHealthy,
          issuesFound: result.issues.length
        }
      };
    });
    
    // Test 9: Workflow Execution
    await runTest('Workflow Execution', async () => {
      const result = await system.executeWorkflow('development');
      if (!result.success) {
        throw new Error(`Workflow execution failed: ${result.error}`);
      }
      return { 
        message: 'Workflow execution completed',
        details: { 
          workflow: result.workflow,
          steps: Object.keys(result.results)
        }
      };
    });
    
    // Test 10: Cleanup and Optimization
    await runTest('Cleanup and Optimization', async () => {
      const result = await system.cleanup();
      if (!result.success) {
        throw new Error(`Cleanup failed: ${result.error}`);
      }
      return { 
        message: 'Cleanup completed',
        details: result.cleanupResults
      };
    });
    
    // Final cleanup if requested
    if (TEST_CONFIG.cleanup) {
      await runTest('Final Cleanup', async () => {
        const result = await system.reset('full', { force: true });
        if (!result.success) {
          throw new Error(`Final cleanup failed: ${result.error}`);
        }
        return { message: 'Final cleanup completed' };
      });
    }
    
    // Generate test report
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    generateTestReport(duration);
    
  } catch (error) {
    logError(error, 'Test suite execution', TEST_CONFIG.verbose);
    process.exit(1);
  }
}

/**
 * Run an individual test with timeout and error handling
 */
async function runTest(testName, testFunction) {
  const startTime = Date.now();
  
  try {
    logProgress(`Running: ${testName}`, 'info');
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Test timeout')), TEST_CONFIG.timeout);
    });
    
    // Run test with timeout
    const result = await Promise.race([testFunction(), timeoutPromise]);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    testResults.passed++;
    testResults.tests.push({
      name: testName,
      status: 'PASSED',
      duration,
      message: result.message,
      details: result.details
    });
    
    logProgress(`✅ ${testName} - ${result.message} (${duration}s)`, 'success');
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    testResults.failed++;
    testResults.tests.push({
      name: testName,
      status: 'FAILED',
      duration,
      error: error.message
    });
    
    logProgress(`❌ ${testName} - ${error.message} (${duration}s)`, 'error');
    
    if (TEST_CONFIG.verbose) {
      console.error(`   Error details: ${error.stack}`);
    }
  }
}

/**
 * Generate and display test report
 */
function generateTestReport(totalDuration) {
  logSection('Test Results Summary');
  
  const summary = {
    totalTests: testResults.tests.length,
    passed: testResults.passed,
    failed: testResults.failed,
    skipped: testResults.skipped,
    successRate: `${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`,
    totalDuration: `${totalDuration}s`
  };
  
  logSummary('Test Execution Summary', summary);
  
  // Show detailed results
  if (TEST_CONFIG.verbose) {
    console.log('\n📋 Detailed Test Results:');
    console.log('─'.repeat(80));
    
    testResults.tests.forEach((test, index) => {
      const status = test.status === 'PASSED' ? '✅' : '❌';
      console.log(`${index + 1}. ${status} ${test.name} (${test.duration}s)`);
      
      if (test.message) {
        console.log(`   ${test.message}`);
      }
      
      if (test.error) {
        console.log(`   Error: ${test.error}`);
      }
      
      if (test.details) {
        console.log(`   Details: ${JSON.stringify(test.details, null, 2)}`);
      }
      
      console.log('');
    });
  }
  
  // Exit with appropriate code
  if (testResults.failed > 0) {
    console.log('❌ Some tests failed. Please review the results above.');
    process.exit(1);
  } else {
    console.log('✅ All tests passed successfully!');
    process.exit(0);
  }
}

/**
 * Command line interface
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse command line options
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  if (args.includes('--quiet') || args.includes('-q')) {
    TEST_CONFIG.verbose = false;
  }
  
  if (args.includes('--no-cleanup')) {
    TEST_CONFIG.cleanup = false;
  }
  
  const timeoutArg = args.find(arg => arg.startsWith('--timeout='));
  if (timeoutArg) {
    TEST_CONFIG.timeout = parseInt(timeoutArg.split('=')[1]) * 1000;
  }
  
  // Run the test suite
  await runTestSuite();
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
🧪 Supabase Seeding System Test Suite

DESCRIPTION:
  Comprehensive test suite for validating all components of the PostgreSQL-compatible
  seeding system, including data generation, reset utilities, and development tools.

USAGE:
  node test-seeding-system.js [options]

OPTIONS:
  --timeout=<seconds>     Set test timeout in seconds (default: 30)
  --no-cleanup           Skip final database cleanup
  -q, --quiet            Reduce output verbosity
  -h, --help             Show this help message

TESTS INCLUDED:
  - System initialization and configuration
  - Database connection validation
  - Status checking and statistics
  - Database reset functionality
  - Basic and advanced seeding
  - Scenario execution
  - Database validation and integrity checks
  - Workflow execution
  - Cleanup and optimization

EXAMPLES:
  # Run full test suite with verbose output
  node test-seeding-system.js

  # Run tests with custom timeout and no cleanup
  node test-seeding-system.js --timeout=60 --no-cleanup

  # Run tests quietly
  node test-seeding-system.js --quiet

REQUIREMENTS:
  - Supabase must be running locally
  - Database must be accessible
  - All seeding system components must be available
  `);
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  });
}

module.exports = {
  runTestSuite,
  runTest,
  generateTestReport,
  TEST_CONFIG
};