/**
 * Real-time Workout Updates Hook
 * 
 * Provides real-time capabilities for workout logging:
 * - Live progress updates during workout sessions
 * - Connection management and error recovery
 * - Automatic reconnection on network issues
 * - Optimistic updates with conflict resolution
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../config/supabase'

export const useWorkoutRealtime = (userId, programId, weekIndex, dayIndex, options = {}) => {
  const {
    enabled = true,
    onUpdate = null,
    onError = null,
    onConnectionChange = null,
    autoReconnect = true,
    heartbeatInterval = 30000
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  
  const channelRef = useRef(null)
  const heartbeatRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  // Generate unique channel name for this workout session
  const channelName = `workout_${userId}_${programId}_${weekIndex}_${dayIndex}`

  /**
   * Handle real-time updates from other clients
   */
  const handleRealtimeUpdate = useCallback((payload) => {
    console.log('📡 Real-time workout update received:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord, table } = payload
      
      // Enhanced update object with more context
      const updateData = {
        type: eventType,
        table: table,
        data: newRecord || oldRecord,
        oldData: oldRecord,
        timestamp: new Date().toISOString(),
        userId: newRecord?.user_id || oldRecord?.user_id,
        workoutLogId: newRecord?.workout_log_id || oldRecord?.workout_log_id
      }
      
      setLastUpdate(updateData)

      // Call user-provided update handler with enhanced data
      if (onUpdate) {
        onUpdate(updateData)
      }
    } catch (error) {
      console.error('Error handling real-time update:', error)
      handleError(error)
    }
  }, [onUpdate])

  /**
   * Handle connection errors with enhanced error classification
   */
  const handleError = useCallback((error) => {
    console.error('🔴 Real-time connection error:', error)
    
    // Classify error type for better handling
    const errorType = classifyRealtimeError(error)
    const enhancedError = {
      ...error,
      type: errorType,
      timestamp: new Date().toISOString(),
      channelName,
      reconnectAttempts: reconnectAttemptsRef.current
    }
    
    setConnectionError(enhancedError)
    setIsConnected(false)
    
    if (onError) {
      onError(enhancedError)
    }

    // Attempt reconnection based on error type
    if (autoReconnect && shouldRetryConnection(errorType) && reconnectAttemptsRef.current < maxReconnectAttempts) {
      scheduleReconnect()
    } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error('🚫 Max reconnection attempts reached. Manual intervention required.')
    }
  }, [onError, autoReconnect, channelName])

  /**
   * Handle connection status changes
   */
  const handleConnectionChange = useCallback((status) => {
    console.log('🔗 Real-time connection status:', status)
    
    const connected = status === 'SUBSCRIBED'
    setIsConnected(connected)
    
    if (connected) {
      setConnectionError(null)
      reconnectAttemptsRef.current = 0
      startHeartbeat()
    } else {
      stopHeartbeat()
    }

    if (onConnectionChange) {
      onConnectionChange(connected, status)
    }
  }, [onConnectionChange])

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
    console.log(`⏰ Scheduling reconnection attempt ${reconnectAttemptsRef.current + 1} in ${delay}ms`)

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current += 1
      connect()
    }, delay)
  }, [])

  /**
   * Start heartbeat to monitor connection health
   */
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
    }

    heartbeatRef.current = setInterval(() => {
      if (channelRef.current && isConnected) {
        // Send a ping to test connection
        channelRef.current.send({
          type: 'broadcast',
          event: 'heartbeat',
          payload: { timestamp: new Date().toISOString() }
        })
      }
    }, heartbeatInterval)
  }, [heartbeatInterval, isConnected])

  /**
   * Stop heartbeat monitoring
   */
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
  }, [])

  /**
   * Connect to real-time channel using enhanced channel manager
   */
  const connect = useCallback(async () => {
    if (!enabled || !userId || !programId || weekIndex === null || dayIndex === null) {
      return
    }

    try {
      // Clean up existing connection
      disconnect()

      console.log(`🔌 Connecting to real-time channel: ${channelName}`)

      // Import channel manager dynamically to avoid circular dependencies
      const { default: channelManager } = await import('../utils/realtimeChannelManager')

      // Create channel with enhanced configuration
      const channel = channelManager.createWorkoutChannel(userId, programId, weekIndex, dayIndex, {
        onWorkoutLogChange: handleRealtimeUpdate,
        onWorkoutExerciseChange: handleRealtimeUpdate,
        onUserAnalyticsChange: handleRealtimeUpdate,
        onBroadcast: (broadcastData) => {
          handleRealtimeUpdate({
            eventType: 'BROADCAST',
            new: broadcastData.payload,
            table: 'broadcast',
            timestamp: broadcastData.timestamp
          })
        },
        onPresenceChange: (presenceData) => {
          console.log('👥 Presence change:', presenceData)
          // Could trigger additional callbacks here if needed
        }
      })

      channelRef.current = channel

      // Subscribe with enhanced error handling
      await channelManager.subscribeChannel(channelName, {
        onStatusChange: handleConnectionChange,
        onError: handleError,
        maxRetries: 3
      })

      console.log(`✅ Successfully connected to channel: ${channelName}`)

    } catch (error) {
      console.error(`❌ Failed to connect to channel: ${channelName}`, error)
      handleError(error)
    }
  }, [enabled, userId, programId, weekIndex, dayIndex, channelName, handleRealtimeUpdate, handleError, handleConnectionChange])

  /**
   * Disconnect from real-time channel using enhanced channel manager
   */
  const disconnect = useCallback(async () => {
    console.log('🔌 Disconnecting from real-time channel')
    
    if (channelRef.current) {
      try {
        // Import channel manager dynamically
        const { default: channelManager } = await import('../utils/realtimeChannelManager')
        
        // Remove channel through manager
        channelManager.removeChannel(channelName)
      } catch (error) {
        console.error('Error removing channel through manager:', error)
        // Fallback to direct removal
        supabase.removeChannel(channelRef.current)
      }
      
      channelRef.current = null
    }
    
    stopHeartbeat()
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    setIsConnected(false)
    setConnectionError(null)
    reconnectAttemptsRef.current = 0
  }, [stopHeartbeat, channelName])

  /**
   * Broadcast workout progress to other connected clients using channel manager
   */
  const broadcastProgress = useCallback(async (progressData) => {
    if (isConnected) {
      try {
        const { default: channelManager } = await import('../utils/realtimeChannelManager')
        
        const success = channelManager.broadcast(channelName, 'workout_progress', {
          userId,
          programId,
          weekIndex,
          dayIndex,
          progress: progressData
        })
        
        if (!success) {
          console.warn('Failed to broadcast progress - channel not ready')
        }
      } catch (error) {
        console.error('Error broadcasting progress:', error)
      }
    }
  }, [isConnected, channelName, userId, programId, weekIndex, dayIndex])

  /**
   * Send presence update using channel manager
   */
  const updatePresence = useCallback(async (presenceData = {}) => {
    if (isConnected) {
      try {
        const { default: channelManager } = await import('../utils/realtimeChannelManager')
        
        const success = channelManager.updatePresence(channelName, {
          user_id: userId,
          ...presenceData
        })
        
        if (!success) {
          console.warn('Failed to update presence - channel not ready')
        }
      } catch (error) {
        console.error('Error updating presence:', error)
      }
    }
  }, [isConnected, channelName, userId])

  /**
   * Get current presence state using channel manager
   */
  const getPresence = useCallback(async () => {
    try {
      const { default: channelManager } = await import('../utils/realtimeChannelManager')
      return channelManager.getPresence(channelName)
    } catch (error) {
      console.error('Error getting presence:', error)
      return {}
    }
  }, [channelName])

  /**
   * Force reconnection
   */
  const reconnect = useCallback(() => {
    console.log('🔄 Force reconnecting...')
    reconnectAttemptsRef.current = 0
    connect()
  }, [connect])

  // Initialize connection on mount and when dependencies change
  useEffect(() => {
    connect()
    
    // Cleanup on unmount
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  // Update presence when user is active
  useEffect(() => {
    if (isConnected) {
      updatePresence({ active: true })
    }
  }, [isConnected, updatePresence])

  return {
    // Connection state
    isConnected,
    connectionError,
    lastUpdate,
    
    // Connection management
    connect,
    disconnect,
    reconnect,
    
    // Real-time communication
    broadcastProgress,
    updatePresence,
    getPresence,
    
    // Connection info
    channelName,
    reconnectAttempts: reconnectAttemptsRef.current
  }
}

/**
 * Hook for broadcasting workout set completions in real-time
 */
export const useWorkoutProgressBroadcast = (realtimeHook) => {
  const broadcastSetCompletion = useCallback((exerciseIndex, setIndex, completed, data = {}) => {
    if (realtimeHook?.broadcastProgress) {
      realtimeHook.broadcastProgress({
        type: 'set_completion',
        exerciseIndex,
        setIndex,
        completed,
        timestamp: new Date().toISOString(),
        ...data
      })
    }
  }, [realtimeHook])

  const broadcastExerciseCompletion = useCallback((exerciseIndex, completed, data = {}) => {
    if (realtimeHook?.broadcastProgress) {
      realtimeHook.broadcastProgress({
        type: 'exercise_completion',
        exerciseIndex,
        completed,
        timestamp: new Date().toISOString(),
        ...data
      })
    }
  }, [realtimeHook])

  const broadcastWorkoutProgress = useCallback((completedSets, totalSets, data = {}) => {
    if (realtimeHook?.broadcastProgress) {
      realtimeHook.broadcastProgress({
        type: 'workout_progress',
        completedSets,
        totalSets,
        percentage: Math.round((completedSets / totalSets) * 100),
        timestamp: new Date().toISOString(),
        ...data
      })
    }
  }, [realtimeHook])

  return {
    broadcastSetCompletion,
    broadcastExerciseCompletion,
    broadcastWorkoutProgress
  }
}

/**
 * Classify real-time connection errors for better handling
 */
function classifyRealtimeError(error) {
  if (!error) return 'UNKNOWN'
  
  const message = error.message?.toLowerCase() || ''
  const code = error.code || error.status
  
  // Network connectivity issues
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return 'NETWORK_ERROR'
  }
  
  // Authentication/authorization issues
  if (code === 401 || code === 403 || message.includes('unauthorized') || message.includes('forbidden')) {
    return 'AUTH_ERROR'
  }
  
  // Server errors
  if (code >= 500 || message.includes('server') || message.includes('internal')) {
    return 'SERVER_ERROR'
  }
  
  // Rate limiting
  if (code === 429 || message.includes('rate limit') || message.includes('too many')) {
    return 'RATE_LIMIT_ERROR'
  }
  
  // Subscription specific errors
  if (message.includes('subscription') || message.includes('channel')) {
    return 'SUBSCRIPTION_ERROR'
  }
  
  // Timeout errors
  if (message.includes('timeout') || message.includes('aborted')) {
    return 'TIMEOUT_ERROR'
  }
  
  return 'UNKNOWN'
}

