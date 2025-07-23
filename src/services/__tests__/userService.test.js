import { 
  createUserProfile, 
  getUserProfile, 
  updateUserProfile,
  getUserStatistics
} from '../userService'
import { supabase } from '../../config/supabase'

// Mock Supabase
jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
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
    
    // Reset mock implementation
    supabase.from.mockReturnValue({
      insert: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn()
        })
      }),
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn()
        })
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn()
          })
        })
      })
    })
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
      supabase.from().insert().select().single.mockResolvedValue({
        data: mockCreatedProfile,
        error: null
      })

      const result = await createUserProfile(mockAuthUser, mockProfileData)

      expect(result).toEqual(mockCreatedProfile)
      expect(supabase.from).toHaveBeenCalledWith('users')
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

      supabase.from().select().eq().single.mockResolvedValue({
        data: mockProfile,
        error: null
      })

      const result = await getUserProfile('auth-123')

      expect(result).toEqual(mockProfile)
      expect(supabase.from).toHaveBeenCalledWith('users')
    })

    it('should return null for non-existent user', async () => {
      supabase.from().select().eq().single.mockResolvedValue({
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

      supabase.from().update().eq().select().single.mockResolvedValue({
        data: mockUpdatedProfile,
        error: null
      })

      const result = await updateUserProfile('user-123', { name: 'Updated Name', age: 30 })

      expect(result).toEqual(mockUpdatedProfile)
      expect(supabase.from).toHaveBeenCalledWith('users')
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

      supabase.from().insert().select().single.mockResolvedValue({
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