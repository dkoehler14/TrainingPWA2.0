/**
 * Test Helpers for Supabase Testing Framework
 * 
 * This module provides comprehensive test utilities for testing with Supabase:
 * - Database setup and teardown
 * - Test data creation and cleanup
 * - Mock data generators
 * - Test environment configuration
 */

import { createClient } from '@supabase/supabase-js'

// UUID generation utility for tests
const generateTestUUID = () => {
  // Generate a proper UUID v4 format for testing
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// Test environment configuration
const TEST_SUPABASE_URL = process.env.REACT_APP_SUPABASE_LOCAL_URL || 'http://localhost:54321'
const TEST_SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
const TEST_SUPABASE_SERVICE_ROLE_KEY = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY

/**
 * Create a test Supabase client
 */
export const createTestSupabaseClient = () => {
  if (!TEST_SUPABASE_URL || !TEST_SUPABASE_ANON_KEY) {
    throw new Error('Test Supabase configuration is missing. Please set REACT_APP_SUPABASE_LOCAL_URL and REACT_APP_SUPABASE_LOCAL_ANON_KEY')
  }

  return createClient(TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  })
}

/**
 * Create a test admin Supabase client for database operations
 */
export const createTestAdminClient = () => {
  if (!TEST_SUPABASE_URL || !TEST_SUPABASE_SERVICE_ROLE_KEY) {
    console.warn('⚠️  Test admin Supabase configuration is missing. Integration tests will be skipped.')
    return null
  }

  return createClient(TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * Test data generators
 */
export const testDataGenerators = {
  /**
   * Generate test user data
   */
  createTestUser: (overrides = {}) => ({
    id: generateTestUUID(),
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    experience_level: 'beginner',
    preferred_units: 'LB',
    age: 25,
    weight: 150.0,
    height: 70.0,
    goals: ['strength', 'muscle_gain'],
    available_equipment: ['barbell', 'dumbbell'],
    injuries: [],
    preferences: {},
    settings: {},
    ...overrides
  }),

  /**
   * Generate test exercise data
   */
  createTestExercise: (overrides = {}) => ({
    name: `Test Exercise ${Date.now()}`,
    primary_muscle_group: 'Chest',
    exercise_type: 'Barbell',
    instructions: 'Test exercise instructions',
    is_global: true,
    ...overrides
  }),

  /**
   * Generate test program data
   */
  createTestProgram: (userId, overrides = {}) => ({
    user_id: userId,
    name: `Test Program ${Date.now()}`,
    description: 'Test program description',
    duration: 4,
    days_per_week: 3,
    weight_unit: 'LB',
    difficulty: 'beginner',
    goals: ['strength'],
    equipment: ['barbell'],
    is_template: false,
    is_current: false,
    is_active: true,
    completed_weeks: 0,
    ...overrides
  }),

  /**
   * Generate test workout log data
   */
  createTestWorkoutLog: (userId, overrides = {}) => ({
    user_id: userId,
    name: `Test Workout ${Date.now()}`,
    type: 'quick_workout',
    date: new Date().toISOString().split('T')[0],
    is_finished: false,
    is_draft: false,
    weight_unit: 'LB',
    duration: 60,
    notes: 'Test workout notes',
    ...overrides
  }),

  /**
   * Generate test workout log exercise data
   */
  createTestWorkoutLogExercise: (workoutLogId, exerciseId, overrides = {}) => ({
    workout_log_id: workoutLogId,
    exercise_id: exerciseId,
    sets: 3,
    reps: [10, 10, 10],
    weights: [135, 135, 135],
    completed: [true, true, true],
    bodyweight: null,
    notes: '',
    is_added: false,
    added_type: null,
    original_index: -1,
    order_index: 0,
    ...overrides
  })
}

/**
 * Database test utilities
 */
export class DatabaseTestUtils {
  constructor() {
    this.adminClient = createTestAdminClient()
    this.testClient = null
    
    // Only create test client if we have basic configuration
    try {
      this.testClient = createTestSupabaseClient()
    } catch (error) {
      console.warn('⚠️  Test Supabase client creation failed:', error.message)
    }
    
    this.createdRecords = {
      users: [],
      exercises: [],
      programs: [],
      program_workouts: [],
      program_exercises: [],
      workout_logs: [],
      workout_log_exercises: [],
      user_analytics: []
    }
  }

  /**
   * Clean up all test data created during tests
   */
  async cleanup() {
    if (!this.adminClient) {
      console.warn('⚠️  Admin client not available. Skipping cleanup.')
      return
    }
    
    try {
      // Delete in reverse dependency order to avoid foreign key constraints
      const tables = [
        'user_analytics',
        'workout_log_exercises',
        'workout_logs',
        'program_exercises',
        'program_workouts',
        'programs',
        'exercises',
        'users'
      ]

      for (const table of tables) {
        const recordIds = this.createdRecords[table]
        if (recordIds.length > 0) {
          const { error } = await this.adminClient
            .from(table)
            .delete()
            .in('id', recordIds)

          if (error) {
            console.warn(`Warning: Failed to cleanup ${table}:`, error.message)
          }
        }
      }

      // Reset tracking
      this.createdRecords = {
        users: [],
        exercises: [],
        programs: [],
        program_workouts: [],
        program_exercises: [],
        workout_logs: [],
        workout_log_exercises: [],
        user_analytics: []
      }
    } catch (error) {
      console.error('Cleanup failed:', error)
    }
  }

  /**
   * Create a test user and track it for cleanup
   */
  async createTestUser(userData = {}) {
    const user = testDataGenerators.createTestUser(userData)
    
    const { data, error } = await this.adminClient
      .from('users')
      .insert(user)
      .select()
      .single()

    if (error) throw error

    this.createdRecords.users.push(data.id)
    return data
  }

  /**
   * Create a test exercise and track it for cleanup
   */
  async createTestExercise(exerciseData = {}) {
    const exercise = testDataGenerators.createTestExercise(exerciseData)
    
    const { data, error } = await this.adminClient
      .from('exercises')
      .insert(exercise)
      .select()
      .single()

    if (error) throw error

    this.createdRecords.exercises.push(data.id)
    return data
  }

  /**
   * Create a test program and track it for cleanup
   */
  async createTestProgram(userId, programData = {}) {
    const program = testDataGenerators.createTestProgram(userId, programData)
    
    const { data, error } = await this.adminClient
      .from('programs')
      .insert(program)
      .select()
      .single()

    if (error) throw error

    this.createdRecords.programs.push(data.id)
    return data
  }

  /**
   * Create a test program workout and track it for cleanup
   */
  async createTestProgramWorkout(programId, workoutData = {}) {
    const workout = {
      program_id: programId,
      week_number: 1,
      day_number: 1,
      name: 'Test Workout',
      ...workoutData
    }
    
    const { data, error } = await this.adminClient
      .from('program_workouts')
      .insert(workout)
      .select()
      .single()

    if (error) throw error

    this.createdRecords.program_workouts.push(data.id)
    return data
  }

  /**
   * Create a test program exercise and track it for cleanup
   */
  async createTestProgramExercise(workoutId, exerciseId, exerciseData = {}) {
    const programExercise = {
      workout_id: workoutId,
      exercise_id: exerciseId,
      sets: 3,
      reps: 10,
      rest_minutes: 2,
      notes: '',
      order_index: 0,
      ...exerciseData
    }
    
    const { data, error } = await this.adminClient
      .from('program_exercises')
      .insert(programExercise)
      .select()
      .single()

    if (error) throw error

    this.createdRecords.program_exercises.push(data.id)
    return data
  }

  /**
   * Create a test workout log and track it for cleanup
   */
  async createTestWorkoutLog(userId, logData = {}) {
    const workoutLog = testDataGenerators.createTestWorkoutLog(userId, logData)
    
    const { data, error } = await this.adminClient
      .from('workout_logs')
      .insert(workoutLog)
      .select()
      .single()

    if (error) throw error

    this.createdRecords.workout_logs.push(data.id)
    return data
  }

  /**
   * Create a test workout log exercise and track it for cleanup
   */
  async createTestWorkoutLogExercise(workoutLogId, exerciseId, exerciseData = {}) {
    const logExercise = testDataGenerators.createTestWorkoutLogExercise(
      workoutLogId, 
      exerciseId, 
      exerciseData
    )
    
    const { data, error } = await this.adminClient
      .from('workout_log_exercises')
      .insert(logExercise)
      .select()
      .single()

    if (error) throw error

    this.createdRecords.workout_log_exercises.push(data.id)
    return data
  }

  /**
   * Create a complete test program with workouts and exercises
   */
  async createCompleteTestProgram(userId, options = {}) {
    const {
      programData = {},
      workoutsCount = 2,
      exercisesPerWorkout = 2
    } = options

    // Create program
    const program = await this.createTestProgram(userId, programData)

    // Create exercises
    const exercises = []
    for (let i = 0; i < exercisesPerWorkout; i++) {
      const exercise = await this.createTestExercise({
        name: `Test Exercise ${i + 1}`,
        primary_muscle_group: i % 2 === 0 ? 'Chest' : 'Back'
      })
      exercises.push(exercise)
    }

    // Create workouts with exercises
    const workouts = []
    for (let w = 0; w < workoutsCount; w++) {
      const workout = await this.createTestProgramWorkout(program.id, {
        week_number: 1,
        day_number: w + 1,
        name: `Day ${w + 1}`
      })

      // Add exercises to workout
      const programExercises = []
      for (let e = 0; e < exercises.length; e++) {
        const programExercise = await this.createTestProgramExercise(
          workout.id,
          exercises[e].id,
          {
            order_index: e,
            sets: 3,
            reps: 10
          }
        )
        programExercises.push(programExercise)
      }

      workouts.push({
        ...workout,
        program_exercises: programExercises
      })
    }

    return {
      program,
      exercises,
      workouts
    }
  }

  /**
   * Verify database connection and basic functionality
   */
  async verifyConnection() {
    if (!this.testClient) {
      throw new Error('Test client not available. Please check Supabase configuration.')
    }
    
    try {
      const { error } = await this.testClient
        .from('users')
        .select('count')
        .limit(1)

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return true
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`)
    }
  }

  /**
   * Reset database to clean state (use with caution)
   */
  async resetDatabase() {
    const tables = [
      'user_analytics',
      'workout_log_exercises', 
      'workout_logs',
      'program_exercises',
      'program_workouts',
      'programs',
      'exercises',
      'users'
    ]

    for (const table of tables) {
      const { error } = await this.adminClient
        .from(table)
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all records

      if (error) {
        console.warn(`Warning: Failed to reset ${table}:`, error.message)
      }
    }
  }
}

/**
 * Mock Supabase client for unit tests
 */
export const createMockSupabaseClient = () => {
  const mockChain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    then: jest.fn()
  }

  return {
    from: jest.fn(() => mockChain),
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn(),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } }
      }))
    },
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn()
    })),
    removeChannel: jest.fn()
  }
}

/**
 * Test environment setup and teardown helpers
 */
export const testEnvironment = {
  /**
   * Setup test environment before all tests
   */
  async setup() {
    // Verify Supabase connection
    const dbUtils = new DatabaseTestUtils()
    await dbUtils.verifyConnection()
    
    console.log('✅ Test environment setup complete')
    return dbUtils
  },

  /**
   * Cleanup test environment after all tests
   */
  async teardown(dbUtils) {
    if (dbUtils) {
      await dbUtils.cleanup()
    }
    console.log('🧹 Test environment cleanup complete')
  }
}

/**
 * Custom Jest matchers for Supabase testing
 */
export const customMatchers = {
  /**
   * Check if a Supabase response is successful
   */
  toBeSuccessfulSupabaseResponse(received) {
    const pass = received && !received.error && received.data !== undefined
    
    if (pass) {
      return {
        message: () => `Expected response to not be a successful Supabase response`,
        pass: true
      }
    } else {
      return {
        message: () => `Expected response to be a successful Supabase response, but got error: ${received?.error?.message || 'Unknown error'}`,
        pass: false
      }
    }
  },

  /**
   * Check if a Supabase response has an error
   */
  toHaveSupabaseError(received, expectedErrorCode) {
    const hasError = received && received.error
    const hasExpectedCode = expectedErrorCode ? received.error?.code === expectedErrorCode : true
    const pass = hasError && hasExpectedCode
    
    if (pass) {
      return {
        message: () => `Expected response to not have Supabase error${expectedErrorCode ? ` with code ${expectedErrorCode}` : ''}`,
        pass: true
      }
    } else {
      return {
        message: () => `Expected response to have Supabase error${expectedErrorCode ? ` with code ${expectedErrorCode}` : ''}, but got: ${received?.error?.message || 'No error'}`,
        pass: false
      }
    }
  }
}

// Export default database utils instance for convenience (only if properly configured)
let dbTestUtils = null
try {
  dbTestUtils = new DatabaseTestUtils()
} catch (error) {
  console.warn('⚠️  Default database test utils not available:', error.message)
}

export { dbTestUtils }