import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'
import { createNotification } from './notificationService'
import { supabaseCache } from '../api/supabaseCache'

/**
 * Coach Program Monitoring Service
 * Handles client program progress tracking, completion notifications, and effectiveness reporting
 * Requirements: 4.2, 4.3, 5.5
 */

// Cache TTL constants
const PROGRESS_CACHE_TTL = 10 * 60 * 1000 // 10 minutes
const ANALYTICS_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

/**
 * Get comprehensive program progress for a specific client
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {string} programId - Program ID
 * @returns {Promise<Object>} Program progress data
 */
export const getClientProgramProgress = async (coachId, clientId, programId) => {
  return executeSupabaseOperation(async () => {
    // Verify coach has permission to access client data
    const { canAccessClientData } = await import('./permissionService')
    const hasAccess = await canAccessClientData(coachId, clientId, 'progress')
    
    if (!hasAccess) {
      throw new Error('Permission denied: Cannot access client progress data')
    }

    const cacheKey = `coach_program_progress_${coachId}_${clientId}_${programId}`

    return supabaseCache.getWithCache(
      cacheKey,
      async () => {
        // Get program details with workout structure
        const { data: program, error: programError } = await supabase
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
                  exercise_type
                )
              )
            )
          `)
          .eq('id', programId)
          .eq('assigned_to_client', clientId)
          .single()

        if (programError) {
          throw handleSupabaseError(programError, 'getClientProgramProgress - get program')
        }

        // Get client's workout logs for this program
        const { data: workoutLogs, error: logsError } = await supabase
          .from('workout_logs')
          .select(`
            *,
            workout_log_exercises (
              *,
              exercises (
                id,
                name,
                primary_muscle_group
              )
            )
          `)
          .eq('user_id', clientId)
          .eq('program_id', programId)
          .order('completed_date', { ascending: true })

        if (logsError) {
          throw handleSupabaseError(logsError, 'getClientProgramProgress - get workout logs')
        }

        // Calculate progress metrics
        const progressMetrics = calculateProgramProgressMetrics(program, workoutLogs || [])

        return {
          program,
          workoutLogs: workoutLogs || [],
          progressMetrics,
          lastUpdated: new Date().toISOString()
        }
      },
      {
        ttl: PROGRESS_CACHE_TTL,
        tags: ['coach_monitoring', 'program_progress', `client_${clientId}`, `program_${programId}`]
      }
    )
  })
}

/**
 * Calculate comprehensive program progress metrics
 * @param {Object} program - Program data with workouts and exercises
 * @param {Array} workoutLogs - Client's workout logs for the program
 * @returns {Object} Progress metrics
 */
const calculateProgramProgressMetrics = (program, workoutLogs) => {
  const totalWorkouts = program.program_workouts?.length || 0
  const completedWorkouts = workoutLogs.filter(log => log.is_finished).length
  const completionRate = totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0

  // Calculate week-by-week progress
  const weeklyProgress = {}
  const maxWeek = Math.max(...(program.program_workouts?.map(w => w.week_number) || [1]))

  for (let week = 1; week <= maxWeek; week++) {
    const weekWorkouts = program.program_workouts?.filter(w => w.week_number === week) || []
    const weekCompletedLogs = workoutLogs.filter(log => 
      log.is_finished && 
      weekWorkouts.some(w => w.week_number === week && w.day_number === log.day_number)
    )

    weeklyProgress[week] = {
      totalWorkouts: weekWorkouts.length,
      completedWorkouts: weekCompletedLogs.length,
      completionRate: weekWorkouts.length > 0 ? (weekCompletedLogs.length / weekWorkouts.length) * 100 : 0,
      lastCompleted: weekCompletedLogs.length > 0 ? 
        Math.max(...weekCompletedLogs.map(log => new Date(log.completed_date).getTime())) : null
    }
  }

  // Calculate exercise-specific progress
  const exerciseProgress = {}
  const allProgramExercises = program.program_workouts?.flatMap(w => w.program_exercises || []) || []

  allProgramExercises.forEach(programExercise => {
    const exerciseId = programExercise.exercise_id
    const exerciseLogs = workoutLogs.flatMap(log => 
      log.workout_log_exercises?.filter(ex => ex.exercise_id === exerciseId) || []
    )

    if (exerciseLogs.length > 0) {
      const volumes = exerciseLogs.map(log => calculateExerciseVolume(log))
      const maxWeights = exerciseLogs.map(log => Math.max(...(log.sets?.map(set => set.weight || 0) || [0])))

      exerciseProgress[exerciseId] = {
        exerciseName: programExercise.exercises?.name || 'Unknown Exercise',
        timesPerformed: exerciseLogs.length,
        averageVolume: volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length,
        maxVolume: Math.max(...volumes),
        maxWeight: Math.max(...maxWeights),
        progressTrend: calculateProgressTrend(exerciseLogs)
      }
    }
  })

  // Calculate adherence metrics
  const programStartDate = program.assigned_at ? new Date(program.assigned_at) : null
  const daysSinceStart = programStartDate ? 
    Math.floor((new Date() - programStartDate) / (1000 * 60 * 60 * 24)) : 0

  const expectedWorkoutsPerWeek = program.days_per_week || 0
  const expectedTotalWorkouts = Math.floor(daysSinceStart / 7) * expectedWorkoutsPerWeek
  const adherenceRate = expectedTotalWorkouts > 0 ? (completedWorkouts / expectedTotalWorkouts) * 100 : 0

  return {
    overall: {
      totalWorkouts,
      completedWorkouts,
      completionRate: Math.round(completionRate * 100) / 100,
      adherenceRate: Math.round(Math.min(adherenceRate, 100) * 100) / 100,
      daysSinceStart,
      currentWeek: Math.ceil(daysSinceStart / 7),
      programDuration: program.expected_duration_weeks || program.duration
    },
    weekly: weeklyProgress,
    exercises: exerciseProgress,
    lastWorkout: workoutLogs.length > 0 ? 
      workoutLogs.reduce((latest, log) => 
        new Date(log.completed_date) > new Date(latest.completed_date) ? log : latest
      ) : null
  }
}

/**
 * Calculate exercise volume (sets × reps × weight)
 * @param {Object} exerciseLog - Exercise log data
 * @returns {number} Total volume
 */
const calculateExerciseVolume = (exerciseLog) => {
  if (!exerciseLog.sets || !Array.isArray(exerciseLog.sets)) return 0

  return exerciseLog.sets.reduce((total, set) => {
    const reps = parseInt(set.reps) || 0
    const weight = parseFloat(set.weight) || 0
    return total + (reps * weight)
  }, 0)
}

/**
 * Calculate progress trend for an exercise
 * @param {Array} exerciseLogs - Array of exercise logs sorted by date
 * @returns {string} Progress trend ('improving', 'stable', 'declining', 'insufficient_data')
 */
const calculateProgressTrend = (exerciseLogs) => {
  if (exerciseLogs.length < 3) return 'insufficient_data'

  const volumes = exerciseLogs.map(log => calculateExerciseVolume(log))
  const recentVolumes = volumes.slice(-3) // Last 3 sessions
  const earlierVolumes = volumes.slice(0, 3) // First 3 sessions

  const recentAvg = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length
  const earlierAvg = earlierVolumes.reduce((sum, vol) => sum + vol, 0) / earlierVolumes.length

  const improvementThreshold = 0.05 // 5% improvement threshold

  if (recentAvg > earlierAvg * (1 + improvementThreshold)) {
    return 'improving'
  } else if (recentAvg < earlierAvg * (1 - improvementThreshold)) {
    return 'declining'
  } else {
    return 'stable'
  }
}

/**
 * Get program completion analytics for all coach clients
 * @param {string} coachId - Coach user ID
 * @param {Object} options - Analytics options
 * @returns {Promise<Object>} Program completion analytics
 */
export const getProgramCompletionAnalytics = async (coachId, options = {}) => {
  return executeSupabaseOperation(async () => {
    const { timeframe = '90d', includeInactive = false } = options

    const cacheKey = `coach_completion_analytics_${coachId}_${timeframe}_${includeInactive}`

    return supabaseCache.getWithCache(
      cacheKey,
      async () => {
        // Get all coach-assigned programs
        let query = supabase
          .from('programs')
          .select(`
            *,
            assigned_client:users!assigned_to_client(id, name, email),
            program_workouts(id, week_number, day_number)
          `)
          .eq('user_id', coachId)
          .eq('coach_assigned', true)
          .not('assigned_to_client', 'is', null)

        if (!includeInactive) {
          // Only include programs assigned in the specified timeframe
          const startDate = new Date()
          switch (timeframe) {
            case '30d':
              startDate.setDate(startDate.getDate() - 30)
              break
            case '90d':
              startDate.setDate(startDate.getDate() - 90)
              break
            case '6m':
              startDate.setMonth(startDate.getMonth() - 6)
              break
            case '1y':
              startDate.setFullYear(startDate.getFullYear() - 1)
              break
          }
          query = query.gte('assigned_at', startDate.toISOString())
        }

        const { data: programs, error: programsError } = await query

        if (programsError) {
          throw handleSupabaseError(programsError, 'getProgramCompletionAnalytics - get programs')
        }

        if (!programs || programs.length === 0) {
          return {
            totalPrograms: 0,
            completionStats: {},
            clientStats: {},
            programStats: []
          }
        }

        // Get workout logs for all assigned programs
        const programIds = programs.map(p => p.id)
        const { data: workoutLogs, error: logsError } = await supabase
          .from('workout_logs')
          .select('*')
          .in('program_id', programIds)
          .eq('is_finished', true)

        if (logsError) {
          throw handleSupabaseError(logsError, 'getProgramCompletionAnalytics - get workout logs')
        }

        // Calculate analytics
        const analytics = calculateCompletionAnalytics(programs, workoutLogs || [])

        return analytics
      },
      {
        ttl: ANALYTICS_CACHE_TTL,
        tags: ['coach_analytics', `coach_${coachId}`, 'completion_stats']
      }
    )
  })
}

/**
 * Calculate completion analytics from programs and workout logs
 * @param {Array} programs - Coach-assigned programs
 * @param {Array} workoutLogs - Completed workout logs
 * @returns {Object} Completion analytics
 */
const calculateCompletionAnalytics = (programs, workoutLogs) => {
  const totalPrograms = programs.length
  const clientStats = {}
  const programStats = []

  let totalCompletionRate = 0
  let programsWithLogs = 0

  programs.forEach(program => {
    const programLogs = workoutLogs.filter(log => log.program_id === program.id)
    const totalWorkouts = program.program_workouts?.length || 0
    const completedWorkouts = programLogs.length
    const completionRate = totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0

    // Program-specific stats
    programStats.push({
      programId: program.id,
      programName: program.name,
      clientId: program.assigned_to_client,
      clientName: program.assigned_client?.name || 'Unknown Client',
      assignedAt: program.assigned_at,
      totalWorkouts,
      completedWorkouts,
      completionRate: Math.round(completionRate * 100) / 100,
      lastWorkout: programLogs.length > 0 ? 
        Math.max(...programLogs.map(log => new Date(log.completed_date).getTime())) : null,
      isActive: completionRate < 100,
      expectedDuration: program.expected_duration_weeks,
      difficulty: program.program_difficulty
    })

    // Client-specific stats aggregation
    const clientId = program.assigned_to_client
    if (!clientStats[clientId]) {
      clientStats[clientId] = {
        clientName: program.assigned_client?.name || 'Unknown Client',
        totalPrograms: 0,
        completedPrograms: 0,
        averageCompletionRate: 0,
        totalWorkouts: 0,
        completedWorkouts: 0,
        lastActivity: null
      }
    }

    clientStats[clientId].totalPrograms++
    clientStats[clientId].totalWorkouts += totalWorkouts
    clientStats[clientId].completedWorkouts += completedWorkouts

    if (completionRate >= 100) {
      clientStats[clientId].completedPrograms++
    }

    if (programLogs.length > 0) {
      const lastWorkout = Math.max(...programLogs.map(log => new Date(log.completed_date).getTime()))
      if (!clientStats[clientId].lastActivity || lastWorkout > clientStats[clientId].lastActivity) {
        clientStats[clientId].lastActivity = lastWorkout
      }
    }

    if (totalWorkouts > 0) {
      totalCompletionRate += completionRate
      programsWithLogs++
    }
  })

  // Calculate average completion rates for clients
  Object.keys(clientStats).forEach(clientId => {
    const client = clientStats[clientId]
    client.averageCompletionRate = client.totalWorkouts > 0 ? 
      Math.round((client.completedWorkouts / client.totalWorkouts) * 10000) / 100 : 0
  })

  const overallCompletionRate = programsWithLogs > 0 ? 
    Math.round((totalCompletionRate / programsWithLogs) * 100) / 100 : 0

  return {
    totalPrograms,
    completionStats: {
      overallCompletionRate,
      programsWithActivity: programsWithLogs,
      fullyCompletedPrograms: programStats.filter(p => p.completionRate >= 100).length,
      activePrograms: programStats.filter(p => p.isActive && p.completedWorkouts > 0).length,
      inactivePrograms: programStats.filter(p => p.completedWorkouts === 0).length
    },
    clientStats,
    programStats: programStats.sort((a, b) => b.completionRate - a.completionRate)
  }
}

/**
 * Check for program completion and send notifications
 * @param {string} clientId - Client user ID
 * @param {string} programId - Program ID
 * @returns {Promise<boolean>} True if completion notification was sent
 */
export const checkProgramCompletion = async (clientId, programId) => {
  return executeSupabaseOperation(async () => {
    // Get program details
    const { data: program, error: programError } = await supabase
      .from('programs')
      .select(`
        *,
        program_workouts(id),
        coach:users!user_id(id, name, email)
      `)
      .eq('id', programId)
      .eq('coach_assigned', true)
      .single()

    if (programError || !program) {
      return false // Not a coach-assigned program
    }

    // Get completed workout logs for this program
    const { data: completedLogs, error: logsError } = await supabase
      .from('workout_logs')
      .select('id')
      .eq('user_id', clientId)
      .eq('program_id', programId)
      .eq('is_finished', true)

    if (logsError) {
      console.error('Error checking program completion:', logsError)
      return false
    }

    const totalWorkouts = program.program_workouts?.length || 0
    const completedWorkouts = completedLogs?.length || 0
    const completionRate = totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0

    // Check if program is newly completed (100% completion)
    if (completionRate >= 100) {
      // Check if we've already sent a completion notification
      const { data: existingNotification } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', program.user_id) // Coach
        .eq('type', 'program_completion')
        .eq('related_id', programId)
        .single()

      if (!existingNotification) {
        // Send completion notification to coach
        await sendProgramCompletionNotification(program, clientId)
        return true
      }
    }

    return false
  })
}

/**
 * Send program completion notification to coach
 * @param {Object} program - Program data with coach info
 * @param {string} clientId - Client user ID
 */
const sendProgramCompletionNotification = async (program, clientId) => {
  // Get client details
  const { data: client } = await supabase
    .from('users')
    .select('name, email')
    .eq('id', clientId)
    .single()

  const clientName = client?.name || 'Your client'
  const coachName = program.coach?.name || 'Coach'

  // Notify coach
  await createNotification({
    userId: program.user_id, // Coach ID
    type: 'program_completion',
    title: `🎉 Program Completed!`,
    message: `${clientName} has successfully completed the program "${program.name}"! They finished all ${program.program_workouts?.length || 0} workouts. Consider assigning a new program or providing feedback on their progress.`,
    relatedId: program.id,
    relatedType: 'program',
    actionUrl: `/coach/clients/${clientId}/programs/${program.id}`,
    actionText: 'View Progress',
    priority: 'high'
  })

  // Notify client with congratulations
  await createNotification({
    userId: clientId,
    type: 'program_completion_client',
    title: `🏆 Congratulations!`,
    message: `You've successfully completed the program "${program.name}" assigned by ${coachName}! Great work on finishing all your workouts. Your coach has been notified of your achievement.`,
    relatedId: program.id,
    relatedType: 'program',
    actionUrl: `/programs/${program.id}`,
    actionText: 'View Program',
    priority: 'high'
  })
}

