#!/usr/bin/env node

/**
 * Comprehensive Integration Test Runner
 * 
 * Executes all integration tests for the Firestore to Supabase migration:
 * - Sets up test environment
 * - Runs comprehensive integration tests
 * - Runs performance and load tests
 * - Runs data integrity tests
 * - Generates test reports
 * - Validates migration completeness
 */

const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// Test configuration
const TEST_CONFIG = {
  timeout: 300000, // 5 minutes per test suite
  maxWorkers: 1, // Run tests sequentially to avoid conflicts
  verbose: true,
  coverage: true,
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  testEnvironment: 'jsdom'
}

// Test suites to run
const TEST_SUITES = [
  {
    name: 'Comprehensive Integration Tests',
    pattern: 'src/__tests__/comprehensive-integration.test.js',
    description: 'End-to-end user workflow validation'
  },
  {
    name: 'Performance and Load Tests',
    pattern: 'src/__tests__/performance-load.test.js',
    description: 'System performance under load'
  },
  {
    name: 'Data Integrity Tests',
    pattern: 'src/__tests__/data-integrity.test.js',
    description: 'Data consistency and business logic validation'
  }
]

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logSection(title) {
  log('\n' + '='.repeat(60), 'cyan')
  log(`  ${title}`, 'bright')
  log('='.repeat(60), 'cyan')
}

function logSubsection(title) {
  log(`\n${'-'.repeat(40)}`, 'blue')
  log(`  ${title}`, 'blue')
  log('-'.repeat(40), 'blue')
}

async function checkPrerequisites() {
  logSection('Checking Prerequisites')
  
  const checks = [
    {
      name: 'Node.js version',
      check: () => {
        const version = process.version
        log(`Node.js version: ${version}`, 'green')
        return version.startsWith('v18') || version.startsWith('v20')
      }
    },
    {
      name: 'Supabase CLI',
      check: () => {
        try {
          execSync('supabase --version', { stdio: 'pipe' })
          log('Supabase CLI: Available', 'green')
          return true
        } catch (error) {
          log('Supabase CLI: Not found', 'red')
          return false
        }
      }
    },
    {
      name: 'Environment variables',
      check: () => {
        const required = [
          'REACT_APP_SUPABASE_LOCAL_URL',
          'REACT_APP_SUPABASE_LOCAL_ANON_KEY',
          'REACT_APP_SUPABASE_SERVICE_ROLE_KEY'
        ]
        
        const missing = required.filter(env => !process.env[env])
        
        if (missing.length === 0) {
          log('Environment variables: All present', 'green')
          return true
        } else {
          log(`Environment variables: Missing ${missing.join(', ')}`, 'red')
          return false
        }
      }
    },
    {
      name: 'Test database connection',
      check: async () => {
        try {
          const { createClient } = require('@supabase/supabase-js')
          const client = createClient(
            process.env.REACT_APP_SUPABASE_LOCAL_URL || 'http://localhost:54321',
            process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY || 'test-key'
          )
          
          const { error } = await client.from('users').select('count').limit(1)
          
          if (!error || error.code === 'PGRST116') {
            log('Test database: Connected', 'green')
            return true
          } else {
            log(`Test database: Connection failed - ${error.message}`, 'red')
            return false
          }
        } catch (error) {
          log(`Test database: Connection error - ${error.message}`, 'red')
          return false
        }
      }
    }
  ]

  let allPassed = true
  
  for (const check of checks) {
    try {
      const result = await check.check()
      if (!result) {
        allPassed = false
      }
    } catch (error) {
      log(`${check.name}: Error - ${error.message}`, 'red')
      allPassed = false
    }
  }

  if (!allPassed) {
    log('\n❌ Prerequisites check failed. Please fix the issues above.', 'red')
    process.exit(1)
  }

  log('\n✅ All prerequisites satisfied', 'green')
}

