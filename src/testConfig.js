/**
 * Test Configuration for Supabase Testing Framework
 * 
 * This module provides centralized test configuration and utilities
 * for both unit and integration tests with Supabase.
 */

// Test environment detection
export const isTestEnvironment = process.env.NODE_ENV === 'test'
export const isIntegrationTest = process.env.JEST_INTEGRATION_TESTS === 'true'
export const isUnitTest = !isIntegrationTest

// Supabase test configuration
export const supabaseTestConfig = {
  url: process.env.REACT_APP_SUPABASE_LOCAL_URL || 'http://localhost:54321',
  anonKey: process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY,
  serviceRoleKey: process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY,
  timeout: 30000,
  retries: 3
}

// Test database configuration
export const testDatabaseConfig = {
  // Use separate test schema if available
  schema: process.env.REACT_APP_TEST_SCHEMA || 'public',
  
  // Test data cleanup settings
  autoCleanup: true,
  cleanupTimeout: 5000,
  
  // Test isolation settings
  isolateTests: true,
  resetBetweenTests: false
}

// Mock configuration
export const mockConfig = {
  // Whether to use real Supabase or mocks
  useRealSupabase: isIntegrationTest,
  
  // Mock response delays (for testing loading states)
  mockDelay: 0,
  
  // Mock error simulation
  simulateErrors: false,
  errorRate: 0.1
}

// Test data configuration
export const testDataConfig = {
  // Default test user data
  defaultUser: {
    name: 'Test User',
    email: 'test@example.com',
    experience_level: 'beginner',
    preferred_units: 'LB',
    age: 25,
    weight: 150,
    height: 70
  },
  
  // Default test exercise data
  defaultExercise: {
    name: 'Test Exercise',
    primary_muscle_group: 'Chest',
    exercise_type: 'Barbell',
    instructions: 'Test instructions',
    is_global: true
  },
  
  // Default test program data
  defaultProgram: {
    name: 'Test Program',
    description: 'Test program description',
    duration: 4,
    days_per_week: 3,
    weight_unit: 'LB',
    difficulty: 'beginner',
    goals: ['strength'],
    equipment: ['barbell']
  }
}

// Test utilities configuration
export const testUtilsConfig = {
  // Unique ID generation
  generateUniqueId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  // Test timeout settings
  defaultTimeout: 10000,
  databaseTimeout: 30000,
  
  // Retry settings
  maxRetries: 3,
  retryDelay: 1000
}

// Validation configuration
export const validationConfig = {
  // Skip validation in tests
  skipValidation: false,
  
  // Strict validation mode
  strictMode: true,
  
  // Custom validation rules for tests
  testValidationRules: {
    allowEmptyStrings: true,
    allowNullValues: true,
    skipRequiredFields: false
  }
}

// Performance testing configuration
export const performanceConfig = {
  // Enable performance monitoring in tests
  enableMonitoring: false,
  
  // Performance thresholds
  thresholds: {
    queryTime: 1000, // ms
    renderTime: 100, // ms
    memoryUsage: 50 * 1024 * 1024 // 50MB
  },
  
  // Load testing settings
  loadTest: {
    concurrentUsers: 10,
    requestsPerSecond: 100,
    duration: 30000 // 30 seconds
  }
}

// Export all configurations
export const testConfig = {
  isTestEnvironment,
  isIntegrationTest,
  isUnitTest,
  supabase: supabaseTestConfig,
  database: testDatabaseConfig,
  mock: mockConfig,
  testData: testDataConfig,
  utils: testUtilsConfig,
  validation: validationConfig,
  performance: performanceConfig
}

export default testConfig