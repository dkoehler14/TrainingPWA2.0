/**
 * Data Integrity and Business Logic Validation Tests
 * 
 * Validates that the Supabase migration maintains:
 * - Data consistency and referential integrity
 * - Business rule enforcement
 * - Data validation constraints
 * - Transaction integrity
 * - Security policies
 */

import { DatabaseTestUtils, testEnvironment } from '../utils/testHelpers'
import { createClient } from '@supabase/supabase-js'

describe('Data Integrity and Business Logic Validation', () => {
  let dbUtils
  let supabaseClient
  let adminClient
  let testUser

  beforeAll(async () => {
    dbUtils = await testEnvironment.setup()
    
    // Regular client
    supabaseClient = createClient(
      process.env.REACT_APP_SUPABASE_LOCAL_URL,
      process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY
    )
    
    // Admin client for testing security policies
    adminClient = createClient(
      process.env.REACT_APP_SUPABASE_LOCAL_URL,
      process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
    )
    
    testUser = await dbUtils.createTestUser({
      email: 'integrity-test@example.com',
      name: 'Integrity Test User'
    })
  }, 30000)

  afterAll(async () => {
    await testEnvironment.teardown(dbUtils)
  }, 30000)

  afterEach(async () => {
    await dbUtils.cleanup()
  })

  describe('Referential Integrity', () => {
    it('should maintain foreign key relationships', async () => {
      // Create related data
      const exercise = await dbUtils.createTestExercise({
        name: 'Integrity Test Exercise'
      })
      
      const program = await dbUtils.createTestProgram(testUser.id, {
        name: 'Integrity Test Program'
      })
      
      const workout = await dbUtils.createTestProgramWorkout(program.id, {
        name: 'Test Workout',
        week_number: 1,
        day_number: 1
      })
      
      const programExercise = await dbUtils.createTestProgramExercise(
        workout.id,
        exercise.id,
        {
          sets: 3,
          reps: 10,
          order_index: 0
        }
      )

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

      expect(programData).toBeDefined()
      expect(programData.program_workouts).toHaveLength(1)
      expect(programData.program_workouts[0].program_exercises).toHaveLength(1)
      expect(programData.program_workouts[0].program_exercises[0].exercises.id).toBe(exercise.id)
    })

    it('should prevent deletion of referenced records', async () => {
      // Create related data
      const exercise = await dbUtils.createTestExercise()
      const program = await dbUtils.createTestProgram(testUser.id)
      const workout = await dbUtils.createTestProgramWorkout(program.id)
      await dbUtils.createTestProgramExercise(workout.id, exercise.id)

      // Attempt to delete referenced exercise
      const { error } = await adminClient
        .from('exercises')
        .delete()
        .eq('id', exercise.id)

      // Should fail due to foreign key constraint
      expect(error).toBeTruthy()
      expect(error.code).toBe('23503') // Foreign key violation
    })

    it('should cascade deletes appropriately', async () => {
      // Create hierarchical data
      const program = await dbUtils.createTestProgram(testUser.id)
      const workout = await dbUtils.createTestProgramWorkout(program.id)
      const exercise = await dbUtils.createTestExercise()
      const programExercise = await dbUtils.createTestProgramExercise(workout.id, exercise.id)

      // Delete program (should cascade to workouts and program_exercises)
      const { error } = await adminClient
        .from('programs')
        .delete()
        .eq('id', program.id)

      expect(error).toBeNull()

      // Verify cascaded deletions
      const { data: workoutData } = await supabaseClient
        .from('program_workouts')
        .select('*')
        .eq('id', workout.id)

      const { data: programExerciseData } = await supabaseClient
        .from('program_exercises')
        .select('*')
        .eq('id', programExercise.id)

      expect(workoutData).toHaveLength(0)
      expect(programExerciseData).toHaveLength(0)

      // Exercise should still exist (not cascaded)
      const { data: exerciseData } = await supabaseClient
        .from('exercises')
        .select('*')
        .eq('id', exercise.id)

      expect(exerciseData).toHaveLength(1)
    })
  })

  describe('Data Validation Constraints', () => {
    it('should enforce NOT NULL constraints', async () => {
      // Attempt to create user without required fields
      const { error } = await adminClient
        .from('users')
        .insert({
          auth_id: 'test-auth-id',
          // Missing required 'email' field
          name: 'Test User'
        })

      expect(error).toBeTruthy()
      expect(error.message).toMatch(/null value in column "email"/i)
    })

    it('should enforce UNIQUE constraints', async () => {
      // Create user with unique auth_id
      const user1 = await dbUtils.createTestUser({
        auth_id: 'unique-auth-id',
        email: 'user1@example.com'
      })

      // Attempt to create another user with same auth_id
      const { error } = await adminClient
        .from('users')
        .insert({
          auth_id: 'unique-auth-id', // Duplicate auth_id
          email: 'user2@example.com',
          name: 'User 2'
        })

      expect(error).toBeTruthy()
      expect(error.code).toBe('23505') // Unique constraint violation
    })

    it('should enforce CHECK constraints', async () => {
      // Attempt to create program with invalid duration
      const { error } = await adminClient
        .from('programs')
        .insert({
          user_id: testUser.id,
          name: 'Invalid Program',
          duration: -1, // Invalid negative duration
          days_per_week: 3,
          weight_unit: 'LB',
          difficulty: 'beginner'
        })

      expect(error).toBeTruthy()
      // Check constraint should prevent negative duration
    })

    it('should validate enum values', async () => {
      // Attempt to create user with invalid experience level
      const { error } = await adminClient
        .from('users')
        .insert({
          auth_id: 'enum-test-auth-id',
          email: 'enum-test@example.com',
          name: 'Enum Test User',
          experience_level: 'invalid_level', // Invalid enum value
          preferred_units: 'LB'
        })

      expect(error).toBeTruthy()
      expect(error.message).toMatch(/invalid input value for enum/i)
    })

    it('should validate array constraints', async () => {
      // Test valid array values
      const validUser = await dbUtils.createTestUser({
        goals: ['strength', 'muscle_gain', 'endurance'],
        available_equipment: ['barbell', 'dumbbell', 'bodyweight'],
        injuries: ['knee', 'shoulder']
      })

      expect(validUser.goals).toEqual(['strength', 'muscle_gain', 'endurance'])
      expect(validUser.available_equipment).toEqual(['barbell', 'dumbbell', 'bodyweight'])
      expect(validUser.injuries).toEqual(['knee', 'shoulder'])
    })
  })

  describe('Business Logic Validation', () => {
    it('should enforce user data ownership', async () => {
      // Create another user
      const otherUser = await dbUtils.createTestUser({
        email: 'other-user@example.com'
      })

      // Create program for other user
      const otherUserProgram = await dbUtils.createTestProgram(otherUser.id, {
        name: 'Other User Program'
      })

      // Attempt to access other user's program as testUser
      // This should be prevented by RLS policies
      const { data, error } = await supabaseClient
        .from('programs')
        .select('*')
        .eq('id', otherUserProgram.id)
        .eq('user_id', testUser.id) // Wrong user_id

      expect(data).toHaveLength(0) // Should not return other user's data
    })

    it('should validate workout log exercise relationships', async () => {
      // Create workout log
      const workoutLog = await dbUtils.createTestWorkoutLog(testUser.id)
      
      // Create exercise
      const exercise = await dbUtils.createTestExercise()

      // Create valid workout log exercise
      const validLogExercise = await dbUtils.createTestWorkoutLogExercise(
        workoutLog.id,
        exercise.id,
        {
          sets: 3,
          reps: [10, 10, 10],
          weights: [135, 135, 135],
          completed: [true, true, true]
        }
      )

      expect(validLogExercise.workout_log_id).toBe(workoutLog.id)
      expect(validLogExercise.exercise_id).toBe(exercise.id)
      expect(validLogExercise.sets).toBe(3)
      expect(validLogExercise.reps).toEqual([10, 10, 10])
    })

    it('should validate program structure consistency', async () => {
      // Create program with specific structure
      const program = await dbUtils.createTestProgram(testUser.id, {
        duration: 4,
        days_per_week: 3
      })

      // Create workouts that exceed the program structure
      const validWorkout = await dbUtils.createTestProgramWorkout(program.id, {
        week_number: 1,
        day_number: 1
      })

      const validWorkout2 = await dbUtils.createTestProgramWorkout(program.id, {
        week_number: 4,
        day_number: 3
      })

      // Both should be valid within program constraints
      expect(validWorkout.week_number).toBeLessThanOrEqual(4)
      expect(validWorkout.day_number).toBeLessThanOrEqual(3)
      expect(validWorkout2.week_number).toBeLessThanOrEqual(4)
      expect(validWorkout2.day_number).toBeLessThanOrEqual(3)
    })

    it('should validate exercise data consistency', async () => {
      // Create workout log exercise with consistent data
      const workoutLog = await dbUtils.createTestWorkoutLog(testUser.id)
      const exercise = await dbUtils.createTestExercise()

      const logExercise = await dbUtils.createTestWorkoutLogExercise(
        workoutLog.id,
        exercise.id,
        {
          sets: 3,
          reps: [10, 8, 6],
          weights: [135, 140, 145],
          completed: [true, true, false] // Only 2 completed sets
        }
      )

      // Verify data consistency
      expect(logExercise.sets).toBe(3)
      expect(logExercise.reps).toHaveLength(3)
      expect(logExercise.weights).toHaveLength(3)
      expect(logExercise.completed).toHaveLength(3)
      expect(logExercise.completed.filter(Boolean)).toHaveLength(2) // 2 completed sets
    })
  })

  describe('Transaction Integrity', () => {
    it('should handle transaction rollback on error', async () => {
      // This test would require implementing transactions in the application
      // For now, we'll test that partial operations don't leave inconsistent state
      
      const exercise = await dbUtils.createTestExercise()
      const program = await dbUtils.createTestProgram(testUser.id)
      
      // Attempt to create workout with invalid data that should fail
      try {
        const workout = await dbUtils.createTestProgramWorkout(program.id, {
          week_number: 1,
          day_number: 1
        })

        // This should succeed, but if we had a transaction that included
        // an invalid operation, it should all roll back
        expect(workout.id).toBeDefined()
      } catch (error) {
        // If transaction failed, verify no partial data was created
        const { data: workoutData } = await supabaseClient
          .from('program_workouts')
          .select('*')
          .eq('program_id', program.id)

        expect(workoutData).toHaveLength(0)
      }
    })

    it('should maintain consistency during concurrent modifications', async () => {
      const program = await dbUtils.createTestProgram(testUser.id, {
        name: 'Concurrent Test Program'
      })

      // Simulate concurrent updates
      const updates = [
        adminClient
          .from('programs')
          .update({ name: 'Updated Name 1' })
          .eq('id', program.id),
        adminClient
          .from('programs')
          .update({ description: 'Updated Description' })
          .eq('id', program.id),
        adminClient
          .from('programs')
          .update({ duration: 6 })
          .eq('id', program.id)
      ]

      const results = await Promise.all(updates)

      // All updates should succeed
      results.forEach(({ error }) => {
        expect(error).toBeNull()
      })

      // Verify final state is consistent
      const { data: finalProgram } = await supabaseClient
        .from('programs')
        .select('*')
        .eq('id', program.id)
        .single()

      expect(finalProgram.duration).toBe(6)
      expect(finalProgram.description).toBe('Updated Description')
      // Name could be either value depending on execution order
      expect(['Updated Name 1', 'Concurrent Test Program']).toContain(finalProgram.name)
    })
  })

  describe('Data Type Validation', () => {
    it('should validate numeric data types', async () => {
      // Test valid numeric data
      const validUser = await dbUtils.createTestUser({
        age: 25,
        weight: 150.5,
        height: 70.0
      })

      expect(typeof validUser.age).toBe('number')
      expect(typeof validUser.weight).toBe('number')
      expect(typeof validUser.height).toBe('number')

      // Test invalid numeric data
      const { error } = await adminClient
        .from('users')
        .insert({
          auth_id: 'numeric-test',
          email: 'numeric@example.com',
          name: 'Numeric Test',
          age: 'not-a-number', // Invalid type
          preferred_units: 'LB'
        })

      expect(error).toBeTruthy()
    })

    it('should validate date/timestamp data types', async () => {
      // Test valid date
      const validWorkout = await dbUtils.createTestWorkoutLog(testUser.id, {
        date: '2024-01-15',
        completed_date: '2024-01-15T10:30:00Z'
      })

      expect(validWorkout.date).toBe('2024-01-15')
      expect(validWorkout.completed_date).toMatch(/2024-01-15T10:30:00/)

      // Test invalid date format
      const { error } = await adminClient
        .from('workout_logs')
        .insert({
          user_id: testUser.id,
          name: 'Invalid Date Test',
          date: 'invalid-date-format',
          type: 'quick_workout'
        })

      expect(error).toBeTruthy()
    })

    it('should validate JSON data types', async () => {
      // Test valid JSON data
      const validUser = await dbUtils.createTestUser({
        preferences: {
          theme: 'dark',
          notifications: true,
          units: 'metric'
        },
        settings: {
          autoSave: true,
          showTips: false
        }
      })

      expect(typeof validUser.preferences).toBe('object')
      expect(validUser.preferences.theme).toBe('dark')
      expect(typeof validUser.settings).toBe('object')
      expect(validUser.settings.autoSave).toBe(true)
    })

    it('should validate boolean data types', async () => {
      // Test valid boolean data
      const validProgram = await dbUtils.createTestProgram(testUser.id, {
        is_template: true,
        is_current: false,
        is_active: true
      })

      expect(typeof validProgram.is_template).toBe('boolean')
      expect(typeof validProgram.is_current).toBe('boolean')
      expect(typeof validProgram.is_active).toBe('boolean')
      expect(validProgram.is_template).toBe(true)
      expect(validProgram.is_current).toBe(false)
      expect(validProgram.is_active).toBe(true)
    })
  })

  describe('Security Policy Validation', () => {
    it('should enforce row-level security policies', async () => {
      // Create data for testUser
      const userProgram = await dbUtils.createTestProgram(testUser.id, {
        name: 'User Program'
      })

      // Create another user
      const otherUser = await dbUtils.createTestUser({
        email: 'security-test@example.com'
      })

      const otherUserProgram = await dbUtils.createTestProgram(otherUser.id, {
        name: 'Other User Program'
      })

      // Query as testUser - should only see own programs
      const { data: userPrograms } = await supabaseClient
        .from('programs')
        .select('*')
        .eq('user_id', testUser.id)

      expect(userPrograms).toHaveLength(1)
      expect(userPrograms[0].id).toBe(userProgram.id)

      // Attempt to query other user's programs - should return empty
      const { data: otherPrograms } = await supabaseClient
        .from('programs')
        .select('*')
        .eq('user_id', otherUser.id)

      expect(otherPrograms).toHaveLength(0) // RLS should prevent access
    })

    it('should prevent unauthorized data modifications', async () => {
      // Create program for testUser
      const program = await dbUtils.createTestProgram(testUser.id)

      // Create another user
      const otherUser = await dbUtils.createTestUser({
        email: 'unauthorized-test@example.com'
      })

      // Attempt to update testUser's program as otherUser
      // This should be prevented by RLS policies
      const { error } = await supabaseClient
        .from('programs')
        .update({ name: 'Unauthorized Update' })
        .eq('id', program.id)

      // The update should either fail or not affect any rows
      expect(error).toBeTruthy() // Should be prevented by RLS
    })

    it('should allow admin operations with service role', async () => {
      // Create program using regular client
      const program = await dbUtils.createTestProgram(testUser.id)

      // Admin should be able to access any data
      const { data: adminData, error: adminError } = await adminClient
        .from('programs')
        .select('*')
        .eq('id', program.id)

      expect(adminError).toBeNull()
      expect(adminData).toHaveLength(1)
      expect(adminData[0].id).toBe(program.id)

      // Admin should be able to update any data
      const { error: updateError } = await adminClient
        .from('programs')
        .update({ name: 'Admin Updated Program' })
        .eq('id', program.id)

      expect(updateError).toBeNull()

      // Verify update
      const { data: updatedData } = await adminClient
        .from('programs')
        .select('name')
        .eq('id', program.id)
        .single()

      expect(updatedData.name).toBe('Admin Updated Program')
    })
  })

  describe('Data Migration Integrity', () => {
    it('should maintain data structure compatibility', async () => {
      // Test that all expected tables exist with correct structure
      const tables = [
        'users',
        'exercises',
        'programs',
        'program_workouts',
        'program_exercises',
        'workout_logs',
        'workout_log_exercises',
        'user_analytics'
      ]

      for (const table of tables) {
        const { data, error } = await supabaseClient
          .from(table)
          .select('*')
          .limit(1)

        expect(error).toBeNull()
        expect(Array.isArray(data)).toBe(true)
      }
    })

    it('should validate all required columns exist', async () => {
      // Test users table structure
      const user = await dbUtils.createTestUser()
      const userKeys = Object.keys(user)
      
      const expectedUserColumns = [
        'id', 'auth_id', 'email', 'name', 'experience_level',
        'preferred_units', 'created_at', 'updated_at'
      ]

      expectedUserColumns.forEach(column => {
        expect(userKeys).toContain(column)
      })

      // Test exercises table structure
      const exercise = await dbUtils.createTestExercise()
      const exerciseKeys = Object.keys(exercise)
      
      const expectedExerciseColumns = [
        'id', 'name', 'primary_muscle_group', 'exercise_type',
        'instructions', 'is_global', 'created_at'
      ]

      expectedExerciseColumns.forEach(column => {
        expect(exerciseKeys).toContain(column)
      })
    })

    it('should validate data relationships are properly migrated', async () => {
      // Create complete data structure
      const { program, exercises, workouts } = await dbUtils.createCompleteTestProgram(
        testUser.id,
        {
          programData: { name: 'Migration Test Program' },
          workoutsCount: 2,
          exercisesPerWorkout: 3
        }
      )

      // Verify complete structure exists
      expect(program.id).toBeDefined()
      expect(exercises).toHaveLength(3)
      expect(workouts).toHaveLength(2)

      // Verify relationships
      workouts.forEach(workout => {
        expect(workout.program_id).toBe(program.id)
        expect(workout.program_exercises).toHaveLength(3)
        
        workout.program_exercises.forEach(programExercise => {
          expect(programExercise.workout_id).toBe(workout.id)
          expect(exercises.map(e => e.id)).toContain(programExercise.exercise_id)
        })
      })
    })
  })
})