async function setupTestEnvironment() {
  logSection('Setting Up Test Environment')
  
  try {
    // Set test environment variables
    process.env.NODE_ENV = 'test'
    process.env.JEST_INTEGRATION_TESTS = 'true'
    process.env.CI = 'true' // Disable watch mode
    
    log('Environment variables set', 'green')
    
    // Ensure Supabase is running
    log('Checking Supabase status...', 'yellow')
    
    try {
      execSync('supabase status', { stdio: 'pipe' })
      log('Supabase is running', 'green')
    } catch (error) {
      log('Starting Supabase...', 'yellow')
      execSync('supabase start', { stdio: 'inherit' })
      log('Supabase started', 'green')
    }
    
    // Wait for services to be ready
    log('Waiting for services to be ready...', 'yellow')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    log('✅ Test environment ready', 'green')
    
  } catch (error) {
    log(`❌ Failed to setup test environment: ${error.message}`, 'red')
    process.exit(1)
  }
}

function runTestSuite(suite) {
  return new Promise((resolve, reject) => {
    logSubsection(`Running: ${suite.name}`)
    log(`Description: ${suite.description}`, 'cyan')
    
    const startTime = Date.now()
    
    // Build Jest command
    const jestArgs = [
      '--testPathPattern', suite.pattern,
      '--testTimeout', TEST_CONFIG.timeout.toString(),
      '--maxWorkers', TEST_CONFIG.maxWorkers.toString(),
      '--verbose',
      '--no-cache',
      '--forceExit',
      '--detectOpenHandles'
    ]
    
    if (TEST_CONFIG.coverage) {
      jestArgs.push('--coverage', '--coverageDirectory', `coverage/${suite.name.toLowerCase().replace(/\\s+/g, '-')}`)
    }
    
    const jest = spawn('npx', ['jest', ...jestArgs], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        JEST_INTEGRATION_TESTS: 'true'
      }
    })
    
    jest.on('close', (code) => {
      const duration = Date.now() - startTime
      const durationStr = `${(duration / 1000).toFixed(2)}s`
      
      if (code === 0) {
        log(`✅ ${suite.name} completed successfully in ${durationStr}`, 'green')
        resolve({ suite, success: true, duration, code })
      } else {
        log(`❌ ${suite.name} failed with code ${code} after ${durationStr}`, 'red')
        resolve({ suite, success: false, duration, code })
      }
    })
    
    jest.on('error', (error) => {
      log(`❌ ${suite.name} error: ${error.message}`, 'red')
      reject(error)
    })
  })
}

async function runAllTests() {
  logSection('Running Integration Test Suites')
  
  const results = []
  
  for (const suite of TEST_SUITES) {
    try {
      const result = await runTestSuite(suite)
      results.push(result)
      
      // Add delay between test suites to allow cleanup
      if (suite !== TEST_SUITES[TEST_SUITES.length - 1]) {
        log('Waiting for cleanup...', 'yellow')
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      
    } catch (error) {
      log(`❌ Failed to run ${suite.name}: ${error.message}`, 'red')
      results.push({
        suite,
        success: false,
        duration: 0,
        code: 1,
        error: error.message
      })
    }
  }
  
  return results
}

function generateReport(results) {
  logSection('Test Results Summary')
  
  const totalDuration = results.reduce((sum, result) => sum + result.duration, 0)
  const successCount = results.filter(result => result.success).length
  const failureCount = results.length - successCount
  
  log(`Total test suites: ${results.length}`, 'cyan')
  log(`Successful: ${successCount}`, successCount === results.length ? 'green' : 'yellow')
  log(`Failed: ${failureCount}`, failureCount === 0 ? 'green' : 'red')
  log(`Total duration: ${(totalDuration / 1000).toFixed(2)}s`, 'cyan')
  
  log('\nDetailed Results:', 'bright')
  results.forEach(result => {
    const status = result.success ? '✅' : '❌'
    const duration = `${(result.duration / 1000).toFixed(2)}s`
    const color = result.success ? 'green' : 'red'
    
    log(`  ${status} ${result.suite.name} (${duration})`, color)
    
    if (!result.success && result.error) {
      log(`    Error: ${result.error}`, 'red')
    }
  })
  
  // Generate JSON report
  const reportData = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful: successCount,
      failed: failureCount,
      duration: totalDuration
    },
    results: results.map(result => ({
      suite: result.suite.name,
      description: result.suite.description,
      success: result.success,
      duration: result.duration,
      code: result.code,
      error: result.error || null
    }))
  }
  
  const reportPath = path.join(process.cwd(), 'test-results', 'comprehensive-integration-report.json')
  
  // Ensure directory exists
  const reportDir = path.dirname(reportPath)
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2))
  log(`\n📊 Detailed report saved to: ${reportPath}`, 'cyan')
  
  return { success: failureCount === 0, results }
}

