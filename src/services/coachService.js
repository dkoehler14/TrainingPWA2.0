import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'

/**
 * Coach Service for Supabase coach operations
 * Handles CRUD operations for coach profiles, client management, invitations, and insights
 */

/**
 * Coach Profile Management
 */

/**
 * Create a new coach profile
 * @param {Object} profileData - Coach profile data
 * @returns {Promise<Object>} Created coach profile
 */
export const createCoachProfile = async (profileData) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coach_profiles')
      .insert({
        user_id: profileData.userId,
        specializations: profileData.specializations || [],
        certifications: profileData.certifications || [],
        bio: profileData.bio || '',
        phone: profileData.phone || null,
        website: profileData.website || null,
        client_limit: profileData.clientLimit || null,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'createCoachProfile')
    }

    return data
  })
}

/**
 * Get coach profile by user ID
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} Coach profile or null if not found
 */
export const getCoachProfile = async (userId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coach_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw handleSupabaseError(error, 'getCoachProfile')
    }

    return data
  })
}

/**
 * Update coach profile
 * @param {string} userId - User ID
 * @param {Object} updates - Profile updates
 * @returns {Promise<Object>} Updated coach profile
 */
export const updateCoachProfile = async (userId, updates) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coach_profiles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'updateCoachProfile')
    }

    return data
  })
}

/**
 * Client Management
 */

/**
 * Get all clients for a coach
 * @param {string} coachId - Coach user ID
 * @returns {Promise<Array>} Array of coach-client relationships with client details
 */
export const getCoachClients = async (coachId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coach_client_relationships')
      .select(`
        *,
        client:users!client_id(
          id,
          name,
          email,
          experience_level,
          preferred_units,
          created_at
        )
      `)
      .eq('coach_id', coachId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (error) {
      throw handleSupabaseError(error, 'getCoachClients')
    }

    return data || []
  })
}

/**
 * Get detailed client information for a coach
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<Object|null>} Detailed client information
 */
export const getClientDetails = async (coachId, clientId) => {
  return executeSupabaseOperation(async () => {
    // First verify the coach-client relationship exists
    const { data: relationship, error: relationshipError } = await supabase
      .from('coach_client_relationships')
      .select('*')
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .eq('status', 'active')
      .single()

    if (relationshipError) {
      if (relationshipError.code === 'PGRST116') {
        return null // No relationship found
      }
      throw handleSupabaseError(relationshipError, 'getClientDetails')
    }

    // Get detailed client information
    const { data: client, error: clientError } = await supabase
      .from('users')
      .select(`
        id,
        name,
        email,
        experience_level,
        preferred_units,
        age,
        weight,
        height,
        goals,
        available_equipment,
        injuries,
        created_at
      `)
      .eq('id', clientId)
      .single()

    if (clientError) {
      throw handleSupabaseError(clientError, 'getClientDetails')
    }

    return {
      ...client,
      relationship
    }
  })
}

/**
 * Invitation Management
 */

/**
 * Send invitation to a potential client
 * @param {Object} invitationData - Invitation data
 * @returns {Promise<Object>} Created invitation
 */
export const sendInvitation = async (invitationData) => {
  return executeSupabaseOperation(async () => {
    const invitationCode = generateInvitationCode()
    
    const { data, error } = await supabase
      .from('client_invitations')
      .insert({
        coach_id: invitationData.coachId,
        coach_email: invitationData.coachEmail,
        coach_name: invitationData.coachName,
        target_email: invitationData.targetEmail || null,
        target_user_id: invitationData.targetUserId || null,
        invitation_code: invitationCode,
        message: invitationData.message || null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      })
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'sendInvitation')
    }

    // If email invitation, trigger email sending
    if (invitationData.targetEmail) {
      try {
        await sendInvitationEmail(data)
      } catch (emailError) {
        console.error('Failed to send invitation email:', emailError)
        // Don't fail the invitation creation if email fails
      }
    }

    return data
  })
}

/**
 * Get invitations sent by a coach
 * @param {string} coachId - Coach user ID
 * @param {string} status - Optional status filter
 * @returns {Promise<Array>} Array of invitations
 */
export const getCoachInvitations = async (coachId, status = null) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('client_invitations')
      .select('*')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      throw handleSupabaseError(error, 'getCoachInvitations')
    }

    return data || []
  })
}

