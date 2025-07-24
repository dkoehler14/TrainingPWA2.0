import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
    WorkoutProcessRequest,
    ExerciseSet,
    UserAnalytics,
    REP_RANGES,
    RPE_TO_PERCENTAGE,
    PRRecord
} from '../_shared/types.ts'

serve(async (req: Request) => {
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
        const { workoutLogId }: WorkoutProcessRequest = await req.json()

        if (!workoutLogId) {
            return new Response(
                JSON.stringify({ error: 'workoutLogId is required' }),
                {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        console.log(`Processing workout ${workoutLogId} for user ${user.id}`)

        // Fetch workout log with exercises
        const { data: workoutLog, error: workoutError } = await supabaseClient
            .from('workout_logs')
            .select(`
        *,
        workout_log_exercises (
          *,
          exercises (
            name,
            primary_muscle_group,
            exercise_type,
            is_global
          )
        )
      `)
            .eq('id', workoutLogId)
            .eq('user_id', user.id)
            .single()

        if (workoutError || !workoutLog) {
            return new Response(
                JSON.stringify({ error: 'Workout log not found' }),
                {
                    status: 404,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            )
        }

        // Get user bodyweight for bodyweight exercises
        const { data: userData } = await supabaseClient
            .from('users')
            .select('weight')
            .eq('auth_id', user.id)
            .single()

        const userBodyweight = userData?.weight || 0

        // Helper functions
        const calculateE1RM = (weight: number, reps: number): number => {
            if (reps <= 0) return 0
            return weight * (1 + (reps / 30))
        }

        const calculateEffectiveRPE = (weight: number, reps: number, e1RM: number): number => {
            if (e1RM === 0) return 5
            const percentage = weight / e1RM
            const repAdjustment = Math.max(0, (reps - 5) * 0.02)
            const adjustedPercentage = percentage + repAdjustment

            let closestRPE = 5
            let minDiff = Infinity

            for (const [rpe, pct] of Object.entries(RPE_TO_PERCENTAGE)) {
                const diff = Math.abs(adjustedPercentage - pct)
                if (diff < minDiff) {
                    minDiff = diff
                    closestRPE = parseFloat(rpe)
                }
            }

            return closestRPE
        }

        const calculateEffectiveReps = (sets: ExerciseSet[], e1RM: number): number => {
            let effectiveReps = 0

            for (const set of sets) {
                if (set.reps > 0 && set.weight > 0 && set.completed) {
                    const rpe = calculateEffectiveRPE(set.weight, set.reps, e1RM)
                    if (rpe >= 7) {
                        const rpeMultiplier = Math.min(2.0, (rpe - 6) / 4)
                        effectiveReps += set.reps * rpeMultiplier
                    }
                }
            }

            return Math.round(effectiveReps)
        }

        const getRepRangeCategory = (reps: number): string => {
            for (const [category, range] of Object.entries(REP_RANGES)) {
                if (reps >= range.min && reps <= range.max) {
                    return category
                }
            }
            return '15RM'
        }

        // Process each exercise in the workout
        for (const logExercise of workoutLog.workout_log_exercises) {
            const exerciseId = logExercise.exercise_id
            const exercise = logExercise.exercises

            if (!exercise) continue

            console.log(`Processing exercise: ${exercise.name}`)

            // Convert arrays to sets format for processing
            const sets: ExerciseSet[] = []
            const numSets = Math.min(
                logExercise.reps.length,
                logExercise.weights.length,
                logExercise.completed.length
            )

            for (let i = 0; i < numSets; i++) {
                if (logExercise.completed[i]) {
                    let effectiveWeight = logExercise.weights[i]

                    // Handle bodyweight exercises
                    if (exercise.exercise_type === 'Bodyweight') {
                        effectiveWeight = userBodyweight
                    } else if (exercise.exercise_type === 'Bodyweight Loadable') {
                        effectiveWeight = userBodyweight + logExercise.weights[i]
                    }

                    sets.push({
                        weight: effectiveWeight,
                        reps: logExercise.reps[i],
                        completed: true
                    })
                }
            }

            if (sets.length === 0) continue

            // Calculate analytics for this exercise
            let workoutE1RM = 0
            let workoutVolume = 0
            let workoutTotalReps = 0
            const workoutTotalSets = sets.length
            const intensityDistribution: Record<string, number> = {}
            const prsByRepRange: Record<string, any> = {}

            // Get current e1RM for intensity calculations
            const { data: currentAnalytics } = await supabaseClient
                .from('user_analytics')
                .select('e1rm')
                .eq('user_id', user.id)
                .eq('exercise_id', exerciseId)
                .single()

            const currentE1RM = currentAnalytics?.e1rm || 0

            for (const set of sets) {
                const setE1RM = calculateE1RM(set.weight, set.reps)
                if (setE1RM > workoutE1RM) {
                    workoutE1RM = setE1RM
                }

                workoutVolume += set.weight * set.reps
                workoutTotalReps += set.reps

                // Calculate intensity percentage
                if (currentE1RM > 0) {
                    const intensityPercent = Math.round((set.weight / currentE1RM) * 100)
                    const intensityBucket = Math.floor(intensityPercent / 10) * 10
                    intensityDistribution[intensityBucket.toString()] =
                        (intensityDistribution[intensityBucket.toString()] || 0) + 1
                }

                // Track PRs by rep range
                const repRange = getRepRangeCategory(set.reps)
                if (!prsByRepRange[repRange] || setE1RM > prsByRepRange[repRange].e1RM) {
                    prsByRepRange[repRange] = {
                        e1RM: setE1RM,
                        weight: set.weight,
                        reps: set.reps,
                        date: workoutLog.completed_date || workoutLog.date
                    } as PRRecord
                }
            }

            const workoutEffectiveReps = calculateEffectiveReps(sets, currentE1RM)

            // Get existing analytics or create new
            const { data: existingAnalytics } = await supabaseClient
                .from('user_analytics')
                .select('*')
                .eq('user_id', user.id)
                .eq('exercise_id', exerciseId)
                .single()

            const updatedAnalytics: Partial<UserAnalytics> = {
                user_id: user.id,
                exercise_id: exerciseId,
                total_volume: (existingAnalytics?.total_volume || 0) + workoutVolume,
                max_weight: Math.max(existingAnalytics?.max_weight || 0, Math.max(...sets.map(s => s.weight))),
                total_reps: (existingAnalytics?.total_reps || 0) + workoutTotalReps,
                total_sets: (existingAnalytics?.total_sets || 0) + workoutTotalSets,
                last_workout_date: workoutLog.completed_date || workoutLog.date,
                e1rm: Math.max(existingAnalytics?.e1rm || 0, workoutE1RM),
                effective_reps: (existingAnalytics?.effective_reps || 0) + workoutEffectiveReps,
                intensity_distribution: {
                    ...existingAnalytics?.intensity_distribution,
                    ...intensityDistribution
                },
                prs_by_rep_range: {
                    ...existingAnalytics?.prs_by_rep_range,
                    ...prsByRepRange
                },
                staleness_score: 0, // Will be calculated separately
                plateau_data: existingAnalytics?.plateau_data || {}
            }

            // Update PR date if new PR achieved
            if (workoutE1RM > (existingAnalytics?.e1rm || 0)) {
                updatedAnalytics.pr_date = workoutLog.completed_date || workoutLog.date
            }

            // Upsert analytics
            const { error: upsertError } = await supabaseClient
                .from('user_analytics')
                .upsert(updatedAnalytics, {
                    onConflict: 'user_id,exercise_id'
                })

            if (upsertError) {
                console.error('Error upserting analytics:', upsertError)
            } else {
                console.log(`Updated analytics for exercise ${exercise.name}`)
            }
        }

        // Mark workout as processed if not already
        if (!workoutLog.is_finished) {
            await supabaseClient
                .from('workout_logs')
                .update({
                    is_finished: true,
                    completed_date: new Date().toISOString()
                })
                .eq('id', workoutLogId)
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Workout processed successfully',
                exercisesProcessed: workoutLog.workout_log_exercises.length
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )

    } catch (error) {
        console.error('Error processing workout:', error)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        )
    }
})