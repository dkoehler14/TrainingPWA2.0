import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { 
  CoachingInsight, 
  UserAnalyticsWithExercise 
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

    console.log(`Generating coaching insights for user ${user.id}`)

    const insights: CoachingInsight[] = []

    // Get user analytics with exercise details
    const { data: userAnalytics, error: analyticsError } = await supabaseClient
      .from('user_analytics')
      .select(`
        *,
        exercises (
          name,
          primary_muscle_group,
          exercise_type
        )
      `)
      .eq('user_id', user.id)
      .order('last_workout_date', { ascending: false })

    if (analyticsError) {
      console.error('Error fetching analytics:', analyticsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch analytics' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!userAnalytics || userAnalytics.length === 0) {
      return new Response(
        JSON.stringify({ 
          insights: [{
            type: 'progression',
            title: 'Start Your Fitness Journey',
            message: 'Complete a few workouts to get personalized coaching insights!',
            priority: 'medium',
            actionable: true
          }]
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get recent workout logs for trend analysis
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: recentWorkouts } = await supabaseClient
      .from('workout_logs')
      .select(`
        *,
        workout_log_exercises (
          exercise_id,
          sets,
          reps,
          weights,
          completed
        )
      `)
      .eq('user_id', user.id)
      .eq('is_finished', true)
      .gte('completed_date', thirtyDaysAgo.toISOString())
      .order('completed_date', { ascending: false })

    // 1. Strength Progress Analysis
    const strengthProgress = analyzeStrengthProgress(userAnalytics)
    if (strengthProgress.length > 0) {
      insights.push(...strengthProgress)
    }

    // 2. Muscle Group Balance Analysis
    const balanceInsights = analyzeMuscleGroupBalance(userAnalytics)
    if (balanceInsights.length > 0) {
      insights.push(...balanceInsights)
    }

    // 3. Workout Frequency Analysis
    if (recentWorkouts) {
      const frequencyInsights = analyzeWorkoutFrequency(recentWorkouts)
      if (frequencyInsights.length > 0) {
        insights.push(...frequencyInsights)
      }
    }

    // 4. Volume and Intensity Analysis
    const volumeInsights = analyzeVolumeAndIntensity(userAnalytics)
    if (volumeInsights.length > 0) {
      insights.push(...volumeInsights)
    }

    // 5. Plateau Detection
    const plateauInsights = detectPlateaus(userAnalytics)
    if (plateauInsights.length > 0) {
      insights.push(...plateauInsights)
    }

    // Sort insights by priority
    const priorityOrder = { high: 3, medium: 2, low: 1 }
    insights.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])

    return new Response(
      JSON.stringify({ 
        insights: insights.slice(0, 10), // Limit to top 10 insights
        summary: {
          totalExercises: userAnalytics.length,
          recentWorkouts: recentWorkouts?.length || 0,
          avgE1RM: userAnalytics.reduce((sum: number, a: UserAnalyticsWithExercise) => sum + (a.e1rm || 0), 0) / userAnalytics.length
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error generating coaching insights:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

function analyzeStrengthProgress(analytics: UserAnalyticsWithExercise[]): CoachingInsight[] {
  const insights: CoachingInsight[] = []
  
  // Find exercises with significant progress
  const progressingExercises = analytics.filter(a => {
    const daysSinceLastWorkout = Math.floor(
      (Date.now() - new Date(a.last_workout_date).getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysSinceLastWorkout <= 14 && a.e1rm > 0
  })

  if (progressingExercises.length > 0) {
    const topExercise = progressingExercises.reduce((max, current) => 
      current.e1rm > max.e1rm ? current : max
    )

    insights.push({
      type: 'strength',
      title: 'Strength Leader',
      message: `Your strongest exercise is ${topExercise.exercises.name} with an estimated 1RM of ${Math.round(topExercise.e1rm)} lbs. Keep pushing those limits!`,
      priority: 'medium',
      actionable: false,
      data: { exercise: topExercise.exercises.name, e1rm: topExercise.e1rm }
    })
  }

  // Find exercises that haven't been trained recently
  const staleExercises = analytics.filter(a => {
    const daysSinceLastWorkout = Math.floor(
      (Date.now() - new Date(a.last_workout_date).getTime()) / (1000 * 60 * 60 * 24)
    )
    return daysSinceLastWorkout > 14
  })

  if (staleExercises.length > 0) {
    insights.push({
      type: 'frequency',
      title: 'Neglected Exercises',
      message: `You haven't trained ${staleExercises.length} exercises in over 2 weeks. Consider adding them back to maintain strength.`,
      priority: 'medium',
      actionable: true,
      data: { count: staleExercises.length, exercises: staleExercises.map(e => e.exercises.name) }
    })
  }

  return insights
}

function analyzeMuscleGroupBalance(analytics: UserAnalyticsWithExercise[]): CoachingInsight[] {
  const insights: CoachingInsight[] = []
  
  // Group by muscle group and calculate averages
  const muscleGroups: Record<string, { totalE1RM: number, count: number, exercises: string[] }> = {}
  
  analytics.forEach(a => {
    const muscleGroup = a.exercises.primary_muscle_group
    if (!muscleGroups[muscleGroup]) {
      muscleGroups[muscleGroup] = { totalE1RM: 0, count: 0, exercises: [] }
    }
    muscleGroups[muscleGroup].totalE1RM += a.e1rm || 0
    muscleGroups[muscleGroup].count += 1
    muscleGroups[muscleGroup].exercises.push(a.exercises.name)
  })

  // Calculate average strength per muscle group
  const muscleGroupStrengths = Object.entries(muscleGroups).map(([group, data]) => ({
    group,
    avgStrength: data.totalE1RM / data.count,
    exerciseCount: data.count,
    exercises: data.exercises
  })).sort((a, b) => b.avgStrength - a.avgStrength)

  // Check for imbalances
  if (muscleGroupStrengths.length >= 2) {
    const strongest = muscleGroupStrengths[0]
    const weakest = muscleGroupStrengths[muscleGroupStrengths.length - 1]
    
    const ratio = strongest.avgStrength / weakest.avgStrength
    if (ratio > 2) {
      insights.push({
        type: 'balance',
        title: 'Muscle Imbalance Detected',
        message: `Your ${strongest.group} is significantly stronger than your ${weakest.group}. Consider focusing more on ${weakest.group} exercises.`,
        priority: 'high',
        actionable: true,
        data: { strongest: strongest.group, weakest: weakest.group, ratio }
      })
    }
  }

  // Check for underdeveloped muscle groups
  const underDevelopedGroups = muscleGroupStrengths.filter(mg => mg.exerciseCount < 2)
  if (underDevelopedGroups.length > 0) {
    insights.push({
      type: 'balance',
      title: 'Expand Exercise Variety',
      message: `Consider adding more exercises for: ${underDevelopedGroups.map(g => g.group).join(', ')}. Variety helps prevent plateaus.`,
      priority: 'medium',
      actionable: true,
      data: { groups: underDevelopedGroups.map(g => g.group) }
    })
  }

  return insights
}

function analyzeWorkoutFrequency(workouts: any[]): CoachingInsight[] {
  const insights: CoachingInsight[] = []
  
  if (workouts.length === 0) return insights

  // Calculate average days between workouts
  const workoutDates = workouts.map(w => new Date(w.completed_date)).sort((a, b) => a.getTime() - b.getTime())
  
  if (workoutDates.length >= 2) {
    const totalDays = (workoutDates[workoutDates.length - 1].getTime() - workoutDates[0].getTime()) / (1000 * 60 * 60 * 24)
    const avgDaysBetween = totalDays / (workoutDates.length - 1)
    
    if (avgDaysBetween > 4) {
      insights.push({
        type: 'frequency',
        title: 'Increase Workout Frequency',
        message: `You're averaging ${Math.round(avgDaysBetween)} days between workouts. Try to aim for 3-4 workouts per week for optimal progress.`,
        priority: 'high',
        actionable: true,
        data: { avgDaysBetween: Math.round(avgDaysBetween) }
      })
    } else if (avgDaysBetween < 1.5) {
      insights.push({
        type: 'recovery',
        title: 'Consider Rest Days',
        message: `You're working out very frequently (every ${Math.round(avgDaysBetween)} days). Make sure to include rest days for recovery.`,
        priority: 'medium',
        actionable: true,
        data: { avgDaysBetween: Math.round(avgDaysBetween) }
      })
    }
  }

  return insights
}

function analyzeVolumeAndIntensity(analytics: UserAnalyticsWithExercise[]): CoachingInsight[] {
  const insights: CoachingInsight[] = []
  
  // Find exercises with very high or low effective reps
  const highVolumeExercises = analytics.filter(a => a.effective_reps > 100)
  const lowVolumeExercises = analytics.filter(a => a.effective_reps < 20 && a.total_sets > 5)

  if (highVolumeExercises.length > 0) {
    insights.push({
      type: 'volume',
      title: 'High Volume Training',
      message: `You're doing high volume training on ${highVolumeExercises.length} exercises. This is great for muscle growth but watch for overtraining.`,
      priority: 'low',
      actionable: false,
      data: { exercises: highVolumeExercises.map(e => e.exercises.name) }
    })
  }

  if (lowVolumeExercises.length > 0) {
    insights.push({
      type: 'volume',
      title: 'Low Effective Volume',
      message: `Consider increasing intensity or reps on: ${lowVolumeExercises.map(e => e.exercises.name).join(', ')}. You might not be training hard enough.`,
      priority: 'medium',
      actionable: true,
      data: { exercises: lowVolumeExercises.map(e => e.exercises.name) }
    })
  }

  return insights
}

function detectPlateaus(analytics: UserAnalyticsWithExercise[]): CoachingInsight[] {
  const insights: CoachingInsight[] = []
  
  // Simple plateau detection based on staleness score
  const plateauedExercises = analytics.filter(a => a.staleness_score > 50)
  
  if (plateauedExercises.length > 0) {
    insights.push({
      type: 'progression',
      title: 'Potential Plateaus',
      message: `${plateauedExercises.length} exercises might be plateauing. Try changing rep ranges, adding volume, or switching variations.`,
      priority: 'high',
      actionable: true,
      data: { 
        count: plateauedExercises.length,
        exercises: plateauedExercises.map(e => ({
          name: e.exercises.name,
          staleness: e.staleness_score
        }))
      }
    })
  }

  return insights
}