/**
 * Generate program effectiveness report for a coach
 * @param {string} coachId - Coach user ID
 * @param {Object} options - Report options
 * @returns {Promise<Object>} Effectiveness report
 */
export const generateProgramEffectivenessReport = async (coachId, options = {}) => {
  return executeSupabaseOperation(async () => {
    const { 
      timeframe = '90d',
      includeClientDetails = true,
      minWorkouts = 3 // Minimum workouts to include in effectiveness analysis
    } = options

    const cacheKey = `coach_effectiveness_report_${coachId}_${timeframe}_${includeClientDetails}_${minWorkouts}`

    return supabaseCache.getWithCache(
      cacheKey,
      async () => {
        // Get completion analytics
        const completionAnalytics = await getProgramCompletionAnalytics(coachId, { timeframe })

        // Get detailed progress data for programs with sufficient activity
        const activePrograms = completionAnalytics.programStats.filter(p => 
          p.completedWorkouts >= minWorkouts
        )

        const effectivenessMetrics = {
          summary: {
            totalProgramsAnalyzed: activePrograms.length,
            averageCompletionRate: activePrograms.length > 0 ? 
              Math.round(activePrograms.reduce((sum, p) => sum + p.completionRate, 0) / activePrograms.length * 100) / 100 : 0,
            highPerformingPrograms: activePrograms.filter(p => p.completionRate >= 80).length,
            lowPerformingPrograms: activePrograms.filter(p => p.completionRate < 50).length,
            clientRetentionRate: calculateClientRetentionRate(completionAnalytics.clientStats)
          },
          programAnalysis: activePrograms.map(program => ({
            ...program,
            effectivenessScore: calculateEffectivenessScore(program),
            recommendations: generateProgramRecommendations(program)
          })).sort((a, b) => b.effectivenessScore - a.effectivenessScore),
          clientAnalysis: includeClientDetails ? 
            Object.values(completionAnalytics.clientStats).map(client => ({
              ...client,
              engagementScore: calculateClientEngagementScore(client),
              recommendations: generateClientRecommendations(client)
            })).sort((a, b) => b.engagementScore - a.engagementScore) : [],
          insights: generateCoachingInsights(completionAnalytics, activePrograms)
        }

        return effectivenessMetrics
      },
      {
        ttl: ANALYTICS_CACHE_TTL,
        tags: ['coach_analytics', `coach_${coachId}`, 'effectiveness_report']
      }
    )
  })
}

