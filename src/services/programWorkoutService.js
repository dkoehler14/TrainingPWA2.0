import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'

/**
 * Program Workout Service for Supabase program workout and exercise relationship operations
 * Handles complex workout configurations and exercise relationships within programs
 */

/**
 * Get all workouts for a program
 */
export const getProgramWorkouts = async (programId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_workouts')
      .select(`
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
      `)
      .eq('program_id', programId)
      .order('week_number')
      .order('day_number')

    if (error) throw error

    // Sort exercises within each workout by order_index
    if (data) {
      data.forEach(workout => {
        if (workout.program_exercises) {
          workout.program_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })
    }

    return data || []
  }, 'getProgramWorkouts')
}

/**
 * Get workout by ID with exercises
 */
export const getProgramWorkoutById = async (workoutId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_workouts')
      .select(`
        *,
        programs (
          id,
          name,
          user_id
        ),
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
      `)
      .eq('id', workoutId)
      .single()

    if (error) throw error

    // Sort exercises by order_index
    if (data.program_exercises) {
      data.program_exercises.sort((a, b) => a.order_index - b.order_index)
    }

    return data
  }, 'getProgramWorkoutById')
}

/**
 * Get workouts for a specific week
 */
export const getProgramWorkoutsByWeek = async (programId, weekNumber) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_workouts')
      .select(`
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
      `)
      .eq('program_id', programId)
      .eq('week_number', weekNumber)
      .order('day_number')

    if (error) throw error

    // Sort exercises within each workout by order_index
    if (data) {
      data.forEach(workout => {
        if (workout.program_exercises) {
          workout.program_exercises.sort((a, b) => a.order_index - b.order_index)
        }
      })
    }

    return data || []
  }, 'getProgramWorkoutsByWeek')
}

/**
 * Get specific workout for a week and day
 */
export const getProgramWorkoutByWeekDay = async (programId, weekNumber, dayNumber) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_workouts')
      .select(`
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
      `)
      .eq('program_id', programId)
      .eq('week_number', weekNumber)
      .eq('day_number', dayNumber)
      .single()

    if (error) {
      // If no workout found, return null
      if (error.code === 'PGRST116') {
        return null
      }
      throw error
    }

    // Sort exercises by order_index
    if (data.program_exercises) {
      data.program_exercises.sort((a, b) => a.order_index - b.order_index)
    }

    return data
  }, 'getProgramWorkoutByWeekDay')
}

/**
 * Create a new program workout
 */
export const createProgramWorkout = async (workoutData) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_workouts')
      .insert([workoutData])
      .select()
      .single()

    if (error) throw error

    console.log('Program workout created:', data.name)
    return data
  }, 'createProgramWorkout')
}

/**
 * Create program workout with exercises
 */
export const createProgramWorkoutWithExercises = async (workoutData, exercisesData) => {
  return executeSupabaseOperation(async () => {
    // Create the workout
    const { data: workout, error: workoutError } = await supabase
      .from('program_workouts')
      .insert([workoutData])
      .select()
      .single()

    if (workoutError) throw workoutError

    // Create exercises for the workout
    if (exercisesData && exercisesData.length > 0) {
      const exercisesToInsert = exercisesData.map((exercise, index) => ({
        ...exercise,
        workout_id: workout.id,
        order_index: exercise.order_index !== undefined ? exercise.order_index : index
      }))

      const { data: exercises, error: exercisesError } = await supabase
        .from('program_exercises')
        .insert(exercisesToInsert)
        .select(`
          *,
          exercises (
            id,
            name,
            primary_muscle_group,
            exercise_type,
            instructions
          )
        `)

      if (exercisesError) {
        // Cleanup: delete the workout if exercise creation fails
        await supabase.from('program_workouts').delete().eq('id', workout.id)
        throw exercisesError
      }

      workout.program_exercises = exercises.sort((a, b) => a.order_index - b.order_index)
    }

    console.log('Program workout with exercises created:', workout.name)
    return workout
  }, 'createProgramWorkoutWithExercises')
}

/**
 * Update program workout
 */
