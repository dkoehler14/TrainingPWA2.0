/**
 * Quick Workout Draft Management Service
 * 
 * Handles saving, loading, and managing draft workouts for the Quick Workout feature.
 * Provides automatic cleanup of old drafts and conflict resolution.
 */

import { db } from '../firebase';
import { 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    collection, 
    Timestamp 
} from 'firebase/firestore';
import {
    getCollectionCached,
    invalidateWorkoutCache,
    invalidateUserCache
} from '../api/enhancedFirestoreCache';

class QuickWorkoutDraftService {
    constructor() {
        // Phase 1 Optimization: Increase draft cache TTL since drafts don't change frequently
        this.DRAFT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes (was 5 minutes)
        this.OLD_DRAFT_THRESHOLD_DAYS = 7;
    }

    /**
     * Save a workout as a draft (single-draft mode - replaces any existing draft)
     */
    async saveDraft(userId, exercises, workoutName, existingDraftId = null) {
        if (!userId || !exercises || exercises.length === 0) {
            throw new Error('Invalid parameters for saving draft');
        }

        const draftData = {
            userId,
            name: workoutName || `Quick Workout - ${new Date().toLocaleDateString()}`,
            type: 'quick_workout',
            exercises: exercises.map(ex => ({
                exerciseId: ex.exerciseId,
                sets: Number(ex.sets),
                reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
                weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
                completed: ex.completed,
                notes: ex.notes || '',
                bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null
            })),
            isDraft: true,
            isWorkoutFinished: false,
            lastModified: Timestamp.fromDate(new Date()),
            date: Timestamp.fromDate(new Date())
        };

        let result;
        
        // For single-draft mode: if no existingDraftId provided, check for existing draft
        if (!existingDraftId) {
            const existingDraft = await this.getSingleDraft(userId);
            if (existingDraft) {
                existingDraftId = existingDraft.id;
            }
        }

        if (existingDraftId) {
            // Update existing draft
            await updateDoc(doc(db, "workoutLogs", existingDraftId), draftData);
            result = { id: existingDraftId, ...draftData };
        } else {
            // Create new draft (and clean up any orphaned drafts)
            await this.cleanupAllDrafts(userId);
            const docRef = await addDoc(collection(db, "workoutLogs"), draftData);
            result = { id: docRef.id, ...draftData };
        }

        // Phase 1 Optimization: Granular cache invalidation
        // Only invalidate workout cache if this is a significant change
        if (exercises && exercises.length > 0) {
            invalidateWorkoutCache(userId);
        } else {
            // For minor draft updates, only invalidate specific draft cache
            const cacheKey = `workoutLogs_drafts_${userId}`;
            invalidateUserCache(userId, [cacheKey]);
        }
        
        return result;
    }

    /**
     * Get the single draft for a user (single-draft mode)
     */
    async getSingleDraft(userId) {
        if (!userId) {
            throw new Error('User ID is required to load draft');
        }

        try {
            const draftsData = await getCollectionCached(
                'workoutLogs',
                {
                    where: [
                        ['userId', '==', userId],
                        ['isDraft', '==', true],
                        ['type', '==', 'quick_workout']
                    ],
                    orderBy: [['lastModified', 'desc']],
                    limit: 1
                },
                this.DRAFT_CACHE_TTL
            );

            return draftsData.length > 0 ? draftsData[0] : null;
        } catch (error) {
            console.error('Error loading single draft:', error);
            throw new Error('Failed to load workout draft');
        }
    }