/**
 * Calculate client retention rate
 * @param {Object} clientStats - Client statistics
 * @returns {number} Retention rate percentage
 */
const calculateClientRetentionRate = (clientStats) => {
  const clients = Object.values(clientStats)
  if (clients.length === 0) return 0

  const activeClients = clients.filter(client => {
    if (!client.lastActivity) return false
    const daysSinceLastActivity = (Date.now() - client.lastActivity) / (1000 * 60 * 60 * 24)
    return daysSinceLastActivity <= 14 // Active within last 2 weeks
  })

  return Math.round((activeClients.length / clients.length) * 10000) / 100
}

/**
 * Calculate effectiveness score for a program
 * @param {Object} program - Program statistics
 * @returns {number} Effectiveness score (0-100)
 */
const calculateEffectivenessScore = (program) => {
  let score = 0

  // Completion rate (40% of score)
  score += (program.completionRate * 0.4)

  // Consistency (30% of score) - based on whether client is actively working on it
  const daysSinceAssigned = program.assignedAt ? 
    (Date.now() - new Date(program.assignedAt).getTime()) / (1000 * 60 * 60 * 24) : 0
  const expectedWorkouts = Math.floor(daysSinceAssigned / 7) * (program.totalWorkouts / (program.expectedDuration || 12))
  const consistencyScore = expectedWorkouts > 0 ? 
    Math.min((program.completedWorkouts / expectedWorkouts) * 100, 100) : 0
  score += (consistencyScore * 0.3)

  // Engagement (30% of score) - based on recent activity
  if (program.lastWorkout) {
    const daysSinceLastWorkout = (Date.now() - program.lastWorkout) / (1000 * 60 * 60 * 24)
    const engagementScore = Math.max(0, 100 - (daysSinceLastWorkout * 5)) // Decrease by 5 points per day
    score += (engagementScore * 0.3)
  }

  return Math.round(score * 100) / 100
}

