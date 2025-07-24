import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: any
  old_record?: any
  schema: string
}

serve(async (req) => {
  try {
    // Initialize Supabase client with service role key
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Parse the webhook payload
    const payload: WebhookPayload = await req.json()
    
    console.log('Received webhook:', payload.type, payload.table)

    // Handle workout completion trigger
    if (payload.table === 'workout_logs' && payload.type === 'UPDATE') {
      const newRecord = payload.record
      const oldRecord = payload.old_record

      // Check if workout was just marked as finished
      if (newRecord.is_finished === true && oldRecord?.is_finished !== true) {
        console.log(`Workout ${newRecord.id} completed for user ${newRecord.user_id}`)
        
        // Trigger analytics processing
        await processWorkoutAnalytics(supabaseClient, newRecord.id, newRecord.user_id)
        
        // Update user statistics
        await updateUserStatistics(supabaseClient, newRecord.user_id)
        
        return new Response(
          JSON.stringify({ success: true, message: 'Workout processed' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Handle exercise analytics updates
    if (payload.table === 'user_analytics' && payload.type === 'UPDATE') {
      const newRecord = payload.record
      
      // Check for new PRs and update user achievements
      if (newRecord.pr_date && newRecord.pr_date !== payload.old_record?.pr_date) {
        console.log(`New PR detected for user ${newRecord.user_id} on exercise ${newRecord.exercise_id}`)
        await recordAchievement(supabaseClient, newRecord.user_id, 'pr', {
          exercise_id: newRecord.exercise_id,
          e1rm: newRecord.e1rm,
          date: newRecord.pr_date
        })
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Webhook processed' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error processing webhook:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

async function processWorkoutAnalytics(supabaseClient: any, workoutLogId: string, userId: string) {
  try {
    // This would typically call the process-workout function
    // For now, we'll do basic analytics updates
    
    // Get workout data
    const { data: workout } = await supabaseClient
      .from('workout_logs')
      .select(`
        *,
        workout_log_exercises (
          *,
          exercises (name, primary_muscle_group, exercise_type)
        )
      `)
      .eq('id', workoutLogId)
      .single()

    if (!workout) return

    // Update workout count for user
    const { data: userStats } = await supabaseClient
      .from('user_statistics')
      .select('*')
      .eq('user_id', userId)
      .single()

    const totalWorkouts = (userStats?.total_workouts || 0) + 1
    const totalVolume = workout.workout_log_exercises.reduce((sum: number, ex: any) => {
      const exerciseVolume = ex.reps.reduce((exSum: number, reps: number, i: number) => {
        return ex.completed[i] ? exSum + (reps * ex.weights[i]) : exSum
      }, 0)
      return sum + exerciseVolume
    }, 0)

    await supabaseClient
      .from('user_statistics')
      .upsert({
        user_id: userId,
        total_workouts: totalWorkouts,
        total_volume: (userStats?.total_volume || 0) + totalVolume,
        last_workout_date: workout.completed_date || workout.date,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    console.log(`Updated user statistics for ${userId}`)

  } catch (error) {
    console.error('Error processing workout analytics:', error)
  }
}

async function updateUserStatistics(supabaseClient: any, userId: string) {
  try {
    // Calculate aggregate statistics
    const { data: analytics } = await supabaseClient
      .from('user_analytics')
      .select('*')
      .eq('user_id', userId)

    if (!analytics || analytics.length === 0) return

    const totalE1RM = analytics.reduce((sum: number, a: any) => sum + (a.e1rm || 0), 0)
    const avgE1RM = totalE1RM / analytics.length
    const totalEffectiveReps = analytics.reduce((sum: number, a: any) => sum + (a.effective_reps || 0), 0)
    const strongestExercise = analytics.reduce((max: any, current: any) => 
      (current.e1rm || 0) > (max.e1rm || 0) ? current : max
    )

    // Update user profile with calculated stats
    await supabaseClient
      .from('user_statistics')
      .upsert({
        user_id: userId,
        avg_e1rm: Math.round(avgE1RM),
        total_effective_reps: totalEffectiveReps,
        strongest_exercise_id: strongestExercise.exercise_id,
        strongest_exercise_e1rm: strongestExercise.e1rm,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })

    console.log(`Updated aggregate statistics for user ${userId}`)

  } catch (error) {
    console.error('Error updating user statistics:', error)
  }
}

async function recordAchievement(supabaseClient: any, userId: string, type: string, data: any) {
  try {
    await supabaseClient
      .from('user_achievements')
      .insert({
        user_id: userId,
        achievement_type: type,
        achievement_data: data,
        achieved_at: new Date().toISOString()
      })

    console.log(`Recorded ${type} achievement for user ${userId}`)

  } catch (error) {
    console.error('Error recording achievement:', error)
  }
}