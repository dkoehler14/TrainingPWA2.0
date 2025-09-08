/**
 * Session Management Hook
 * 
 * This hook provides utilities for managing user sessions, including
 * session expiry warnings, automatic refresh, and session monitoring.
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from './useAuth'

/**
 * Hook for session management and monitoring
 */
export function useSessionManagement(options = {}) {
  const {
    warningThreshold = 600, // 10 minutes in seconds
    autoRefresh = true,
    onSessionWarning = null,
    onSessionExpired = null,
    onSessionRefreshed = null
  } = options

  const { session, isAuthenticated, refreshSession: refreshAuthSession } = useAuth()
  const [sessionInfo, setSessionInfo] = useState(null)
  const [timeUntilExpiry, setTimeUntilExpiry] = useState(null)
  const [showWarning, setShowWarning] = useState(false)
  const intervalRef = useRef(null)
  const warningShownRef = useRef(false)

  // Calculate session information
  const calculateSessionInfo = useCallback(() => {
    if (!session || !isAuthenticated) {
      return null
    }

    const expiresAt = new Date(session.expires_at * 1000)
    const now = new Date()
    const timeLeft = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000))
    const isExpired = timeLeft <= 0
    const needsWarning = timeLeft <= warningThreshold && timeLeft > 0

    return {
      expiresAt,
      timeLeft,
      isExpired,
      needsWarning,
      accessToken: session.access_token,
      refreshToken: session.refresh_token
    }
  }, [session, isAuthenticated, warningThreshold])

  // Handle session refresh. This wraps the context's refresh function
  // to add UI logic like hiding warnings.
  const refreshSession = useCallback(async () => {
    try {
      const newSession = await refreshAuthSession()
      if (newSession && onSessionRefreshed) {
        onSessionRefreshed(newSession)
      }
      setShowWarning(false)
      warningShownRef.current = false
      return newSession
    } catch (error) {
      console.error('Failed to refresh session:', error)
      throw error
    }
  }, [onSessionRefreshed, refreshAuthSession])
  // Update session info periodically
  useEffect(() => {
    if (!isAuthenticated) {
      setSessionInfo(null)
      setTimeUntilExpiry(null)
      setShowWarning(false)
      warningShownRef.current = false
      
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const updateSessionInfo = () => {
      const info = calculateSessionInfo()
      setSessionInfo(info)
      
      if (info) {
        setTimeUntilExpiry(info.timeLeft)
        
        // Handle session expiry
        if (info.isExpired) {
          setShowWarning(false)
          if (onSessionExpired) {
            onSessionExpired(info)
          }
          return
        }
        
        // Handle session warning
        if (info.needsWarning && !warningShownRef.current) {
          setShowWarning(true)
          warningShownRef.current = true
          if (onSessionWarning) {
            onSessionWarning(info, refreshSession)
          }
        } else if (!info.needsWarning && warningShownRef.current) {
          setShowWarning(false)
          warningShownRef.current = false
        }
      }
    }

    // Initial update
    updateSessionInfo()

    // Set up interval for periodic updates
    intervalRef.current = setInterval(updateSessionInfo, 1000) // Update every second

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isAuthenticated, calculateSessionInfo, onSessionWarning, onSessionExpired, refreshSession])
  // Dismiss warning
  const dismissWarning = useCallback(() => {
    setShowWarning(false)
  }, [])

  // Format time remaining
  const formatTimeRemaining = useCallback((seconds) => {
    if (seconds <= 0) return '0:00'
    
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60)
      const remainingMinutes = minutes % 60
      return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    }
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }, [])

  return {
    sessionInfo,
    timeUntilExpiry,
    showWarning,
    isExpired: sessionInfo?.isExpired || false,
    needsWarning: sessionInfo?.needsWarning || false,
    refreshSession,
    dismissWarning,
    formatTimeRemaining: (seconds = timeUntilExpiry) => formatTimeRemaining(seconds || 0)
  }
}

/**
 * Hook for session expiry warnings
 */