export const updateProgramWorkout = async (workoutId, updates) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_workouts')
      .update(updates)
      .eq('id', workoutId)
      .select()
      .single()

    if (error) throw error

    console.log('Program workout updated:', data.name)
    return data
  }, 'updateProgramWorkout')
}

/**
 * Delete program workout and all exercises
 */
export const deleteProgramWorkout = async (workoutId) => {
  return executeSupabaseOperation(async () => {
    const { error } = await supabase
      .from('program_workouts')
      .delete()
      .eq('id', workoutId)

    if (error) throw error

    console.log('Program workout deleted:', workoutId)
    return true
  }, 'deleteProgramWorkout')
}

/**
 * Get exercises for a specific workout
 */
export const getProgramExercises = async (workoutId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_exercises')
      .select(`
        *,
        exercises (
          id,
          name,
          primary_muscle_group,
          exercise_type,
          instructions
        )
      `)
      .eq('workout_id', workoutId)
      .order('order_index')

    if (error) throw error
    return data || []
  }, 'getProgramExercises')
}

/**
 * Add exercise to program workout
 */
export const addExerciseToWorkout = async (workoutId, exerciseData) => {
  return executeSupabaseOperation(async () => {
    // Get the current max order_index for this workout
    const { data: existingExercises, error: orderError } = await supabase
      .from('program_exercises')
      .select('order_index')
      .eq('workout_id', workoutId)
      .order('order_index', { ascending: false })
      .limit(1)

    if (orderError) throw orderError

    const nextOrderIndex = existingExercises.length > 0 
      ? existingExercises[0].order_index + 1 
      : 0

    const exerciseToInsert = {
      ...exerciseData,
      workout_id: workoutId,
      order_index: exerciseData.order_index !== undefined ? exerciseData.order_index : nextOrderIndex
    }

    const { data, error } = await supabase
      .from('program_exercises')
      .insert([exerciseToInsert])
      .select(`
        *,
        exercises (
          id,
          name,
          primary_muscle_group,
          exercise_type,
          instructions
        )
      `)
      .single()

    if (error) throw error

    console.log('Exercise added to workout:', data.exercises.name)
    return data
  }, 'addExerciseToWorkout')
}

/**
 * Update program exercise
 */
export const updateProgramExercise = async (exerciseId, updates) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_exercises')
      .update(updates)
      .eq('id', exerciseId)
      .select(`
        *,
        exercises (
          id,
          name,
          primary_muscle_group,
          exercise_type,
          instructions
        )
      `)
      .single()

    if (error) throw error

    console.log('Program exercise updated:', data.exercises.name)
    return data
  }, 'updateProgramExercise')
}

/**
 * Remove exercise from program workout
 */
export const removeExerciseFromWorkout = async (exerciseId) => {
  return executeSupabaseOperation(async () => {
    const { error } = await supabase
      .from('program_exercises')
      .delete()
      .eq('id', exerciseId)

    if (error) throw error

    console.log('Exercise removed from workout:', exerciseId)
    return true
  }, 'removeExerciseFromWorkout')
}

/**
 * Reorder exercises in a workout
 */
export const reorderWorkoutExercises = async (workoutId, exerciseOrders) => {
  return executeSupabaseOperation(async () => {
    // Update each exercise with its new order_index
    const updatePromises = exerciseOrders.map(({ exerciseId, orderIndex }) =>
      supabase
        .from('program_exercises')
        .update({ order_index: orderIndex })
        .eq('id', exerciseId)
        .eq('workout_id', workoutId)
    )

    const results = await Promise.all(updatePromises)
    
    // Check for errors
    const errors = results.filter(result => result.error)
    if (errors.length > 0) {
      throw errors[0].error
    }

    console.log('Workout exercises reordered:', workoutId)
    return true
  }, 'reorderWorkoutExercises')
}

/**
 * Duplicate workout to another week/day
 */
