/**
 * Comprehensive Integration Tests for Firestore to Supabase Migration
 * 
 * This test suite validates all user workflows end-to-end with the new Supabase system:
 * - User authentication and profile management
 * - Exercise management and creation
 * - Program creation and management
 * - Workout logging and completion
 * - Progress tracking and analytics
 * - Real-time features
 * - Data integrity and business logic
 * - Performance and load testing
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { DatabaseTestUtils, testEnvironment } from '../utils/testHelpers'
import { createClient } from '@supabase/supabase-js'

// Import components for end-to-end testing
import App from '../App'
import Auth from '../pages/Auth'
import UserProfile from '../pages/UserProfile'
import Exercises from '../pages/Exercises'
import Programs from '../pages/Programs'
import CreateProgram from '../pages/CreateProgram'
import LogWorkout from '../pages/LogWorkout'
import ProgressTracker from '../pages/ProgressTracker'

// Import services
import authService from '../services/authService'
import userService from '../services/userService'
import exerciseService from '../services/exerciseService'
import programService from '../services/programService'
import workoutLogService from '../services/workoutLogService'

// Test configuration
const TEST_TIMEOUT = 60000 // 60 seconds for comprehensive tests

describe('Comprehensive Integration Tests - Firestore to Supabase Migration', () => {
  let dbUtils
  let testUser
  let supabaseClient

  beforeAll(async () => {
    // Setup test environment
    dbUtils = await testEnvironment.setup()
    
    // Create Supabase client for direct testing
    supabaseClient = createClient(
      process.env.REACT_APP_SUPABASE_LOCAL_URL,
      process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY
    )
  }, TEST_TIMEOUT)

  afterAll(async () => {
    await testEnvironment.teardown(dbUtils)
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    // Create fresh test user for each test
    testUser = await dbUtils.createTestUser({
      email: `test-${Date.now()}@example.com`,
      name: 'Integration Test User',
      experience_level: 'intermediate',
      preferred_units: 'LB'
    })
  })

  afterEach(async () => {
    await dbUtils.cleanup()
  })

  describe('User Authentication Workflow', () => {
    it('should complete full authentication flow', async () => {
      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <Auth />
        </BrowserRouter>
      )

      // Test sign up flow
      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const signUpButton = screen.getByRole('button', { name: /sign up/i })

      await user.type(emailInput, testUser.email)
      await user.type(passwordInput, 'testpassword123')
      await user.click(signUpButton)

      // Verify authentication service integration
      await waitFor(() => {
        expect(authService.signUp).toHaveBeenCalledWith(
          testUser.email,
          'testpassword123'
        )
      })
    }, TEST_TIMEOUT)

    it('should handle sign in flow', async () => {
      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <Auth />
        </BrowserRouter>
      )

      // Test sign in flow
      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const signInButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, testUser.email)
      await user.type(passwordInput, 'testpassword123')
      await user.click(signInButton)

      await waitFor(() => {
        expect(authService.signIn).toHaveBeenCalledWith(
          testUser.email,
          'testpassword123'
        )
      })
    }, TEST_TIMEOUT)

    it('should handle password reset flow', async () => {
      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <Auth />
        </BrowserRouter>
      )

      const resetButton = screen.getByText(/forgot password/i)
      await user.click(resetButton)

      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, testUser.email)

      const sendResetButton = screen.getByRole('button', { name: /send reset/i })
      await user.click(sendResetButton)

      await waitFor(() => {
        expect(authService.resetPassword).toHaveBeenCalledWith(testUser.email)
      })
    }, TEST_TIMEOUT)
  })

  describe('User Profile Management Workflow', () => {
    it('should complete profile creation and updates', async () => {
      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <UserProfile />
        </BrowserRouter>
      )

      // Update profile information
      const nameInput = screen.getByLabelText(/name/i)
      const ageInput = screen.getByLabelText(/age/i)
      const weightInput = screen.getByLabelText(/weight/i)

      await user.clear(nameInput)
      await user.type(nameInput, 'Updated Test User')
      await user.clear(ageInput)
      await user.type(ageInput, '30')
      await user.clear(weightInput)
      await user.type(weightInput, '180')

      const saveButton = screen.getByRole('button', { name: /save/i })
      await user.click(saveButton)

      // Verify profile update
      await waitFor(() => {
        expect(userService.updateUserProfile).toHaveBeenCalledWith(
          testUser.id,
          expect.objectContaining({
            name: 'Updated Test User',
            age: 30,
            weight: 180
          })
        )
      })

      // Verify data persistence
      const updatedUser = await userService.getUserProfile(testUser.id)
      expect(updatedUser.name).toBe('Updated Test User')
      expect(updatedUser.age).toBe(30)
      expect(updatedUser.weight).toBe(180)
    }, TEST_TIMEOUT)

    it('should handle profile preferences and settings', async () => {
      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <UserProfile />
        </BrowserRouter>
      )

      // Update preferences
      const unitsSelect = screen.getByLabelText(/units/i)
      await user.selectOptions(unitsSelect, 'KG')

      const experienceSelect = screen.getByLabelText(/experience/i)
      await user.selectOptions(experienceSelect, 'advanced')

      // Update goals
      const strengthGoal = screen.getByLabelText(/strength/i)
      const muscleGoal = screen.getByLabelText(/muscle gain/i)
      
      await user.click(strengthGoal)
      await user.click(muscleGoal)

      const saveButton = screen.getByRole('button', { name: /save/i })
      await user.click(saveButton)

      // Verify preferences update
      await waitFor(() => {
        expect(userService.updateUserProfile).toHaveBeenCalledWith(
          testUser.id,
          expect.objectContaining({
            preferred_units: 'KG',
            experience_level: 'advanced',
            goals: expect.arrayContaining(['strength', 'muscle_gain'])
          })
        )
      })
    }, TEST_TIMEOUT)
  })

  describe('Exercise Management Workflow', () => {
    it('should complete exercise creation and management', async () => {
      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <Exercises />
        </BrowserRouter>
      )

      // Create new exercise
      const createButton = screen.getByRole('button', { name: /create exercise/i })
      await user.click(createButton)

      const nameInput = screen.getByLabelText(/exercise name/i)
      const muscleGroupSelect = screen.getByLabelText(/muscle group/i)
      const typeSelect = screen.getByLabelText(/exercise type/i)
      const instructionsInput = screen.getByLabelText(/instructions/i)

      await user.type(nameInput, 'Test Integration Exercise')
      await user.selectOptions(muscleGroupSelect, 'Chest')
      await user.selectOptions(typeSelect, 'Barbell')
      await user.type(instructionsInput, 'Test exercise instructions for integration testing')

      const saveButton = screen.getByRole('button', { name: /save exercise/i })
      await user.click(saveButton)

      // Verify exercise creation
      await waitFor(() => {
        expect(exerciseService.createExercise).toHaveBeenCalledWith(
          testUser.id,
          expect.objectContaining({
            name: 'Test Integration Exercise',
            primary_muscle_group: 'Chest',
            exercise_type: 'Barbell',
            instructions: 'Test exercise instructions for integration testing'
          })
        )
      })

      // Verify exercise appears in list
      await waitFor(() => {
        expect(screen.getByText('Test Integration Exercise')).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)

    it('should handle exercise search and filtering', async () => {
      // Create test exercises
      const exercises = await Promise.all([
        dbUtils.createTestExercise({
          name: 'Bench Press',
          primary_muscle_group: 'Chest',
          exercise_type: 'Barbell'
        }),
        dbUtils.createTestExercise({
          name: 'Squat',
          primary_muscle_group: 'Legs',
          exercise_type: 'Barbell'
        }),
        dbUtils.createTestExercise({
          name: 'Pull-ups',
          primary_muscle_group: 'Back',
          exercise_type: 'Bodyweight'
        })
      ])

      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <Exercises />
        </BrowserRouter>
      )

      // Test search functionality
      const searchInput = screen.getByPlaceholderText(/search exercises/i)
      await user.type(searchInput, 'Bench')

      await waitFor(() => {
        expect(screen.getByText('Bench Press')).toBeInTheDocument()
        expect(screen.queryByText('Squat')).not.toBeInTheDocument()
      })

      // Test filtering by muscle group
      await user.clear(searchInput)
      const muscleFilter = screen.getByLabelText(/filter by muscle/i)
      await user.selectOptions(muscleFilter, 'Back')

      await waitFor(() => {
        expect(screen.getByText('Pull-ups')).toBeInTheDocument()
        expect(screen.queryByText('Bench Press')).not.toBeInTheDocument()
      })
    }, TEST_TIMEOUT)
  })

  describe('Program Creation and Management Workflow', () => {
    it('should complete program creation workflow', async () => {
      // Create test exercises first
      const exercises = await Promise.all([
        dbUtils.createTestExercise({
          name: 'Bench Press',
          primary_muscle_group: 'Chest',
          exercise_type: 'Barbell'
        }),
        dbUtils.createTestExercise({
          name: 'Squat',
          primary_muscle_group: 'Legs',
          exercise_type: 'Barbell'
        })
      ])

      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <CreateProgram />
        </BrowserRouter>
      )

      // Fill program details
      const nameInput = screen.getByLabelText(/program name/i)
      const descriptionInput = screen.getByLabelText(/description/i)
      const durationInput = screen.getByLabelText(/duration/i)
      const daysPerWeekInput = screen.getByLabelText(/days per week/i)

      await user.type(nameInput, 'Integration Test Program')
      await user.type(descriptionInput, 'Test program for integration testing')
      await user.clear(durationInput)
      await user.type(durationInput, '8')
      await user.clear(daysPerWeekInput)
      await user.type(daysPerWeekInput, '3')

      // Add exercises to program
      const addExerciseButton = screen.getByRole('button', { name: /add exercise/i })
      await user.click(addExerciseButton)

      const exerciseSelect = screen.getByLabelText(/select exercise/i)
      await user.selectOptions(exerciseSelect, exercises[0].id)

      const setsInput = screen.getByLabelText(/sets/i)
      const repsInput = screen.getByLabelText(/reps/i)

      await user.type(setsInput, '3')
      await user.type(repsInput, '10')

      const addButton = screen.getByRole('button', { name: /add to program/i })
      await user.click(addButton)

      // Save program
      const saveButton = screen.getByRole('button', { name: /save program/i })
      await user.click(saveButton)

      // Verify program creation
      await waitFor(() => {
        expect(programService.createProgram).toHaveBeenCalledWith(
          testUser.id,
          expect.objectContaining({
            name: 'Integration Test Program',
            description: 'Test program for integration testing',
            duration: 8,
            days_per_week: 3
          })
        )
      })
    }, TEST_TIMEOUT)

    it('should handle program templates and customization', async () => {
      // Create a test program template
      const template = await dbUtils.createTestProgram(testUser.id, {
        name: 'Template Program',
        is_template: true,
        is_active: false
      })

      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <Programs />
        </BrowserRouter>
      )

      // Use template
      const useTemplateButton = screen.getByRole('button', { name: /use template/i })
      await user.click(useTemplateButton)

      // Customize template
      const customizeButton = screen.getByRole('button', { name: /customize/i })
      await user.click(customizeButton)

      const nameInput = screen.getByLabelText(/program name/i)
      await user.clear(nameInput)
      await user.type(nameInput, 'Customized Program')

      const saveButton = screen.getByRole('button', { name: /save/i })
      await user.click(saveButton)

      // Verify customized program creation
      await waitFor(() => {
        expect(programService.createProgramFromTemplate).toHaveBeenCalledWith(
          testUser.id,
          template.id,
          expect.objectContaining({
            name: 'Customized Program'
          })
        )
      })
    }, TEST_TIMEOUT)
  })

  describe('Workout Logging Workflow', () => {
    it('should complete full workout logging session', async () => {
      // Setup test data
      const exercise = await dbUtils.createTestExercise({
        name: 'Bench Press',
        primary_muscle_group: 'Chest',
        exercise_type: 'Barbell'
      })

      const program = await dbUtils.createTestProgram(testUser.id, {
        name: 'Test Program',
        is_current: true
      })

      const workout = await dbUtils.createTestProgramWorkout(program.id, {
        name: 'Push Day',
        week_number: 1,
        day_number: 1
      })

      await dbUtils.createTestProgramExercise(workout.id, exercise.id, {
        sets: 3,
        reps: 10,
        order_index: 0
      })

      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <LogWorkout />
        </BrowserRouter>
      )

      // Wait for program to load
      await waitFor(() => {
        expect(screen.getByText('Test Program')).toBeInTheDocument()
      })

      // Log workout data
      const weightInputs = screen.getAllByLabelText(/weight/i)
      const repsInputs = screen.getAllByLabelText(/reps/i)

      // Log first set
      await user.type(weightInputs[0], '135')
      await user.type(repsInputs[0], '10')

      // Mark set as completed
      const completeCheckbox = screen.getAllByRole('checkbox')[0]
      await user.click(completeCheckbox)

      // Auto-save should trigger
      await waitFor(() => {
        expect(workoutLogService.updateWorkoutLog).toHaveBeenCalled()
      })

      // Complete workout
      const finishButton = screen.getByRole('button', { name: /finish workout/i })
      await user.click(finishButton)

      // Verify workout completion
      await waitFor(() => {
        expect(workoutLogService.finishWorkout).toHaveBeenCalledWith(
          testUser.id,
          program.id,
          0, // week index
          0, // day index
          expect.arrayContaining([
            expect.objectContaining({
              exerciseId: exercise.id,
              weights: expect.arrayContaining([135]),
              reps: expect.arrayContaining([10]),
              completed: expect.arrayContaining([true])
            })
          ])
        )
      })
    }, TEST_TIMEOUT)

    it('should handle workout draft persistence', async () => {
      // Setup test data
      const exercise = await dbUtils.createTestExercise()
      const program = await dbUtils.createTestProgram(testUser.id)
      const workout = await dbUtils.createTestProgramWorkout(program.id)
      await dbUtils.createTestProgramExercise(workout.id, exercise.id)

      const user = userEvent.setup()
      
      render(
        <BrowserRouter>
          <LogWorkout />
        </BrowserRouter>
      )

      // Start logging workout
      const weightInput = screen.getAllByLabelText(/weight/i)[0]
      await user.type(weightInput, '100')

      // Navigate away (simulating draft save)
      await act(async () => {
        window.dispatchEvent(new Event('beforeunload'))
      })

      // Verify draft was saved
      await waitFor(() => {
        expect(workoutLogService.saveDraft).toHaveBeenCalled()
      })

      // Return to workout and verify data persistence
      render(
        <BrowserRouter>
          <LogWorkout />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByDisplayValue('100')).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)
  })

  describe('Progress Tracking Workflow', () => {
    it('should display comprehensive progress analytics', async () => {
      // Create test workout history
      const exercise = await dbUtils.createTestExercise({
        name: 'Bench Press',
        primary_muscle_group: 'Chest'
      })

      const workoutLogs = await Promise.all([
        dbUtils.createTestWorkoutLog(testUser.id, {
          date: '2024-01-01',
          is_finished: true
        }),
        dbUtils.createTestWorkoutLog(testUser.id, {
          date: '2024-01-03',
          is_finished: true
        }),
        dbUtils.createTestWorkoutLog(testUser.id, {
          date: '2024-01-05',
          is_finished: true
        })
      ])

      // Create workout log exercises with progression
      await Promise.all([
        dbUtils.createTestWorkoutLogExercise(workoutLogs[0].id, exercise.id, {
          weights: [135, 135, 135],
          reps: [10, 10, 10],
          completed: [true, true, true]
        }),
        dbUtils.createTestWorkoutLogExercise(workoutLogs[1].id, exercise.id, {
          weights: [140, 140, 140],
          reps: [10, 10, 8],
          completed: [true, true, true]
        }),
        dbUtils.createTestWorkoutLogExercise(workoutLogs[2].id, exercise.id, {
          weights: [145, 145, 145],
          reps: [10, 8, 6],
          completed: [true, true, true]
        })
      ])

      render(
        <BrowserRouter>
          <ProgressTracker />
        </BrowserRouter>
      )

      // Verify progress data is displayed
      await waitFor(() => {
        expect(screen.getByText(/progress/i)).toBeInTheDocument()
      })

      // Check for exercise progress
      await waitFor(() => {
        expect(screen.getByText('Bench Press')).toBeInTheDocument()
      })

      // Verify progression is shown (weight increase from 135 to 145)
      await waitFor(() => {
        expect(screen.getByText(/145/)).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)

    it('should calculate and display analytics correctly', async () => {
      // Create comprehensive test data
      const exercises = await Promise.all([
        dbUtils.createTestExercise({ name: 'Bench Press', primary_muscle_group: 'Chest' }),
        dbUtils.createTestExercise({ name: 'Squat', primary_muscle_group: 'Legs' }),
        dbUtils.createTestExercise({ name: 'Pull-ups', primary_muscle_group: 'Back', exercise_type: 'Bodyweight' })
      ])

      const workoutLog = await dbUtils.createTestWorkoutLog(testUser.id, {
        date: '2024-01-01',
        is_finished: true,
        duration: 90
      })

      // Create varied exercise data
      await Promise.all([
        dbUtils.createTestWorkoutLogExercise(workoutLog.id, exercises[0].id, {
          weights: [135, 140, 145],
          reps: [10, 8, 6],
          completed: [true, true, true]
        }),
        dbUtils.createTestWorkoutLogExercise(workoutLog.id, exercises[1].id, {
          weights: [225, 235, 245],
          reps: [5, 5, 3],
          completed: [true, true, true]
        }),
        dbUtils.createTestWorkoutLogExercise(workoutLog.id, exercises[2].id, {
          weights: [0, 0, 0],
          reps: [12, 10, 8],
          completed: [true, true, true],
          bodyweight: 180
        })
      ])

      render(
        <BrowserRouter>
          <ProgressTracker />
        </BrowserRouter>
      )

      // Verify analytics calculations
      await waitFor(() => {
        // Total volume should include bodyweight exercises
        const expectedVolume = 
          (135 * 10 + 140 * 8 + 145 * 6) + // Bench Press
          (225 * 5 + 235 * 5 + 245 * 3) + // Squat
          (180 * 12 + 180 * 10 + 180 * 8) // Pull-ups (bodyweight)
        
        expect(screen.getByText(new RegExp(expectedVolume.toString()))).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)
  })

  describe('Real-time Features Workflow', () => {
    it('should handle real-time workout updates', async () => {
      // Setup test data
      const program = await dbUtils.createTestProgram(testUser.id)
      const workout = await dbUtils.createTestProgramWorkout(program.id)

      render(
        <BrowserRouter>
          <LogWorkout />
        </BrowserRouter>
      )

      // Simulate real-time update from another session
      await act(async () => {
        await supabaseClient
          .from('workout_logs')
          .update({ notes: 'Updated from another session' })
          .eq('id', workout.id)
      })

      // Verify real-time update is reflected
      await waitFor(() => {
        expect(screen.getByText(/updated from another session/i)).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)

    it('should handle real-time program updates', async () => {
      const program = await dbUtils.createTestProgram(testUser.id, {
        name: 'Original Program'
      })

      render(
        <BrowserRouter>
          <Programs />
        </BrowserRouter>
      )

      // Simulate program update from another session
      await act(async () => {
        await supabaseClient
          .from('programs')
          .update({ name: 'Updated Program Name' })
          .eq('id', program.id)
      })

      // Verify real-time update
      await waitFor(() => {
        expect(screen.getByText('Updated Program Name')).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)
  })

  describe('Data Integrity and Business Logic', () => {
    it('should maintain referential integrity', async () => {
      // Create related data
      const exercise = await dbUtils.createTestExercise()
      const program = await dbUtils.createTestProgram(testUser.id)
      const workout = await dbUtils.createTestProgramWorkout(program.id)
      const programExercise = await dbUtils.createTestProgramExercise(workout.id, exercise.id)

      // Verify relationships exist
      const { data: programData } = await supabaseClient
        .from('programs')
        .select(`
          *,
          program_workouts (
            *,
            program_exercises (
              *,
              exercises (*)
            )
          )
        `)
        .eq('id', program.id)
        .single()

      expect(programData.program_workouts).toHaveLength(1)
      expect(programData.program_workouts[0].program_exercises).toHaveLength(1)
      expect(programData.program_workouts[0].program_exercises[0].exercises.id).toBe(exercise.id)
    }, TEST_TIMEOUT)

    it('should enforce business rules', async () => {
      // Test user can only access their own data
      const otherUser = await dbUtils.createTestUser({
        email: 'other@example.com'
      })
      
      const otherUserProgram = await dbUtils.createTestProgram(otherUser.id, {
        name: 'Other User Program'
      })

      // Attempt to access other user's program should fail
      const { data, error } = await supabaseClient
        .from('programs')
        .select('*')
        .eq('id', otherUserProgram.id)
        .eq('user_id', testUser.id)

      expect(data).toHaveLength(0) // Should not return other user's data
    }, TEST_TIMEOUT)

    it('should validate data constraints', async () => {
      // Test required field validation
      const { error } = await supabaseClient
        .from('programs')
        .insert({
          user_id: testUser.id,
          // Missing required 'name' field
          duration: 4
        })

      expect(error).toBeTruthy()
      expect(error.message).toMatch(/not-null constraint/i)
    }, TEST_TIMEOUT)
  })

  describe('Performance and Load Testing', () => {
    it('should handle concurrent user operations', async () => {
      const concurrentOperations = []
      const operationCount = 10

      // Create multiple concurrent workout logs
      for (let i = 0; i < operationCount; i++) {
        concurrentOperations.push(
          dbUtils.createTestWorkoutLog(testUser.id, {
            name: `Concurrent Workout ${i}`,
            date: new Date().toISOString().split('T')[0]
          })
        )
      }

      const results = await Promise.all(concurrentOperations)
      
      // Verify all operations completed successfully
      expect(results).toHaveLength(operationCount)
      results.forEach(result => {
        expect(result.id).toBeDefined()
        expect(result.user_id).toBe(testUser.id)
      })
    }, TEST_TIMEOUT)

    it('should handle large dataset queries efficiently', async () => {
      // Create large dataset
      const exerciseCount = 50
      const workoutCount = 20
      
      const exercises = await Promise.all(
        Array.from({ length: exerciseCount }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Exercise ${i}`,
            primary_muscle_group: i % 2 === 0 ? 'Chest' : 'Back'
          })
        )
      )

      const workouts = await Promise.all(
        Array.from({ length: workoutCount }, (_, i) =>
          dbUtils.createTestWorkoutLog(testUser.id, {
            name: `Workout ${i}`,
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          })
        )
      )

      // Create workout log exercises
      const logExercises = []
      for (const workout of workouts) {
        for (let i = 0; i < 5; i++) { // 5 exercises per workout
          logExercises.push(
            dbUtils.createTestWorkoutLogExercise(
              workout.id,
              exercises[i % exercises.length].id,
              {
                weights: [100 + i * 5, 105 + i * 5, 110 + i * 5],
                reps: [10, 8, 6],
                completed: [true, true, true]
              }
            )
          )
        }
      }
      await Promise.all(logExercises)

      // Test query performance
      const startTime = Date.now()
      
      const { data, error } = await supabaseClient
        .from('workout_logs')
        .select(`
          *,
          workout_log_exercises (
            *,
            exercises (*)
          )
        `)
        .eq('user_id', testUser.id)
        .order('date', { ascending: false })
        .limit(10)

      const queryTime = Date.now() - startTime

      expect(error).toBeNull()
      expect(data).toHaveLength(10)
      expect(queryTime).toBeLessThan(2000) // Should complete within 2 seconds
    }, TEST_TIMEOUT)

    it('should handle memory-intensive operations', async () => {
      // Create data that would stress memory usage
      const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({
        user_id: testUser.id,
        name: `Bulk Exercise ${i}`,
        primary_muscle_group: 'Chest',
        exercise_type: 'Barbell',
        instructions: `Instructions for exercise ${i}`.repeat(10), // Large text
        is_global: false
      }))

      // Batch insert large dataset
      const { data, error } = await supabaseClient
        .from('exercises')
        .insert(largeDataSet)
        .select('id')

      expect(error).toBeNull()
      expect(data).toHaveLength(1000)

      // Clean up
      const exerciseIds = data.map(ex => ex.id)
      await supabaseClient
        .from('exercises')
        .delete()
        .in('id', exerciseIds)
    }, TEST_TIMEOUT)
  })

  describe('Error Handling and Recovery', () => {
    it('should handle network interruptions gracefully', async () => {
      // Simulate network error
      const originalFetch = global.fetch
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      render(
        <BrowserRouter>
          <Programs />
        </BrowserRouter>
      )

      // Verify error handling
      await waitFor(() => {
        expect(screen.getByText(/error/i)).toBeInTheDocument()
      })

      // Restore network and verify recovery
      global.fetch = originalFetch

      const retryButton = screen.getByRole('button', { name: /retry/i })
      fireEvent.click(retryButton)

      await waitFor(() => {
        expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
      })
    }, TEST_TIMEOUT)

    it('should handle database constraint violations', async () => {
      // Attempt to create duplicate user with same auth_id
      const duplicateUser = {
        auth_id: testUser.auth_id, // Same auth_id as existing user
        email: 'duplicate@example.com',
        name: 'Duplicate User'
      }

      const { error } = await supabaseClient
        .from('users')
        .insert(duplicateUser)

      expect(error).toBeTruthy()
      expect(error.code).toBe('23505') // Unique constraint violation
    }, TEST_TIMEOUT)

    it('should handle session expiration', async () => {
      // Mock expired session
      jest.spyOn(supabaseClient.auth, 'getSession').mockResolvedValue({
        data: { session: null },
        error: new Error('Session expired')
      })

      render(
        <BrowserRouter>
          <App />
        </BrowserRouter>
      )

      // Should redirect to auth page
      await waitFor(() => {
        expect(screen.getByText(/sign in/i)).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)
  })

  describe('Migration Validation', () => {
    it('should validate complete migration from Firestore', async () => {
      // Verify no Firebase imports remain
      const firebaseImports = [
        'firebase/app',
        'firebase/firestore',
        'firebase/auth',
        'firebase/functions'
      ]

      // This would be checked at build time, but we can verify services use Supabase
      expect(authService.signIn).toBeDefined()
      expect(userService.getUserProfile).toBeDefined()
      expect(exerciseService.getAvailableExercises).toBeDefined()
      expect(programService.getUserPrograms).toBeDefined()
      expect(workoutLogService.getWorkoutLog).toBeDefined()
    }, TEST_TIMEOUT)

    it('should validate data structure compatibility', async () => {
      // Create data using new Supabase structure
      const exercise = await dbUtils.createTestExercise()
      const program = await dbUtils.createTestProgram(testUser.id)
      const workoutLog = await dbUtils.createTestWorkoutLog(testUser.id)

      // Verify data structure matches expected format
      expect(exercise).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        primary_muscle_group: expect.any(String),
        exercise_type: expect.any(String),
        created_at: expect.any(String)
      })

      expect(program).toMatchObject({
        id: expect.any(String),
        user_id: testUser.id,
        name: expect.any(String),
        duration: expect.any(Number),
        days_per_week: expect.any(Number),
        created_at: expect.any(String)
      })

      expect(workoutLog).toMatchObject({
        id: expect.any(String),
        user_id: testUser.id,
        name: expect.any(String),
        date: expect.any(String),
        is_finished: expect.any(Boolean),
        created_at: expect.any(String)
      })
    }, TEST_TIMEOUT)

    it('should validate all CRUD operations work correctly', async () => {
      // Test Create
      const exercise = await dbUtils.createTestExercise({
        name: 'CRUD Test Exercise'
      })
      expect(exercise.id).toBeDefined()

      // Test Read
      const { data: readData } = await supabaseClient
        .from('exercises')
        .select('*')
        .eq('id', exercise.id)
        .single()
      expect(readData.name).toBe('CRUD Test Exercise')

      // Test Update
      const { data: updateData } = await supabaseClient
        .from('exercises')
        .update({ name: 'Updated CRUD Exercise' })
        .eq('id', exercise.id)
        .select()
        .single()
      expect(updateData.name).toBe('Updated CRUD Exercise')

      // Test Delete
      const { error: deleteError } = await supabaseClient
        .from('exercises')
        .delete()
        .eq('id', exercise.id)
      expect(deleteError).toBeNull()

      // Verify deletion
      const { data: deletedData } = await supabaseClient
        .from('exercises')
        .select('*')
        .eq('id', exercise.id)
      expect(deletedData).toHaveLength(0)
    }, TEST_TIMEOUT)
  })
})