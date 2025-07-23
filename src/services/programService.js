import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'

/**
 * Program Service for Supabase program operations
 * Handles CRUD operations for programs with complex workout configurations
 */

/**
 * Get all programs for a user
 */
export const getUserPrograms = async (userId, filters = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('programs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    // Apply filters
    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive)
    }

    if (filters.isCurrent !== undefined) {
      query = query.eq('is_current', filters.isCurrent)
    }

    if (filters.isTemplate !== undefined) {
      query = query.eq('is_template', filters.isTemplate)
    }

    if (filters.difficulty) {
      query = query.eq('difficulty', filters.difficulty)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'getUserPrograms')
}

/**
 * Get program by ID with full workout structure
 */
export const getProgramById = async (programId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('programs')
      .select(`
        *,
        program_workouts (
          *,
          program_exercises (
            *,
            exercises (
              id,
              name,
              primary_muscle_group,
              exercise_type,
              instructions
            )
          )
        )
      `)
      .eq('id', programId)
      .single()

    if (error) throw error

    // Sort workouts by week and day
    if (data.program_workouts) {
      data.program_workouts.sort((a, b) => {
        if (a.week_number !== b.week_number) {
          return a.week_number - b.week_number
        }
        return a.day_number - b.day_number
      })

      // Sort exercises within each workout by order_index
      data.program_workouts.forEach(workout => {
        if (workout.program_exercises) {
          workout.program_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })
    }

    return data
  }, 'getProgramById')
}

/**
 * Get program summary (without full workout details)
 */
export const getProgramSummary = async (programId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_summary')
      .select('*')
      .eq('id', programId)
      .single()

    if (error) throw error
    return data
  }, 'getProgramSummary')
}

/**
 * Get current program for user
 */
export const getCurrentProgram = async (userId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('programs')
      .select(`
        *,
        program_workouts (
          *,
          program_exercises (
            *,
            exercises (
              id,
              name,
              primary_muscle_group,
              exercise_type,
              instructions
            )
          )
        )
      `)
      .eq('user_id', userId)
      .eq('is_current', true)
      .eq('is_active', true)
      .single()

    if (error) {
      // If no current program found, return null
      if (error.code === 'PGRST116') {
        return null
      }
      throw error
    }

    // Sort workouts and exercises
    if (data.program_workouts) {
      data.program_workouts.sort((a, b) => {
        if (a.week_number !== b.week_number) {
          return a.week_number - b.week_number
        }
        return a.day_number - b.day_number
      })

      data.program_workouts.forEach(workout => {
        if (workout.program_exercises) {
          workout.program_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })
    }

    return data
  }, 'getCurrentProgram')
}

/**
 * Create a new program
 */
export const createProgram = async (programData) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('programs')
      .insert([programData])
      .select()
      .single()

    if (error) throw error

    console.log('Program created:', data.name)
    return data
  }, 'createProgram')
}

/**
 * Create a complete program with workouts and exercises
 */
export const createCompleteProgram = async (programData, workoutsData) => {
  return executeSupabaseOperation(async () => {
    // Start a transaction-like operation
    const { data: program, error: programError } = await supabase
      .from('programs')
      .insert([programData])
      .select()
      .single()

    if (programError) throw programError

    // Create workouts for the program
    const workoutsToInsert = workoutsData.map(workout => ({
      ...workout,
      program_id: program.id
    }))

    const { data: workouts, error: workoutsError } = await supabase
      .from('program_workouts')
      .insert(workoutsToInsert)
      .select()

    if (workoutsError) {
      // Cleanup: delete the program if workout creation fails
      await supabase.from('programs').delete().eq('id', program.id)
      throw workoutsError
    }

    // Create exercises for each workout
    const allExercises = []
    for (const workout of workouts) {
      const workoutData = workoutsData.find(w => 
        w.week_number === workout.week_number && w.day_number === workout.day_number
      )
      
      if (workoutData && workoutData.exercises) {
        const exercisesToInsert = workoutData.exercises.map(exercise => ({
          ...exercise,
          workout_id: workout.id
        }))
        
        const { data: exercises, error: exercisesError } = await supabase
          .from('program_exercises')
          .insert(exercisesToInsert)
          .select()

        if (exercisesError) {
          // Cleanup: delete program and workouts if exercise creation fails
          await supabase.from('programs').delete().eq('id', program.id)
          throw exercisesError
        }

        allExercises.push(...exercises)
      }
    }

    console.log('Complete program created:', program.name)
    return {
      program,
      workouts,
      exercises: allExercises
    }
  }, 'createCompleteProgram')
}

/**
 * Update program
 */
export const updateProgram = async (programId, updates) => {
  return executeSupabaseOperation(async () => {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('programs')
      .update(updateData)
      .eq('id', programId)
      .select()
      .single()

    if (error) throw error

    console.log('Program updated:', data.name)
    return data
  }, 'updateProgram')
}

/**
 * Set program as current
 */
export const setCurrentProgram = async (programId, userId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('programs')
      .update({ 
        is_current: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', programId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    console.log('Program set as current:', data.name)
    return data
  }, 'setCurrentProgram')
}

/**
 * Deactivate program
 */
export const deactivateProgram = async (programId, userId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('programs')
      .update({ 
        is_active: false,
        is_current: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', programId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) throw error

    console.log('Program deactivated:', data.name)
    return data
  }, 'deactivateProgram')
}

