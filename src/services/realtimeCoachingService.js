/**
 * Real-time Coaching Service
 * 
 * Provides comprehensive real-time subscriptions for the coach role system:
 * - Coaching insights updates
 * - Invitation status changes
 * - Client activity monitoring
 * - Coach-client relationship updates
 * 
 * Requirements: 7.2, 2.6, 4.2
 */

import { supabase, isRealtimeDisabled } from '../config/supabase'
import { createNotification } from './notificationService'

/**
 * Real-time Coaching Manager Class
 */
export class RealtimeCoachingManager {
  constructor() {
    this.subscriptions = new Map()
    this.connectionStatus = new Map()
    this.callbacks = new Map()
    this.metrics = {
      totalSubscriptions: 0,
      activeSubscriptions: 0,
      errors: 0,
      reconnections: 0
    }
  }

  /**
   * Subscribe to coaching insights for a client
   * @param {string} clientId - Client user ID
   * @param {Object} callbacks - Event callbacks
   * @returns {Promise<Object>} Subscription object
   */
  async subscribeToInsights(clientId, callbacks = {}) {
    if (isRealtimeDisabled()) {
      console.log('Real-time disabled, skipping insights subscription')
      return null
    }

    const channelName = `insights_${clientId}`
    
    if (this.subscriptions.has(channelName)) {
      console.log(`📡 Reusing existing insights subscription: ${channelName}`)
      return this.subscriptions.get(channelName)
    }

    console.log(`📡 Creating insights subscription: ${channelName}`)

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'coaching_insights',
          filter: `client_id=eq.${clientId}`
        },
        (payload) => this.handleInsightChange(payload, callbacks)
      )

    // Subscribe with error handling
    return new Promise((resolve, reject) => {
      channel.subscribe((status, error) => {
        console.log(`💡 Insights subscription status: ${status}`)
        this.connectionStatus.set(channelName, status)

        if (error) {
          console.error(`❌ Insights subscription error:`, error)
          this.metrics.errors++
          reject(error)
        } else if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, channel)
          this.callbacks.set(channelName, callbacks)
          this.metrics.totalSubscriptions++
          this.metrics.activeSubscriptions++
          console.log('✅ Insights subscription active')
          resolve(channel)
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error(`Insights subscription failed: ${channelName}`))
        }
      })
    })
  }

  /**
   * Subscribe to invitation status changes for a coach
   * @param {string} coachId - Coach user ID
   * @param {Object} callbacks - Event callbacks
   * @returns {Promise<Object>} Subscription object
   */
  async subscribeToInvitations(coachId, callbacks = {}) {
    if (isRealtimeDisabled()) {
      console.log('Real-time disabled, skipping invitations subscription')
      return null
    }

    const channelName = `invitations_${coachId}`
    
    if (this.subscriptions.has(channelName)) {
      console.log(`📡 Reusing existing invitations subscription: ${channelName}`)
      return this.subscriptions.get(channelName)
    }

    console.log(`📡 Creating invitations subscription: ${channelName}`)

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_invitations',
          filter: `coach_id=eq.${coachId}`
        },
        (payload) => this.handleInvitationChange(payload, callbacks)
      )

    // Subscribe with error handling
    return new Promise((resolve, reject) => {
      channel.subscribe((status, error) => {
        console.log(`📨 Invitations subscription status: ${status}`)
        this.connectionStatus.set(channelName, status)

        if (error) {
          console.error(`❌ Invitations subscription error:`, error)
          this.metrics.errors++
          reject(error)
        } else if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, channel)
          this.callbacks.set(channelName, callbacks)
          this.metrics.totalSubscriptions++
          this.metrics.activeSubscriptions++
          console.log('✅ Invitations subscription active')
          resolve(channel)
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error(`Invitations subscription failed: ${channelName}`))
        }
      })
    })
  }

  /**
   * Subscribe to client activity monitoring for a coach
   * @param {string} coachId - Coach user ID
   * @param {Array} clientIds - Array of client IDs to monitor
   * @param {Object} callbacks - Event callbacks
   * @returns {Promise<Object>} Subscription object
   */
  async subscribeToClientActivity(coachId, clientIds = [], callbacks = {}) {
    if (isRealtimeDisabled()) {
      console.log('Real-time disabled, skipping client activity subscription')
      return null
    }

    const channelName = `client_activity_${coachId}`
    
    if (this.subscriptions.has(channelName)) {
      console.log(`📡 Reusing existing client activity subscription: ${channelName}`)
      return this.subscriptions.get(channelName)
    }

    console.log(`📡 Creating client activity subscription: ${channelName}`)

    const channel = supabase.channel(channelName)

    // Subscribe to workout logs for all clients
    if (clientIds.length > 0) {
      const clientFilter = clientIds.map(id => `user_id=eq.${id}`).join(',')
      
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workout_logs',
          filter: `or(${clientFilter})`
        },
        (payload) => this.handleClientWorkoutActivity(payload, callbacks)
      )

      // Subscribe to workout exercises for detailed activity
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'workout_log_exercises'
        },
        (payload) => this.handleClientExerciseActivity(payload, clientIds, callbacks)
      )

      // Subscribe to program assignments
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'programs',
          filter: `or(${clientIds.map(id => `assigned_to_client=eq.${id}`).join(',')})`
        },
        (payload) => this.handleProgramActivity(payload, callbacks)
      )
    }

    // Subscribe to coach-client relationships
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'coach_client_relationships',
        filter: `coach_id=eq.${coachId}`
      },
      (payload) => this.handleRelationshipChange(payload, callbacks)
    )

    // Subscribe with error handling
    return new Promise((resolve, reject) => {
      channel.subscribe((status, error) => {
        console.log(`👥 Client activity subscription status: ${status}`)
        this.connectionStatus.set(channelName, status)

        if (error) {
          console.error(`❌ Client activity subscription error:`, error)
          this.metrics.errors++
          reject(error)
        } else if (status === 'SUBSCRIBED') {
          this.subscriptions.set(channelName, channel)
          this.callbacks.set(channelName, callbacks)
          this.metrics.totalSubscriptions++
          this.metrics.activeSubscriptions++
          console.log('✅ Client activity subscription active')
          resolve(channel)
        } else if (status === 'CHANNEL_ERROR') {
          reject(new Error(`Client activity subscription failed: ${channelName}`))
        }
      })
    })
  }

  /**
   * Handle coaching insight changes
   */
  async handleInsightChange(payload, callbacks) {
    console.log('💡 Insight change:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload

      switch (eventType) {
        case 'INSERT':
          // New insight created
          if (callbacks.onInsightCreated) {
            callbacks.onInsightCreated(newRecord)
          }

          // Create notification for client
          if (newRecord.client_id) {
            await createNotification({
              userId: newRecord.client_id,
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
          break

        case 'UPDATE':
          // Insight updated (response added, viewed status changed, etc.)
          if (callbacks.onInsightUpdated) {
            callbacks.onInsightUpdated(newRecord, oldRecord)
          }

          // If client responded, notify coach
          if (!oldRecord.client_response && newRecord.client_response && newRecord.coach_id) {
            await createNotification({
              userId: newRecord.coach_id,
              type: 'insight_response',
              title: `💬 Client Response to "${newRecord.title}"`,
              message: `Your client has responded: "${newRecord.client_response.substring(0, 100)}${newRecord.client_response.length > 100 ? '...' : ''}"`,
              relatedId: newRecord.id,
              relatedType: 'coaching_insight',
              actionUrl: `/coach/insights?clientId=${newRecord.client_id}`,
              actionText: 'View Response',
              priority: 'normal'
            }).catch(err => {
              console.error('Failed to create response notification:', err)
            })
          }
          break

        case 'DELETE':
          // Insight deleted
          if (callbacks.onInsightDeleted) {
            callbacks.onInsightDeleted(oldRecord)
          }
          break
      }

      // General callback for all changes
      if (callbacks.onInsightChange) {
        callbacks.onInsightChange(payload)
      }

    } catch (error) {
      console.error('Error handling insight change:', error)
      this.metrics.errors++
    }
  }

  /**
   * Handle invitation status changes
   */
  async handleInvitationChange(payload, callbacks) {
    console.log('📨 Invitation change:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload

      switch (eventType) {
        case 'INSERT':
          // New invitation created
          if (callbacks.onInvitationCreated) {
            callbacks.onInvitationCreated(newRecord)
          }
          break

        case 'UPDATE':
          // Invitation status changed
          if (callbacks.onInvitationUpdated) {
            callbacks.onInvitationUpdated(newRecord, oldRecord)
          }

          // Handle status changes
          if (oldRecord.status !== newRecord.status) {
            switch (newRecord.status) {
              case 'accepted':
                if (callbacks.onInvitationAccepted) {
                  callbacks.onInvitationAccepted(newRecord)
                }
                
                // Create notification for coach
                await createNotification({
                  userId: newRecord.coach_id,
                  type: 'coaching_invitation',
                  title: '✅ Invitation Accepted',
                  message: `Your coaching invitation has been accepted! You now have a new client.`,
                  relatedId: newRecord.id,
                  relatedType: 'client_invitation',
                  actionUrl: '/coach/clients',
                  actionText: 'View Clients',
                  priority: 'high'
                }).catch(err => {
                  console.error('Failed to create acceptance notification:', err)
                })
                break

              case 'declined':
                if (callbacks.onInvitationDeclined) {
                  callbacks.onInvitationDeclined(newRecord)
                }
                
                // Create notification for coach
                await createNotification({
                  userId: newRecord.coach_id,
                  type: 'coaching_invitation',
                  title: '❌ Invitation Declined',
                  message: `Your coaching invitation was declined.`,
                  relatedId: newRecord.id,
                  relatedType: 'client_invitation',
                  actionUrl: '/coach/invitations',
                  actionText: 'View Invitations',
                  priority: 'normal'
                }).catch(err => {
                  console.error('Failed to create decline notification:', err)
                })
                break

              case 'expired':
                if (callbacks.onInvitationExpired) {
                  callbacks.onInvitationExpired(newRecord)
                }
                break
            }
          }
          break

        case 'DELETE':
          // Invitation deleted
          if (callbacks.onInvitationDeleted) {
            callbacks.onInvitationDeleted(oldRecord)
          }
          break
      }

      // General callback for all changes
      if (callbacks.onInvitationChange) {
        callbacks.onInvitationChange(payload)
      }

    } catch (error) {
      console.error('Error handling invitation change:', error)
      this.metrics.errors++
    }
  }

  /**
   * Handle client workout activity
   */
  async handleClientWorkoutActivity(payload, callbacks) {
    console.log('🏋️ Client workout activity:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload

      switch (eventType) {
        case 'INSERT':
          // New workout started
          if (callbacks.onWorkoutStarted) {
            callbacks.onWorkoutStarted(newRecord)
          }
          break

        case 'UPDATE':
          // Workout updated (completed, etc.)
          if (callbacks.onWorkoutUpdated) {
            callbacks.onWorkoutUpdated(newRecord, oldRecord)
          }

          // Check if workout was completed
          if (!oldRecord.completed_at && newRecord.completed_at) {
            if (callbacks.onWorkoutCompleted) {
              callbacks.onWorkoutCompleted(newRecord)
            }
          }
          break
      }

      // General callback for all workout activity
      if (callbacks.onClientActivity) {
        callbacks.onClientActivity({
          type: 'workout',
          event: eventType,
          data: newRecord || oldRecord,
          timestamp: new Date().toISOString()
        })
      }

    } catch (error) {
      console.error('Error handling client workout activity:', error)
      this.metrics.errors++
    }
  }

  /**
   * Handle client exercise activity
   */
  async handleClientExerciseActivity(payload, clientIds, callbacks) {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload
      const record = newRecord || oldRecord

      // Verify this exercise belongs to one of our clients
      if (record?.workout_log_id) {
        // We could do additional verification here if needed
        // For now, we'll trust the RLS policies to filter appropriately
        
        if (callbacks.onExerciseActivity) {
          callbacks.onExerciseActivity({
            type: 'exercise',
            event: eventType,
            data: record,
            timestamp: new Date().toISOString()
          })
        }

        // General client activity callback
        if (callbacks.onClientActivity) {
          callbacks.onClientActivity({
            type: 'exercise',
            event: eventType,
            data: record,
            timestamp: new Date().toISOString()
          })
        }
      }

    } catch (error) {
      console.error('Error handling client exercise activity:', error)
      this.metrics.errors++
    }
  }

  /**
   * Handle program activity
   */
  async handleProgramActivity(payload, callbacks) {
    console.log('📋 Program activity:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload

      if (callbacks.onProgramActivity) {
        callbacks.onProgramActivity({
          type: 'program',
          event: eventType,
          data: newRecord || oldRecord,
          timestamp: new Date().toISOString()
        })
      }

      // General client activity callback
      if (callbacks.onClientActivity) {
        callbacks.onClientActivity({
          type: 'program',
          event: eventType,
          data: newRecord || oldRecord,
          timestamp: new Date().toISOString()
        })
      }

    } catch (error) {
      console.error('Error handling program activity:', error)
      this.metrics.errors++
    }
  }

  /**
   * Handle coach-client relationship changes
   */
  async handleRelationshipChange(payload, callbacks) {
    console.log('🤝 Relationship change:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload

      switch (eventType) {
        case 'INSERT':
          // New relationship created
          if (callbacks.onRelationshipCreated) {
            callbacks.onRelationshipCreated(newRecord)
          }
          break

        case 'UPDATE':
          // Relationship updated
          if (callbacks.onRelationshipUpdated) {
            callbacks.onRelationshipUpdated(newRecord, oldRecord)
          }

          // Handle status changes
          if (oldRecord.status !== newRecord.status) {
            switch (newRecord.status) {
              case 'active':
                if (callbacks.onRelationshipActivated) {
                  callbacks.onRelationshipActivated(newRecord)
                }
                break

              case 'terminated':
                if (callbacks.onRelationshipTerminated) {
                  callbacks.onRelationshipTerminated(newRecord)
                }
                break
            }
          }
          break

        case 'DELETE':
          // Relationship deleted
          if (callbacks.onRelationshipDeleted) {
            callbacks.onRelationshipDeleted(oldRecord)
          }
          break
      }

      // General callback for all relationship changes
      if (callbacks.onRelationshipChange) {
        callbacks.onRelationshipChange(payload)
      }

    } catch (error) {
      console.error('Error handling relationship change:', error)
      this.metrics.errors++
    }
  }

  /**
   * Unsubscribe from a specific channel
   */
  unsubscribe(channelName) {
    const subscription = this.subscriptions.get(channelName)
    if (subscription) {
      console.log(`📡 Unsubscribing from: ${channelName}`)
      supabase.removeChannel(subscription)
      this.subscriptions.delete(channelName)
      this.callbacks.delete(channelName)
      this.connectionStatus.delete(channelName)
      
      if (this.connectionStatus.get(channelName) === 'SUBSCRIBED') {
        this.metrics.activeSubscriptions--
      }
    }
  }

  /**
   * Unsubscribe from all channels
   */
  unsubscribeAll() {
    console.log('📡 Unsubscribing from all coaching channels')
    
    for (const [channelName] of this.subscriptions) {
      this.unsubscribe(channelName)
    }
    
    this.metrics.activeSubscriptions = 0
  }

  /**
   * Get subscription status
   */
  getSubscriptionStatus(channelName) {
    return this.connectionStatus.get(channelName) || 'NOT_FOUND'
  }

  /**
   * Get all subscription statuses
   */
  getAllSubscriptionStatuses() {
    const statuses = {}
    for (const [channelName, status] of this.connectionStatus) {
      statuses[channelName] = status
    }
    return statuses
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      subscriptionNames: Array.from(this.subscriptions.keys()),
      connectionStatuses: this.getAllSubscriptionStatuses()
    }
  }

  /**
   * Health check for all subscriptions
   */
  async healthCheck() {
    const results = {}
    
    for (const [channelName] of this.subscriptions) {
      const status = this.connectionStatus.get(channelName)
      results[channelName] = {
        status,
        healthy: status === 'SUBSCRIBED',
        lastCheck: new Date().toISOString()
      }
    }
    
    return results
  }
}

