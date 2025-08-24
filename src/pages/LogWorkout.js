import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Table, Spinner, Modal, Dropdown } from 'react-bootstrap';
import { Pencil, ThreeDotsVertical, BarChart, Plus, ArrowLeftRight, Dash, X } from 'react-bootstrap-icons';
import { useAuth } from '../hooks/useAuth';
import { useNumberInput } from '../hooks/useNumberInput.js';
import useWorkoutRealtime, { useWorkoutProgressBroadcast } from '../hooks/useWorkoutRealtime';
import useCacheManager from '../hooks/useCacheManager.js';
import '../styles/LogWorkout.css';
import { debounce } from 'lodash';
import { useNavigate } from 'react-router-dom';
import { getUserPrograms, getProgramById, updateProgram, updateProgramExercise } from '../services/programService';
import { getAvailableExercises } from '../services/exerciseService';
import workoutLogService from '../services/workoutLogService';
import SaveStrategyManager from '../services/saveStrategyManager';
import { parseWeeklyConfigs } from '../utils/programUtils';
import {
  transformSupabaseProgramToWeeklyConfigs,
  transformSupabaseExercises,
  transformExercisesToSupabaseFormat,
  transformSupabaseWorkoutLogs,
  createWorkoutDataForSupabase,
  ensureBackwardCompatibility
} from '../utils/dataTransformations';
import ExerciseGrid from '../components/ExerciseGrid';
import ExerciseHistoryModal from '../components/ExerciseHistoryModal';
import WorkoutRealtimeIndicator from '../components/WorkoutRealtimeIndicator';
// Supabase error handling utilities
import {
  handleSupabaseError,
  getErrorMessage,
  executeSupabaseOperation,
  SupabaseError
} from '../utils/supabaseErrorHandler';

// Enhanced workout error handling components and hooks
import {
  WorkoutErrorDisplay,
  RetryMechanism,
  OperationProgress,
  ErrorRecoveryModal,
  SaveStatusIndicator,
  ErrorSummary
} from '../components/WorkoutErrorHandler';
import { useSaveErrorHandler } from '../hooks/useWorkoutErrorHandler';
import '../styles/WorkoutErrorHandler.css';

// Workout debugging and monitoring utilities
import {
  workoutDebugger,
  WORKOUT_OPERATIONS
} from '../utils/workoutDebugging';

// Supabase debugging utilities
import { initializeSupabaseDebugging } from '../utils/supabaseDebugger';
import { initializeConnectionMonitoring } from '../utils/supabaseConnectionMonitor';
import { supabase } from '../config/supabase';




