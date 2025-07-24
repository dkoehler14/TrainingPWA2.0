import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

interface ValidationRequest {
  type: 'workout' | 'exercise' | 'program' | 'user_profile'
  data: any
}

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  sanitizedData?: any
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Verify the JWT token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Parse request body
    const { type, data }: ValidationRequest = await req.json()

    if (!type || !data) {
      return new Response(
        JSON.stringify({ error: 'Type and data are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let validationResult: ValidationResult

    switch (type) {
      case 'workout':
        validationResult = await validateWorkout(data, supabaseClient, user.id)
        break
      case 'exercise':
        validationResult = await validateExercise(data, supabaseClient)
        break
      case 'program':
        validationResult = await validateProgram(data, supabaseClient, user.id)
        break
      case 'user_profile':
        validationResult = await validateUserProfile(data, supabaseClient)
        break
      default:
        return new Response(
          JSON.stringify({ error: 'Invalid validation type' }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
    }

    return new Response(
      JSON.stringify(validationResult),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error validating data:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

async function validateWorkout(data: any, supabaseClient: any, userId: string): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const sanitizedData = { ...data }

  // Required fields validation
  if (!data.date) {
    errors.push('Workout date is required')
  } else {
    // Validate date format
    const workoutDate = new Date(data.date)
    if (isNaN(workoutDate.getTime())) {
      errors.push('Invalid date format')
    } else if (workoutDate > new Date()) {
      warnings.push('Workout date is in the future')
    }
  }

  if (!data.exercises || !Array.isArray(data.exercises)) {
    errors.push('Exercises array is required')
  } else if (data.exercises.length === 0) {
    errors.push('At least one exercise is required')
  } else {
    // Validate each exercise
    for (let i = 0; i < data.exercises.length; i++) {
      const exercise = data.exercises[i]
      
      if (!exercise.exercise_id) {
        errors.push(`Exercise ${i + 1}: exercise_id is required`)
        continue
      }

      // Verify exercise exists
      const { data: exerciseData } = await supabaseClient
        .from('exercises')
        .select('id, name, exercise_type')
        .eq('id', exercise.exercise_id)
        .single()

      if (!exerciseData) {
        errors.push(`Exercise ${i + 1}: Invalid exercise_id`)
        continue
      }

      // Validate sets data
      if (!exercise.reps || !Array.isArray(exercise.reps)) {
        errors.push(`Exercise ${i + 1}: reps array is required`)
      }
      if (!exercise.weights || !Array.isArray(exercise.weights)) {
        errors.push(`Exercise ${i + 1}: weights array is required`)
      }
      if (!exercise.completed || !Array.isArray(exercise.completed)) {
        errors.push(`Exercise ${i + 1}: completed array is required`)
      }

      // Validate array lengths match
      if (exercise.reps && exercise.weights && exercise.completed) {
        const lengths = [exercise.reps.length, exercise.weights.length, exercise.completed.length]
        if (!lengths.every(len => len === lengths[0])) {
          errors.push(`Exercise ${i + 1}: reps, weights, and completed arrays must have the same length`)
        }

        // Validate individual set values
        for (let j = 0; j < exercise.reps.length; j++) {
          if (exercise.completed[j]) {
            if (exercise.reps[j] <= 0) {
              errors.push(`Exercise ${i + 1}, Set ${j + 1}: reps must be greater than 0`)
            }
            if (exercise.reps[j] > 100) {
              warnings.push(`Exercise ${i + 1}, Set ${j + 1}: unusually high rep count (${exercise.reps[j]})`)
            }
            
            // Weight validation depends on exercise type
            if (exerciseData.exercise_type !== 'Bodyweight' && exercise.weights[j] <= 0) {
              errors.push(`Exercise ${i + 1}, Set ${j + 1}: weight must be greater than 0`)
            }
            if (exercise.weights[j] > 1000) {
              warnings.push(`Exercise ${i + 1}, Set ${j + 1}: unusually high weight (${exercise.weights[j]} lbs)`)
            }
          }
        }
      }

      // Sanitize exercise data
      sanitizedData.exercises[i] = {
        ...exercise,
        exercise_id: exercise.exercise_id,
        sets: exercise.reps?.length || 0,
        reps: exercise.reps?.map((r: any) => Math.max(0, parseInt(r) || 0)) || [],
        weights: exercise.weights?.map((w: any) => Math.max(0, parseFloat(w) || 0)) || [],
        completed: exercise.completed?.map((c: any) => Boolean(c)) || [],
        notes: exercise.notes ? String(exercise.notes).substring(0, 500) : '', // Limit notes length
        is_added: Boolean(exercise.is_added),
        order_index: parseInt(exercise.order_index) || i
      }
    }
  }

  // Validate workout metadata
  if (data.weight_unit && !['LB', 'KG'].includes(data.weight_unit)) {
    errors.push('weight_unit must be either LB or KG')
  }

  if (data.duration && (data.duration < 0 || data.duration > 600)) {
    warnings.push('Workout duration seems unusual (should be 0-600 minutes)')
  }

  // Sanitize workout metadata
  sanitizedData.user_id = userId
  sanitizedData.weight_unit = data.weight_unit || 'LB'
  sanitizedData.duration = data.duration ? Math.max(0, Math.min(600, parseInt(data.duration))) : null
  sanitizedData.notes = data.notes ? String(data.notes).substring(0, 1000) : ''
  sanitizedData.is_draft = Boolean(data.is_draft)
  sanitizedData.is_finished = Boolean(data.is_finished)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData
  }
}

async function validateExercise(data: any, supabaseClient: any): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const sanitizedData = { ...data }

  // Required fields
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Exercise name is required')
  } else if (data.name.length > 255) {
    errors.push('Exercise name must be 255 characters or less')
  }

  if (!data.primary_muscle_group || typeof data.primary_muscle_group !== 'string') {
    errors.push('Primary muscle group is required')
  }

  if (!data.exercise_type || typeof data.exercise_type !== 'string') {
    errors.push('Exercise type is required')
  } else {
    const validTypes = ['Weighted', 'Bodyweight', 'Bodyweight Loadable', 'Cardio', 'Time']
    if (!validTypes.includes(data.exercise_type)) {
      errors.push(`Exercise type must be one of: ${validTypes.join(', ')}`)
    }
  }

  // Check for duplicate exercise names
  if (data.name) {
    const { data: existingExercise } = await supabaseClient
      .from('exercises')
      .select('id')
      .eq('name', data.name.trim())
      .single()

    if (existingExercise && existingExercise.id !== data.id) {
      errors.push('An exercise with this name already exists')
    }
  }

  // Sanitize data
  sanitizedData.name = data.name ? String(data.name).trim().substring(0, 255) : ''
  sanitizedData.primary_muscle_group = data.primary_muscle_group ? String(data.primary_muscle_group).trim() : ''
  sanitizedData.exercise_type = data.exercise_type ? String(data.exercise_type).trim() : ''
  sanitizedData.instructions = data.instructions ? String(data.instructions).substring(0, 2000) : ''
  sanitizedData.is_global = Boolean(data.is_global)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData
  }
}

async function validateProgram(data: any, supabaseClient: any, userId: string): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const sanitizedData = { ...data }

  // Required fields
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Program name is required')
  } else if (data.name.length > 255) {
    errors.push('Program name must be 255 characters or less')
  }

  if (!data.duration || data.duration <= 0 || data.duration > 52) {
    errors.push('Program duration must be between 1 and 52 weeks')
  }

  if (!data.days_per_week || data.days_per_week <= 0 || data.days_per_week > 7) {
    errors.push('Days per week must be between 1 and 7')
  }

  // Validate workouts if provided
  if (data.workouts && Array.isArray(data.workouts)) {
    for (let i = 0; i < data.workouts.length; i++) {
      const workout = data.workouts[i]
      
      if (!workout.name || typeof workout.name !== 'string') {
        errors.push(`Workout ${i + 1}: name is required`)
      }
      
      if (workout.week_number <= 0 || workout.week_number > data.duration) {
        errors.push(`Workout ${i + 1}: invalid week number`)
      }
      
      if (workout.day_number <= 0 || workout.day_number > data.days_per_week) {
        errors.push(`Workout ${i + 1}: invalid day number`)
      }
    }
  }

  // Sanitize data
  sanitizedData.user_id = userId
  sanitizedData.name = data.name ? String(data.name).trim().substring(0, 255) : ''
  sanitizedData.description = data.description ? String(data.description).substring(0, 1000) : ''
  sanitizedData.duration = Math.max(1, Math.min(52, parseInt(data.duration) || 1))
  sanitizedData.days_per_week = Math.max(1, Math.min(7, parseInt(data.days_per_week) || 1))
  sanitizedData.weight_unit = data.weight_unit || 'LB'
  sanitizedData.difficulty = data.difficulty ? String(data.difficulty).substring(0, 50) : ''
  sanitizedData.goals = Array.isArray(data.goals) ? data.goals.slice(0, 10) : []
  sanitizedData.equipment = Array.isArray(data.equipment) ? data.equipment.slice(0, 20) : []
  sanitizedData.is_template = Boolean(data.is_template)
  sanitizedData.is_current = Boolean(data.is_current)
  sanitizedData.is_active = Boolean(data.is_active)

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData
  }
}

