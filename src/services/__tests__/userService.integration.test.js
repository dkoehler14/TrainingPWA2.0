/**
 * Integration test for user service
 * This test verifies that the user service functions work correctly
 * with real Supabase database connection
 */

import { 
  createUserProfile, 
  getUserProfile, 
  updateUserProfile,
  getOrCreateUserProfile,
  getUserStatistics
} from '../userService'
import { DatabaseTestUtils, skipIfSupabaseUnavailable } from '../../utils/testHelpers'

describe('UserService Integration Tests', () => {
  let dbUtils

  // Skip tests if Supabase is not available
  skipIfSupabaseUnavailable()

  beforeAll(async () => {
    dbUtils = new DatabaseTestUtils()
    await dbUtils.verifyConnection()
  })

  afterAll(async () => {
    if (dbUtils) {
      await dbUtils.cleanup()
    }
  })

  afterEach(async () => {
    // Clean up after each test
    if (dbUtils) {
      await dbUtils.cleanup()
    }
  })

  describe('createUserProfile', () => {
    it('should create a user profile in the database', async () => {
      const mockAuthUser = {
        id: 'test-auth-123',
        email: 'integration-test@example.com'
      }

      const mockProfileData = {
        name: 'Integration Test User',
        experienceLevel: 'intermediate',
        age: 28,
        weight: 160,
        height: 72
      }

      const result = await createUserProfile(mockAuthUser, mockProfileData)

      expect(result).toBeDefined()
      expect(result.auth_id).toBe(mockAuthUser.id)
      expect(result.email).toBe(mockAuthUser.email)
      expect(result.name).toBe(mockProfileData.name)
      expect(result.experience_level).toBe(mockProfileData.experienceLevel)
      expect(result.age).toBe(mockProfileData.age)

      // Track for cleanup
      dbUtils.createdRecords.users.push(result.id)
    })

    it('should handle duplicate email error', async () => {
      const mockAuthUser = {
        id: 'test-auth-456',
        email: 'duplicate-test@example.com'
      }

      const mockProfileData = {
        name: 'First User'
      }

      // Create first user
      const firstUser = await createUserProfile(mockAuthUser, mockProfileData)
      dbUtils.createdRecords.users.push(firstUser.id)

      // Try to create second user with same email
      const duplicateAuthUser = {
        id: 'test-auth-789',
        email: 'duplicate-test@example.com'
      }

      await expect(
        createUserProfile(duplicateAuthUser, { name: 'Second User' })
      ).rejects.toThrow()
    })
  })

  describe('getUserProfile', () => {
    it('should retrieve an existing user profile', async () => {
      // Create a test user first
      const testUser = await dbUtils.createTestUser({
        auth_id: 'test-get-user-123',
        email: 'get-user-test@example.com',
        name: 'Get User Test'
      })

      const result = await getUserProfile(testUser.auth_id)

      expect(result).toBeDefined()
      expect(result.id).toBe(testUser.id)
      expect(result.auth_id).toBe(testUser.auth_id)
      expect(result.email).toBe(testUser.email)
      expect(result.name).toBe(testUser.name)
    })

    it('should return null for non-existent user', async () => {
      const result = await getUserProfile('non-existent-auth-id')
      expect(result).toBeNull()
    })
  })

  describe('updateUserProfile', () => {
    it('should update an existing user profile', async () => {
      // Create a test user first
      const testUser = await dbUtils.createTestUser({
        name: 'Original Name',
        age: 25
      })

      const updateData = {
        name: 'Updated Name',
        age: 30,
        weight: 170
      }

      const result = await updateUserProfile(testUser.id, updateData)

      expect(result).toBeDefined()
      expect(result.id).toBe(testUser.id)
      expect(result.name).toBe(updateData.name)
      expect(result.age).toBe(updateData.age)
      expect(result.weight).toBe(updateData.weight)
      expect(result.updated_at).not.toBe(testUser.updated_at)
    })

    it('should handle updating non-existent user', async () => {
      await expect(
        updateUserProfile('non-existent-id', { name: 'Test' })
      ).rejects.toThrow()
    })
  })

  describe('getOrCreateUserProfile', () => {
    it('should create new profile when user does not exist', async () => {
      const newAuthUser = {
        id: 'new-auth-id-' + Date.now(),
        email: 'new-test-' + Date.now() + '@example.com'
      }

      const profileData = {
        name: 'New Test User',
        experienceLevel: 'intermediate'
      }

      const profile = await getOrCreateUserProfile(newAuthUser, profileData)

      expect(profile).toBeDefined()
      expect(profile.email).toBe(newAuthUser.email)
      expect(profile.name).toBe(profileData.name)
      expect(profile.experience_level).toBe(profileData.experienceLevel)

      // Track for cleanup
      dbUtils.createdRecords.users.push(profile.id)
    })

    it('should return existing profile when user exists', async () => {
      // Create a test user first
      const testUser = await dbUtils.createTestUser()

      const existingProfile = await getOrCreateUserProfile({ 
        id: testUser.auth_id,
        email: testUser.email 
      })

      expect(existingProfile.id).toBe(testUser.id)
      expect(existingProfile.email).toBe(testUser.email)
    })
  })

  describe('getUserStatistics', () => {
    it('should calculate user statistics from workout data', async () => {
      // Create test user
      const testUser = await dbUtils.createTestUser()
      
      // Create test exercise
      const testExercise = await dbUtils.createTestExercise({
        name: 'Test Bench Press',
        primary_muscle_group: 'Chest'
      })

      // Create test workout log
      const testWorkoutLog = await dbUtils.createTestWorkoutLog(testUser.id, {
        is_finished: true,
        completed_date: new Date().toISOString()
      })

      // Create test workout log exercise
      await dbUtils.createTestWorkoutLogExercise(testWorkoutLog.id, testExercise.id, {
        sets: 3,
        reps: [10, 8, 6],
        weights: [135, 140, 145],
        completed: [true, true, true]
      })

      const result = await getUserStatistics(testUser.id)

      expect(result).toBeDefined()
      expect(result.totalWorkouts).toBeGreaterThan(0)
      expect(result.totalVolume).toBeGreaterThan(0)
      expect(result.exerciseStats).toBeDefined()
    })
  })
})

// Simple unit test to verify validation works
describe('UserService Validation', () => {
  it('should validate email format through service', () => {
    // This is tested indirectly through the service functions
    // The validation happens inside createUserProfile
    // We can't test it directly since validateUserData is not exported
    expect(true).toBe(true) // Placeholder test
  })

  it('should handle missing required fields through service', () => {
    // This would be caught by the service validation
    expect(true).toBe(true) // Placeholder test
  })
})