/**
 * Accept a coaching invitation
 * @param {string} invitationId - Invitation ID
 * @returns {Promise<string>} Relationship ID
 */
export const acceptInvitation = async (invitationId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .rpc('accept_coaching_invitation', { invitation_id: invitationId })

    if (error) {
      throw handleSupabaseError(error, 'acceptInvitation')
    }

    return data
  })
}

/**
 * Decline a coaching invitation
 * @param {string} invitationId - Invitation ID
 * @returns {Promise<Object>} Updated invitation
 */
export const declineInvitation = async (invitationId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('client_invitations')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString()
      })
      .eq('id', invitationId)
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'declineInvitation')
    }

    return data
  })
}

/**
 * Coaching Insights Management
 */

/**
 * Create a coaching insight
 * @param {Object} insightData - Insight data
 * @returns {Promise<Object>} Created insight
 */
export const createInsight = async (insightData) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coaching_insights')
      .insert({
        coach_id: insightData.coachId,
        client_id: insightData.clientId,
        relationship_id: insightData.relationshipId,
        type: insightData.type,
        title: insightData.title,
        content: insightData.content,
        ai_generated: insightData.aiGenerated || false,
        ai_confidence: insightData.aiConfidence || null,
        based_on_data: insightData.basedOnData || null,
        priority: insightData.priority || 'medium',
        tags: insightData.tags || []
      })
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'createInsight')
    }

    return data
  })
}

/**
 * Get insights for a client from their coach
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of insights
 */
export const getClientInsights = async (coachId, clientId, options = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('coaching_insights')
      .select('*')
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (options.limit) {
      query = query.limit(options.limit)
    }

    if (options.type) {
      query = query.eq('type', options.type)
    }

    if (options.unreadOnly) {
      query = query.eq('client_viewed', false)
    }

    const { data, error } = await query

    if (error) {
      throw handleSupabaseError(error, 'getClientInsights')
    }

    return data || []
  })
}

/**
 * Mark insight as viewed by client
 * @param {string} insightId - Insight ID
 * @returns {Promise<Object>} Updated insight
 */
export const markInsightAsViewed = async (insightId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coaching_insights')
      .update({
        client_viewed: true,
        client_viewed_at: new Date().toISOString()
      })
      .eq('id', insightId)
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'markInsightAsViewed')
    }

    return data
  })
}

/**
 * Add client response to insight
 * @param {string} insightId - Insight ID
 * @param {string} response - Client response
 * @returns {Promise<Object>} Updated insight
 */
export const addInsightResponse = async (insightId, response) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coaching_insights')
      .update({
        client_response: response,
        updated_at: new Date().toISOString()
      })
      .eq('id', insightId)
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'addInsightResponse')
    }

    return data
  })
}

/**
 * Utility Functions
 */

/**
 * Generate a unique invitation code
 * @returns {string} Invitation code
 */
const generateInvitationCode = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
}

/**
 * Send invitation email via Edge Function
 * @param {Object} invitation - Invitation data
 */
const sendInvitationEmail = async (invitation) => {
  const { error } = await supabase.functions.invoke('send-coach-invitation', {
    body: { invitation }
  })

  if (error) {
    throw new Error(`Failed to send invitation email: ${error.message}`)
  }
}

/**
 * Terminate coaching relationship
 * @param {string} relationshipId - Relationship ID
 * @returns {Promise<Object>} Updated relationship
 */
export const terminateRelationship = async (relationshipId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coach_client_relationships')
      .update({
        status: 'terminated',
        terminated_at: new Date().toISOString()
      })
      .eq('id', relationshipId)
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'terminateRelationship')
    }

    return data
  })
}

/**
 * Get coaching relationship by coach and client IDs
 * @param {string} coachId - Coach user ID
 * @param {string} clientId - Client user ID
 * @returns {Promise<Object|null>} Relationship or null if not found
 */
export const getCoachClientRelationship = async (coachId, clientId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('coach_client_relationships')
      .select('*')
      .eq('coach_id', coachId)
      .eq('client_id', clientId)
      .eq('status', 'active')
      .single()

    if (error && error.code !== 'PGRST116') {
      throw handleSupabaseError(error, 'getCoachClientRelationship')
    }

    return data
  })
}