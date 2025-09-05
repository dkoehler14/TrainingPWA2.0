import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'
import { createNotification } from './notificationService'
import { updateCoachAssignment } from './programService'

/**
 * Program Assignment Service
 * Handles the workflow for coaches assigning programs to clients
 */

/**
 * Assign a program to a client with full workflow
 * @param {string} programId - Program ID to assign
 * @param {string} clientId - Client user ID
 * @param {string} coachId - Coach user ID
 * @param {Object} assignmentData - Assignment configuration
 * @returns {Promise<Object>} Assignment result
 */
export const assignProgramToClient = async (programId, clientId, coachId, assignmentData) => {
  return executeSupabaseOperation(async () => {
    // Get program and client details for notifications
    const [programResult, clientResult, coachResult] = await Promise.all([
      supabase.from('programs').select('name, duration, days_per_week').eq('id', programId).single(),
      supabase.from('users').select('name, email').eq('id', clientId).single(),
      supabase.from('users').select('name, email').eq('id', coachId).single()
    ])

    if (programResult.error) {
      throw handleSupabaseError(programResult.error, 'assignProgramToClient - get program')
    }
    if (clientResult.error) {
      throw handleSupabaseError(clientResult.error, 'assignProgramToClient - get client')
    }
    if (coachResult.error) {
      throw handleSupabaseError(coachResult.error, 'assignProgramToClient - get coach')
    }

    const program = programResult.data
    const client = clientResult.data
    const coach = coachResult.data

    // The program is already assigned. This service now only handles post-assignment tasks.
    const updatedProgram = programResult.data; // Use the program data we already fetched.

    // Create notification for client
    await createClientAssignmentNotification(
      clientId,
      coachId,
      programId,
      {
        programName: program.name,
        coachName: coach.name,
        duration: program.duration,
        daysPerWeek: program.days_per_week,
        goals: assignmentData.clientGoals || [],
        notes: assignmentData.coachNotes
      }
    )

    // Create assignment tracking record
    await createAssignmentTrackingRecord(programId, clientId, coachId, assignmentData)

    // Log assignment activity
    console.log(`Program "${program.name}" assigned to client ${client.name} by coach ${coach.name}`)

    return {
      program: updatedProgram,
      client,
      coach,
      assignmentData
    }
  })
}

/**
 * Create notification for client about new program assignment
 * @param {string} clientId - Client user ID
 * @param {string} coachId - Coach user ID
 * @param {string} programId - Program ID
 * @param {Object} details - Assignment details
 */
const createClientAssignmentNotification = async (clientId, coachId, programId, details) => {
  const notificationData = {
    userId: clientId,
    type: 'program_assignment',
    title: `🏋️ New Program Assignment from ${details.coachName}`,
    message: createAssignmentNotificationMessage(details),
    relatedId: programId,
    relatedType: 'program',
    actionUrl: `/programs?filter=coach-assigned`,
    actionText: 'View Program',
    priority: 'high',
    expiresAt: null // Don't expire program assignment notifications
  }

  await createNotification(notificationData)
}

/**
 * Create assignment notification message
 * @param {Object} details - Assignment details
 * @returns {string} Formatted notification message
 */
const createAssignmentNotificationMessage = (details) => {
  let message = `Your coach ${details.coachName} has assigned you a new workout program: "${details.programName}"`
  
  if (details.duration && details.daysPerWeek) {
    message += ` (${details.duration} weeks, ${details.daysPerWeek} days/week)`
  }

  if (details.goals && details.goals.length > 0) {
    message += `\n\n🎯 Goals: ${details.goals.join(', ')}`
  }

  if (details.notes) {
    message += `\n\n📝 Coach Notes: ${details.notes}`
  }

  message += `\n\nStart your new program today and track your progress!`

  return message
}

/**
 * Create assignment tracking record for modification history
 * @param {string} programId - Program ID
 * @param {string} clientId - Client user ID
 * @param {string} coachId - Coach user ID
 * @param {Object} assignmentData - Assignment data
 */
const createAssignmentTrackingRecord = async (programId, clientId, coachId, assignmentData) => {
  return executeSupabaseOperation(async () => {
    const { error } = await supabase
      .from('program_assignment_history')
      .insert({
        program_id: programId,
        client_id: clientId,
        coach_id: coachId,
        action_type: 'assigned',
        assignment_data: assignmentData,
        created_at: new Date().toISOString()
      })

    if (error) {
      // Don't fail the assignment if tracking fails, just log it
      console.error('Failed to create assignment tracking record:', error)
    }
  })
}