/**
 * Generate recommendations for a program
 * @param {Object} program - Program statistics
 * @returns {Array} Array of recommendation strings
 */
const generateProgramRecommendations = (program) => {
  const recommendations = []

  if (program.completionRate < 30) {
    recommendations.push('Consider reaching out to check if the program difficulty is appropriate')
    recommendations.push('Review if the client has the necessary equipment and time commitment')
  } else if (program.completionRate < 60) {
    recommendations.push('Program may benefit from modifications or additional motivation')
    recommendations.push('Consider scheduling a check-in to address any barriers')
  } else if (program.completionRate >= 80) {
    recommendations.push('Excellent adherence! Consider preparing a progressive follow-up program')
  }

  if (program.lastWorkout) {
    const daysSinceLastWorkout = (Date.now() - program.lastWorkout) / (1000 * 60 * 60 * 24)
    if (daysSinceLastWorkout > 7) {
      recommendations.push('Client has been inactive for over a week - consider sending encouragement')
    }
  }

  if (program.difficulty === 'beginner' && program.completionRate > 70) {
    recommendations.push('Client may be ready for intermediate-level programming')
  }

  return recommendations
}

/**
 * Calculate client engagement score
 * @param {Object} client - Client statistics
 * @returns {number} Engagement score (0-100)
 */
