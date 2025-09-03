import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'

/**
 * Admin Coach Service for Supabase admin coach management operations
 * Handles admin-specific coach monitoring, statistics, and oversight
 */

/**
 * Get comprehensive coach statistics for admin dashboard
 * @returns {Promise<Object>} Coach system statistics
 */
export const getCoachSystemStatistics = async () => {
  return executeSupabaseOperation(async () => {
    // Get total coaches
    const { data: totalCoaches, error: coachError } = await supabase
      .from('users')
      .select('id', { count: 'exact' })
      .contains('roles', ['coach'])

    if (coachError) throw handleSupabaseError(coachError, 'getCoachSystemStatistics')

    // Get active coaches
    const { data: activeCoaches, error: activeError } = await supabase
      .from('coach_profiles')
      .select('id', { count: 'exact' })
      .eq('is_active', true)

    if (activeError) throw handleSupabaseError(activeError, 'getCoachSystemStatistics')

    // Get total relationships
    const { data: totalRelationships, error: relationshipError } = await supabase
      .from('coach_client_relationships')
      .select('id', { count: 'exact' })

    if (relationshipError) throw handleSupabaseError(relationshipError, 'getCoachSystemStatistics')

    // Get active relationships
    const { data: activeRelationships, error: activeRelError } = await supabase
      .from('coach_client_relationships')
      .select('id', { count: 'exact' })
      .eq('status', 'active')

    if (activeRelError) throw handleSupabaseError(activeRelError, 'getCoachSystemStatistics')

    // Get pending invitations
    const { data: pendingInvitations, error: invitationError } = await supabase
      .from('client_invitations')
      .select('id', { count: 'exact' })
      .eq('status', 'pending')

    if (invitationError) throw handleSupabaseError(invitationError, 'getCoachSystemStatistics')

    // Get coaching insights count
    const { data: totalInsights, error: insightError } = await supabase
      .from('coaching_insights')
      .select('id', { count: 'exact' })

    if (insightError) throw handleSupabaseError(insightError, 'getCoachSystemStatistics')

    // Get coach-assigned programs
    const { data: coachPrograms, error: programError } = await supabase
      .from('programs')
      .select('id', { count: 'exact' })
      .eq('coach_assigned', true)

    if (programError) throw handleSupabaseError(programError, 'getCoachSystemStatistics')

    return {
      totalCoaches: totalCoaches?.length || 0,
      activeCoaches: activeCoaches?.length || 0,
      totalRelationships: totalRelationships?.length || 0,
      activeRelationships: activeRelationships?.length || 0,
      pendingInvitations: pendingInvitations?.length || 0,
      totalInsights: totalInsights?.length || 0,
      coachPrograms: coachPrograms?.length || 0
    }
  })
}

/**
 * Get detailed coach activity data for admin monitoring
 * @param {number} limit - Number of coaches to return
 * @returns {Promise<Array>} Array of coaches with activity data
 */
