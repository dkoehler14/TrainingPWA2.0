import { renderHook, act } from '@testing-library/react'
import { useSupabaseAuth } from '../useSupabaseAuth'
import { supabase } from '../../config/supabase'

// Mock Supabase
jest.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signUp: jest.fn(),
      signInWithPassword: jest.fn(),
      signInWithOAuth: jest.fn(),
      signOut: jest.fn(),
      resetPasswordForEmail: jest.fn(),
      updateUser: jest.fn()
    }
  }
}))

// Mock error handler
jest.mock('../../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn((error) => {
    throw error
  })
}))

describe('useSupabaseAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    
    // Default mock implementations
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null
    })
    
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } }
    })
  })

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useSupabaseAuth())

    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBe(null)
    expect(result.current.session).toBe(null)
  })

  it('should handle successful sign up', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    const mockSession = { user: mockUser, access_token: 'token' }

    supabase.auth.signUp.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null
    })

    const { result } = renderHook(() => useSupabaseAuth())

    await act(async () => {
      const response = await result.current.signUp('test@example.com', 'password123')
      expect(response.user).toEqual(mockUser)
      expect(response.session).toEqual(mockSession)
    })

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      options: { data: {} }
    })
  })

  it('should handle successful sign in', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    const mockSession = { user: mockUser, access_token: 'token' }

    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: mockUser, session: mockSession },
      error: null
    })

    const { result } = renderHook(() => useSupabaseAuth())

    await act(async () => {
      const response = await result.current.signIn('test@example.com', 'password123')
      expect(response.user).toEqual(mockUser)
      expect(response.session).toEqual(mockSession)
    })

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123'
    })
  })

  it('should handle Google sign in', async () => {
    const mockData = { provider: 'google', url: 'https://oauth.url' }

    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: mockData,
      error: null
    })

    const { result } = renderHook(() => useSupabaseAuth())

    await act(async () => {
      const response = await result.current.signInWithGoogle()
      expect(response).toEqual(mockData)
    })

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`
      }
    })
  })

  it('should handle sign out', async () => {
    supabase.auth.signOut.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useSupabaseAuth())

    await act(async () => {
      await result.current.signOut()
    })

    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('should handle password reset', async () => {
    supabase.auth.resetPasswordForEmail.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useSupabaseAuth())

    await act(async () => {
      await result.current.resetPassword('test@example.com')
    })

    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'test@example.com',
      { redirectTo: `${window.location.origin}/reset-password` }
    )
  })

  it('should handle password update', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useSupabaseAuth())

    await act(async () => {
      await result.current.updatePassword('newpassword123')
    })

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      password: 'newpassword123'
    })
  })

  it('should handle email update', async () => {
    supabase.auth.updateUser.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useSupabaseAuth())

    await act(async () => {
      await result.current.updateEmail('newemail@example.com')
    })

    expect(supabase.auth.updateUser).toHaveBeenCalledWith({
      email: 'newemail@example.com'
    })
  })

  it('should handle authentication errors', async () => {
    const mockError = new Error('Authentication failed')
    supabase.auth.signInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: mockError
    })

    const { result } = renderHook(() => useSupabaseAuth())

    await act(async () => {
      await expect(result.current.signIn('test@example.com', 'wrongpassword'))
        .rejects.toThrow()
    })
  })

  it('should update user state on auth state change', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    const mockSession = { user: mockUser, access_token: 'token' }

    // Mock the auth state change callback
    let authStateCallback
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback
      return { data: { subscription: { unsubscribe: jest.fn() } } }
    })

    const { result } = renderHook(() => useSupabaseAuth())

    // Wait for initial loading to complete
    await act(async () => {
      // Simulate the initial session load completing
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // Simulate auth state change
    await act(async () => {
      authStateCallback('SIGNED_IN', mockSession)
    })

    expect(result.current.user).toEqual(mockUser)
    expect(result.current.session).toEqual(mockSession)
    expect(result.current.loading).toBe(false)
  })
})