/**
 * Supabase Quick Workout Draft Management Service
 * 
 * Handles saving, loading, and managing draft workouts for the Quick Workout feature using Supabase.
 * Provides automatic cleanup of old drafts and conflict resolution.
 * This service maintains API compatibility with the existing Firebase-based service.
 */

import workoutLogService from './workoutLogService'

class SupabaseQuickWorkoutDraftService {
  constructor() {
    this.DRAFT_CACHE_TTL = 15 * 60 * 1000 // 15 minutes
    this.OLD_DRAFT_THRESHOLD_DAYS = 7
  }

  /**
   * Save a workout as a draft (single-draft mode - replaces any existing draft)
   */
  async saveDraft(userId, exercises, workoutName, existingDraftId = null) {
    if (!userId || !exercises || exercises.length === 0) {
      throw new Error('Invalid parameters for saving draft')
    }

    // Transform exercises to match Supabase format
    const transformedExercises = exercises.map(ex => ({
      exerciseId: ex.exerciseId,
      sets: Number(ex.sets),
      reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
      weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
      completed: ex.completed,
      notes: ex.notes || '',
      bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null
    }))

    const result = await workoutLogService.saveDraft(
      userId,
      transformedExercises,
      workoutName,
      existingDraftId
    )

    // Transform result to match Firebase format for compatibility
    return {
      id: result.id,
      userId: result.user_id,
      name: result.name,
      type: result.type,
      exercises: transformedExercises,
      isDraft: result.is_draft,
      isWorkoutFinished: result.is_finished,
      lastModified: new Date(result.updated_at),
      date: new Date(result.date)
    }
  }

  /**
   * Get the single draft for a user (single-draft mode)
   */
  async getSingleDraft(userId) {
    if (!userId) {
      throw new Error('User ID is required to load draft')
    }

    try {
      const draft = await workoutLogService.getSingleDraft(userId)
      
      if (!draft) return null

      // Transform to match Firebase format
      return {
        id: draft.id,
        userId: draft.user_id,
        name: draft.name,
        type: draft.type,
        exercises: draft.workout_log_exercises?.map(ex => ({
          exerciseId: ex.exercise_id,
          sets: ex.sets,
          reps: ex.reps || [],
          weights: ex.weights || [],
          completed: ex.completed || [],
          notes: ex.notes || '',
          bodyweight: ex.bodyweight || null
        })) || [],
        isDraft: draft.is_draft,
        isWorkoutFinished: draft.is_finished,
        lastModified: new Date(draft.updated_at),
        date: new Date(draft.date)
      }
    } catch (error) {
      console.error('Error loading single draft:', error)
      throw new Error('Failed to load workout draft')
    }
  }

  /**
   * Clean up all drafts for a user (used in single-draft mode)
   */
  async cleanupAllDrafts(userId) {
    if (!userId) {
      return 0
    }

    try {
      // Get count of drafts before cleanup
      const drafts = await workoutLogService.loadDrafts(userId, 50)
      const count = drafts.length

      await workoutLogService.cleanupAllDrafts(userId)
      
      console.log(`Cleaned up ${count} existing workout drafts`)
      return count
    } catch (error) {
      console.error('Error cleaning up all drafts:', error)
      return 0
    }
  }

  /**
   * Load all drafts for a user
   */
  async loadDrafts(userId, limit = 5) {
    if (!userId) {
      throw new Error('User ID is required to load drafts')
    }

    try {
      const drafts = await workoutLogService.loadDrafts(userId, limit)
      
      // Transform to match Firebase format
      return drafts.map(draft => ({
        id: draft.id,
        userId: draft.user_id,
        name: draft.name,
        type: draft.type,
        exercises: draft.workout_log_exercises?.map(ex => ({
          exerciseId: ex.exercise_id,
          sets: ex.sets,
          reps: ex.reps || [],
          weights: ex.weights || [],
          completed: ex.completed || [],
          notes: ex.notes || '',
          bodyweight: ex.bodyweight || null
        })) || [],
        isDraft: draft.is_draft,
        isWorkoutFinished: draft.is_finished,
        lastModified: new Date(draft.updated_at),
        date: new Date(draft.date)
      }))
    } catch (error) {
      console.error('Error loading drafts:', error)
      throw new Error('Failed to load workout drafts')
    }
  }

