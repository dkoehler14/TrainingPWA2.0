/**
 * Real-time Channel Manager
 * 
 * Centralized management of Supabase real-time channels with:
 * - Channel lifecycle management
 * - User-specific subscriptions
 * - Connection monitoring and recovery
 * - Performance optimization
 */

import { supabase } from '../config/supabase'

/**
 * Channel Manager Class
 */
export class RealtimeChannelManager {
  constructor() {
    this.channels = new Map()
    this.subscriptions = new Map()
    this.connectionStatus = new Map()
    this.metrics = {
      totalChannels: 0,
      activeChannels: 0,
      totalSubscriptions: 0,
      errors: 0,
      reconnections: 0
    }
  }

  /**
   * Create a workout-specific channel for real-time updates
   */
  createWorkoutChannel(userId, programId, weekIndex, dayIndex, options = {}) {
    const channelName = `workout_${userId}_${programId}_${weekIndex}_${dayIndex}`
    
    if (this.channels.has(channelName)) {
      console.log(`📡 Reusing existing channel: ${channelName}`)
      return this.channels.get(channelName)
    }

    console.log(`📡 Creating new workout channel: ${channelName}`)

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userId
        },
        broadcast: {
          self: false // Don't receive own broadcasts
        }
      }
    })

    // Set up workout log subscriptions
    this.setupWorkoutLogSubscription(channel, userId, programId, weekIndex, dayIndex, options)
    
    // Set up workout exercises subscriptions
    this.setupWorkoutExercisesSubscription(channel, userId, options)
    
    // Set up user analytics subscriptions
    this.setupUserAnalyticsSubscription(channel, userId, options)
    
    // Set up broadcast handlers
    this.setupBroadcastHandlers(channel, options)
    
    // Set up presence handlers
    this.setupPresenceHandlers(channel, options)

    this.channels.set(channelName, channel)
    this.connectionStatus.set(channelName, 'CREATED')
    this.metrics.totalChannels++

    return channel
  }

  /**
   * Set up workout log database subscription
   */
  setupWorkoutLogSubscription(channel, userId, programId, weekIndex, dayIndex, options) {
    const { onWorkoutLogChange } = options

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'workout_logs',
      filter: `user_id=eq.${userId} AND program_id=eq.${programId} AND week_index=eq.${weekIndex} AND day_index=eq.${dayIndex}`
    }, (payload) => {
      console.log('📊 Workout log change:', payload)
      
      if (onWorkoutLogChange) {
        onWorkoutLogChange({
          ...payload,
          table: 'workout_logs',
          timestamp: new Date().toISOString()
        })
      }
    })

    this.metrics.totalSubscriptions++
  }

  /**
   * Set up workout exercises database subscription
   */
  setupWorkoutExercisesSubscription(channel, userId, options) {
    const { onWorkoutExerciseChange } = options

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'workout_log_exercises'
    }, async (payload) => {
      console.log('🏋️ Workout exercise change:', payload)
      
      // Verify this exercise belongs to the user's workout
      const { new: newRecord, old: oldRecord } = payload
      const record = newRecord || oldRecord
      
      if (record?.workout_log_id) {
        // Additional verification could be done here if needed
        if (onWorkoutExerciseChange) {
          onWorkoutExerciseChange({
            ...payload,
            table: 'workout_log_exercises',
            timestamp: new Date().toISOString()
          })
        }
      }
    })

    this.metrics.totalSubscriptions++
  }

  /**
   * Set up user analytics database subscription
   */
  setupUserAnalyticsSubscription(channel, userId, options) {
    const { onUserAnalyticsChange } = options

    channel.on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'user_analytics',
      filter: `user_id=eq.${userId}`
    }, (payload) => {
      console.log('📈 User analytics change:', payload)
      
      if (onUserAnalyticsChange) {
        onUserAnalyticsChange({
          ...payload,
          table: 'user_analytics',
          timestamp: new Date().toISOString()
        })
      }
    })

    this.metrics.totalSubscriptions++
  }

  /**
   * Set up broadcast message handlers
   */
  setupBroadcastHandlers(channel, options) {
    const { onBroadcast } = options

    // Workout progress broadcasts
    channel.on('broadcast', { event: 'workout_progress' }, (payload) => {
      console.log('📊 Workout progress broadcast:', payload)
      
      if (onBroadcast) {
        onBroadcast({
          type: 'workout_progress',
          payload: payload.payload,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Set completion broadcasts
    channel.on('broadcast', { event: 'set_completion' }, (payload) => {
      console.log('✅ Set completion broadcast:', payload)
      
      if (onBroadcast) {
        onBroadcast({
          type: 'set_completion',
          payload: payload.payload,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Exercise completion broadcasts
    channel.on('broadcast', { event: 'exercise_completion' }, (payload) => {
      console.log('🏁 Exercise completion broadcast:', payload)
      
      if (onBroadcast) {
        onBroadcast({
          type: 'exercise_completion',
          payload: payload.payload,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Heartbeat broadcasts for connection monitoring
    channel.on('broadcast', { event: 'heartbeat' }, (payload) => {
      console.log('💓 Heartbeat received:', payload)
    })
  }

  /**
   * Set up presence handlers for multi-user awareness
   */
  setupPresenceHandlers(channel, options) {
    const { onPresenceChange } = options

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      console.log('👥 Presence sync:', state)
      
      if (onPresenceChange) {
        onPresenceChange({
          type: 'sync',
          state,
          activeUsers: Object.keys(state).length,
          timestamp: new Date().toISOString()
        })
      }
    })

    channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('👋 User joined:', key, newPresences)
      
      if (onPresenceChange) {
        onPresenceChange({
          type: 'join',
          userId: key,
          presences: newPresences,
          timestamp: new Date().toISOString()
        })
      }
    })

    channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log('👋 User left:', key, leftPresences)
      
      if (onPresenceChange) {
        onPresenceChange({
          type: 'leave',
          userId: key,
          presences: leftPresences,
          timestamp: new Date().toISOString()
        })
      }
    })
  }

  /**
   * Subscribe to a channel with enhanced error handling
   */
  async subscribeChannel(channelName, options = {}) {
    const channel = this.channels.get(channelName)
    if (!channel) {
      throw new Error(`Channel ${channelName} not found`)
    }

    const { onStatusChange, onError, maxRetries = 3 } = options
    let retryCount = 0

    return new Promise((resolve, reject) => {
      const attemptSubscription = () => {
        channel.subscribe((status, error) => {
          console.log(`📡 Channel ${channelName} status: ${status}`)
          
          this.connectionStatus.set(channelName, status)
          
          if (onStatusChange) {
            onStatusChange(status, error)
          }

          if (error) {
            console.error(`❌ Channel ${channelName} error:`, error)
            this.metrics.errors++
            
            if (onError) {
              onError(error)
            }

            // Retry subscription if not at max retries
            if (retryCount < maxRetries) {
              retryCount++
              console.log(`🔄 Retrying subscription for ${channelName} (${retryCount}/${maxRetries})`)
              this.metrics.reconnections++
              
              setTimeout(() => {
                attemptSubscription()
              }, Math.pow(2, retryCount) * 1000) // Exponential backoff
            } else {
              reject(error)
            }
          } else if (status === 'SUBSCRIBED') {
            this.metrics.activeChannels++
            resolve(channel)
          } else if (status === 'CHANNEL_ERROR') {
            reject(new Error(`Channel subscription failed: ${channelName}`))
          }
        })
      }

      attemptSubscription()
    })
  }

  /**
   * Unsubscribe and remove a channel
   */
  removeChannel(channelName) {
    const channel = this.channels.get(channelName)
    if (channel) {
      console.log(`📡 Removing channel: ${channelName}`)
      
      supabase.removeChannel(channel)
      this.channels.delete(channelName)
      this.connectionStatus.delete(channelName)
      
      if (this.connectionStatus.get(channelName) === 'SUBSCRIBED') {
        this.metrics.activeChannels--
      }
    }
  }

  /**
   * Remove all channels
   */
  removeAllChannels() {
    console.log('📡 Removing all channels')
    
    for (const [channelName] of this.channels) {
      this.removeChannel(channelName)
    }
    
    this.metrics.activeChannels = 0
  }

  /**
   * Broadcast message to a specific channel
   */
  broadcast(channelName, event, payload) {
    const channel = this.channels.get(channelName)
    if (channel && this.connectionStatus.get(channelName) === 'SUBSCRIBED') {
      channel.send({
        type: 'broadcast',
        event,
        payload: {
          ...payload,
          timestamp: new Date().toISOString()
        }
      })
      return true
    }
    return false
  }

  /**
   * Update presence for a specific channel
   */
  updatePresence(channelName, presenceData) {
    const channel = this.channels.get(channelName)
    if (channel && this.connectionStatus.get(channelName) === 'SUBSCRIBED') {
      channel.track({
        ...presenceData,
        online_at: new Date().toISOString()
      })
      return true
    }
    return false
  }

  /**
   * Get presence state for a specific channel
   */
  getPresence(channelName) {
    const channel = this.channels.get(channelName)
    if (channel) {
      return channel.presenceState()
    }
    return {}
  }

  /**
   * Get channel status
   */
  getChannelStatus(channelName) {
    return this.connectionStatus.get(channelName) || 'NOT_FOUND'
  }

  /**
   * Get all channel statuses
   */
  getAllChannelStatuses() {
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
      channelNames: Array.from(this.channels.keys()),
      connectionStatuses: this.getAllChannelStatuses()
    }
  }

  /**
   * Health check for all channels
   */
  async healthCheck() {
    const results = {}
    
    for (const [channelName] of this.channels) {
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
const channelManager = new RealtimeChannelManager()

export default channelManager

/**
 * React hook for using the channel manager
 */
export function useRealtimeChannelManager() {
  return channelManager
}

/**
 * Utility function to create a workout channel with standard configuration
 */
export function createWorkoutRealtimeChannel(userId, programId, weekIndex, dayIndex, callbacks = {}) {
  return channelManager.createWorkoutChannel(userId, programId, weekIndex, dayIndex, {
    onWorkoutLogChange: callbacks.onUpdate,
    onWorkoutExerciseChange: callbacks.onUpdate,
    onUserAnalyticsChange: callbacks.onUpdate,
    onBroadcast: callbacks.onBroadcast,
    onPresenceChange: callbacks.onPresenceChange
  })
}