/**
 * Delete program and all related data
 */
export const deleteProgram = async (programId, userId) => {
  return executeSupabaseOperation(async () => {
    const { error } = await supabase
      .from('programs')
      .delete()
      .eq('id', programId)
      .eq('user_id', userId)

    if (error) throw error

    console.log('Program deleted:', programId)
    return true
  }, 'deleteProgram')
}

/**
 * Copy program (create template or duplicate)
 */
export const copyProgram = async (programId, newProgramData, userId) => {
  return executeSupabaseOperation(async () => {
    // Get the original program with all workouts and exercises
    const originalProgram = await getProgramById(programId)

    // Create new program
    const programToCopy = {
      ...newProgramData,
      user_id: userId,
      is_current: false,
      is_active: true,
      completed_weeks: 0,
      start_date: null
    }

    const { data: newProgram, error: programError } = await supabase
      .from('programs')
      .insert([programToCopy])
      .select()
      .single()

    if (programError) throw programError

    // Copy workouts
    if (originalProgram.program_workouts) {
      const workoutsToInsert = originalProgram.program_workouts.map(workout => ({
        program_id: newProgram.id,
        week_number: workout.week_number,
        day_number: workout.day_number,
        name: workout.name
      }))

      const { data: newWorkouts, error: workoutsError } = await supabase
        .from('program_workouts')
        .insert(workoutsToInsert)
        .select()

      if (workoutsError) {
        await supabase.from('programs').delete().eq('id', newProgram.id)
        throw workoutsError
      }

      // Copy exercises for each workout
      for (const originalWorkout of originalProgram.program_workouts) {
        const newWorkout = newWorkouts.find(w => 
          w.week_number === originalWorkout.week_number && 
          w.day_number === originalWorkout.day_number
        )

        if (originalWorkout.program_exercises && newWorkout) {
          const exercisesToInsert = originalWorkout.program_exercises.map(exercise => ({
            workout_id: newWorkout.id,
            exercise_id: exercise.exercise_id,
            sets: exercise.sets,
            reps: exercise.reps,
            rest_minutes: exercise.rest_minutes,
            notes: exercise.notes,
            order_index: exercise.order_index
          }))

          const { error: exercisesError } = await supabase
            .from('program_exercises')
            .insert(exercisesToInsert)

          if (exercisesError) {
            await supabase.from('programs').delete().eq('id', newProgram.id)
            throw exercisesError
          }
        }
      }
    }

    console.log('Program copied:', newProgram.name)
    return newProgram
  }, 'copyProgram')
}

/**
 * Update program progress
 */
export const updateProgramProgress = async (programId, completedWeeks) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('programs')
      .update({ 
        completed_weeks: completedWeeks,
        updated_at: new Date().toISOString()
      })
      .eq('id', programId)
      .select()
      .single()

    if (error) throw error

    console.log('Program progress updated:', data.name, 'weeks:', completedWeeks)
    return data
  }, 'updateProgramProgress')
}

/**
 * Get program templates
 */
export const getProgramTemplates = async (filters = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('programs')
      .select('*')
      .eq('is_template', true)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (filters.difficulty) {
      query = query.eq('difficulty', filters.difficulty)
    }

    if (filters.duration) {
      query = query.eq('duration', filters.duration)
    }

    if (filters.daysPerWeek) {
      query = query.eq('days_per_week', filters.daysPerWeek)
    }

    if (filters.goals && filters.goals.length > 0) {
      query = query.contains('goals', filters.goals)
    }

    if (filters.equipment && filters.equipment.length > 0) {
      query = query.contains('equipment', filters.equipment)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'getProgramTemplates')
}

/**
 * Search programs by name
 */
export const searchPrograms = async (searchTerm, userId, filters = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('programs')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', `%${searchTerm}%`)
      .order('name')

    // Apply filters
    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive)
    }

    if (filters.difficulty) {
      query = query.eq('difficulty', filters.difficulty)
    }

    const limit = filters.limit || 20
    query = query.limit(limit)

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'searchPrograms')
}

/**
 * Get program statistics
 */
export const getProgramStatistics = async (programId) => {
  return executeSupabaseOperation(async () => {
    // Get workout logs for this program
    const { data: workoutLogs, error: logsError } = await supabase
      .from('workout_logs')
      .select('id, is_finished, duration, date')
      .eq('program_id', programId)

    if (logsError) throw logsError

    const totalWorkouts = workoutLogs?.length || 0
    const completedWorkouts = workoutLogs?.filter(log => log.is_finished).length || 0
    const totalDuration = workoutLogs?.reduce((sum, log) => sum + (log.duration || 0), 0) || 0
    const averageDuration = completedWorkouts > 0 ? totalDuration / completedWorkouts : 0

    // Get program summary
    const { data: summary, error: summaryError } = await supabase
      .from('program_summary')
      .select('*')
      .eq('id', programId)
      .single()

    if (summaryError) throw summaryError

    return {
      totalWorkouts,
      completedWorkouts,
      totalDuration,
      averageDuration,
      totalProgramWorkouts: summary.total_workouts,
      totalExercises: summary.total_exercises,
      avgSetsPerExercise: summary.avg_sets_per_exercise
    }
  }, 'getProgramStatistics')
}