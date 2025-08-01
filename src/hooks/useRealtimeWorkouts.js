/**
 * Real-time Workouts Hook
 * 
 * Provides real-time updates for workout logs using Supabase subscriptions
 * Handles workout log changes, draft updates, and analytics updates
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isRealtimeDisabled } from '../config/supabase'
import { useAuth } from './useAuth'

export function useRealtimeWorkouts(options = {}) {
  const { user } = useAuth()
  const [workouts, setWorkouts] = useState([])
  const [drafts, setDrafts] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)

  const subscriptionsRef = useRef([])
  const {
    enableWorkoutLogs = true,
    enableDrafts = true,
    enableAnalytics = false,
    limit = 20
  } = options

  // Clean up subscriptions
  const cleanup = useCallback(() => {
    subscriptionsRef.current.forEach(subscription => {
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe()
      }
    })
    subscriptionsRef.current = []
    setIsConnected(false)
  }, [])

  // Handle workout log changes
  const handleWorkoutLogChange = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload

    setWorkouts(current => {
      switch (eventType) {
        case 'INSERT':
          // Only add if it's a finished workout and not already in the list
          if (newRecord.is_finished && !current.find(w => w.id === newRecord.id)) {
            return [newRecord, ...current].slice(0, limit)
          }
          return current

        case 'UPDATE':
          return current.map(workout =>
            workout.id === newRecord.id ? { ...workout, ...newRecord } : workout
          )

        case 'DELETE':
          return current.filter(workout => workout.id !== oldRecord.id)

        default:
          return current
      }
    })
  }, [limit])

  // Handle draft changes
  const handleDraftChange = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload

    setDrafts(current => {
      switch (eventType) {
        case 'INSERT':
          // Only add if it's a draft and not already in the list
          if (newRecord.is_draft && !current.find(d => d.id === newRecord.id)) {
            return [newRecord, ...current]
          }
          return current

        case 'UPDATE':
          // If draft becomes finished, remove from drafts
          if (!newRecord.is_draft) {
            return current.filter(draft => draft.id !== newRecord.id)
          }
          return current.map(draft =>
            draft.id === newRecord.id ? { ...draft, ...newRecord } : draft
          )

        case 'DELETE':
          return current.filter(draft => draft.id !== oldRecord.id)

        default:
          return current
      }
    })
  }, [])

  // Handle analytics changes
  const handleAnalyticsChange = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload

    setAnalytics(current => {
      switch (eventType) {
        case 'INSERT':
          return [...current, newRecord]

        case 'UPDATE':
          return current.map(analytic =>
            analytic.id === newRecord.id ? { ...analytic, ...newRecord } : analytic
          )

        case 'DELETE':
          return current.filter(analytic => analytic.id !== oldRecord.id)

        default:
          return current
      }
    })
  }, [])

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user?.id || isRealtimeDisabled()) {
      cleanup()
      return
    }

    setError(null)

    try {
      // Subscribe to workout logs
      if (enableWorkoutLogs) {
        const workoutLogsChannel = supabase
          .channel('workout_logs_realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'workout_logs',
              filter: `user_id=eq.${user.id}`
            },
            handleWorkoutLogChange
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Workout logs real-time subscription active')
              setIsConnected(true)
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Workout logs subscription error')
              setError(new Error('Failed to subscribe to workout logs updates'))
            }
          })

        subscriptionsRef.current.push(workoutLogsChannel)
      }

      // Subscribe to drafts (same table, different filter)
      if (enableDrafts) {
        const draftsChannel = supabase
          .channel('drafts_realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'workout_logs',
              filter: `user_id=eq.${user.id} AND is_draft=eq.true`
            },
            handleDraftChange
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Drafts real-time subscription active')
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Drafts subscription error')
              setError(new Error('Failed to subscribe to draft updates'))
            }
          })

        subscriptionsRef.current.push(draftsChannel)
      }

      // Subscribe to analytics
      if (enableAnalytics) {
        const analyticsChannel = supabase
          .channel('analytics_realtime')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'user_analytics',
              filter: `user_id=eq.${user.id}`
            },
            handleAnalyticsChange
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('✅ Analytics real-time subscription active')
            } else if (status === 'CHANNEL_ERROR') {
              console.error('❌ Analytics subscription error')
              setError(new Error('Failed to subscribe to analytics updates'))
            }
          })

        subscriptionsRef.current.push(analyticsChannel)
      }

    } catch (err) {
      console.error('Error setting up real-time subscriptions:', err)
      setError(err)
    }

    // Cleanup on unmount or user change
    return cleanup
  }, [user?.id, enableWorkoutLogs, enableDrafts, enableAnalytics, handleWorkoutLogChange, handleDraftChange, handleAnalyticsChange, cleanup])

  // Manual refresh functions
  const refreshWorkouts = useCallback(async () => {
    if (!user?.id) return

    try {
      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          *,
          workout_log_exercises (
            *,
            exercises (
              id,
              name,
              primary_muscle_group,
              exercise_type
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('is_finished', true)
        .order('completed_date', { ascending: false })
        .limit(limit)

      if (error) throw error
      setWorkouts(data || [])
    } catch (err) {
      console.error('Error refreshing workouts:', err)
      setError(err)
    }
  }, [user?.id, limit])

  const refreshDrafts = useCallback(async () => {
    if (!user?.id) return

    try {
      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          *,
          workout_log_exercises (
            *,
            exercises (
              id,
              name,
              primary_muscle_group,
              exercise_type
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('is_draft', true)
        .order('updated_at', { ascending: false })

      if (error) throw error
      setDrafts(data || [])
    } catch (err) {
      console.error('Error refreshing drafts:', err)
      setError(err)
    }
  }, [user?.id])

  const refreshAnalytics = useCallback(async () => {
    if (!user?.id) return

    try {
      const { data, error } = await supabase
        .from('user_analytics')
        .select(`
          *,
          exercises (
            id,
            name,
            primary_muscle_group,
            exercise_type
          )
        `)
        .eq('user_id', user.id)
        .order('last_workout_date', { ascending: false })

      if (error) throw error
      setAnalytics(data || [])
    } catch (err) {
      console.error('Error refreshing analytics:', err)
      setError(err)
    }
  }, [user?.id])

  // Initial data load
  useEffect(() => {
    if (enableWorkoutLogs) refreshWorkouts()
    if (enableDrafts) refreshDrafts()
    if (enableAnalytics) refreshAnalytics()
  }, [enableWorkoutLogs, enableDrafts, enableAnalytics, refreshWorkouts, refreshDrafts, refreshAnalytics])

  return {
    workouts,
    drafts,
    analytics,
    isConnected,
    error,
    refreshWorkouts,
    refreshDrafts,
    refreshAnalytics,
    cleanup
  }
}

// Specialized hooks for specific use cases
export function useRealtimeWorkoutHistory(limit = 20) {
  return useRealtimeWorkouts({
    enableWorkoutLogs: true,
    enableDrafts: false,
    enableAnalytics: false,
    limit
  })
}

export function useRealtimeDrafts() {
  return useRealtimeWorkouts({
    enableWorkoutLogs: false,
    enableDrafts: true,
    enableAnalytics: false
  })
}

export function useRealtimeAnalytics() {
  return useRealtimeWorkouts({
    enableWorkoutLogs: false,
    enableDrafts: false,
    enableAnalytics: true
  })
}

export default useRealtimeWorkouts