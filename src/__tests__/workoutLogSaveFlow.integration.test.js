/**
 * Integration Tests for Workout Log Save Flow
 * 
 * Tests the complete end-to-end save flow with caching enabled to ensure
 * duplicate prevention works correctly with real workout log service.
 * 
 * Test Coverage:
 * - End-to-end save flow with caching enabled
 * - Duplicate prevention across multiple save operations
 * - Cache behavior with real workout log service
 * - Verification that no duplicate workout logs are created
 * 
 * Requirements Coverage:
 * - 1.1: Check for existing workout log ID before deciding to create or update
 * - 1.2: Update existing log instead of creating new one when ID found
 * - 1.3: Create new workout log and cache ID when none exists
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import LogWorkout from '../pages/LogWorkout'
import { AuthContext } from '../context/AuthContext'
import workoutLogService from '../services/workoutLogService'
import { testDataGenerators, createTestSupabaseClient, createTestAdminClient } from '../utils/testHelpers'
import { testConfig, skipIfSupabaseUnavailable } from '../setupSupabaseTests'

// Skip tests if Supabase is not available
skipIfSupabaseUnavailable()

describe('Workout Log Save Flow Integration Tests', () => {
  let testUser
  let testProgram
  let testExercises
  let supabaseClient
  let adminClient
  let createdWorkoutLogIds
  let mockAuthContext

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

  describe('End-to-end save flow with caching enabled', () => {
    test('should create single workout log on first save and update it on subsequent saves', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock URL parameters to select the test program and workout
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      // Wait for component to load and program to be selected
      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Simulate first workout input
      await simulateWorkoutInput(0, 0, '135', '10')
      
      // Wait for debounced save to complete
      await waitForDebouncedSave()

      // Check database - should have exactly 1 workout log
      let workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      
      const firstLogId = workoutLogs[0].id
      createdWorkoutLogIds.push(firstLogId)

      // Simulate second workout input (should update existing log)
      await simulateWorkoutInput(0, 1, '140', '9')
      
      // Wait for debounced save to complete
      await waitForDebouncedSave()

      // Check database - should still have exactly 1 workout log with same ID
      workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      expect(workoutLogs[0].id).toBe(firstLogId)

      // Simulate third workout input (should still update same log)
      await simulateWorkoutInput(1, 0, '225', '8')
      
      // Wait for debounced save to complete
      await waitForDebouncedSave()

      // Check database - should still have exactly 1 workout log with same ID
      workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      expect(workoutLogs[0].id).toBe(firstLogId)

      // Verify the workout log has been updated with latest data
      const { data: workoutLogExercises } = await adminClient
        .from('workout_log_exercises')
        .select('*')
        .eq('workout_log_id', firstLogId)
        .order('exercise_order')

      expect(workoutLogExercises).toHaveLength(2) // Two exercises
      
      // Restore original location
      window.location = originalLocation
    })

    test('should handle rapid successive saves without creating duplicates', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

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

      // Simulate rapid successive inputs (faster than debounce delay)
      await act(async () => {
        await simulateWorkoutInput(0, 0, '135', '10')
        await new Promise(resolve => setTimeout(resolve, 100))
        await simulateWorkoutInput(0, 1, '140', '9')
        await new Promise(resolve => setTimeout(resolve, 100))
        await simulateWorkoutInput(0, 2, '145', '8')
        await new Promise(resolve => setTimeout(resolve, 100))
        await simulateWorkoutInput(1, 0, '225', '8')
      })

      // Wait for all debounced saves to complete
      await waitForDebouncedSave(5000)

      // Check database - should have exactly 1 workout log despite rapid inputs
      const workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      
      createdWorkoutLogIds.push(workoutLogs[0].id)

      // Restore original location
      window.location = originalLocation
    })

    test('should use cached workout log ID for immediate updates', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Pre-create a workout log to test cache behavior
      const existingWorkoutLog = {
        user_id: testUser.id,
        program_id: testProgram.id,
        week_index: 0,
        day_index: 0,
        name: 'Pre-existing Workout',
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

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      // Wait for component to load and existing workout to be loaded
      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Simulate workout input (should update existing log)
      await simulateWorkoutInput(0, 0, '135', '10')
      
      // Wait for debounced save
      await waitForDebouncedSave()

      // Check database - should still have exactly 1 workout log with same ID
      const workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      expect(workoutLogs[0].id).toBe(preCreatedLog.id)

      // Restore original location
      window.location = originalLocation
    })
  })

  describe('Duplicate prevention across multiple save operations', () => {
    test('should prevent duplicates when switching between exercises', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

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

      // Log data for first exercise
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Check database after first exercise
      let workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      const logId = workoutLogs[0].id
      createdWorkoutLogIds.push(logId)

      // Log data for second exercise
      await simulateWorkoutInput(1, 0, '225', '8')
      await waitForDebouncedSave()

      // Check database after second exercise - should still be same log
      workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      expect(workoutLogs[0].id).toBe(logId)

      // Go back to first exercise and modify
      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      // Check database - should still be same log
      workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      expect(workoutLogs[0].id).toBe(logId)

      // Restore original location
      window.location = originalLocation
    })

    test('should handle page refresh without creating duplicates', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${testProgram.id}&week=0&day=0`
      }

      // First render - create initial workout log
      const { unmount } = renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Check initial workout log creation
      let workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      const originalLogId = workoutLogs[0].id
      createdWorkoutLogIds.push(originalLogId)

      // Unmount component (simulate page refresh)
      unmount()

      // Re-render component (simulate page reload)
      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Make additional changes
      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      // Check that no duplicate was created
      workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      expect(workoutLogs[0].id).toBe(originalLogId)

      // Restore original location
      window.location = originalLocation
    })
  })

  describe('Cache behavior with real workout log service', () => {
    test('should cache workout log ID after creation and use it for updates', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Spy on workoutLogService methods to verify caching behavior
      const createSpy = jest.spyOn(workoutLogService, 'createWorkoutLog')
      const updateSpy = jest.spyOn(workoutLogService, 'updateWorkoutLog')
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')

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

      // First input - should trigger create
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify create was called
      expect(createSpy).toHaveBeenCalledTimes(1)
      expect(getSpy).toHaveBeenCalled()

      // Get the created workout log ID
      const workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      createdWorkoutLogIds.push(workoutLogs[0].id)

      // Reset spies
      createSpy.mockClear()
      updateSpy.mockClear()
      getSpy.mockClear()

      // Second input - should trigger update using cached ID
      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      // Verify update was called and create was not called
      expect(updateSpy).toHaveBeenCalledTimes(1)
      expect(createSpy).not.toHaveBeenCalled()
      // getWorkoutLog should not be called if cache is working properly
      expect(getSpy).not.toHaveBeenCalled()

      // Restore spies and location
      createSpy.mockRestore()
      updateSpy.mockRestore()
      getSpy.mockRestore()
      window.location = originalLocation
    })

    test('should fall back to database query when cache is invalid', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Spy on validation method to simulate cache invalidation
      const validateSpy = jest.spyOn(workoutLogService, 'validateWorkoutLogId')
      const getSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')

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

      const { data: preCreatedLog } = await adminClient
        .from('workout_logs')
        .insert(existingWorkoutLog)
        .select()
        .single()

      createdWorkoutLogIds.push(preCreatedLog.id)

      // Mock validation to return false (simulate invalid cache)
      validateSpy.mockResolvedValue(false)
      getSpy.mockResolvedValue(preCreatedLog)

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

      // Simulate input - should fall back to database query
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify fallback behavior
      expect(validateSpy).toHaveBeenCalled()
      expect(getSpy).toHaveBeenCalled()

      // Should still have only 1 workout log
      const workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)

      // Restore spies and location
      validateSpy.mockRestore()
      getSpy.mockRestore()
      window.location = originalLocation
    })
  })

  describe('Verification that no duplicate workout logs are created', () => {
    test('should maintain single workout log across complex user interactions', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

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

      // Complex sequence of user interactions
      const interactions = [
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

      // Execute all interactions with delays
      for (const interaction of interactions) {
        await simulateWorkoutInput(
          interaction.exercise,
          interaction.set,
          interaction.weight,
          interaction.reps
        )
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      // Wait for all saves to complete
      await waitForDebouncedSave(5000)

      // Verify only one workout log exists
      const workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      createdWorkoutLogIds.push(workoutLogs[0].id)

      // Verify the workout log contains all the exercise data
      const { data: exercises } = await adminClient
        .from('workout_log_exercises')
        .select('*')
        .eq('workout_log_id', workoutLogs[0].id)
        .order('exercise_order')

      expect(exercises).toHaveLength(2) // Two exercises
      
      // Verify exercise data integrity
      const firstExercise = exercises.find(e => e.exercise_id === testExercises[0].id)
      const secondExercise = exercises.find(e => e.exercise_id === testExercises[1].id)
      
      expect(firstExercise).toBeDefined()
      expect(secondExercise).toBeDefined()
      expect(firstExercise.sets).toBe(3)
      expect(secondExercise.sets).toBe(3)

      // Restore original location
      window.location = originalLocation
    })

    test('should handle concurrent save operations without duplicates', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

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

      // Simulate concurrent operations by triggering multiple rapid changes
      await act(async () => {
        const promises = []
        
        // Create multiple concurrent input changes
        for (let i = 0; i < 5; i++) {
          promises.push(
            simulateWorkoutInput(0, 0, `${135 + i}`, '10')
          )
        }
        
        await Promise.all(promises)
      })

      // Wait for all debounced saves to settle
      await waitForDebouncedSave(5000)

      // Verify only one workout log was created
      const workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      createdWorkoutLogIds.push(workoutLogs[0].id)

      // Restore original location
      window.location = originalLocation
    })

    test('should prevent duplicates when component re-mounts with existing data', async () => {
      if (!testConfig.isIntegrationTest || !adminClient) {
        console.log('⏭️  Skipping integration test')
        return
      }

      // Pre-create workout log with exercise data
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

      const { data: preCreatedLog } = await adminClient
        .from('workout_logs')
        .insert(existingWorkoutLog)
        .select()
        .single()

      createdWorkoutLogIds.push(preCreatedLog.id)

      // Add exercise data to the pre-created log
      const exerciseData = [
        {
          workout_log_id: preCreatedLog.id,
          exercise_id: testExercises[0].id,
          exercise_order: 0,
          sets: 3,
          reps: [10, 9, 8],
          weights: [135, 140, 145],
          completed: [true, true, false]
        }
      ]

      await adminClient
        .from('workout_log_exercises')
        .insert(exerciseData)

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

      // Make a change
      await simulateWorkoutInput(0, 2, '150', '7')
      await waitForDebouncedSave()

      // Unmount and remount
      unmount()
      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Make another change after remount
      await simulateWorkoutInput(1, 0, '225', '8')
      await waitForDebouncedSave()

      // Verify still only one workout log
      const workoutLogs = await getWorkoutLogsFromDatabase(testUser.id, testProgram.id, 0, 0)
      expect(workoutLogs).toHaveLength(1)
      expect(workoutLogs[0].id).toBe(preCreatedLog.id)

      // Restore original location
      window.location = originalLocation
    })
  })
})