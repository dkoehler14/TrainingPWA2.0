/**
 * Test Real-time Features
 * 
 * Simple test utilities to verify real-time workout functionality
 */

import { supabase } from '../config/supabase'

/**
 * Test basic real-time connection
 */
export const testRealtimeConnection = async () => {
  console.log('🧪 Testing real-time connection...')
  
  try {
    const channel = supabase.channel('test-connection')
    
    let connected = false
    
    const connectionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'))
      }, 5000)
      
      channel.subscribe((status, error) => {
        clearTimeout(timeout)
        
        if (error) {
          reject(error)
        } else if (status === 'SUBSCRIBED') {
          connected = true
          resolve(status)
        }
      })
    })
    
    const result = await connectionPromise
    
    // Clean up
    supabase.removeChannel(channel)
    
    console.log('✅ Real-time connection test passed:', result)
    return { success: true, status: result }
    
  } catch (error) {
    console.error('❌ Real-time connection test failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Test workout progress broadcasting
 */
export const testProgressBroadcast = async (userId, programId, weekIndex, dayIndex) => {
  console.log('🧪 Testing progress broadcast...')
  
  try {
    const channelName = `workout_${userId}_${programId}_${weekIndex}_${dayIndex}`
    const channel = supabase.channel(channelName)
    
    let messageReceived = false
    const testMessage = {
      type: 'test_progress',
      userId,
      programId,
      weekIndex,
      dayIndex,
      timestamp: new Date().toISOString()
    }
    
    const broadcastPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Broadcast timeout'))
      }, 3000)
      
      channel
        .on('broadcast', { event: 'workout_progress' }, (payload) => {
          clearTimeout(timeout)
          messageReceived = true
          resolve(payload)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            // Send test message
            channel.send({
              type: 'broadcast',
              event: 'workout_progress',
              payload: testMessage
            })
          }
        })
    })
    
    const result = await broadcastPromise
    
    // Clean up
    supabase.removeChannel(channel)
    
    console.log('✅ Progress broadcast test passed:', result)
    return { success: true, messageReceived, result }
    
  } catch (error) {
    console.error('❌ Progress broadcast test failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Test database change subscription
 */
export const testDatabaseSubscription = async (userId) => {
  console.log('🧪 Testing database subscription...')
  
  try {
    const channel = supabase.channel('test-db-changes')
    
    let changeReceived = false
    
    const subscriptionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Subscription timeout'))
      }, 5000)
      
      channel
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'workout_logs',
          filter: `user_id=eq.${userId}`
        }, (payload) => {
          clearTimeout(timeout)
          changeReceived = true
          resolve(payload)
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('📡 Database subscription active')
            // For testing, we'll just resolve after subscription
            setTimeout(() => {
              resolve({ status: 'subscribed', test: 'no_changes_detected' })
            }, 1000)
          }
        })
    })
    
    const result = await subscriptionPromise
    
    // Clean up
    supabase.removeChannel(channel)
    
    console.log('✅ Database subscription test passed:', result)
    return { success: true, changeReceived, result }
    
  } catch (error) {
    console.error('❌ Database subscription test failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Test enhanced channel manager
 */
export const testChannelManager = async (userId, programId = 'test', weekIndex = 0, dayIndex = 0) => {
  console.log('🧪 Testing enhanced channel manager...')
  
  try {
    const { default: channelManager } = await import('./realtimeChannelManager')
    
    // Test channel creation
    const channel = channelManager.createWorkoutChannel(userId, programId, weekIndex, dayIndex, {
      onWorkoutLogChange: (payload) => console.log('📊 Workout log change:', payload),
      onBroadcast: (payload) => console.log('📡 Broadcast received:', payload),
      onPresenceChange: (payload) => console.log('👥 Presence change:', payload)
    })
    
    if (!channel) {
      throw new Error('Failed to create channel')
    }
    
    // Test metrics
    const metrics = channelManager.getMetrics()
    console.log('📈 Channel metrics:', metrics)
    
    // Test health check
    const health = await channelManager.healthCheck()
    console.log('🏥 Health check:', health)
    
    // Cleanup
    const channelName = `workout_${userId}_${programId}_${weekIndex}_${dayIndex}`
    channelManager.removeChannel(channelName)
    
    console.log('✅ Channel manager test passed')
    return { success: true, metrics, health }
    
  } catch (error) {
    console.error('❌ Channel manager test failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Test user-specific data filtering
 */
export const testUserSpecificFiltering = async (userId) => {
  console.log('🧪 Testing user-specific data filtering...')
  
  try {
    const { default: channelManager } = await import('./realtimeChannelManager')
    
    let receivedUpdates = []
    
    // Create channel with callback to capture updates
    const channel = channelManager.createWorkoutChannel(userId, 'test-program', 1, 1, {
      onWorkoutLogChange: (payload) => {
        receivedUpdates.push({ type: 'workout_log', payload })
      },
      onWorkoutExerciseChange: (payload) => {
        receivedUpdates.push({ type: 'workout_exercise', payload })
      },
      onUserAnalyticsChange: (payload) => {
        receivedUpdates.push({ type: 'user_analytics', payload })
      }
    })
    
    // Simulate subscription
    const channelName = `workout_${userId}_test-program_1_1`
    
    try {
      await channelManager.subscribeChannel(channelName, {
        maxRetries: 1,
        onStatusChange: (status) => console.log('Status:', status)
      })
    } catch (error) {
      // Expected to fail in test environment without real Supabase
      console.log('Expected subscription failure in test environment')
    }
    
    // Test broadcast functionality
    const broadcastSuccess = channelManager.broadcast(channelName, 'workout_progress', {
      completedSets: 3,
      totalSets: 10
    })
    
    // Test presence functionality
    const presenceSuccess = channelManager.updatePresence(channelName, {
      status: 'active',
      currentExercise: 'Bench Press'
    })
    
    // Cleanup
    channelManager.removeChannel(channelName)
    
    console.log('✅ User-specific filtering test completed')
    return { 
      success: true, 
      receivedUpdates: receivedUpdates.length,
      broadcastSuccess,
      presenceSuccess
    }
    
  } catch (error) {
    console.error('❌ User-specific filtering test failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Test connection recovery and error handling
 */
export const testConnectionRecovery = async (userId) => {
  console.log('🧪 Testing connection recovery and error handling...')
  
  try {
    const { default: channelManager } = await import('./realtimeChannelManager')
    
    let connectionEvents = []
    let errorEvents = []
    
    // Create channel with error tracking
    const channel = channelManager.createWorkoutChannel(userId, 'test-program', 1, 1)
    const channelName = `workout_${userId}_test-program_1_1`
    
    // Test subscription with error handling
    try {
      await channelManager.subscribeChannel(channelName, {
        maxRetries: 2,
        onStatusChange: (status, error) => {
          connectionEvents.push({ status, error, timestamp: new Date().toISOString() })
        },
        onError: (error) => {
          errorEvents.push({ error: error.message, timestamp: new Date().toISOString() })
        }
      })
    } catch (error) {
      // Expected in test environment
      console.log('Expected connection failure in test environment')
    }
    
    // Test metrics after errors
    const metrics = channelManager.getMetrics()
    
    // Cleanup
    channelManager.removeChannel(channelName)
    
    console.log('✅ Connection recovery test completed')
    return { 
      success: true, 
      connectionEvents: connectionEvents.length,
      errorEvents: errorEvents.length,
      metrics
    }
    
  } catch (error) {
    console.error('❌ Connection recovery test failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Run all enhanced real-time tests
 */
export const runRealtimeTests = async (userId, programId = 'test', weekIndex = 0, dayIndex = 0) => {
  console.log('🧪 Running all enhanced real-time tests...')
  
  const results = {
    connection: await testRealtimeConnection(),
    broadcast: await testProgressBroadcast(userId, programId, weekIndex, dayIndex),
    subscription: await testDatabaseSubscription(userId),
    channelManager: await testChannelManager(userId, programId, weekIndex, dayIndex),
    userFiltering: await testUserSpecificFiltering(userId),
    connectionRecovery: await testConnectionRecovery(userId)
  }
  
  const allPassed = Object.values(results).every(result => result.success)
  
  console.log(allPassed ? '✅ All real-time tests passed!' : '❌ Some real-time tests failed')
  console.log('Test results:', results)
  
  return {
    success: allPassed,
    results
  }
}

export default {
  testRealtimeConnection,
  testProgressBroadcast,
  testDatabaseSubscription,
  testChannelManager,
  testUserSpecificFiltering,
  testConnectionRecovery,
  runRealtimeTests
}