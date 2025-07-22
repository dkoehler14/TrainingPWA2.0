/**
 * useAutoSave Custom Hook
 * 
 * Provides automatic saving functionality for Quick Workout with debounced save operations.
 * Manages draft state, save status, and error handling with cleanup on component unmount.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { debounce } from 'lodash';
import quickWorkoutDraftService from '../services/quickWorkoutDraftService';

const useAutoSave = (user, selectedExercises, workoutName) => {
  // State management for auto-save functionality
  const [currentDraftId, setCurrentDraftId] = useState(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [autoSaveError, setAutoSaveError] = useState(null);

  // Ref to track if component is mounted for cleanup
  const isMountedRef = useRef(true);

  // Debounced save function with 1-second delay (matching requirements)
  const debouncedSave = useCallback(
    debounce(async (userData, exercises, name, draftId) => {
      // Skip save if component is unmounted or no valid data
      if (!isMountedRef.current || !userData || !exercises || exercises.length === 0) {
        return;
      }

      setIsAutoSaving(true);
      setAutoSaveError(null);

      try {
        const result = await quickWorkoutDraftService.saveDraft(
          userData.uid,
          exercises,
          name,
          draftId
        );

        // Only update state if component is still mounted
        if (isMountedRef.current) {
          setCurrentDraftId(result.id);
          setLastSaveTime(new Date());
        }
      } catch (error) {
        console.error('Auto-save failed:', error);
        
        // Only update error state if component is still mounted
        if (isMountedRef.current) {
          setAutoSaveError(error);
        }
      } finally {
        // Only update loading state if component is still mounted
        if (isMountedRef.current) {
          setIsAutoSaving(false);
        }
      }
    }, 1000), // 1 second debounce as per requirements
    []
  );

  // Trigger auto-save when data changes
  useEffect(() => {
    if (user && selectedExercises && selectedExercises.length > 0) {
      debouncedSave(user, selectedExercises, workoutName, currentDraftId);
    }
  }, [user, selectedExercises, workoutName, currentDraftId, debouncedSave]);

  // Clear draft function
  const clearDraft = useCallback(async () => {
    if (!user || !currentDraftId) return;

    try {
      await quickWorkoutDraftService.deleteDraft(user.uid, currentDraftId);
      
      if (isMountedRef.current) {
        setCurrentDraftId(null);
        setLastSaveTime(null);
        setAutoSaveError(null);
      }
    } catch (error) {
      console.error('Failed to clear draft:', error);
      
      if (isMountedRef.current) {
        setAutoSaveError(error);
      }
    }
  }, [user, currentDraftId]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      // Mark component as unmounted
      isMountedRef.current = false;
      
      // Cancel any pending debounced saves
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Return hook interface
  return {
    debouncedSave,
    currentDraftId,
    isAutoSaving,
    lastSaveTime,
    autoSaveError,
    clearDraft
  };
};

export default useAutoSave;