export const getCoachActivityData = async (limit = 50) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        created_at,
        last_login_at,
        coach_profiles (
          specializations,
          certifications,
          bio,
          is_active,
          client_limit,
          created_at,
          updated_at
        ),
        coach_relationships:coach_client_relationships!coach_id (
          id,
          status,
          created_at
        ),
        sent_invitations:client_invitations!coach_id (
          id,
          status,
          created_at
        ),
        coaching_insights!coach_id (
          id,
          type,
          created_at
        ),
        assigned_programs:programs!user_id (
          id,
          coach_assigned,
          assigned_to_client,
          created_at
        )
      `)
      .contains('roles', ['coach'])
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw handleSupabaseError(error, 'getCoachActivityData')

    // Process the data to add computed statistics
    const processedData = data?.map(coach => {
      const activeClients = coach.coach_relationships?.filter(r => r.status === 'active').length || 0
      const totalClients = coach.coach_relationships?.length || 0
      const pendingInvitations = coach.sent_invitations?.filter(i => i.status === 'pending').length || 0
      const totalInsights = coach.coaching_insights?.length || 0
      const assignedPrograms = coach.assigned_programs?.filter(p => p.coach_assigned).length || 0
      
      // Calculate activity score based on recent activity
      const now = new Date()
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      
      const recentInsights = coach.coaching_insights?.filter(
        i => new Date(i.created_at) > thirtyDaysAgo
      ).length || 0
      
      const recentPrograms = coach.assigned_programs?.filter(
        p => p.coach_assigned && new Date(p.created_at) > thirtyDaysAgo
      ).length || 0
      
      const activityScore = (recentInsights * 2) + (recentPrograms * 3) + (activeClients * 1)

      return {
        ...coach,
        statistics: {
          activeClients,
          totalClients,
          pendingInvitations,
          totalInsights,
          assignedPrograms,
          recentInsights,
          recentPrograms,
          activityScore
        }
      }
    }) || []

    return processedData
  })
}

/**
 * Get coach-client relationship oversight data
 * @param {Object} filters - Optional filters
 * @returns {Promise<Array>} Array of relationships with details
 */
export const getCoachClientRelationshipOversight = async (filters = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('coach_client_relationships')
      .select(`
        *,
        coach:users!coach_id (
          id,
          name,
          email,
          coach_profiles (
            specializations,
            is_active
          )
        ),
        client:users!client_id (
          id,
          name,
          email,
          experience_level,
          created_at
        ),
        coaching_insights (
          id,
          type,
          created_at
        ),
        assigned_programs:programs!assigned_to_client (
          id,
          name,
          created_at
        )
      `)
      .order('created_at', { ascending: false })

    // Apply filters
    if (filters.status) {
      query = query.eq('status', filters.status)
    }
    if (filters.coachId) {
      query = query.eq('coach_id', filters.coachId)
    }
    if (filters.clientId) {
      query = query.eq('client_id', filters.clientId)
    }
    if (filters.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) throw handleSupabaseError(error, 'getCoachClientRelationshipOversight')

    // Add computed metrics for each relationship
    const processedData = data?.map(relationship => {
      const insightCount = relationship.coaching_insights?.length || 0
      const programCount = relationship.assigned_programs?.length || 0
      
      // Calculate relationship health score
      const daysSinceStart = Math.floor(
        (new Date() - new Date(relationship.created_at)) / (1000 * 60 * 60 * 24)
      )
      
      const expectedInsights = Math.max(1, Math.floor(daysSinceStart / 7)) // 1 per week
      const expectedPrograms = Math.max(1, Math.floor(daysSinceStart / 30)) // 1 per month
      
      const insightRatio = expectedInsights > 0 ? insightCount / expectedInsights : 1
      const programRatio = expectedPrograms > 0 ? programCount / expectedPrograms : 1
      
      const healthScore = Math.min(100, Math.round((insightRatio + programRatio) * 50))

      return {
        ...relationship,
        metrics: {
          insightCount,
          programCount,
          daysSinceStart,
          healthScore,
          expectedInsights,
          expectedPrograms
        }
      }
    }) || []

    return processedData
  })
}

/**
 * Get system alerts for admin attention
 * @returns {Promise<Array>} Array of system alerts
 */
export const getSystemAlerts = async () => {
  return executeSupabaseOperation(async () => {
    const alerts = []
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Check for inactive coaches with active clients
    const { data: inactiveCoaches, error: inactiveError } = await supabase
      .from('coach_profiles')
      .select(`
        user_id,
        users (
          name,
          email,
          last_login_at
        ),
        coach_relationships:coach_client_relationships!coach_id (
          id,
          status
        )
      `)
      .eq('is_active', false)

    if (!inactiveError && inactiveCoaches) {
      inactiveCoaches.forEach(coach => {
        const activeClients = coach.coach_relationships?.filter(r => r.status === 'active').length || 0
        if (activeClients > 0) {
          alerts.push({
            type: 'warning',
            category: 'inactive_coach',
            title: 'Inactive Coach with Active Clients',
            message: `Coach ${coach.users.name || coach.users.email} is inactive but has ${activeClients} active client(s)`,
            coachId: coach.user_id,
            severity: 'high',
            actionRequired: true
          })
        }
      })
    }

    // Check for coaches with no recent activity
    const { data: staleCoaches, error: staleError } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        last_login_at,
        coach_profiles (
          is_active
        ),
        coaching_insights!coach_id (
          id,
          created_at
        )
      `)
      .contains('roles', ['coach'])
      .lt('last_login_at', thirtyDaysAgo.toISOString())

    if (!staleError && staleCoaches) {
      staleCoaches.forEach(coach => {
        const recentInsights = coach.coaching_insights?.filter(
          i => new Date(i.created_at) > thirtyDaysAgo
        ).length || 0

        if (coach.coach_profiles?.[0]?.is_active && recentInsights === 0) {
          alerts.push({
            type: 'info',
            category: 'stale_coach',
            title: 'Coach with No Recent Activity',
            message: `Coach ${coach.name || coach.email} hasn't logged in or created insights in 30 days`,
            coachId: coach.id,
            severity: 'medium',
            actionRequired: false
          })
        }
      })
    }

    // Check for expired invitations
    const { data: expiredInvitations, error: expiredError } = await supabase
      .from('client_invitations')
      .select(`
        id,
        coach_id,
        coach_name,
        target_email,
        expires_at
      `)
      .eq('status', 'pending')
      .lt('expires_at', now.toISOString())

    if (!expiredError && expiredInvitations) {
      expiredInvitations.forEach(invitation => {
        alerts.push({
          type: 'warning',
          category: 'expired_invitation',
          title: 'Expired Invitation Needs Cleanup',
          message: `Invitation from ${invitation.coach_name} to ${invitation.target_email} has expired`,
          invitationId: invitation.id,
          coachId: invitation.coach_id,
          severity: 'low',
          actionRequired: true
        })
      })
    }

    return alerts.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 }
      return severityOrder[b.severity] - severityOrder[a.severity]
    })
  })
}

