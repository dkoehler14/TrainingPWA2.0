/**
 * Workout Real-time Utilities
 * 
 * Utility functions for managing real-time workout updates,
 * connection recovery, and optimistic updates.
 */

import { supabase } from '../config/supabase'

/**
 * Create a real-time subscription for workout logs
 */
export const createWorkoutLogSubscription = (userId, programId, weekIndex, dayIndex, callbacks = {}) => {
  const {
    onUpdate = () => {},
    onError = () => {},
    onConnectionChange = () => {}
  } = callbacks

  const channelName = `workout_log_${userId}_${programId}_${weekIndex}_${dayIndex}`
  
  const channel = supabase.channel(channelName)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'workout_logs',
      filter: `user_id=eq.${userId} AND program_id=eq.${programId} AND week_index=eq.${weekIndex} AND day_index=eq.${dayIndex}`
    }, (payload) => {
      console.log('📡 Workout log change:', payload)
      onUpdate(payload)
    })
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'workout_log_exercises'
    }, (payload) => {
      console.log('📡 Workout exercise change:', payload)
      onUpdate(payload)
    })
    .subscribe((status, error) => {
      if (error) {
        console.error('Real-time subscription error:', error)
        onError(error)
      } else {
        console.log('Real-time subscription status:', status)
        onConnectionChange(status === 'SUBSCRIBED')
      }
    })

  return channel
}

/**
 * Broadcast workout progress update
 */
export const broadcastWorkoutProgress = (channel, progressData) => {
  if (!channel) return

  channel.send({
    type: 'broadcast',
    event: 'workout_progress',
    payload: {
      ...progressData,
      timestamp: new Date().toISOString()
    }
  })
}

/**
 * Handle optimistic updates with conflict resolution
 */
export const handleOptimisticUpdate = (currentData, update, conflictResolver = null) => {
  try {
    // Apply optimistic update
    const optimisticData = applyUpdate(currentData, update)
    
    return {
      success: true,
      data: optimisticData,
      needsSync: false
    }
  } catch (error) {
    console.warn('Optimistic update failed:', error)
    
    // If conflict resolver is provided, try to resolve
    if (conflictResolver) {
      try {
        const resolvedData = conflictResolver(currentData, update, error)
        return {
          success: true,
          data: resolvedData,
          needsSync: true
        }
      } catch (resolveError) {
        console.error('Conflict resolution failed:', resolveError)
      }
    }
    
    return {
      success: false,
      error,
      needsSync: true
    }
  }
}

/**
 * Apply update to current data
 */
const applyUpdate = (currentData, update) => {
  const { type, payload } = update
  
  switch (type) {
    case 'set_completion':
      return updateSetCompletion(currentData, payload)
    case 'exercise_added':
      return addExercise(currentData, payload)
    case 'exercise_removed':
      return removeExercise(currentData, payload)
    case 'set_added':
      return addSet(currentData, payload)
    case 'set_removed':
      return removeSet(currentData, payload)
    default:
      console.warn('Unknown update type:', type)
      return currentData
  }
}

/**
 * Update set completion status
 */
const updateSetCompletion = (logData, payload) => {
  const { exerciseIndex, setIndex, completed } = payload
  
  if (!logData[exerciseIndex]) {
    throw new Error(`Exercise at index ${exerciseIndex} not found`)
  }
  
  const newLogData = [...logData]
  newLogData[exerciseIndex] = {
    ...newLogData[exerciseIndex],
    completed: [...newLogData[exerciseIndex].completed]
  }
  
  newLogData[exerciseIndex].completed[setIndex] = completed
  
  return newLogData
}

/**
 * Add exercise to workout
 */
const addExercise = (logData, payload) => {
  const { exercise } = payload
  return [...logData, exercise]
}

/**
 * Remove exercise from workout
 */
const removeExercise = (logData, payload) => {
  const { exerciseIndex } = payload
  return logData.filter((_, index) => index !== exerciseIndex)
}

/**
 * Add set to exercise
 */
const addSet = (logData, payload) => {
  const { exerciseIndex } = payload
  
  if (!logData[exerciseIndex]) {
    throw new Error(`Exercise at index ${exerciseIndex} not found`)
  }
  
  const newLogData = [...logData]
  const exercise = { ...newLogData[exerciseIndex] }
  
  exercise.sets += 1
  exercise.reps = [...exercise.reps, '']
  exercise.weights = [...exercise.weights, '']
  exercise.completed = [...exercise.completed, false]
  
  newLogData[exerciseIndex] = exercise
  
  return newLogData
}

/**
 * Remove set from exercise
 */
