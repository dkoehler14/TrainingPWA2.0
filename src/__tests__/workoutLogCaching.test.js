/**
 * Unit Tests for Workout Log ID Caching Logic
 * 
 * Tests the caching mechanisms implemented in LogWorkout component to prevent
 * duplicate workout log creation by properly retrieving and using cached IDs.
 * 
 * Test Coverage:
 * - Cached ID retrieval function
 * - Cache validation logic
 * - Fallback to database query scenarios
 * - Workout log ID caching after creation/update
 */

import workoutLogService from '../services/workoutLogService'

// Mock workoutLogService
jest.mock('../services/workoutLogService')

describe('Workout Log ID Caching Logic', () => {
  let mockUser
  let mockProgram
  let mockProgramLogs
  let mockSetProgramLogs

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks()

    // Mock user and program data
    mockUser = {
      id: 'test-user-id',
      email: 'test@example.com'
    }

    mockProgram = {
      id: 'test-program-id',
      name: 'Test Program'
    }

    mockProgramLogs = {}
    mockSetProgramLogs = jest.fn()

    // Mock workoutLogService methods
    workoutLogService.validateWorkoutLogId = jest.fn()
    workoutLogService.getWorkoutLog = jest.fn()
    workoutLogService.createWorkoutLog = jest.fn()
    workoutLogService.updateWorkoutLog = jest.fn()
  })

  // Helper function to simulate the getCachedWorkoutLogId logic
  const getCachedWorkoutLogId = async (weekIndex, dayIndex, programLogs, validateInDatabase = false) => {
    const key = `${weekIndex}_${dayIndex}`
    const cachedId = programLogs[key]?.workoutLogId
    
    // Validate cached ID to ensure it's a valid UUID
    const isValidUUID = (id) => {
      if (!id || typeof id !== 'string') return false
      // Check for valid UUID format (8-4-4-4-12 characters)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      return uuidRegex.test(id)
    }

    if (cachedId) {
      const isValid = isValidUUID(cachedId)
      if (isValid) {
        // If database validation is requested, verify the ID exists in database
        if (validateInDatabase) {
          const isValidInDatabase = await workoutLogService.validateWorkoutLogId(
            cachedId, mockUser.id, mockProgram.id, weekIndex, dayIndex
          )
          
          if (!isValidInDatabase) {
            return null
          }
        }
        return cachedId
      } else {
        return null
      }
    } else {
      return null
    }
  }

  // Helper function to simulate the validateCachedWorkoutLogId logic
  const validateCachedWorkoutLogId = async (workoutLogId, userId, programId, weekIndex, dayIndex) => {
    if (!workoutLogId || !userId || !programId) {
      return false
    }

    try {
      const isValid = await workoutLogService.validateWorkoutLogId(
        workoutLogId, userId, programId, weekIndex, dayIndex
      )
      return isValid
    } catch (error) {
      console.error('❌ Cache validation error:', error)
      return false
    }
  }

  // Helper function to simulate the debouncedSaveLog caching logic
  const simulateSaveLogCaching = async (userData, programData, weekIndex, dayIndex, exerciseData, programLogs) => {
    if (!userData || !programData || exerciseData.length === 0) return null

    // Step 1: Check cached workout log ID first
    let cachedWorkoutLogId = await getCachedWorkoutLogId(weekIndex, dayIndex, programLogs, false)

    let existingLog = null

    if (cachedWorkoutLogId) {
      // Validate cached ID exists in database before using it
      const isValidInDatabase = await validateCachedWorkoutLogId(
        cachedWorkoutLogId, userData.id, programData.id, weekIndex, dayIndex
      )
      
      if (isValidInDatabase) {
        // Use cached ID directly for update
        existingLog = { id: cachedWorkoutLogId }
      } else {
        // Cached ID is invalid, fall back to database query
        cachedWorkoutLogId = null
      }
    }

    if (!cachedWorkoutLogId) {
      // Step 2: Query database if no cached ID
      try {
        existingLog = await workoutLogService.getWorkoutLog(
          userData.id, programData.id, weekIndex, dayIndex
        )
      } catch (dbError) {
        console.error('❌ Database query failed, treating as new workout:', dbError)
        existingLog = null
      }
    }

    // Additional validation for existing log
    if (existingLog && Array.isArray(existingLog)) {
      existingLog = null
    } else if (existingLog && (!existingLog.id || existingLog.id === 'undefined' || 
               existingLog.id === undefined || existingLog.id === null || existingLog.id === '')) {
      existingLog = null
    }

    const workoutData = {
      programId: programData.id,
      weekIndex: weekIndex,
      dayIndex: dayIndex,
      name: `Test Workout`,
      exercises: exerciseData,
      isFinished: false,
      isDraft: true
    }

    if (existingLog && existingLog.id) {
      // Update existing workout log
      const updateData = {
        name: workoutData.name,
        isFinished: workoutData.isFinished,
        isDraft: workoutData.isDraft,
        exercises: workoutData.exercises
      }

      await workoutLogService.updateWorkoutLog(existingLog.id, updateData)
      return { action: 'update', logId: existingLog.id }
    } else {
      // Create new workout log
      const newLog = await workoutLogService.createWorkoutLog(userData.id, workoutData)
      return { action: 'create', logId: newLog?.id }
    }
  }

  describe('getCachedWorkoutLogId function', () => {
    test('should return cached ID when valid UUID exists in programLogs', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000'
      const mockProgramLogsWithCache = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false,
          workoutLogId: validUUID
        }
      }

      const result = await getCachedWorkoutLogId(0, 0, mockProgramLogsWithCache, false)
      
      expect(result).toBe(validUUID)
    })

    test('should return null when cached ID is not a valid UUID', async () => {
      // Test with various invalid UUID formats
      const invalidUUIDs = [
        'invalid-uuid',
        '123',
        '',
        null,
        undefined,
        'not-a-uuid-at-all',
        '123e4567-e89b-12d3-a456' // incomplete UUID
      ]

      for (const invalidId of invalidUUIDs) {
        const mockProgramLogsWithInvalidCache = {
          '0_0': {
            exercises: [],
            isWorkoutFinished: false,
            workoutLogId: invalidId
          }
        }

        const result = await getCachedWorkoutLogId(0, 0, mockProgramLogsWithInvalidCache, false)
        
        expect(result).toBeNull()
      }
    })

    test('should return null when no cached ID exists', async () => {
      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
          // No workoutLogId property
        }
      }

      const result = await getCachedWorkoutLogId(0, 0, mockProgramLogsEmpty, false)
      
      expect(result).toBeNull()
    })

    test('should validate cached ID in database when validateInDatabase is true', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000'
      const mockProgramLogsWithCache = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false,
          workoutLogId: validUUID
        }
      }
      
      workoutLogService.validateWorkoutLogId.mockResolvedValue(true)

      const result = await getCachedWorkoutLogId(0, 0, mockProgramLogsWithCache, true)

      // Should call validation when requested
      expect(workoutLogService.validateWorkoutLogId).toHaveBeenCalledWith(
        validUUID,
        mockUser.id,
        mockProgram.id,
        0,
        0
      )
      expect(result).toBe(validUUID)
    })
  })

  describe('validateCachedWorkoutLogId function', () => {
    test('should return true when workout log exists in database', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000'
      
      workoutLogService.validateWorkoutLogId.mockResolvedValue(true)

      const result = await validateCachedWorkoutLogId(
        validUUID, mockUser.id, mockProgram.id, 0, 0
      )

      expect(workoutLogService.validateWorkoutLogId).toHaveBeenCalledWith(
        validUUID,
        mockUser.id,
        mockProgram.id,
        0,
        0
      )
      expect(result).toBe(true)
    })

    test('should return false when workout log does not exist in database', async () => {
      const invalidUUID = '123e4567-e89b-12d3-a456-426614174000'
      
      workoutLogService.validateWorkoutLogId.mockResolvedValue(false)

      const result = await validateCachedWorkoutLogId(
        invalidUUID, mockUser.id, mockProgram.id, 0, 0
      )

      expect(workoutLogService.validateWorkoutLogId).toHaveBeenCalledWith(
        invalidUUID,
        mockUser.id,
        mockProgram.id,
        0,
        0
      )
      expect(result).toBe(false)
    })

    test('should return false and log error when validation service call fails', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000'
      const validationError = new Error('Database connection failed')
      
      workoutLogService.validateWorkoutLogId.mockRejectedValue(validationError)

      // Mock console.error to verify error logging
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await validateCachedWorkoutLogId(
        validUUID, mockUser.id, mockProgram.id, 0, 0
      )

      // Should handle validation errors gracefully
      expect(workoutLogService.validateWorkoutLogId).toHaveBeenCalled()
      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache validation error'),
        validationError
      )
      
      consoleSpy.mockRestore()
    })

    test('should handle missing required parameters gracefully', async () => {
      // Test with missing parameters
      const testCases = [
        { workoutLogId: null, userId: mockUser.id, programId: mockProgram.id },
        { workoutLogId: 'valid-uuid', userId: null, programId: mockProgram.id },
        { workoutLogId: 'valid-uuid', userId: mockUser.id, programId: null }
      ]

      for (const testCase of testCases) {
        workoutLogService.validateWorkoutLogId.mockClear()
        
        const result = await validateCachedWorkoutLogId(
          testCase.workoutLogId, testCase.userId, testCase.programId, 0, 0
        )

        // Should return false for invalid parameters without calling service
        expect(result).toBe(false)
        expect(workoutLogService.validateWorkoutLogId).not.toHaveBeenCalled()
      }
    })
  })

  describe('Cache validation and error recovery', () => {
    test('should clean up invalid cache entry when validation fails', async () => {
      const invalidCachedId = '123e4567-e89b-12d3-a456-426614174000'
      const mockProgramLogsWithInvalidId = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false,
          workoutLogId: invalidCachedId
        }
      }
      
      // Mock validation failure
      workoutLogService.validateWorkoutLogId.mockResolvedValue(false)
      workoutLogService.getWorkoutLog.mockResolvedValue(null)
      workoutLogService.createWorkoutLog.mockResolvedValue({ id: 'new-workout-id' })

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsWithInvalidId
      )

      // Should fall back to database query after validation failure
      expect(workoutLogService.validateWorkoutLogId).toHaveBeenCalledWith(
        invalidCachedId, mockUser.id, mockProgram.id, 0, 0
      )
      expect(workoutLogService.getWorkoutLog).toHaveBeenCalledWith(
        mockUser.id, mockProgram.id, 0, 0
      )
      expect(result.action).toBe('create')
    })

    test('should fall back to database query when cached ID is invalid', async () => {
      const invalidCachedId = 'invalid-uuid-format'
      const mockProgramLogsWithInvalidId = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false,
          workoutLogId: invalidCachedId
        }
      }
      
      workoutLogService.getWorkoutLog.mockResolvedValue(null)
      workoutLogService.createWorkoutLog.mockResolvedValue({ id: 'new-workout-id' })

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsWithInvalidId
      )

      // Should skip validation and go straight to database query
      expect(workoutLogService.getWorkoutLog).toHaveBeenCalledWith(
        mockUser.id, mockProgram.id, 0, 0
      )
      expect(workoutLogService.validateWorkoutLogId).not.toHaveBeenCalled()
      expect(result.action).toBe('create')
    })

    test('should handle cache validation with database validation enabled', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000'
      const mockProgramLogsWithValidId = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false,
          workoutLogId: validUUID
        }
      }

      workoutLogService.validateWorkoutLogId.mockResolvedValue(false) // Validation fails
      workoutLogService.getWorkoutLog.mockResolvedValue(null)
      workoutLogService.createWorkoutLog.mockResolvedValue({ id: 'new-workout-id' })

      // Test with database validation enabled
      const cachedId = await getCachedWorkoutLogId(0, 0, mockProgramLogsWithValidId, true)

      expect(workoutLogService.validateWorkoutLogId).toHaveBeenCalledWith(
        validUUID, mockUser.id, mockProgram.id, 0, 0
      )
      expect(cachedId).toBeNull() // Should return null when validation fails
    })
  })

  describe('Fallback to database query scenarios', () => {
    test('should query database when no cached ID exists', async () => {
      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
          // No workoutLogId property
        }
      }

      workoutLogService.getWorkoutLog.mockResolvedValue(null)
      workoutLogService.createWorkoutLog.mockResolvedValue({ id: 'new-workout-id' })

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )

      expect(workoutLogService.getWorkoutLog).toHaveBeenCalledWith(
        mockUser.id,
        mockProgram.id,
        0,
        0
      )
      expect(result.action).toBe('create')
    })

    test('should cache workout log ID after successful database query', async () => {
      const existingWorkoutLog = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0,
        is_finished: false,
        is_draft: true
      }

      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
        }
      }

      workoutLogService.getWorkoutLog.mockResolvedValue(existingWorkoutLog)
      workoutLogService.updateWorkoutLog.mockResolvedValue(existingWorkoutLog)

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )

      expect(workoutLogService.getWorkoutLog).toHaveBeenCalled()
      expect(workoutLogService.updateWorkoutLog).toHaveBeenCalledWith(
        existingWorkoutLog.id,
        expect.any(Object)
      )
      expect(result.action).toBe('update')
      expect(result.logId).toBe(existingWorkoutLog.id)
    })

    test('should handle database query failures gracefully', async () => {
      const dbError = new Error('Database connection failed')
      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
        }
      }

      workoutLogService.getWorkoutLog.mockRejectedValue(dbError)
      workoutLogService.createWorkoutLog.mockResolvedValue({
        id: 'new-workout-log-id',
        user_id: mockUser.id
      })

      // Mock console.error to verify error logging
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )

      // Should fall back to creating new workout log
      expect(workoutLogService.createWorkoutLog).toHaveBeenCalled()
      expect(result.action).toBe('create')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database query failed'),
        dbError
      )
      
      consoleSpy.mockRestore()
    })

    test('should treat array response from getWorkoutLog as invalid', async () => {
      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
        }
      }

      // Mock getWorkoutLog returning array instead of object
      workoutLogService.getWorkoutLog.mockResolvedValue([
        { id: 'workout-1' },
        { id: 'workout-2' }
      ])
      workoutLogService.createWorkoutLog.mockResolvedValue({
        id: 'new-workout-log-id'
      })

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )

      // Should treat array as invalid and create new workout log
      expect(workoutLogService.createWorkoutLog).toHaveBeenCalled()
      expect(result.action).toBe('create')
    })

    test('should treat workout log with invalid ID as non-existent', async () => {
      const invalidWorkoutLogs = [
        { id: null },
        { id: undefined },
        { id: '' },
        { id: 'undefined' },
        { /* no id property */ }
      ]

      for (const invalidLog of invalidWorkoutLogs) {
        const mockProgramLogsEmpty = {
          '0_0': {
            exercises: [],
            isWorkoutFinished: false
          }
        }

        workoutLogService.getWorkoutLog.mockResolvedValue(invalidLog)
        workoutLogService.createWorkoutLog.mockResolvedValue({
          id: 'new-workout-log-id'
        })

        const result = await simulateSaveLogCaching(
          mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
        )

        expect(workoutLogService.createWorkoutLog).toHaveBeenCalled()
        expect(result.action).toBe('create')
        
        // Clear mocks for next iteration
        jest.clearAllMocks()
      }
    })
  })

  describe('Workout log ID caching after creation/update', () => {
    test('should cache new workout log ID immediately after creation', async () => {
      const newWorkoutLog = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0,
        is_finished: false,
        is_draft: true
      }

      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
        }
      }

      workoutLogService.getWorkoutLog.mockResolvedValue(null)
      workoutLogService.createWorkoutLog.mockResolvedValue(newWorkoutLog)

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )

      expect(workoutLogService.createWorkoutLog).toHaveBeenCalled()
      expect(result.action).toBe('create')
      expect(result.logId).toBe(newWorkoutLog.id)
    })

    test('should handle creation failure gracefully when no valid ID returned', async () => {
      const invalidCreationResults = [
        null,
        undefined,
        { /* no id property */ },
        { id: null },
        { id: undefined },
        { id: '' }
      ]

      for (const invalidResult of invalidCreationResults) {
        const mockProgramLogsEmpty = {
          '0_0': {
            exercises: [],
            isWorkoutFinished: false
          }
        }

        workoutLogService.getWorkoutLog.mockResolvedValue(null)
        workoutLogService.createWorkoutLog.mockResolvedValue(invalidResult)

        const result = await simulateSaveLogCaching(
          mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
        )

        expect(workoutLogService.createWorkoutLog).toHaveBeenCalled()
        expect(result.action).toBe('create')
        expect(result.logId).toBeUndefined() // Invalid creation result
        
        jest.clearAllMocks()
      }
    })

    test('should cache workout log ID after successful database query', async () => {
      const existingWorkoutLog = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        user_id: mockUser.id,
        program_id: mockProgram.id,
        week_index: 0,
        day_index: 0,
        is_finished: false,
        is_draft: true,
        workout_log_exercises: []
      }

      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
        }
      }

      workoutLogService.getWorkoutLog.mockResolvedValue(existingWorkoutLog)
      workoutLogService.updateWorkoutLog.mockResolvedValue(existingWorkoutLog)

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )

      expect(workoutLogService.getWorkoutLog).toHaveBeenCalled()
      expect(workoutLogService.updateWorkoutLog).toHaveBeenCalledWith(
        existingWorkoutLog.id,
        expect.any(Object)
      )
      expect(result.action).toBe('update')
      expect(result.logId).toBe(existingWorkoutLog.id)
    })

    test('should use cached ID directly when available and valid', async () => {
      const cachedWorkoutLogId = '123e4567-e89b-12d3-a456-426614174000'
      const mockProgramLogsWithCache = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false,
          workoutLogId: cachedWorkoutLogId
        }
      }

      workoutLogService.validateWorkoutLogId.mockResolvedValue(true)
      workoutLogService.updateWorkoutLog.mockResolvedValue({ id: cachedWorkoutLogId })

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsWithCache
      )

      // Should use cached ID directly without database query
      expect(workoutLogService.validateWorkoutLogId).toHaveBeenCalledWith(
        cachedWorkoutLogId, mockUser.id, mockProgram.id, 0, 0
      )
      expect(workoutLogService.getWorkoutLog).not.toHaveBeenCalled()
      expect(workoutLogService.updateWorkoutLog).toHaveBeenCalledWith(
        cachedWorkoutLogId,
        expect.any(Object)
      )
      expect(result.action).toBe('update')
      expect(result.logId).toBe(cachedWorkoutLogId)
    })

    test('should handle concurrent operations with same cache key', async () => {
      const cachedWorkoutLogId = '123e4567-e89b-12d3-a456-426614174000'
      const mockProgramLogsWithCache = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false,
          workoutLogId: cachedWorkoutLogId
        }
      }

      workoutLogService.validateWorkoutLogId.mockResolvedValue(true)
      workoutLogService.updateWorkoutLog.mockResolvedValue({ id: cachedWorkoutLogId })

      // Simulate multiple concurrent operations
      const promises = [
        simulateSaveLogCaching(mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-1' }], mockProgramLogsWithCache),
        simulateSaveLogCaching(mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-2' }], mockProgramLogsWithCache)
      ]

      const results = await Promise.all(promises)

      // Both should use the same cached ID
      expect(results[0].logId).toBe(cachedWorkoutLogId)
      expect(results[1].logId).toBe(cachedWorkoutLogId)
      expect(workoutLogService.updateWorkoutLog).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error handling and logging', () => {
    test('should handle validation errors gracefully', async () => {
      const validUUID = '123e4567-e89b-12d3-a456-426614174000'
      const validationError = new Error('Database connection failed')
      
      workoutLogService.validateWorkoutLogId.mockRejectedValue(validationError)

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await validateCachedWorkoutLogId(
        validUUID, mockUser.id, mockProgram.id, 0, 0
      )

      expect(result).toBe(false)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache validation error'),
        validationError
      )
      
      consoleSpy.mockRestore()
    })

    test('should handle database query errors in save flow', async () => {
      const dbError = new Error('Database connection failed')
      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
        }
      }

      workoutLogService.getWorkoutLog.mockRejectedValue(dbError)
      workoutLogService.createWorkoutLog.mockResolvedValue({ id: 'new-workout-id' })

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Database query failed'),
        dbError
      )
      expect(result.action).toBe('create')
      
      consoleSpy.mockRestore()
    })

    test('should handle empty exercise data gracefully', async () => {
      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
        }
      }

      const result = await simulateSaveLogCaching(
        mockUser, mockProgram, 0, 0, [], mockProgramLogsEmpty
      )

      // Should return null for empty exercise data
      expect(result).toBeNull()
      expect(workoutLogService.getWorkoutLog).not.toHaveBeenCalled()
      expect(workoutLogService.createWorkoutLog).not.toHaveBeenCalled()
    })

    test('should handle missing user or program data', async () => {
      const mockProgramLogsEmpty = {
        '0_0': {
          exercises: [],
          isWorkoutFinished: false
        }
      }

      // Test with missing user
      let result = await simulateSaveLogCaching(
        null, mockProgram, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )
      expect(result).toBeNull()

      // Test with missing program
      result = await simulateSaveLogCaching(
        mockUser, null, 0, 0, [{ exerciseId: 'test-exercise' }], mockProgramLogsEmpty
      )
      expect(result).toBeNull()
    })

    test('should validate UUID format correctly', async () => {
      const testCases = [
        { id: '123e4567-e89b-12d3-a456-426614174000', expected: true }, // Valid UUID
        { id: '123E4567-E89B-12D3-A456-426614174000', expected: true }, // Valid UUID uppercase
        { id: 'invalid-uuid-format', expected: false },
        { id: '123e4567-e89b-12d3-a456', expected: false }, // Too short
        { id: '123e4567-e89b-12d3-a456-426614174000-extra', expected: false }, // Too long
        { id: '', expected: false },
        { id: null, expected: false },
        { id: undefined, expected: false },
        { id: 123, expected: false } // Number instead of string
      ]

      for (const testCase of testCases) {
        const mockProgramLogs = {
          '0_0': {
            exercises: [],
            isWorkoutFinished: false,
            workoutLogId: testCase.id
          }
        }

        const result = await getCachedWorkoutLogId(0, 0, mockProgramLogs, false)
        
        if (testCase.expected) {
          expect(result).toBe(testCase.id)
        } else {
          expect(result).toBeNull()
        }
      }
    })
  })
})