/**
 * Get coach performance metrics for admin analysis
 * @param {string} coachId - Optional specific coach ID
 * @returns {Promise<Object>} Performance metrics
 */
export const getCoachPerformanceMetrics = async (coachId = null) => {
  return executeSupabaseOperation(async () => {
    let coachFilter = {}
    if (coachId) {
      coachFilter = { coach_id: coachId }
    }

    // Get relationship conversion rates
    const { data: invitations, error: invitationError } = await supabase
      .from('client_invitations')
      .select('coach_id, status')
      .match(coachFilter)

    if (invitationError) throw handleSupabaseError(invitationError, 'getCoachPerformanceMetrics')

    // Get client retention data
    const { data: relationships, error: relationshipError } = await supabase
      .from('coach_client_relationships')
      .select('coach_id, status, created_at, terminated_at')
      .match(coachFilter)

    if (relationshipError) throw handleSupabaseError(relationshipError, 'getCoachPerformanceMetrics')

    // Get insight engagement data
    const { data: insights, error: insightError } = await supabase
      .from('coaching_insights')
      .select('coach_id, client_viewed, created_at')
      .match(coachFilter)

    if (insightError) throw handleSupabaseError(insightError, 'getCoachPerformanceMetrics')

    // Calculate metrics
    const invitationStats = {}
    const relationshipStats = {}
    const insightStats = {}

    // Process invitations
    invitations?.forEach(inv => {
      if (!invitationStats[inv.coach_id]) {
        invitationStats[inv.coach_id] = { sent: 0, accepted: 0, declined: 0, expired: 0 }
      }
      invitationStats[inv.coach_id].sent++
      invitationStats[inv.coach_id][inv.status]++
    })

    // Process relationships
    relationships?.forEach(rel => {
      if (!relationshipStats[rel.coach_id]) {
        relationshipStats[rel.coach_id] = { total: 0, active: 0, terminated: 0, avgDuration: 0 }
      }
      relationshipStats[rel.coach_id].total++
      relationshipStats[rel.coach_id][rel.status]++
    })

    // Process insights
    insights?.forEach(insight => {
      if (!insightStats[insight.coach_id]) {
        insightStats[insight.coach_id] = { total: 0, viewed: 0, viewRate: 0 }
      }
      insightStats[insight.coach_id].total++
      if (insight.client_viewed) {
        insightStats[insight.coach_id].viewed++
      }
    })

    // Calculate view rates
    Object.keys(insightStats).forEach(coachId => {
      const stats = insightStats[coachId]
      stats.viewRate = stats.total > 0 ? (stats.viewed / stats.total) * 100 : 0
    })

    return {
      invitationStats,
      relationshipStats,
      insightStats
    }
  })
}

/**
 * Suspend or reactivate a coach
 * @param {string} coachId - Coach user ID
 * @param {boolean} suspend - True to suspend, false to reactivate
 * @param {string} reason - Reason for action
 * @returns {Promise<Object>} Updated coach profile
 */
export const toggleCoachSuspension = async (coachId, suspend, reason = '') => {
  return executeSupabaseOperation(async () => {
    // Update coach profile
    const { data: profile, error: profileError } = await supabase
      .from('coach_profiles')
      .update({
        is_active: !suspend,
        suspension_reason: suspend ? reason : null,
        suspended_at: suspend ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', coachId)
      .select()
      .single()

    if (profileError) throw handleSupabaseError(profileError, 'toggleCoachSuspension')

    // If suspending, deactivate all active relationships
    if (suspend) {
      const { error: relationshipError } = await supabase
        .from('coach_client_relationships')
        .update({
          status: 'inactive',
          updated_at: new Date().toISOString()
        })
        .eq('coach_id', coachId)
        .eq('status', 'active')

      if (relationshipError) throw handleSupabaseError(relationshipError, 'toggleCoachSuspension')
    }

    // Log the action
    await supabase
      .from('admin_actions')
      .insert({
        admin_id: (await supabase.auth.getUser()).data.user?.id,
        action_type: suspend ? 'coach_suspended' : 'coach_reactivated',
        target_user_id: coachId,
        reason: reason,
        metadata: { profile_id: profile.id }
      })

    return profile
  })
}

/**
 * Clean up expired invitations
 * @returns {Promise<number>} Number of invitations cleaned up
 */
export const cleanupExpiredInvitations = async () => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('client_invitations')
      .update({
        status: 'expired',
        updated_at: new Date().toISOString()
      })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id')

    if (error) throw handleSupabaseError(error, 'cleanupExpiredInvitations')

    return data?.length || 0
  })
}