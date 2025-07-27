/**
 * Real-time Channel Manager Tests
 * 
 * Tests for the enhanced real-time channel management system
 */

import { RealtimeChannelManager } from '../realtimeChannelManager'
import { supabase } from '../../config/supabase'

// Mock Supabase
jest.mock('../../config/supabase', () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn()
  }
}))

describe('RealtimeChannelManager', () => {
  let channelManager
  let mockChannel

  beforeEach(() => {
    channelManager = new RealtimeChannelManager()
    
    mockChannel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
      send: jest.fn(),
      track: jest.fn(),
      presenceState: jest.fn().mockReturnValue({}),
      unsubscribe: jest.fn()
    }
    
    supabase.channel.mockReturnValue(mockChannel)
    jest.clearAllMocks()
  })

  describe('Channel Creation', () => {
    test('should create a new workout channel', () => {
      const userId = 'user-123'
      const programId = 'program-456'
      const weekIndex = 1
      const dayIndex = 2

      const channel = channelManager.createWorkoutChannel(userId, programId, weekIndex, dayIndex)

      expect(supabase.channel).toHaveBeenCalledWith(
        `workout_${userId}_${programId}_${weekIndex}_${dayIndex}`,
        expect.objectContaining({
          config: expect.objectContaining({
            presence: { key: userId }
          })
        })
      )

      expect(channel).toBe(mockChannel)
      expect(channelManager.metrics.totalChannels).toBe(1)
    })

    test('should reuse existing channel', () => {
      const userId = 'user-123'
      const programId = 'program-456'
      const weekIndex = 1
      const dayIndex = 2

      // Create channel twice
      const channel1 = channelManager.createWorkoutChannel(userId, programId, weekIndex, dayIndex)
      const channel2 = channelManager.createWorkoutChannel(userId, programId, weekIndex, dayIndex)

      expect(supabase.channel).toHaveBeenCalledTimes(1)
      expect(channel1).toBe(channel2)
      expect(channelManager.metrics.totalChannels).toBe(1)
    })

    test('should set up all required subscriptions', () => {
      const userId = 'user-123'
      const programId = 'program-456'
      const weekIndex = 1
      const dayIndex = 2

      channelManager.createWorkoutChannel(userId, programId, weekIndex, dayIndex)

      // Should set up multiple subscriptions
      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'workout_logs',
          filter: `user_id=eq.${userId} AND program_id=eq.${programId} AND week_index=eq.${weekIndex} AND day_index=eq.${dayIndex}`
        }),
        expect.any(Function)
      )

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'workout_log_exercises'
        }),
        expect.any(Function)
      )

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'user_analytics',
          filter: `user_id=eq.${userId}`
        }),
        expect.any(Function)
      )

      // Should set up broadcast handlers
      expect(mockChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'workout_progress' },
        expect.any(Function)
      )

      // Should set up presence handlers
      expect(mockChannel.on).toHaveBeenCalledWith(
        'presence',
        { event: 'sync' },
        expect.any(Function)
      )
    })
  })

  describe('Channel Subscription', () => {
    test('should subscribe to channel successfully', async () => {
      const channelName = 'workout_user-123_program-456_1_2'
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 2)
      
      // Mock successful subscription
      mockChannel.subscribe.mockImplementation((callback) => {
        setTimeout(() => callback('SUBSCRIBED'), 0)
      })

      const result = await channelManager.subscribeChannel(channelName)

      expect(result).toBe(mockChannel)
      expect(channelManager.metrics.activeChannels).toBe(1)
    })

    test('should handle subscription errors with retry', async () => {
      const channelName = 'workout_user-123_program-456_1_2'
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 2)
      
      let callCount = 0
      mockChannel.subscribe.mockImplementation((callback) => {
        callCount++
        if (callCount === 1) {
          setTimeout(() => callback('CHANNEL_ERROR', new Error('Connection failed')), 0)
        } else {
          setTimeout(() => callback('SUBSCRIBED'), 0)
        }
      })

      const result = await channelManager.subscribeChannel(channelName, { maxRetries: 2 })

      expect(result).toBe(mockChannel)
      expect(channelManager.metrics.reconnections).toBe(1)
    })

    test('should fail after max retries', async () => {
      const channelName = 'workout_user-123_program-456_1_2'
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 2)
      
      mockChannel.subscribe.mockImplementation((callback) => {
        setTimeout(() => callback('CHANNEL_ERROR', new Error('Connection failed')), 0)
      })

      await expect(
        channelManager.subscribeChannel(channelName, { maxRetries: 1 })
      ).rejects.toThrow('Connection failed')

      expect(channelManager.metrics.errors).toBeGreaterThan(0)
    })
  })

  describe('Broadcasting', () => {
    test('should broadcast message successfully', () => {
      const channelName = 'workout_user-123_program-456_1_2'
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 2)
      channelManager.connectionStatus.set(channelName, 'SUBSCRIBED')

      const success = channelManager.broadcast(channelName, 'workout_progress', {
        completedSets: 5,
        totalSets: 10
      })

      expect(success).toBe(true)
      expect(mockChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'workout_progress',
        payload: expect.objectContaining({
          completedSets: 5,
          totalSets: 10,
          timestamp: expect.any(String)
        })
      })
    })

    test('should fail to broadcast if channel not subscribed', () => {
      const channelName = 'workout_user-123_program-456_1_2'
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 2)
      // Don't set status to SUBSCRIBED

      const success = channelManager.broadcast(channelName, 'workout_progress', {
        completedSets: 5,
        totalSets: 10
      })

      expect(success).toBe(false)
      expect(mockChannel.send).not.toHaveBeenCalled()
    })
  })

  describe('Presence Management', () => {
    test('should update presence successfully', () => {
      const channelName = 'workout_user-123_program-456_1_2'
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 2)
      channelManager.connectionStatus.set(channelName, 'SUBSCRIBED')

      const success = channelManager.updatePresence(channelName, {
        status: 'active',
        currentExercise: 'Bench Press'
      })

      expect(success).toBe(true)
      expect(mockChannel.track).toHaveBeenCalledWith({
        status: 'active',
        currentExercise: 'Bench Press',
        online_at: expect.any(String)
      })
    })

    test('should get presence state', () => {
      const channelName = 'workout_user-123_program-456_1_2'
      const userId = 'user-123'
      const programId = 'program-456'
      
      const mockPresence = { 'user-123': { status: 'active' } }
      mockChannel.presenceState.mockReturnValue(mockPresence)
      
      channelManager.createWorkoutChannel(userId, programId, 1, 2)

      const presence = channelManager.getPresence(channelName)

      expect(presence).toBe(mockPresence)
      expect(mockChannel.presenceState).toHaveBeenCalled()
    })
  })

  describe('Channel Cleanup', () => {
    test('should remove channel successfully', () => {
      const channelName = 'workout_user-123_program-456_1_2'
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 2)
      channelManager.connectionStatus.set(channelName, 'SUBSCRIBED')
      channelManager.metrics.activeChannels = 1

      channelManager.removeChannel(channelName)

      expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel)
      expect(channelManager.channels.has(channelName)).toBe(false)
      expect(channelManager.connectionStatus.has(channelName)).toBe(false)
    })

    test('should remove all channels', () => {
      // Create multiple channels
      channelManager.createWorkoutChannel('user-1', 'program-1', 1, 1)
      channelManager.createWorkoutChannel('user-2', 'program-2', 2, 2)

      expect(channelManager.channels.size).toBe(2)

      channelManager.removeAllChannels()

      expect(channelManager.channels.size).toBe(0)
      expect(channelManager.metrics.activeChannels).toBe(0)
      expect(supabase.removeChannel).toHaveBeenCalledTimes(2)
    })
  })

  describe('Metrics and Health Check', () => {
    test('should track metrics correctly', () => {
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 1)
      channelManager.createWorkoutChannel(userId, programId, 1, 2)

      const metrics = channelManager.getMetrics()

      expect(metrics.totalChannels).toBe(2)
      expect(metrics.totalSubscriptions).toBeGreaterThan(0)
      expect(metrics.channelNames).toHaveLength(2)
    })

    test('should perform health check', async () => {
      const channelName1 = 'workout_user-123_program-456_1_1'
      const channelName2 = 'workout_user-123_program-456_1_2'
      
      channelManager.createWorkoutChannel('user-123', 'program-456', 1, 1)
      channelManager.createWorkoutChannel('user-123', 'program-456', 1, 2)
      
      channelManager.connectionStatus.set(channelName1, 'SUBSCRIBED')
      channelManager.connectionStatus.set(channelName2, 'CHANNEL_ERROR')

      const healthCheck = await channelManager.healthCheck()

      expect(healthCheck[channelName1].healthy).toBe(true)
      expect(healthCheck[channelName2].healthy).toBe(false)
      expect(healthCheck[channelName1].status).toBe('SUBSCRIBED')
      expect(healthCheck[channelName2].status).toBe('CHANNEL_ERROR')
    })
  })

  describe('Callback Handling', () => {
    test('should call workout log change callback', () => {
      const onWorkoutLogChange = jest.fn()
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 1, {
        onWorkoutLogChange
      })

      // Find the workout log subscription callback
      const workoutLogCall = mockChannel.on.mock.calls.find(call => 
        call[1]?.table === 'workout_logs'
      )
      
      expect(workoutLogCall).toBeDefined()
      
      // Simulate a database change
      const mockPayload = {
        eventType: 'UPDATE',
        new: { id: 'log-123', user_id: userId },
        old: null
      }
      
      workoutLogCall[2](mockPayload)

      expect(onWorkoutLogChange).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockPayload,
          table: 'workout_logs',
          timestamp: expect.any(String)
        })
      )
    })

    test('should call broadcast callback', () => {
      const onBroadcast = jest.fn()
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 1, {
        onBroadcast
      })

      // Find the broadcast subscription callback
      const broadcastCall = mockChannel.on.mock.calls.find(call => 
        call[0] === 'broadcast' && call[1]?.event === 'workout_progress'
      )
      
      expect(broadcastCall).toBeDefined()
      
      // Simulate a broadcast message
      const mockPayload = {
        payload: { completedSets: 5, totalSets: 10 }
      }
      
      broadcastCall[2](mockPayload)

      expect(onBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workout_progress',
          payload: mockPayload.payload,
          timestamp: expect.any(String)
        })
      )
    })

    test('should call presence change callback', () => {
      const onPresenceChange = jest.fn()
      const userId = 'user-123'
      const programId = 'program-456'
      
      channelManager.createWorkoutChannel(userId, programId, 1, 1, {
        onPresenceChange
      })

      // Find the presence sync callback
      const presenceCall = mockChannel.on.mock.calls.find(call => 
        call[0] === 'presence' && call[1]?.event === 'sync'
      )
      
      expect(presenceCall).toBeDefined()
      
      // Mock presence state
      mockChannel.presenceState.mockReturnValue({
        'user-123': { status: 'active' },
        'user-456': { status: 'active' }
      })
      
      // Simulate presence sync
      presenceCall[2]()

      expect(onPresenceChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'sync',
          activeUsers: 2,
          timestamp: expect.any(String)
        })
      )
    })
  })
})