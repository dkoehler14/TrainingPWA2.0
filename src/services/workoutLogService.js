/**
 * Workout Log Service for Supabase
 * 
 * Handles workout logging data access with PostgreSQL backend:
 * - CRUD operations for workout logs and exercises
 * - Draft workout management and completion flow
 * - Workout analytics calculation and retrieval
 * - Real-time updates and caching integration
 */

import { supabase } from '../config/supabase'
import { withSupabaseErrorHandling } from '../config/supabase'
import { supabaseCache } from '../api/supabaseCache'

class WorkoutLogService {
  constructor() {
    this.CACHE_TTL = 15 * 60 * 1000 // 15 minutes
    this.DRAFT_CACHE_TTL = 5 * 60 * 1000 // 5 minutes for drafts
    this.PROGRAM_LOGS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes for program logs
    this.EXERCISE_HISTORY_CACHE_TTL = 30 * 60 * 1000 // 30 minutes for exercise history
  }

  /**
   * Create a new workout log
   */
  async createWorkoutLog(userId, workoutData) {
    return withSupabaseErrorHandling(async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .insert({
          user_id: userId,
          program_id: workoutData.programId,
          week_index: workoutData.weekIndex,
          day_index: workoutData.dayIndex,
          name: workoutData.name,
          type: workoutData.type || 'program_workout',
          date: workoutData.date || new Date().toISOString().split('T')[0],
          is_finished: workoutData.isFinished || false,
          is_draft: workoutData.isDraft || false,
          weight_unit: workoutData.weightUnit || 'LB',
          duration: workoutData.duration,
          notes: workoutData.notes
        })
        .select()
        .single()

      if (error) throw error

      // If exercises are provided, create them
      if (workoutData.exercises && workoutData.exercises.length > 0) {
        await this.createWorkoutLogExercises(data.id, workoutData.exercises)
      }

      return data
    }, 'createWorkoutLog')
  }

  /**
   * Create workout log exercises
   */
  async createWorkoutLogExercises(workoutLogId, exercises) {
    return withSupabaseErrorHandling(async () => {
      const exerciseData = exercises.map((ex, index) => {
        // Validate and sanitize exercise data
        const sets = ex.sets && ex.sets !== '' ? Number(ex.sets) : 1
        const exerciseId = ex.exerciseId && ex.exerciseId !== '' ? ex.exerciseId : null
        const bodyweight = ex.bodyweight && ex.bodyweight !== '' ? Number(ex.bodyweight) : null

        // Validate required fields
        if (!exerciseId) {
          throw new Error(`Exercise ID is required for exercise at index ${index}`)
        }

        if (isNaN(sets) || sets <= 0) {
          throw new Error(`Invalid sets value for exercise at index ${index}: ${ex.sets}`)
        }

        // Ensure arrays match the sets count (required by DB constraint)
        const reps = ex.reps || []
        const weights = ex.weights || []
        const completed = ex.completed || []

        // Pad or trim arrays to match sets count
        const paddedReps = [...reps]
        const paddedWeights = [...weights]
        const paddedCompleted = [...completed]

        // Pad with null values for uncompleted sets (preserve empty state)
        while (paddedReps.length < sets) paddedReps.push(null)
        while (paddedWeights.length < sets) paddedWeights.push(null)
        while (paddedCompleted.length < sets) paddedCompleted.push(false)

        // Trim if arrays are too long
        paddedReps.length = sets
        paddedWeights.length = sets
        paddedCompleted.length = sets

        // Convert empty strings to null for database storage (preserve uncompleted state)
        const cleanedReps = paddedReps.map(rep => rep === '' || rep === undefined ? null : rep)
        const cleanedWeights = paddedWeights.map(weight => weight === '' || weight === undefined ? null : weight)

        return {
          workout_log_id: workoutLogId,
          exercise_id: exerciseId,
          sets: sets,
          reps: cleanedReps,
          weights: cleanedWeights,
          completed: paddedCompleted,
          bodyweight: bodyweight,
          notes: ex.notes || '',
          is_added: ex.isAdded || false,
          added_type: ex.addedType || null,
          original_index: ex.originalIndex || -1,
          order_index: index
        }
      })

      const { data, error } = await supabase
        .from('workout_log_exercises')
        .insert(exerciseData)
        .select()

      if (error) throw error
      return data
    }, 'createWorkoutLogExercises')
  }

  /**
   * Get workout log by program, week, and day (with caching)
   */
  async getWorkoutLog(userId, programId, weekIndex, dayIndex) {
    return withSupabaseErrorHandling(async () => {
      const cacheKey = `workout_log_${userId}_${programId}_${weekIndex}_${dayIndex}`

      return supabaseCache.getWithCache(
        cacheKey,
        async () => {
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
                  exercise_type,
                  instructions
                )
              )
            `)
            .eq('user_id', userId)
            .eq('program_id', programId)
            .eq('week_index', weekIndex)
            .eq('day_index', dayIndex)
            .single()

          if (error && error.code !== 'PGRST116') throw error

          // Return null if no workout log found
          if (error && error.code === 'PGRST116') return null

          // Sort exercises by order_index
          if (data?.workout_log_exercises) {
            data.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
          }

          return data
        },
        { ttl: this.CACHE_TTL }
      )
    }, 'getWorkoutLog')
  }

  /**
   * Get all workout logs for a program (with caching)
   */
  async getProgramWorkoutLogs(userId, programId) {
    return withSupabaseErrorHandling(async () => {
      const cacheKey = `program_workout_logs_${userId}_${programId}`

      return supabaseCache.getWithCache(
        cacheKey,
        async () => {
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
            .eq('user_id', userId)
            .eq('program_id', programId)
            .order('week_index', { ascending: true })
            .order('day_index', { ascending: true })

          if (error) throw error

          // Sort exercises within each workout log
          data.forEach(log => {
            if (log.workout_log_exercises) {
              log.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
            }
          })

          return data
        },
        { ttl: this.PROGRAM_LOGS_CACHE_TTL }
      )
    }, 'getProgramWorkoutLogs')
  }

  /**
   * Update workout log (with cache invalidation)
   */
  async updateWorkoutLog(workoutLogId, updates) {
    return withSupabaseErrorHandling(async () => {
      const { data, error } = await supabase
        .from('workout_logs')
        .update({
          name: updates.name,
          is_finished: updates.isFinished,
          is_draft: updates.isDraft,
          completed_date: updates.completedDate,
          duration: updates.duration,
          notes: updates.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', workoutLogId)
        .select()
        .single()

      if (error) throw error

      // Update exercises if provided
      if (updates.exercises) {
        await this.updateWorkoutLogExercises(workoutLogId, updates.exercises)
      }

      // Invalidate related caches
      if (data) {
        const patterns = [
          `workout_log_${data.user_id}_${data.program_id}_${data.week_index}_${data.day_index}`,
          `program_workout_logs_${data.user_id}_${data.program_id}`
        ]
        supabaseCache.invalidate(patterns)
      }

      return data
    }, 'updateWorkoutLog')
  }

  /**
   * Update workout log exercises
   */
  async updateWorkoutLogExercises(workoutLogId, exercises) {
    return withSupabaseErrorHandling(async () => {
      // Delete existing exercises
      await supabase
        .from('workout_log_exercises')
        .delete()
        .eq('workout_log_id', workoutLogId)

      // Insert updated exercises
      if (exercises.length > 0) {
        await this.createWorkoutLogExercises(workoutLogId, exercises)
      }
    }, 'updateWorkoutLogExercises')
  }

  /**
   * Delete workout log
   */
  async deleteWorkoutLog(workoutLogId) {
    return withSupabaseErrorHandling(async () => {
      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('id', workoutLogId)

      if (error) throw error
    }, 'deleteWorkoutLog')
  }

  /**
   * Save workout as draft (single-draft mode)
   */
  async saveDraft(authUserId, exercises, workoutName, existingDraftId = null) {
    return withSupabaseErrorHandling(async () => {
      if (!authUserId || !exercises || exercises.length === 0) {
        throw new Error('Invalid parameters for saving draft')
      }

      // First get the internal user ID from the auth user ID
      // const { data: userData, error: userError } = await supabase
      //   .from('users')
      //   .select('id')
      //   .eq('auth_id', authUserId)
      //   .single()

      // if (userError) throw userError
      // if (!userData) throw new Error('User not found')

      // const internalUserId = userData.id

      // Validate and sanitize exercises data before saving
      const validatedExercises = exercises.map((ex, index) => {
        if (!ex.exerciseId || ex.exerciseId === '') {
          throw new Error(`Exercise ID is required for exercise at index ${index}`)
        }

        // Handle sets - ensure it's a valid positive integer (must be > 0 per DB constraint)
        let sets = 1 // Default to 1 set minimum
        if (ex.sets !== undefined && ex.sets !== null && ex.sets !== '') {
          sets = Number(ex.sets)
          if (isNaN(sets) || sets <= 0) {
            sets = 1 // Ensure at least 1 set
          }
        }

        // Handle bodyweight - ensure it's a valid number or null
        let bodyweight = null
        if (ex.bodyweight !== undefined && ex.bodyweight !== null && ex.bodyweight !== '') {
          const bw = Number(ex.bodyweight)
          if (!isNaN(bw) && bw > 0) {
            bodyweight = bw
          }
        }

        return {
          ...ex,
          sets: sets,
          bodyweight: bodyweight
        }
      })

      const draftData = {
        user_id: authUserId,
        programId: null, // Quick workouts are not tied to a program
        weekIndex: null,
        dayIndex: null,
        name: workoutName || `Quick Workout - ${new Date().toLocaleDateString()}`,
        type: 'quick_workout',
        date: new Date().toISOString().split('T')[0],
        isFinished: false,
        isDraft: true,
        weightUnit: 'LB',
        updated_at: new Date().toISOString()
      }

      let workoutLog

      // Check for existing draft if no ID provided
      if (!existingDraftId) {
        const existingDraft = await this.getSingleDraft(authUserId)
        if (existingDraft) {
          existingDraftId = existingDraft.id
        }
      }

      if (existingDraftId) {
        // Update existing draft
        const { data, error } = await supabase
          .from('workout_logs')
          .update({
            program_id: draftData.programId,
            week_index: draftData.weekIndex,
            day_index: draftData.dayIndex,
            name: draftData.name,
            type: draftData.type,
            date: draftData.date,
            is_finished: draftData.isFinished,
            is_draft: draftData.isDraft,
            weight_unit: draftData.weightUnit,
            updated_at: draftData.updated_at
          })
          .eq('id', existingDraftId)
          .select()
          .single()

        if (error) throw error
        workoutLog = data

        // Update exercises
        await this.updateWorkoutLogExercises(existingDraftId, validatedExercises)
      } else {
        // Clean up any orphaned drafts first
        await this.cleanupAllDrafts(authUserId)

        // Create new draft
        workoutLog = await this.createWorkoutLog(authUserId, {
          ...draftData,
          exercises: validatedExercises
        })
      }

      return workoutLog
    }, 'saveDraft')
  }

  /**
   * Get single draft for user
   */
  async getSingleDraft(authUserId) {
    return withSupabaseErrorHandling(async () => {
      // First get the internal user ID from the auth user ID
      // const { data: userData, error: userError } = await supabase
      //   .from('users')
      //   .select('id')
      //   .eq('auth_id', authUserId)
      //   .single()

      // if (userError) throw userError
      // if (!userData) throw new Error('User not found')

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
        .eq('user_id', authUserId)
        .eq('is_draft', true)
        .eq('type', 'quick_workout')
        .order('updated_at', { ascending: false })
        .limit(1)

      if (error) throw error

      // Return null if no draft found
      if (!data || data.length === 0) return null

      // Get the first (most recent) draft
      const draft = data[0]

      // Sort exercises by order_index
      if (draft?.workout_log_exercises) {
        draft.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
      }

      return draft
    }, 'getSingleDraft')
  }

  /**
   * Load all drafts for user
   */
  async loadDrafts(userId, limit = 5) {
    return withSupabaseErrorHandling(async () => {
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
        .eq('user_id', userId)
        .eq('is_draft', true)
        .eq('type', 'quick_workout')
        .order('updated_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      // Sort exercises within each draft
      data.forEach(draft => {
        if (draft.workout_log_exercises) {
          draft.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })

      return data
    }, 'loadDrafts')
  }

  /**
   * Delete specific draft
   */
  async deleteDraft(authUserId, draftId) {
    return withSupabaseErrorHandling(async () => {
      // First get the internal user ID from the auth user ID
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('auth_id', authUserId)
        .single()

      if (userError) throw userError
      if (!userData) throw new Error('User not found')

      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('id', draftId)
        .eq('user_id', userData.id)
        .eq('is_draft', true)

      if (error) throw error
    }, 'deleteDraft')
  }

  /**
   * Complete draft workout
   */
  async completeDraft(authUserId, draftId, exercises, workoutName) {
    return withSupabaseErrorHandling(async () => {
      // First get the internal user ID from the auth user ID
      // const { data: userData, error: userError } = await supabase
      //   .from('users')
      //   .select('id')
      //   .eq('auth_id', authUserId)
      //   .single()

      // if (userError) throw userError
      // if (!userData) throw new Error('User not found')

      // const internalUserId = userData.id

      const completedData = {
        name: workoutName || `Quick Workout - ${new Date().toLocaleDateString()}`,
        is_draft: false,
        is_finished: true,
        completed_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('workout_logs')
        .update(completedData)
        .eq('id', draftId)
        .eq('user_id', authUserId)
        .select()
        .single()

      if (error) throw error

      // Update exercises if provided
      if (exercises) {
        await this.updateWorkoutLogExercises(draftId, exercises)
      }

      // Update user analytics
      await this.updateUserAnalytics(authUserId, exercises)

      return data
    }, 'completeDraft')
  }

  /**
   * Clean up all drafts for user
   */
  async cleanupAllDrafts(userId) {
    return withSupabaseErrorHandling(async () => {
      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('user_id', userId)
        .eq('is_draft', true)
        .eq('type', 'quick_workout')

      if (error) throw error
    }, 'cleanupAllDrafts')
  }

  /**
   * Clean up old drafts (older than threshold)
   */
  async cleanupOldDrafts(userId, thresholdDays = 7) {
    return withSupabaseErrorHandling(async () => {
      const thresholdDate = new Date()
      thresholdDate.setDate(thresholdDate.getDate() - thresholdDays)

      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('user_id', userId)
        .eq('is_draft', true)
        .lt('updated_at', thresholdDate.toISOString())

      if (error) throw error
    }, 'cleanupOldDrafts')
  }

  /**
   * Get workout history for user
   */
  async getWorkoutHistory(userId, limit = 20, offset = 0) {
    return withSupabaseErrorHandling(async () => {
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
        .eq('user_id', userId)
        .eq('is_finished', true)
        .order('completed_date', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      // Sort exercises within each workout
      data.forEach(workout => {
        if (workout.workout_log_exercises) {
          workout.workout_log_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })

      return data
    }, 'getWorkoutHistory')
  }

  /**
   * Get exercise history for specific exercise (with caching)
   */
  async getExerciseHistory(userId, exerciseId, limit = 50) {
    return withSupabaseErrorHandling(async () => {
      const cacheKey = `exercise_history_${userId}_${exerciseId}_${limit}`

      return supabaseCache.getWithCache(
        cacheKey,
        async () => {
          const { data, error } = await supabase
            .from('workout_log_exercises')
            .select(`
              *,
              workout_logs!inner (
                id,
                user_id,
                completed_date,
                week_index,
                day_index,
                is_finished
              ),
              exercises (
                id,
                name,
                primary_muscle_group,
                exercise_type
              )
            `)
            .eq('exercise_id', exerciseId)
            .eq('workout_logs.user_id', userId)
            .eq('workout_logs.is_finished', true)
            .order('workout_logs(completed_date)', { ascending: false })
            .limit(limit)

          if (error) throw error

          // Transform data to match expected format
          const historyData = []

          data.forEach(logExercise => {
            const workout = logExercise.workout_logs
            const exercise = logExercise.exercises

            // Process each set
            for (let setIndex = 0; setIndex < logExercise.sets; setIndex++) {
              if (logExercise.completed && logExercise.completed[setIndex]) {
                // Safely convert to numbers, handling null, empty strings and invalid values
                const weight = logExercise.weights[setIndex] && logExercise.weights[setIndex] !== '' && logExercise.weights[setIndex] !== null ? Number(logExercise.weights[setIndex]) : 0
                const reps = logExercise.reps[setIndex] && logExercise.reps[setIndex] !== '' && logExercise.reps[setIndex] !== null ? Number(logExercise.reps[setIndex]) : 0
                const bodyweight = logExercise.bodyweight && logExercise.bodyweight !== '' && logExercise.bodyweight !== null ? Number(logExercise.bodyweight) : 0

                // Validate numbers
                const validWeight = isNaN(weight) ? 0 : weight
                const validReps = isNaN(reps) ? 0 : reps
                const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

                let totalWeight = validWeight
                let displayWeight = validWeight

                if (exercise.exercise_type === 'Bodyweight') {
                  totalWeight = validBodyweight
                  displayWeight = validBodyweight
                } else if (exercise.exercise_type === 'Bodyweight Loadable' && validBodyweight > 0) {
                  totalWeight = validBodyweight + validWeight
                  displayWeight = `${validBodyweight} + ${validWeight} = ${totalWeight}`
                }

                historyData.push({
                  date: new Date(workout.completed_date),
                  week: (workout.week_index || 0) + 1,
                  day: (workout.day_index || 0) + 1,
                  set: setIndex + 1,
                  weight: validWeight,
                  totalWeight: totalWeight,
                  displayWeight: displayWeight,
                  reps: validReps,
                  completed: true,
                  bodyweight: validBodyweight,
                  exerciseType: exercise.exercise_type
                })
              }
            }
          })

          return historyData
        },
        { ttl: this.EXERCISE_HISTORY_CACHE_TTL }
      )
    }, 'getExerciseHistory')
  }

  /**
   * Update user analytics after workout completion
   */
  async updateUserAnalytics(userId, exercises) {
    return withSupabaseErrorHandling(async () => {
      if (!exercises || exercises.length === 0) return

      const analyticsUpdates = []

      exercises.forEach(exercise => {
        if (!exercise.completed || exercise.completed.length === 0) return

        let totalVolume = 0
        let maxWeight = 0
        let totalReps = 0
        let totalSets = 0

        exercise.completed.forEach((isCompleted, setIndex) => {
          if (isCompleted) {
            // Safely convert to numbers, handling null, empty strings and invalid values
            const weight = exercise.weights[setIndex] && exercise.weights[setIndex] !== '' && exercise.weights[setIndex] !== null ? Number(exercise.weights[setIndex]) : 0
            const reps = exercise.reps[setIndex] && exercise.reps[setIndex] !== '' && exercise.reps[setIndex] !== null ? Number(exercise.reps[setIndex]) : 0
            const bodyweight = exercise.bodyweight && exercise.bodyweight !== '' && exercise.bodyweight !== null ? Number(exercise.bodyweight) : 0

            // Validate numbers
            const validWeight = isNaN(weight) ? 0 : weight
            const validReps = isNaN(reps) ? 0 : reps
            const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

            let effectiveWeight = validWeight
            if (exercise.exerciseType === 'Bodyweight') {
              effectiveWeight = validBodyweight
            } else if (exercise.exerciseType === 'Bodyweight Loadable') {
              effectiveWeight = validBodyweight + validWeight
            }

            totalVolume += effectiveWeight * validReps
            maxWeight = Math.max(maxWeight, effectiveWeight)
            totalReps += validReps
            totalSets += 1
          }
        })

        if (totalSets > 0) {
          analyticsUpdates.push({
            user_id: userId,
            exercise_id: exercise.exerciseId,
            total_volume: totalVolume,
            max_weight: maxWeight,
            total_reps: totalReps,
            total_sets: totalSets,
            last_workout_date: new Date().toISOString().split('T')[0],
            pr_date: new Date().toISOString().split('T')[0], // Simplified - would need PR detection logic
            updated_at: new Date().toISOString()
          })
        }
      })

      if (analyticsUpdates.length > 0) {
        // Use upsert to update existing records or create new ones
        const { error } = await supabase
          .from('user_analytics')
          .upsert(analyticsUpdates, {
            onConflict: 'user_id,exercise_id',
            ignoreDuplicates: false
          })

        if (error) throw error
      }
    }, 'updateUserAnalytics')
  }

  /**
   * Get user analytics for specific exercise
   */
  async getUserAnalytics(userId, exerciseId = null) {
    return withSupabaseErrorHandling(async () => {
      let query = supabase
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
        .eq('user_id', userId)

      if (exerciseId) {
        query = query.eq('exercise_id', exerciseId)
      }

      const { data, error } = await query.order('last_workout_date', { ascending: false })

      if (error) throw error
      return data
    }, 'getUserAnalytics')
  }

  /**
   * Get workout statistics for user
   */
  async getWorkoutStats(userId, timeframe = '30d') {
    return withSupabaseErrorHandling(async () => {
      const startDate = new Date()

      switch (timeframe) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7)
          break
        case '30d':
          startDate.setDate(startDate.getDate() - 30)
          break
        case '90d':
          startDate.setDate(startDate.getDate() - 90)
          break
        case '1y':
          startDate.setFullYear(startDate.getFullYear() - 1)
          break
        default:
          startDate.setDate(startDate.getDate() - 30)
      }

      const { data, error } = await supabase
        .from('workout_logs')
        .select(`
          id,
          completed_date,
          duration,
          workout_log_exercises (
            sets,
            reps,
            weights,
            completed,
            bodyweight,
            exercises (
              primary_muscle_group,
              exercise_type
            )
          )
        `)
        .eq('user_id', userId)
        .eq('is_finished', true)
        .gte('completed_date', startDate.toISOString())
        .order('completed_date', { ascending: false })

      if (error) throw error

      // Calculate statistics
      let totalWorkouts = data.length
      let totalVolume = 0
      let totalSets = 0
      let totalReps = 0
      let muscleGroupBreakdown = {}

      data.forEach(workout => {
        workout.workout_log_exercises.forEach(exercise => {
          const muscleGroup = exercise.exercises.primary_muscle_group

          if (!muscleGroupBreakdown[muscleGroup]) {
            muscleGroupBreakdown[muscleGroup] = { volume: 0, sets: 0 }
          }

          exercise.completed.forEach((isCompleted, setIndex) => {
            if (isCompleted) {
              // Safely convert to numbers, handling null, empty strings and invalid values
              const weight = exercise.weights[setIndex] && exercise.weights[setIndex] !== '' && exercise.weights[setIndex] !== null ? Number(exercise.weights[setIndex]) : 0
              const reps = exercise.reps[setIndex] && exercise.reps[setIndex] !== '' && exercise.reps[setIndex] !== null ? Number(exercise.reps[setIndex]) : 0
              const bodyweight = exercise.bodyweight && exercise.bodyweight !== '' && exercise.bodyweight !== null ? Number(exercise.bodyweight) : 0

              // Validate numbers
              const validWeight = isNaN(weight) ? 0 : weight
              const validReps = isNaN(reps) ? 0 : reps
              const validBodyweight = isNaN(bodyweight) ? 0 : bodyweight

              let effectiveWeight = validWeight
              if (exercise.exercises.exercise_type === 'Bodyweight') {
                effectiveWeight = validBodyweight
              } else if (exercise.exercises.exercise_type === 'Bodyweight Loadable') {
                effectiveWeight = validBodyweight + validWeight
              }

              const volume = effectiveWeight * validReps
              totalVolume += volume
              totalSets += 1
              totalReps += validReps

              muscleGroupBreakdown[muscleGroup].volume += volume
              muscleGroupBreakdown[muscleGroup].sets += 1
            }
          })
        })
      })

      return {
        timeframe,
        totalWorkouts,
        totalVolume,
        totalSets,
        totalReps,
        averageWorkoutsPerWeek: totalWorkouts / (timeframe === '7d' ? 1 : timeframe === '30d' ? 4.3 : timeframe === '90d' ? 12.9 : 52),
        muscleGroupBreakdown
      }
    }, 'getWorkoutStats')
  }

  /**
   * Finish workout and trigger processing
   */
  async finishWorkout(userId, programId, weekIndex, dayIndex, exercises) {
    return withSupabaseErrorHandling(async () => {
      let workoutLogId

      // Check if workout log already exists
      const existingLog = await this.getWorkoutLog(userId, programId, weekIndex, dayIndex)

      // Transform exercise data to Supabase format
      const transformedExercises = exercises.map((ex, index) => {
        const sets = ex.sets && ex.sets !== '' ? Number(ex.sets) : 1
        const bodyweight = ex.bodyweight && ex.bodyweight !== '' ? Number(ex.bodyweight) : null

        return {
          exerciseId: ex.exerciseId,
          sets: isNaN(sets) || sets <= 0 ? 1 : sets,
          reps: ex.reps || [],
          weights: ex.weights || [],
          completed: ex.completed || [],
          bodyweight: isNaN(bodyweight) ? null : bodyweight,
          notes: ex.notes || '',
          isAdded: ex.isAdded || false,
          addedType: ex.addedType || null,
          originalIndex: ex.originalIndex || -1
        }
      })

      const completedDate = new Date().toISOString()

      if (existingLog) {
        // Update existing log to mark as finished
        await this.updateWorkoutLog(existingLog.id, {
          name: existingLog.name,
          isFinished: true,
          isDraft: false,
          completedDate: completedDate,
          exercises: transformedExercises
        })
        workoutLogId = existingLog.id
      } else {
        // Create new completed workout log
        const workoutData = {
          programId: programId,
          weekIndex: weekIndex,
          dayIndex: dayIndex,
          name: `Workout - Week ${weekIndex + 1}, Day ${dayIndex + 1}`,
          type: 'program_workout',
          date: new Date().toISOString().split('T')[0],
          isFinished: true,
          isDraft: false,
          weightUnit: 'LB',
          exercises: transformedExercises
        }
        const newLog = await this.createWorkoutLog(userId, workoutData)
        workoutLogId = newLog.id
      }

      // Trigger workout processing using Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('process-workout', {
        body: { workoutLogId: workoutLogId }
      })

      if (error) {
        throw error
      }

      console.log('Workout processing triggered successfully:', data)
      return { workoutLogId, processingResult: data }
    }, 'finishWorkout')
  }
}

// Export singleton instance
const workoutLogService = new WorkoutLogService()
export default workoutLogService