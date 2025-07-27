#!/usr/bin/env node

/**
 * Supabase Test Runner
 * 
 * This script runs Supabase-specific tests with proper environment setup:
 * - Verifies Supabase local instance is running
 * - Sets up test environment variables
 * - Runs unit and integration tests
 * - Provides detailed test reporting
 */

const { execSync, spawn } = require('child_process')
const path = require('path')

// Test configuration
const testConfig = {
  supabaseUrl: process.env.REACT_APP_SUPABASE_LOCAL_URL || 'http://localhost:54321',
  timeout: 30000,
  verbose: process.argv.includes('--verbose'),
  integration: process.argv.includes('--integration'),
  unit: process.argv.includes('--unit') || (!process.argv.includes('--integration')),
  watch: process.argv.includes('--watch'),
  coverage: process.argv.includes('--coverage')
}

console.log('🧪 Supabase Test Runner')
console.log('========================')

/**
 * Check if Supabase is running locally
 */
async function checkSupabaseStatus() {
  try {
    console.log('🔍 Checking Supabase status...')
    
    const response = await fetch(`${testConfig.supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY || 'dummy-key'
      }
    })
    
    if (response.status === 200 || response.status === 401) {
      console.log('✅ Supabase is running locally')
      return true
    } else {
      console.log('❌ Supabase is not responding correctly')
      return false
    }
  } catch (error) {
    console.log('❌ Supabase is not running locally')
    console.log('💡 Start Supabase with: npx supabase start')
    return false
  }
}

/**
 * Run unit tests
 */
function runUnitTests() {
  console.log('\n📋 Running Unit Tests...')
  console.log('========================')
  
  const testCommand = [
    'react-scripts',
    'test',
    '--testPathIgnorePatterns=integration',
    '--env=jsdom'
  ]
  
  if (!testConfig.watch) {
    testCommand.push('--watchAll=false')
  }
  
  if (testConfig.coverage) {
    testCommand.push('--coverage')
  }
  
  if (testConfig.verbose) {
    testCommand.push('--verbose')
  }
  
  try {
    execSync(testCommand.join(' '), {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        REACT_APP_USE_SUPABASE: 'true'
      }
    })
    console.log('✅ Unit tests completed successfully')
    return true
  } catch (error) {
    console.log('❌ Unit tests failed')
    return false
  }
}

/**
 * Run integration tests
 */
function runIntegrationTests() {
  console.log('\n🔗 Running Integration Tests...')
  console.log('===============================')
  
  const testCommand = [
    'react-scripts',
    'test',
    '--testPathPattern=integration',
    '--runInBand', // Run tests serially for database operations
    '--env=jsdom'
  ]
  
  if (!testConfig.watch) {
    testCommand.push('--watchAll=false')
  }
  
  if (testConfig.verbose) {
    testCommand.push('--verbose')
  }
  
  try {
    execSync(testCommand.join(' '), {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        REACT_APP_USE_SUPABASE: 'true',
        JEST_INTEGRATION_TESTS: 'true'
      }
    })
    console.log('✅ Integration tests completed successfully')
    return true
  } catch (error) {
    console.log('❌ Integration tests failed')
    return false
  }
}

/**
 * Main test runner
 */
async function runTests() {
  let success = true
  
  // Check if we need Supabase for integration tests
  if (testConfig.integration) {
    const supabaseRunning = await checkSupabaseStatus()
    if (!supabaseRunning) {
      console.log('\n❌ Cannot run integration tests without Supabase')
      console.log('💡 Start Supabase with: npx supabase start')
      process.exit(1)
    }
  }
  
  // Run unit tests
  if (testConfig.unit) {
    const unitSuccess = runUnitTests()
    success = success && unitSuccess
  }
  
  // Run integration tests
  if (testConfig.integration) {
    const integrationSuccess = runIntegrationTests()
    success = success && integrationSuccess
  }
  
  // Final report
  console.log('\n📊 Test Summary')
  console.log('================')
  
  if (success) {
    console.log('✅ All tests passed!')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed')
    process.exit(1)
  }
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
Usage: node scripts/test-supabase.js [options]

Options:
  --unit          Run unit tests only (default)
  --integration   Run integration tests only
  --watch         Run tests in watch mode
  --coverage      Generate coverage report
  --verbose       Show verbose output
  --help          Show this help message

Examples:
  node scripts/test-supabase.js                    # Run unit tests
  node scripts/test-supabase.js --integration      # Run integration tests
  node scripts/test-supabase.js --unit --coverage  # Run unit tests with coverage
  node scripts/test-supabase.js --watch            # Run tests in watch mode

Environment Variables:
  REACT_APP_SUPABASE_LOCAL_URL      Local Supabase URL (default: http://localhost:54321)
  REACT_APP_SUPABASE_LOCAL_ANON_KEY Local Supabase anon key
  REACT_APP_SUPABASE_SERVICE_ROLE_KEY Service role key for admin operations
`)
}

// Handle command line arguments
if (process.argv.includes('--help')) {
  showHelp()
  process.exit(0)
}

// Run tests
runTests().catch(error => {
  console.error('❌ Test runner failed:', error)
  process.exit(1)
})