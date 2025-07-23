/**
 * Protected Route Hook
 * 
 * This hook provides utilities for protecting routes based on authentication
 * and authorization requirements.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

/**
 * Hook for protecting routes that require authentication
 */
export function useProtectedRoute(options = {}) {
  const {
    redirectTo = '/auth',
    requireEmailVerification = false,
    requireCompleteProfile = false,
    requiredRole = null,
    allowedRoles = null
  } = options

  const navigate = useNavigate()
  const location = useLocation()
  const {
    isAuthenticated,
    user,
    userProfile,
    hasCompleteProfile,
    loading,
    userRole
  } = useAuth()

  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const checkAuthorization = () => {
      // Still loading, don't make decisions yet
      if (loading) {
        setIsChecking(true)
        return
      }

      // Not authenticated
      if (!isAuthenticated) {
        setIsAuthorized(false)
        setIsChecking(false)
        navigate(redirectTo, { 
          state: { from: location.pathname },
          replace: true 
        })
        return
      }

      // Check email verification requirement
      if (requireEmailVerification && !user?.email_confirmed_at) {
        setIsAuthorized(false)
        setIsChecking(false)
        navigate('/verify-email', { 
          state: { from: location.pathname },
          replace: true 
        })
        return
      }

      // Check complete profile requirement
      if (requireCompleteProfile && !hasCompleteProfile) {
        setIsAuthorized(false)
        setIsChecking(false)
        navigate('/profile/setup', { 
          state: { from: location.pathname },
          replace: true 
        })
        return
      }

      // Check specific role requirement
      if (requiredRole && userRole !== requiredRole) {
        setIsAuthorized(false)
        setIsChecking(false)
        navigate('/unauthorized', { 
          state: { from: location.pathname, requiredRole },
          replace: true 
        })
        return
      }

      // Check allowed roles requirement
      if (allowedRoles && !allowedRoles.includes(userRole)) {
        setIsAuthorized(false)
        setIsChecking(false)
        navigate('/unauthorized', { 
          state: { from: location.pathname, allowedRoles },
          replace: true 
        })
        return
      }

      // All checks passed
      setIsAuthorized(true)
      setIsChecking(false)
    }

    checkAuthorization()
  }, [
    isAuthenticated,
    user,
    userProfile,
    hasCompleteProfile,
    loading,
    userRole,
    navigate,
    location.pathname,
    redirectTo,
    requireEmailVerification,
    requireCompleteProfile,
    requiredRole,
    allowedRoles
  ])

  return {
    isAuthorized,
    isChecking,
    isAuthenticated,
    user,
    userProfile
  }
}

/**
 * Hook for protecting admin routes
 */
export function useAdminRoute() {
  return useProtectedRoute({
    requiredRole: 'admin',
    redirectTo: '/unauthorized'
  })
}

/**
 * Hook for protecting moderator routes
 */
export function useModeratorRoute() {
  return useProtectedRoute({
    allowedRoles: ['admin', 'moderator'],
    redirectTo: '/unauthorized'
  })
}

/**
 * Hook for routes that require complete profile
 */
export function useCompleteProfileRoute() {
  return useProtectedRoute({
    requireCompleteProfile: true,
    redirectTo: '/profile/setup'
  })
}

/**
 * Hook for routes that require email verification
 */
export function useVerifiedEmailRoute() {
  return useProtectedRoute({
    requireEmailVerification: true,
    redirectTo: '/verify-email'
  })
}

/**
 * Hook for guest-only routes (redirect authenticated users)
 */
export function useGuestRoute(redirectTo = '/dashboard') {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, loading } = useAuth()

  const [isGuestAllowed, setIsGuestAllowed] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (loading) {
      setIsChecking(true)
      return
    }

    if (isAuthenticated) {
      setIsGuestAllowed(false)
      setIsChecking(false)
      
      // Redirect to intended destination or default
      const from = location.state?.from || redirectTo
      navigate(from, { replace: true })
      return
    }

    setIsGuestAllowed(true)
    setIsChecking(false)
  }, [isAuthenticated, loading, navigate, location.state, redirectTo])

  return {
    isGuestAllowed,
    isChecking
  }
}

/**
 * Hook for conditional route protection
 */
export function useConditionalRoute(condition, redirectTo = '/') {
  const navigate = useNavigate()
  const location = useLocation()
  const { loading } = useAuth()

  const [isAllowed, setIsAllowed] = useState(false)
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (loading) {
      setIsChecking(true)
      return
    }

    const conditionMet = typeof condition === 'function' ? condition() : condition

    if (!conditionMet) {
      setIsAllowed(false)
      setIsChecking(false)
      navigate(redirectTo, { 
        state: { from: location.pathname },
        replace: true 
      })
      return
    }

    setIsAllowed(true)
    setIsChecking(false)
  }, [condition, loading, navigate, location.pathname, redirectTo])

  return {
    isAllowed,
    isChecking
  }
}

/**
 * Component wrapper for protected routes
 */
export function ProtectedRoute({ 
  children, 
  fallback = null,
  ...protectionOptions 
}) {
  const { isAuthorized, isChecking } = useProtectedRoute(protectionOptions)

  if (isChecking) {
    return fallback || <div>Loading...</div>
  }

  if (!isAuthorized) {
    return fallback || null
  }

  return children
}

/**
 * Component wrapper for guest-only routes
 */
export function GuestRoute({ 
  children, 
  fallback = null,
  redirectTo = '/dashboard'
}) {
  const { isGuestAllowed, isChecking } = useGuestRoute(redirectTo)

  if (isChecking) {
    return fallback || <div>Loading...</div>
  }

  if (!isGuestAllowed) {
    return fallback || null
  }

  return children
}

/**
 * Component wrapper for role-based routes
 */
export function RoleRoute({ 
  children, 
  role, 
  roles, 
  fallback = null 
}) {
  const protectionOptions = role 
    ? { requiredRole: role }
    : { allowedRoles: roles }

  return (
    <ProtectedRoute {...protectionOptions} fallback={fallback}>
      {children}
    </ProtectedRoute>
  )
}