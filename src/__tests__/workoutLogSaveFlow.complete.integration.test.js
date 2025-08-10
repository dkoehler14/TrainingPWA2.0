/**
 * Complete Integration Tests for Workout Log Save Flow
 * 
 * Tests the complete end-to-end save flow with comprehensive coverage
 * of all requirements for duplicate prevention and caching functionality.
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
import { getUserPrograms, getProgramById } from '../services/programService'
import { getAvailableExercises } from '../services/exerciseService'

// Mock all external services
jest.mock('../services/workoutLogService')
jest.mock('../services/programService')
jest.mock('../services/exerciseService')
jest.mock('../hooks/useWorkoutRealtime', () => ({
  __esModule: true,
  default: () => ({
    isConnected: true,
    connectionStatus: 'connected',
    lastUpdate: null
  }),
  useWorkoutProgressBroadcast: () => ({
    broadcastProgress: jest.fn(),
    broadcastCompletion: jest.fn()
  })
}))

describe('Complete Workout Log Save Flow Integration Tests', () => {
  let mockUser
  let mockProgram
  let mockExercises
  let mockAuthContext
  let createWorkoutLogSpy
  let updateWorkoutLogSpy
  let getWorkoutLogSpy
  let validateWorkoutLogIdSpy

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock user and program data
    mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User'
    }

    mockExercises = [
      {
        id: 'exercise-1',
        name: 'Test Bench Press',
        primary_muscle_group: 'Chest',
        exercise_type: 'Barbell',
        instructions: 'Test instructions'
      },
      {
        id: 'exercise-2',
        name: 'Test Squat',
        primary_muscle_group: 'Legs',
        exercise_type: 'Barbell',
        instructions: 'Test instructions'
      }
    ]

    mockProgram = {
      id: 'test-program-id',
      name: 'Complete Test Program',
      user_id: mockUser.id,
      weekly_configs: [
        {
          week: 1,
          days: [
            {
              day: 1,
              name: 'Test Day 1',
              exercises: [
                {
                  exerciseId: mockExercises[0].id,
                  sets: 3,
                  reps: [10, 10, 10],
                  weights: [135, 135, 135]
                },
                {
                  exerciseId: mockExercises[1].id,
                  sets: 3,
                  reps: [8, 8, 8],
                  weights: [225, 225, 225]
                }
              ]
            }
          ]
        }
      ]
    }

    // Setup mock auth context
    mockAuthContext = {
      user: mockUser,
      loading: false,
      signIn: jest.fn(),
      signOut: jest.fn(),
      signUp: jest.fn()
    }

    // Setup service mocks
    getUserPrograms.mockResolvedValue([mockProgram])
    getProgramById.mockResolvedValue(mockProgram)
    getAvailableExercises.mockResolvedValue(mockExercises)

    // Setup workout log service spies
    createWorkoutLogSpy = jest.spyOn(workoutLogService, 'createWorkoutLog')
    updateWorkoutLogSpy = jest.spyOn(workoutLogService, 'updateWorkoutLog')
    getWorkoutLogSpy = jest.spyOn(workoutLogService, 'getWorkoutLog')
    validateWorkoutLogIdSpy = jest.spyOn(workoutLogService, 'validateWorkoutLogId')
  })

  afterEach(() => {
    // Restore all mocks
    jest.restoreAllMocks()
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

  describe('Requirement 1.1: Check for existing workout log ID before deciding to create or update', () => {
    test('should check cache first before querying database', async () => {
      const mockWorkoutLogId = 'test-workout-log-id'
      
      // Mock first save - no existing log, should create
      getWorkoutLogSpy.mockResolvedValueOnce(null)
      createWorkoutLogSpy.mockResolvedValueOnce({
        id: mockWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock subsequent saves - should use cached ID and update
      validateWorkoutLogIdSpy.mockResolvedValue(true)
      updateWorkoutLogSpy.mockResolvedValue({
        id: mockWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // First input - should check database and create
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      // Verify database was checked and workout log was created
      expect(getWorkoutLogSpy).toHaveBeenCalledWith(
        mockUser.id, mockProgram.id, 0, 0
      )
      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1)

      // Second input - should check cache first
      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      // Verify cache was checked and update was called
      expect(validateWorkoutLogIdSpy).toHaveBeenCalledWith(
        mockWorkoutLogId, mockUser.id, mockProgram.id, 0, 0
      )
      expect(updateWorkoutLogSpy).toHaveBeenCalledTimes(1)
      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1) // Still only 1

      // Restore location
      window.location = originalLocation
    })

    test('should fall back to database query when cache validation fails', async () => {
      const existingWorkoutLogId = 'existing-workout-log-id'
      
      // Mock cache validation failure
      validateWorkoutLogIdSpy.mockResolvedValueOnce(false)
      
      // Mock fallback database query
      getWorkoutLogSpy.mockResolvedValueOnce({
        id: existingWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      updateWorkoutLogSpy.mockResolvedValue({
        id: existingWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Should validate cache, fail, then query database
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      expect(validateWorkoutLogIdSpy).toHaveBeenCalled()
      expect(getWorkoutLogSpy).toHaveBeenCalled()
      expect(updateWorkoutLogSpy).toHaveBeenCalled()
      expect(createWorkoutLogSpy).not.toHaveBeenCalled()

      // Restore location
      window.location = originalLocation
    })
  })

  describe('Requirement 1.2: Update existing log instead of creating new one when ID found', () => {
    test('should update existing workout log when cached ID is valid', async () => {
      const existingWorkoutLogId = 'existing-workout-log-id'
      
      // Mock existing workout log
      getWorkoutLogSpy.mockResolvedValueOnce({
        id: existingWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0,
        is_finished: false,
        is_draft: true
      })

      // Mock validation and update
      validateWorkoutLogIdSpy.mockResolvedValue(true)
      updateWorkoutLogSpy.mockResolvedValue({
        id: existingWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // First input - should find existing log and update
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      expect(getWorkoutLogSpy).toHaveBeenCalled()
      expect(updateWorkoutLogSpy).toHaveBeenCalled()
      expect(createWorkoutLogSpy).not.toHaveBeenCalled()

      // Second input - should use cached ID and update
      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      expect(validateWorkoutLogIdSpy).toHaveBeenCalledWith(
        existingWorkoutLogId, mockUser.id, mockProgram.id, 0, 0
      )
      expect(updateWorkoutLogSpy).toHaveBeenCalledTimes(2)
      expect(createWorkoutLogSpy).not.toHaveBeenCalled()

      // Restore location
      window.location = originalLocation
    })

    test('should update same workout log across multiple exercises', async () => {
      const mockWorkoutLogId = 'test-workout-log-id'
      
      // Mock first save - no existing log, should create
      getWorkoutLogSpy.mockResolvedValueOnce(null)
      createWorkoutLogSpy.mockResolvedValueOnce({
        id: mockWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock subsequent saves - should use cached ID and update
      validateWorkoutLogIdSpy.mockResolvedValue(true)
      updateWorkoutLogSpy.mockResolvedValue({
        id: mockWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Log data for first exercise
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1)

      // Log data for second exercise - should update same log
      await simulateWorkoutInput(1, 0, '225', '8')
      await waitForDebouncedSave()

      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1) // Still only 1
      expect(updateWorkoutLogSpy).toHaveBeenCalled()

      // Modify first exercise again - should still update same log
      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1) // Still only 1
      expect(updateWorkoutLogSpy).toHaveBeenCalledTimes(2)

      // Restore location
      window.location = originalLocation
    })
  })

  describe('Requirement 1.3: Create new workout log and cache ID when none exists', () => {
    test('should create new workout log when none exists and cache the ID', async () => {
      const newWorkoutLogId = 'new-workout-log-id'
      
      // Mock no existing log
      getWorkoutLogSpy.mockResolvedValueOnce(null)
      createWorkoutLogSpy.mockResolvedValueOnce({
        id: newWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock subsequent operations using cached ID
      validateWorkoutLogIdSpy.mockResolvedValue(true)
      updateWorkoutLogSpy.mockResolvedValue({
        id: newWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // First input - should create new workout log
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      expect(getWorkoutLogSpy).toHaveBeenCalledWith(
        mockUser.id, mockProgram.id, 0, 0
      )
      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1)

      // Second input - should use cached ID for update
      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      expect(validateWorkoutLogIdSpy).toHaveBeenCalledWith(
        newWorkoutLogId, mockUser.id, mockProgram.id, 0, 0
      )
      expect(updateWorkoutLogSpy).toHaveBeenCalledTimes(1)
      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1) // Still only 1

      // Restore location
      window.location = originalLocation
    })

    test('should cache ID immediately after creation for subsequent operations', async () => {
      const newWorkoutLogId = 'new-workout-log-id'
      
      // Mock no existing log
      getWorkoutLogSpy.mockResolvedValueOnce(null)
      createWorkoutLogSpy.mockResolvedValueOnce({
        id: newWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock validation and update for cached ID
      validateWorkoutLogIdSpy.mockResolvedValue(true)
      updateWorkoutLogSpy.mockResolvedValue({
        id: newWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Create workout log
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1)

      // Clear mocks to verify caching behavior
      getWorkoutLogSpy.mockClear()
      
      // Subsequent operation should use cache, not query database
      await simulateWorkoutInput(0, 1, '140', '9')
      await waitForDebouncedSave()

      // Should validate cached ID, not query database
      expect(validateWorkoutLogIdSpy).toHaveBeenCalledWith(
        newWorkoutLogId, mockUser.id, mockProgram.id, 0, 0
      )
      expect(getWorkoutLogSpy).not.toHaveBeenCalled() // Cache hit
      expect(updateWorkoutLogSpy).toHaveBeenCalledTimes(1)

      // Restore location
      window.location = originalLocation
    })
  })

  describe('Complete save flow scenarios', () => {
    test('should handle rapid successive saves without creating duplicates', async () => {
      const mockWorkoutLogId = 'test-workout-log-id'
      
      // Mock first save - no existing log, should create
      getWorkoutLogSpy.mockResolvedValueOnce(null)
      createWorkoutLogSpy.mockResolvedValueOnce({
        id: mockWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock subsequent saves - should use cached ID and update
      validateWorkoutLogIdSpy.mockResolvedValue(true)
      updateWorkoutLogSpy.mockResolvedValue({
        id: mockWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

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

      // Should have created only one workout log despite rapid inputs
      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1)

      // Restore location
      window.location = originalLocation
    })

    test('should maintain single workout log across complex user interactions', async () => {
      const mockWorkoutLogId = 'test-workout-log-id'
      
      // Mock first save - no existing log, should create
      getWorkoutLogSpy.mockResolvedValueOnce(null)
      createWorkoutLogSpy.mockResolvedValueOnce({
        id: mockWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock subsequent saves - should use cached ID and update
      validateWorkoutLogIdSpy.mockResolvedValue(true)
      updateWorkoutLogSpy.mockResolvedValue({
        id: mockWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
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

      // Verify only one workout log was created
      expect(createWorkoutLogSpy).toHaveBeenCalledTimes(1)

      // Restore location
      window.location = originalLocation
    })

    test('should handle component re-mount without creating duplicates', async () => {
      const existingWorkoutLogId = 'existing-workout-log-id'
      
      // Mock existing workout log for both renders
      getWorkoutLogSpy.mockResolvedValue({
        id: existingWorkoutLogId,
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0,
        is_finished: false,
        is_draft: true,
        workout_log_exercises: [
          {
            exercise_id: mockExercises[0].id,
            sets: 3,
            reps: [10, 9, null],
            weights: [135, 140, null],
            completed: [true, true, false]
          }
        ]
      })

      validateWorkoutLogIdSpy.mockResolvedValue(true)
      updateWorkoutLogSpy.mockResolvedValue({
        id: existingWorkoutLogId
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      // First mount
      const { unmount } = renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Make a change
      await simulateWorkoutInput(0, 2, '150', '7')
      await waitForDebouncedSave()

      // Should have updated existing log
      expect(updateWorkoutLogSpy).toHaveBeenCalled()
      expect(createWorkoutLogSpy).not.toHaveBeenCalled()

      // Unmount component (simulate page refresh)
      unmount()

      // Re-render component (simulate page reload)
      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Make another change after remount
      await simulateWorkoutInput(1, 0, '225', '8')
      await waitForDebouncedSave()

      // Should still be updating same log, not creating new one
      expect(updateWorkoutLogSpy).toHaveBeenCalled()
      expect(createWorkoutLogSpy).not.toHaveBeenCalled()

      // Restore location
      window.location = originalLocation
    })
  })

  describe('Error handling and edge cases', () => {
    test('should handle service errors gracefully', async () => {
      // Mock service error
      getWorkoutLogSpy.mockRejectedValueOnce(new Error('Database connection failed'))
      createWorkoutLogSpy.mockResolvedValueOnce({
        id: 'new-workout-log-id',
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Should handle error and fall back to creating new workout
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      expect(getWorkoutLogSpy).toHaveBeenCalled()
      expect(createWorkoutLogSpy).toHaveBeenCalled()

      // Restore location
      window.location = originalLocation
    })

    test('should handle invalid cached IDs by falling back to database', async () => {
      // Mock validation failure for cached ID
      validateWorkoutLogIdSpy.mockResolvedValueOnce(false)
      
      // Mock fallback to database query
      getWorkoutLogSpy.mockResolvedValueOnce(null)
      createWorkoutLogSpy.mockResolvedValueOnce({
        id: 'new-workout-log-id',
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0
      })

      // Mock URL parameters
      const originalLocation = window.location
      delete window.location
      window.location = {
        ...originalLocation,
        search: `?programId=${mockProgram.id}&week=0&day=0`
      }

      renderLogWorkout()

      await waitFor(() => {
        expect(screen.getByText(/Test Day 1/i)).toBeInTheDocument()
      }, { timeout: 10000 })

      // Should handle invalid cache and create new workout
      await simulateWorkoutInput(0, 0, '135', '10')
      await waitForDebouncedSave()

      expect(getWorkoutLogSpy).toHaveBeenCalled()
      expect(createWorkoutLogSpy).toHaveBeenCalled()

      // Restore location
      window.location = originalLocation
    })
  })
})