function WorkoutSummaryModal({ show, onHide, workoutData, exercisesList, weightUnit }) {
  // Calculate total volume
  const totalVolume = workoutData.reduce((sum, ex) => {
    const exercise = exercisesList.find(e => e.id === ex.exerciseId);
    const exerciseType = exercise?.exerciseType || '';
    let exerciseVolume = 0;
    if (exerciseType === 'Bodyweight') {
      exerciseVolume = ex.weights.reduce((acc, weight, idx) =>
        acc + (Number(weight) || 0) * (Number(ex.reps[idx]) || 0), 0);
    } else if (exerciseType === 'Bodyweight Loadable') {
      exerciseVolume = ex.weights.reduce((acc, weight, idx) =>
        acc + ((Number(ex.bodyweight) || 0) + (Number(weight) || 0)) * (Number(ex.reps[idx]) || 0), 0);
    } else {
      exerciseVolume = ex.weights.reduce((acc, weight, idx) =>
        acc + (Number(weight) || 0) * (Number(ex.reps[idx]) || 0), 0);
    }
    return sum + exerciseVolume;
  }, 0);

  // Calculate muscle group metrics
  const muscleGroupMetrics = workoutData.reduce((acc, ex) => {
    const exercise = exercisesList.find(e => e.id === ex.exerciseId);
    const muscleGroup = exercise?.primaryMuscleGroup || 'Unknown';
    const exerciseType = exercise?.exerciseType || '';
    let volume = 0;
    if (exerciseType === 'Bodyweight') {
      volume = ex.weights.reduce((sum, weight, idx) =>
        sum + (Number(weight) || 0) * (Number(ex.reps[idx]) || 0), 0);
    } else if (exerciseType === 'Bodyweight Loadable') {
      volume = ex.weights.reduce((sum, weight, idx) =>
        sum + ((Number(ex.bodyweight) || 0) + (Number(weight) || 0)) * (Number(ex.reps[idx]) || 0), 0);
    } else {
      volume = ex.weights.reduce((sum, weight, idx) =>
        sum + (Number(weight) || 0) * (Number(ex.reps[idx]) || 0), 0);
    }
    const sets = Number(ex.sets) || 0;

    if (!acc[muscleGroup]) {
      acc[muscleGroup] = { volume: 0, sets: 0 };
    }
    acc[muscleGroup].volume += volume;
    acc[muscleGroup].sets += sets;
    return acc;
  }, {});

  // Convert to array for rendering
  const muscleGroupList = Object.entries(muscleGroupMetrics).map(([group, metrics]) => ({
    group,
    volume: metrics.volume,
    sets: metrics.sets
  })).sort((a, b) => b.volume - a.volume); // Sort by volume descending

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>Workout Summary</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="text-center mb-4">
          <h3 style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
            {totalVolume.toLocaleString()} {weightUnit}
          </h3>
          <p className="text-muted">Total Volume</p>
        </div>

        <h6>Muscle Group Breakdown</h6>
        {muscleGroupList.length > 0 ? (
          <Table responsive className="muscle-group-table">
            <thead>
              <tr>
                <th>Muscle Group</th>
                <th>Volume ({weightUnit})</th>
                <th>Sets</th>
              </tr>
            </thead>
            <tbody>
              {muscleGroupList.map((metric, idx) => (
                <tr key={idx}>
                  <td>{metric.group}</td>
                  <td>{metric.volume.toLocaleString()}</td>
                  <td>{metric.sets}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-center text-muted">No muscle group data available.</p>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}

/**
 * LogWorkout Component
 * 
 * Main workout logging interface that allows users to:
 * - Select and navigate through program workouts
 * - Log exercise sets, reps, and weights
 * - Auto-save workout progress
 * - Complete workouts and trigger analytics processing
 * - Add/remove exercises temporarily or permanently
 * - View exercise history and replace exercises
 * 
 * Features:
 * - Real-time workout updates and progress broadcasting
 * - Optimized Supabase caching for improved performance
 * - Enhanced error handling with user-friendly messages
 * - Mobile-responsive design
 * - Debounced auto-save functionality
 * 
 * @component
 */
function LogWorkout() {
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [programLogs, setProgramLogs] = useState({});
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const [exercisesList, setExercisesList] = useState([]);
  const [logData, setLogData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [alternativeExercises, setAlternativeExercises] = useState([]);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [exerciseToReplace, setExerciseToReplace] = useState(null);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false); // For adding a spinner while fetching alternatives
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(null);
  const [exerciseNotes, setExerciseNotes] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 767);

  // Enhanced cache manager integration
  const {
    getCachedWorkoutLog,
    invalidateCacheEntry,
    getCachedWorkoutLogId,
    validateCachedWorkoutLogId,
    cleanupInvalidCacheEntry,
    updateProgramLogs,
    getCacheStats,
    updateCachedWorkoutLog
  } = useCacheManager(programLogs, setProgramLogs, {
    validateInDatabase: false,
    autoCleanup: true,
    logOperations: true
  });

  // Initialize Save Strategy Manager
  const saveStrategyManager = useRef(null);
  if (!saveStrategyManager.current) {
    saveStrategyManager.current = new SaveStrategyManager({
      enablePerformanceMonitoring: true,
      enableDebugLogging: true,
      defaultDebounceMs: 1500,
      fallbackToFullSave: true
    });
  }

  // Add save lock to prevent multiple simultaneous saves for the same workout session
  const saveLockRef = useRef(null);

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedExerciseHistory, setSelectedExerciseHistory] = useState(null);
  const [isWorkoutFinished, setIsWorkoutFinished] = useState(false);
  const [showGridModal, setShowGridModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showBodyweightModal, setShowBodyweightModal] = useState(false);
  const [bodyweightInput, setBodyweightInput] = useState('');
  const [bodyweightExerciseIndex, setBodyweightExerciseIndex] = useState(null);
  const [showIncompleteWarningModal, setShowIncompleteWarningModal] = useState(false);

  // Add Exercise functionality state
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [addExerciseType, setAddExerciseType] = useState('temporary');
  const [isAddingExercise, setIsAddingExercise] = useState(false);

  // User message state for enhanced error handling
  const [userMessage, setUserMessage] = useState({ text: '', type: '', show: false });

  // Enhanced error handling with save operations
  const {
    saveStatus,
    executeSave,
    retrySave,
    markUnsaved,
    clearSaveError,
    errors,
    errorStats,
    addError,
    removeError,
    clearAllErrors,
    retryAllErrors,
    showErrorDetails,
    hideErrorModal,
    showErrorModal,
    selectedError,
    isProcessingRecovery,
    hasCriticalErrors,
    hasRetryableErrors,
    canRetry
  } = useSaveErrorHandler({
    maxRetries: 3,
    retryDelay: 1500,
    // onSaveSuccess: (result) => {
    //   showUserMessage('Workout saved successfully', 'success');
    // },
    // onSaveError: (error) => {
    //   // Error display is handled by the error components
    //   console.error('Save operation failed:', error);
    // }
  });

  const { user, isAuthenticated, userRole } = useAuth();
  const navigate = useNavigate();

  // Enhanced real-time capabilities for workout updates with cache integration
  const realtimeHook = useWorkoutRealtime(
    user?.id,
    selectedProgram?.id,
    selectedWeek,
    selectedDay,
    {
      enabled: true,
      onUpdate: async (update) => {
        // Handle real-time updates from other clients or server with cache integration
        if (update.type === 'UPDATE' || update.type === 'BROADCAST') {
          try {
            // Log real-time update for debugging
            workoutDebugger.logger.info('📡 REAL-TIME UPDATE: Received update', {
              operation: 'realtime_update',
              updateType: update.type,
              table: update.table,
              eventType: update.eventType,
              userId: update.userId,
              workoutLogId: update.workoutLogId,
              timestamp: update.timestamp,
              weekIndex: selectedWeek,
              dayIndex: selectedDay
            });

            // Handle workout log updates with intelligent merging
            if (update.table === 'workout_logs' && update.eventType === 'UPDATE') {
              await handleWorkoutLogRealtimeUpdate(update);
            }

            // Handle exercise updates with conflict resolution
            if (update.table === 'workout_log_exercises') {
              await handleExerciseRealtimeUpdate(update);
            }

            // Handle broadcast updates (progress, presence, etc.)
            if (update.type === 'BROADCAST') {
              await handleBroadcastUpdate(update);
            }

            // Show appropriate user notification
            const notificationMessage = getRealtimeNotificationMessage(update);
            if (notificationMessage) {
              showUserMessage(notificationMessage, 'info');
            }

          } catch (error) {
            workoutDebugger.logger.error('❌ REAL-TIME UPDATE ERROR: Failed to process update', {
              operation: 'realtime_update',
              error: error.message,
              updateType: update.type,
              table: update.table,
              timestamp: new Date().toISOString()
            });

            // Don't show error to user for real-time update failures
            if (process.env.NODE_ENV === 'development') {
              console.warn('Real-time update processing failed:', error);
            }
          }
        }
      },
      onError: (error) => {
        // Enhanced error handling with cache cleanup if needed
        workoutDebugger.logger.warn('⚠️ REAL-TIME CONNECTION ERROR: Connection issue detected', {
          operation: 'realtime_connection',
          errorType: error.type,
          errorMessage: error.message,
          reconnectAttempts: error.reconnectAttempts,
          timestamp: error.timestamp
        });

        // Don't show error to user unless it's critical
        if (process.env.NODE_ENV === 'development') {
          console.warn('Real-time connection error:', error);
        }
      },
      onConnectionChange: (connected, status) => {
        workoutDebugger.logger.info(`🔗 REAL-TIME CONNECTION: Status changed to ${status}`, {
          operation: 'realtime_connection',
          connected,
          status,
          weekIndex: selectedWeek,
          dayIndex: selectedDay,
          timestamp: new Date().toISOString()
        });

        if (process.env.NODE_ENV === 'development') {
          console.log(`Real-time connection ${connected ? 'established' : 'lost'}: ${status}`);
        }
      }
    }
  );

  // Enhanced real-time progress broadcasting
  const progressBroadcast = useWorkoutProgressBroadcast(realtimeHook);

  /**
   * Handle workout log real-time updates with intelligent merging
   * Preserves user input while applying remote changes
   */
  const handleWorkoutLogRealtimeUpdate = useCallback(async (update) => {
    const updatedData = update.data;
    const key = `${selectedWeek}_${selectedDay}`;

    // Check if this update is for the current workout session
    if (!programLogs[key] || updatedData.user_id !== user?.id) {
      return;
    }

    // Get current cached data
    const currentCachedData = await getCachedWorkoutLog(selectedWeek, selectedDay);

    // Detect and resolve conflicts
    const conflicts = await detectAndResolveConflicts(currentCachedData, update);

    // Intelligent merging: preserve user input, apply remote changes
    const mergedData = {
      ...currentCachedData,
      workoutLogId: updatedData.id,
      isWorkoutFinished: updatedData.is_finished,
      lastSaved: updatedData.updated_at || new Date().toISOString(),
      // Preserve current exercises if user is actively editing
      exercises: currentCachedData?.exercises || [],
      metadata: {
        ...currentCachedData?.metadata,
        remoteUpdate: true,
        remoteTimestamp: update.timestamp,
        source: 'realtime_workout_log_update',
        conflicts: conflicts.length > 0 ? conflicts : undefined
      }
    };

    // Update cache with merged data
    await updateCachedWorkoutLog(selectedWeek, selectedDay, mergedData, {
      source: 'realtime_workout_log_update',
      preserveUserInput: true,
      hasConflicts: conflicts.length > 0
    });

    // Update local state if workout completion status changed
    if (updatedData.is_finished !== isWorkoutFinished) {
      setIsWorkoutFinished(updatedData.is_finished);

      workoutDebugger.logger.info('🏁 WORKOUT STATUS CHANGED: Real-time update changed completion status', {
        operation: 'realtime_workout_status_change',
        previousStatus: isWorkoutFinished,
        newStatus: updatedData.is_finished,
        workoutLogId: updatedData.id,
        timestamp: new Date().toISOString(),
        hasConflicts: conflicts.length > 0
      });
    }

    // Handle cache invalidation based on conflicts and timing
    const timeDiff = new Date(update.timestamp) - new Date(currentCachedData?.lastSaved || 0);
    if (timeDiff > 30000 || conflicts.length > 0) {
      const reason = conflicts.length > 0 ? 'conflict_detected' : 'timestamp_conflict';
      await handleRealtimeCacheInvalidation(update, reason);
    }

  }, [selectedWeek, selectedDay, programLogs, user, getCachedWorkoutLog, updateCachedWorkoutLog, invalidateCacheEntry, isWorkoutFinished]);

  /**
   * Handle exercise real-time updates with conflict resolution
   * Preserves user input while merging remote exercise changes
   */
  const handleExerciseRealtimeUpdate = useCallback(async (update) => {
    const updatedExercise = update.data;

    // Check if this update affects current workout
    if (!updatedExercise.workout_log_id) {
      return;
    }

    const currentCachedData = await getCachedWorkoutLog(selectedWeek, selectedDay);
    if (!currentCachedData || currentCachedData.workoutLogId !== updatedExercise.workout_log_id) {
      return;
    }

    // Find the exercise in current data
    const currentExercises = logData || [];
    const exerciseIndex = currentExercises.findIndex(ex =>
      ex.exerciseId === updatedExercise.exercise_id &&
      ex.orderIndex === updatedExercise.order_index
    );

    if (exerciseIndex === -1) {
      // New exercise added remotely - add to current data
      const newExercise = transformSupabaseExerciseToLocal(updatedExercise);
      const updatedExercises = [...currentExercises, newExercise].sort((a, b) => a.orderIndex - b.orderIndex);

      setLogData(updatedExercises);

      await updateCachedWorkoutLog(selectedWeek, selectedDay, {
        exercises: updatedExercises
      }, {
        source: 'realtime_exercise_add',
        exerciseId: updatedExercise.exercise_id
      });

      workoutDebugger.logger.info('➕ EXERCISE ADDED: Real-time exercise addition', {
        operation: 'realtime_exercise_add',
        exerciseId: updatedExercise.exercise_id,
        orderIndex: updatedExercise.order_index,
        workoutLogId: updatedExercise.workout_log_id
      });

    } else {
      // Exercise updated remotely - merge with local changes
      const currentExercise = currentExercises[exerciseIndex];

      // Check for conflicts before merging
      const hasLocalChanges = currentExercise.lastModified &&
        new Date(currentExercise.lastModified) > new Date(updatedExercise.updated_at);

      const mergedExercise = mergeExerciseData(currentExercise, updatedExercise);

      const updatedExercises = [...currentExercises];
      updatedExercises[exerciseIndex] = mergedExercise;

      setLogData(updatedExercises);

      await updateCachedWorkoutLog(selectedWeek, selectedDay, {
        exercises: updatedExercises
      }, {
        source: 'realtime_exercise_update',
        exerciseId: updatedExercise.exercise_id,
        preserveUserInput: true,
        hasConflicts: hasLocalChanges
      });

      workoutDebugger.logger.info('🔄 EXERCISE UPDATED: Real-time exercise merge', {
        operation: 'realtime_exercise_update',
        exerciseId: updatedExercise.exercise_id,
        orderIndex: updatedExercise.order_index,
        hasLocalChanges,
        conflictResolution: mergedExercise.metadata?.conflictResolution
      });

      // Invalidate cache if there are significant conflicts
      if (hasLocalChanges) {
        await handleRealtimeCacheInvalidation(update, 'exercise_conflict');
      }
    }

  }, [selectedWeek, selectedDay, logData, getCachedWorkoutLog, updateCachedWorkoutLog]);

  /**
   * Handle broadcast updates (progress, presence, etc.)
   */
  const handleBroadcastUpdate = useCallback(async (update) => {
    const broadcastData = update.data;

    // Handle different broadcast types
    switch (broadcastData.type) {
      case 'workout_progress':
        // Update progress indicators if needed
        workoutDebugger.logger.debug('📊 PROGRESS BROADCAST: Received progress update', {
          operation: 'realtime_progress_broadcast',
          completedSets: broadcastData.completedSets,
          totalSets: broadcastData.totalSets,
          percentage: broadcastData.percentage
        });
        break;

      case 'set_completion':
        // Handle set completion broadcasts
        workoutDebugger.logger.debug('✅ SET COMPLETION BROADCAST: Received set completion', {
          operation: 'realtime_set_completion',
          exerciseIndex: broadcastData.exerciseIndex,
          setIndex: broadcastData.setIndex,
          completed: broadcastData.completed
        });
        break;

      default:
        workoutDebugger.logger.debug('📡 GENERIC BROADCAST: Received broadcast update', {
          operation: 'realtime_generic_broadcast',
          broadcastType: broadcastData.type,
          timestamp: broadcastData.timestamp
        });
    }
  }, []);

  /**
   * Get appropriate notification message for real-time updates
   */
  const getRealtimeNotificationMessage = useCallback((update) => {
    if (update.table === 'workout_logs' && update.eventType === 'UPDATE') {
      if (update.data.is_finished !== isWorkoutFinished) {
        return update.data.is_finished ? 'Workout completed remotely' : 'Workout reopened remotely';
      }
      return 'Workout updated remotely';
    }

    if (update.table === 'workout_log_exercises') {
      return 'Exercise data updated remotely';
    }

    if (update.type === 'BROADCAST') {
      // Don't show notifications for broadcasts to avoid spam
      return null;
    }

    return 'Workout updated in real-time';
  }, [isWorkoutFinished]);

  /**
   * Merge exercise data preserving user input
   */
  const mergeExerciseData = useCallback((localExercise, remoteExercise) => {
    // Preserve user input if local changes are more recent
    const localTimestamp = new Date(localExercise.lastModified || 0);
    const remoteTimestamp = new Date(remoteExercise.updated_at || 0);

    if (localTimestamp > remoteTimestamp) {
      // Local changes are newer, preserve them
      return {
        ...localExercise,
        // Only update non-user-input fields
        id: remoteExercise.id,
        notes: remoteExercise.notes || localExercise.notes,
        metadata: {
          ...localExercise.metadata,
          remoteId: remoteExercise.id,
          remoteTimestamp: remoteExercise.updated_at,
          conflictResolution: 'local_preferred'
        }
      };
    } else {
      // Remote changes are newer, merge carefully
      return {
        ...remoteExercise,
        // Transform remote data to local format
        exerciseId: remoteExercise.exercise_id,
        orderIndex: remoteExercise.order_index,
        sets: remoteExercise.sets,
        reps: remoteExercise.reps || localExercise.reps,
        weights: remoteExercise.weights || localExercise.weights,
        completed: remoteExercise.completed || localExercise.completed,
        bodyweight: remoteExercise.bodyweight || localExercise.bodyweight,
        notes: remoteExercise.notes || localExercise.notes,
        lastModified: remoteExercise.updated_at,
        metadata: {
          ...localExercise.metadata,
          remoteUpdate: true,
          remoteTimestamp: remoteExercise.updated_at,
          conflictResolution: 'remote_preferred'
        }
      };
    }
  }, []);

  /**
   * Transform Supabase exercise data to local format
   */
  const transformSupabaseExerciseToLocal = useCallback((supabaseExercise) => {
    return {
      id: supabaseExercise.id,
      exerciseId: supabaseExercise.exercise_id,
      orderIndex: supabaseExercise.order_index,
      sets: supabaseExercise.sets,
      reps: supabaseExercise.reps || [],
      weights: supabaseExercise.weights || [],
      completed: supabaseExercise.completed || [],
      bodyweight: supabaseExercise.bodyweight,
      notes: supabaseExercise.notes || '',
      lastModified: supabaseExercise.updated_at,
      metadata: {
        source: 'realtime_transform',
        remoteId: supabaseExercise.id,
        remoteTimestamp: supabaseExercise.updated_at
      }
    };
  }, []);

  /**
   * Handle cache invalidation for real-time updates
   * Intelligently decides when to invalidate cache based on update context
   */
  const handleRealtimeCacheInvalidation = useCallback(async (update, reason) => {
    try {
      const currentCachedData = await getCachedWorkoutLog(selectedWeek, selectedDay);

      // Don't invalidate if user has recent input (within last 30 seconds)
      const lastUserInput = new Date(currentCachedData?.lastUserInput || 0);
      const timeSinceUserInput = Date.now() - lastUserInput.getTime();

      if (timeSinceUserInput < 30000) {
        workoutDebugger.logger.info('🛡️ CACHE PROTECTION: Preserving cache due to recent user input', {
          operation: 'realtime_cache_protection',
          timeSinceUserInput,
          reason,
          updateType: update.type,
          table: update.table
        });
        return;
      }

      // Invalidate cache for significant conflicts
      await invalidateCacheEntry(selectedWeek, selectedDay, reason, {
        source: 'realtime_invalidation',
        updateType: update.type,
        table: update.table,
        timestamp: update.timestamp
      });

      workoutDebugger.logger.info('🗑️ CACHE INVALIDATED: Real-time update triggered cache invalidation', {
        operation: 'realtime_cache_invalidation',
        reason,
        updateType: update.type,
        table: update.table,
        timeSinceUserInput
      });

    } catch (error) {
      workoutDebugger.logger.error('❌ CACHE INVALIDATION ERROR: Failed to invalidate cache', {
        operation: 'realtime_cache_invalidation',
        error: error.message,
        reason,
        updateType: update.type
      });
    }
  }, [selectedWeek, selectedDay, getCachedWorkoutLog, invalidateCacheEntry]);

  /**
   * Detect and resolve conflicts between local and remote changes
   */
  const detectAndResolveConflicts = useCallback(async (localData, remoteUpdate) => {
    const conflicts = [];

    // Check for workout-level conflicts
    if (localData.isWorkoutFinished !== remoteUpdate.data.is_finished) {
      conflicts.push({
        type: 'workout_completion',
        local: localData.isWorkoutFinished,
        remote: remoteUpdate.data.is_finished,
        resolution: 'remote_wins' // Remote completion status takes precedence
      });
    }

    // Check for exercise-level conflicts
    if (remoteUpdate.table === 'workout_log_exercises') {
      const localExercise = localData.exercises?.find(ex =>
        ex.exerciseId === remoteUpdate.data.exercise_id &&
        ex.orderIndex === remoteUpdate.data.order_index
      );

      if (localExercise && localExercise.lastModified) {
        const localTime = new Date(localExercise.lastModified);
        const remoteTime = new Date(remoteUpdate.data.updated_at);

        if (Math.abs(localTime - remoteTime) < 5000) { // 5 second window
          conflicts.push({
            type: 'exercise_concurrent_edit',
            exerciseId: remoteUpdate.data.exercise_id,
            localTime,
            remoteTime,
            resolution: 'merge_required'
          });
        }
      }
    }

    // Log conflicts for monitoring
    if (conflicts.length > 0) {
      workoutDebugger.logger.warn('⚠️ CONFLICT DETECTED: Real-time update conflicts with local changes', {
        operation: 'conflict_detection',
        conflictCount: conflicts.length,
        conflicts: conflicts.map(c => ({ type: c.type, resolution: c.resolution })),
        updateType: remoteUpdate.type,
        table: remoteUpdate.table
      });
    }

    return conflicts;
  }, []);

  // Enhanced user message function with Supabase error handling
  const showUserMessage = (text, type = 'info') => {
    setUserMessage({ text, type, show: true });
    // Auto-hide after 5 seconds for non-error messages
    if (type !== 'error') {
      setTimeout(() => {
        setUserMessage(prev => ({ ...prev, show: false }));
      }, 5000);
    }
  };

  const hideUserMessage = () => {
    setUserMessage(prev => ({ ...prev, show: false }));
  };

  // Enhanced error handler using Supabase error utilities
  const handleError = (error, context = '', fallbackMessage = 'An unexpected error occurred') => {
    try {
      if (error instanceof SupabaseError) {
        // Already handled Supabase error
        showUserMessage(error.message, 'error');
        return;
      }

      // Handle and classify the error
      const handledError = handleSupabaseError(error, context);
      showUserMessage(handledError.message, 'error');
    } catch (handlingError) {
      // Fallback if error handling itself fails
      console.error('Error in error handling:', handlingError);
      showUserMessage(fallbackMessage, 'error');
    }
  };

  // Refs for number inputs
  const repsInputRef = useRef(null);
  const weightInputRef = useRef(null);

  // Use the hook for double-click selection
  useNumberInput(repsInputRef);
  useNumberInput(weightInputRef);

  // Helper function to detect if a value is a rep range
  const isRepRange = (value) => {

    try {
      console.log(typeof value);
      console.log(value);
    }
    catch {
      console.log("couldn't log value");
    }

    if (!value || typeof value !== 'string') return false;
    // Check for patterns like "8-10", "5/3/1", "8-12", etc.
    return /[^\d\s]/.test(value.toString()) && value.toString().trim() !== '';
  };

  // Cache validation and cleanup functions are now provided by useCacheManager hook

  // Cache functions are now provided by useCacheManager hook

  // Check window size on resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 767);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Enhanced debounced save function using SaveStrategyManager
  const debouncedSaveLog = useCallback(
    debounce(async (userData, programData, weekIndex, dayIndex, exerciseData, previousData = null) => {
      if (!userData || !programData || exerciseData.length === 0) return;

      // Create unique lock key for this workout session
      const lockKey = `${userData.id}_${programData.id}_${weekIndex}_${dayIndex}`;

      // Check if a save is already in progress for this session
      if (saveLockRef.current === lockKey) {
        console.log('🔄 SAVE LOCKED: Another save already in progress for this session, skipping', {
          lockKey,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // Mark as having unsaved changes
      markUnsaved();

      try {
        // Set the save lock
        saveLockRef.current = lockKey;
        console.log('🔒 SAVE LOCK ACQUIRED:', { lockKey, timestamp: new Date().toISOString() });

        // Execute save operation with error handling
        const result = await executeSave(async () => {
          // Transform exercise data to Supabase format
          const transformedExercises = transformExercisesToSupabaseFormat(exerciseData);

          // Prepare save request for SaveStrategyManager
          const saveRequest = {
            userId: userData.id,
            programId: programData.id,
            weekIndex,
            dayIndex,
            currentData: {
              metadata: {
                name: `Week ${weekIndex + 1}, Day ${dayIndex + 1}`,
                isFinished: false,
                isDraft: true,
                duration: null,
                notes: '',
                completedDate: null,
                weightUnit: 'LB'
              },
              exercises: transformedExercises,
              system: {
                userId: userData.id,
                programId: programData.id,
                weekIndex,
                dayIndex
              }
            },
            previousData,
            saveType: 'debounced',
            options: {
              cacheState: { isValid: true },
              lastSaveTime: null,
              userPreferences: {}
            }
          };

          // Execute save using SaveStrategyManager
          const saveResult = await saveStrategyManager.current.executeSave(saveRequest);

          workoutDebugger.logger.info('✅ DEBOUNCED SAVE SUCCESS: SaveStrategyManager completed operation', {
            operation: 'debouncedSaveLog',
            operationType: saveResult.operationType,
            saveStrategy: saveResult.changeAnalysis?.saveStrategy,
            logId: saveResult.workoutLogId,
            userId: userData.id,
            programId: programData.id,
            programName: programData.name,
            weekIndex,
            dayIndex,
            exerciseCount: transformedExercises.length,
            timestamp: new Date().toISOString(),
            performance: saveResult.performance,
            affectedTables: saveResult.affectedTables,
            cacheUpdated: saveResult.cacheUpdated
          });

          // Update local cache with the result
          if (saveResult.workoutLogId) {
            await updateCachedWorkoutLog(weekIndex, dayIndex, {
              workoutLogId: saveResult.workoutLogId,
              exercises: exerciseData,
              isWorkoutFinished: false,
              userId: userData.id,
              programId: programData.id
            }, {
              source: 'save_strategy_manager_debounced'
            });
          }

          // Convert to expected format for compatibility
          return {
            id: saveResult.workoutLogId,
            is_finished: false,
            wasUpdate: true,
            cacheHit: false,
            saveStrategy: saveResult.operationType,
            performance: saveResult.performance
          };

        }, 'auto');

        return result;

      } catch (error) {
        // Error is handled by the error handling system
        workoutDebugger.logger.error('❌ DEBOUNCED SAVE ERROR: SaveStrategyManager operation failed', {
          operation: 'debouncedSaveLog',
          error: error.message,
          errorType: error.type || 'unknown',
          errorCode: error.code,
          userId: userData.id,
          programId: programData.id,
          programName: programData.name,
          weekIndex,
          dayIndex,
          exerciseCount: exerciseData.length,
          timestamp: new Date().toISOString(),
          recoverable: error.recoverable,
          retryable: error.retryable
        });

        // Add error to error handling system with context for recovery
        addError(error, {
          operation: () => debouncedSaveLog(userData, programData, weekIndex, dayIndex, exerciseData, previousData),
          operationType: 'auto',
          source: 'save_strategy_manager_debounced',
          userData,
          programData,
          weekIndex,
          dayIndex,
          exerciseData,
          previousData,
          cacheManager: { cleanup: cleanupInvalidCacheEntry },
          cacheKey: `${weekIndex}_${dayIndex}`
        });

        throw error;
      } finally {
        // Release the save lock
        saveLockRef.current = null;
        console.log('🔓 SAVE LOCK RELEASED:', { timestamp: new Date().toISOString() });
      }
    }, 1500), // Debounce timing managed by SaveStrategyManager
    [executeSave, markUnsaved, addError, updateCachedWorkoutLog, cleanupInvalidCacheEntry, workoutDebugger]
  );

  // Enhanced immediate save function using SaveStrategyManager
  const immediateSaveLog = useCallback(async (userData, programData, weekIndex, dayIndex, exerciseData) => {
    // Cancel any pending debounced saves
    debouncedSaveLog.cancel();

    // Execute the save immediately
    if (!userData || !programData || exerciseData.length === 0) return;

    // Create unique lock key for this workout session
    const lockKey = `${userData.id}_${programData.id}_${weekIndex}_${dayIndex}`;

    // Check if a save is already in progress for this session
    if (saveLockRef.current === lockKey) {
      console.log('🔄 IMMEDIATE SAVE LOCKED: Another save already in progress for this session, skipping', {
        lockKey,
        timestamp: new Date().toISOString()
      });
      return;
    }

    try {
      // Set the save lock
      saveLockRef.current = lockKey;
      console.log('🔒 IMMEDIATE SAVE LOCK ACQUIRED:', { lockKey, timestamp: new Date().toISOString() });

      // Execute save operation with error handling
      const result = await executeSave(async () => {
        // Transform exercise data to Supabase format
        const transformedExercises = transformExercisesToSupabaseFormat(exerciseData);

        // Prepare save request for SaveStrategyManager
        const saveRequest = {
          userId: userData.id,
          programId: programData.id,
          weekIndex,
          dayIndex,
          currentData: {
            metadata: {
              name: `Week ${weekIndex + 1}, Day ${dayIndex + 1}`,
              isFinished: isWorkoutFinished,
              isDraft: !isWorkoutFinished,
              duration: null,
              notes: '',
              completedDate: isWorkoutFinished ? new Date().toISOString() : null,
              weightUnit: 'LB'
            },
            exercises: transformedExercises,
            system: {
              userId: userData.id,
              programId: programData.id,
              weekIndex,
              dayIndex
            }
          },
          previousData: null, // For immediate saves, we don't track previous data
          saveType: 'immediate',
          options: {
            cacheState: { isValid: true },
            lastSaveTime: null,
            userPreferences: {}
          }
        };

        // Execute save using SaveStrategyManager
        const saveResult = await saveStrategyManager.current.executeSave(saveRequest);

        workoutDebugger.logger.info('✅ IMMEDIATE SAVE SUCCESS: SaveStrategyManager completed operation', {
          operation: 'immediateSaveLog',
          operationType: saveResult.operationType,
          saveStrategy: saveResult.changeAnalysis?.saveStrategy,
          logId: saveResult.workoutLogId,
          userId: userData.id,
          programId: programData.id,
          programName: programData.name,
          weekIndex,
          dayIndex,
          exerciseCount: transformedExercises.length,
          timestamp: new Date().toISOString(),
          performance: saveResult.performance,
          affectedTables: saveResult.affectedTables,
          cacheUpdated: saveResult.cacheUpdated,
          saveType: 'immediate'
        });

        // Update local cache with the result
        if (saveResult.workoutLogId) {
          await updateCachedWorkoutLog(weekIndex, dayIndex, {
            workoutLogId: saveResult.workoutLogId,
            exercises: exerciseData,
            isWorkoutFinished: saveResult.changeAnalysis?.hasMetadataChanges ? isWorkoutFinished : false,
            userId: userData.id,
            programId: programData.id
          }, {
            source: 'save_strategy_manager_immediate'
          });
        }

        // Convert to expected format for compatibility
        return {
          id: saveResult.workoutLogId,
          is_finished: isWorkoutFinished,
          wasUpdate: true,
          cacheHit: false,
          saveStrategy: saveResult.operationType,
          performance: saveResult.performance
        };

      }, 'manual');

      return result;

    } catch (error) {
      // Error is handled by the error handling system
      workoutDebugger.logger.error('❌ IMMEDIATE SAVE ERROR: SaveStrategyManager operation failed', {
        operation: 'immediateSaveLog',
        error: error.message,
        errorType: error.type || 'unknown',
        errorCode: error.code,
        userId: userData.id,
        programId: programData.id,
        programName: programData.name,
        weekIndex,
        dayIndex,
        exerciseCount: exerciseData.length,
        timestamp: new Date().toISOString(),
        saveType: 'immediate',
        recoverable: error.recoverable,
        retryable: error.retryable
      });

      // Add error to error handling system with context for recovery
      addError(error, {
        operation: () => immediateSaveLog(userData, programData, weekIndex, dayIndex, exerciseData),
        operationType: 'manual',
        source: 'save_strategy_manager_immediate',
        userData,
        programData,
        weekIndex,
        dayIndex,
        exerciseData,
        cacheManager: { cleanup: cleanupInvalidCacheEntry },
        cacheKey: `${weekIndex}_${dayIndex}`
      });

      throw error;
    } finally {
      // Release the save lock
      saveLockRef.current = null;
      console.log('🔓 IMMEDIATE SAVE LOCK RELEASED:', { timestamp: new Date().toISOString() });
    }
  }, [debouncedSaveLog, executeSave, addError, updateCachedWorkoutLog, cleanupInvalidCacheEntry, workoutDebugger, isWorkoutFinished]);

  // Initialize debugging and monitoring systems
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Initialize Supabase debugging
      initializeSupabaseDebugging();

      // Initialize connection monitoring
      initializeConnectionMonitoring(supabase, {
        healthCheckInterval: 30000,
        enableRealtimeMonitoring: true
      });

      // Log component initialization
      workoutDebugger.logUserAction('LogWorkout component initialized', {
        userId: user?.id,
        timestamp: new Date().toISOString()
      });

      // Component initialization complete
      workoutDebugger.logger.debug('🚀 LogWorkout component fully initialized');
    }
  }, [user]);

  // Add beforeunload event listener to save any pending changes
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      // Check if there are any pending changes that need to be saved
      if (user && selectedProgram && logData.length > 0) {
        // Try to flush any pending debounced saves immediately
        debouncedSaveLog.flush();

        // For critical changes, we could also trigger an immediate save
        // but this might be too aggressive and cause performance issues
        immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, logData);
      }
    };

    // Add the event listener
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup function to remove the event listener
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [user, selectedProgram, logData, selectedWeek, selectedDay, debouncedSaveLog]);

  // Cleanup effect to flush any pending saves when component unmounts
  useEffect(() => {
    return () => {
      // Flush any pending debounced saves when component unmounts
      if (debouncedSaveLog && typeof debouncedSaveLog.flush === 'function') {
        debouncedSaveLog.flush();
      }

      // Log SaveStrategyManager performance metrics on cleanup
      if (saveStrategyManager.current) {
        const metrics = saveStrategyManager.current.getPerformanceMetrics();
        workoutDebugger.logger.info('📊 SAVE STRATEGY PERFORMANCE METRICS:', {
          operation: 'component_cleanup',
          metrics: {
            totalOperations: metrics.totalOperations,
            successRate: metrics.successRate,
            optimizationRate: metrics.optimizationRate,
            operationCounts: metrics.operationCounts,
            averageResponseTimes: metrics.averageResponseTimes,
            databaseWriteReduction: metrics.databaseWriteReduction,
            errorRates: Object.keys(metrics.errorRates).reduce((acc, key) => {
              acc[key] = metrics.errorRates[key].errorRate;
              return acc;
            }, {})
          },
          timestamp: new Date().toISOString()
        });
      }
    };
  }, [debouncedSaveLog, workoutDebugger]);

  // Add visibility change handler to save when page becomes hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && user && selectedProgram && logData.length > 0) {
        // Flush any pending debounced saves when page becomes hidden
        debouncedSaveLog.flush();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, selectedProgram, logData, debouncedSaveLog]);

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        try {
          // Cache warming for LogWorkout page
          // const cacheWarmingService = (await import('../services/supabaseCacheWarmingService')).default;
          // const warmingPromise = cacheWarmingService.smartWarmCache(user.id, {
          //   lastVisitedPage: 'LogWorkout',
          //   timeOfDay: new Date().getHours(),
          //   priority: 'high' // High priority since this is a core workout page
          // }).catch(error => {
          //   console.warn('Cache warming failed:', error);
          //   return null;
          // });

          // Parallel data fetching for better performance
          const [programsData, allExercises] = await Promise.all([
            // Fetch programs with caching
            workoutDebugger.trackOperation(
              WORKOUT_OPERATIONS.LOAD_PROGRAMS,
              () => getUserPrograms(user.id, { is_active: true }),
              { userId: user.id }
            ),
            // Fetch exercises with caching
            workoutDebugger.trackOperation(
              WORKOUT_OPERATIONS.LOAD_EXERCISES,
              () => executeSupabaseOperation(
                () => getAvailableExercises(user.id),
                'fetching exercises'
              ),
              { userId: user.id }
            )
          ]);



          // Process programs data
          const parsedPrograms = programsData.map((data) => {
            // Ensure backward compatibility and transform to expected format
            return ensureBackwardCompatibility(data, 'program');
          });

          setPrograms(parsedPrograms);

          // Process exercises data
          const transformedExercises = transformSupabaseExercises(allExercises);
          setExercisesList(transformedExercises);

          workoutDebugger.logger.info('✅ Initial data loaded successfully (parallel)', {
            programCount: parsedPrograms.length,
            exerciseCount: transformedExercises.length
          });

          // Optimized program selection with early return
          const currentProgram = parsedPrograms.find(program => program.is_current === true);
          const programToSelect = currentProgram || (parsedPrograms.length > 0 ? parsedPrograms[0] : null);

          if (programToSelect) {
            setSelectedProgram(programToSelect);

            // Optimize uncompleted day finding with early exit
            try {
              const uncompletedDay = await findEarliestUncompletedDay(programToSelect);
              if (uncompletedDay) {
                setSelectedWeek(uncompletedDay.week);
                setSelectedDay(uncompletedDay.day);
              } else {
                // If no uncompleted days, default to Week 0, Day 0
                setSelectedWeek(0);
                setSelectedDay(0);
              }
            } catch (dayError) {
              // Fallback to default if uncompleted day search fails
              console.warn('Could not find uncompleted day, using defaults:', dayError);
              setSelectedWeek(0);
              setSelectedDay(0);
            }
          }
        } catch (error) {
          handleError(error, 'fetching initial data', 'Error loading data. Please refresh the page.');
          // Set fallback empty states
          setPrograms([]);
          setExercisesList([]);
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchData();
  }, [user]);

  // Optimized workout logs fetching with caching and memoization
  useEffect(() => {
    const fetchProgramLogs = async () => {
      if (!user || !selectedProgram) return;

      // Skip loading if we already have logs for this program (cache hit)
      const hasExistingLogs = Object.keys(programLogs).length > 0;
      if (hasExistingLogs) {
        workoutDebugger.logger.debug('📊 Using cached program logs', {
          programId: selectedProgram.id,
          cachedKeys: Object.keys(programLogs)
        });
        return;
      }

      setIsLoading(true);

      try {
        // Use workoutLogService with optimized caching
        const logsData = await workoutDebugger.trackOperation(
          WORKOUT_OPERATIONS.LOAD_WORKOUT_LOGS,
          () => executeSupabaseOperation(
            () => workoutLogService.getProgramWorkoutLogs(user.id, selectedProgram.id),
            'fetching program logs'
          ),
          {
            userId: user.id,
            programId: selectedProgram.id,
            programName: selectedProgram.name
          }
        );

        // Memoized transformation to avoid repeated processing
        const logsMap = transformSupabaseWorkoutLogs(logsData);

        // Merge with existing programLogs to preserve any cached data
        setProgramLogs(prev => {
          const merged = { ...prev };

          // For each log from database, merge with existing cached data
          Object.keys(logsMap).forEach(key => {
            const dbLog = logsMap[key];
            const existingLog = prev[key];

            // If we have existing cached data, preserve workoutLogId and other cached fields
            if (existingLog) {
              merged[key] = {
                ...dbLog,
                // Preserve cached workoutLogId if it exists and is valid, otherwise use DB value
                workoutLogId: existingLog.workoutLogId || dbLog.workoutLogId,
                // Use the more recent lastSaved timestamp
                lastSaved: existingLog.lastSaved && new Date(existingLog.lastSaved) > new Date(dbLog.lastSaved)
                  ? existingLog.lastSaved
                  : dbLog.lastSaved
              };

              workoutDebugger.logger.debug('🔄 Merged cached data with database data', {
                key,
                hadCachedWorkoutLogId: !!existingLog.workoutLogId,
                dbWorkoutLogId: dbLog.workoutLogId,
                finalWorkoutLogId: merged[key].workoutLogId,
                timestamp: new Date().toISOString()
              });
            } else {
              // No existing cached data, use database data as-is
              merged[key] = dbLog;
            }
          });

          return merged;
        });

        workoutDebugger.logger.info('📊 Program logs loaded (optimized)', {
          programId: selectedProgram.id,
          logCount: logsData.length,
          transformedKeys: Object.keys(logsMap)
        });
      } catch (error) {
        handleError(error, 'fetching program logs', 'Error loading workout history. Please refresh the page.');
        // Set empty state on error to prevent infinite loading
        setProgramLogs({});
      } finally {
        setIsLoading(false);
      }
    };
    fetchProgramLogs();
  }, [user, selectedProgram?.id]); // Only depend on program ID, not the entire object

  // Optimized workout data initialization with memoization and early returns
  useEffect(() => {
    if (!user || !selectedProgram || selectedWeek === null || selectedDay === null) return;

    // Early validation with optimized error handling
    const isValidSelection = selectedWeek < selectedProgram.duration && selectedDay < selectedProgram.daysPerWeek;
    if (!isValidSelection) {
      const errorMessage = `Invalid week/day selection: Week ${selectedWeek + 1}, Day ${selectedDay + 1} for program with ${selectedProgram.duration} weeks and ${selectedProgram.daysPerWeek} days per week`;
      console.error(errorMessage);
      showUserMessage('Invalid workout selection. Please choose a valid week and day.', 'error');
      return;
    }

    // Optimized program structure validation
    const hasValidStructure = selectedProgram.weeklyConfigs?.[selectedWeek]?.[selectedDay]?.exercises;
    if (!hasValidStructure) {
      const errorMessage = `Program structure missing for Week ${selectedWeek + 1}, Day ${selectedDay + 1}`;
      console.error(errorMessage);
      showUserMessage('Program structure is incomplete. Please contact support.', 'error');
      setLogData([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const key = `${selectedWeek}_${selectedDay}`;

    // Check for existing log data (cache hit)
    if (programLogs[key]) {
      // Optimized existing log processing with memoization
      const processedExercises = programLogs[key].exercises.map(ex => {
        const exercise = exercisesList.find(e => e.id === ex.exerciseId);
        if (exercise?.exerciseType === 'Bodyweight' && ex.bodyweight) {
          return { ...ex, weights: Array(ex.sets).fill(ex.bodyweight) };
        }
        return ex;
      });

      setLogData(processedExercises);
      setIsWorkoutFinished(programLogs[key].isWorkoutFinished);

      // Preserve cached workout log ID when switching between weeks/days
      const cachedWorkoutLogId = programLogs[key].workoutLogId;
      if (cachedWorkoutLogId) {
        workoutDebugger.logger.debug('💾 Preserving cached workout log ID during data initialization', {
          key,
          cachedWorkoutLogId,
          programId: selectedProgram.id,
          weekIndex: selectedWeek,
          dayIndex: selectedDay,
          timestamp: new Date().toISOString(),
          preservationSource: 'existing_workout_data_load'
        });

        console.log('💾 Preserving cached workout log ID:', {
          key,
          cachedWorkoutLogId,
          timestamp: new Date().toISOString()
        });
      }

      workoutDebugger.logger.debug('📋 Loaded existing workout data', {
        key,
        exerciseCount: processedExercises.length,
        isFinished: programLogs[key].isWorkoutFinished,
        hasCachedWorkoutLogId: !!cachedWorkoutLogId
      });
    } else {
      // Initialize from program configuration with optimized processing
      setIsWorkoutFinished(false);

      try {
        // Memoized exercise initialization
        const dayExercises = selectedProgram.weeklyConfigs[selectedWeek][selectedDay].exercises.map(ex => {
          const exercise = exercisesList.find(e => e.id === ex.exerciseId);
          const isBodyweightType = ['Bodyweight', 'Bodyweight Loadable'].includes(exercise?.exerciseType);

          // Optimized rep range detection
          const repValue = ex.reps;
          const isRange = isRepRange(repValue);

          return {
            ...ex,
            reps: Array(ex.sets).fill(isRange ? '' : repValue),
            repRange: isRange ? repValue : null,
            weights: Array(ex.sets).fill(''),
            completed: Array(ex.sets).fill(false),
            notes: ex.notes || '',
            bodyweight: isBodyweightType ? '' : ''
          };
        });

        setLogData(dayExercises);

        // Cache the initialized data for future use, preserving any existing cached data
        setProgramLogs(prev => ({
          ...prev,
          [key]: {
            exercises: dayExercises,
            isWorkoutFinished: false,
            // Preserve existing workoutLogId if it exists, otherwise set to null
            workoutLogId: prev[key]?.workoutLogId || null,
            lastSaved: new Date().toISOString()
          }
        }));

        workoutDebugger.logger.debug('📋 Initialized workout data (cached)', {
          key,
          exerciseCount: dayExercises.length
        });
      } catch (error) {
        handleError(error, `initializing workout data for Week ${selectedWeek + 1}, Day ${selectedDay + 1}`, 'Error loading workout data. Please try again.');
        setLogData([]);
      }
    }
    setIsLoading(false);
  }, [user, selectedProgram?.id, selectedWeek, selectedDay, programLogs, exercisesList.length]); // Optimized dependencies



  const openHistoryModal = (exercise) => {
    setSelectedExerciseHistory(exercise);
    setShowHistoryModal(true);
  };

  const openNotesModal = (exerciseIndex) => {
    setCurrentExerciseIndex(exerciseIndex);
    setExerciseNotes(logData[exerciseIndex].notes || '');
    setShowNotesModal(true);
  };

  const openBodyweightModal = (exerciseIndex) => {
    setBodyweightExerciseIndex(exerciseIndex);
    setBodyweightInput(logData[exerciseIndex].bodyweight || '');
    setShowBodyweightModal(true);
  };

  const saveBodyweight = () => {
    if (bodyweightExerciseIndex === null) return;
    const newLogData = [...logData];
    newLogData[bodyweightExerciseIndex].bodyweight = bodyweightInput;
    const exercise = exercisesList.find(e => e.id === newLogData[bodyweightExerciseIndex].exerciseId);
    if (exercise?.exerciseType === 'Bodyweight') {
      newLogData[bodyweightExerciseIndex].weights = Array(newLogData[bodyweightExerciseIndex].sets).fill(bodyweightInput);
    }
    setLogData(newLogData);
    // Use immediate save for bodyweight (user explicitly saved)
    immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
    setShowBodyweightModal(false);
  };

  const saveNote = () => {
    if (currentExerciseIndex === null) return;

    const newLogData = [...logData];
    newLogData[currentExerciseIndex].notes = exerciseNotes;
    setLogData(newLogData);

    // Trigger immediate save for notes (user explicitly saved)
    if (user && selectedProgram) {
      immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
    }

    setShowNotesModal(false);
  };

  const openReplaceExerciseModal = (exercise) => {
    setExerciseToReplace(exercise);
    setIsLoadingAlternatives(true);
    setShowReplaceModal(true);
    setAlternativeExercises(exercisesList);
    setIsLoadingAlternatives(false);
  };

  const replaceExercise = async (alternativeExercise) => {
    if (!exerciseToReplace || !selectedProgram) return;

    workoutDebugger.logUserAction('Replace exercise initiated', {
      fromExercise: exerciseToReplace.exerciseId,
      toExercise: alternativeExercise.id,
      programId: selectedProgram.id,
      weekIndex: selectedWeek,
      dayIndex: selectedDay
    });

    try {
      await workoutDebugger.trackOperation(
        WORKOUT_OPERATIONS.REPLACE_EXERCISE,
        async () => {
          await executeSupabaseOperation(async () => {
            // Update local state first
            const newLogData = logData.map(ex =>
              ex.exerciseId === exerciseToReplace.exerciseId
                ? {
                  ...ex,
                  exerciseId: alternativeExercise.id,
                  // Reset bodyweight if exercise types are different
                  bodyweight: ['Bodyweight', 'Bodyweight Loadable'].includes(alternativeExercise.exerciseType)
                    ? (ex.bodyweight || '')
                    : '',
                  // Reset weights if switching to/from bodyweight exercises
                  weights: alternativeExercise.exerciseType === 'Bodyweight'
                    ? Array(ex.sets).fill(ex.bodyweight || '')
                    : ex.weights
                }
                : ex
            );
            setLogData(newLogData);

            // Use programService to update the exercise in the program
            await updateProgramExercise(
              selectedProgram.id,
              selectedWeek + 1, // Convert to 1-based indexing
              selectedDay + 1,  // Convert to 1-based indexing
              exerciseToReplace.exerciseId,
              alternativeExercise.id
            );

            // Update the local program state to reflect the changes
            const updatedProgram = { ...selectedProgram };

            // Update the weeklyConfigs structure to reflect the change
            if (updatedProgram.weeklyConfigs &&
              updatedProgram.weeklyConfigs[selectedWeek] &&
              updatedProgram.weeklyConfigs[selectedWeek][selectedDay]) {

              updatedProgram.weeklyConfigs[selectedWeek][selectedDay].exercises =
                updatedProgram.weeklyConfigs[selectedWeek][selectedDay].exercises.map(ex =>
                  ex.exerciseId === exerciseToReplace.exerciseId
                    ? { ...ex, exerciseId: alternativeExercise.id }
                    : ex
                );
            }

            // Update selectedProgram state
            setSelectedProgram(updatedProgram);

            // Update programLogs to reflect the change
            const key = `${selectedWeek}_${selectedDay}`;
            setProgramLogs(prev => ({
              ...prev,
              [key]: {
                exercises: newLogData,
                isWorkoutFinished: prev[key]?.isWorkoutFinished || false,
                workoutLogId: prev[key]?.workoutLogId || null,
                lastSaved: new Date().toISOString()
              }
            }));

            // Trigger immediate save for exercise replacement (structural change)
            immediateSaveLog(user, updatedProgram, selectedWeek, selectedDay, newLogData);

            setShowReplaceModal(false);
            setExerciseToReplace(null);
            setAlternativeExercises([]);

            showUserMessage('Exercise replaced successfully', 'success');
          }, 'replacing exercise');

        })
    } catch (error) {
      handleError(error, 'replacing exercise', 'Failed to update program with replaced exercise.');
    }
  };


  const findEarliestUncompletedDay = async (program) => {
    if (!user || !program) return null;

    try {
      // Use workoutLogService to get program workout logs with enhanced error handling
      const logsData = await executeSupabaseOperation(
        () => workoutLogService.getProgramWorkoutLogs(user.id, program.id),
        'finding uncompleted day'
      );

      const completedDays = new Set();

      logsData.forEach(log => {
        if (log.is_finished) {
          completedDays.add(`${log.week_index}_${log.day_index}`);
        }
      });

      for (let week = 0; week < program.duration; week++) {
        for (let day = 0; day < program.daysPerWeek; day++) {
          const dayKey = `${week}_${day}`;
          if (!completedDays.has(dayKey)) {
            return { week, day }; // Day is uncompleted if not marked as finished
          }
        }
      }

      return null; // No uncompleted days found
    } catch (error) {
      handleError(error, 'finding uncompleted day', 'Error checking workout progress.');
      return null;
    }
  };

  const selectProgram = (program) => {
    setSelectedProgram(program);
    setSelectedWeek(0);
    setSelectedDay(0);
    // The useEffect will handle loading or initializing logData
  };

  const handleWeekChange = (weekIndex) => {
    if (selectedProgram && weekIndex >= 0 && weekIndex < selectedProgram.duration) {
      setSelectedWeek(weekIndex);
      // The useEffect will handle loading or initializing logData
    } else {
      const errorMessage = `Invalid week index: ${weekIndex + 1}. Program has ${selectedProgram?.duration || 0} weeks.`;
      console.error(errorMessage);
      showUserMessage('Invalid week selection. Please choose a valid week.', 'error');
    }
  };

  const handleDayChange = (dayIndex) => {
    if (selectedProgram && dayIndex >= 0 && dayIndex < selectedProgram.daysPerWeek) {
      setSelectedDay(dayIndex);
      // The useEffect will handle loading or initializing logData
    } else {
      const errorMessage = `Invalid day index: ${dayIndex + 1}. Program has ${selectedProgram?.daysPerWeek || 0} days per week.`;
      console.error(errorMessage);
      showUserMessage('Invalid day selection. Please choose a valid day.', 'error');
    }
  };

  const handleFocus = (e) => {
    e.currentTarget.select();
  };

  const handleChange = useCallback(async (exerciseIndex, setIndex, value, field) => {
    if (isWorkoutFinished) return; // Don't allow changes if workout is finished

    const newLogData = [...logData];
    const exercise = exercisesList.find(e => e.id === newLogData[exerciseIndex].exerciseId);
    if (field === 'weights' && exercise?.exerciseType === 'Bodyweight') return;

    let broadcastUpdate = false;
    let isExerciseOnlyChange = false;

    if (field === 'reps') {
      newLogData[exerciseIndex].reps[setIndex] = value;
      isExerciseOnlyChange = true;
    } else if (field === 'weights') {
      newLogData[exerciseIndex].weights[setIndex] = value;
      isExerciseOnlyChange = true;
    } else if (field === 'completed') {
      const wasCompleted = newLogData[exerciseIndex].completed[setIndex];
      newLogData[exerciseIndex].completed[setIndex] = !wasCompleted;
      broadcastUpdate = true;
      isExerciseOnlyChange = true;

      // Broadcast set completion in real-time
      progressBroadcast.broadcastSetCompletion(
        exerciseIndex,
        setIndex,
        !wasCompleted,
        {
          exerciseId: newLogData[exerciseIndex].exerciseId,
          exerciseName: exercise?.name,
          reps: newLogData[exerciseIndex].reps[setIndex],
          weight: newLogData[exerciseIndex].weights[setIndex]
        }
      );
    } else if (field === 'notes') {
      // Exercise notes are metadata changes - use immediate save
      newLogData[exerciseIndex].notes = value;
      isExerciseOnlyChange = false;
    } else if (field === 'bodyweight') {
      // Bodyweight changes are metadata changes - use immediate save
      newLogData[exerciseIndex].bodyweight = value;
      isExerciseOnlyChange = false;
    }

    // Update local state
    setLogData(newLogData);

    // Mark as having unsaved changes
    markUnsaved();

    // Update cache using the enhanced CacheManager with real-time conflict detection
    try {
      // Mark exercise as locally modified for conflict resolution
      const exerciseWithTimestamp = {
        ...newLogData[exerciseIndex],
        lastModified: new Date().toISOString(),
        metadata: {
          ...newLogData[exerciseIndex].metadata,
          localChange: true,
          changeSource: 'user_input',
          field,
          setIndex,
          isExerciseOnlyChange
        }
      };

      const updatedExercises = [...newLogData];
      updatedExercises[exerciseIndex] = exerciseWithTimestamp;

      await updateCachedWorkoutLog(selectedWeek, selectedDay, {
        exercises: updatedExercises,
        isWorkoutFinished: isWorkoutFinished,
        userId: user?.id,
        programId: selectedProgram?.id,
        lastUserInput: new Date().toISOString()
      }, {
        source: 'handle_change',
        field,
        exerciseIndex,
        setIndex,
        preserveUserInput: true,
        isExerciseOnlyChange
      });

      workoutDebugger.logger.debug('📝 CACHE UPDATED: Exercise data changed with optimized save strategy', {
        operation: 'handleChange',
        field,
        exerciseIndex,
        setIndex,
        value,
        isExerciseOnlyChange,
        weekIndex: selectedWeek,
        dayIndex: selectedDay,
        timestamp: new Date().toISOString(),
        hasLocalModification: true
      });

    } catch (cacheError) {
      workoutDebugger.logger.warn('⚠️ CACHE UPDATE FAILED: Falling back to direct state update', {
        operation: 'handleChange',
        error: cacheError.message,
        field,
        exerciseIndex,
        setIndex,
        weekIndex: selectedWeek,
        dayIndex: selectedDay,
        timestamp: new Date().toISOString()
      });

      // Fallback to direct state update if cache fails
      const key = `${selectedWeek}_${selectedDay}`;
      setProgramLogs(prev => ({
        ...prev,
        [key]: {
          exercises: newLogData,
          isWorkoutFinished: prev[key]?.isWorkoutFinished || false,
          workoutLogId: prev[key]?.workoutLogId || null,
          lastSaved: new Date().toISOString(),
          lastUserInput: new Date().toISOString()
        }
      }));
    }

    // Broadcast overall workout progress if a set was completed/uncompleted
    if (broadcastUpdate) {
      const totalSets = newLogData.reduce((sum, ex) => sum + ex.sets, 0);
      const completedSets = newLogData.reduce((sum, ex) =>
        sum + ex.completed.filter(Boolean).length, 0
      );

      progressBroadcast.broadcastWorkoutProgress(completedSets, totalSets, {
        programName: selectedProgram?.name,
        weekIndex: selectedWeek + 1,
        dayIndex: selectedDay + 1
      });
    }

    // Get previous data for change detection
    const key = `${selectedWeek}_${selectedDay}`;
    const previousData = programLogs[key] ? {
      metadata: {
        name: `Week ${selectedWeek + 1}, Day ${selectedDay + 1}`,
        isFinished: programLogs[key].isWorkoutFinished || false,
        isDraft: !programLogs[key].isWorkoutFinished,
        duration: null,
        notes: '',
        completedDate: programLogs[key].isWorkoutFinished ? programLogs[key].lastSaved : null,
        weightUnit: 'LB'
      },
      exercises: programLogs[key].exercises || [],
      system: {
        userId: user?.id,
        programId: selectedProgram?.id,
        weekIndex: selectedWeek,
        dayIndex: selectedDay
      }
    } : null;

    // Use optimized save strategy based on change type
    if (isExerciseOnlyChange) {
      // For exercise-only changes (reps, weights, completed), use debounced save
      debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData, previousData);
    } else {
      // For metadata changes (notes, bodyweight), use immediate save
      immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
    }
  }, [
    isWorkoutFinished,
    logData,
    exercisesList,
    selectedWeek,
    selectedDay,
    user,
    selectedProgram,
    updateCachedWorkoutLog,
    progressBroadcast,
    debouncedSaveLog,
    immediateSaveLog,
    workoutDebugger
  ]);

  // Helper function to check if a set can be marked as complete
  const canMarkSetComplete = (exercise, setIndex) => {
    const weightValue = exercise.weights[setIndex];
    const repsValue = exercise.reps[setIndex];
    const exerciseType = exercisesList.find(e => e.id === exercise.exerciseId)?.exerciseType;

    // Check if reps value is valid (not empty, not 0, not null, not undefined)
    const hasValidReps = repsValue !== '' && repsValue !== null && repsValue !== undefined && Number(repsValue) > 0;

    // Check weight based on exercise type
    let hasValidWeight = false;

    if (exerciseType === 'Bodyweight') {
      // For bodyweight exercises, we need a valid bodyweight value
      hasValidWeight = exercise.bodyweight !== '' && exercise.bodyweight !== null && exercise.bodyweight !== undefined && Number(exercise.bodyweight) > 0;
    } else if (exerciseType === 'Bodyweight Loadable') {
      // For bodyweight loadable, we need either bodyweight OR additional weight
      const hasBodyweight = exercise.bodyweight !== '' && exercise.bodyweight !== null && exercise.bodyweight !== undefined && Number(exercise.bodyweight) > 0;
      const hasAdditionalWeight = weightValue !== '' && weightValue !== null && weightValue !== undefined && Number(weightValue) >= 0;
      hasValidWeight = hasBodyweight || hasAdditionalWeight;
    } else {
      // For regular exercises, we need a valid weight value
      hasValidWeight = weightValue !== '' && weightValue !== null && weightValue !== undefined && Number(weightValue) > 0;
    }

    return hasValidReps && hasValidWeight;
  };

  const handleAddSet = (exerciseIndex) => {
    if (isWorkoutFinished) return; // Don't allow adding sets if workout is finished

    const newLogData = [...logData];
    newLogData[exerciseIndex].sets += 1;
    // For rep ranges, push empty string; for numeric values, push the first rep value
    const firstRepValue = newLogData[exerciseIndex].repRange ? '' : newLogData[exerciseIndex].reps[0];
    newLogData[exerciseIndex].reps.push(firstRepValue);
    const exercise = exercisesList.find(e => e.id === newLogData[exerciseIndex].exerciseId);
    newLogData[exerciseIndex].weights.push(exercise?.exerciseType === 'Bodyweight' ? newLogData[exerciseIndex].bodyweight : '');
    newLogData[exerciseIndex].completed.push(false);
    setLogData(newLogData);

    // Broadcast workout structure change
    if (realtimeHook?.broadcastProgress) {
      realtimeHook.broadcastProgress({
        type: 'set_added',
        exerciseIndex,
        exerciseId: newLogData[exerciseIndex].exerciseId,
        exerciseName: exercise?.name,
        newSetCount: newLogData[exerciseIndex].sets
      });
    }

    // Use immediate save for structural changes
    immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
  };

  const handleRemoveSet = (exerciseIndex) => {
    if (isWorkoutFinished) return; // Don't allow removing sets if workout is finished
    const newLogData = [...logData];
    if (newLogData[exerciseIndex].sets > 1) {
      newLogData[exerciseIndex].sets -= 1;
      newLogData[exerciseIndex].reps.pop();
      newLogData[exerciseIndex].weights.pop();
      newLogData[exerciseIndex].completed.pop();
      setLogData(newLogData);

      // Broadcast workout structure change
      const exercise = exercisesList.find(e => e.id === newLogData[exerciseIndex].exerciseId);
      if (realtimeHook?.broadcastProgress) {
        realtimeHook.broadcastProgress({
          type: 'set_removed',
          exerciseIndex,
          exerciseId: newLogData[exerciseIndex].exerciseId,
          exerciseName: exercise?.name,
          newSetCount: newLogData[exerciseIndex].sets
        });
      }

      // Use immediate save for structural changes
      immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
    }
  };

  const saveLog = async () => {
    if (isWorkoutFinished || !user || !selectedProgram) return;
    setIsLoading(true);
    try {
      await executeSupabaseOperation(async () => {
        // Step 1: Check cached workout log ID first with validation
        let cachedWorkoutLogId = await getCachedWorkoutLogId(selectedWeek, selectedDay, false);

        let existingLog = null;

        if (cachedWorkoutLogId) {
          // Validate cached ID exists in database before using it
          const isValidInDatabase = await validateCachedWorkoutLogId(cachedWorkoutLogId, selectedWeek, selectedDay);

          if (!isValidInDatabase) {
            // Clean up invalid cache entry and fall back to database query
            cleanupInvalidCacheEntry(selectedWeek, selectedDay, 'database_validation_failed');
            cachedWorkoutLogId = null;
          }
        }

        if (cachedWorkoutLogId) {
          // Use cached ID directly for update
          console.log('🔍 Using cached workout log ID (saveLog):', {
            key: `${selectedWeek}_${selectedDay}`,
            cachedId: cachedWorkoutLogId,
            timestamp: new Date().toISOString()
          });
          existingLog = { id: cachedWorkoutLogId };
        } else {
          // Step 2: Query database if no cached ID
          console.log('🔍 No cached ID, querying database (saveLog):', {
            key: `${selectedWeek}_${selectedDay}`,
            userId: user.id,
            programId: selectedProgram.id,
            weekIndex: selectedWeek,
            dayIndex: selectedDay,
            timestamp: new Date().toISOString()
          });

          try {
            existingLog = await workoutLogService.getWorkoutLog(
              user.id,
              selectedProgram.id,
              selectedWeek,
              selectedDay
            );

            // Cache the ID for future operations if found
            if (existingLog && existingLog.id) {
              const key = `${selectedWeek}_${selectedDay}`;
              console.log('💾 Caching workout log ID from database query (saveLog):', {
                key,
                logId: existingLog.id,
                timestamp: new Date().toISOString()
              });

              setProgramLogs(prev => ({
                ...prev,
                [key]: {
                  ...prev[key],
                  workoutLogId: existingLog.id,
                  lastSaved: new Date().toISOString()
                }
              }));
            } else {
              // Handle cases where database query returns null
              console.log('📝 Database query returned null - no existing workout log found (saveLog):', {
                key: `${selectedWeek}_${selectedDay}`,
                userId: user.id,
                programId: selectedProgram.id,
                weekIndex: selectedWeek,
                dayIndex: selectedDay,
                timestamp: new Date().toISOString()
              });
            }
          } catch (dbError) {
            console.error('❌ Database query failed (saveLog), treating as new workout:', {
              error: dbError.message,
              userId: user.id,
              programId: selectedProgram.id,
              weekIndex: selectedWeek,
              dayIndex: selectedDay,
              timestamp: new Date().toISOString()
            });
            existingLog = null;
          }
        }

        // Transform exercise data to Supabase format
        const transformedExercises = logData.map(ex => ({
          exerciseId: ex.exerciseId,
          sets: Number(ex.sets),
          reps: ex.reps.map(rep => rep === '' || rep === null || rep === undefined ? null : Number(rep)),
          weights: ex.weights.map(weight => weight === '' || weight === null || weight === undefined ? null : Number(weight)),
          completed: ex.completed,
          notes: ex.notes || '',
          bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null,
          // Include added exercise metadata
          isAdded: ex.isAdded || false,
          addedType: ex.addedType || null,
          originalIndex: ex.originalIndex || -1
        }));

        // Additional validation for existing log
        if (existingLog && Array.isArray(existingLog)) {
          console.warn('⚠️ getWorkoutLog returned array instead of object (saveLog), treating as new workout:', existingLog);
          existingLog = null;
        } else if (existingLog && (!existingLog.id || existingLog.id === 'undefined' || existingLog.id === undefined || existingLog.id === null || existingLog.id === '')) {
          console.warn('⚠️ Invalid existing log ID detected (saveLog), treating as new workout:', existingLog);
          existingLog = null;
        }

        if (existingLog && existingLog.id) {
          // Log create vs update decision with context
          console.log('🔄 Decision: UPDATE existing workout log (saveLog)', {
            logId: existingLog.id,
            source: cachedWorkoutLogId ? 'cache' : 'database',
            exerciseCount: transformedExercises.length,
            timestamp: new Date().toISOString()
          });

          // Update existing log
          await workoutLogService.updateWorkoutLog(existingLog.id, {
            name: existingLog.name,
            isFinished: false,
            isDraft: true,
            exercises: transformedExercises
          });
        } else {
          // Create new log
          const workoutData = {
            programId: selectedProgram.id,
            weekIndex: selectedWeek,
            dayIndex: selectedDay,
            name: `${selectedProgram.name} - Week ${selectedWeek + 1}, Day ${selectedDay + 1}`,
            type: 'program_workout',
            date: new Date().toISOString().split('T')[0],
            isFinished: false,
            isDraft: true,
            exercises: transformedExercises
          };

          // Log create vs update decision with context
          console.log('🆕 Decision: CREATE new workout log (saveLog)', {
            reason: 'No existing log found',
            exerciseCount: transformedExercises.length,
            timestamp: new Date().toISOString()
          });

          // Create new log and cache the ID for future updates
          const newLog = await workoutLogService.createWorkoutLog(user.id, workoutData);

          // Update local cache with new log ID
          if (newLog && newLog.id) {
            const key = `${selectedWeek}_${selectedDay}`;
            console.log('💾 Caching new workout log ID (saveLog):', {
              key,
              logId: newLog.id,
              timestamp: new Date().toISOString()
            });

            setProgramLogs(prev => ({
              ...prev,
              [key]: {
                ...prev[key],
                workoutLogId: newLog.id,
                lastSaved: new Date().toISOString()
              }
            }));

            console.log('✅ Successfully cached workout log ID after creation (saveLog):', {
              key,
              logId: newLog.id,
              operation: 'create',
              timestamp: new Date().toISOString()
            });
          } else {
            console.warn('⚠️ Failed to cache workout log ID - invalid response from createWorkoutLog (saveLog):', {
              newLog,
              timestamp: new Date().toISOString()
            });
          }
        }
        // showUserMessage('Workout saved successfully!', 'success');
      }, 'saving workout log');
    } catch (error) {
      handleError(error, 'saving workout log', 'Error saving workout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to check if all sets are completed
  const checkAllSetsCompleted = () => {
    for (let exerciseIndex = 0; exerciseIndex < logData.length; exerciseIndex++) {
      const exercise = logData[exerciseIndex];
      for (let setIndex = 0; setIndex < exercise.sets; setIndex++) {
        if (!exercise.completed[setIndex]) {
          return false;
        }
      }
    }
    return true;
  };

  const handleFinishWorkout = () => {
    if (isWorkoutFinished || !user || !selectedProgram) return;

    // Check if all sets are completed
    if (!checkAllSetsCompleted()) {
      setShowIncompleteWarningModal(true);
      return;
    }

    // If all sets are completed, proceed directly
    finishWorkout();
  };

  const finishWorkout = async () => {
    if (isWorkoutFinished || !user || !selectedProgram) return;
    setIsLoading(true);

    try {
      // Execute workout completion with error handling
      const result = await executeSave(async () => {
        // First, ensure workout log exists and get its ID
        const workoutLogId = await workoutLogService.ensureWorkoutLogExists(
          user.id,
          selectedProgram.id,
          selectedWeek,
          selectedDay,
          {
            workoutName: `Week ${selectedWeek + 1}, Day ${selectedDay + 1}`,
            source: 'workout_completion'
          }
        );

        // Save current exercise data first (if any changes)
        const transformedExercises = transformExercisesToSupabaseFormat(logData);
        if (transformedExercises.length > 0) {
          await workoutLogService.saveExercisesOnly(workoutLogId, transformedExercises, {
            logOperations: true,
            source: 'workout_completion_exercises'
          });
        }

        // Use metadata-only save for completion status
        const saveResult = await workoutLogService.saveMetadataOnly(
          workoutLogId,
          {
            is_finished: true,
            completed_date: new Date().toISOString(),
            is_draft: false
          },
          {
            logOperations: true,
            source: 'workout_completion_metadata'
          }
        );

        if (saveResult && saveResult.success) {
          // Update local cache and state
          await updateCachedWorkoutLog(selectedWeek, selectedDay, {
            workoutLogId: saveResult.workoutLogId,
            exercises: logData,
            isWorkoutFinished: true,
            userId: user.id,
            programId: selectedProgram.id,
          }, {
            source: 'workout_completion_result'
          });

          workoutDebugger.logger.info('✅ WORKOUT COMPLETION SUCCESS: Workout finished and saved', {
            operation: 'finishWorkout',
            logId: saveResult.workoutLogId,
            userId: user.id,
            programId: selectedProgram.id,
            programName: selectedProgram.name,
            weekIndex: selectedWeek,
            dayIndex: selectedDay,
            exerciseCount: transformedExercises.length,
            operationType: saveResult.operationType,
            affectedTables: saveResult.affectedTables,
            timestamp: new Date().toISOString()
          });
        }

        return saveResult;
      }, 'completion');

      setIsWorkoutFinished(true);

      // Broadcast workout completion in real-time
      const totalSets = logData.reduce((sum, ex) => sum + ex.sets, 0);
      const completedSets = logData.reduce((sum, ex) =>
        sum + ex.completed.filter(Boolean).length, 0
      );

      progressBroadcast.broadcastWorkoutProgress(completedSets, totalSets, {
        programName: selectedProgram?.name,
        weekIndex: selectedWeek + 1,
        dayIndex: selectedDay + 1,
        completed: true,
        duration: Date.now() - (new Date().setHours(0, 0, 0, 0)) // Rough duration calculation
      });

      // Broadcast individual exercise completions
      logData.forEach((exercise, exerciseIndex) => {
        const exerciseData = exercisesList.find(e => e.id === exercise.exerciseId);
        const completedSetsCount = exercise.completed.filter(Boolean).length;

        if (completedSetsCount > 0) {
          progressBroadcast.broadcastExerciseCompletion(
            exerciseIndex,
            completedSetsCount === exercise.sets, // Fully completed
            {
              exerciseId: exercise.exerciseId,
              exerciseName: exerciseData?.name,
              completedSets: completedSetsCount,
              totalSets: exercise.sets,
              totalVolume: exercise.weights.reduce((sum, weight, idx) => {
                if (exercise.completed[idx]) {
                  const reps = exercise.reps[idx] || 0;
                  const effectiveWeight = exerciseData?.exerciseType === 'Bodyweight'
                    ? (exercise.bodyweight || 0)
                    : (weight || 0);
                  return sum + (effectiveWeight * reps);
                }
                return sum;
              }, 0)
            }
          );
        }
      });
      if (realtimeHook?.broadcastProgress) {
        realtimeHook.broadcastProgress({
          type: 'workout_completed',
          programId: selectedProgram.id,
          programName: selectedProgram.name,
          weekIndex: selectedWeek + 1,
          dayIndex: selectedDay + 1,
          completedAt: new Date().toISOString(),
          totalExercises: logData.length,
          totalSets: logData.reduce((sum, ex) => sum + ex.sets, 0),
          completedSets: logData.reduce((sum, ex) => sum + ex.completed.filter(Boolean).length, 0)
        });
      }

      setShowSummaryModal(true);
    } catch (error) {
      // Enhanced error logging
      workoutDebugger.logger.error('❌ WORKOUT COMPLETION ERROR: Failed to finish workout', {
        operation: 'finishWorkout',
        error: error.message,
        errorType: error.type || 'unknown',
        errorCode: error.code,
        userId: user.id,
        programId: selectedProgram.id,
        programName: selectedProgram.name,
        weekIndex: selectedWeek,
        dayIndex: selectedDay,
        exerciseCount: logData.length,
        timestamp: new Date().toISOString(),
        recoverable: error.recoverable,
        retryable: error.retryable
      });

      // Add error to error handling system with context for recovery
      addError(error, {
        operation: () => finishWorkout(),
        operationType: 'completion',
        source: 'workout_completion',
        userData: user,
        programData: selectedProgram,
        weekIndex: selectedWeek,
        dayIndex: selectedDay,
        exerciseData: logData,
        cacheManager: { cleanup: cleanupInvalidCacheEntry },
        cacheKey: `${selectedWeek}_${selectedDay}`
      });

      // Handle both workout completion and processing errors
      if (error.message && error.message.includes('processing')) {
        // Non-critical error - workout is saved but processing failed
        showUserMessage('Workout saved but processing failed. Analytics may be delayed.', 'warning');
        setIsWorkoutFinished(true);
        setShowSummaryModal(true);
      } else {
        // Critical error - workout completion failed
        showUserMessage(error.userFriendly?.message || 'Error finishing workout. Please try again.', 'error');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Add Exercise functionality with enhanced error handling
  const handleAddExercise = async (exercise, type) => {

    const {
      createNewExerciseObject,
      updateProgramWithExercise
    } = await import('../utils/addExerciseUtils');

    setIsAddingExercise(true);

    let addedToWorkout = false;

    try {
      // Create new exercise object using utility
      const newExercise = createNewExerciseObject(exercise, type, logData.length);
      const newLogData = [...logData, newExercise];

      // Add to workout first (this always succeeds)
      setLogData(newLogData);
      addedToWorkout = true;

      // If permanent, also update the program structure
      if (type === 'permanent') {
        try {
          await executeSupabaseOperation(
            () => updateProgramWithExercise(
              selectedProgram.id,
              exercise,
              selectedWeek,
              selectedDay,
              { maxRetries: 3, allowDuplicates: false }
            ),
            'adding exercise to program permanently'
          );
          showUserMessage(`${exercise.name} added permanently to your program!`, 'success');
        } catch (programUpdateError) {
          const tempLogData = newLogData.map(ex =>
            ex.exerciseId === exercise.id && ex.isAdded
              ? { ...ex, addedType: 'temporary' }
              : ex
          );
          setLogData(tempLogData);
          handleError(programUpdateError, 'adding exercise to program permanently', `${exercise.name} added temporarily to this workout only.`);
        }
      } else {
        showUserMessage(`${exercise.name} added temporarily to this workout!`, 'success');
      }

      // Update programLogs
      const key = `${selectedWeek}_${selectedDay}`;
      setProgramLogs(prev => ({
        ...prev,
        [key]: {
          exercises: newLogData,
          isWorkoutFinished: prev[key]?.isWorkoutFinished || false,
          workoutLogId: prev[key]?.workoutLogId || null,
          lastSaved: new Date().toISOString()
        }
      }));

      // Trigger immediate save for adding exercises (structural change)
      immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);

      setShowAddExerciseModal(false);
    } catch (error) {
      handleError(error, 'adding exercise to workout', `${exercise.name} could not be added to this workout. Please try again.`);
    } finally {
      setIsAddingExercise(false);
    }
  };

  // Old addExerciseToProgram function removed - now using enhanced utilities from addExerciseUtils.js

  const removeAddedExercise = async (exerciseIndex) => {

    const {
      removeExerciseFromProgram: removeFromProgramUtil,
      removeExerciseFromLogData
    } = await import('../utils/addExerciseUtils');

    const exerciseToRemove = logData[exerciseIndex];

    if (isWorkoutFinished) {
      showUserMessage('Cannot remove exercises from a finished workout.', 'warning');
      // endPerformanceMonitoring(operationId, { success: false, reason: 'workout_finished' });
      return;
    }

    if (!exerciseToRemove || !exerciseToRemove.isAdded) {
      showUserMessage('Only added exercises can be removed.', 'warning');
      // endPerformanceMonitoring(operationId, { success: false, reason: 'invalid_exercise' });
      return;
    }

    // Enhanced validation
    // const validation = validateRemoveExerciseParams(exerciseToRemove, isWorkoutFinished);
    // if (!validation.isValid) {
    //   showUserMessage(validation.errors[0] || 'Cannot remove this exercise.', 'error');
    //   endPerformanceMonitoring(operationId, { success: false, reason: 'validation_failed' });
    //   return;
    // }

    try {
      // Remove from logData first
      const newLogData = removeExerciseFromLogData(logData, exerciseIndex);
      setLogData(newLogData);

      // Log state change
      // logStateChange('logData', logData, newLogData, {
      //   operationId,
      //   exerciseId: exerciseToRemove?.exerciseId,
      //   exerciseIndex,
      //   operation: 'remove'
      // });

      const exerciseName = exercisesList.find(ex => ex.id === exerciseToRemove.exerciseId)?.name || 'Exercise';

      // logAddExerciseOperation('remove_exercise', {
      //   exercise: exerciseToRemove,
      //   exerciseIndex,
      //   program: selectedProgram,
      //   weekIndex: selectedWeek,
      //   dayIndex: selectedDay,
      //   currentLogDataLength: logData.length,
      //   newLogDataLength: newLogData.length
      // }, true);

      // If it was a permanent addition, also remove from program
      if (exerciseToRemove.addedType === 'permanent') {
        try {
          await executeSupabaseOperation(
            () => removeFromProgramUtil(
              selectedProgram.id,
              exerciseToRemove.exerciseId,
              selectedWeek,
              selectedDay,
              { maxRetries: 3 }
            ),
            'removing exercise from program permanently'
          );
          showUserMessage(`${exerciseName} removed from your program permanently.`, 'success');
        } catch (programRemovalError) {
          // Handle partial failure - exercise removed from workout but not from program
          handleError(programRemovalError, 'removing exercise from program permanently', `${exerciseName} removed from current workout, but may still appear in future workouts.`);
        }
      } else {
        showUserMessage(`${exerciseName} removed from this workout.`, 'success');
      }

      // Update programLogs
      const key = `${selectedWeek}_${selectedDay}`;
      setProgramLogs(prev => ({
        ...prev,
        [key]: {
          exercises: newLogData,
          isWorkoutFinished: prev[key]?.isWorkoutFinished || false,
          workoutLogId: prev[key]?.workoutLogId || null,
          lastSaved: new Date().toISOString()
        }
      }));

      // Trigger immediate save for removing exercises (structural change)
      immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);

      // End performance monitoring with success
      // endPerformanceMonitoring(operationId, {
      //   success: true,
      //   removedFromWorkout: true,
      //   removedFromProgram: exerciseToRemove.addedType === 'permanent',
      //   finalLogDataLength: newLogData.length
      // });

    } catch (error) {
      const exerciseName = exercisesList.find(ex => ex.id === exerciseToRemove.exerciseId)?.name || 'Exercise';
      handleError(error, 'removing exercise from workout', `${exerciseName} could not be removed from this workout. Please try again.`);
    }
  };

  // Old removeExerciseFromProgram function removed - now using enhanced utilities from addExerciseUtils.js

  // Helper to get the day name from selectedProgram.weeklyConfigs
  const getDayName = (weekIdx, dayIdx) => {
    if (
      selectedProgram &&
      selectedProgram.weeklyConfigs &&
      selectedProgram.weeklyConfigs[weekIdx] &&
      selectedProgram.weeklyConfigs[weekIdx][dayIdx] &&
      selectedProgram.weeklyConfigs[weekIdx][dayIdx].name
    ) {
      return selectedProgram.weeklyConfigs[weekIdx][dayIdx].name;
    }
    return `Day ${dayIdx + 1}`;
  };

  return (
    <Container fluid className="soft-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card shadow border-0">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h1 className="soft-title mb-0">Log Workout</h1>
              {/* <WorkoutRealtimeIndicator
                realtimeHook={realtimeHook}
                showProgress={true}
                showPresence={true}
                className="ms-auto"
              /> */}
            </div>

            {/* Enhanced User Message Display */}
            {userMessage.show && (
              <div className={`alert alert-${userMessage.type === 'error' ? 'danger' : userMessage.type === 'warning' ? 'warning' : userMessage.type === 'success' ? 'success' : 'info'} alert-dismissible fade show`} role="alert">
                <strong>
                  {userMessage.type === 'error' && '⚠️ '}
                  {userMessage.type === 'warning' && '⚠️ '}
                  {userMessage.type === 'success' && '✅ '}
                  {userMessage.type === 'info' && 'ℹ️ '}
                </strong>
                {userMessage.text}
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={hideUserMessage}
                ></button>
              </div>
            )}

            {/* Enhanced Error Display */}
            {errors.length > 0 && (
              <div className="mb-3">
                <ErrorSummary
                  errors={errors}
                  onClearAll={clearAllErrors}
                  onRetryAll={hasRetryableErrors ? retryAllErrors : null}
                  maxVisible={2}
                />
              </div>
            )}

            {/* 8/23/25 Removing this for now! */}
            {/* Enhanced Save Status Indicator */}
            {/* {selectedProgram && logData.length > 0 && (
              <div className="d-flex align-items-center justify-content-between mb-3 p-2 bg-light rounded">
                <SaveStatusIndicator
                  saveStatus={saveStatus}
                  onRetry={canRetry ? retrySave : null}
                  onShowDetails={saveStatus.saveError ? () => showErrorDetails(saveStatus.saveError) : null}
                  className="flex-grow-1"
                />

                {!saveStatus.isSaving && saveStatus.hasUnsavedChanges && (
                  <Button
                    size="sm"
                    variant="outline-primary"
                    onClick={() => immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, logData)}
                  >
                    Save Now
                  </Button>
                )}
              </div>
            )} */}

            {isLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="spinner-blue" />
                <p className="soft-text mt-2">Loading...</p>
              </div>
            ) : (
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label className="soft-label">Selected Program</Form.Label>
                  <Form.Control
                    as="select"
                    value={selectedProgram?.id || ''}
                    onChange={e => selectProgram(programs.find(p => p.id === e.target.value))}
                    className="soft-input"
                  >
                    <option value="">Select a program</option>
                    {programs.map(program => (
                      <option key={program.id} value={program.id}>
                        {program.name} {program.is_current ? "(Current)" : ""}
                      </option>
                    ))}
                  </Form.Control>
                </Form.Group>

                {selectedProgram && (
                  <>
                    <div className="mb-3">
                      <h5 className="soft-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Week {selectedWeek + 1}, {getDayName(selectedWeek, selectedDay)}
                        <Button onClick={() => setShowGridModal(true)} className="soft-button">
                          Change Week/Day
                        </Button>
                      </h5>

                    </div>

                    {/* Modal containing the week and day grid */}
                    <Modal show={showGridModal} onHide={() => setShowGridModal(false)} size="lg">
                      <Modal.Header closeButton>
                        <Modal.Title className="modal-title">Select Week and Day</Modal.Title>
                      </Modal.Header>
                      <Modal.Body>
                        <div className="week-day-grid">
                          {Array.from({ length: selectedProgram.duration }).map((_, weekIndex) => (
                            <div key={weekIndex} className="week-row">
                              <h5 className="modal-title">Week {weekIndex + 1}</h5>
                              <div className="day-buttons">
                                {Array.from({ length: selectedProgram.daysPerWeek }).map((_, dayIndex) => {
                                  const key = `${weekIndex}_${dayIndex}`;
                                  const isCompleted = programLogs[key]?.isWorkoutFinished || false;
                                  return (
                                    <Button
                                      key={dayIndex}
                                      variant={
                                        selectedWeek === weekIndex && selectedDay === dayIndex
                                          ? "primary"
                                          : "outline-primary"
                                      }
                                      onClick={() => {
                                        setSelectedWeek(weekIndex);
                                        setSelectedDay(dayIndex);
                                        setShowGridModal(false);
                                      }}
                                      className={isCompleted ? "completed-day" : ""}
                                    >
                                      {getDayName(weekIndex, dayIndex)} {isCompleted && <span>✓</span>}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Modal.Body>
                    </Modal>
                    {/* <div className="d-flex flex-wrap gap-3 mb-3">
                      <Form.Group className="flex-grow-1">
                        <Form.Label className="soft-label">Selected Week</Form.Label>
                        <Form.Control
                          as="select"
                          value={selectedWeek}
                          onChange={e => handleWeekChange(Number(e.target.value))}
                          className="soft-input"
                        >
                          {Array.from({ length: selectedProgram.duration }).map((_, index) => (
                            <option key={index} value={index}>Week {index + 1}</option>
                          ))}
                        </Form.Control>
                      </Form.Group>

                      <Form.Group className="flex-grow-1">
                        <Form.Label className="soft-label">Selected Day</Form.Label>
                        <Form.Control
                          as="select"
                          value={selectedDay}
                          onChange={e => handleDayChange(Number(e.target.value))}
                          className="soft-input"
                        >
                          {Array.from({ length: selectedProgram.daysPerWeek }).map((_, index) => (
                            <option key={index} value={index}>Day {index + 1}</option>
                          ))}
                        </Form.Control>
                      </Form.Group>
                    </div> */}

                    {logData.map((ex, exIndex) => {
                      const exercise = exercisesList.find(e => e.id === ex.exerciseId);
                      const exerciseType = exercise?.exerciseType || '';
                      const bodyweightDisplay = ex.bodyweight ? `${ex.bodyweight} ${selectedProgram?.weightUnit || 'LB'}` : 'Click to Set';
                      const isAddedExercise = ex.isAdded || false;
                      return (
                        <div key={exIndex} className="mb-4">
                          <div className={`d-flex align-items-center ${isMobile ? 'justify-content-start' : 'justify-content-between'}`}>
                            {/* Replace buttons with a dropdown in mobile view */}
                            {isMobile ? (
                              <div className="d-flex align-items-center">
                                <Dropdown>
                                  <Dropdown.Toggle
                                    variant="light"
                                    id={`dropdown-${exIndex}`}
                                    className="border-0 bg-transparent three-dots-vert"
                                    style={{ padding: '0.25rem' }}
                                  >
                                    <ThreeDotsVertical size={20} className="three-dots-vert" />
                                  </Dropdown.Toggle>

                                  <Dropdown.Menu>
                                    <Dropdown.Item
                                      onClick={() => openNotesModal(exIndex)}
                                      className="d-flex align-items-center"
                                    >
                                      <Pencil />
                                      {ex.notes ? 'Edit Notes' : 'Add Notes'}
                                      {ex.notes && <span className="ms-1 badge bg-primary rounded-circle" style={{ width: '8px', height: '8px', padding: '0' }}>&nbsp;</span>}
                                    </Dropdown.Item>
                                    {!isAddedExercise && (
                                      <Dropdown.Item
                                        onClick={() => openReplaceExerciseModal(ex)}
                                        className="d-flex align-items-center"
                                      >
                                        <ArrowLeftRight />
                                        Replace Exercise
                                      </Dropdown.Item>
                                    )}
                                    <Dropdown.Item
                                      onClick={() => handleAddSet(exIndex)}
                                      className="d-flex align-items-center"
                                    >
                                      <Plus />
                                      Add Set
                                    </Dropdown.Item>
                                    <Dropdown.Item
                                      onClick={() => handleRemoveSet(exIndex)}
                                      className="d-flex align-items-center"
                                      disabled={ex.sets <= 1 || isWorkoutFinished}
                                    >
                                      <Dash />
                                      Remove Set
                                    </Dropdown.Item>
                                    {isAddedExercise && (
                                      <Dropdown.Item
                                        onClick={() => removeAddedExercise(exIndex)}
                                        className="d-flex align-items-center text-danger"
                                        disabled={isWorkoutFinished}
                                      >
                                        <X />
                                        Remove Added Exercise
                                      </Dropdown.Item>
                                    )}
                                    <Dropdown.Item
                                      onClick={() => openHistoryModal(ex)}
                                      className="d-flex align-items-center"
                                    >
                                      <BarChart className="me-2" />
                                      View History
                                    </Dropdown.Item>
                                  </Dropdown.Menu>
                                </Dropdown>
                                <h5 className="soft-label mb-0">
                                  {exercise?.name || 'Loading...'}
                                  {exerciseType && (
                                    <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                      {exerciseType}
                                      {['Bodyweight', 'Bodyweight Loadable'].includes(exerciseType) && (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary ms-2 py-0 px-1 bw-modal"
                                          style={{ fontSize: '0.75em', lineHeight: '1.2' }}
                                          onClick={() => openBodyweightModal(exIndex)}
                                          role="button"
                                          tabIndex={0}
                                        // onKeyDown={(e) => e.key === 'Enter' && openBodyweightModal(exIndex)}
                                        >
                                          {bodyweightDisplay} <Pencil size={12} style={{ marginLeft: '2px', verticalAlign: 'middle' }} />
                                        </button>
                                      )}
                                    </span>
                                  )}
                                </h5>
                              </div>
                            ) : (
                              <>
                                <h5 className="soft-label">
                                  {exercise?.name || 'Loading...'}
                                  {isAddedExercise && (
                                    <span className="ms-2 badge bg-warning text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                      {ex.addedType === 'permanent' ? 'Added (Permanent)' : 'Added (Temporary)'}
                                    </span>
                                  )}
                                  {exerciseType && (
                                    <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                      {exerciseType}
                                      {['Bodyweight', 'Bodyweight Loadable'].includes(exerciseType) && (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-primary ms-2 py-0 px-1 bw-modal"
                                          style={{ fontSize: '0.75em', lineHeight: '1.2' }}
                                          onClick={() => openBodyweightModal(exIndex)}
                                          role="button"
                                          tabIndex={0}
                                        //onKeyDown={(e) => e.key === 'Enter' && openBodyweightModal(exIndex)}
                                        >
                                          {bodyweightDisplay} <Pencil size={12} style={{ marginLeft: '2px', verticalAlign: 'middle' }} />
                                        </button>
                                      )}
                                    </span>
                                  )}
                                </h5>
                                <div>
                                  <Button
                                    variant="outline-info"
                                    size="sm"
                                    onClick={() => openNotesModal(exIndex)}
                                    className="me-2"
                                  >
                                    {ex.notes ? 'View/Edit Notes' : 'Add Notes'}
                                  </Button>
                                  {!isAddedExercise && (
                                    <Button
                                      variant="outline-secondary"
                                      size="sm"
                                      onClick={() => openReplaceExerciseModal(ex)}
                                      className="me-2"
                                    >
                                      Replace Exercise
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline-success"
                                    size="sm"
                                    onClick={() => handleAddSet(exIndex)}
                                    className="me-2"
                                  >
                                    Add Set
                                  </Button>
                                  <Button
                                    variant="outline-danger"
                                    size="sm"
                                    onClick={() => handleRemoveSet(exIndex)}
                                    className="me-2"
                                    disabled={ex.sets <= 1 || isWorkoutFinished}
                                  >
                                    Remove Set
                                  </Button>
                                  {isAddedExercise && (
                                    <Button
                                      variant="outline-danger"
                                      size="sm"
                                      onClick={() => removeAddedExercise(exIndex)}
                                      className="me-2"
                                      disabled={isWorkoutFinished}
                                    >
                                      <X className="me-1" />
                                      Remove Added
                                    </Button>
                                  )}
                                  <Button
                                    variant="outline-primary"
                                    size="sm"
                                    onClick={() => openHistoryModal(ex)}
                                  >
                                    View History
                                  </Button>
                                </div>
                              </>
                            )}
                          </div>

                          {/* Display notes preview if there is a note */}
                          {ex.notes && (
                            <div className={`note-preview ${isMobile ? 'mt-2' : ''} mb-2 p-1 bg-light border rounded`}>
                              <small className="text-muted">
                                <strong>Note:</strong> {ex.notes.length > 50 ? `${ex.notes.substring(0, 50)}...` : ex.notes}
                              </small>
                            </div>
                          )}

                          <Table responsive className="workout-log-table">
                            <thead>
                              <tr>
                                <th>Set</th>
                                <th>
                                  Reps
                                  {ex.repRange && (
                                    <div style={{
                                      fontSize: '0.75em',
                                      fontWeight: 'normal',
                                      color: '#6c757d',
                                      marginTop: '2px'
                                    }}>
                                      Target: {ex.repRange}
                                    </div>
                                  )}
                                </th>
                                <th>{exerciseType === 'Bodyweight Loadable' ? '+Weight' : 'Weight'}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {Array.from({ length: ex.sets }).map((_, setIndex) => (
                                <tr key={setIndex}>
                                  <td className="text-center">{setIndex + 1}</td>
                                  <td className="text-center">
                                    <Form.Control
                                      type="number"
                                      value={ex.reps[setIndex] || ''}
                                      onChange={e => handleChange(exIndex, setIndex, e.target.value, 'reps')}
                                      onFocus={handleFocus}
                                      className="soft-input center-input"
                                      style={{ width: '50px', display: 'inline-block', backgroundColor: ex.completed[setIndex] ? '#f8f9fa' : '' }}
                                      ref={repsInputRef} // Attach ref for double-click
                                      disabled={ex.completed[setIndex] || isWorkoutFinished} // Disable when set is complete or workout is finished
                                      min="0"
                                      max="9999"
                                      maxLength="4"
                                    />
                                  </td>
                                  <td className="text-center">
                                    {exerciseType === 'Bodyweight' ? (
                                      <Form.Control
                                        type="number"
                                        value={ex.bodyweight || ''}
                                        disabled
                                        className="soft-input center-input"
                                        style={{ width: '80px', display: 'inline-block', backgroundColor: '#f8f9fa' }}
                                        placeholder="Set Bodyweight"
                                      />
                                    ) : exerciseType === 'Bodyweight Loadable' ? (
                                      <div>
                                        <Form.Control
                                          type="number"
                                          value={ex.weights[setIndex] || ''}
                                          onChange={e => handleChange(exIndex, setIndex, e.target.value, 'weights')}
                                          onFocus={handleFocus}
                                          className="soft-input center-input"
                                          style={{ width: '80px', display: 'inline-block' }}
                                          placeholder="Additional Weight"
                                          min="0"
                                          max="9999"
                                          maxLength="4"
                                          step="0.5"
                                        />
                                        {ex.bodyweight && ex.weights[setIndex] && (
                                          <small className="ms-2">
                                            Total: {(parseFloat(ex.bodyweight) + parseFloat(ex.weights[setIndex])).toFixed(1)} {selectedProgram?.weightUnit || 'LB'}
                                          </small>
                                        )}
                                      </div>
                                    ) : (
                                      <Form.Control
                                        type="number"
                                        value={ex.weights[setIndex] || ''}
                                        onChange={e => handleChange(exIndex, setIndex, e.target.value, 'weights')}
                                        onFocus={handleFocus}
                                        className="soft-input center-input"
                                        style={{ width: '80px', display: 'inline-block', backgroundColor: ex.completed[setIndex] ? '#f8f9fa' : '' }}
                                        ref={weightInputRef} // Attach ref for double-click
                                        disabled={ex.completed[setIndex] || isWorkoutFinished} // Disable when set is complete or workout is finished
                                        min="0"
                                        max="9999"
                                        maxLength="4"
                                        step="0.5"
                                      />
                                    )}
                                  </td>
                                  <td className="text-center">
                                    <Form.Check
                                      type="checkbox"
                                      checked={ex.completed[setIndex]}
                                      onChange={() => handleChange(exIndex, setIndex, null, 'completed')}
                                      className={`completed-checkbox ${canMarkSetComplete(ex, setIndex) ? 'checkbox-enabled' : ''}`}
                                      style={{ transform: 'scale(1.5)' }} // Larger checkbox for better touch interaction
                                      disabled={!canMarkSetComplete(ex, setIndex) || isWorkoutFinished} // Disable if conditions not met or workout is finished
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      );
                    })}

                    {/* Add Exercise Button */}
                    {!isWorkoutFinished && (
                      <div className="text-center mt-4 mb-3">
                        <Button
                          onClick={() => setShowAddExerciseModal(true)}
                          className="soft-button gradient"
                          disabled={isAddingExercise}
                        >
                          <Plus className="me-2" />
                          {isAddingExercise ? 'Adding Exercise...' : 'Add Exercise'}
                        </Button>
                      </div>
                    )}

                    <div className="text-center mt-3">
                      {!isWorkoutFinished ? (
                        <Button onClick={handleFinishWorkout} className="soft-button gradient">Finish Workout</Button>
                      ) : (
                        <Button variant="secondary" disabled>Workout Completed</Button>
                      )}
                    </div>

                    {/* Modal for replacing exercises */}
                    <Modal show={showReplaceModal} onHide={() => setShowReplaceModal(false)} centered>
                      <Modal.Header closeButton>
                        <Modal.Title>Replace Exercise</Modal.Title>
                      </Modal.Header>
                      <Modal.Body>
                        <h6>Select an Alternative Exercise:</h6>
                        <ExerciseGrid
                          exercises={alternativeExercises}
                          onExerciseClick={replaceExercise}
                          emptyMessage="No exercises found."
                          userRole={userRole}
                          initialTypeFilter=''
                          // This is useful for other files maybe
                          // {(() => {
                          //   if (!exerciseToReplace) return '';
                          //   const currentExercise = exercisesList.find(e => e.id === exerciseToReplace.exerciseId);
                          //   if (!currentExercise) return '';

                          //   // Check if there are other exercises with the same type (excluding current exercise)
                          //   const sameTypeExercises = exercisesList.filter(ex =>
                          //     ex.exerciseType === currentExercise.exerciseType && ex.id !== exerciseToReplace.exerciseId
                          //   );

                          //   // Return type filter if there are matching exercises
                          //   return sameTypeExercises.length > 0 ? currentExercise.exerciseType : '';
                          // })()}
                          initialMuscleFilter={(() => {
                            if (!exerciseToReplace) return '';
                            const currentExercise = exercisesList.find(e => e.id === exerciseToReplace.exerciseId);
                            if (!currentExercise) return '';

                            if (currentExercise.primaryMuscleGroup) return currentExercise.primaryMuscleGroup;

                            return '';

                          })()}
                        />
                      </Modal.Body>
                    </Modal>

                    {/* Modal for exercise notes */}
                    <Modal show={showNotesModal} onHide={() => setShowNotesModal(false)} centered>
                      <Modal.Header closeButton>
                        <Modal.Title>
                          {currentExerciseIndex !== null && exercisesList.find(
                            e => e.id === logData[currentExerciseIndex]?.exerciseId
                          )?.name || 'Exercise'} Notes
                        </Modal.Title>
                      </Modal.Header>
                      <Modal.Body>
                        <Form.Group>
                          <Form.Label>Notes for this exercise:</Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={4}
                            value={exerciseNotes}
                            onChange={(e) => setExerciseNotes(e.target.value)}
                            placeholder="Enter form cues, reminders, or personal notes about this exercise..."
                            className="soft-input notes-input"
                          />
                        </Form.Group>
                      </Modal.Body>
                      <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowNotesModal(false)}>
                          Cancel
                        </Button>
                        <Button variant="primary" onClick={saveNote}>
                          Save Notes
                        </Button>
                      </Modal.Footer>
                    </Modal>

                    <Modal show={showBodyweightModal} onHide={() => setShowBodyweightModal(false)} centered>
                      <Modal.Header closeButton>
                        <Modal.Title>
                          Set Bodyweight for {exercisesList.find(e => e.id === logData[bodyweightExerciseIndex]?.exerciseId)?.name || 'Exercise'}
                        </Modal.Title>
                      </Modal.Header>
                      <Modal.Body>
                        <Form.Group>
                          <Form.Label>Bodyweight ({selectedProgram?.weightUnit || 'LB'})</Form.Label>
                          <Form.Control
                            type="number"
                            value={bodyweightInput}
                            onChange={(e) => setBodyweightInput(e.target.value)}
                            placeholder="Enter your bodyweight"
                            className="soft-input"
                            min="0"
                            max="9999"
                            maxLength="4"
                            step="0.5"
                          />
                        </Form.Group>
                      </Modal.Body>
                      <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowBodyweightModal(false)}>
                          Cancel
                        </Button>
                        <Button variant="primary" onClick={saveBodyweight}>
                          Save
                        </Button>
                      </Modal.Footer>
                    </Modal>

                    {/* Exercise History Modal */}
                    <ExerciseHistoryModal
                      show={showHistoryModal}
                      onHide={() => setShowHistoryModal(false)}
                      exercise={selectedExerciseHistory}
                      exercisesList={exercisesList}
                      weightUnit={selectedProgram?.weightUnit || 'LB'}
                    />

                  </>
                )}
              </Form>
            )}
          </div>
        </Col>
      </Row>

      {/* Add Exercise Modal */}
      <Modal show={showAddExerciseModal} onHide={() => setShowAddExerciseModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Add Exercise to Workout</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {/* Exercise Type Selection */}
          <Form.Group className="mb-4">
            <Form.Label className="fw-bold">How would you like to add this exercise?</Form.Label>
            <div className="mt-2">
              <Form.Check
                type="radio"
                id="temporary"
                name="exerciseType"
                label={
                  <div>
                    <strong>Temporary</strong> - Only for this workout session
                    <div className="text-muted small">Exercise will be logged but not added to your program</div>
                  </div>
                }
                checked={addExerciseType === 'temporary'}
                onChange={() => setAddExerciseType('temporary')}
                className="mb-2"
              />
              <Form.Check
                type="radio"
                id="permanent"
                name="exerciseType"
                label={
                  <div>
                    <strong>Permanent</strong> - Add to program for future workouts
                    <div className="text-muted small">Exercise will be added to this day in your program</div>
                  </div>
                }
                checked={addExerciseType === 'permanent'}
                onChange={() => setAddExerciseType('permanent')}
              />
            </div>
          </Form.Group>

          {/* Exercise Selection Grid */}
          <div>
            <Form.Label className="fw-bold mb-3">Select an Exercise</Form.Label>
            <ExerciseGrid
              exercises={exercisesList}
              onExerciseClick={(exercise) => handleAddExercise(exercise, addExerciseType)}
              emptyMessage="No exercises found."
              userRole={userRole}
            />
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddExerciseModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Incomplete Sets Warning Modal */}
      <Modal show={showIncompleteWarningModal} onHide={() => setShowIncompleteWarningModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>⚠️ Incomplete Sets Detected</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Some sets in your workout are not marked as complete. Are you sure you want to finish the workout?
          </p>
          <div className="bg-light p-3 rounded">
            <small className="text-muted">
              <strong>Note:</strong> Incomplete sets will be saved as skipped and won't count toward your progress tracking.
            </small>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowIncompleteWarningModal(false)}
          >
            Continue Workout
          </Button>
          <Button
            variant="warning"
            onClick={() => {
              setShowIncompleteWarningModal(false);
              finishWorkout();
            }}
          >
            Finish Anyway
          </Button>
        </Modal.Footer>
      </Modal>

      <WorkoutSummaryModal
        show={showSummaryModal}
        onHide={() => {
          setShowSummaryModal(false);
          navigate('/');
        }}
        workoutData={logData.map(ex => ({ ...ex, name: exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Unknown' }))}
        exercisesList={exercisesList}
        weightUnit={selectedProgram?.weightUnit || 'LB'}
      />

      {/* Error Recovery Modal */}
      <ErrorRecoveryModal
        show={showErrorModal}
        onHide={hideErrorModal}
        error={selectedError}
        onRetry={selectedError ? () => retrySave() : null}
        onSkip={() => {
          if (selectedError) {
            removeError(selectedError.errorId);
          }
          hideErrorModal();
        }}
        onUserAction={(error) => {
          // Handle user intervention based on error type
          if (error.type === 'session_expired') {
            // Redirect to login
            navigate('/login');
          } else if (error.type === 'cache_validation_failed') {
            // Clear cache and retry
            clearSaveError();
            hideErrorModal();
          }
        }}
        recoveryOptions={selectedError ? [
          {
            title: 'Clear Cache and Retry',
            description: 'Clear local cache and attempt the operation again',
            action: async () => {
              if (selectedError.context?.cacheKey) {
                await cleanupInvalidCacheEntry(
                  selectedError.context.weekIndex,
                  selectedError.context.dayIndex,
                  'user_initiated_cleanup'
                );
              }
              await retrySave();
            }
          },
          {
            title: 'Save as New Workout',
            description: 'Create a new workout log instead of updating existing one',
            action: async () => {
              // Force create new workout by clearing cache
              const key = `${selectedWeek}_${selectedDay}`;
              setProgramLogs(prev => {
                const updated = { ...prev };
                delete updated[key];
                return updated;
              });
              await immediateSaveLog(user, selectedProgram, selectedWeek, selectedDay, logData);
            }
          }
        ] : []}
      />
    </Container>
  );
}

export default LogWorkout;
