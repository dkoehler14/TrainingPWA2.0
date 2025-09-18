/**
 * Real-time Coaching Insights Hook
 * 
 * Provides real-time updates for coaching insights using Supabase subscriptions
 * Handles insight notifications, reading status tracking, and response updates
 * 
 * Requirements: 7.2, 7.6, 6.1
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isRealtimeDisabled } from '../config/supabase'
import { useAuth } from './useAuth'
import { createNotification } from '../services/notificationService'

export function useRealtimeInsights(options = {}) {
  const { user } = useAuth()
  const [insights, setInsights] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)

  const subscriptionRef = useRef(null)
  const {
    enableNotifications = true,
    autoMarkAsViewed = false,
    onNewInsight = null,
    onInsightUpdate = null,
    onError = null
  } = options

  // Use refs to keep callbacks stable for useEffect dependencies
  const onNewInsightRef = useRef(onNewInsight);
  const onInsightUpdateRef = useRef(onInsightUpdate);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onNewInsightRef.current = onNewInsight;
    onInsightUpdateRef.current = onInsightUpdate;
    onErrorRef.current = onError;
  }, [onNewInsight, onInsightUpdate, onError]);

  // Clean up subscription
  const cleanup = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe()
      subscriptionRef.current = null
    }
    setIsConnected(false)
  }, [])

  // Handle insight changes
  const handleInsightChange = useCallback(async (payload) => {
    console.log('💡 Real-time insight update:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload

      // Only process insights for the current user (as client)
      if (newRecord?.client_id !== user.id && oldRecord?.client_id !== user.id) {
        return
      }

      setInsights(current => {
        let updated = [...current]

        switch (eventType) {
          case 'INSERT':
            // New insight received
            if (!current.find(i => i.id === newRecord.id)) {
              updated = [newRecord, ...current]
              
              // Create in-app notification for new insight
              if (enableNotifications) {
                createNotification({
                  userId: user.id,
                  type: 'insight_received',
                  title: `💡 New ${newRecord.type.replace('_', ' ')} from your coach`,
                  message: newRecord.title,
                  relatedId: newRecord.id,
                  relatedType: 'coaching_insight',
                  actionUrl: '/my-coach?tab=insights',
                  actionText: 'View Insight',
                  priority: newRecord.priority === 'high' ? 'high' : 'normal'
                }).catch(err => {
                  console.error('Failed to create insight notification:', err)
                })
              }

              // Call callback if provided
              if (onNewInsightRef.current) {
                onNewInsightRef.current(newRecord)
              }
            }
            break

          case 'UPDATE':
            // Insight updated (could be response added, viewed status changed, etc.)
            updated = current.map(insight =>
              insight.id === newRecord.id ? { ...insight, ...newRecord } : insight
            )
            
            // Call callback if provided
            if (onInsightUpdateRef.current) {
              onInsightUpdateRef.current(newRecord, oldRecord)
            }
            break

          case 'DELETE':
            // Insight deleted (rare, but handle it)
            updated = current.filter(insight => insight.id !== oldRecord.id)
            break

          default:
            return current
        }

        // Update unread count
        const newUnreadCount = updated.filter(insight => !insight.client_viewed).length
        setUnreadCount(newUnreadCount)

        return updated
      })

    } catch (err) {
      console.error('Error handling insight change:', err)
      setError(err)
      if (onErrorRef.current) {
        onErrorRef.current(err);
      }
    }
  }, [user?.id, enableNotifications])

  // Set up real-time subscription
  useEffect(() => {
    if (!user?.id || isRealtimeDisabled()) {
      cleanup()
      return
    }

    setError(null)

    try {
      console.log('🔌 Setting up real-time insights subscription for user:', user.id)

      subscriptionRef.current = supabase
        .channel(`insights_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'coaching_insights',
            filter: `client_id=eq.${user.id}`
          },
          handleInsightChange
        )
        .subscribe((status) => {
          console.log(`💡 Insights subscription status: ${status}`)
          
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
            console.log('✅ Real-time insights subscription active')
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Insights subscription error')
            setError(new Error('Failed to subscribe to insight updates'))
            setIsConnected(false)
          }
        })

    } catch (err) {
      console.error('Error setting up insights subscription:', err)
      setError(err)
    }

    return cleanup
  }, [user?.id, handleInsightChange, cleanup])

  // Mark insight as viewed
  const markAsViewed = useCallback(async (insightId) => {
    try {
      const { data, error } = await supabase
        .from('coaching_insights')
        .update({
          client_viewed: true,
          client_viewed_at: new Date().toISOString()
        })
        .eq('id', insightId)
        .eq('client_id', user.id) // Security check
        .select()
        .single()

      if (error) throw error

      // Update local state immediately
      setInsights(current => 
        current.map(insight =>
          insight.id === insightId 
            ? { ...insight, client_viewed: true, client_viewed_at: data.client_viewed_at }
            : insight
        )
      )

      // Update unread count
      setUnreadCount(current => Math.max(0, current - 1))

      return data
    } catch (err) {
      console.error('Error marking insight as viewed:', err)
      throw err
    }
  }, [user?.id])

  // Add response to insight
  const addResponse = useCallback(async (insightId, response) => {
    try {
      const { data, error } = await supabase
        .from('coaching_insights')
        .update({
          client_response: response,
          updated_at: new Date().toISOString()
        })
        .eq('id', insightId)
        .eq('client_id', user.id) // Security check
        .select()
        .single()

      if (error) throw error

      // Update local state immediately
      setInsights(current => 
        current.map(insight =>
          insight.id === insightId 
            ? { ...insight, client_response: response, updated_at: data.updated_at }
            : insight
        )
      )

      // Create notification for coach about the response
      const insight = insights.find(i => i.id === insightId)
      if (insight) {
        await createNotification({
          userId: insight.coach_id,
          type: 'insight_received',
          title: `💬 Client Response to "${insight.title}"`,
          message: `Your client has responded to your insight: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`,
          relatedId: insightId,
          relatedType: 'coaching_insight',
          actionUrl: `/coach/insights?clientId=${user.id}`,
          actionText: 'View Response',
          priority: 'normal'
        }).catch(err => {
          console.error('Failed to create response notification:', err)
        })
      }

      return data
    } catch (err) {
      console.error('Error adding insight response:', err)
      throw err
    }
  }, [user?.id, insights])

  // Mark all insights as viewed
  const markAllAsViewed = useCallback(async () => {
    try {
      const unviewedInsights = insights.filter(insight => !insight.client_viewed)
      
      if (unviewedInsights.length === 0) {
        return
      }

      const { error } = await supabase
        .from('coaching_insights')
        .update({
          client_viewed: true,
          client_viewed_at: new Date().toISOString()
        })
        .eq('client_id', user.id)
        .eq('client_viewed', false)

      if (error) throw error

      // Update local state
      setInsights(current => 
        current.map(insight => ({
          ...insight,
          client_viewed: true,
          client_viewed_at: new Date().toISOString()
        }))
      )

      setUnreadCount(0)

    } catch (err) {
      console.error('Error marking all insights as viewed:', err)
      throw err
    }
  }, [user?.id, insights])

  // Load initial insights
  const loadInsights = useCallback(async (limit = 50) => {
    if (!user?.id) return

    try {
      const { data, error } = await supabase
        .from('coaching_insights')
        .select(`
          *,
          coach:users!coach_id(id, name, email)
        `)
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      setInsights(data || [])
      
      // Calculate unread count
      const unreadCount = (data || []).filter(insight => !insight.client_viewed).length
      setUnreadCount(unreadCount)

      return data
    } catch (err) {
      console.error('Error loading insights:', err)
      setError(err)
      throw err
    }
  }, [user?.id])

  // Auto-load insights on mount
  useEffect(() => {
    loadInsights()
  }, [loadInsights])

  // Auto-mark as viewed if enabled
  useEffect(() => {
    if (autoMarkAsViewed && insights.length > 0) {
      const unviewedInsights = insights.filter(insight => !insight.client_viewed)
      
      if (unviewedInsights.length > 0) {
        // Mark the most recent unviewed insight as viewed after a delay
        const timer = setTimeout(() => {
          markAsViewed(unviewedInsights[0].id).catch(err => {
            console.error('Auto-mark as viewed failed:', err)
          })
        }, 2000)

        return () => clearTimeout(timer)
      }
    }
  }, [insights, autoMarkAsViewed, markAsViewed])

  return {
    // State
    insights,
    unreadCount,
    isConnected,
    error,
    
    // Actions
    markAsViewed,
    addResponse,
    markAllAsViewed,
    loadInsights,
    cleanup
  }
}

// Specialized hook for insight notifications only
export function useInsightNotifications() {
  return useRealtimeInsights({
    enableNotifications: true,
    autoMarkAsViewed: false
  })
}

// Specialized hook with auto-viewing for dashboard widgets
export function useInsightPreview(limit = 5) {
  const hook = useRealtimeInsights({
    enableNotifications: false,
    autoMarkAsViewed: true
  })

  return {
    ...hook,
    insights: hook.insights.slice(0, limit)
  }
}

export default useRealtimeInsights