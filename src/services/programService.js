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
 * Get all programs for a user (with caching)
 * Enhanced to fetch related workout and exercise data and transform to expected format
 */
export const getUserPrograms = async (userId, filters = {}) => {
  return executeSupabaseOperation(async () => {
    const startTime = performance.now();
    
    // Create cache key based on user ID and filters
    // Include version identifier to distinguish enhanced queries with workout/exercise data
    const filterKey = Object.keys(filters).sort().map(key => `${key}:${filters[key]}`).join('_')
    const cacheKey = `user_programs_enhanced_${userId}_${filterKey}`

    console.log('🔍 [PROGRAM_SERVICE] getUserPrograms called:', {
      userId,
      filters,
      filterKey,
      cacheKey,
      timestamp: new Date().toISOString()
    });

    return supabaseCache.getWithCache(
      cacheKey,
      async () => {
        console.log('💾 [CACHE_MISS] Cache miss for getUserPrograms, fetching from database:', {
          cacheKey,
          userId,
          filters
        });

        const queryStartTime = performance.now();
        
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

        // Apply filters
        if (filters.isActive !== undefined) {
          query = query.eq('is_active', filters.isActive)
          console.log('🔧 [QUERY_FILTER] Applied isActive filter:', filters.isActive);
        }

        if (filters.isCurrent !== undefined) {
          query = query.eq('is_current', filters.isCurrent)
          console.log('🔧 [QUERY_FILTER] Applied isCurrent filter:', filters.isCurrent);
        }

        if (filters.isTemplate !== undefined) {
          query = query.eq('is_template', filters.isTemplate)
          console.log('🔧 [QUERY_FILTER] Applied isTemplate filter:', filters.isTemplate);
        }

        if (filters.difficulty) {
          query = query.eq('difficulty', filters.difficulty)
          console.log('🔧 [QUERY_FILTER] Applied difficulty filter:', filters.difficulty);
        }

        const { data, error } = await query
        const queryEndTime = performance.now();
        const queryTime = queryEndTime - queryStartTime;

        if (error) {
          console.error('❌ [DATABASE_ERROR] Error fetching programs:', {
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            userId,
            filters,
            queryTimeMs: Math.round(queryTime * 100) / 100
          });
          throw error;
        }

        console.log('📊 [DATABASE_SUCCESS] Programs fetched successfully:', {
          programCount: data?.length || 0,
          queryTimeMs: Math.round(queryTime * 100) / 100,
          userId,
          filters
        });

        console.log("📋 [RAW_DATA] Raw program data from database:", data);

        // Transform each program to include weekly_configs
        const transformStartTime = performance.now();
        const transformedPrograms = (data || []).map((program, index) => {
          console.log(`🔄 [TRANSFORM_START] Processing program ${index + 1}/${data.length}:`, {
            programId: program.id,
            programName: program.name,
            hasWorkouts: !!program.program_workouts,
            workoutCount: program.program_workouts?.length || 0
          });

          // Sort workouts by week and day before transformation
          if (program.program_workouts) {
            const originalOrder = program.program_workouts.map(w => ({ week: w.week_number, day: w.day_number }));
            
            program.program_workouts.sort((a, b) => {
              if (a.week_number !== b.week_number) {
                return a.week_number - b.week_number
              }
              return a.day_number - b.day_number
            })

            console.log(`📅 [WORKOUT_SORT] Sorted workouts for program ${program.id}:`, {
              originalOrder,
              sortedOrder: program.program_workouts.map(w => ({ week: w.week_number, day: w.day_number }))
            });

            // Sort exercises within each workout by order_index
            program.program_workouts.forEach((workout, workoutIndex) => {
              if (workout.program_exercises) {
                const originalExerciseOrder = workout.program_exercises.map(e => ({ id: e.exercise_id, order: e.order_index }));
                
                workout.program_exercises.sort((a, b) => a.order_index - b.order_index)
                
                console.log(`💪 [EXERCISE_SORT] Sorted exercises for workout ${workoutIndex + 1}:`, {
                  workoutId: workout.id,
                  originalOrder: originalExerciseOrder,
                  sortedOrder: workout.program_exercises.map(e => ({ id: e.exercise_id, order: e.order_index }))
                });
              }
            })
          }

          // Apply transformation to convert normalized data to weekly_configs format
          const transformedProgram = transformSupabaseProgramToWeeklyConfigs(program);
          
          console.log(`✅ [TRANSFORM_COMPLETE] Program ${index + 1} transformed:`, {
            programId: program.id,
            hasWeeklyConfigs: !!transformedProgram.weekly_configs,
            weeklyConfigsKeys: Object.keys(transformedProgram.weekly_configs || {}).length
          });

          return transformedProgram;
        })

        const transformEndTime = performance.now();
        const transformTime = transformEndTime - transformStartTime;

        console.log('🎯 [TRANSFORM_SUMMARY] All programs transformed:', {
          totalPrograms: data?.length || 0,
          transformTimeMs: Math.round(transformTime * 100) / 100,
          averageTransformTimeMs: data?.length ? Math.round((transformTime / data.length) * 100) / 100 : 0
        });

        console.log("🔄 [TRANSFORMED_DATA] Final transformed programs:", transformedPrograms);

        return transformedPrograms
      },
      {
        ttl: PROGRAM_CACHE_TTL,
        table: 'programs',
        userId: userId,
        tags: ['programs', 'user'],
        onCacheHit: (cachedData) => {
          const endTime = performance.now();
          const totalTime = endTime - startTime;
          
          console.log('🎯 [CACHE_HIT] Cache hit for getUserPrograms:', {
            cacheKey,
            userId,
            filters,
            programCount: cachedData?.length || 0,
            totalTimeMs: Math.round(totalTime * 100) / 100,
            ttl: PROGRAM_CACHE_TTL
          });
        },
        onCacheSet: (data) => {
          console.log('💾 [CACHE_SET] Data cached for getUserPrograms:', {
            cacheKey,
            userId,
            filters,
            programCount: data?.length || 0,
            ttl: PROGRAM_CACHE_TTL
          });
        }
      }
    )
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

    // Invalidate user program cache to ensure new program appears
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating program cache after creation:', {
      userId: programData.user_id,
      programId: data.id,
      programName: data.name,
      reason: 'program-created'
    });
    
    invalidateProgramCache(programData.user_id)
    
    // Also invalidate user cache patterns that include programs (both old and new formats)
    const cacheKeysToInvalidate = [`user_programs_${programData.user_id}`, `user_programs_enhanced_${programData.user_id}`, `programs_user_${programData.user_id}`];
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating specific cache keys:', {
      keys: cacheKeysToInvalidate,
      reason: 'program-created'
    });
    
    supabaseCache.invalidate(cacheKeysToInvalidate, {
      reason: 'program-created'
    })

    console.log('✅ [PROGRAM_CREATED] Program created successfully:', {
      programId: data.id,
      programName: data.name,
      userId: programData.user_id
    })
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

    // Invalidate user program cache to ensure new program appears
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating program cache after complete program creation:', {
      userId: programData.user_id,
      programId: program.id,
      programName: program.name,
      workoutCount: workouts.length,
      exerciseCount: allExercises.length,
      reason: 'complete-program-created'
    });
    
    invalidateProgramCache(programData.user_id)
    
    // Also invalidate user cache patterns that include programs (both old and new formats)
    const cacheKeysToInvalidate = [`user_programs_${programData.user_id}`, `user_programs_enhanced_${programData.user_id}`, `programs_user_${programData.user_id}`];
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating specific cache keys:', {
      keys: cacheKeysToInvalidate,
      reason: 'complete-program-created'
    });
    
    supabaseCache.invalidate(cacheKeysToInvalidate, {
      reason: 'complete-program-created'
    })

    console.log('✅ [COMPLETE_PROGRAM_CREATED] Complete program created successfully:', {
      programId: program.id,
      programName: program.name,
      userId: programData.user_id,
      workoutCount: workouts.length,
      exerciseCount: allExercises.length
    })
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

    // Invalidate program-specific cache (both old and new formats)
    const programCacheKeys = [`program_full_${programId}`, `program_enhanced_${programId}`];
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating program-specific cache after update:', {
      programId,
      programName: data.name,
      keys: programCacheKeys,
      reason: 'program-updated'
    });
    
    supabaseCache.invalidate(programCacheKeys, {
      reason: 'program-updated'
    })
    
    // Invalidate user program cache
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating user program cache after update:', {
      userId: data.user_id,
      programId,
      reason: 'program-updated'
    });
    
    invalidateProgramCache(data.user_id)
    
    // Also invalidate user cache patterns that include programs (both old and new formats)
    const userCacheKeys = [`user_programs_${data.user_id}`, `user_programs_enhanced_${data.user_id}`, `programs_user_${data.user_id}`];
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating user cache patterns after update:', {
      keys: userCacheKeys,
      reason: 'program-updated'
    });
    
    supabaseCache.invalidate(userCacheKeys, {
      reason: 'program-updated'
    })

    console.log('✅ [PROGRAM_UPDATED] Program updated successfully:', {
      programId,
      programName: data.name,
      userId: data.user_id,
      updatedFields: Object.keys(updates)
    })
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

    // Invalidate program-specific cache (both old and new formats)
    supabaseCache.invalidate([`program_full_${programId}`, `program_enhanced_${programId}`], {
      reason: 'program-set-current'
    })
    
    // Invalidate user program cache (affects all programs since current status changed)
    invalidateProgramCache(userId)
    
    // Also invalidate user cache patterns that include programs (both old and new formats)
    supabaseCache.invalidate([`user_programs_${userId}`, `user_programs_enhanced_${userId}`, `programs_user_${userId}`], {
      reason: 'program-set-current'
    })

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

    // Invalidate program-specific cache (both old and new formats)
    supabaseCache.invalidate([`program_full_${programId}`, `program_enhanced_${programId}`], {
      reason: 'program-deactivated'
    })
    
    // Invalidate user program cache
    invalidateProgramCache(userId)
    
    // Also invalidate user cache patterns that include programs (both old and new formats)
    supabaseCache.invalidate([`user_programs_${userId}`, `user_programs_enhanced_${userId}`, `programs_user_${userId}`], {
      reason: 'program-deactivated'
    })

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

    // Invalidate program-specific cache (both old and new formats)
    const programCacheKeys = [`program_full_${programId}`, `program_enhanced_${programId}`];
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating program-specific cache after deletion:', {
      programId,
      userId,
      keys: programCacheKeys,
      reason: 'program-deleted'
    });
    
    supabaseCache.invalidate(programCacheKeys, {
      reason: 'program-deleted'
    })
    
    // Invalidate user program cache
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating user program cache after deletion:', {
      userId,
      programId,
      reason: 'program-deleted'
    });
    
    invalidateProgramCache(userId)
    
    // Also invalidate user cache patterns that include programs (both old and new formats)
    const userCacheKeys = [`user_programs_${userId}`, `user_programs_enhanced_${userId}`, `programs_user_${userId}`];
    console.log('🗑️ [CACHE_INVALIDATE] Invalidating user cache patterns after deletion:', {
      keys: userCacheKeys,
      reason: 'program-deleted'
    });
    
    supabaseCache.invalidate(userCacheKeys, {
      reason: 'program-deleted'
    })

    console.log('✅ [PROGRAM_DELETED] Program deleted successfully:', {
      programId,
      userId
    })
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
    
    // Also invalidate user cache patterns that include programs (both old and new formats)
    supabaseCache.invalidate([`user_programs_${userId}`, `user_programs_enhanced_${userId}`, `programs_user_${userId}`], {
      reason: 'program-copied'
    })

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

    // Invalidate program-specific cache (both old and new formats)
    supabaseCache.invalidate([`program_full_${programId}`, `program_enhanced_${programId}`], {
      reason: 'program-progress-updated'
    })
    
    // Invalidate user program cache
    invalidateProgramCache(data.user_id)
    
    // Also invalidate user cache patterns that include programs (both old and new formats)
    supabaseCache.invalidate([`user_programs_${data.user_id}`, `user_programs_enhanced_${data.user_id}`, `programs_user_${data.user_id}`], {
      reason: 'program-progress-updated'
    })

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

    // Invalidate program-specific cache since exercise data changed (both old and new formats)
    supabaseCache.invalidate([`program_full_${programId}`, `program_enhanced_${programId}`], {
      reason: 'program-exercise-updated'
    })
    
    // Get the program to find the user_id for cache invalidation
    const { data: programData, error: programError } = await supabase
      .from('programs')
      .select('user_id')
      .eq('id', programId)
      .single()
    
    if (!programError && programData) {
      // Invalidate user program cache
      invalidateProgramCache(programData.user_id)
      
      // Also invalidate user cache patterns that include programs (both old and new formats)
      supabaseCache.invalidate([`user_programs_${programData.user_id}`, `user_programs_enhanced_${programData.user_id}`, `programs_user_${programData.user_id}`], {
        reason: 'program-exercise-updated'
      })
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
}