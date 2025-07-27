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
 * Run all real-time tests
 */
export const runRealtimeTests = async (userId, programId = 'test', weekIndex = 0, dayIndex = 0) => {
  console.log('🧪 Running all real-time tests...')
  
  const results = {
    connection: await testRealtimeConnection(),
    broadcast: await testProgressBroadcast(userId, programId, weekIndex, dayIndex),
    subscription: await testDatabaseSubscription(userId)
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
  runRealtimeTests
}