/**
 * Supabase Test Setup
 * 
 * This file configures the testing environment for Supabase:
 * - Sets up test database connection
 * - Configures custom Jest matchers
 * - Provides global test utilities
 * - Handles test environment variables
 */

import '@testing-library/jest-dom'
import { customMatchers } from './utils/testHelpers'

// Extend Jest matchers with custom Supabase matchers
expect.extend(customMatchers)

// Set test environment variables
process.env.NODE_ENV = 'test'
process.env.REACT_APP_USE_SUPABASE = 'true'

// Use local Supabase for testing if not already configured
if (!process.env.REACT_APP_SUPABASE_LOCAL_URL) {
  process.env.REACT_APP_SUPABASE_LOCAL_URL = 'http://localhost:54321'
}

// Set default test keys if not provided
if (!process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY && !process.env.REACT_APP_SUPABASE_ANON_KEY) {
  console.warn('⚠️  No Supabase anon key found. Please set REACT_APP_SUPABASE_LOCAL_ANON_KEY or REACT_APP_SUPABASE_ANON_KEY')
}

if (!process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('⚠️  No Supabase service role key found. Please set REACT_APP_SUPABASE_SERVICE_ROLE_KEY for admin operations in tests')
}

// Global test timeout (30 seconds for database operations)
jest.setTimeout(30000)

// Mock console methods in test environment to reduce noise
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

console.error = (...args) => {
  // Only show errors that aren't expected test errors
  const message = args[0]
  if (typeof message === 'string') {
    // Filter out expected test errors
    const expectedErrors = [
      'Warning: ReactDOM.render is deprecated',
      'Warning: componentWillReceiveProps has been renamed',
      'act(...) is not supported in production builds'
    ]
    
    if (expectedErrors.some(expected => message.includes(expected))) {
      return
    }
  }
  
  originalConsoleError.apply(console, args)
}

console.warn = (...args) => {
  // Only show warnings that aren't expected test warnings
  const message = args[0]
  if (typeof message === 'string') {
    // Filter out expected test warnings
    const expectedWarnings = [
      'Warning: Failed to cleanup',
      'Warning: Test Supabase'
    ]
    
    if (expectedWarnings.some(expected => message.includes(expected))) {
      return
    }
  }
  
  originalConsoleWarn.apply(console, args)
}

// Global test utilities
global.testUtils = {
  // Wait for async operations
  waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Generate unique test IDs
  generateTestId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  // Mock date for consistent testing
  mockDate: (dateString) => {
    const mockDate = new Date(dateString)
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate)
    return mockDate
  },
  
  // Restore original Date
  restoreDate: () => {
    global.Date.mockRestore?.()
  }
}

// Setup and teardown hooks for database tests
let globalDbUtils = null

// Global setup - runs once before all tests
beforeAll(async () => {
  // Only setup database utils if we're running integration tests
  if (process.env.JEST_INTEGRATION_TESTS === 'true') {
    const { testEnvironment } = await import('./utils/testHelpers')
    try {
      globalDbUtils = await testEnvironment.setup()
      console.log('🗄️  Global database test environment ready')
    } catch (error) {
      console.error('❌ Failed to setup global test environment:', error.message)
      console.log('💡 Make sure Supabase is running locally: npx supabase start')
    }
  }
})

// Global teardown - runs once after all tests
afterAll(async () => {
  if (globalDbUtils) {
    const { testEnvironment } = await import('./utils/testHelpers')
    await testEnvironment.teardown(globalDbUtils)
    console.log('🧹 Global database test environment cleaned up')
  }
  
  // Restore console methods
  console.error = originalConsoleError
  console.warn = originalConsoleWarn
})

// Export test configuration for use in individual test files
export const testConfig = {
  supabaseUrl: process.env.REACT_APP_SUPABASE_LOCAL_URL || 'http://localhost:54321',
  isIntegrationTest: process.env.JEST_INTEGRATION_TESTS === 'true',
  timeout: 30000
}

// Helper to check if Supabase is available for testing
export const isSupabaseAvailable = async () => {
  try {
    const { createTestSupabaseClient } = await import('./utils/testHelpers')
    const client = createTestSupabaseClient()
    
    const { error } = await client
      .from('users')
      .select('count')
      .limit(1)
    
    return !error || error.code === 'PGRST116' // PGRST116 is "table not found" which is ok
  } catch (error) {
    return false
  }
}

// Skip tests if Supabase is not available
export const skipIfSupabaseUnavailable = () => {
  beforeAll(async () => {
    const available = await isSupabaseAvailable()
    if (!available) {
      console.log('⏭️  Skipping Supabase tests - local Supabase not available')
      console.log('💡 Start Supabase with: npx supabase start')
    }
  })
}

console.log('🧪 Supabase test environment configured')