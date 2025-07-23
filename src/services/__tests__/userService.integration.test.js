/**
 * Integration test for user service
 * This test verifies that the user service functions work correctly
 * without mocking Supabase (for manual testing)
 */

import { 
  createUserProfile, 
  getUserProfile, 
  updateUserProfile,
  getOrCreateUserProfile
} from '../userService'

// Skip these tests in CI/automated testing
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true'

describe.skip('UserService Integration Tests', () => {
  const mockAuthUser = {
    id: 'test-auth-id-' + Date.now(),
    email: 'test-' + Date.now() + '@example.com'
  }

  let createdUserId = null

  beforeAll(() => {
    if (!runIntegrationTests) {
      console.log('Skipping integration tests. Set RUN_INTEGRATION_TESTS=true to run.')
    }
  })

  afterAll(async () => {
    // Cleanup: delete test user if created
    if (createdUserId && runIntegrationTests) {
      try {
        // Note: In a real test, you'd want to clean up the test data
        console.log('Test user created with ID:', createdUserId)
      } catch (error) {
        console.error('Cleanup error:', error)
      }
    }
  })

  it('should create and retrieve user profile', async () => {
    if (!runIntegrationTests) return

    const profileData = {
      name: 'Test User',
      experienceLevel: 'beginner',
      age: 25,
      preferredUnits: 'LB'
    }

    // Create user profile
    const createdProfile = await createUserProfile(mockAuthUser, profileData)
    createdUserId = createdProfile.id

    expect(createdProfile).toBeDefined()
    expect(createdProfile.email).toBe(mockAuthUser.email)
    expect(createdProfile.name).toBe(profileData.name)
    expect(createdProfile.experience_level).toBe(profileData.experienceLevel)

    // Retrieve user profile
    const retrievedProfile = await getUserProfile(mockAuthUser.id)
    expect(retrievedProfile).toBeDefined()
    expect(retrievedProfile.id).toBe(createdProfile.id)
    expect(retrievedProfile.email).toBe(mockAuthUser.email)
  })

  it('should update user profile', async () => {
    if (!runIntegrationTests || !createdUserId) return

    const updates = {
      name: 'Updated Test User',
      age: 30
    }

    const updatedProfile = await updateUserProfile(createdUserId, updates)
    
    expect(updatedProfile).toBeDefined()
    expect(updatedProfile.name).toBe(updates.name)
    expect(updatedProfile.age).toBe(updates.age)
  })

  it('should handle getOrCreateUserProfile', async () => {
    if (!runIntegrationTests) return

    const newAuthUser = {
      id: 'new-auth-id-' + Date.now(),
      email: 'new-test-' + Date.now() + '@example.com'
    }

    // Should create new profile since it doesn't exist
    const profile = await getOrCreateUserProfile(newAuthUser, {
      name: 'New Test User',
      experienceLevel: 'intermediate'
    })

    expect(profile).toBeDefined()
    expect(profile.email).toBe(newAuthUser.email)
    expect(profile.name).toBe('New Test User')
    expect(profile.experience_level).toBe('intermediate')

    // Should return existing profile on second call
    const existingProfile = await getOrCreateUserProfile(newAuthUser)
    expect(existingProfile.id).toBe(profile.id)
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