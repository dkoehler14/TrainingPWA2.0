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
      const { eventType, new: newRecord, old: oldRecord } = payload
      
      setLastUpdate({
        type: eventType,
        data: newRecord || oldRecord,
        timestamp: new Date().toISOString()
      })

      // Call user-provided update handler
      if (onUpdate) {
        onUpdate({
          type: eventType,
          data: newRecord || oldRecord,
          timestamp: new Date().toISOString()
        })
      }
    } catch (error) {
      console.error('Error handling real-time update:', error)
      handleError(error)
    }
  }, [onUpdate])

  /**
   * Handle connection errors
   */
  const handleError = useCallback((error) => {
    console.error('🔴 Real-time connection error:', error)
    setConnectionError(error)
    setIsConnected(false)
    
    if (onError) {
      onError(error)
    }

    // Attempt reconnection if enabled
    if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
      scheduleReconnect()
    }
  }, [onError, autoReconnect])

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
   * Connect to real-time channel
   */
  const connect = useCallback(() => {
    if (!enabled || !userId || !programId || weekIndex === null || dayIndex === null) {
      return
    }

    try {
      // Clean up existing connection
      disconnect()

      console.log(`🔌 Connecting to real-time channel: ${channelName}`)

      // Create new channel
      channelRef.current = supabase.channel(channelName, {
        config: {
          presence: {
            key: userId
          }
        }
      })

      // Subscribe to workout log changes
      channelRef.current
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'workout_logs',
          filter: `user_id=eq.${userId} AND program_id=eq.${programId} AND week_index=eq.${weekIndex} AND day_index=eq.${dayIndex}`
        }, handleRealtimeUpdate)
        
        // Subscribe to workout log exercises changes
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'workout_log_exercises',
          filter: `workout_logs.user_id=eq.${userId}`
        }, handleRealtimeUpdate)
        
        // Handle presence events (other users working on same workout)
        .on('presence', { event: 'sync' }, () => {
          const state = channelRef.current.presenceState()
          console.log('👥 Presence sync:', state)
        })
        
        // Handle broadcast events (custom real-time messages)
        .on('broadcast', { event: 'workout_progress' }, (payload) => {
          console.log('📊 Workout progress broadcast:', payload)
          handleRealtimeUpdate({
            eventType: 'BROADCAST',
            new: payload.payload
          })
        })
        
        // Handle heartbeat responses
        .on('broadcast', { event: 'heartbeat' }, (payload) => {
          console.log('💓 Heartbeat response:', payload)
        })
        
        // Subscribe and handle status changes
        .subscribe((status, error) => {
          if (error) {
            handleError(error)
          } else {
            handleConnectionChange(status)
          }
        })

    } catch (error) {
      handleError(error)
    }
  }, [enabled, userId, programId, weekIndex, dayIndex, channelName, handleRealtimeUpdate, handleError, handleConnectionChange])

  /**
   * Disconnect from real-time channel
   */
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting from real-time channel')
    
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
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
  }, [stopHeartbeat])

  /**
   * Broadcast workout progress to other connected clients
   */
  const broadcastProgress = useCallback((progressData) => {
    if (channelRef.current && isConnected) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'workout_progress',
        payload: {
          userId,
          programId,
          weekIndex,
          dayIndex,
          progress: progressData,
          timestamp: new Date().toISOString()
        }
      })
    }
  }, [isConnected, userId, programId, weekIndex, dayIndex])

  /**
   * Send presence update (user is actively working on workout)
   */
  const updatePresence = useCallback((presenceData = {}) => {
    if (channelRef.current && isConnected) {
      channelRef.current.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        ...presenceData
      })
    }
  }, [isConnected, userId])

  /**
   * Get current presence state (other users working on same workout)
   */
  const getPresence = useCallback(() => {
    if (channelRef.current) {
      return channelRef.current.presenceState()
    }
    return {}
  }, [])

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

export default useWorkoutRealtime