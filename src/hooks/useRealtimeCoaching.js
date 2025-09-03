/**
 * Real-time Coaching Hooks
 * 
 * React hooks for managing real-time coaching subscriptions:
 * - Coach dashboard real-time updates
 * - Client activity monitoring
 * - Invitation status tracking
 * - Coaching insights delivery
 * 
 * Requirements: 7.2, 2.6, 4.2
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from './useAuth'
import { isRealtimeDisabled } from '../config/supabase'
import realtimeCoachingManager, { 
  subscribeToCoachingUpdates, 
  subscribeToClientCoachingUpdates,
  cleanupCoachingSubscriptions 
} from '../services/realtimeCoachingService'

/**
 * Hook for coach dashboard real-time updates
 * Monitors invitations, client activity, and relationships
 */
export function useRealtimeCoachDashboard(clientIds = [], options = {}) {
  const { user } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState({})
  const [error, setError] = useState(null)
  const [metrics, setMetrics] = useState({})

  // Activity state
  const [invitations, setInvitations] = useState([])
  const [clientActivity, setClientActivity] = useState([])
  const [relationships, setRelationships] = useState([])

  const subscriptionsRef = useRef([])
  const {
    enableNotifications = true,
    maxActivityItems = 50,
    onInvitationAccepted = null,
    onInvitationDeclined = null,
    onWorkoutCompleted = null,
    onClientActivity = null,
    onError = null
  } = options

  // Clean up subscriptions
  const cleanup = useCallback(() => {
    if (subscriptionsRef.current.length > 0) {
      console.log('🧹 Cleaning up coach dashboard subscriptions')
      cleanupCoachingSubscriptions()
      subscriptionsRef.current = []
    }
    setIsConnected(false)
    setConnectionStatus({})
  }, [])

  // Handle invitation changes
  const handleInvitationChange = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload

    setInvitations(current => {
      let updated = [...current]

      switch (eventType) {
        case 'INSERT':
          if (!current.find(i => i.id === newRecord.id)) {
            updated = [newRecord, ...current]
          }
          break

        case 'UPDATE':
          updated = current.map(invitation =>
            invitation.id === newRecord.id ? newRecord : invitation
          )
          break

        case 'DELETE':
          updated = current.filter(invitation => invitation.id !== oldRecord.id)
          break

        default:
          return current
      }

      return updated
    })
  }, [])

  // Handle client activity
  const handleClientActivity = useCallback((activity) => {
    setClientActivity(current => {
      const updated = [activity, ...current.slice(0, maxActivityItems - 1)]
      return updated
    })

    // Call external callback
    if (onClientActivity) {
      onClientActivity(activity)
    }
  }, [maxActivityItems, onClientActivity])

  // Handle workout completion
  const handleWorkoutCompleted = useCallback((workout) => {
    const activity = {
      type: 'workout_completed',
      userId: workout.user_id,
      data: workout,
      timestamp: new Date().toISOString()
    }

    handleClientActivity(activity)

    // Call external callback
    if (onWorkoutCompleted) {
      onWorkoutCompleted(workout)
    }
  }, [handleClientActivity, onWorkoutCompleted])

  // Handle relationship changes
  const handleRelationshipChange = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload

    setRelationships(current => {
      let updated = [...current]

      switch (eventType) {
        case 'INSERT':
          if (!current.find(r => r.id === newRecord.id)) {
            updated = [newRecord, ...current]
          }
          break

        case 'UPDATE':
          updated = current.map(relationship =>
            relationship.id === newRecord.id ? newRecord : relationship
          )
          break

        case 'DELETE':
          updated = current.filter(relationship => relationship.id !== oldRecord.id)
          break

        default:
          return current
      }

      return updated
    })
  }, [])

  // Set up subscriptions
  useEffect(() => {
    if (!user?.id || isRealtimeDisabled() || !user.roles?.includes('coach')) {
      cleanup()
      return
    }

    setError(null)

    const setupSubscriptions = async () => {
      try {
        console.log('🔌 Setting up coach dashboard subscriptions')

        const subscriptions = await subscribeToCoachingUpdates(user.id, clientIds, {
          // Invitation callbacks
          onInvitationAccepted: (invitation) => {
            console.log('✅ Invitation accepted:', invitation)
            handleInvitationChange({ eventType: 'UPDATE', new: invitation })
            if (onInvitationAccepted) {
              onInvitationAccepted(invitation)
            }
          },
          onInvitationDeclined: (invitation) => {
            console.log('❌ Invitation declined:', invitation)
            handleInvitationChange({ eventType: 'UPDATE', new: invitation })
            if (onInvitationDeclined) {
              onInvitationDeclined(invitation)
            }
          },
          onInvitationChange: handleInvitationChange,

          // Client activity callbacks
          onWorkoutCompleted: handleWorkoutCompleted,
          onClientActivity: handleClientActivity,

          // Relationship callbacks
          onRelationshipChange: handleRelationshipChange
        })

        subscriptionsRef.current = subscriptions
        setIsConnected(subscriptions.length > 0)

        // Update connection status
        const statuses = realtimeCoachingManager.getAllSubscriptionStatuses()
        setConnectionStatus(statuses)

        console.log('✅ Coach dashboard subscriptions active')

      } catch (err) {
        console.error('Failed to set up coach dashboard subscriptions:', err)
        setError(err)
        setIsConnected(false)
        
        if (onError) {
          onError(err)
        }
      }
    }

    setupSubscriptions()

    return cleanup
  }, [user?.id, clientIds.join(','), cleanup, handleInvitationChange, handleWorkoutCompleted, handleClientActivity, handleRelationshipChange, onInvitationAccepted, onInvitationDeclined, onError])

  // Update metrics periodically
  useEffect(() => {
    if (!isConnected) return

    const updateMetrics = () => {
      const currentMetrics = realtimeCoachingManager.getMetrics()
      setMetrics(currentMetrics)
    }

    updateMetrics()
    const interval = setInterval(updateMetrics, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [isConnected])

  return {
    // Connection state
    isConnected,
    connectionStatus,
    error,
    metrics,

    // Data
    invitations,
    clientActivity,
    relationships,

    // Actions
    cleanup
  }
}

/**
 * Hook for client-side coaching real-time updates
 * Monitors insights and coach communications
 */
export function useRealtimeClientCoaching(options = {}) {
  const { user } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [insights, setInsights] = useState([])
  const [unreadInsightCount, setUnreadInsightCount] = useState(0)

  const subscriptionRef = useRef(null)
  const {
    enableNotifications = true,
    autoMarkAsViewed = false,
    onInsightReceived = null,
    onInsightUpdated = null,
    onError = null
  } = options

  // Clean up subscription
  const cleanup = useCallback(() => {
    if (subscriptionRef.current) {
      realtimeCoachingManager.unsubscribe(`insights_${user?.id}`)
      subscriptionRef.current = null
    }
    setIsConnected(false)
  }, [user?.id])

  // Handle insight changes
  const handleInsightReceived = useCallback((insight) => {
    console.log('💡 New insight received:', insight)

    setInsights(current => {
      if (!current.find(i => i.id === insight.id)) {
        const updated = [insight, ...current]
        
        // Update unread count
        const newUnreadCount = updated.filter(i => !i.client_viewed).length
        setUnreadInsightCount(newUnreadCount)
        
        return updated
      }
      return current
    })

    // Call external callback
    if (onInsightReceived) {
      onInsightReceived(insight)
    }
  }, [onInsightReceived])

  // Handle insight updates
  const handleInsightUpdated = useCallback((newInsight, oldInsight) => {
    console.log('💡 Insight updated:', newInsight)

    setInsights(current => {
      const updated = current.map(insight =>
        insight.id === newInsight.id ? newInsight : insight
      )
      
      // Update unread count
      const newUnreadCount = updated.filter(i => !i.client_viewed).length
      setUnreadInsightCount(newUnreadCount)
      
      return updated
    })

    // Call external callback
    if (onInsightUpdated) {
      onInsightUpdated(newInsight, oldInsight)
    }
  }, [onInsightUpdated])

  // Set up subscription
  useEffect(() => {
    if (!user?.id || isRealtimeDisabled()) {
      cleanup()
      return
    }

    setError(null)

    const setupSubscription = async () => {
      try {
        console.log('🔌 Setting up client coaching subscription')

        const subscription = await subscribeToClientCoachingUpdates(user.id, {
          onInsightReceived: handleInsightReceived,
          onInsightUpdated: handleInsightUpdated,
          onInsightChange: (payload) => {
            console.log('💡 Insight change:', payload)
          }
        })

        subscriptionRef.current = subscription
        setIsConnected(!!subscription)

        console.log('✅ Client coaching subscription active')

      } catch (err) {
        console.error('Failed to set up client coaching subscription:', err)
        setError(err)
        setIsConnected(false)
        
        if (onError) {
          onError(err)
        }
      }
    }

    setupSubscription()

    return cleanup
  }, [user?.id, cleanup, handleInsightReceived, handleInsightUpdated, onError])

  return {
    // Connection state
    isConnected,
    error,

    // Data
    insights,
    unreadInsightCount,

    // Actions
    cleanup
  }
}

/**
 * Hook for monitoring specific invitation status changes
 * Useful for invitation management pages
 */
export function useRealtimeInvitations(coachId, options = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [invitations, setInvitations] = useState([])

  const subscriptionRef = useRef(null)
  const {
    onInvitationAccepted = null,
    onInvitationDeclined = null,
    onInvitationExpired = null,
    onError = null
  } = options

  // Clean up subscription
  const cleanup = useCallback(() => {
    if (subscriptionRef.current) {
      realtimeCoachingManager.unsubscribe(`invitations_${coachId}`)
      subscriptionRef.current = null
    }
    setIsConnected(false)
  }, [coachId])

  // Handle invitation changes
  const handleInvitationChange = useCallback((payload) => {
    const { eventType, new: newRecord, old: oldRecord } = payload

    setInvitations(current => {
      let updated = [...current]

      switch (eventType) {
        case 'INSERT':
          if (!current.find(i => i.id === newRecord.id)) {
            updated = [newRecord, ...current]
          }
          break

        case 'UPDATE':
          updated = current.map(invitation =>
            invitation.id === newRecord.id ? newRecord : invitation
          )

          // Handle status changes
          if (oldRecord.status !== newRecord.status) {
            switch (newRecord.status) {
              case 'accepted':
                if (onInvitationAccepted) {
                  onInvitationAccepted(newRecord)
                }
                break
              case 'declined':
                if (onInvitationDeclined) {
                  onInvitationDeclined(newRecord)
                }
                break
              case 'expired':
                if (onInvitationExpired) {
                  onInvitationExpired(newRecord)
                }
                break
            }
          }
          break

        case 'DELETE':
          updated = current.filter(invitation => invitation.id !== oldRecord.id)
          break

        default:
          return current
      }

      return updated
    })
  }, [onInvitationAccepted, onInvitationDeclined, onInvitationExpired])

  // Set up subscription
  useEffect(() => {
    if (!coachId || isRealtimeDisabled()) {
      cleanup()
      return
    }

    setError(null)

    const setupSubscription = async () => {
      try {
        console.log('🔌 Setting up invitations subscription')

        const subscription = await realtimeCoachingManager.subscribeToInvitations(coachId, {
          onInvitationChange: handleInvitationChange
        })

        subscriptionRef.current = subscription
        setIsConnected(!!subscription)

        console.log('✅ Invitations subscription active')

      } catch (err) {
        console.error('Failed to set up invitations subscription:', err)
        setError(err)
        setIsConnected(false)
        
        if (onError) {
          onError(err)
        }
      }
    }

    setupSubscription()

    return cleanup
  }, [coachId, cleanup, handleInvitationChange, onError])

  return {
    // Connection state
    isConnected,
    error,

    // Data
    invitations,

    // Actions
    cleanup
  }
}

/**
 * Hook for monitoring client activity in real-time
 * Useful for coach analytics and monitoring dashboards
 */
export function useRealtimeClientActivity(coachId, clientIds = [], options = {}) {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const [activities, setActivities] = useState([])
  const [workoutCompletions, setWorkoutCompletions] = useState([])

  const subscriptionRef = useRef(null)
  const {
    maxActivities = 100,
    onWorkoutCompleted = null,
    onClientActivity = null,
    onError = null
  } = options

  // Clean up subscription
  const cleanup = useCallback(() => {
    if (subscriptionRef.current) {
      realtimeCoachingManager.unsubscribe(`client_activity_${coachId}`)
      subscriptionRef.current = null
    }
    setIsConnected(false)
  }, [coachId])

  // Handle client activity
  const handleClientActivity = useCallback((activity) => {
    setActivities(current => {
      const updated = [activity, ...current.slice(0, maxActivities - 1)]
      return updated
    })

    // Call external callback
    if (onClientActivity) {
      onClientActivity(activity)
    }
  }, [maxActivities, onClientActivity])

  // Handle workout completions
  const handleWorkoutCompleted = useCallback((workout) => {
    setWorkoutCompletions(current => {
      const updated = [workout, ...current.slice(0, 19)] // Keep last 20
      return updated
    })

    // Call external callback
    if (onWorkoutCompleted) {
      onWorkoutCompleted(workout)
    }
  }, [onWorkoutCompleted])

  // Set up subscription
  useEffect(() => {
    if (!coachId || clientIds.length === 0 || isRealtimeDisabled()) {
      cleanup()
      return
    }

    setError(null)

    const setupSubscription = async () => {
      try {
        console.log('🔌 Setting up client activity subscription')

        const subscription = await realtimeCoachingManager.subscribeToClientActivity(coachId, clientIds, {
          onWorkoutCompleted: handleWorkoutCompleted,
          onClientActivity: handleClientActivity
        })

        subscriptionRef.current = subscription
        setIsConnected(!!subscription)

        console.log('✅ Client activity subscription active')

      } catch (err) {
        console.error('Failed to set up client activity subscription:', err)
        setError(err)
        setIsConnected(false)
        
        if (onError) {
          onError(err)
        }
      }
    }

    setupSubscription()

    return cleanup
  }, [coachId, clientIds.join(','), cleanup, handleWorkoutCompleted, handleClientActivity, onError])

  return {
    // Connection state
    isConnected,
    error,

    // Data
    activities,
    workoutCompletions,

    // Actions
    cleanup
  }
}

export default {
  useRealtimeCoachDashboard,
  useRealtimeClientCoaching,
  useRealtimeInvitations,
  useRealtimeClientActivity
}