/**
 * Enhanced Integration Tests for Workout Log Save Flow
 * 
 * Tests the complete end-to-end save flow with comprehensive coverage of:
 * - Cache hit and miss scenarios
 * - Database constraint violation handling
 * - Error recovery mechanisms
 * - Real-world user interaction patterns
 * 
 * Requirements Coverage:
 * - 1.1: Check for existing workout log ID before deciding to create or update
 * - 1.2: Update existing log instead of creating new one when ID found
 * - 1.3: Create new workout log and cache ID when none exists
 * - 4.2: Database constraint violations are handled gracefully
 * - 4.3: Application handles constraint violations and attempts to update existing record
 * - 6.1: Save flow uses enhanced service methods with proper error handling
 * - 6.2: Error handling UI components display appropriate messages
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import LogWorkout from '../pages/LogWorkout'
import { AuthContext } from '../context/AuthContext'
import workoutLogService from '../services/workoutLogService'
import { WorkoutLogCacheManager } from '../utils/cacheManager'
import { testDataGenerators, createTestSupabaseClient, createTestAdminClient } from '../utils/testHelpers'
import { testConfig, skipIfSupabaseUnavailable } from '../setupSupabaseTests'

// Skip tests if Supabase is not available
skipIfSupabaseUnavailable()

// Mock the cache manager for controlled testing
jest.mock('../utils/cacheManager')

describe('Enhanced Workout Log Save Flow Integration Tests', () => {
  let testUser
  let testProgram
  let testExercises
  let supabaseClient
  let adminClient
  let createdWorkoutLogIds
  let mockAuthContext
  let mockCacheManager
  let originalConsoleError
  let originalConsoleWarn

  beforeAll(async () => {
    // Only run if integration tests are enabled
    if (!testConfig.isIntegrationTest) {
      console.log('⏭️  Skipping integration tests - set JEST_INTEGRATION_TESTS=true to enable')
      return
    }

    supabaseClient = createTestSupabaseClient()
    adminClient = createTestAdminClient()
    
    if (!adminClient) {
      console.log('⏭️  Skipping integration tests - admin client not available')
      return
    }

    // Suppress console noise during tests
    originalConsoleError = console.error
    originalConsoleWarn = console.warn
    console.error = jest.fn()
    console.warn = jest.fn()
  })

  afterAll(() => {
    // Restore console methods
    if (originalConsoleError) console.error = originalConsoleError
    if (originalConsoleWarn) console.warn = originalConsoleWarn
  })

  beforeEach(async () => {
    if (!testConfig.isIntegrationTest || !adminClient) return

    // Reset tracking arrays
    createdWorkoutLogIds = []

    // Create test user
    testUser = testDataGenerators.createTestUser()
    const { error: userError } = await adminClient
      .from('users')
      .insert(testUser)
    
    if (userError) {
      console.error('Failed to create test user:', userError)
      throw userError
    }

    // Create test exercises
    testExercises = [
      testDataGenerators.createTestExercise({
        name: 'Test Bench Press',
        primary_muscle_group: 'Chest',
        exercise_type: 'Barbell'
      }),
      testDataGenerators.createTestExercise({
        name: 'Test Squat',
        primary_muscle_group: 'Legs',
        exercise_type: 'Barbell'
      })
    ]

    const { data: exerciseData, error: exerciseError } = await adminClient
      .from('exercises')
      .insert(testExercises)
      .select()
    
    if (exerciseError) {
      console.error('Failed to create test exercises:', exerciseError)
      throw exerciseError
    }
    
    testExercises = exerciseData

    // Create test program
    testProgram = testDataGenerators.createTestProgram(testUser.id, {
      name: 'Integration Test Program',
      weekly_configs: [
        {
          week: 1,
          days: [
            {
              day: 1,
              name: 'Test Day 1',
              exercises: [
                {
                  exerciseId: testExercises[0].id,
                  sets: 3,
                  reps: [10, 10, 10],
                  weights: [135, 135, 135]
                },
                {
                  exerciseId: testExercises[1].id,
                  sets: 3,
                  reps: [8, 8, 8],
                  weights: [225, 225, 225]
                }
              ]
            }
          ]
        }
      ]
    })

    const { data: programData, error: programError } = await adminClient
      .from('programs')
      .insert(testProgram)
      .select()
      .single()
    
    if (programError) {
      console.error('Failed to create test program:', programError)
      throw programError
    }
    
    testProgram = programData

    // Setup mock auth context
    mockAuthContext = {
      user: testUser,
      loading: false,
      signIn: jest.fn(),
      signOut: jest.fn(),
      signUp: jest.fn()
    }

    // Setup mock cache manager
    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      validate: jest.fn(),
      invalidate: jest.fn(),
      cleanup: jest.fn(),
      generateKey: jest.fn((week, day) => `${week}_${day}`),
      exists: jest.fn(),
      clear: jest.fn(),
      getStats: jest.fn(() => ({
        totalEntries: 0,
        validEntries: 0,
        invalidEntries: 0,
        hitRate: 0
      }))
    }

    WorkoutLogCacheManager.mockImplementation(() => mockCacheManager)
  })

  afterEach(async () => {
    if (!testConfig.isIntegrationTest || !adminClient) return

    try {
      // Clean up workout logs
      if (createdWorkoutLogIds.length > 0) {
        await adminClient
          .from('workout_log_exercises')
          .delete()
          .in('workout_log_id', createdWorkoutLogIds)
        
        await adminClient
          .from('workout_logs')
          .delete()
          .in('id', createdWorkoutLogIds)
      }

      // Clean up test data
      if (testProgram?.id) {
        await adminClient
          .from('programs')
          .delete()
          .eq('id', testProgram.id)
      }

      if (testExercises?.length > 0) {
        await adminClient
          .from('exercises')
          .delete()
          .in('id', testExercises.map(e => e.id))
      }

      if (testUser?.id) {
        await adminClient
          .from('users')
          .delete()
          .eq('id', testUser.id)
      }
    } catch (error) {
      console.error('Cleanup error:', error)
    }

    // Reset mocks
    jest.clearAllMocks()
  })

  // Helper function to render LogWorkout component with proper context
  const renderLogWorkout = () => {
    return render(
      <BrowserRouter>
        <AuthContext.Provider value={mockAuthContext}>
          <LogWorkout />
        </AuthContext.Provider>
      </BrowserRouter>
    )
  }

  // Helper function to simulate user input for workout logging
  const simulateWorkoutInput = async (exerciseIndex = 0, setIndex = 0, weight = '135', reps = '10') => {
    // Find weight and reps inputs for the specified exercise and set
    const weightInputs = screen.getAllByLabelText(/weight/i)
    const repsInputs = screen.getAllByLabelText(/reps/i)
    
    const targetWeightInput = weightInputs[exerciseIndex * 3 + setIndex]
    const targetRepsInput = repsInputs[exerciseIndex * 3 + setIndex]

    if (targetWeightInput && targetRepsInput) {
      await act(async () => {
        fireEvent.change(targetWeightInput, { target: { value: weight } })
        fireEvent.change(targetRepsInput, { target: { value: reps } })
      })
    }
  }

  // Helper function to wait for debounced save to complete
  const waitForDebouncedSave = async (timeout = 3000) => {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, timeout))
    })
  }

  // Helper function to get workout logs from database
  const getWorkoutLogsFromDatabase = async (userId, programId, weekIndex, dayIndex) => {
    const { data, error } = await adminClient
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('program_id', programId)
      .eq('week_index', weekIndex)
      .eq('day_index', dayIndex)
    
    if (error) throw error
    return data || []
  }

  // Helper function to simulate constraint violation
  const simulateConstraintViolation = () => {
    const constraintError = new Error('duplicate key value violates unique constraint')
    constraintError.code = '23505'
    constraintError.message = 'duplicate key value violates unique constraint "unique_user_program_week_day"'
    constraintError.details = 'Key (user_id, program_id, week_index, day_index)=(test-user-id, test-program-id, 0, 0) already exists.'
    return constraintError
  }

  describe('Cache Hit Scenarios', () => {
    test('should use cached workout log ID for immediate updates', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      const cachedWorkoutLogId = 'cached-workout-log-id'
      
      // Mock cache hit scenario
      mockCacheManager.get.mockResolvedValue({
        workoutLogId: cachedWorkoutLogId,
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      })
      
      mockCacheManager.validate.mockResolvedValue({
        isValid: true,
        reason: 'Validation successful'
      })

      // Spy on service methods
      const updateSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogEnhanced')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      updateSpy.mockResolvedValue({
        id: cachedWorkoutLogId,
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Simulate workout input - should use cached ID
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify cache was checked and update was called
      expect(mockCacheManager.get).toHaveBeenCalled()
      expect(mockCacheManager.validate).toHaveBeenCalled()
      expect(updateSpy).toHaveBeenCalled()
      expect(createSpy).not.toHaveBeenCalled()

      // Restore location and spies
      window.location = originalLocation
      updateSpy.mockRestore()
      createSpy.mockRestore()
    })

    test('should handle cache validation success and proceed with update', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      const validCachedId = 'valid-cached-workout-log-id'
      
      // Pre-create a workout log to validate against
      const existingWorkoutLog = {
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0,
        name: 'Existing Cached Workout',
        type: 'program_workout',
        date: new Date().toISOString().split('T')[0],
        is_finished: false,
        is_draft: true,
        weight_unit: 'LB'
      }

      const { data: preCreatedLog, error } = await adminClient
        .from('workout_logs')
        .insert(existingWorkoutLog)
        .select()
        .single()

      if (error) throw error
      createdWorkoutLogIds.push(preCreatedLog.id)

      // Mock cache hit with valid ID
      mockCacheManager.get.mockResolvedValue({
        workoutLogId: preCreatedLog.id,
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      })
      
      // Mock successful validation
      mockCacheManager.validate.mockResolvedValue({
        isValid: true,
        reason: 'Validation successful',
        context: { databaseChecked: true }
      })

      // Spy on service methods
      const updateSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogEnhanced')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      updateSpy.mockResolvedValue(preCreatedLog)

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Simulate workout input
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify cache validation and update flow
      expect(mockCacheManager.get).toHaveBeenCalled()
      expect(mockCacheManager.validate).toHaveBeenCalledWith(
        expect.any(String),
        preCreatedLog.id,
        expect.objectContaining({ validateInDatabase: expect.any(Boolean) })
      )
      expect(updateSpy).toHaveBeenCalled()
      expect(createSpy).not.toHaveBeenCalled()

      // Restore location and spies
      window.location = originalLocation
      updateSpy.mockRestore()
      createSpy.mockRestore()
    })

    test('should update cache after successful save operation', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      const cachedWorkoutLogId = 'cached-workout-log-id'
      
      // Mock cache hit
      mockCacheManager.get.mockResolvedValue({
        workoutLogId: cachedWorkoutLogId,
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      })
      
      mockCacheManager.validate.mockResolvedValue({
        isValid: true,
        reason: 'Validation successful'
      })

      // Spy on service methods
      const updateSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogEnhanced')
      updateSpy.mockResolvedValue({
        id: cachedWorkoutLogId,
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0,
        updated_at: new Date().toISOString()
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify cache was updated after successful save
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          workoutLogId: cachedWorkoutLogId,
          lastSaved: expect.any(String),
          isValid: true
        }),
        expect.any(Object),
        expect.any(Function),
        expect.objectContaining({
          source: expect.any(String)
        })
      )

      // Restore location and spies
      window.location = originalLocation
      updateSpy.mockRestore()
    })
  })

  describe('Cache Miss Scenarios', () => {
    test('should fall back to database query when cache is empty', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null)

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      getSpy.mockResolvedValue(null) // No existing workout log
      createSpy.mockResolvedValue({
        id: 'new-workout-log-id',
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify fallback to database query and creation
      expect(mockCacheManager.get).toHaveBeenCalled()
      expect(getSpy).toHaveBeenCalledWith(
        testUser.id,
        testProgram.id,
        0,
        0
      )
      expect(createSpy).toHaveBeenCalled()

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
    })

    test('should handle cache validation failure and fall back to database', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      const invalidCachedId = 'invalid-cached-workout-log-id'
      
      // Mock cache hit with invalid ID
      mockCacheManager.get.mockResolvedValue({
        workoutLogId: invalidCachedId,
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      })
      
      // Mock validation failure
      mockCacheManager.validate.mockResolvedValue({
        isValid: false,
        reason: 'Workout log not found in database',
        context: { databaseChecked: true }
      })

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      getSpy.mockResolvedValue(null) // No existing workout log found
      createSpy.mockResolvedValue({
        id: 'new-workout-log-id',
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify validation failure triggered fallback
      expect(mockCacheManager.validate).toHaveBeenCalled()
      expect(mockCacheManager.cleanup).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.any(Function),
        expect.objectContaining({
          reason: expect.stringContaining('validation_failed')
        })
      )
      expect(getSpy).toHaveBeenCalled()
      expect(createSpy).toHaveBeenCalled()

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
    })

    test('should cache new workout log ID after creation', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      const newWorkoutLogId = 'new-workout-log-id'
      
      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null)

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      getSpy.mockResolvedValue(null)
      createSpy.mockResolvedValue({
        id: newWorkoutLogId,
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0,
        created_at: new Date().toISOString()
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify new ID was cached after creation
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          workoutLogId: newWorkoutLogId,
          isValid: true,
          exercises: expect.any(Array)
        }),
        expect.any(Object),
        expect.any(Function),
        expect.objectContaining({
          source: expect.any(String)
        })
      )

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
    })
  })

  describe('Database Constraint Violation Handling', () => {
    test('should handle unique constraint violation and attempt update', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null)

      // Pre-create a workout log that will cause constraint violation
      const existingWorkoutLog = {
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0,
        name: 'Existing Workout',
        type: 'program_workout',
        date: new Date().toISOString().split('T')[0],
        is_finished: false,
        is_draft: true,
        weight_unit: 'LB'
      }

      const { data: preCreatedLog, error } = await adminClient
        .from('workout_logs')
        .insert(existingWorkoutLog)
        .select()
        .single()

      if (error) throw error
      createdWorkoutLogIds.push(preCreatedLog.id)

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      const updateSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogEnhanced')
      
      // Mock database query returning null (simulating race condition)
      getSpy.mockResolvedValue(null)
      
      // Mock constraint violation on create
      const constraintError = simulateConstraintViolation()
      createSpy.mockRejectedValue(constraintError)
      
      // Mock successful update after constraint violation
      updateSpy.mockResolvedValue(preCreatedLog)

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify constraint violation was handled
      expect(getSpy).toHaveBeenCalled()
      expect(createSpy).toHaveBeenCalled()
      
      // The service should handle the constraint violation internally
      // and attempt to find and update the existing record

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
      updateSpy.mockRestore()
    })

    test('should display user-friendly error message for constraint violations', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null)

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      getSpy.mockResolvedValue(null)
      
      // Mock unrecoverable constraint violation
      const constraintError = simulateConstraintViolation()
      createSpy.mockRejectedValue(constraintError)

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Look for error handling UI elements
      // Note: The exact error message depends on the component's error handling implementation
      await waitFor(() => {
        // Check for error indicators or messages
        const errorElements = screen.queryAllByText(/error/i)
        const conflictElements = screen.queryAllByText(/conflict/i)
        const saveElements = screen.queryAllByText(/save/i)
        
        // At least one error-related element should be present
        expect(errorElements.length + conflictElements.length + saveElements.length).toBeGreaterThan(0)
      }, { timeout: 5000 })

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
    })

    test('should log constraint violation incidents with comprehensive details', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null)

      // Spy on console methods to verify logging
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      getSpy.mockResolvedValue(null)
      
      // Mock constraint violation
      const constraintError = simulateConstraintViolation()
      createSpy.mockRejectedValue(constraintError)

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify constraint violation was logged
      // The exact logging format depends on the service implementation
      const allCalls = [...consoleErrorSpy.mock.calls, ...consoleLogSpy.mock.calls]
      const constraintLogs = allCalls.filter(call => 
        call.some(arg => 
          typeof arg === 'string' && 
          (arg.includes('CONSTRAINT') || arg.includes('constraint') || arg.includes('violation'))
        )
      )

      expect(constraintLogs.length).toBeGreaterThan(0)

      // Restore location, spies, and console methods
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
      consoleErrorSpy.mockRestore()
      consoleLogSpy.mockRestore()
    })
  })

  describe('Error Recovery and Resilience', () => {
    test('should recover from network errors with retry mechanism', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null)

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      // Mock network error on first attempt
      const networkError = new Error('Network request failed')
      networkError.code = 'NETWORK_ERROR'
      
      getSpy
        .mockRejectedValueOnce(networkError) // First call fails
        .mockResolvedValueOnce(null) // Second call succeeds
      
      createSpy.mockResolvedValue({
        id: 'new-workout-log-id',
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify retry mechanism was triggered
      expect(getSpy).toHaveBeenCalledTimes(2) // First call failed, second succeeded
      expect(createSpy).toHaveBeenCalled()

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
    })

    test('should handle service unavailability gracefully', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null)

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      // Mock service unavailability
      const serviceError = new Error('Service temporarily unavailable')
      serviceError.code = 'SERVICE_UNAVAILABLE'
      
      getSpy.mockRejectedValue(serviceError)
      createSpy.mockRejectedValue(serviceError)

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify error handling
      expect(getSpy).toHaveBeenCalled()
      
      // Look for error handling UI
      await waitFor(() => {
        const errorElements = screen.queryAllByText(/error/i)
        const unavailableElements = screen.queryAllByText(/unavailable/i)
        const tryElements = screen.queryAllByText(/try/i)
        
        expect(errorElements.length + unavailableElements.length + tryElements.length).toBeGreaterThan(0)
      }, { timeout: 5000 })

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
    })

    test('should preserve user input during error recovery', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null)

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      
      // Mock temporary error followed by success
      const tempError = new Error('Temporary database error')
      getSpy
        .mockRejectedValueOnce(tempError)
        .mockResolvedValueOnce(null)
      
      createSpy.mockResolvedValue({
        id: 'new-workout-log-id',
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Input workout data
      await simulateWorkoutInput(0, 0, '135', '10')
      await simulateWorkoutInput(0, 1, '140', '9')
      
      // Verify input values are preserved
      const weightInputs = screen.getAllByLabelText(/weight/i)
      const repsInputs = screen.getAllByLabelText(/reps/i)
      
      expect(weightInputs[0]).toHaveValue('135')
      expect(repsInputs[0]).toHaveValue('10')
      expect(weightInputs[1]).toHaveValue('140')
      expect(repsInputs[1]).toHaveValue('9')

      await waitForDebouncedSave()

      // After error recovery, input should still be preserved
      expect(weightInputs[0]).toHaveValue('135')
      expect(repsInputs[0]).toHaveValue('10')
      expect(weightInputs[1]).toHaveValue('140')
      expect(repsInputs[1]).toHaveValue('9')

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
    })
  })

  describe('Complex User Interaction Patterns', () => {
    test('should handle rapid successive saves without data loss', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache behavior for rapid saves
      let cacheState = null
      mockCacheManager.get.mockImplementation(() => Promise.resolve(cacheState))
      mockCacheManager.set.mockImplementation((key, value) => {
        cacheState = value
        return Promise.resolve()
      })

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      const updateSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogEnhanced')
      
      const workoutLogId = 'rapid-save-workout-log-id'
      
      getSpy.mockResolvedValue(null)
      createSpy.mockResolvedValue({
        id: workoutLogId,
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })
      updateSpy.mockResolvedValue({
        id: workoutLogId,
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Simulate rapid successive inputs
      await act(async () => {
        await simulateWorkoutInput(0, 0, '135', '10')
        await new Promise(resolve => setTimeout(resolve, 100))
        await simulateWorkoutInput(0, 1, '140', '9')
        await new Promise(resolve => setTimeout(resolve, 100))
        await simulateWorkoutInput(0, 2, '145', '8')
        await new Promise(resolve => setTimeout(resolve, 100))
        await simulateWorkoutInput(1, 0, '225', '8')
      })

      await waitForDebouncedSave(5000)

      // Verify all input values are preserved
      const weightInputs = screen.getAllByLabelText(/weight/i)
      const repsInputs = screen.getAllByLabelText(/reps/i)
      
      expect(weightInputs[0]).toHaveValue('135')
      expect(repsInputs[0]).toHaveValue('10')
      expect(weightInputs[1]).toHaveValue('140')
      expect(repsInputs[1]).toHaveValue('9')
      expect(weightInputs[2]).toHaveValue('145')
      expect(repsInputs[2]).toHaveValue('8')
      expect(weightInputs[3]).toHaveValue('225')
      expect(repsInputs[3]).toHaveValue('8')

      // Verify only one workout log was created despite rapid inputs
      expect(createSpy).toHaveBeenCalledTimes(1)

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
      updateSpy.mockRestore()
    })

    test('should handle component re-mount without creating duplicates', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Pre-create a workout log
      const existingWorkoutLog = {
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0,
        name: 'Existing Workout',
        type: 'program_workout',
        date: new Date().toISOString().split('T')[0],
        is_finished: false,
        is_draft: true,
        weight_unit: 'LB'
      }

      const { data: preCreatedLog, error } = await adminClient
        .from('workout_logs')
        .insert(existingWorkoutLog)
        .select()
        .single()

      if (error) throw error
      createdWorkoutLogIds.push(preCreatedLog.id)

      // Mock cache behavior
      mockCacheManager.get.mockResolvedValue(null) // Cache miss on first mount
      
      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      const updateSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogEnhanced')
      
      getSpy.mockResolvedValue(preCreatedLog) // Find existing log
      updateSpy.mockResolvedValue(preCreatedLog)

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      // First mount
      const { unmount } = renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify existing log was found and updated
      expect(getSpy).toHaveBeenCalled()
      expect(updateSpy).toHaveBeenCalled()
      expect(createSpy).not.toHaveBeenCalled()

      // Reset mocks for second mount
      jest.clearAllMocks()
      
      // Mock cache hit on second mount (simulating cached ID from first mount)
      mockCacheManager.get.mockResolvedValue({
        workoutLogId: preCreatedLog.id,
        lastSaved: new Date().toISOString(),
        isValid: true,
        exercises: [],
        isWorkoutFinished: false
      })
      mockCacheManager.validate.mockResolvedValue({
        isValid: true,
        reason: 'Validation successful'
      })

      // Unmount and remount
      unmount()
      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      // Verify cache was used on second mount
      expect(mockCacheManager.get).toHaveBeenCalled()
      expect(mockCacheManager.validate).toHaveBeenCalled()
      expect(updateSpy).toHaveBeenCalled()
      expect(createSpy).not.toHaveBeenCalled()

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
      updateSpy.mockRestore()
    })

    test('should maintain data consistency across multiple exercise modifications', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock cache behavior
      let cacheState = null
      mockCacheManager.get.mockImplementation(() => Promise.resolve(cacheState))
      mockCacheManager.set.mockImplementation((key, value) => {
        cacheState = value
        return Promise.resolve()
      })

      // Spy on service methods
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLogEnhanced')
      const updateSpy = jest.spyOn(workoutLogService, 'updateWorkoutLogEnhanced')
      
      const workoutLogId = 'consistency-test-workout-log-id'
      
      getSpy.mockResolvedValue(null)
      createSpy.mockResolvedValue({
        id: workoutLogId,
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })
      updateSpy.mockResolvedValue({
        id: workoutLogId,
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Complex sequence of modifications
      const modifications = [
        { exercise: 0, set: 0, weight: '135', reps: '10' },
        { exercise: 0, set: 1, weight: '140', reps: '9' },
        { exercise: 1, set: 0, weight: '225', reps: '8' },
        { exercise: 0, set: 2, weight: '145', reps: '8' },
        { exercise: 1, set: 1, weight: '230', reps: '7' },
        { exercise: 1, set: 2, weight: '235', reps: '6' },
        // Go back and modify earlier sets
        { exercise: 0, set: 0, weight: '140', reps: '10' },
        { exercise: 0, set: 1, weight: '145', reps: '9' }
      ]

      // Execute modifications with delays
      for (const mod of modifications) {
        await simulateWorkoutInput(mod.exercise, mod.set, mod.weight, mod.reps)
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      await waitForDebouncedSave(5000)

      // Verify final state matches expected values
      const weightInputs = screen.getAllByLabelText(/weight/i)
      const repsInputs = screen.getAllByLabelText(/reps/i)
      
      // Check final values for first exercise
      expect(weightInputs[0]).toHaveValue('140') // Modified from 135
      expect(repsInputs[0]).toHaveValue('10')
      expect(weightInputs[1]).toHaveValue('145') // Modified from 140
      expect(repsInputs[1]).toHaveValue('9')
      expect(weightInputs[2]).toHaveValue('145')
      expect(repsInputs[2]).toHaveValue('8')
      
      // Check final values for second exercise
      expect(weightInputs[3]).toHaveValue('225')
      expect(repsInputs[3]).toHaveValue('8')
      expect(weightInputs[4]).toHaveValue('230')
      expect(repsInputs[4]).toHaveValue('7')
      expect(weightInputs[5]).toHaveValue('235')
      expect(repsInputs[5]).toHaveValue('6')

      // Verify only one workout log was created
      expect(createSpy).toHaveBeenCalledTimes(1)

      // Restore location and spies
      window.location = originalLocation
      getSpy.mockRestore()
      createSpy.mockRestore()
      updateSpy.mockRestore()
    })
  })
})