// Global instance
const realtimeCoachingManager = new RealtimeCoachingManager()

export default realtimeCoachingManager

/**
 * Convenience functions for common use cases
 */

/**
 * Subscribe to all coaching-related real-time updates for a coach
 * @param {string} coachId - Coach user ID
 * @param {Array} clientIds - Array of client IDs
 * @param {Object} callbacks - Event callbacks
 * @returns {Promise<Array>} Array of subscription objects
 */
export async function subscribeToCoachingUpdates(coachId, clientIds = [], callbacks = {}) {
  const subscriptions = []

  try {
    // Subscribe to invitations
    const invitationSub = await realtimeCoachingManager.subscribeToInvitations(coachId, {
      onInvitationAccepted: callbacks.onInvitationAccepted,
      onInvitationDeclined: callbacks.onInvitationDeclined,
      onInvitationExpired: callbacks.onInvitationExpired,
      onInvitationChange: callbacks.onInvitationChange
    })
    if (invitationSub) subscriptions.push(invitationSub)

    // Subscribe to client activity
    const activitySub = await realtimeCoachingManager.subscribeToClientActivity(coachId, clientIds, {
      onWorkoutCompleted: callbacks.onWorkoutCompleted,
      onClientActivity: callbacks.onClientActivity,
      onRelationshipChange: callbacks.onRelationshipChange
    })
    if (activitySub) subscriptions.push(activitySub)

    return subscriptions
  } catch (error) {
    console.error('Failed to subscribe to coaching updates:', error)
    throw error
  }
}

/**
 * Subscribe to client-side coaching updates
 * @param {string} clientId - Client user ID
 * @param {Object} callbacks - Event callbacks
 * @returns {Promise<Object>} Subscription object
 */
export async function subscribeToClientCoachingUpdates(clientId, callbacks = {}) {
  try {
    // Subscribe to insights for this client
    return await realtimeCoachingManager.subscribeToInsights(clientId, {
      onInsightCreated: callbacks.onInsightReceived,
      onInsightUpdated: callbacks.onInsightUpdated,
      onInsightChange: callbacks.onInsightChange
    })
  } catch (error) {
    console.error('Failed to subscribe to client coaching updates:', error)
    throw error
  }
}

/**
 * Clean up all coaching subscriptions
 */
export function cleanupCoachingSubscriptions() {
  realtimeCoachingManager.unsubscribeAll()
}

/**
 * Get coaching subscription metrics
 */
export function getCoachingSubscriptionMetrics() {
  return realtimeCoachingManager.getMetrics()
}