/**
 * Determine if connection should be retried based on error type
 */
function shouldRetryConnection(errorType) {
  const retryableErrors = [
    'NETWORK_ERROR',
    'SERVER_ERROR',
    'TIMEOUT_ERROR',
    'SUBSCRIPTION_ERROR',
    'UNKNOWN'
  ]
  
  return retryableErrors.includes(errorType)
}

/**
 * Enhanced connection status monitoring
 */
export function useRealtimeConnectionStatus(realtimeHook) {
  const [connectionHistory, setConnectionHistory] = useState([])
  const [metrics, setMetrics] = useState({
    totalConnections: 0,
    totalDisconnections: 0,
    totalErrors: 0,
    averageConnectionTime: 0,
    lastConnectionTime: null,
    uptime: 0
  })
  
  const connectionStartTime = useRef(null)
  
  useEffect(() => {
    if (!realtimeHook) return
    
    const { isConnected, connectionError } = realtimeHook
    
    // Track connection events
    if (isConnected && !connectionStartTime.current) {
      connectionStartTime.current = Date.now()
      setMetrics(prev => ({
        ...prev,
        totalConnections: prev.totalConnections + 1,
        lastConnectionTime: new Date().toISOString()
      }))
      
      setConnectionHistory(prev => [...prev, {
        event: 'CONNECTED',
        timestamp: new Date().toISOString()
      }].slice(-50)) // Keep last 50 events
    }
    
    if (!isConnected && connectionStartTime.current) {
      const connectionDuration = Date.now() - connectionStartTime.current
      connectionStartTime.current = null
      
      setMetrics(prev => ({
        ...prev,
        totalDisconnections: prev.totalDisconnections + 1,
        averageConnectionTime: (prev.averageConnectionTime * (prev.totalConnections - 1) + connectionDuration) / prev.totalConnections
      }))
      
      setConnectionHistory(prev => [...prev, {
        event: 'DISCONNECTED',
        timestamp: new Date().toISOString(),
        duration: connectionDuration
      }].slice(-50))
    }
    
    if (connectionError) {
      setMetrics(prev => ({
        ...prev,
        totalErrors: prev.totalErrors + 1
      }))
      
      setConnectionHistory(prev => [...prev, {
        event: 'ERROR',
        timestamp: new Date().toISOString(),
        error: connectionError.type || 'UNKNOWN',
        message: connectionError.message
      }].slice(-50))
    }
  }, [realtimeHook?.isConnected, realtimeHook?.connectionError])
  
  return {
    connectionHistory,
    metrics,
    isHealthy: realtimeHook?.isConnected && !realtimeHook?.connectionError,
    getConnectionQuality: () => {
      if (metrics.totalConnections === 0) return 'UNKNOWN'
      const errorRate = metrics.totalErrors / metrics.totalConnections
      if (errorRate < 0.1) return 'EXCELLENT'
      if (errorRate < 0.3) return 'GOOD'
      if (errorRate < 0.5) return 'FAIR'
      return 'POOR'
    }
  }
}

export default useWorkoutRealtime