const calculateClientEngagementScore = (client) => {
  let score = 0

  // Completion rate (50% of score)
  score += (client.averageCompletionRate * 0.5)

  // Program completion (30% of score)
  const programCompletionRate = client.totalPrograms > 0 ? 
    (client.completedPrograms / client.totalPrograms) * 100 : 0
  score += (programCompletionRate * 0.3)

  // Recent activity (20% of score)
  if (client.lastActivity) {
    const daysSinceLastActivity = (Date.now() - client.lastActivity) / (1000 * 60 * 60 * 24)
    const activityScore = Math.max(0, 100 - (daysSinceLastActivity * 3)) // Decrease by 3 points per day
    score += (activityScore * 0.2)
  }

  return Math.round(score * 100) / 100
}

/**
 * Generate recommendations for a client
 * @param {Object} client - Client statistics
 * @returns {Array} Array of recommendation strings
 */
const generateClientRecommendations = (client) => {
  const recommendations = []

  if (client.averageCompletionRate < 40) {
    recommendations.push('Consider discussing barriers to program adherence')
    recommendations.push('May benefit from simplified or shorter programs initially')
  } else if (client.averageCompletionRate >= 80) {
    recommendations.push('Highly engaged client - consider more challenging programs')
    recommendations.push('Good candidate for longer-term program commitments')
  }

  if (client.completedPrograms === 0 && client.totalPrograms > 0) {
    recommendations.push('Has not completed any programs - review program difficulty and client goals')
  }

  if (client.lastActivity) {
    const daysSinceLastActivity = (Date.now() - client.lastActivity) / (1000 * 60 * 60 * 24)
    if (daysSinceLastActivity > 14) {
      recommendations.push('Client has been inactive - consider re-engagement outreach')
    }
  }

  return recommendations
}

