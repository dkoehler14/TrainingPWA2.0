/**
 * Real-time Program Updates Hook
 * 
 * Provides real-time capabilities for program and exercise management:
 * - Live program updates when exercises are modified
 * - Real-time exercise library updates
 * - Program sharing and collaboration features
 * - Exercise replacement notifications
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, isRealtimeDisabled } from '../config/supabase'
import { useAuth } from './useAuth'

export const useRealtimePrograms = (options = {}) => {
  const {
    enabled = true,
    programId = null,
    onProgramUpdate = null,
    onExerciseUpdate = null,
    onProgramShared = null,
    onError = null
  } = options

  const { user } = useAuth()
  const [programs, setPrograms] = useState([])
  const [exercises, setExercises] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState(null)
  
  const programsChannelRef = useRef(null)
  const exercisesChannelRef = useRef(null)
  const programWorkoutsChannelRef = useRef(null)

  /**
   * Handle real-time program updates
   */
  const handleProgramUpdate = useCallback((payload) => {
    console.log('📋 Real-time program update:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload
      
      // Only process updates for user's programs or shared programs
      if (newRecord?.user_id !== user.id && !newRecord?.is_template) {
        return
      }
      
      const updateData = {
        type: 'program',
        eventType,
        data: newRecord || oldRecord,
        oldData: oldRecord,
        timestamp: new Date().toISOString()
      }
      
      setLastUpdate(updateData)
      
      // Update programs state
      setPrograms(current => {
        switch (eventType) {
          case 'INSERT':
            return [...current, newRecord]
          case 'UPDATE':
            return current.map(program => 
              program.id === newRecord.id ? { ...program, ...newRecord } : program
            )
          case 'DELETE':
            return current.filter(program => program.id !== oldRecord.id)
          default:
            return current
        }
      })

      // Check for program sharing events
      if (eventType === 'UPDATE' && newRecord.is_template && !oldRecord?.is_template) {
        const shareData = {
          programId: newRecord.id,
          programName: newRecord.name,
          sharedBy: newRecord.user_id,
          timestamp: new Date().toISOString()
        }
        
        if (onProgramShared) {
          onProgramShared(shareData)
        }
      }

      if (onProgramUpdate) {
        onProgramUpdate(updateData)
      }
    } catch (error) {
      console.error('Error handling program update:', error)
      if (onError) {
        onError(error)
      }
    }
  }, [user?.id, onProgramUpdate, onProgramShared, onError])

  /**
   * Handle real-time program workout updates
   */
  const handleProgramWorkoutUpdate = useCallback((payload) => {
    console.log('🏋️‍♂️ Real-time program workout update:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload
      
      // Only process if it's for a program we're tracking
      if (programId && newRecord?.program_id !== programId && oldRecord?.program_id !== programId) {
        return
      }
      
      const updateData = {
        type: 'program_workout',
        eventType,
        data: newRecord || oldRecord,
        oldData: oldRecord,
        timestamp: new Date().toISOString()
      }
      
      setLastUpdate(updateData)
      
      // Update the specific program's workout structure
      setPrograms(current => {
        return current.map(program => {
          if (program.id === (newRecord?.program_id || oldRecord?.program_id)) {
            const updatedProgram = { ...program }
            
            if (!updatedProgram.program_workouts) {
              updatedProgram.program_workouts = []
            }
            
            switch (eventType) {
              case 'INSERT':
                updatedProgram.program_workouts.push(newRecord)
                break
              case 'UPDATE':
                updatedProgram.program_workouts = updatedProgram.program_workouts.map(workout =>
                  workout.id === newRecord.id ? { ...workout, ...newRecord } : workout
                )
                break
              case 'DELETE':
                updatedProgram.program_workouts = updatedProgram.program_workouts.filter(
                  workout => workout.id !== oldRecord.id
                )
                break
            }
            
            return updatedProgram
          }
          return program
        })
      })

      if (onProgramUpdate) {
        onProgramUpdate(updateData)
      }
    } catch (error) {
      console.error('Error handling program workout update:', error)
      if (onError) {
        onError(error)
      }
    }
  }, [programId, onProgramUpdate, onError])

  /**
   * Handle real-time exercise updates
   */
  const handleExerciseUpdate = useCallback((payload) => {
    console.log('💪 Real-time exercise update:', payload)
    
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload
      
      // Process global exercises and user's custom exercises
      if (!newRecord?.is_global && newRecord?.created_by !== user.id) {
        return
      }
      
      const updateData = {
        type: 'exercise',
        eventType,
        data: newRecord || oldRecord,
        oldData: oldRecord,
        timestamp: new Date().toISOString()
      }
      
      setLastUpdate(updateData)
      
      // Update exercises state
      setExercises(current => {
        switch (eventType) {
          case 'INSERT':
            return [...current, newRecord]
          case 'UPDATE':
            return current.map(exercise => 
              exercise.id === newRecord.id ? { ...exercise, ...newRecord } : exercise
            )
          case 'DELETE':
            return current.filter(exercise => exercise.id !== oldRecord.id)
          default:
            return current
        }
      })

      if (onExerciseUpdate) {
        onExerciseUpdate(updateData)
      }
    } catch (error) {
      console.error('Error handling exercise update:', error)
      if (onError) {
        onError(error)
      }
    }
  }, [user?.id, onExerciseUpdate, onError])

  /**
   * Connect to real-time channels
   */
  const connect = useCallback(async () => {
    if (!enabled || !user?.id || isRealtimeDisabled()) return

    try {
      console.log('🔌 Connecting to real-time program channels')

      // Programs channel - user's programs and templates
      programsChannelRef.current = supabase
        .channel(`programs_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'programs',
            filter: `user_id=eq.${user.id}`
          },
          handleProgramUpdate
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'programs',
            filter: 'is_template=eq.true'
          },
          handleProgramUpdate
        )
        .subscribe((status) => {
          console.log(`📋 Programs channel status: ${status}`)
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
          }
        })

      // Program workouts channel - workout structure changes
      programWorkoutsChannelRef.current = supabase
        .channel(`program_workouts_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'program_workouts'
          },
          handleProgramWorkoutUpdate
        )
        .subscribe((status) => {
          console.log(`🏋️‍♂️ Program workouts channel status: ${status}`)
        })

      // Exercises channel - global and user's custom exercises
      exercisesChannelRef.current = supabase
        .channel(`exercises_${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'exercises',
            filter: 'is_global=eq.true'
          },
          handleExerciseUpdate
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'exercises',
            filter: `created_by=eq.${user.id}`
          },
          handleExerciseUpdate
        )
        .subscribe((status) => {
          console.log(`💪 Exercises channel status: ${status}`)
        })

      console.log('✅ Real-time program channels connected')
    } catch (error) {
      console.error('❌ Failed to connect to real-time program channels:', error)
      if (onError) {
        onError(error)
      }
    }
  }, [enabled, user?.id, handleProgramUpdate, handleProgramWorkoutUpdate, handleExerciseUpdate, onError])

  /**
   * Disconnect from real-time channels
   */
  const disconnect = useCallback(() => {
    console.log('🔌 Disconnecting from real-time program channels')
    
    if (programsChannelRef.current) {
      supabase.removeChannel(programsChannelRef.current)
      programsChannelRef.current = null
    }
    
    if (programWorkoutsChannelRef.current) {
      supabase.removeChannel(programWorkoutsChannelRef.current)
      programWorkoutsChannelRef.current = null
    }
    
    if (exercisesChannelRef.current) {
      supabase.removeChannel(exercisesChannelRef.current)
      exercisesChannelRef.current = null
    }
    
    setIsConnected(false)
  }, [])

  /**
   * Broadcast program update to collaborators
   */
  const broadcastProgramUpdate = useCallback((updateData) => {
    if (isConnected && programsChannelRef.current) {
      programsChannelRef.current.send({
        type: 'broadcast',
        event: 'program_update',
        payload: {
          userId: user.id,
          ...updateData,
          timestamp: new Date().toISOString()
        }
      })
    }
  }, [isConnected, user?.id])

  /**
   * Broadcast exercise replacement
   */
  const broadcastExerciseReplacement = useCallback((replacementData) => {
    if (isConnected && programsChannelRef.current) {
      programsChannelRef.current.send({
        type: 'broadcast',
        event: 'exercise_replacement',
        payload: {
          userId: user.id,
          ...replacementData,
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
    programs,
    exercises,
    isConnected,
    lastUpdate,
    
    // Actions
    connect,
    disconnect,
    broadcastProgramUpdate,
    broadcastExerciseReplacement,
    
    // Setters for external data loading
    setPrograms,
    setExercises
  }
}

/**
 * Hook for real-time program-specific updates
 */
export const useRealtimeProgramUpdates = (programId, options = {}) => {
  return useRealtimePrograms({
    ...options,
    programId
  })
}

/**
 * Hook for real-time exercise library updates
 */
export const useRealtimeExerciseLibrary = (options = {}) => {
  const [newExercises, setNewExercises] = useState([])
  const [updatedExercises, setUpdatedExercises] = useState([])
  
  const handleExerciseUpdate = useCallback((updateData) => {
    if (updateData.eventType === 'INSERT') {
      setNewExercises(current => [updateData.data, ...current.slice(0, 9)]) // Keep last 10
    } else if (updateData.eventType === 'UPDATE') {
      setUpdatedExercises(current => [updateData.data, ...current.slice(0, 9)]) // Keep last 10
    }
    
    if (options.onExerciseUpdate) {
      options.onExerciseUpdate(updateData)
    }
  }, [options])

  const programsHook = useRealtimePrograms({
    ...options,
    onExerciseUpdate: handleExerciseUpdate
  })

  return {
    ...programsHook,
    newExercises,
    updatedExercises,
    clearNewExercises: () => setNewExercises([]),
    clearUpdatedExercises: () => setUpdatedExercises([])
  }
}

export default useRealtimePrograms