const removeSet = (logData, payload) => {
  const { exerciseIndex } = payload
  
  if (!logData[exerciseIndex]) {
    throw new Error(`Exercise at index ${exerciseIndex} not found`)
  }
  
  const newLogData = [...logData]
  const exercise = { ...newLogData[exerciseIndex] }
  
  if (exercise.sets <= 1) {
    throw new Error('Cannot remove the last set')
  }
  
  exercise.sets -= 1
  exercise.reps = exercise.reps.slice(0, -1)
  exercise.weights = exercise.weights.slice(0, -1)
  exercise.completed = exercise.completed.slice(0, -1)
  
  newLogData[exerciseIndex] = exercise
  
  return newLogData
}

/**
 * Sync local data with server data
 */
export const syncWorkoutData = async (userId, programId, weekIndex, dayIndex, localData) => {
  try {
    // Import workoutLogService dynamically to avoid circular dependency
    const { default: workoutLogService } = await import('../services/workoutLogService')
    
    // Get server data
    const serverData = await workoutLogService.getWorkoutLog(userId, programId, weekIndex, dayIndex)
    
    if (!serverData) {
      // No server data, local data is authoritative
      return {
        success: true,
        data: localData,
        conflicts: []
      }
    }
    
    // Compare and resolve conflicts
    const conflicts = detectConflicts(localData, serverData.workout_log_exercises)
    
    if (conflicts.length === 0) {
      // No conflicts, use server data
      return {
        success: true,
        data: transformServerData(serverData.workout_log_exercises),
        conflicts: []
      }
    }
    
    // Resolve conflicts (prefer local changes for now)
    const resolvedData = resolveConflicts(localData, serverData.workout_log_exercises, conflicts)
    
    return {
      success: true,
      data: resolvedData,
      conflicts
    }
  } catch (error) {
    console.error('Sync failed:', error)
    return {
      success: false,
      error,
      data: localData,
      conflicts: []
    }
  }
}

/**
 * Detect conflicts between local and server data
 */
const detectConflicts = (localData, serverData) => {
  const conflicts = []
  
  // Check for exercise count mismatch
  if (localData.length !== serverData.length) {
    conflicts.push({
      type: 'exercise_count_mismatch',
      local: localData.length,
      server: serverData.length
    })
  }
  
  // Check for set completion conflicts
  localData.forEach((localExercise, exerciseIndex) => {
    const serverExercise = serverData[exerciseIndex]
    if (!serverExercise) return
    
    localExercise.completed.forEach((localCompleted, setIndex) => {
      const serverCompleted = serverExercise.completed?.[setIndex]
      if (localCompleted !== serverCompleted) {
        conflicts.push({
          type: 'set_completion_conflict',
          exerciseIndex,
          setIndex,
          local: localCompleted,
          server: serverCompleted
        })
      }
    })
  })
  
  return conflicts
}

/**
 * Resolve conflicts between local and server data
 */
const resolveConflicts = (localData, serverData, conflicts) => {
  // For now, prefer local changes
  // In a more sophisticated implementation, you might:
  // - Show conflict resolution UI to user
  // - Use timestamps to determine which change is newer
  // - Merge changes intelligently
  
  console.log('Resolving conflicts (preferring local):', conflicts)
  return localData
}

/**
 * Transform server data to local format
 */
const transformServerData = (serverExercises) => {
  return serverExercises.map(serverEx => ({
    exerciseId: serverEx.exercise_id,
    sets: serverEx.sets,
    reps: serverEx.reps || [],
    weights: serverEx.weights || [],
    completed: serverEx.completed || [],
    notes: serverEx.notes || '',
    bodyweight: serverEx.bodyweight || '',
    isAdded: serverEx.is_added || false,
    addedType: serverEx.added_type || null,
    originalIndex: serverEx.original_index || -1
  }))
}

/**
 * Connection recovery utility
 */
export const createConnectionRecovery = (reconnectCallback, options = {}) => {
  const {
    maxRetries = 5,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffFactor = 2
  } = options
  
  let retryCount = 0
  let timeoutId = null
  
  const scheduleReconnect = () => {
    if (retryCount >= maxRetries) {
      console.error('Max reconnection attempts reached')
      return false
    }
    
    const delay = Math.min(baseDelay * Math.pow(backoffFactor, retryCount), maxDelay)
    console.log(`Scheduling reconnection attempt ${retryCount + 1}/${maxRetries} in ${delay}ms`)
    
    timeoutId = setTimeout(() => {
      retryCount++
      reconnectCallback()
    }, delay)
    
    return true
  }
  
  const reset = () => {
    retryCount = 0
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }
  
  const cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }
  
  return {
    scheduleReconnect,
    reset,
    cancel,
    getRetryCount: () => retryCount
  }
}

export default {
  createWorkoutLogSubscription,
  broadcastWorkoutProgress,
  handleOptimisticUpdate,
  syncWorkoutData,
  createConnectionRecovery
}