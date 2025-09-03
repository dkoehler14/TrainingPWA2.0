import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'
import { supabaseCache, invalidateProgramCache, invalidateUserCache } from '../api/supabaseCache'
import { transformSupabaseProgramToWeeklyConfigs } from '../utils/dataTransformations'

/**
 * Program Service for Supabase program operations
 * Handles CRUD operations for programs with complex workout configurations
 * Enhanced with caching for improved performance
 */

// Cache TTL constants
const PROGRAM_CACHE_TTL = 20 * 60 * 1000 // 20 minutes
const PROGRAM_SUMMARY_CACHE_TTL = 30 * 60 * 1000 // 30 minutes
const PROGRAM_TEMPLATES_CACHE_TTL = 60 * 60 * 1000 // 1 hour

/**
 * Internal function to get all programs for a user (both template and non-template)
 * Used for optimized fetching without template filtering
 * @param {string} userId - The user ID
 * @param {Object} additionalFilters - Additional filters to apply (excluding isTemplate)
 * @returns {Promise<Array>} Array of all programs for the user
 */
const getAllUserPrograms = async (userId, additionalFilters = {}) => {
  return executeSupabaseOperation(async () => {
    // Remove template filter if present in additional filters
    const filters = { ...additionalFilters };
    delete filters.isTemplate;

    // Create cache key for unified cache approach
    const filterKey = Object.keys(filters).sort().map(key => `${key}:${filters[key]}`).join('_')
    const cacheKey = `user_programs_all_${userId}${filterKey ? '_' + filterKey : ''}`



    return supabaseCache.getWithCache(
      cacheKey,
      async () => {


        let query = supabase
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
          .order('created_at', { ascending: false })

        // Apply non-template filters
        Object.keys(filters).forEach(key => {
          if (filters[key] !== undefined) {
            query = query.eq(key, filters[key])
          }
        })

        const { data, error } = await query

        if (error) {

          console.error('❌ [DATABASE_ERROR] Error fetching all programs:', {
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            userId,
            filters,
          });
          throw error;
        }

        // Transform each program to include weekly_configs
        const transformedPrograms = (data || []).map((program, index) => {

          // Sort workouts by week and day before transformation
          if (program.program_workouts) {
            const originalOrder = program.program_workouts.map(w => ({ week: w.week_number, day: w.day_number }));

            program.program_workouts.sort((a, b) => {
              if (a.week_number !== b.week_number) {
                return a.week_number - b.week_number
              }
              return a.day_number - b.day_number
            })

            // Sort exercises within each workout by order_index
            program.program_workouts.forEach((workout, workoutIndex) => {
              if (workout.program_exercises) {
                const originalExerciseOrder = workout.program_exercises.map(e => ({ id: e.exercise_id, order: e.order_index }));

                workout.program_exercises.sort((a, b) => a.order_index - b.order_index)

              }
            })
          }

          // Apply transformation to convert normalized data to weekly_configs format
          const transformedProgram = transformSupabaseProgramToWeeklyConfigs(program);

          return transformedProgram;
        })

        return transformedPrograms
      },
      {
        ttl: PROGRAM_CACHE_TTL,
        table: 'programs',
        userId: userId,
        tags: ['programs', 'user', 'all_programs'],
        onCacheHit: (cachedData) => {
          console.log('🎯 [CACHE_HIT] Cache hit for getAllUserPrograms:', {
            cacheKey,
            userId,
            filters,
            programCount: cachedData?.length || 0,
            templatePrograms: cachedData?.filter(p => p.is_template).length || 0,
            userPrograms: cachedData?.filter(p => !p.is_template).length || 0,
            ttl: PROGRAM_CACHE_TTL
          });
        },
        onCacheSet: (data) => {

          console.log('💾 [CACHE_SET] Data cached for getAllUserPrograms:', {
            cacheKey,
            userId,
            filters,
            programCount: data?.length || 0,
            templatePrograms: data?.filter(p => p.is_template).length || 0,
            userPrograms: data?.filter(p => !p.is_template).length || 0,
            ttl: PROGRAM_CACHE_TTL
          });
        }
      }
    )
  }, 'getAllUserPrograms')
}

/**
 * Get programs for a user with optional template filtering
 * Enhanced to fetch related workout and exercise data and transform to expected format
 * Maintains backward compatibility while optimizing for bulk fetching
 */
export const getUserPrograms = async (userId, filters = {}) => {
  return executeSupabaseOperation(async () => {


    // If no template filter specified, use optimized path with getAllUserPrograms
    if (filters.isTemplate === undefined) {

      const result = await getAllUserPrograms(userId, filters);

      return result;
    }

    // For backward compatibility, check if we can use cached all-programs data
    const nonTemplateFilters = { ...filters };
    delete nonTemplateFilters.isTemplate;
    const allProgramsFilterKey = Object.keys(nonTemplateFilters).sort().map(key => `${key}:${nonTemplateFilters[key]}`).join('_');
    const allProgramsCacheKey = `user_programs_all_${userId}${allProgramsFilterKey ? '_' + allProgramsFilterKey : ''}`;

    const cachedAllPrograms = supabaseCache.get(allProgramsCacheKey);

    if (cachedAllPrograms) {
      // Filter from cached data
      const filteredPrograms = cachedAllPrograms.filter(program =>
        program.is_template === filters.isTemplate
      );

      return filteredPrograms;
    }

    const allPrograms = await getAllUserPrograms(userId, nonTemplateFilters);

    // Filter by template status
    const filteredPrograms = allPrograms.filter(program =>
      program.is_template === filters.isTemplate
    );

    return filteredPrograms;

  }, 'getUserPrograms')
}