export function useSessionWarning(options = {}) {
  const {
    warningThreshold = 600, // 10 minutes
    autoShow = true,
    onWarning = null,
    onExpired = null
  } = options

  const [showWarning, setShowWarning] = useState(false)
  const [warningMessage, setWarningMessage] = useState('')

  const handleSessionWarning = useCallback((sessionInfo) => {
    if (autoShow) {
      setShowWarning(true)
      setWarningMessage(`Your session will expire in ${Math.floor(sessionInfo.timeLeft / 60)} minutes. Please save your work.`)
    }
    
    if (onWarning) {
      onWarning(sessionInfo)
    }
  }, [autoShow, onWarning])

  const handleSessionExpired = useCallback((sessionInfo) => {
    setShowWarning(false)
    setWarningMessage('')
    
    if (onExpired) {
      onExpired(sessionInfo)
    }
  }, [onExpired])

  const { 
    sessionInfo, 
    timeUntilExpiry, 
    refreshSession, 
    formatTimeRemaining 
  } = useSessionManagement({
    warningThreshold,
    onSessionWarning: handleSessionWarning,
    onSessionExpired: handleSessionExpired
  })

  const dismissWarning = useCallback(() => {
    setShowWarning(false)
  }, [])

  const extendSession = useCallback(async () => {
    try {
      await refreshSession()
      setShowWarning(false)
      setWarningMessage('')
    } catch (error) {
      console.error('Failed to extend session:', error)
      throw error
    }
  }, [refreshSession])

  return {
    showWarning,
    warningMessage,
    timeUntilExpiry,
    sessionInfo,
    dismissWarning,
    extendSession,
    formatTimeRemaining
  }
}

/**
 * Hook for automatic session refresh
 */
export function useAutoSessionRefresh(options = {}) {
  const {
    refreshThreshold = 300, // 5 minutes before expiry
    maxRetries = 3,
    retryDelay = 1000,
    onRefreshSuccess = null,
    onRefreshError = null
  } = options

  const [refreshAttempts, setRefreshAttempts] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshTimeoutRef = useRef(null)

  const handleSessionRefresh = useCallback(async (sessionInfo, refreshSession) => {
    if (isRefreshing || refreshAttempts >= maxRetries) {
      return
    }

    if (sessionInfo.timeLeft <= refreshThreshold) {
      setIsRefreshing(true)

      try {
        const newSession = await refreshSession()
        setRefreshAttempts(0)

        if (onRefreshSuccess) {
          onRefreshSuccess(newSession)
        }

        console.log('Session refreshed automatically')
        setIsRefreshing(false) // Reset on success
      } catch (error) {
        const newAttempts = refreshAttempts + 1
        setRefreshAttempts(newAttempts)

        if (onRefreshError) {
          onRefreshError(error, newAttempts)
        }

        console.error(`Session refresh failed (attempt ${newAttempts}/${maxRetries}):`, error)

        // Retry after delay if we haven't exceeded max retries
        if (newAttempts < maxRetries) {
          refreshTimeoutRef.current = setTimeout(() => {
            setIsRefreshing(false) // Allow another attempt
          }, retryDelay * newAttempts) // Exponential backoff
        } else {
          // Max retries reached, stop trying
          setIsRefreshing(false)
        }
      }
    }
  }, [isRefreshing, refreshAttempts, maxRetries, refreshThreshold, retryDelay, onRefreshSuccess, onRefreshError])

  const { sessionInfo } = useSessionManagement({
    onSessionWarning: handleSessionRefresh
  })
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  return {
    isRefreshing,
    refreshAttempts,
    maxRetries,
    sessionInfo
  }
}

/**
 * Component for session warning display
 */
export function SessionWarning({ 
  onExtend, 
  onDismiss, 
  className = '',
  showTimeRemaining = true 
}) {
  const { 
    showWarning, 
    warningMessage, 
    timeUntilExpiry, 
    extendSession, 
    dismissWarning, 
    formatTimeRemaining 
  } = useSessionWarning()

  if (!showWarning) {
    return null
  }

  const handleExtend = async () => {
    try {
      await extendSession()
      if (onExtend) onExtend()
    } catch (error) {
      console.error('Failed to extend session:', error)
    }
  }

  const handleDismiss = () => {
    dismissWarning()
    if (onDismiss) onDismiss()
  }

  return (
    <div className={`session-warning ${className}`}>
      <div className="session-warning-content">
        <p>{warningMessage}</p>
        {showTimeRemaining && timeUntilExpiry && (
          <p>Time remaining: {formatTimeRemaining()}</p>
        )}
        <div className="session-warning-actions">
          <button onClick={handleExtend} className="extend-session-btn">
            Extend Session
          </button>
          <button onClick={handleDismiss} className="dismiss-warning-btn">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}