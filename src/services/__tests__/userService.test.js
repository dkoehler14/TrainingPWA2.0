import { 
  createUserProfile, 
  getUserProfile, 
  updateUserProfile,
  getUserStatistics
} from '../userService'
import { createMockSupabaseClient, DatabaseTestUtils } from '../../utils/testHelpers'

// Mock Supabase for unit tests
const mockSupabase = createMockSupabaseClient()
jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase
}))

// Mock error handler
jest.mock('../../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn((error) => {
    throw error
  })
}))

describe('UserService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Reset mock implementation with proper chaining
    const mockChain = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
    }
    
    mockSupabase.from.mockReturnValue(mockChain)
  })

  describe('createUserProfile', () => {
    it('should create a user profile with valid data', async () => {
      const mockAuthUser = {
        id: 'auth-123',
        email: 'test@example.com'
      }

      const mockProfileData = {
        name: 'Test User',
        experienceLevel: 'beginner',
        age: 25
      }

      const mockCreatedProfile = {
        id: 'user-123',
        auth_id: 'auth-123',
        email: 'test@example.com',
        name: 'Test User',
        experience_level: 'beginner',
        age: 25
      }

      // Mock successful database response
      mockSupabase.from().single.mockResolvedValue({
        data: mockCreatedProfile,
        error: null
      })

      const result = await createUserProfile(mockAuthUser, mockProfileData)

      expect(result).toEqual(mockCreatedProfile)
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
    })

    it('should handle validation errors', async () => {
      const mockAuthUser = {
        id: 'auth-123',
        email: 'invalid-email'
      }

      // Clear all mocks for this test to let validation run without database mocking
      jest.clearAllMocks()

      // This should throw a validation error before reaching the database
      await expect(createUserProfile(mockAuthUser)).rejects.toThrow('Validation failed')
    })
  })

  describe('getUserProfile', () => {
    it('should retrieve user profile by auth ID', async () => {
      const mockProfile = {
        id: 'user-123',
        auth_id: 'auth-123',
        email: 'test@example.com',
        name: 'Test User'
      }

      mockSupabase.from().single.mockResolvedValue({
        data: mockProfile,
        error: null
      })

      const result = await getUserProfile('auth-123')

      expect(result).toEqual(mockProfile)
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
    })

    it('should return null for non-existent user', async () => {
      mockSupabase.from().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' } // Not found error
      })

      const result = await getUserProfile('non-existent')

      expect(result).toBeNull()
    })
  })

  describe('updateUserProfile', () => {
    it('should update user profile with valid data', async () => {
      const mockUpdatedProfile = {
        id: 'user-123',
        name: 'Updated Name',
        age: 30,
        updated_at: expect.any(String)
      }

      mockSupabase.from().single.mockResolvedValue({
        data: mockUpdatedProfile,
        error: null
      })

      const result = await updateUserProfile('user-123', { name: 'Updated Name', age: 30 })

      expect(result).toEqual(mockUpdatedProfile)
      expect(mockSupabase.from).toHaveBeenCalledWith('users')
    })
  })

  describe('data validation through service functions', () => {
    it('should accept valid user data', async () => {
      const validAuthUser = {
        id: 'test-auth-id',
        email: 'test@example.com'
      }
      
      const validData = {
        name: 'Test User',
        experienceLevel: 'beginner',
        preferredUnits: 'LB',
        age: 25
      }

      const mockCreatedProfile = {
        id: 'user-123',
        auth_id: 'test-auth-id',
        email: 'test@example.com',
        name: 'Test User',
        experience_level: 'beginner'
      }

      mockSupabase.from().single.mockResolvedValue({
        data: mockCreatedProfile,
        error: null
      })

      const result = await createUserProfile(validAuthUser, validData)
      expect(result).toEqual(mockCreatedProfile)
    })

    it('should reject invalid email', async () => {
      const invalidAuthUser = {
        id: 'test-auth-id',
        email: 'invalid-email'
      }

      // Clear all mocks for this test to let validation run without database mocking
      jest.clearAllMocks()

      // This should throw a validation error before reaching the database
      await expect(createUserProfile(invalidAuthUser))
        .rejects.toThrow('Validation failed')
    })

    it('should reject invalid age', async () => {
      const validAuthUser = {
        id: 'test-auth-id',
        email: 'test@example.com'
      }
      
      const invalidData = {
        name: 'Test User', // Add required name
        age: -5
      }

      // Clear all mocks for this test to let validation run without database mocking
      jest.clearAllMocks()

      // This should throw a validation error before reaching the database
      await expect(createUserProfile(validAuthUser, invalidData))
        .rejects.toThrow('Validation failed')
    })
  })
})