/**
 * Get program by ID with full workout structure (with caching)
 */
export const getProgramById = async (programId) => {
  return executeSupabaseOperation(async () => {
    // Use enhanced cache key to distinguish from basic program queries
    const cacheKey = `program_enhanced_${programId}`

    return supabaseCache.getWithCache(
      cacheKey,
      async () => {
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
        if (data && data.program_workouts) {
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
      },
      {
        ttl: PROGRAM_CACHE_TTL,
        table: 'programs',
        tags: ['programs', 'program_detail']
      }
    )
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

    invalidateProgramCache(programData.user_id)

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

    // Create workouts for the program (without exercises field)
    const workoutsToInsert = workoutsData.map(workout => ({
      program_id: program.id,
      week_number: workout.week_number,
      day_number: workout.day_number,
      name: workout.name
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

      if (workoutData && workoutData.exercises && workoutData.exercises.length > 0) {
        const exercisesToInsert = workoutData.exercises.map((exercise, index) => ({
          workout_id: workout.id,
          exercise_id: exercise.exercise_id,
          sets: exercise.sets,
          reps: exercise.reps,
          rest_minutes: exercise.rest_minutes || null,
          notes: exercise.notes || '',
          order_index: index
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

    invalidateProgramCache(programData.user_id)
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

    invalidateProgramCache(data.user_id)

    return data
  }, 'updateProgram')
}

/**
 * Validates input data for updateCompleteProgram function
 * @param {string} programId - The program ID to validate
 * @param {Object} programData - Program metadata to validate
 * @param {Array} workoutsData - Workout structure array to validate
 * @returns {Object} Validation result with isValid, errors, and warnings
 */
const validateUpdateCompleteProgram = (programId, programData, workoutsData) => {
  const errors = []
  const warnings = []

  // Validate programId
  if (!programId || typeof programId !== 'string' || programId.trim() === '') {
    errors.push('Program ID is required and must be a non-empty string')
  }

  // Validate programData
  if (!programData || typeof programData !== 'object') {
    errors.push('Program data is required and must be an object')
  } else {
    // Validate required program fields
    if (programData.duration !== undefined && (!Number.isInteger(programData.duration) || programData.duration < 1)) {
      errors.push('Program duration must be a positive integer')
    }
    
    if (programData.days_per_week !== undefined && (!Number.isInteger(programData.days_per_week) || programData.days_per_week < 1 || programData.days_per_week > 7)) {
      errors.push('Days per week must be an integer between 1 and 7')
    }

    if (programData.weight_unit !== undefined && !['LB', 'KG'].includes(programData.weight_unit)) {
      errors.push('Weight unit must be either "LB" or "KG"')
    }

    if (programData.name !== undefined && (typeof programData.name !== 'string' || programData.name.trim() === '')) {
      errors.push('Program name must be a non-empty string')
    }
  }

  // Validate workoutsData
  if (!Array.isArray(workoutsData)) {
    errors.push('Workouts data must be an array')
  } else {
    if (workoutsData.length === 0) {
      errors.push('At least one workout must be provided')
    }

    // Validate each workout
    workoutsData.forEach((workout, index) => {
      if (!workout || typeof workout !== 'object') {
        errors.push(`Workout at index ${index} must be an object`)
        return
      }

      // Validate required workout fields
      if (!Number.isInteger(workout.week_number) || workout.week_number < 1) {
        errors.push(`Workout at index ${index}: week_number must be a positive integer`)
      }

      if (!Number.isInteger(workout.day_number) || workout.day_number < 1 || workout.day_number > 7) {
        errors.push(`Workout at index ${index}: day_number must be an integer between 1 and 7`)
      }

      if (!workout.name || typeof workout.name !== 'string' || workout.name.trim() === '') {
        errors.push(`Workout at index ${index}: name is required and must be a non-empty string`)
      }

      // Validate exercises array
      if (!Array.isArray(workout.exercises)) {
        errors.push(`Workout at index ${index}: exercises must be an array`)
      } else {
        workout.exercises.forEach((exercise, exerciseIndex) => {
          if (!exercise || typeof exercise !== 'object') {
            errors.push(`Workout ${index}, exercise ${exerciseIndex}: must be an object`)
            return
          }

          if (!exercise.exercise_id || typeof exercise.exercise_id !== 'string') {
            errors.push(`Workout ${index}, exercise ${exerciseIndex}: exercise_id is required and must be a string`)
          }

          if (!Number.isInteger(exercise.sets) || exercise.sets < 1) {
            errors.push(`Workout ${index}, exercise ${exerciseIndex}: sets must be a positive integer`)
          }

          if (!exercise.reps || typeof exercise.reps !== 'string') {
            errors.push(`Workout ${index}, exercise ${exerciseIndex}: reps is required and must be a string`)
          }
        })
      }
    })

    // Check for data consistency issues
    if (workoutsData.length > 0) {
      // Check for duplicate workout combinations (week + day)
      const workoutKeys = new Set()
      const duplicates = []
      
      workoutsData.forEach((workout, index) => {
        const key = `${workout.week_number}-${workout.day_number}`
        if (workoutKeys.has(key)) {
          duplicates.push(`Week ${workout.week_number}, Day ${workout.day_number}`)
        }
        workoutKeys.add(key)
      })

      if (duplicates.length > 0) {
        errors.push(`Duplicate workout combinations found: ${duplicates.join(', ')}`)
      }

      // Check for missing weeks (gaps in week sequence)
      const weeks = [...new Set(workoutsData.map(w => w.week_number))].sort((a, b) => a - b)
      const expectedWeeks = Array.from({ length: weeks[weeks.length - 1] }, (_, i) => i + 1)
      const missingWeeks = expectedWeeks.filter(week => !weeks.includes(week))
      
      if (missingWeeks.length > 0) {
        warnings.push(`Missing weeks detected: ${missingWeeks.join(', ')}. This may cause inconsistent program structure.`)
      }

      // Check if program duration matches workout weeks
      if (programData.duration !== undefined) {
        const maxWeek = Math.max(...workoutsData.map(w => w.week_number))
        if (programData.duration !== maxWeek) {
          warnings.push(`Program duration (${programData.duration}) does not match maximum week number (${maxWeek}). Duration will be updated to match workout structure.`)
        }
      }

      // Check for workouts with no exercises
      const emptyWorkouts = workoutsData.filter(w => !w.exercises || w.exercises.length === 0)
      if (emptyWorkouts.length > 0) {
        warnings.push(`${emptyWorkouts.length} workout(s) have no exercises. These will create empty workout entries.`)
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Creates user-friendly error messages for different failure scenarios
 * @param {string} errorType - The type of error that occurred
 * @param {Object} context - Additional context for the error message
 * @returns {string} User-friendly error message
 */
const createUserFriendlyErrorMessage = (errorType, context = {}) => {
  const baseMessages = {
    VALIDATION_FAILED: 'The program data you provided has some issues that need to be fixed before saving.',
    BACKUP_FAILED: 'Unable to create a backup of your current program. This is required for safe updates.',
    UPDATE_PROGRAM_FAILED: 'Failed to update the program information in the database.',
    DELETE_WORKOUTS_FAILED: 'Failed to remove the existing workout structure from your program.',
    CREATE_WORKOUTS_FAILED: 'Failed to create the new workout structure for your program.',
    CREATE_EXERCISES_FAILED: 'Failed to add exercises to your program workouts.',
    ROLLBACK_FAILED: 'The update failed and we were unable to restore your program to its previous state.',
    UNKNOWN_ERROR: 'An unexpected error occurred while updating your program.'
  }

  let message = baseMessages[errorType] || baseMessages.UNKNOWN_ERROR

  // Add specific context based on error type
  switch (errorType) {
    case 'VALIDATION_FAILED':
      if (context.errors && context.errors.length > 0) {
        message += '\n\nIssues found:\n' + context.errors.map(error => `• ${error}`).join('\n')
        message += '\n\nPlease fix these issues and try saving again.'
      }
      break

    case 'BACKUP_FAILED':
      message += ' Please try again in a moment. If the problem persists, contact support.'
      break

    case 'UPDATE_PROGRAM_FAILED':
      message += ' Your program structure remains unchanged. Please check your internet connection and try again.'
      break

    case 'DELETE_WORKOUTS_FAILED':
      message += ' Your program remains in its original state. Please try again.'
      break

    case 'CREATE_WORKOUTS_FAILED':
      message += ' We\'ve restored your program to its previous state. Please check your workout structure and try again.'
      break

    case 'CREATE_EXERCISES_FAILED':
      message += ' We\'ve restored your program to its previous state. Please check that all exercises are valid and try again.'
      break

    case 'ROLLBACK_FAILED':
      message += ' Your program may be in an inconsistent state. Please refresh the page and check your program structure. Contact support if you notice any issues.'
      if (context.originalError) {
        message += `\n\nOriginal error: ${context.originalError}`
      }
      break

    default:
      message += ' Please try again. If the problem persists, contact support.'
      break
  }

  return message
}

/**
 * Update a complete program with workouts and exercises
 * Handles adding/removing weeks by recreating the complete workout structure
 * Includes transaction-like error handling with backup and rollback capabilities
 * @param {string} programId - The program ID to update
 * @param {Object} programData - Program metadata to update
 * @param {Array} workoutsData - Complete workout structure array
 * @returns {Promise<Object>} Updated program with workouts and exercises
 */
export const updateCompleteProgram = async (programId, programData, workoutsData) => {
  return executeSupabaseOperation(async () => {
    let backupData = null
    let operationSteps = []

    try {
      // Step 0: Validate input data before starting operations
      console.log('🔍 [VALIDATION_START] Validating input data before update:', { programId })
      
      const validationResult = validateUpdateCompleteProgram(programId, programData, workoutsData)
      if (!validationResult.isValid) {
        console.error('❌ [VALIDATION_ERROR] Input validation failed:', {
          programId,
          errors: validationResult.errors,
          warnings: validationResult.warnings
        })
        
        const errorMessage = createUserFriendlyErrorMessage('VALIDATION_FAILED', {
          errors: validationResult.errors,
          programId
        })
        throw new Error(errorMessage)
      }

      if (validationResult.warnings && validationResult.warnings.length > 0) {
        console.warn('⚠️ [VALIDATION_WARNING] Input validation warnings detected:', {
          programId,
          warnings: validationResult.warnings
        })
      }

      console.log('✅ [VALIDATION_SUCCESS] Input validation passed:', {
        programId,
        workoutCount: workoutsData.length,
        totalExercises: workoutsData.reduce((sum, w) => sum + (w.exercises?.length || 0), 0),
        weekRange: workoutsData.length > 0 ? {
          min: Math.min(...workoutsData.map(w => w.week_number)),
          max: Math.max(...workoutsData.map(w => w.week_number))
        } : null
      })
      // Step 1: Create backup of current program state
      console.log('🔄 [BACKUP_START] Creating backup of current program state:', { programId })
      
      const { data: currentProgram, error: backupError } = await supabase
        .from('programs')
        .select(`
          *,
          program_workouts (
            *,
            program_exercises (*)
          )
        `)
        .eq('id', programId)
        .single()

      if (backupError) {
        console.error('❌ [BACKUP_ERROR] Failed to create backup:', {
          programId,
          error: backupError.message,
          code: backupError.code,
          details: backupError.details,
          hint: backupError.hint
        })
        
        const errorMessage = createUserFriendlyErrorMessage('BACKUP_FAILED', {
          programId,
          originalError: backupError.message
        })
        throw new Error(errorMessage)
      }

      backupData = currentProgram
      console.log('✅ [BACKUP_SUCCESS] Program state backed up:', {
        programId,
        workoutCount: backupData.program_workouts?.length || 0,
        exerciseCount: backupData.program_workouts?.reduce((sum, w) => sum + (w.program_exercises?.length || 0), 0) || 0
      })

      // Step 2: Update program metadata
      console.log('🔄 [UPDATE_START] Updating program metadata:', { programId })
      operationSteps.push('program_updated')

      const updateData = {
        ...programData,
        updated_at: new Date().toISOString()
      }

      const { data: updatedProgram, error: programError } = await supabase
        .from('programs')
        .update(updateData)
        .eq('id', programId)
        .select()
        .single()

      if (programError) {
        console.error('❌ [UPDATE_ERROR] Failed to update program metadata:', {
          programId,
          error: programError.message,
          code: programError.code,
          details: programError.details,
          hint: programError.hint,
          updateData
        })
        
        const errorMessage = createUserFriendlyErrorMessage('UPDATE_PROGRAM_FAILED', {
          programId,
          originalError: programError.message
        })
        throw new Error(errorMessage)
      }

      console.log('✅ [UPDATE_SUCCESS] Program metadata updated:', { programId })

      // Step 3: Delete existing program_exercises entries
      console.log('🔄 [DELETE_START] Deleting existing program exercises:', { programId })
      operationSteps.push('exercises_deleted')

      // Get all workout IDs for this program to ensure proper deletion
      const { data: existingWorkouts, error: workoutsFetchError } = await supabase
        .from('program_workouts')
        .select('id')
        .eq('program_id', programId)

      if (workoutsFetchError) {
        console.error('❌ [DELETE_ERROR] Failed to fetch existing workouts for deletion:', {
          programId,
          error: workoutsFetchError.message,
          code: workoutsFetchError.code,
          details: workoutsFetchError.details,
          hint: workoutsFetchError.hint
        })
        
        const errorMessage = createUserFriendlyErrorMessage('DELETE_WORKOUTS_FAILED', {
          programId,
          originalError: workoutsFetchError.message
        })
        throw new Error(errorMessage)
      }

      // Delete program_exercises entries if workouts exist
      if (existingWorkouts && existingWorkouts.length > 0) {
        const workoutIds = existingWorkouts.map(w => w.id)

        const { error: exercisesDeleteError } = await supabase
          .from('program_exercises')
          .delete()
          .in('workout_id', workoutIds)

        if (exercisesDeleteError) {
          console.error('❌ [DELETE_ERROR] Failed to delete existing program exercises:', {
            programId,
            workoutIds,
            error: exercisesDeleteError.message,
            code: exercisesDeleteError.code,
            details: exercisesDeleteError.details,
            hint: exercisesDeleteError.hint
          })
          
          const errorMessage = createUserFriendlyErrorMessage('DELETE_WORKOUTS_FAILED', {
            programId,
            originalError: exercisesDeleteError.message
          })
          throw new Error(errorMessage)
        }

        console.log('✅ [DELETE_SUCCESS] Deleted program exercises for workouts:', {
          programId,
          workoutCount: workoutIds.length
        })
      }

      // Step 4: Delete existing program_workouts entries
      console.log('🔄 [DELETE_START] Deleting existing program workouts:', { programId })
      operationSteps.push('workouts_deleted')

      const { error: workoutsDeleteError } = await supabase
        .from('program_workouts')
        .delete()
        .eq('program_id', programId)

      if (workoutsDeleteError) {
        console.error('❌ [DELETE_ERROR] Failed to delete existing program workouts:', {
          programId,
          error: workoutsDeleteError.message,
          code: workoutsDeleteError.code,
          details: workoutsDeleteError.details,
          hint: workoutsDeleteError.hint
        })
        
        const errorMessage = createUserFriendlyErrorMessage('DELETE_WORKOUTS_FAILED', {
          programId,
          originalError: workoutsDeleteError.message
        })
        throw new Error(errorMessage)
      }

      console.log('✅ [DELETE_SUCCESS] Deleted program workouts:', {
        programId,
        workoutCount: existingWorkouts?.length || 0
      })

      // Step 5: Create new workouts for the program
      console.log('🔄 [CREATE_START] Creating new program workouts:', { programId })
      operationSteps.push('workouts_created')

      const workoutsToInsert = workoutsData.map(workout => ({
        program_id: programId,
        week_number: workout.week_number,
        day_number: workout.day_number,
        name: workout.name
      }))

      const { data: newWorkouts, error: workoutsError } = await supabase
        .from('program_workouts')
        .insert(workoutsToInsert)
        .select()

      if (workoutsError) {
        console.error('❌ [CREATE_ERROR] Failed to create new program workouts:', {
          programId,
          error: workoutsError.message,
          code: workoutsError.code,
          details: workoutsError.details,
          hint: workoutsError.hint,
          workoutsToInsert: workoutsToInsert.length
        })
        
        const errorMessage = createUserFriendlyErrorMessage('CREATE_WORKOUTS_FAILED', {
          programId,
          originalError: workoutsError.message
        })
        throw new Error(errorMessage)
      }

      console.log('✅ [CREATE_SUCCESS] Created new program workouts:', {
        programId,
        workoutCount: newWorkouts.length
      })

      // Step 6: Create exercises for each workout
      console.log('🔄 [CREATE_START] Creating new program exercises:', { programId })
      operationSteps.push('exercises_created')

      const allExercises = []
      for (const workout of newWorkouts) {
        const workoutData = workoutsData.find(w =>
          w.week_number === workout.week_number && w.day_number === workout.day_number
        )

        if (workoutData && workoutData.exercises && workoutData.exercises.length > 0) {
          const exercisesToInsert = workoutData.exercises.map((exercise, index) => ({
            workout_id: workout.id,
            exercise_id: exercise.exercise_id,
            sets: exercise.sets,
            reps: exercise.reps,
            rest_minutes: exercise.rest_minutes || null,
            notes: exercise.notes || '',
            order_index: index
          }))

          const { data: exercises, error: exercisesError } = await supabase
            .from('program_exercises')
            .insert(exercisesToInsert)
            .select()

          if (exercisesError) {
            console.error('❌ [CREATE_ERROR] Failed to create program exercises for workout:', {
              programId,
              workoutId: workout.id,
              workoutName: workout.name,
              exerciseCount: exercisesToInsert.length,
              error: exercisesError.message,
              code: exercisesError.code,
              details: exercisesError.details,
              hint: exercisesError.hint
            })
            
            const errorMessage = createUserFriendlyErrorMessage('CREATE_EXERCISES_FAILED', {
              programId,
              workoutName: workout.name,
              originalError: exercisesError.message
            })
            throw new Error(errorMessage)
          }

          allExercises.push(...exercises)
        }
      }

      console.log('✅ [CREATE_SUCCESS] Created new program exercises:', {
        programId,
        exerciseCount: allExercises.length
      })

      // Step 7: Success - invalidate cache and cleanup
      console.log('✅ [OPERATION_SUCCESS] All operations completed successfully:', { programId })
      
      // Invalidate program cache
      invalidateProgramCache(updatedProgram.user_id)

      // Clear backup data (successful completion)
      backupData = null

      return {
        program: updatedProgram,
        workouts: newWorkouts,
        exercises: allExercises
      }

    } catch (error) {
      // Rollback operations based on what steps were completed
      console.error('❌ [OPERATION_FAILED] Update operation failed, initiating rollback:', {
        programId,
        error: error.message,
        errorStack: error.stack,
        completedSteps: operationSteps,
        hasBackup: !!backupData,
        timestamp: new Date().toISOString()
      })

      // If this is already a user-friendly error message, don't wrap it again
      const isUserFriendlyError = error.message.includes('The program data you provided') || 
                                  error.message.includes('Unable to create a backup') ||
                                  error.message.includes('Failed to update the program') ||
                                  error.message.includes('Failed to remove the existing') ||
                                  error.message.includes('Failed to create the new') ||
                                  error.message.includes('Failed to add exercises')

      if (backupData) {
        try {
          console.log('🔄 [ROLLBACK_ATTEMPT] Attempting to restore program to previous state:', {
            programId,
            completedSteps: operationSteps,
            backupWorkouts: backupData.program_workouts?.length || 0
          })
          
          await rollbackProgramUpdate(programId, backupData, operationSteps)
          
          console.log('✅ [ROLLBACK_SUCCESS] Program state restored to previous version:', {
            programId,
            restoredWorkouts: backupData.program_workouts?.length || 0
          })
          
          // If rollback succeeded, throw the original error (potentially user-friendly)
          if (isUserFriendlyError) {
            throw error
          } else {
            const errorMessage = createUserFriendlyErrorMessage('UNKNOWN_ERROR', {
              programId,
              originalError: error.message
            })
            throw new Error(errorMessage)
          }
          
        } catch (rollbackError) {
          console.error('❌ [ROLLBACK_FAILED] Failed to rollback program state:', {
            programId,
            rollbackError: rollbackError.message,
            rollbackStack: rollbackError.stack,
            originalError: error.message,
            completedSteps: operationSteps,
            timestamp: new Date().toISOString()
          })
          
          // Create a comprehensive error message for rollback failure
          const errorMessage = createUserFriendlyErrorMessage('ROLLBACK_FAILED', {
            programId,
            originalError: error.message
          })
          throw new Error(errorMessage)
        }
      } else {
        // No backup data available, just throw appropriate error
        console.error('❌ [NO_BACKUP] No backup data available for rollback:', {
          programId,
          error: error.message,
          completedSteps: operationSteps
        })
        
        if (isUserFriendlyError) {
          throw error
        } else {
          const errorMessage = createUserFriendlyErrorMessage('UNKNOWN_ERROR', {
            programId,
            originalError: error.message
          })
          throw new Error(errorMessage)
        }
      }
    }
  }, 'updateCompleteProgram')
}

/**
 * Internal function to rollback program update operations
 * Restores the program to its previous state based on backup data and completed operations
 * @param {string} programId - The program ID to rollback
 * @param {Object} backupData - The backed up program state
 * @param {Array} completedSteps - Array of operation steps that were completed
 */
const rollbackProgramUpdate = async (programId, backupData, completedSteps) => {
  console.log('🔄 [ROLLBACK_START] Starting rollback operations:', {
    programId,
    completedSteps,
    backupWorkouts: backupData.program_workouts?.length || 0,
    backupExercises: backupData.program_workouts?.reduce((sum, w) => sum + (w.program_exercises?.length || 0), 0) || 0,
    timestamp: new Date().toISOString()
  })

  try {
    // If exercises were created, delete them first
    if (completedSteps.includes('exercises_created')) {
      console.log('🔄 [ROLLBACK] Removing newly created exercises:', { programId })
      
      const { data: currentWorkouts, error: fetchWorkoutsError } = await supabase
        .from('program_workouts')
        .select('id')
        .eq('program_id', programId)

      if (fetchWorkoutsError) {
        console.error('❌ [ROLLBACK_ERROR] Failed to fetch workouts for exercise cleanup:', {
          programId,
          error: fetchWorkoutsError.message
        })
        throw new Error(`Failed to fetch workouts during rollback: ${fetchWorkoutsError.message}`)
      }

      if (currentWorkouts && currentWorkouts.length > 0) {
        const workoutIds = currentWorkouts.map(w => w.id)
        
        const { error: deleteExercisesError } = await supabase
          .from('program_exercises')
          .delete()
          .in('workout_id', workoutIds)

        if (deleteExercisesError) {
          console.error('❌ [ROLLBACK_ERROR] Failed to delete exercises during rollback:', {
            programId,
            workoutIds,
            error: deleteExercisesError.message
          })
          throw new Error(`Failed to delete exercises during rollback: ${deleteExercisesError.message}`)
        }

        console.log('✅ [ROLLBACK_SUCCESS] Removed newly created exercises:', {
          programId,
          exerciseCount: workoutIds.length
        })
      }
    }

    // If workouts were created, delete them
    if (completedSteps.includes('workouts_created')) {
      console.log('🔄 [ROLLBACK] Removing newly created workouts:', { programId })
      
      const { error: deleteWorkoutsError } = await supabase
        .from('program_workouts')
        .delete()
        .eq('program_id', programId)

      if (deleteWorkoutsError) {
        console.error('❌ [ROLLBACK_ERROR] Failed to delete workouts during rollback:', {
          programId,
          error: deleteWorkoutsError.message
        })
        throw new Error(`Failed to delete workouts during rollback: ${deleteWorkoutsError.message}`)
      }

      console.log('✅ [ROLLBACK_SUCCESS] Removed newly created workouts:', { programId })
    }

    // Restore original workouts if they were deleted
    if (completedSteps.includes('workouts_deleted') && backupData.program_workouts) {
      console.log('🔄 [ROLLBACK] Restoring original workouts:', {
        programId,
        workoutCount: backupData.program_workouts.length
      })
      
      const workoutsToRestore = backupData.program_workouts.map(workout => ({
        program_id: programId,
        week_number: workout.week_number,
        day_number: workout.day_number,
        name: workout.name,
        created_at: workout.created_at,
        updated_at: workout.updated_at
      }))

      const { data: restoredWorkouts, error: restoreWorkoutsError } = await supabase
        .from('program_workouts')
        .insert(workoutsToRestore)
        .select()

      if (restoreWorkoutsError) {
        console.error('❌ [ROLLBACK_ERROR] Failed to restore workouts:', {
          programId,
          error: restoreWorkoutsError.message,
          workoutCount: workoutsToRestore.length
        })
        throw new Error(`Failed to restore workouts: ${restoreWorkoutsError.message}`)
      }

      console.log('✅ [ROLLBACK_SUCCESS] Restored original workouts:', {
        programId,
        restoredCount: restoredWorkouts.length
      })

      // Restore original exercises if they were deleted
      if (completedSteps.includes('exercises_deleted')) {
        console.log('🔄 [ROLLBACK] Restoring original exercises:', { programId })
        
        let totalExercisesRestored = 0
        
        for (const originalWorkout of backupData.program_workouts) {
          if (originalWorkout.program_exercises && originalWorkout.program_exercises.length > 0) {
            const restoredWorkout = restoredWorkouts.find(w =>
              w.week_number === originalWorkout.week_number && w.day_number === originalWorkout.day_number
            )

            if (restoredWorkout) {
              const exercisesToRestore = originalWorkout.program_exercises.map(exercise => ({
                workout_id: restoredWorkout.id,
                exercise_id: exercise.exercise_id,
                sets: exercise.sets,
                reps: exercise.reps,
                rest_minutes: exercise.rest_minutes,
                notes: exercise.notes,
                order_index: exercise.order_index,
                created_at: exercise.created_at,
                updated_at: exercise.updated_at
              }))

              const { error: restoreExercisesError } = await supabase
                .from('program_exercises')
                .insert(exercisesToRestore)

              if (restoreExercisesError) {
                console.error('❌ [ROLLBACK_ERROR] Failed to restore exercises for workout:', {
                  programId,
                  workoutId: restoredWorkout.id,
                  exerciseCount: exercisesToRestore.length,
                  error: restoreExercisesError.message
                })
                throw new Error(`Failed to restore exercises for workout ${restoredWorkout.id}: ${restoreExercisesError.message}`)
              }

              totalExercisesRestored += exercisesToRestore.length
            }
          }
        }

        console.log('✅ [ROLLBACK_SUCCESS] Restored original exercises:', {
          programId,
          exerciseCount: totalExercisesRestored
        })
      }
    }

    // Restore original program metadata if it was updated
    if (completedSteps.includes('program_updated')) {
      console.log('🔄 [ROLLBACK] Restoring original program metadata:', { programId })
      
      const originalProgramData = {
        name: backupData.name,
        weight_unit: backupData.weight_unit,
        duration: backupData.duration,
        days_per_week: backupData.days_per_week,
        is_template: backupData.is_template,
        is_active: backupData.is_active,
        is_current: backupData.is_current,
        difficulty: backupData.difficulty,
        goals: backupData.goals,
        equipment: backupData.equipment,
        description: backupData.description,
        completed_weeks: backupData.completed_weeks,
        start_date: backupData.start_date,
        updated_at: backupData.updated_at
      }

      const { error: restoreProgramError } = await supabase
        .from('programs')
        .update(originalProgramData)
        .eq('id', programId)

      if (restoreProgramError) {
        console.error('❌ [ROLLBACK_ERROR] Failed to restore program metadata:', {
          programId,
          error: restoreProgramError.message,
          originalData: originalProgramData
        })
        throw new Error(`Failed to restore program metadata: ${restoreProgramError.message}`)
      }

      console.log('✅ [ROLLBACK_SUCCESS] Restored original program metadata:', { programId })
    }

    console.log('✅ [ROLLBACK_SUCCESS] All rollback operations completed successfully:', {
      programId,
      completedSteps,
      timestamp: new Date().toISOString()
    })

  } catch (rollbackError) {
    console.error('❌ [ROLLBACK_ERROR] Rollback operation failed:', {
      programId,
      error: rollbackError.message,
      errorStack: rollbackError.stack,
      completedSteps,
      timestamp: new Date().toISOString()
    })
    throw rollbackError
  }
}

/**
 * Set program as current
 * Ensures only one program per user can be current at a time
 */
export const setCurrentProgram = async (programId, userId) => {
  return executeSupabaseOperation(async () => {
    // First, unset any existing current program for this user
    const { error: unsetError } = await supabase
      .from('programs')
      .update({
        is_current: false,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('is_current', true)

    if (unsetError) {
      console.error('Error unsetting previous current program:', unsetError)
      throw unsetError
    }

    // Then set the new program as current
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

    // Invalidate user program cache (affects all programs since current status changed)
    invalidateProgramCache(userId)

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

    // Invalidate user program cache
    invalidateProgramCache(userId)

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

    invalidateProgramCache(userId)

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

    // Invalidate user program cache to ensure copied program appears
    invalidateProgramCache(userId)

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

    // Invalidate user program cache
    invalidateProgramCache(data.user_id)

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
 * Update a specific exercise in a program workout
 */
export const updateProgramExercise = async (programId, weekNumber, dayNumber, oldExerciseId, newExerciseId) => {
  return executeSupabaseOperation(async () => {
    // Get the program with full workout structure to find the target exercise
    const program = await getProgramById(programId)

    // Find the specific workout for the given week and day
    const targetWorkout = program.program_workouts?.find(workout =>
      workout.week_number === weekNumber && workout.day_number === dayNumber
    )

    if (!targetWorkout) {
      throw new Error(`No workout found for week ${weekNumber}, day ${dayNumber}`)
    }

    // Find the specific exercise to replace within the workout
    const targetExercise = targetWorkout.program_exercises?.find(ex =>
      ex.exercise_id === oldExerciseId
    )

    if (!targetExercise) {
      throw new Error(`Exercise ${oldExerciseId} not found in workout`)
    }

    // Update the exercise in the program_exercises table
    const { data, error } = await supabase
      .from('program_exercises')
      .update({
        exercise_id: newExerciseId,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetExercise.id)
      .select()
      .single()

    if (error) throw error

    // Get the program to find the user_id for cache invalidation
    const { data: programData, error: programError } = await supabase
      .from('programs')
      .select('user_id')
      .eq('id', programId)
      .single()

    if (!programError && programData) {
      // Invalidate user program cache
      invalidateProgramCache(programData.user_id)
    }

    console.log(`Successfully updated exercise ${targetExercise.id} from ${oldExerciseId} to ${newExerciseId}`)
    return data
  }, 'updateProgramExercise')
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
}/**
 * Coa
ch-Specific Program Functions
 */

/**
 * Create a program assigned to a client by a coach
 * @param {Object} programData - Program data
 * @param {string} clientId - Client user ID
 * @param {Object} coachData - Coach assignment data
 * @returns {Promise<Object>} Created program
 */
export const createCoachAssignedProgram = async (programData, clientId, coachData = {}) => {
  return executeSupabaseOperation(async () => {
    const assignedProgramData = {
      ...programData,
      user_id: clientId, // Program belongs to client
      coach_assigned: true,
      assigned_to_client: clientId,
      assigned_at: new Date().toISOString(),
      coach_notes: coachData.notes || null,
      client_goals: coachData.goals || [],
      expected_duration_weeks: coachData.expectedDurationWeeks || null,
      program_difficulty: coachData.difficulty || null,
      visibility: 'coach_only'
    }

    const { data, error } = await supabase
      .from('programs')
      .insert([assignedProgramData])
      .select()
      .single()

    if (error) throw error

    // Invalidate cache for both coach and client
    invalidateProgramCache(programData.user_id) // Coach's cache
    invalidateProgramCache(clientId) // Client's cache

    console.log('Coach-assigned program created:', data.name, 'for client:', clientId)
    return data
  }, 'createCoachAssignedProgram')
}

/**
 * Get programs assigned by a coach to their clients
 * @param {string} coachId - Coach user ID
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Array of coach-assigned programs
 */
export const getCoachAssignedPrograms = async (coachId, filters = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('programs')
      .select(`
        *,
        client:users!assigned_to_client(
          id,
          name,
          email
        )
      `)
      .eq('user_id', coachId)
      .eq('coach_assigned', true)
      .order('assigned_at', { ascending: false })

    if (filters.clientId) {
      query = query.eq('assigned_to_client', filters.clientId)
    }

    if (filters.isActive !== undefined) {
      query = query.eq('is_active', filters.isActive)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'getCoachAssignedPrograms')
}

/**
 * Get programs assigned to a client by their coach
 * @param {string} clientId - Client user ID
 * @param {string} coachId - Optional coach ID filter
 * @returns {Promise<Array>} Array of programs assigned to client
 */
export const getClientAssignedPrograms = async (clientId, coachId = null) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('programs')
      .select(`
        *,
        coach:users!user_id(
          id,
          name,
          email
        )
      `)
      .eq('assigned_to_client', clientId)
      .eq('coach_assigned', true)
      .order('assigned_at', { ascending: false })

    if (coachId) {
      query = query.eq('user_id', coachId)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }, 'getClientAssignedPrograms')
}

/**
 * Update coach assignment details for a program
 * @param {string} programId - Program ID
 * @param {Object} updates - Coach assignment updates
 * @returns {Promise<Object>} Updated program
 */
export const updateCoachAssignment = async (programId, updates) => {
  return executeSupabaseOperation(async () => {
    const updateData = {
      coach_notes: updates.notes,
      client_goals: updates.goals,
      expected_duration_weeks: updates.expectedDurationWeeks,
      program_difficulty: updates.difficulty,
      updated_at: new Date().toISOString()
    }

    // Remove undefined values
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key]
      }
    })

    const { data, error } = await supabase
      .from('programs')
      .update(updateData)
      .eq('id', programId)
      .eq('coach_assigned', true)
      .select()
      .single()

    if (error) throw error

    // Invalidate cache for both coach and client
    invalidateProgramCache(data.user_id) // Coach's cache
    if (data.assigned_to_client) {
      invalidateProgramCache(data.assigned_to_client) // Client's cache
    }

    console.log('Coach assignment updated for program:', data.name)
    return data
  }, 'updateCoachAssignment')
}

/**
 * Unassign a program from a client (remove coach assignment)
 * @param {string} programId - Program ID
 * @returns {Promise<Object>} Updated program
 */
export const unassignProgram = async (programId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('programs')
      .update({
        coach_assigned: false,
        assigned_to_client: null,
        assigned_at: null,
        coach_notes: null,
        client_goals: [],
        visibility: 'private',
        updated_at: new Date().toISOString()
      })
      .eq('id', programId)
      .select()
      .single()

    if (error) throw error

    // Invalidate cache for coach
    invalidateProgramCache(data.user_id)

    console.log('Program unassigned:', data.name)
    return data
  }, 'unassignProgram')
}

/**
 * Get programs accessible by a coach for a specific client
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<Array>} Array of accessible programs
 */
export const getCoachAccessiblePrograms = async (coachId, clientId) => {
  return executeSupabaseOperation(async () => {
    // Get programs created by the client that the coach can view
    const { data: clientPrograms, error: clientError } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', clientId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (clientError) throw clientError

    // Get programs assigned by this coach to this client
    const { data: assignedPrograms, error: assignedError } = await supabase
      .from('programs')
      .select('*')
      .eq('user_id', coachId)
      .eq('assigned_to_client', clientId)
      .eq('coach_assigned', true)
      .order('assigned_at', { ascending: false })

    if (assignedError) throw assignedError

    return {
      clientPrograms: clientPrograms || [],
      assignedPrograms: assignedPrograms || []
    }
  }, 'getCoachAccessiblePrograms')
}

/**
 * Copy a program and assign it to a client
 * @param {string} sourceProgramId - Source program ID to copy
 * @param {string} clientId - Client to assign the copied program to
 * @param {Object} coachData - Coach assignment data
 * @returns {Promise<Object>} Copied and assigned program
 */
export const copyAndAssignProgram = async (sourceProgramId, clientId, coachData = {}) => {
  return executeSupabaseOperation(async () => {
    // First copy the program
    const newProgramData = {
      name: coachData.name || `Assigned Program - ${new Date().toLocaleDateString()}`,
      description: coachData.description || 'Program assigned by coach',
      is_template: false,
      is_active: true,
      coach_assigned: true,
      assigned_to_client: clientId,
      assigned_at: new Date().toISOString(),
      coach_notes: coachData.notes || null,
      client_goals: coachData.goals || [],
      expected_duration_weeks: coachData.expectedDurationWeeks || null,
      program_difficulty: coachData.difficulty || null,
      visibility: 'coach_only'
    }

    const copiedProgram = await copyProgram(sourceProgramId, newProgramData, coachData.coachId)

    console.log('Program copied and assigned:', copiedProgram.name, 'to client:', clientId)
    return copiedProgram
  }, 'copyAndAssignProgram')
}

/**
 * Get program assignment statistics for a coach
 * @param {string} coachId - Coach user ID
 * @returns {Promise<Object>} Assignment statistics
 */
export const getCoachProgramStats = async (coachId) => {
  return executeSupabaseOperation(async () => {
    const { data: assignedPrograms, error } = await supabase
      .from('programs')
      .select('id, assigned_to_client, is_active, assigned_at')
      .eq('user_id', coachId)
      .eq('coach_assigned', true)

    if (error) throw error

    const programs = assignedPrograms || []
    const totalAssigned = programs.length
    const activeAssignments = programs.filter(p => p.is_active).length
    const uniqueClients = new Set(programs.map(p => p.assigned_to_client)).size

    // Get recent assignments (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const recentAssignments = programs.filter(p => 
      new Date(p.assigned_at) > thirtyDaysAgo
    ).length

    return {
      totalAssigned,
      activeAssignments,
      uniqueClients,
      recentAssignments
    }
  }, 'getCoachProgramStats')
}