  /**
   * Delete a specific draft
   */
  async deleteDraft(userId, draftId) {
    if (!userId || !draftId) {
      throw new Error('User ID and draft ID are required')
    }

    try {
      await workoutLogService.deleteDraft(userId, draftId)
    } catch (error) {
      console.error('Error deleting draft:', error)
      throw new Error('Failed to delete workout draft')
    }
  }

  /**
   * Convert a draft to a completed workout (single-draft mode)
   */
  async completeDraft(userId, draftId, exercises, workoutName) {
    if (!userId || !draftId || !exercises) {
      throw new Error('Invalid parameters for completing draft')
    }

    // Transform exercises to match Supabase format
    const transformedExercises = exercises.map(ex => ({
      exerciseId: ex.exerciseId,
      sets: Number(ex.sets),
      reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
      weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
      completed: ex.completed,
      notes: ex.notes || '',
      bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null
    }))

    try {
      const result = await workoutLogService.completeDraft(
        userId,
        draftId,
        transformedExercises,
        workoutName
      )

      console.log('Quick workout draft completed successfully')
      
      // Transform result to match Firebase format
      return {
        id: result.id,
        userId: result.user_id,
        name: result.name,
        type: result.type,
        exercises: transformedExercises,
        completedDate: new Date(result.completed_date),
        date: new Date(result.date),
        isDraft: result.is_draft,
        isWorkoutFinished: result.is_finished,
        lastModified: new Date(result.updated_at)
      }
    } catch (error) {
      console.error('Error completing draft:', error)
      throw new Error('Failed to complete workout draft')
    }
  }

  /**
   * Clean up old drafts (older than threshold)
   */
  async cleanupOldDrafts(userId) {
    if (!userId) {
      return 0
    }

    try {
      // Get count before cleanup
      const oldDrafts = await workoutLogService.loadDrafts(userId, 50)
      const thresholdDate = new Date()
      thresholdDate.setDate(thresholdDate.getDate() - this.OLD_DRAFT_THRESHOLD_DAYS)
      
      const oldCount = oldDrafts.filter(draft => 
        new Date(draft.updated_at) < thresholdDate
      ).length

      await workoutLogService.cleanupOldDrafts(userId, this.OLD_DRAFT_THRESHOLD_DAYS)
      
      console.log(`Cleaned up ${oldCount} old workout drafts`)
      return oldCount
    } catch (error) {
      console.error('Error cleaning up old drafts:', error)
      return 0
    }
  }

  /**
   * Get draft statistics for a user
   */
  async getDraftStats(userId) {
    if (!userId) {
      return { count: 0, oldestDate: null, newestDate: null }
    }

    try {
      const drafts = await this.loadDrafts(userId, 50)
      
      if (drafts.length === 0) {
        return { count: 0, oldestDate: null, newestDate: null }
      }

      const dates = drafts.map(draft => draft.lastModified).sort((a, b) => a - b)

      return {
        count: drafts.length,
        oldestDate: dates[0],
        newestDate: dates[dates.length - 1]
      }
    } catch (error) {
      console.error('Error getting draft stats:', error)
      return { count: 0, oldestDate: null, newestDate: null }
    }
  }

  /**
   * Check if there are any conflicts (multiple drafts with same exercises)
   */
  async checkForConflicts(userId) {
    if (!userId) {
      return []
    }

    try {
      const drafts = await this.loadDrafts(userId, 10)
      const conflicts = []

      // Simple conflict detection based on exercise similarity
      for (let i = 0; i < drafts.length; i++) {
        for (let j = i + 1; j < drafts.length; j++) {
          const draft1 = drafts[i]
          const draft2 = drafts[j]

          // Check if drafts have similar exercises (>50% overlap)
          const exercises1 = new Set(draft1.exercises?.map(ex => ex.exerciseId) || [])
          const exercises2 = new Set(draft2.exercises?.map(ex => ex.exerciseId) || [])
          
          const intersection = new Set([...exercises1].filter(x => exercises2.has(x)))
          const union = new Set([...exercises1, ...exercises2])
          
          const similarity = intersection.size / union.size
          
          if (similarity > 0.5) {
            conflicts.push({
              draft1: draft1,
              draft2: draft2,
              similarity: similarity
            })
          }
        }
      }

      return conflicts
    } catch (error) {
      console.error('Error checking for conflicts:', error)
      return []
    }
  }
}

// Export singleton instance
const supabaseQuickWorkoutDraftService = new SupabaseQuickWorkoutDraftService()
export default supabaseQuickWorkoutDraftService