async function validateUserProfile(data: any, supabaseClient: any): Promise<ValidationResult> {
  const errors: string[] = []
  const warnings: string[] = []
  const sanitizedData = { ...data }

  // Email validation
  if (data.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(data.email)) {
      errors.push('Invalid email format')
    }
  }

  // Name validation
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Name is required')
  } else if (data.name.length > 255) {
    errors.push('Name must be 255 characters or less')
  }

  // Physical measurements validation
  if (data.age && (data.age < 13 || data.age > 120)) {
    errors.push('Age must be between 13 and 120')
  }

  if (data.weight && (data.weight < 50 || data.weight > 1000)) {
    warnings.push('Weight seems unusual (should be 50-1000 lbs)')
  }

  if (data.height && (data.height < 36 || data.height > 96)) {
    warnings.push('Height seems unusual (should be 36-96 inches)')
  }

  // Experience level validation
  if (data.experience_level) {
    const validLevels = ['beginner', 'intermediate', 'advanced']
    if (!validLevels.includes(data.experience_level)) {
      errors.push(`Experience level must be one of: ${validLevels.join(', ')}`)
    }
  }

  // Units validation
  if (data.preferred_units && !['LB', 'KG'].includes(data.preferred_units)) {
    errors.push('Preferred units must be either LB or KG')
  }

  // Sanitize data
  sanitizedData.name = data.name ? String(data.name).trim().substring(0, 255) : ''
  sanitizedData.email = data.email ? String(data.email).trim().toLowerCase() : ''
  sanitizedData.experience_level = data.experience_level || 'beginner'
  sanitizedData.preferred_units = data.preferred_units || 'LB'
  sanitizedData.age = data.age ? Math.max(13, Math.min(120, parseInt(data.age))) : null
  sanitizedData.weight = data.weight ? Math.max(0, parseFloat(data.weight)) : null
  sanitizedData.height = data.height ? Math.max(0, parseFloat(data.height)) : null
  sanitizedData.goals = Array.isArray(data.goals) ? data.goals.slice(0, 10) : []
  sanitizedData.available_equipment = Array.isArray(data.available_equipment) ? data.available_equipment.slice(0, 50) : []
  sanitizedData.injuries = Array.isArray(data.injuries) ? data.injuries.slice(0, 20) : []

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitizedData
  }
}