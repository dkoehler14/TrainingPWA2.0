import { useState, useEffect, useCallback } from 'react'
import { 
  getClientProgramProgress, 
  getProgramCompletionAnalytics, 
  generateProgramEffectivenessReport,
  checkProgramCompletion 
} from '../services/coachProgramMonitoringService'
import { useAuth } from './useAuth'

/**
 * Custom hook for managing program monitoring data
 * Provides state management and data fetching for coach program monitoring
 * Requirements: 4.2, 4.3, 5.5
 */
export const useProgramMonitoring = (options = {}) => {
  const { user } = useAuth()
  const {
    clientId,
    programId,
    timeframe = '90d',
    autoRefresh = false,
    refreshInterval = 5 * 60 * 1000 // 5 minutes
  } = options

  // State management
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [programProgress, setProgramProgress] = useState(null)
  const [completionAnalytics, setCompletionAnalytics] = useState(null)
  const [effectivenessReport, setEffectivenessReport] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  // Load program progress for specific client/program
  const loadProgramProgress = useCallback(async (coachId, clientId, programId) => {
    try {
      setError(null)
      const data = await getClientProgramProgress(coachId, clientId, programId)
      setProgramProgress(data)
      return data
    } catch (err) {
      console.error('Error loading program progress:', err)
      setError(err.message)
      throw err
    }
  }, [])

  // Load completion analytics
  const loadCompletionAnalytics = useCallback(async (coachId, timeframe) => {
    try {
      setError(null)
      const data = await getProgramCompletionAnalytics(coachId, { timeframe })
      setCompletionAnalytics(data)
      return data
    } catch (err) {
      console.error('Error loading completion analytics:', err)
      setError(err.message)
      throw err
    }
  }, [])

  // Load effectiveness report
  const loadEffectivenessReport = useCallback(async (coachId, timeframe) => {
    try {
      setError(null)
      const data = await generateProgramEffectivenessReport(coachId, { timeframe })
      setEffectivenessReport(data)
      return data
    } catch (err) {
      console.error('Error loading effectiveness report:', err)
      setError(err.message)
      throw err
    }
  }, [])

  // Check for program completion and handle notifications
  const checkForCompletion = useCallback(async (clientId, programId) => {
    try {
      const completionNotified = await checkProgramCompletion(clientId, programId)
      if (completionNotified) {
        // Refresh program progress to reflect completion
        if (user?.id) {
          await loadProgramProgress(user.id, clientId, programId)
        }
      }
      return completionNotified
    } catch (err) {
      console.error('Error checking program completion:', err)
      return false
    }
  }, [user?.id, loadProgramProgress])

  // Refresh all monitoring data
  const refreshMonitoringData = useCallback(async () => {
    if (!user?.id) return

    try {
      setLoading(true)
      setError(null)

      const promises = []

      // Load specific program progress if specified
      if (clientId && programId) {
        promises.push(loadProgramProgress(user.id, clientId, programId))
      }

      // Load analytics data
      promises.push(loadCompletionAnalytics(user.id, timeframe))
      promises.push(loadEffectivenessReport(user.id, timeframe))

      await Promise.all(promises)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error refreshing monitoring data:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [user?.id, clientId, programId, timeframe, loadProgramProgress, loadCompletionAnalytics, loadEffectivenessReport])

  // Initial data load
  useEffect(() => {
    if (user?.id) {
      refreshMonitoringData()
    }
  }, [user?.id, refreshMonitoringData])

  // Auto-refresh setup
  useEffect(() => {
    if (!autoRefresh || !user?.id) return

    const interval = setInterval(() => {
      refreshMonitoringData()
    }, refreshInterval)

    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, user?.id, refreshMonitoringData])

  // Get summary statistics
  const getSummaryStats = useCallback(() => {
    if (!completionAnalytics) return null

    return {
      totalPrograms: completionAnalytics.totalPrograms,
      overallCompletionRate: completionAnalytics.completionStats.overallCompletionRate,
      activePrograms: completionAnalytics.completionStats.activePrograms,
      inactivePrograms: completionAnalytics.completionStats.inactivePrograms,
      clientCount: Object.keys(completionAnalytics.clientStats).length,
      highPerformingPrograms: effectivenessReport?.summary.highPerformingPrograms || 0,
      clientRetentionRate: effectivenessReport?.summary.clientRetentionRate || 0
    }
  }, [completionAnalytics, effectivenessReport])

  // Get client performance summary
  const getClientPerformance = useCallback((clientId) => {
    if (!completionAnalytics?.clientStats[clientId]) return null

    const clientStats = completionAnalytics.clientStats[clientId]
    const clientAnalysis = effectivenessReport?.clientAnalysis.find(c => 
      c.clientName === clientStats.clientName
    )

    return {
      ...clientStats,
      engagementScore: clientAnalysis?.engagementScore || 0,
      recommendations: clientAnalysis?.recommendations || []
    }
  }, [completionAnalytics, effectivenessReport])

  // Get program performance summary
  const getProgramPerformance = useCallback((programId) => {
    if (!effectivenessReport?.programAnalysis) return null

    return effectivenessReport.programAnalysis.find(p => p.programId === programId)
  }, [effectivenessReport])

  // Get top performing programs
  const getTopPerformingPrograms = useCallback((limit = 5) => {
    if (!effectivenessReport?.programAnalysis) return []

    return effectivenessReport.programAnalysis
      .slice(0, limit)
      .map(program => ({
        id: program.programId,
        name: program.programName,
        clientName: program.clientName,
        completionRate: program.completionRate,
        effectivenessScore: program.effectivenessScore,
        isActive: program.isActive
      }))
  }, [effectivenessReport])

  // Get clients needing attention
  const getClientsNeedingAttention = useCallback(() => {
    if (!effectivenessReport?.clientAnalysis) return []

    return effectivenessReport.clientAnalysis
      .filter(client => client.engagementScore < 50 || 
        (client.lastActivity && (Date.now() - client.lastActivity) > 7 * 24 * 60 * 60 * 1000))
      .map(client => ({
        name: client.clientName,
        engagementScore: client.engagementScore,
        averageCompletionRate: client.averageCompletionRate,
        lastActivity: client.lastActivity,
        recommendations: client.recommendations
      }))
  }, [effectivenessReport])

  // Get coaching insights
  const getCoachingInsights = useCallback(() => {
    return effectivenessReport?.insights || []
  }, [effectivenessReport])

  return {
    // State
    loading,
    error,
    programProgress,
    completionAnalytics,
    effectivenessReport,
    lastUpdated,

    // Actions
    refreshMonitoringData,
    loadProgramProgress,
    loadCompletionAnalytics,
    loadEffectivenessReport,
    checkForCompletion,

    // Computed data
    getSummaryStats,
    getClientPerformance,
    getProgramPerformance,
    getTopPerformingPrograms,
    getClientsNeedingAttention,
    getCoachingInsights
  }
}

/**
 * Hook for monitoring a specific program's progress
 */
export const useProgramProgressMonitoring = (clientId, programId, options = {}) => {
  const { autoRefresh = true, refreshInterval = 2 * 60 * 1000 } = options // 2 minutes for specific program
  
  return useProgramMonitoring({
    clientId,
    programId,
    autoRefresh,
    refreshInterval,
    ...options
  })
}

/**
 * Hook for coach analytics dashboard
 */
export const useCoachAnalyticsDashboard = (timeframe = '90d', options = {}) => {
  const { autoRefresh = true, refreshInterval = 10 * 60 * 1000 } = options // 10 minutes for analytics
  
  return useProgramMonitoring({
    timeframe,
    autoRefresh,
    refreshInterval,
    ...options
  })
}

export default useProgramMonitoring