    /**
     * Clean up all drafts for a user (used in single-draft mode)
     */
    async cleanupAllDrafts(userId) {
        if (!userId) {
            return;
        }

        try {
            const allDrafts = await getCollectionCached(
                'workoutLogs',
                {
                    where: [
                        ['userId', '==', userId],
                        ['isDraft', '==', true],
                        ['type', '==', 'quick_workout']
                    ]
                },
                60 * 60 * 1000 // 1 hour cache for cleanup operations
            );

            // Delete all existing drafts
            const deletePromises = allDrafts.map(draft =>
                deleteDoc(doc(db, "workoutLogs", draft.id))
            );

            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
                // Phase 1 Optimization: Targeted cache invalidation for cleanup
                invalidateWorkoutCache(userId);
                console.log(`Phase 1: Cleaned up ${deletePromises.length} existing workout drafts with optimized cache invalidation`);
            }

            return deletePromises.length;
        } catch (error) {
            console.error('Error cleaning up all drafts:', error);
            // Don't throw error for cleanup operations
            return 0;
        }
    }

    /**
     * Load all drafts for a user
     */
    async loadDrafts(userId, limit = 5) {
        if (!userId) {
            throw new Error('User ID is required to load drafts');
        }

        try {
            const draftsData = await getCollectionCached(
                'workoutLogs',
                {
                    where: [
                        ['userId', '==', userId],
                        ['isDraft', '==', true],
                        ['type', '==', 'quick_workout']
                    ],
                    orderBy: [['lastModified', 'desc']],
                    limit
                },
                this.DRAFT_CACHE_TTL
            );

            return draftsData;
        } catch (error) {
            console.error('Error loading drafts:', error);
            throw new Error('Failed to load workout drafts');
        }
    }

    /**
     * Delete a specific draft
     */
    async deleteDraft(userId, draftId) {
        if (!userId || !draftId) {
            throw new Error('User ID and draft ID are required');
        }

        try {
            await deleteDoc(doc(db, "workoutLogs", draftId));
            // Phase 1 Optimization: Minimal cache invalidation for single draft deletion
            // Only invalidate draft-specific cache, not all workout data
            const cacheKey = `workoutLogs_drafts_${userId}`;
            invalidateUserCache(userId, [cacheKey]);
        } catch (error) {
            console.error('Error deleting draft:', error);
            throw new Error('Failed to delete workout draft');
        }
    }

    /**
     * Convert a draft to a completed workout (single-draft mode)
     */
    async completeDraft(userId, draftId, exercises, workoutName) {
        if (!userId || !draftId || !exercises) {
            throw new Error('Invalid parameters for completing draft');
        }

        const completedWorkoutData = {
            userId,
            name: workoutName || `Quick Workout - ${new Date().toLocaleDateString()}`,
            type: 'quick_workout',
            exercises: exercises.map(ex => ({
                exerciseId: ex.exerciseId,
                sets: Number(ex.sets),
                reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
                weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
                completed: ex.completed,
                notes: ex.notes || '',
                bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null
            })),
            completedDate: Timestamp.fromDate(new Date()),
            date: Timestamp.fromDate(new Date()),
            isDraft: false,
            isWorkoutFinished: true,
            lastModified: Timestamp.fromDate(new Date())
        };

        try {
            // Convert the draft to a completed workout
            await updateDoc(doc(db, "workoutLogs", draftId), completedWorkoutData);
            // Phase 1 Optimization: Full cache invalidation needed when completing draft
            // This affects both draft and workout history caches
            invalidateWorkoutCache(userId);
            
            console.log('Phase 1: Quick workout draft completed with optimized cache invalidation');
            return { id: draftId, ...completedWorkoutData };
        } catch (error) {
            console.error('Error completing draft:', error);
            throw new Error('Failed to complete workout draft');
        }
    }

    /**
     * Clean up old drafts (older than threshold)
     */
    async cleanupOldDrafts(userId) {
        if (!userId) {
            return;
        }

        try {
            const thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - this.OLD_DRAFT_THRESHOLD_DAYS);

            const oldDrafts = await getCollectionCached(
                'workoutLogs',
                {
                    where: [
                        ['userId', '==', userId],
                        ['isDraft', '==', true],
                        ['lastModified', '<', Timestamp.fromDate(thresholdDate)]
                    ]
                },
                60 * 60 * 1000 // 1 hour cache for cleanup operations
            );

            // Delete old drafts in batches
            const deletePromises = oldDrafts.map(draft => 
                deleteDoc(doc(db, "workoutLogs", draft.id))
            );

            if (deletePromises.length > 0) {
                await Promise.all(deletePromises);
                // Phase 1 Optimization: Targeted invalidation for old draft cleanup
                const cacheKey = `workoutLogs_drafts_${userId}`;
                invalidateUserCache(userId, [cacheKey]);
                console.log(`Phase 1: Cleaned up ${deletePromises.length} old workout drafts with minimal cache invalidation`);
            }

            return deletePromises.length;
        } catch (error) {
            console.error('Error cleaning up old drafts:', error);
            // Don't throw error for cleanup operations
            return 0;
        }
    }

    /**
     * Get draft statistics for a user
     */
    async getDraftStats(userId) {
        if (!userId) {
            return { count: 0, oldestDate: null, newestDate: null };
        }

        try {
            const drafts = await this.loadDrafts(userId, 50); // Get more for stats
            
            if (drafts.length === 0) {
                return { count: 0, oldestDate: null, newestDate: null };
            }

            const dates = drafts.map(draft => 
                draft.lastModified?.toDate ? draft.lastModified.toDate() : new Date(draft.lastModified)
            ).sort((a, b) => a - b);

            return {
                count: drafts.length,
                oldestDate: dates[0],
                newestDate: dates[dates.length - 1]
            };
        } catch (error) {
            console.error('Error getting draft stats:', error);
            return { count: 0, oldestDate: null, newestDate: null };
        }
    }

    /**
     * Check if there are any conflicts (multiple drafts with same exercises)
     */
    async checkForConflicts(userId) {
        if (!userId) {
            return [];
        }

        try {
            const drafts = await this.loadDrafts(userId, 10);
            const conflicts = [];

            // Simple conflict detection based on exercise similarity
            for (let i = 0; i < drafts.length; i++) {
                for (let j = i + 1; j < drafts.length; j++) {
                    const draft1 = drafts[i];
                    const draft2 = drafts[j];

                    // Check if drafts have similar exercises (>50% overlap)
                    const exercises1 = new Set(draft1.exercises?.map(ex => ex.exerciseId) || []);
                    const exercises2 = new Set(draft2.exercises?.map(ex => ex.exerciseId) || []);
                    
                    const intersection = new Set([...exercises1].filter(x => exercises2.has(x)));
                    const union = new Set([...exercises1, ...exercises2]);
                    
                    const similarity = intersection.size / union.size;
                    
                    if (similarity > 0.5) {
                        conflicts.push({
                            draft1: draft1,
                            draft2: draft2,
                            similarity: similarity
                        });
                    }
                }
            }

            return conflicts;
        } catch (error) {
            console.error('Error checking for conflicts:', error);
            return [];
        }
    }
}

// Export singleton instance
const quickWorkoutDraftService = new QuickWorkoutDraftService();
export default quickWorkoutDraftService;