/**
 * Track program modification for assigned programs
 * @param {string} programId - Program ID
 * @param {string} coachId - Coach user ID
 * @param {Object} modifications - Program modifications
 * @returns {Promise<void>}
 */
export const trackProgramModification = async (programId, coachId, modifications) => {
  return executeSupabaseOperation(async () => {
    // Get program and client details
    const { data: program, error: programError } = await supabase
      .from('programs')
      .select('assigned_to_client, name')
      .eq('id', programId)
      .single()

    if (programError) {
      throw handleSupabaseError(programError, 'trackProgramModification')
    }

    if (!program.assigned_to_client) {
      return // Not an assigned program, no tracking needed
    }

    // Create modification tracking record
    await supabase
      .from('program_assignment_history')
      .insert({
        program_id: programId,
        client_id: program.assigned_to_client,
        coach_id: coachId,
        action_type: 'modified',
        modification_data: modifications,
        created_at: new Date().toISOString()
      })

    // Notify client about program modification
    await createProgramModificationNotification(
      program.assigned_to_client,
      coachId,
      programId,
      program.name,
      modifications
    )
  })
}

/**
 * Create notification for client about program modification
 * @param {string} clientId - Client user ID
 * @param {string} coachId - Coach user ID
 * @param {string} programId - Program ID
 * @param {string} programName - Program name
 * @param {Object} modifications - Program modifications
 */
const createProgramModificationNotification = async (clientId, coachId, programId, programName, modifications) => {
  // Get coach name
  const { data: coach } = await supabase
    .from('users')
    .select('name')
    .eq('id', coachId)
    .single()

  const coachName = coach?.name || 'Your coach'

  const notificationData = {
    userId: clientId,
    type: 'program_modification',
    title: `📝 Program Updated by ${coachName}`,
    message: `${coachName} has made updates to your program "${programName}". Check out the latest changes and continue with your updated routine!`,
    relatedId: programId,
    relatedType: 'program',
    actionUrl: `/programs/${programId}`,
    actionText: 'View Changes',
    priority: 'normal'
  }

  await createNotification(notificationData)
}

/**
 * Get assignment history for a program
 * @param {string} programId - Program ID
 * @returns {Promise<Array>} Assignment history
 */
export const getProgramAssignmentHistory = async (programId) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('program_assignment_history')
      .select(`
        *,
        coach:users!coach_id(name, email),
        client:users!client_id(name, email)
      `)
      .eq('program_id', programId)
      .order('created_at', { ascending: false })

    if (error) {
      throw handleSupabaseError(error, 'getProgramAssignmentHistory')
    }

    return data || []
  })
}

/**
 * Unassign program from client with notification
 * @param {string} programId - Program ID
 * @param {string} coachId - Coach user ID
 * @param {string} reason - Reason for unassignment
 * @returns {Promise<Object>} Unassignment result
 */
export const unassignProgramFromClient = async (programId, coachId, reason = '') => {
  return executeSupabaseOperation(async () => {
    // Get program and client details
    const { data: program, error: programError } = await supabase
      .from('programs')
      .select('assigned_to_client, name')
      .eq('id', programId)
      .single()

    if (programError) {
      throw handleSupabaseError(programError, 'unassignProgramFromClient')
    }

    if (!program.assigned_to_client) {
      throw new Error('Program is not currently assigned to a client')
    }

    const clientId = program.assigned_to_client

    // Update program to remove assignment
    const { data: updatedProgram, error: updateError } = await supabase
      .from('programs')
      .update({
        coach_assigned: false,
        assigned_to_client: null,
        assigned_at: null,
        visibility: 'private'
      })
      .eq('id', programId)
      .select()
      .single()

    if (updateError) {
      throw handleSupabaseError(updateError, 'unassignProgramFromClient')
    }

    // Create tracking record
    await supabase
      .from('program_assignment_history')
      .insert({
        program_id: programId,
        client_id: clientId,
        coach_id: coachId,
        action_type: 'unassigned',
        unassignment_reason: reason,
        created_at: new Date().toISOString()
      })

    // Notify client about unassignment
    const { data: coach } = await supabase
      .from('users')
      .select('name')
      .eq('id', coachId)
      .single()

    const coachName = coach?.name || 'Your coach'

    await createNotification({
      userId: clientId,
      type: 'program_unassignment',
      title: `📋 Program Assignment Ended`,
      message: `${coachName} has ended the assignment for program "${program.name}". The program remains in your library for future reference.${reason ? `\n\nReason: ${reason}` : ''}`,
      relatedId: programId,
      relatedType: 'program',
      actionUrl: `/programs`,
      actionText: 'View Programs',
      priority: 'normal'
    })

    return {
      program: updatedProgram,
      clientId,
      reason
    }
  })
}