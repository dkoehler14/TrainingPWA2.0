/**
 * User Acceptance Testing Suite for Firestore to Supabase Migration
 * 
 * This test suite validates all features with realistic user scenarios,
 * authentication flows, data security, and performance requirements.
 * 
 * Requirements covered:
 * - 2.3: Authentication flows and user experience
 * - 5.1: Performance meets or exceeds current system
 * - 5.5: System handles load efficiently
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { DatabaseTestUtils, testEnvironment } from '../utils/testHelpers'
import { createClient } from '@supabase/supabase-js'

// Import components for user acceptance testing
import App from '../App'
import Auth from '../pages/Auth'
import UserProfile from '../pages/UserProfile'
import Exercises from '../pages/Exercises'
import Programs from '../pages/Programs'
import CreateProgram from '../pages/CreateProgram'
import LogWorkout from '../pages/LogWorkout'
import QuickWorkout from '../pages/QuickWorkout'
import QuickWorkoutHistory from '../pages/QuickWorkoutHistory'
import ProgressTracker from '../pages/ProgressTracker'
import Home from '../pages/Home'

// Import services for testing
import { authService } from '../services/authService'
import userService from '../services/userService'
import exerciseService from '../services/exerciseService'
import programService from '../services/programService'
import workoutLogService from '../services/workoutLogService'

// Import hooks
import { useSupabaseAuth } from '../hooks/useSupabaseAuth'

// Test configuration
const TEST_TIMEOUT = 120000 // 2 minutes for user acceptance tests
const PERFORMANCE_THRESHOLD = 2000 // 2 seconds max for operations

describe('User Acceptance Testing - Firestore to Supabase Migration', () => {
  let dbUtils
  let testUser
  let supabaseClient
  let performanceMetrics

  beforeAll(async () => {
    // Setup test environment
    dbUtils = await testEnvironment.setup()
    
    // Create Supabase client for direct testing
    supabaseClient = createClient(
      process.env.REACT_APP_SUPABASE_LOCAL_URL,
      process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY
    )

    // Initialize performance tracking
    performanceMetrics = {
      authOperations: [],
      dataOperations: [],
      uiOperations: []
    }
  }, TEST_TIMEOUT)

  afterAll(async () => {
    await testEnvironment.teardown(dbUtils)
    
    // Log performance summary
    console.log('Performance Metrics Summary:', {
      authOperations: performanceMetrics.authOperations.length,
      dataOperations: performanceMetrics.dataOperations.length,
      uiOperations: performanceMetrics.uiOperations.length,
      avgAuthTime: performanceMetrics.authOperations.reduce((sum, op) => sum + op.duration, 0) / performanceMetrics.authOperations.length || 0,
      avgDataTime: performanceMetrics.dataOperations.reduce((sum, op) => sum + op.duration, 0) / performanceMetrics.dataOperations.length || 0,
      avgUiTime: performanceMetrics.uiOperations.reduce((sum, op) => sum + op.duration, 0) / performanceMetrics.uiOperations.length || 0
    })
  }, TEST_TIMEOUT)

  beforeEach(async () => {
    // Create fresh test user for each test
    testUser = await dbUtils.createTestUser({
      email: `uat-${Date.now()}@example.com`,
      name: 'User Acceptance Test User',
      experience_level: 'intermediate',
      preferred_units: 'LB'
    })
  })

  afterEach(async () => {
    await dbUtils.cleanup()
  })

  // Helper function to track performance
  const trackPerformance = (category, operation, duration) => {
    performanceMetrics[category].push({
      operation,
      duration,
      timestamp: Date.now()
    })
    
    // Assert performance threshold
    expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD)
  }

  describe('User Story 1: New User Registration and Onboarding', () => {
    it('should allow a new user to register, verify email, and complete profile setup', async () => {
      const user = userEvent.setup()
      const startTime = Date.now()
      
      render(
        <BrowserRouter>
          <Auth />
        </BrowserRouter>
      )

      // Step 1: User navigates to sign up
      const signUpTab = screen.getByRole('tab', { name: /sign up/i })
      await user.click(signUpTab)

      // Step 2: User fills out registration form
      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const nameInput = screen.getByLabelText(/name/i)
      const signUpButton = screen.getByRole('button', { name: /sign up/i })

      const testEmail = `newuser-${Date.now()}@example.com`
      await user.type(emailInput, testEmail)
      await user.type(passwordInput, 'SecurePassword123!')
      await user.type(nameInput, 'New Test User')

      // Step 3: Submit registration
      await user.click(signUpButton)

      // Step 4: Verify confirmation message appears
      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      })

      const authTime = Date.now() - startTime
      trackPerformance('authOperations', 'user_registration', authTime)

      // Step 5: Simulate email verification (in real scenario, user would click email link)
      // For testing, we'll verify the user was created in the database
      const { data: users } = await supabaseClient
        .from('users')
        .select('*')
        .eq('email', testEmail)

      expect(users).toHaveLength(1)
      expect(users[0].name).toBe('New Test User')
    }, TEST_TIMEOUT)

    it('should guide user through profile completion after registration', async () => {
      const user = userEvent.setup()
      const startTime = Date.now()

      // Simulate authenticated user
      const mockUser = {
        id: 'test-auth-id',
        email: testUser.email,
        user_metadata: { name: testUser.name }
      }

      render(
        <BrowserRouter>
          <UserProfile />
        </BrowserRouter>
      )

      // Step 1: User sees profile completion form
      await waitFor(() => {
        expect(screen.getByText(/profile/i)).toBeInTheDocument()
      })

      // Step 2: User fills out additional profile information
      const ageInput = screen.getByLabelText(/age/i)
      const weightInput = screen.getByLabelText(/weight/i)
      const heightInput = screen.getByLabelText(/height/i)
      const experienceSelect = screen.getByLabelText(/experience/i)

      await user.type(ageInput, '28')
      await user.type(weightInput, '175')
      await user.type(heightInput, '70')
      await user.selectOptions(experienceSelect, 'intermediate')

      // Step 3: User selects goals
      const strengthGoal = screen.getByLabelText(/strength/i)
      const muscleGoal = screen.getByLabelText(/muscle/i)
      
      await user.click(strengthGoal)
      await user.click(muscleGoal)

      // Step 4: User selects available equipment
      const barbellEquipment = screen.getByLabelText(/barbell/i)
      const dumbbellEquipment = screen.getByLabelText(/dumbbell/i)
      
      await user.click(barbellEquipment)
      await user.click(dumbbellEquipment)

      // Step 5: Save profile
      const saveButton = screen.getByRole('button', { name: /save/i })
      await user.click(saveButton)

      // Step 6: Verify success message
      await waitFor(() => {
        expect(screen.getByText(/profile updated/i)).toBeInTheDocument()
      })

      const profileTime = Date.now() - startTime
      trackPerformance('dataOperations', 'profile_completion', profileTime)
    }, TEST_TIMEOUT)
  })

  describe('User Story 2: Returning User Login and Dashboard Access', () => {
    it('should allow returning user to login and access their dashboard', async () => {
      const user = userEvent.setup()
      const startTime = Date.now()

      render(
        <BrowserRouter>
          <Auth />
        </BrowserRouter>
      )

      // Step 1: User enters login credentials
      const emailInput = screen.getByLabelText(/email/i)
      const passwordInput = screen.getByLabelText(/password/i)
      const signInButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, testUser.email)
      await user.type(passwordInput, 'testpassword123')

      // Step 2: Submit login
      await user.click(signInButton)

      const authTime = Date.now() - startTime
      trackPerformance('authOperations', 'user_login', authTime)

      // Step 3: Verify redirect to dashboard/home
      await waitFor(() => {
        expect(window.location.pathname).toBe('/')
      })

      // Step 4: Render home page and verify user data loads
      const homeStartTime = Date.now()
      
      render(
        <BrowserRouter>
          <Home />
        </BrowserRouter>
      )

      // Step 5: Verify user's recent activity appears
      await waitFor(() => {
        expect(screen.getByText(/welcome/i)).toBeInTheDocument()
      })

      const homeLoadTime = Date.now() - homeStartTime
      trackPerformance('uiOperations', 'dashboard_load', homeLoadTime)
    }, TEST_TIMEOUT)

    it('should handle password reset flow for returning users', async () => {
      const user = userEvent.setup()
      const startTime = Date.now()

      render(
        <BrowserRouter>
          <Auth />
        </BrowserRouter>
      )

      // Step 1: User clicks forgot password
      const forgotPasswordLink = screen.getByText(/forgot password/i)
      await user.click(forgotPasswordLink)

      // Step 2: User enters email for reset
      const emailInput = screen.getByLabelText(/email/i)
      await user.type(emailInput, testUser.email)

      // Step 3: Submit reset request
      const resetButton = screen.getByRole('button', { name: /send reset/i })
      await user.click(resetButton)

      // Step 4: Verify confirmation message
      await waitFor(() => {
        expect(screen.getByText(/reset email sent/i)).toBeInTheDocument()
      })

      const resetTime = Date.now() - startTime
      trackPerformance('authOperations', 'password_reset', resetTime)
    }, TEST_TIMEOUT)
  })

  describe('User Story 3: Exercise Discovery and Management', () => {
    it('should allow user to browse, search, and create exercises', async () => {
      const user = userEvent.setup()
      
      // Create test exercises for browsing
      const exercises = await Promise.all([
        dbUtils.createTestExercise({
          name: 'Bench Press',
          primary_muscle_group: 'Chest',
          exercise_type: 'Barbell',
          is_global: true
        }),
        dbUtils.createTestExercise({
          name: 'Squat',
          primary_muscle_group: 'Legs',
          exercise_type: 'Barbell',
          is_global: true
        }),
        dbUtils.createTestExercise({
          name: 'Pull-ups',
          primary_muscle_group: 'Back',
          exercise_type: 'Bodyweight',
          is_global: true
        })
      ])

      const startTime = Date.now()

      render(
        <BrowserRouter>
          <Exercises />
        </BrowserRouter>
      )

      // Step 1: User sees exercise library
      await waitFor(() => {
        expect(screen.getByText('Bench Press')).toBeInTheDocument()
        expect(screen.getByText('Squat')).toBeInTheDocument()
        expect(screen.getByText('Pull-ups')).toBeInTheDocument()
      })

      const loadTime = Date.now() - startTime
      trackPerformance('uiOperations', 'exercise_library_load', loadTime)

      // Step 2: User searches for specific exercise
      const searchStartTime = Date.now()
      const searchInput = screen.getByPlaceholderText(/search exercises/i)
      await user.type(searchInput, 'Bench')

      await waitFor(() => {
        expect(screen.getByText('Bench Press')).toBeInTheDocument()
        expect(screen.queryByText('Squat')).not.toBeInTheDocument()
      })

      const searchTime = Date.now() - searchStartTime
      trackPerformance('uiOperations', 'exercise_search', searchTime)

      // Step 3: User filters by muscle group
      const filterStartTime = Date.now()
      await user.clear(searchInput)
      
      const muscleFilter = screen.getByLabelText(/muscle group/i)
      await user.selectOptions(muscleFilter, 'Back')

      await waitFor(() => {
        expect(screen.getByText('Pull-ups')).toBeInTheDocument()
        expect(screen.queryByText('Bench Press')).not.toBeInTheDocument()
      })

      const filterTime = Date.now() - filterStartTime
      trackPerformance('uiOperations', 'exercise_filter', filterTime)

      // Step 4: User creates custom exercise
      const createStartTime = Date.now()
      const createButton = screen.getByRole('button', { name: /create exercise/i })
      await user.click(createButton)

      const nameInput = screen.getByLabelText(/exercise name/i)
      const muscleGroupSelect = screen.getByLabelText(/muscle group/i)
      const typeSelect = screen.getByLabelText(/exercise type/i)
      const instructionsInput = screen.getByLabelText(/instructions/i)

      await user.type(nameInput, 'Custom User Exercise')
      await user.selectOptions(muscleGroupSelect, 'Shoulders')
      await user.selectOptions(typeSelect, 'Dumbbell')
      await user.type(instructionsInput, 'Custom exercise created by user for testing')

      const saveButton = screen.getByRole('button', { name: /save exercise/i })
      await user.click(saveButton)

      await waitFor(() => {
        expect(screen.getByText('Custom User Exercise')).toBeInTheDocument()
      })

      const createTime = Date.now() - createStartTime
      trackPerformance('dataOperations', 'exercise_creation', createTime)
    }, TEST_TIMEOUT)
  })

  describe('User Story 4: Program Creation and Management', () => {
    it('should allow user to create, customize, and manage workout programs', async () => {
      const user = userEvent.setup()
      
      // Create test exercises for program creation
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
          name: 'Deadlift',
          primary_muscle_group: 'Back',
          exercise_type: 'Barbell'
        })
      ])

      const startTime = Date.now()

      render(
        <BrowserRouter>
          <CreateProgram />
        </BrowserRouter>
      )

      // Step 1: User fills out program details
      const nameInput = screen.getByLabelText(/program name/i)
      const descriptionInput = screen.getByLabelText(/description/i)
      const durationInput = screen.getByLabelText(/duration/i)
      const daysPerWeekInput = screen.getByLabelText(/days per week/i)

      await user.type(nameInput, 'User Acceptance Test Program')
      await user.type(descriptionInput, 'A comprehensive program created during user acceptance testing')
      await user.clear(durationInput)
      await user.type(durationInput, '12')
      await user.clear(daysPerWeekInput)
      await user.type(daysPerWeekInput, '4')

      // Step 2: User adds exercises to program
      for (let day = 1; day <= 2; day++) {
        const addWorkoutButton = screen.getByRole('button', { name: new RegExp(`add.*day ${day}`, 'i') })
        await user.click(addWorkoutButton)

        const workoutNameInput = screen.getByLabelText(/workout name/i)
        await user.type(workoutNameInput, `Day ${day} Workout`)

        // Add exercises to this workout
        for (let i = 0; i < 2; i++) {
          const addExerciseButton = screen.getByRole('button', { name: /add exercise/i })
          await user.click(addExerciseButton)

          const exerciseSelect = screen.getByLabelText(/select exercise/i)
          await user.selectOptions(exerciseSelect, exercises[i].id)

          const setsInput = screen.getByLabelText(/sets/i)
          const repsInput = screen.getByLabelText(/reps/i)

          await user.type(setsInput, '3')
          await user.type(repsInput, '10')

          const addToWorkoutButton = screen.getByRole('button', { name: /add to workout/i })
          await user.click(addToWorkoutButton)
        }

        const saveWorkoutButton = screen.getByRole('button', { name: /save workout/i })
        await user.click(saveWorkoutButton)
      }

      // Step 3: Save complete program
      const saveProgramButton = screen.getByRole('button', { name: /save program/i })
      await user.click(saveProgramButton)

      await waitFor(() => {
        expect(screen.getByText(/program created/i)).toBeInTheDocument()
      })

      const programTime = Date.now() - startTime
      trackPerformance('dataOperations', 'program_creation', programTime)

      // Step 4: Verify program appears in user's program list
      render(
        <BrowserRouter>
          <Programs />
        </BrowserRouter>
      )

      await waitFor(() => {
        expect(screen.getByText('User Acceptance Test Program')).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)

    it('should allow user to start and manage an active program', async () => {
      const user = userEvent.setup()
      
      // Create a test program
      const program = await dbUtils.createTestProgram(testUser.id, {
        name: 'Active Test Program',
        description: 'Program for testing active program management',
        duration: 8,
        days_per_week: 3,
        is_active: false
      })

      const workout = await dbUtils.createTestProgramWorkout(program.id, {
        name: 'Test Workout',
        week_number: 1,
        day_number: 1
      })

      const exercise = await dbUtils.createTestExercise({
        name: 'Test Exercise',
        primary_muscle_group: 'Chest'
      })

      await dbUtils.createTestProgramExercise(workout.id, exercise.id, {
        sets: 3,
        reps: 10,
        order_index: 0
      })

      const startTime = Date.now()

      render(
        <BrowserRouter>
          <Programs />
        </BrowserRouter>
      )

      // Step 1: User sees their programs
      await waitFor(() => {
        expect(screen.getByText('Active Test Program')).toBeInTheDocument()
      })

      // Step 2: User activates the program
      const activateButton = screen.getByRole('button', { name: /start program/i })
      await user.click(activateButton)

      await waitFor(() => {
        expect(screen.getByText(/program activated/i)).toBeInTheDocument()
      })

      const activationTime = Date.now() - startTime
      trackPerformance('dataOperations', 'program_activation', activationTime)

      // Step 3: Verify program shows as current
      await waitFor(() => {
        expect(screen.getByText(/current program/i)).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)
  })

  describe('User Story 5: Workout Logging and Tracking', () => {
    it('should allow user to log a complete workout session', async () => {
      const user = userEvent.setup()
      
      // Setup test data
      const exercise = await dbUtils.createTestExercise({
        name: 'Bench Press',
        primary_muscle_group: 'Chest',
        exercise_type: 'Barbell'
      })

      const program = await dbUtils.createTestProgram(testUser.id, {
        name: 'Test Program',
        is_current: true,
        is_active: true
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

      const startTime = Date.now()

      render(
        <BrowserRouter>
          <LogWorkout />
        </BrowserRouter>
      )

      // Step 1: User sees their current workout
      await waitFor(() => {
        expect(screen.getByText('Test Program')).toBeInTheDocument()
        expect(screen.getByText('Push Day')).toBeInTheDocument()
        expect(screen.getByText('Bench Press')).toBeInTheDocument()
      })

      const loadTime = Date.now() - startTime
      trackPerformance('uiOperations', 'workout_load', loadTime)

      // Step 2: User logs workout data
      const logStartTime = Date.now()
      
      const weightInputs = screen.getAllByLabelText(/weight/i)
      const repsInputs = screen.getAllByLabelText(/reps/i)

      // Log all three sets
      for (let set = 0; set < 3; set++) {
        await user.type(weightInputs[set], `${135 + set * 5}`) // Progressive weight
        await user.type(repsInputs[set], `${10 - set}`) // Decreasing reps

        // Mark set as completed
        const completeCheckbox = screen.getAllByRole('checkbox')[set]
        await user.click(completeCheckbox)

        // Verify auto-save occurs
        await waitFor(() => {
          expect(screen.getByText(/saved/i)).toBeInTheDocument()
        }, { timeout: 3000 })
      }

      const logTime = Date.now() - logStartTime
      trackPerformance('dataOperations', 'workout_logging', logTime)

      // Step 3: User adds notes
      const notesInput = screen.getByLabelText(/notes/i)
      await user.type(notesInput, 'Great workout! Felt strong today.')

      // Step 4: User completes workout
      const finishStartTime = Date.now()
      const finishButton = screen.getByRole('button', { name: /finish workout/i })
      await user.click(finishButton)

      await waitFor(() => {
        expect(screen.getByText(/workout completed/i)).toBeInTheDocument()
      })

      const finishTime = Date.now() - finishStartTime
      trackPerformance('dataOperations', 'workout_completion', finishTime)

      // Step 5: Verify workout is saved in history
      const { data: workoutLogs } = await supabaseClient
        .from('workout_logs')
        .select('*')
        .eq('user_id', testUser.id)
        .eq('is_finished', true)

      expect(workoutLogs).toHaveLength(1)
      expect(workoutLogs[0].notes).toBe('Great workout! Felt strong today.')
    }, TEST_TIMEOUT)

    it('should allow user to create and log quick workouts', async () => {
      const user = userEvent.setup()
      
      // Create test exercises
      const exercises = await Promise.all([
        dbUtils.createTestExercise({
          name: 'Push-ups',
          primary_muscle_group: 'Chest',
          exercise_type: 'Bodyweight'
        }),
        dbUtils.createTestExercise({
          name: 'Squats',
          primary_muscle_group: 'Legs',
          exercise_type: 'Bodyweight'
        })
      ])

      const startTime = Date.now()

      render(
        <BrowserRouter>
          <QuickWorkout />
        </BrowserRouter>
      )

      // Step 1: User creates quick workout
      const workoutNameInput = screen.getByLabelText(/workout name/i)
      await user.type(workoutNameInput, 'Quick Bodyweight Session')

      // Step 2: User adds exercises
      for (const exercise of exercises) {
        const addExerciseButton = screen.getByRole('button', { name: /add exercise/i })
        await user.click(addExerciseButton)

        const exerciseSelect = screen.getByLabelText(/select exercise/i)
        await user.selectOptions(exerciseSelect, exercise.id)

        const setsInput = screen.getByLabelText(/sets/i)
        await user.type(setsInput, '3')

        const addButton = screen.getByRole('button', { name: /add to workout/i })
        await user.click(addButton)
      }

      // Step 3: User starts workout
      const startWorkoutButton = screen.getByRole('button', { name: /start workout/i })
      await user.click(startWorkoutButton)

      // Step 4: User logs exercise data
      const repsInputs = screen.getAllByLabelText(/reps/i)
      
      // Log push-ups
      await user.type(repsInputs[0], '20')
      await user.type(repsInputs[1], '18')
      await user.type(repsInputs[2], '15')

      // Log squats (assuming bodyweight exercises don't need weight)
      await user.type(repsInputs[3], '25')
      await user.type(repsInputs[4], '22')
      await user.type(repsInputs[5], '20')

      // Step 5: Complete workout
      const finishButton = screen.getByRole('button', { name: /finish workout/i })
      await user.click(finishButton)

      await waitFor(() => {
        expect(screen.getByText(/workout completed/i)).toBeInTheDocument()
      })

      const quickWorkoutTime = Date.now() - startTime
      trackPerformance('dataOperations', 'quick_workout_complete', quickWorkoutTime)
    }, TEST_TIMEOUT)
  })

  describe('User Story 6: Progress Tracking and Analytics', () => {
    it('should display comprehensive progress analytics and trends', async () => {
      const user = userEvent.setup()
      
      // Create historical workout data
      const exercise = await dbUtils.createTestExercise({
        name: 'Bench Press',
        primary_muscle_group: 'Chest'
      })

      const workoutDates = [
        '2024-01-01',
        '2024-01-03',
        '2024-01-05',
        '2024-01-08',
        '2024-01-10'
      ]

      const workoutLogs = []
      for (let i = 0; i < workoutDates.length; i++) {
        const workoutLog = await dbUtils.createTestWorkoutLog(testUser.id, {
          date: workoutDates[i],
          is_finished: true,
          duration: 60 + i * 5 // Progressive duration
        })

        await dbUtils.createTestWorkoutLogExercise(workoutLog.id, exercise.id, {
          weights: [135 + i * 5, 135 + i * 5, 135 + i * 5], // Progressive overload
          reps: [10, 10, 8],
          completed: [true, true, true]
        })

        workoutLogs.push(workoutLog)
      }

      const startTime = Date.now()

      render(
        <BrowserRouter>
          <ProgressTracker />
        </BrowserRouter>
      )

      // Step 1: User sees progress dashboard
      await waitFor(() => {
        expect(screen.getByText(/progress/i)).toBeInTheDocument()
      })

      const loadTime = Date.now() - startTime
      trackPerformance('uiOperations', 'progress_dashboard_load', loadTime)

      // Step 2: User views exercise progress
      await waitFor(() => {
        expect(screen.getByText('Bench Press')).toBeInTheDocument()
      })

      // Step 3: User sees progression data
      await waitFor(() => {
        // Should show progression from 135 to 155 lbs
        expect(screen.getByText(/155/)).toBeInTheDocument()
      })

      // Step 4: User views workout frequency
      await waitFor(() => {
        expect(screen.getByText(/5.*workouts/i)).toBeInTheDocument()
      })

      // Step 5: User checks total volume
      const expectedVolume = workoutLogs.reduce((total, _, index) => {
        const weight = 135 + index * 5
        return total + (weight * 10 * 2) + (weight * 8 * 1) // 2 sets of 10, 1 set of 8
      }, 0)

      await waitFor(() => {
        expect(screen.getByText(new RegExp(expectedVolume.toString()))).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)

    it('should show personal records and achievements', async () => {
      const user = userEvent.setup()
      
      // Create PR data
      const exercises = await Promise.all([
        dbUtils.createTestExercise({ name: 'Bench Press', primary_muscle_group: 'Chest' }),
        dbUtils.createTestExercise({ name: 'Squat', primary_muscle_group: 'Legs' }),
        dbUtils.createTestExercise({ name: 'Deadlift', primary_muscle_group: 'Back' })
      ])

      // Create workout logs with PR data
      for (const exercise of exercises) {
        const workoutLog = await dbUtils.createTestWorkoutLog(testUser.id, {
          date: '2024-01-15',
          is_finished: true
        })

        let prWeight
        switch (exercise.name) {
          case 'Bench Press':
            prWeight = 225
            break
          case 'Squat':
            prWeight = 315
            break
          case 'Deadlift':
            prWeight = 405
            break
          default:
            prWeight = 200
        }

        await dbUtils.createTestWorkoutLogExercise(workoutLog.id, exercise.id, {
          weights: [prWeight],
          reps: [1],
          completed: [true]
        })

        // Update analytics with PR
        await supabaseClient
          .from('user_analytics')
          .upsert({
            user_id: testUser.id,
            exercise_id: exercise.id,
            max_weight: prWeight,
            pr_date: '2024-01-15',
            total_volume: prWeight,
            total_reps: 1,
            total_sets: 1,
            last_workout_date: '2024-01-15'
          })
      }

      render(
        <BrowserRouter>
          <ProgressTracker />
        </BrowserRouter>
      )

      // Verify PRs are displayed
      await waitFor(() => {
        expect(screen.getByText(/225.*bench press/i)).toBeInTheDocument()
        expect(screen.getByText(/315.*squat/i)).toBeInTheDocument()
        expect(screen.getByText(/405.*deadlift/i)).toBeInTheDocument()
      })
    }, TEST_TIMEOUT)
  })

  describe('User Story 7: Data Security and Privacy', () => {
    it('should ensure user can only access their own data', async () => {
      // Create another user
      const otherUser = await dbUtils.createTestUser({
        email: 'other-user@example.com',
        name: 'Other User'
      })

      // Create data for other user
      const otherUserProgram = await dbUtils.createTestProgram(otherUser.id, {
        name: 'Other User Program'
      })

      const otherUserWorkout = await dbUtils.createTestWorkoutLog(otherUser.id, {
        name: 'Other User Workout'
      })

      // Test that current user cannot access other user's data
      const { data: programs } = await supabaseClient
        .from('programs')
        .select('*')
        .eq('user_id', testUser.id)

      const { data: workouts } = await supabaseClient
        .from('workout_logs')
        .select('*')
        .eq('user_id', testUser.id)

      // Should not contain other user's data
      expect(programs.find(p => p.id === otherUserProgram.id)).toBeUndefined()
      expect(workouts.find(w => w.id === otherUserWorkout.id)).toBeUndefined()

      // Verify RLS is working by attempting direct access
      const { data: unauthorizedPrograms } = await supabaseClient
        .from('programs')
        .select('*')
        .eq('id', otherUserProgram.id)

      expect(unauthorizedPrograms).toHaveLength(0)
    }, TEST_TIMEOUT)

    it('should handle authentication session security', async () => {
      const startTime = Date.now()

      // Test session validation
      const { data: { session } } = await supabaseClient.auth.getSession()
      
      if (session) {
        // Verify session has proper structure
        expect(session.access_token).toBeDefined()
        expect(session.refresh_token).toBeDefined()
        expect(session.expires_at).toBeDefined()
        expect(session.user).toBeDefined()

        // Verify session expiry is in the future
        const expiryTime = new Date(session.expires_at * 1000)
        const now = new Date()
        expect(expiryTime.getTime()).toBeGreaterThan(now.getTime())
      }

      const securityCheckTime = Date.now() - startTime
      trackPerformance('authOperations', 'security_validation', securityCheckTime)
    }, TEST_TIMEOUT)
  })

  describe('User Story 8: Performance and Responsiveness', () => {
    it('should handle large datasets efficiently', async () => {
      // Create large dataset
      const exerciseCount = 100
      const workoutCount = 50

      const startTime = Date.now()

      // Create exercises in batches
      const exercises = []
      for (let i = 0; i < exerciseCount; i += 10) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(10, exerciseCount - i) }, (_, j) =>
            dbUtils.createTestExercise({
              name: `Exercise ${i + j}`,
              primary_muscle_group: (i + j) % 2 === 0 ? 'Chest' : 'Back'
            })
          )
        )
        exercises.push(...batch)
      }

      // Create workout logs
      const workouts = []
      for (let i = 0; i < workoutCount; i += 10) {
        const batch = await Promise.all(
          Array.from({ length: Math.min(10, workoutCount - i) }, (_, j) =>
            dbUtils.createTestWorkoutLog(testUser.id, {
              name: `Workout ${i + j}`,
              date: new Date(Date.now() - (i + j) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            })
          )
        )
        workouts.push(...batch)
      }

      const dataCreationTime = Date.now() - startTime
      console.log(`Created ${exerciseCount} exercises and ${workoutCount} workouts in ${dataCreationTime}ms`)

      // Test query performance with large dataset
      const queryStartTime = Date.now()

      const { data: exerciseData, error: exerciseError } = await supabaseClient
        .from('exercises')
        .select('*')
        .limit(20)
        .order('created_at', { ascending: false })

      const { data: workoutData, error: workoutError } = await supabaseClient
        .from('workout_logs')
        .select('*')
        .eq('user_id', testUser.id)
        .limit(20)
        .order('date', { ascending: false })

      const queryTime = Date.now() - queryStartTime

      expect(exerciseError).toBeNull()
      expect(workoutError).toBeNull()
      expect(exerciseData).toHaveLength(20)
      expect(workoutData.length).toBeLessThanOrEqual(20)

      trackPerformance('dataOperations', 'large_dataset_query', queryTime)
    }, TEST_TIMEOUT)

    it('should handle concurrent operations without conflicts', async () => {
      const concurrentOperations = 20
      const startTime = Date.now()

      // Create concurrent workout logs
      const operations = Array.from({ length: concurrentOperations }, (_, i) =>
        dbUtils.createTestWorkoutLog(testUser.id, {
          name: `Concurrent Workout ${i}`,
          date: new Date().toISOString().split('T')[0]
        })
      )

      const results = await Promise.all(operations)
      const concurrentTime = Date.now() - startTime

      // Verify all operations completed successfully
      expect(results).toHaveLength(concurrentOperations)
      results.forEach((result, index) => {
        expect(result.id).toBeDefined()
        expect(result.name).toBe(`Concurrent Workout ${index}`)
        expect(result.user_id).toBe(testUser.id)
      })

      trackPerformance('dataOperations', 'concurrent_operations', concurrentTime)
    }, TEST_TIMEOUT)
  })

  describe('User Story 9: Real-time Features and Synchronization', () => {
    it('should handle real-time updates across sessions', async () => {
      const program = await dbUtils.createTestProgram(testUser.id, {
        name: 'Real-time Test Program'
      })

      const startTime = Date.now()

      // Set up real-time subscription
      let updateReceived = false
      const subscription = supabaseClient
        .channel('program_updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'programs',
            filter: `id=eq.${program.id}`
          },
          (payload) => {
            updateReceived = true
            expect(payload.new.name).toBe('Updated Program Name')
          }
        )
        .subscribe()

      // Wait for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Simulate update from another session
      await supabaseClient
        .from('programs')
        .update({ name: 'Updated Program Name' })
        .eq('id', program.id)

      // Wait for real-time update
      await waitFor(() => {
        expect(updateReceived).toBe(true)
      }, { timeout: 5000 })

      const realtimeTime = Date.now() - startTime
      trackPerformance('uiOperations', 'realtime_update', realtimeTime)

      // Cleanup subscription
      subscription.unsubscribe()
    }, TEST_TIMEOUT)
  })

  describe('Performance Summary and Validation', () => {
    it('should validate all performance metrics meet requirements', () => {
      // Validate authentication operations
      const authOperations = performanceMetrics.authOperations
      if (authOperations.length > 0) {
        const avgAuthTime = authOperations.reduce((sum, op) => sum + op.duration, 0) / authOperations.length
        expect(avgAuthTime).toBeLessThan(PERFORMANCE_THRESHOLD)
        console.log(`Average authentication time: ${avgAuthTime.toFixed(2)}ms`)
      }

      // Validate data operations
      const dataOperations = performanceMetrics.dataOperations
      if (dataOperations.length > 0) {
        const avgDataTime = dataOperations.reduce((sum, op) => sum + op.duration, 0) / dataOperations.length
        expect(avgDataTime).toBeLessThan(PERFORMANCE_THRESHOLD)
        console.log(`Average data operation time: ${avgDataTime.toFixed(2)}ms`)
      }

      // Validate UI operations
      const uiOperations = performanceMetrics.uiOperations
      if (uiOperations.length > 0) {
        const avgUiTime = uiOperations.reduce((sum, op) => sum + op.duration, 0) / uiOperations.length
        expect(avgUiTime).toBeLessThan(PERFORMANCE_THRESHOLD)
        console.log(`Average UI operation time: ${avgUiTime.toFixed(2)}ms`)
      }

      // Overall performance validation
      const allOperations = [...authOperations, ...dataOperations, ...uiOperations]
      const overallAvg = allOperations.reduce((sum, op) => sum + op.duration, 0) / allOperations.length
      
      console.log('Performance Summary:', {
        totalOperations: allOperations.length,
        overallAverage: `${overallAvg.toFixed(2)}ms`,
        authOperations: authOperations.length,
        dataOperations: dataOperations.length,
        uiOperations: uiOperations.length,
        performanceThreshold: `${PERFORMANCE_THRESHOLD}ms`
      })

      expect(overallAvg).toBeLessThan(PERFORMANCE_THRESHOLD)
    })
  })
})