export const duplicateWorkout = async (workoutId, newWeekNumber, newDayNumber) => {
  return executeSupabaseOperation(async () => {
    // Get the original workout with exercises
    const originalWorkout = await getProgramWorkoutById(workoutId)

    // Create new workout
    const newWorkoutData = {
      program_id: originalWorkout.program_id,
      week_number: newWeekNumber,
      day_number: newDayNumber,
      name: originalWorkout.name
    }

    const { data: newWorkout, error: workoutError } = await supabase
      .from('program_workouts')
      .insert([newWorkoutData])
      .select()
      .single()

    if (workoutError) throw workoutError

    // Copy exercises
    if (originalWorkout.program_exercises && originalWorkout.program_exercises.length > 0) {
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
        // Cleanup: delete the workout if exercise creation fails
        await supabase.from('program_workouts').delete().eq('id', newWorkout.id)
        throw exercisesError
      }
    }

    console.log('Workout duplicated:', newWorkout.name)
    return newWorkout
  }, 'duplicateWorkout')
}

/**
 * Get workout template suggestions based on muscle groups
 */
export const getWorkoutTemplateSuggestions = async (muscleGroups, exerciseCount = 6) => {
  return executeSupabaseOperation(async () => {
    const suggestions = []

    for (const muscleGroup of muscleGroups) {
      const { data: exercises, error } = await supabase
        .from('exercises')
        .select('id, name, primary_muscle_group, exercise_type')
        .eq('primary_muscle_group', muscleGroup)
        .eq('is_global', true)
        .limit(exerciseCount)

      if (error) throw error

      if (exercises && exercises.length > 0) {
        suggestions.push({
          muscleGroup,
          exercises: exercises.map((exercise, index) => ({
            exercise_id: exercise.id,
            sets: 3,
            reps: 10,
            rest_minutes: 60,
            order_index: index
          }))
        })
      }
    }

    return suggestions
  }, 'getWorkoutTemplateSuggestions')
}

/**
 * Bulk update workout exercises
 */
export const bulkUpdateWorkoutExercises = async (workoutId, exerciseUpdates) => {
  return executeSupabaseOperation(async () => {
    const updatePromises = exerciseUpdates.map(update =>
      supabase
        .from('program_exercises')
        .update({
          sets: update.sets,
          reps: update.reps,
          rest_minutes: update.rest_minutes,
          notes: update.notes
        })
        .eq('id', update.exerciseId)
        .eq('workout_id', workoutId)
    )

    const results = await Promise.all(updatePromises)
    
    // Check for errors
    const errors = results.filter(result => result.error)
    if (errors.length > 0) {
      throw errors[0].error
    }

    console.log('Bulk workout exercises updated:', workoutId)
    return true
  }, 'bulkUpdateWorkoutExercises')
}

/**
 * Get workout muscle group distribution
 */
export const getWorkoutMuscleGroupDistribution = async (workoutId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_exercises')
      .select(`
        exercises (
          primary_muscle_group
        )
      `)
      .eq('workout_id', workoutId)

    if (error) throw error

    // Count exercises by muscle group
    const distribution = {}
    data.forEach(item => {
      const muscleGroup = item.exercises.primary_muscle_group
      distribution[muscleGroup] = (distribution[muscleGroup] || 0) + 1
    })

    return distribution
  }, 'getWorkoutMuscleGroupDistribution')
}

/**
 * Validate workout structure
 */
export const validateWorkoutStructure = async (programId, weekNumber, dayNumber) => {
  return executeSupabaseOperation(async () => {
    // Check if workout exists
    const workout = await getProgramWorkoutByWeekDay(programId, weekNumber, dayNumber)
    
    if (!workout) {
      return {
        isValid: false,
        errors: ['Workout does not exist']
      }
    }

    const errors = []

    // Check if workout has exercises
    if (!workout.program_exercises || workout.program_exercises.length === 0) {
      errors.push('Workout has no exercises')
    }

    // Check for duplicate exercises
    const exerciseIds = workout.program_exercises.map(pe => pe.exercise_id)
    const uniqueExerciseIds = [...new Set(exerciseIds)]
    if (exerciseIds.length !== uniqueExerciseIds.length) {
      errors.push('Workout contains duplicate exercises')
    }

    // Check order_index consistency
    const orderIndices = workout.program_exercises.map(pe => pe.order_index).sort((a, b) => a - b)
    for (let i = 0; i < orderIndices.length; i++) {
      if (orderIndices[i] !== i) {
        errors.push('Exercise order indices are not sequential')
        break
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      workout
    }
  }, 'validateWorkoutStructure')
}