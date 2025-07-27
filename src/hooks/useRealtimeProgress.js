/**
 * Real-time Progress Tracking Hook
 * 
 * Provides real-time capabilities for progress tracking components:
 * - Live analytics updates when workouts are completed
 * - Real-time PR notifications
 * - Live exercise history updates
 * - Progress chart data updates
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../config/supabase'
import { useAuth } from './useAuth'

export const useRealtimeProgress = (options = {}) => {
  const {
    enabled = true,
    exerciseId = null,
    onAnalyticsUpdate = null,
    onPRUpdate = null,
    onHistoryUpdate = null,
    onError = null
  } = options

  const { user } = useAuth()
  const [analytics, setAnalytics] = useState([])
  const [exerciseHistory, setExerciseHistory] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  
  const channelRef = useRef(null)
  const analyticsChannelRef = useRef(null)
  const historyChannelRef = useRef(null)

  /**
   * Handle real-time analytics updates
   */
  const handleAnalyticsUpdate = useCallback((payload) => {
    console.log('📈 Real-time analytics update:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload
      
      const updateData = {
        type: 'analytics',
        eventType,
        data: newRecord || oldRecord,
        oldData: oldRecord,
        timestamp: new Date().toISOString()
      }
      
      setLastUpdate(updateData)
      
      // Update analytics state
      setAnalytics(current => {
        switch (eventType) {
          case 'INSERT':
            return [...current, newRecord]
          case 'UPDATE':
            return current.map(item => 
              item.id === newRecord.id ? newRecord : item
            )
          case 'DELETE':
            return current.filter(item => item.id !== oldRecord.id)
          default:
            return current
        }
      })

      // Check for PR updates
      if (eventType === 'UPDATE' && newRecord.max_weight > (oldRecord.max_weight || 0)) {
        const prUpdate = {
          exerciseId: newRecord.exercise_id,
          exerciseName: newRecord.exercises?.name,
          oldPR: oldRecord.max_weight,
          newPR: newRecord.max_weight,
          improvement: newRecord.max_weight - (oldRecord.max_weight || 0),
          date: new Date().toISOString()
        }
        
        if (onPRUpdate) {
          onPRUpdate(prUpdate)
        }
      }

      if (onAnalyticsUpdate) {
        onAnalyticsUpdate(updateData)
      }
    } catch (error) {
      console.error('Error handling analytics update:', error)
      if (onError) {
        onError(error)
      }
    }
  }, [onAnalyticsUpdate, onPRUpdate, onError])

  /**
   * Handle real-time exercise history updates
   */
  const handleHistoryUpdate = useCallback((payload) => {
    console.log('🏋️ Real-time exercise history update:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload
      
      // Only process if it's for the current exercise or no specific exercise filter
      if (exerciseId && newRecord?.exercise_id !== exerciseId && oldRecord?.exercise_id !== exerciseId) {
        return
      }
      
      const updateData = {
        type: 'history',
        eventType,
        data: newRecord || oldRecord,
        oldData: oldRecord,
        timestamp: new Date().toISOString()
      }
      
      setLastUpdate(updateData)
      
      // Update exercise history state
      setExerciseHistory(current => {
        switch (eventType) {
          case 'INSERT':
            // Add new exercise log entry
            return [...current, newRecord]
          case 'UPDATE':
            // Update existing exercise log entry
            return current.map(item => 
              item.id === newRecord.id ? newRecord : item
            )
          case 'DELETE':
            // Remove deleted exercise log entry
            return current.filter(item => item.id !== oldRecord.id)
          default:
            return current
        }
      })

      if (onHistoryUpdate) {
        onHistoryUpdate(updateData)
      }
    } catch (error) {
      console.error('Error handling history update:', error)
      if (onError) {
        onError(error)
      }
    }
  }, [exerciseId, onHistoryUpdate, onError])

  /**
   * Connect to real-time channels
   */
  const connect = useCallback(async () => {
    if (!enabled || !user?.id) return

    try {
      console.log('🔌 Connecting to real-time progress channels')

      // Analytics channel - user-specific analytics updates
      analyticsChannelRef.current = supabase
        .channel(`user_analytics_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_analytics',
            filter: `user_id=eq.${user.id}`
          },
          handleAnalyticsUpdate
        )
        .subscribe((status) => {
          console.log(`📈 Analytics channel status: ${status}`)
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
          }
        })

      // Exercise history channel - workout log exercises updates
      historyChannelRef.current = supabase
        .channel(`exercise_history_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'workout_log_exercises'
          },
          (payload) => {
            // Additional filtering will be done in the handler
            handleHistoryUpdate(payload)
          }
        )
        .subscribe((status) => {
          console.log(`🏋️ Exercise history channel status: ${status}`)
        })

      console.log('✅ Real-time progress channels connected')
    } catch (error) {
      console.error('❌ Failed to connect to real-time progress channels:', error)
      if (onError) {
        onError(error)
      }
    }
  }, [enabled, user?.id, handleAnalyticsUpdate, handleHistoryUpdate, onError])

  /**
   * Disconnect from real-time channels
   */
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting from real-time progress channels')
    
    if (analyticsChannelRef.current) {
      supabase.removeChannel(analyticsChannelRef.current)
      analyticsChannelRef.current = null
    }
    
    if (historyChannelRef.current) {
      supabase.removeChannel(historyChannelRef.current)
      historyChannelRef.current = null
    }
    
    setIsConnected(false)
  }, [])

  /**
   * Broadcast progress milestone
   */
  const broadcastMilestone = useCallback((milestoneData) => {
    if (isConnected && analyticsChannelRef.current) {
      analyticsChannelRef.current.send({
        type: 'broadcast',
        event: 'progress_milestone',
        payload: {
          userId: user.id,
          ...milestoneData,
          timestamp: new Date().toISOString()
        }
      })
    }
  }, [isConnected, user?.id])

  // Initialize connection
  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  return {
    // State
    analytics,
    exerciseHistory,
    isConnected,
    lastUpdate,
    
    // Actions
    connect,
    disconnect,
    broadcastMilestone,
    
    // Setters for external data loading
    setAnalytics,
    setExerciseHistory
  }
}

/**
 * Hook for real-time exercise-specific progress tracking
 */
export const useRealtimeExerciseProgress = (exerciseId, options = {}) => {
  return useRealtimeProgress({
    ...options,
    exerciseId
  })
}

/**
 * Hook for real-time PR notifications across all exercises
 */
export const useRealtimePRNotifications = (options = {}) => {
  const [prNotifications, setPrNotifications] = useState([])
  
  const handlePRUpdate = useCallback((prUpdate) => {
    setPrNotifications(current => [prUpdate, ...current.slice(0, 9)]) // Keep last 10 PRs
    
    // Show notification
    if (options.showNotifications !== false) {
      console.log(`🎉 New PR! ${prUpdate.exerciseName}: ${prUpdate.newPR} (+${prUpdate.improvement})`)
    }
    
    if (options.onPR) {
      options.onPR(prUpdate)
    }
  }, [options])

  const progressHook = useRealtimeProgress({
    ...options,
    onPRUpdate: handlePRUpdate
  })

  return {
    ...progressHook,
    prNotifications,
    clearPRNotifications: () => setPrNotifications([])
  }
}

export default useRealtimeProgress