/**
 * Generate coaching insights from analytics data
 * @param {Object} completionAnalytics - Completion analytics data
 * @param {Array} activePrograms - Programs with sufficient activity
 * @returns {Array} Array of insight objects
 */
const generateCoachingInsights = (completionAnalytics, activePrograms) => {
  const insights = []

  // Overall performance insights
  if (completionAnalytics.completionStats.overallCompletionRate > 75) {
    insights.push({
      type: 'success',
      title: 'Excellent Program Design',
      message: `Your programs have an ${completionAnalytics.completionStats.overallCompletionRate}% average completion rate, indicating well-designed and appropriate programming.`
    })
  } else if (completionAnalytics.completionStats.overallCompletionRate < 50) {
    insights.push({
      type: 'improvement',
      title: 'Program Adherence Opportunity',
      message: `Average completion rate is ${completionAnalytics.completionStats.overallCompletionRate}%. Consider reviewing program difficulty and client readiness.`
    })
  }

  // Client engagement insights
  const clientCount = Object.keys(completionAnalytics.clientStats).length
  if (completionAnalytics.completionStats.inactivePrograms > clientCount * 0.3) {
    insights.push({
      type: 'attention',
      title: 'Client Engagement Alert',
      message: `${completionAnalytics.completionStats.inactivePrograms} programs show no activity. Consider reaching out to these clients.`
    })
  }

  // Program difficulty insights
  const difficultyStats = {}
  activePrograms.forEach(program => {
    const difficulty = program.difficulty || 'intermediate'
    if (!difficultyStats[difficulty]) {
      difficultyStats[difficulty] = { total: 0, avgCompletion: 0 }
    }
    difficultyStats[difficulty].total++
    difficultyStats[difficulty].avgCompletion += program.completionRate
  })

  Object.keys(difficultyStats).forEach(difficulty => {
    const stats = difficultyStats[difficulty]
    stats.avgCompletion = stats.avgCompletion / stats.total

    if (stats.avgCompletion < 40) {
      insights.push({
        type: 'improvement',
        title: `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Program Performance`,
        message: `${difficulty} programs have low completion rates (${Math.round(stats.avgCompletion)}%). Consider adjusting difficulty or providing more support.`
      })
    }
  })

  return insights
}

export default {
  getClientProgramProgress,
  getProgramCompletionAnalytics,
  checkProgramCompletion,
  generateProgramEffectivenessReport
}