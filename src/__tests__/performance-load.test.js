/**
 * Performance and Load Testing Suite
 * 
 * Tests system performance under various load conditions:
 * - Database query performance
 * - Concurrent user operations
 * - Memory usage optimization
 * - Real-time feature performance
 * - Large dataset handling
 */

import { DatabaseTestUtils, testEnvironment } from '../utils/testHelpers'
import { createClient } from '@supabase/supabase-js'
import { performance } from 'perf_hooks'

// Performance test configuration
const PERFORMANCE_THRESHOLDS = {
  QUERY_TIME: 1000, // 1 second
  BULK_OPERATION_TIME: 5000, // 5 seconds
  MEMORY_LIMIT: 100 * 1024 * 1024, // 100MB
  CONCURRENT_OPERATIONS: 50,
  LARGE_DATASET_SIZE: 1000
}

describe('Performance and Load Testing', () => {
  let dbUtils
  let supabaseClient
  let testUser

  beforeAll(async () => {
    dbUtils = await testEnvironment.setup()
    supabaseClient = createClient(
      process.env.REACT_APP_SUPABASE_LOCAL_URL,
      process.env.REACT_APP_SUPABASE_LOCAL_ANON_KEY
    )
    
    testUser = await dbUtils.createTestUser({
      email: 'performance-test@example.com',
      name: 'Performance Test User'
    })
  }, 30000)

  afterAll(async () => {
    await testEnvironment.teardown(dbUtils)
  }, 30000)

  afterEach(async () => {
    await dbUtils.cleanup()
  })

  describe('Database Query Performance', () => {
    it('should execute simple queries within performance threshold', async () => {
      // Create test data
      const exercises = await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Performance Exercise ${i}`,
            primary_muscle_group: i % 5 === 0 ? 'Chest' : 'Back'
          })
        )
      )

      // Test simple select query performance
      const startTime = performance.now()
      
      const { data, error } = await supabaseClient
        .from('exercises')
        .select('*')
        .limit(50)

      const queryTime = performance.now() - startTime

      expect(error).toBeNull()
      expect(data).toHaveLength(50)
      expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.QUERY_TIME)
      
      console.log(`Simple query completed in ${queryTime.toFixed(2)}ms`)
    })

    it('should execute complex joins within performance threshold', async () => {
      // Create complex test data structure
      const program = await dbUtils.createTestProgram(testUser.id)
      const workouts = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          dbUtils.createTestProgramWorkout(program.id, {
            week_number: Math.floor(i / 3) + 1,
            day_number: (i % 3) + 1,
            name: `Workout ${i}`
          })
        )
      )

      const exercises = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Exercise ${i}`,
            primary_muscle_group: i % 2 === 0 ? 'Chest' : 'Back'
          })
        )
      )

      // Create program exercises
      const programExercises = []
      for (const workout of workouts) {
        for (let i = 0; i < 5; i++) {
          programExercises.push(
            dbUtils.createTestProgramExercise(
              workout.id,
              exercises[i % exercises.length].id,
              { order_index: i }
            )
          )
        }
      }
      await Promise.all(programExercises)

      // Test complex join query performance
      const startTime = performance.now()
      
      const { data, error } = await supabaseClient
        .from('programs')
        .select(`
          *,
          program_workouts (
            *,
            program_exercises (
              *,
              exercises (
                id,
                name,
                primary_muscle_group,
                exercise_type
              )
            )
          )
        `)
        .eq('id', program.id)
        .single()

      const queryTime = performance.now() - startTime

      expect(error).toBeNull()
      expect(data.program_workouts).toHaveLength(10)
      expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.QUERY_TIME * 2) // Allow 2x for complex joins
      
      console.log(`Complex join query completed in ${queryTime.toFixed(2)}ms`)
    })

    it('should handle large result sets efficiently', async () => {
      // Create large dataset
      const workoutLogs = await Promise.all(
        Array.from({ length: 200 }, (_, i) =>
          dbUtils.createTestWorkoutLog(testUser.id, {
            name: `Workout ${i}`,
            date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          })
        )
      )

      // Test paginated query performance
      const startTime = performance.now()
      
      const { data, error } = await supabaseClient
        .from('workout_logs')
        .select('*')
        .eq('user_id', testUser.id)
        .order('date', { ascending: false })
        .range(0, 49) // First 50 records

      const queryTime = performance.now() - startTime

      expect(error).toBeNull()
      expect(data).toHaveLength(50)
      expect(queryTime).toBeLessThan(PERFORMANCE_THRESHOLDS.QUERY_TIME)
      
      console.log(`Large result set query completed in ${queryTime.toFixed(2)}ms`)
    })
  })

  describe('Concurrent Operations Performance', () => {
    it('should handle concurrent reads efficiently', async () => {
      // Create test data
      const exercises = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Concurrent Exercise ${i}`
          })
        )
      )

      // Execute concurrent read operations
      const startTime = performance.now()
      
      const concurrentReads = Array.from({ length: PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATIONS }, () =>
        supabaseClient
          .from('exercises')
          .select('*')
          .limit(10)
      )

      const results = await Promise.all(concurrentReads)
      const totalTime = performance.now() - startTime

      // Verify all operations succeeded
      results.forEach(({ data, error }) => {
        expect(error).toBeNull()
        expect(data).toHaveLength(10)
      })

      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.QUERY_TIME * 2)
      console.log(`${PERFORMANCE_THRESHOLDS.CONCURRENT_OPERATIONS} concurrent reads completed in ${totalTime.toFixed(2)}ms`)
    })

    it('should handle concurrent writes efficiently', async () => {
      const startTime = performance.now()
      
      // Execute concurrent write operations
      const concurrentWrites = Array.from({ length: 20 }, (_, i) =>
        dbUtils.createTestExercise({
          name: `Concurrent Write Exercise ${i}`,
          primary_muscle_group: 'Chest'
        })
      )

      const results = await Promise.all(concurrentWrites)
      const totalTime = performance.now() - startTime

      // Verify all writes succeeded
      expect(results).toHaveLength(20)
      results.forEach(result => {
        expect(result.id).toBeDefined()
        expect(result.name).toMatch(/Concurrent Write Exercise/)
      })

      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION_TIME)
      console.log(`20 concurrent writes completed in ${totalTime.toFixed(2)}ms`)
    })

    it('should handle mixed read/write operations', async () => {
      // Create initial data
      const exercises = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Mixed Op Exercise ${i}`
          })
        )
      )

      const startTime = performance.now()
      
      // Mix of read and write operations
      const mixedOperations = [
        // Reads
        ...Array.from({ length: 15 }, () =>
          supabaseClient
            .from('exercises')
            .select('*')
            .limit(5)
        ),
        // Writes
        ...Array.from({ length: 10 }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Mixed Write ${i}`
          })
        ),
        // Updates
        ...exercises.slice(0, 5).map(exercise =>
          supabaseClient
            .from('exercises')
            .update({ name: `Updated ${exercise.name}` })
            .eq('id', exercise.id)
            .select()
        )
      ]

      const results = await Promise.all(mixedOperations)
      const totalTime = performance.now() - startTime

      expect(results).toHaveLength(30)
      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION_TIME)
      console.log(`30 mixed operations completed in ${totalTime.toFixed(2)}ms`)
    })
  })

  describe('Bulk Operations Performance', () => {
    it('should handle bulk inserts efficiently', async () => {
      const bulkData = Array.from({ length: PERFORMANCE_THRESHOLDS.LARGE_DATASET_SIZE }, (_, i) => ({
        user_id: testUser.id,
        name: `Bulk Exercise ${i}`,
        primary_muscle_group: i % 2 === 0 ? 'Chest' : 'Back',
        exercise_type: 'Barbell',
        instructions: `Instructions for bulk exercise ${i}`,
        is_global: false
      }))

      const startTime = performance.now()
      
      // Batch insert in chunks to avoid payload limits
      const chunkSize = 100
      const chunks = []
      for (let i = 0; i < bulkData.length; i += chunkSize) {
        chunks.push(bulkData.slice(i, i + chunkSize))
      }

      const insertPromises = chunks.map(chunk =>
        supabaseClient
          .from('exercises')
          .insert(chunk)
          .select('id')
      )

      const results = await Promise.all(insertPromises)
      const totalTime = performance.now() - startTime

      // Verify all inserts succeeded
      const totalInserted = results.reduce((sum, result) => sum + result.data.length, 0)
      expect(totalInserted).toBe(PERFORMANCE_THRESHOLDS.LARGE_DATASET_SIZE)
      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION_TIME * 2)
      
      console.log(`Bulk insert of ${PERFORMANCE_THRESHOLDS.LARGE_DATASET_SIZE} records completed in ${totalTime.toFixed(2)}ms`)

      // Clean up
      const allIds = results.flatMap(result => result.data.map(item => item.id))
      await supabaseClient
        .from('exercises')
        .delete()
        .in('id', allIds)
    })

    it('should handle bulk updates efficiently', async () => {
      // Create test data
      const exercises = await Promise.all(
        Array.from({ length: 200 }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Bulk Update Exercise ${i}`,
            primary_muscle_group: 'Chest'
          })
        )
      )

      const startTime = performance.now()
      
      // Bulk update using single query
      const { data, error } = await supabaseClient
        .from('exercises')
        .update({ primary_muscle_group: 'Back' })
        .in('id', exercises.map(ex => ex.id))
        .select('id')

      const totalTime = performance.now() - startTime

      expect(error).toBeNull()
      expect(data).toHaveLength(200)
      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION_TIME)
      
      console.log(`Bulk update of 200 records completed in ${totalTime.toFixed(2)}ms`)
    })

    it('should handle bulk deletes efficiently', async () => {
      // Create test data
      const exercises = await Promise.all(
        Array.from({ length: 300 }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Bulk Delete Exercise ${i}`
          })
        )
      )

      const startTime = performance.now()
      
      // Bulk delete
      const { error } = await supabaseClient
        .from('exercises')
        .delete()
        .in('id', exercises.map(ex => ex.id))

      const totalTime = performance.now() - startTime

      expect(error).toBeNull()
      expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION_TIME)
      
      console.log(`Bulk delete of 300 records completed in ${totalTime.toFixed(2)}ms`)

      // Verify deletion
      const { data: remainingData } = await supabaseClient
        .from('exercises')
        .select('id')
        .in('id', exercises.map(ex => ex.id))
      
      expect(remainingData).toHaveLength(0)
    })
  })

  describe('Real-time Performance', () => {
    it('should handle real-time subscriptions efficiently', async () => {
      const subscriptions = []
      const messageCount = 100
      const receivedMessages = []

      try {
        // Create multiple real-time subscriptions
        for (let i = 0; i < 5; i++) {
          const subscription = supabaseClient
            .channel(`test-channel-${i}`)
            .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'exercises'
            }, (payload) => {
              receivedMessages.push(payload)
            })
            .subscribe()

          subscriptions.push(subscription)
        }

        // Wait for subscriptions to be established
        await new Promise(resolve => setTimeout(resolve, 1000))

        const startTime = performance.now()
        
        // Generate real-time events
        const insertPromises = Array.from({ length: messageCount }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Realtime Exercise ${i}`
          })
        )

        await Promise.all(insertPromises)

        // Wait for real-time messages to be received
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        const totalTime = performance.now() - startTime

        expect(receivedMessages.length).toBeGreaterThan(0)
        expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION_TIME)
        
        console.log(`Real-time processing of ${messageCount} events completed in ${totalTime.toFixed(2)}ms`)
        console.log(`Received ${receivedMessages.length} real-time messages`)

      } finally {
        // Clean up subscriptions
        subscriptions.forEach(sub => {
          supabaseClient.removeChannel(sub)
        })
      }
    })

    it('should handle high-frequency real-time updates', async () => {
      const exercise = await dbUtils.createTestExercise({
        name: 'High Frequency Test Exercise'
      })

      const updateCount = 50
      const receivedUpdates = []

      const subscription = supabaseClient
        .channel('high-frequency-test')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'exercises',
          filter: `id=eq.${exercise.id}`
        }, (payload) => {
          receivedUpdates.push(payload)
        })
        .subscribe()

      try {
        // Wait for subscription
        await new Promise(resolve => setTimeout(resolve, 500))

        const startTime = performance.now()
        
        // Rapid updates
        for (let i = 0; i < updateCount; i++) {
          await supabaseClient
            .from('exercises')
            .update({ name: `Updated Exercise ${i}` })
            .eq('id', exercise.id)
          
          // Small delay to prevent overwhelming
          await new Promise(resolve => setTimeout(resolve, 10))
        }

        // Wait for all updates to be received
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        const totalTime = performance.now() - startTime

        expect(receivedUpdates.length).toBeGreaterThan(updateCount * 0.8) // Allow for some message loss
        expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.BULK_OPERATION_TIME)
        
        console.log(`High-frequency updates completed in ${totalTime.toFixed(2)}ms`)
        console.log(`Received ${receivedUpdates.length}/${updateCount} update messages`)

      } finally {
        supabaseClient.removeChannel(subscription)
      }
    })
  })

  describe('Memory Usage Optimization', () => {
    it('should handle large result sets without memory issues', async () => {
      // Create large dataset
      const largeDataset = Array.from({ length: 2000 }, (_, i) => ({
        user_id: testUser.id,
        name: `Memory Test Workout ${i}`,
        date: new Date(Date.now() - i * 60 * 60 * 1000).toISOString().split('T')[0],
        type: 'quick_workout',
        is_finished: true,
        duration: 60 + (i % 60),
        notes: `Notes for workout ${i}`.repeat(10) // Large text field
      }))

      // Insert in batches
      const batchSize = 100
      for (let i = 0; i < largeDataset.length; i += batchSize) {
        const batch = largeDataset.slice(i, i + batchSize)
        await supabaseClient
          .from('workout_logs')
          .insert(batch)
      }

      // Test memory usage during large query
      const initialMemory = process.memoryUsage().heapUsed
      
      const { data, error } = await supabaseClient
        .from('workout_logs')
        .select('*')
        .eq('user_id', testUser.id)
        .order('date', { ascending: false })
        .limit(1000)

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      expect(error).toBeNull()
      expect(data).toHaveLength(1000)
      expect(memoryIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_LIMIT)
      
      console.log(`Memory increase for large query: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)

      // Clean up
      await supabaseClient
        .from('workout_logs')
        .delete()
        .eq('user_id', testUser.id)
    })

    it('should efficiently handle streaming large datasets', async () => {
      // Create test data
      const exercises = await Promise.all(
        Array.from({ length: 500 }, (_, i) =>
          dbUtils.createTestExercise({
            name: `Streaming Exercise ${i}`,
            instructions: `Long instructions for exercise ${i}`.repeat(20)
          })
        )
      )

      const initialMemory = process.memoryUsage().heapUsed
      
      // Process data in chunks to simulate streaming
      const chunkSize = 50
      let processedCount = 0
      
      for (let i = 0; i < exercises.length; i += chunkSize) {
        const chunk = exercises.slice(i, i + chunkSize)
        
        const { data, error } = await supabaseClient
          .from('exercises')
          .select('*')
          .in('id', chunk.map(ex => ex.id))

        expect(error).toBeNull()
        expect(data).toHaveLength(Math.min(chunkSize, exercises.length - i))
        
        processedCount += data.length
        
        // Simulate processing and cleanup
        data.forEach(exercise => {
          // Process exercise data
          expect(exercise.name).toMatch(/Streaming Exercise/)
        })
      }

      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = finalMemory - initialMemory

      expect(processedCount).toBe(exercises.length)
      expect(memoryIncrease).toBeLessThan(PERFORMANCE_THRESHOLDS.MEMORY_LIMIT)
      
      console.log(`Streaming processing memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`)
    })
  })

  describe('Stress Testing', () => {
    it('should handle system stress under heavy load', async () => {
      const stressTestDuration = 10000 // 10 seconds
      const operationsPerSecond = 10
      const totalOperations = (stressTestDuration / 1000) * operationsPerSecond
      
      const startTime = performance.now()
      const operations = []
      const results = []

      // Generate continuous load
      const interval = setInterval(() => {
        if (performance.now() - startTime >= stressTestDuration) {
          clearInterval(interval)
          return
        }

        // Mix of different operations
        const operation = Math.random()
        
        if (operation < 0.4) {
          // Read operation
          operations.push(
            supabaseClient
              .from('exercises')
              .select('*')
              .limit(10)
              .then(result => results.push({ type: 'read', success: !result.error }))
          )
        } else if (operation < 0.7) {
          // Write operation
          operations.push(
            dbUtils.createTestExercise({
              name: `Stress Test Exercise ${Date.now()}`
            }).then(result => results.push({ type: 'write', success: !!result.id }))
          )
        } else {
          // Update operation
          operations.push(
            supabaseClient
              .from('exercises')
              .select('id')
              .limit(1)
              .single()
              .then(({ data }) => {
                if (data) {
                  return supabaseClient
                    .from('exercises')
                    .update({ name: `Updated ${Date.now()}` })
                    .eq('id', data.id)
                }
              })
              .then(() => results.push({ type: 'update', success: true }))
              .catch(() => results.push({ type: 'update', success: false }))
          )
        }
      }, 1000 / operationsPerSecond)

      // Wait for stress test to complete
      await new Promise(resolve => setTimeout(resolve, stressTestDuration + 1000))
      
      // Wait for all operations to complete
      await Promise.all(operations)
      
      const totalTime = performance.now() - startTime
      const successfulOperations = results.filter(r => r.success).length
      const successRate = successfulOperations / results.length

      expect(successRate).toBeGreaterThan(0.95) // 95% success rate
      expect(results.length).toBeGreaterThan(totalOperations * 0.8) // At least 80% of expected operations
      
      console.log(`Stress test completed in ${totalTime.toFixed(2)}ms`)
      console.log(`Operations: ${results.length}, Success rate: ${(successRate * 100).toFixed(2)}%`)
      console.log(`Read: ${results.filter(r => r.type === 'read').length}`)
      console.log(`Write: ${results.filter(r => r.type === 'write').length}`)
      console.log(`Update: ${results.filter(r => r.type === 'update').length}`)
    }, 15000) // Extended timeout for stress test
  })
})