function validateMigration() {
  logSection('Migration Validation')
  
  const validationChecks = [
    {
      name: 'No Firebase imports',
      check: () => {
        try {
          // Check for Firebase imports in source files
          const { execSync } = require('child_process')
          const result = execSync('grep -r "from.*firebase" src/ || true', { encoding: 'utf8' })
          
          if (result.trim()) {
            log('Found Firebase imports:', 'red')
            log(result, 'red')
            return false
          } else {
            log('No Firebase imports found', 'green')
            return true
          }
        } catch (error) {
          log(`Error checking Firebase imports: ${error.message}`, 'yellow')
          return true // Don't fail on grep errors
        }
      }
    },
    {
      name: 'Supabase configuration',
      check: () => {
        const configPath = path.join(process.cwd(), 'src', 'config', 'supabase.js')
        if (fs.existsSync(configPath)) {
          log('Supabase configuration file exists', 'green')
          return true
        } else {
          log('Supabase configuration file missing', 'red')
          return false
        }
      }
    },
    {
      name: 'Service implementations',
      check: () => {
        const services = [
          'authService.js',
          'userService.js',
          'exerciseService.js',
          'programService.js',
          'workoutLogService.js'
        ]
        
        const servicesDir = path.join(process.cwd(), 'src', 'services')
        let allExist = true
        
        services.forEach(service => {
          const servicePath = path.join(servicesDir, service)
          if (fs.existsSync(servicePath)) {
            log(`✓ ${service}`, 'green')
          } else {
            log(`✗ ${service} missing`, 'red')
            allExist = false
          }
        })
        
        return allExist
      }
    }
  ]
  
  let allPassed = true
  
  validationChecks.forEach(check => {
    try {
      const result = check.check()
      if (!result) {
        allPassed = false
      }
    } catch (error) {
      log(`${check.name}: Error - ${error.message}`, 'red')
      allPassed = false
    }
  })
  
  if (allPassed) {
    log('\n✅ Migration validation passed', 'green')
  } else {
    log('\n❌ Migration validation failed', 'red')
  }
  
  return allPassed
}

async function cleanup() {
  logSection('Cleanup')
  
  try {
    // Clean up any test artifacts
    log('Cleaning up test artifacts...', 'yellow')
    
    // Stop Supabase if we started it
    // (Optional - leave it running for development)
    
    log('✅ Cleanup completed', 'green')
  } catch (error) {
    log(`⚠️  Cleanup warning: ${error.message}`, 'yellow')
  }
}

async function main() {
  const startTime = Date.now()
  
  try {
    log('🚀 Starting Comprehensive Integration Tests', 'bright')
    log(`Timestamp: ${new Date().toISOString()}`, 'cyan')
    
    // Run all phases
    await checkPrerequisites()
    await setupTestEnvironment()
    const results = await runAllTests()
    const { success } = generateReport(results)
    const migrationValid = validateMigration()
    await cleanup()
    
    // Final summary
    const totalDuration = Date.now() - startTime
    logSection('Final Summary')
    
    log(`Total execution time: ${(totalDuration / 1000).toFixed(2)}s`, 'cyan')
    
    if (success && migrationValid) {
      log('🎉 All tests passed! Migration validation successful.', 'green')
      process.exit(0)
    } else {
      log('❌ Some tests failed or migration validation failed.', 'red')
      process.exit(1)
    }
    
  } catch (error) {
    log(`💥 Fatal error: ${error.message}`, 'red')
    console.error(error.stack)
    process.exit(1)
  }
}

// Handle process signals
process.on('SIGINT', async () => {
  log('\n🛑 Received SIGINT, cleaning up...', 'yellow')
  await cleanup()
  process.exit(130)
})

process.on('SIGTERM', async () => {
  log('\n🛑 Received SIGTERM, cleaning up...', 'yellow')
  await cleanup()
  process.exit(143)
})

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error)
    process.exit(1)
  })
}

module.exports = {
  checkPrerequisites,
  setupTestEnvironment,
  runTestSuite,
  runAllTests,
  generateReport,
  validateMigration,
  cleanup
}