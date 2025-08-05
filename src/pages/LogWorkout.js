import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Table, Spinner, Modal, Dropdown } from 'react-bootstrap';
import { Pencil, ThreeDotsVertical, BarChart, Plus, ArrowLeftRight, Dash, X } from 'react-bootstrap-icons';
import { useAuth } from '../hooks/useAuth';
import { useNumberInput } from '../hooks/useNumberInput.js';
import useWorkoutRealtime, { useWorkoutProgressBroadcast } from '../hooks/useWorkoutRealtime';
import '../styles/LogWorkout.css';
import { debounce } from 'lodash';
import { getUserPrograms, getProgramById, updateProgram, updateProgramExercise } from '../services/programService';
import { getAvailableExercises } from '../services/exerciseService';
import workoutLogService from '../services/workoutLogService';
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
  const [programLogs, setProgramLogs] = useState([]);
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

  const { user, isAuthenticated } = useAuth();

  // Enhanced real-time capabilities for workout updates
  const realtimeHook = useWorkoutRealtime(
    user?.id,
    selectedProgram?.id,
    selectedWeek,
    selectedDay,
    {
      enabled: true,
      onUpdate: (update) => {
        // Handle real-time updates from other clients or server
        if (update.type === 'UPDATE' || update.type === 'BROADCAST') {
          // Show real-time update notification
          showUserMessage('Workout updated in real-time', 'info');

          // If it's a workout log update, refresh the data
          if (update.table === 'workout_logs' && update.eventType === 'UPDATE') {
            // Refresh workout data to get latest changes
            const key = `${selectedWeek}_${selectedDay}`;
            if (programLogs[key]) {
              // Update local state with new data
              const updatedData = update.data;
              setProgramLogs(prev => ({
                ...prev,
                [key]: {
                  ...prev[key],
                  isWorkoutFinished: updatedData.is_finished,
                  workoutLogId: updatedData.id
                }
              }));
              setIsWorkoutFinished(updatedData.is_finished);
            }
          }

          // If it's an exercise update, refresh exercise data
          if (update.table === 'workout_log_exercises') {
            // Could refresh specific exercise data here
            console.log('Exercise data updated in real-time:', update.data);
          }
        }
      },
      onError: (error) => {
        // Don't show error to user unless it's critical
        if (process.env.NODE_ENV === 'development') {
          console.warn('Real-time connection error:', error);
        }
      },
      onConnectionChange: (connected, status) => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Real-time connection ${connected ? 'established' : 'lost'}: ${status}`);
        }
      }
    }
  );

  // Enhanced real-time progress broadcasting
  const progressBroadcast = useWorkoutProgressBroadcast(realtimeHook);

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
    if (!value || typeof value !== 'string') return false;
    // Check for patterns like "8-10", "5/3/1", "8-12", etc.
    return /[^\d\s]/.test(value.toString()) && value.toString().trim() !== '';
  };

  // Check window size on resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 767);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Optimized debounced save function with caching and batch operations
  const debouncedSaveLog = useCallback(
    debounce(async (userData, programData, weekIndex, dayIndex, exerciseData) => {
      if (!userData || !programData || exerciseData.length === 0) return;

      try {
        await workoutDebugger.trackOperation(
          WORKOUT_OPERATIONS.SAVE_WORKOUT_LOG,
          async () => {
            await executeSupabaseOperation(async () => {
              // Use cached workout log if available to avoid redundant queries
              const cacheKey = `workout_log_${userData.id}_${programData.id}_${weekIndex}_${dayIndex}`;
              let existingLog = programLogs[`${weekIndex}_${dayIndex}`]?.workoutLogId
                ? { id: programLogs[`${weekIndex}_${dayIndex}`].workoutLogId }
                : await workoutLogService.getWorkoutLog(userData.id, programData.id, weekIndex, dayIndex);

              // Transform exercise data to Supabase format (memoized)
              const transformedExercises = transformExercisesToSupabaseFormat(exerciseData);

              const workoutData = createWorkoutDataForSupabase({
                program: programData,
                weekIndex: weekIndex,
                dayIndex: dayIndex,
                exercises: transformedExercises,
                isFinished: existingLog?.is_finished || false
              });

              if (existingLog) {
                // Optimized update: only send changed fields
                const updateData = {
                  name: workoutData.name,
                  isFinished: workoutData.isFinished,
                  isDraft: workoutData.isDraft,
                  exercises: transformedExercises
                };

                await workoutLogService.updateWorkoutLog(existingLog.id, updateData);

                workoutDebugger.logger.debug('📝 Workout log updated (optimized)', {
                  logId: existingLog.id,
                  exerciseCount: transformedExercises.length
                });
              } else {
                // Create new log and cache the ID for future updates
                const newLog = await workoutLogService.createWorkoutLog(userData.id, workoutData);

                // Update local cache with new log ID
                const key = `${weekIndex}_${dayIndex}`;
                setProgramLogs(prev => ({
                  ...prev,
                  [key]: {
                    ...prev[key],
                    workoutLogId: newLog.id
                  }
                }));

                workoutDebugger.logger.debug('📝 Workout log created (cached)', {
                  logId: newLog?.id,
                  exerciseCount: transformedExercises.length
                });
              }
            }, 'auto-saving workout log');
          },
          {
            userId: userData.id,
            programId: programData.id,
            weekIndex,
            dayIndex,
            exerciseCount: exerciseData.length
          }
        );
      } catch (error) {
        handleError(error, 'auto-saving workout log', 'Error saving workout. Please try again.');
      }
    }, 1500), // Increased debounce to 1.5s to reduce API calls
    [showUserMessage, handleError, programLogs] // Include programLogs for caching
  );

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
        setProgramLogs(logsMap);

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

      workoutDebugger.logger.debug('📋 Loaded existing workout data', {
        key,
        exerciseCount: processedExercises.length,
        isFinished: programLogs[key].isWorkoutFinished
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

        // Cache the initialized data for future use
        setProgramLogs(prev => ({
          ...prev,
          [key]: {
            exercises: dayExercises,
            isWorkoutFinished: false
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
    debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
    setShowBodyweightModal(false);
  };

  const saveNote = () => {
    if (currentExerciseIndex === null) return;

    const newLogData = [...logData];
    newLogData[currentExerciseIndex].notes = exerciseNotes;
    setLogData(newLogData);

    // Trigger auto-save
    if (user && selectedProgram) {
      debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
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
                isWorkoutFinished: prev[key]?.isWorkoutFinished || false
              }
            }));

            // Trigger auto-save with updated data
            debouncedSaveLog(user, updatedProgram, selectedWeek, selectedDay, newLogData);

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

  const handleChange = (exerciseIndex, setIndex, value, field) => {
    if (isWorkoutFinished) return; // Don't allow changes if workout is finished

    const newLogData = [...logData];
    const exercise = exercisesList.find(e => e.id === newLogData[exerciseIndex].exerciseId);
    if (field === 'weights' && exercise?.exerciseType === 'Bodyweight') return;

    let broadcastUpdate = false;

    if (field === 'reps') {
      newLogData[exerciseIndex].reps[setIndex] = value;
    } else if (field === 'weights') {
      newLogData[exerciseIndex].weights[setIndex] = value;
    } else if (field === 'completed') {
      const wasCompleted = newLogData[exerciseIndex].completed[setIndex];
      newLogData[exerciseIndex].completed[setIndex] = !wasCompleted;
      broadcastUpdate = true;

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
    }

    setLogData(newLogData);
    const key = `${selectedWeek}_${selectedDay}`;
    setProgramLogs(prev => ({
      ...prev,
      [key]: { exercises: newLogData, isWorkoutFinished: prev[key]?.isWorkoutFinished || false }
    }));

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

    debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
  };

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
    progressBroadcast.broadcastProgress({
      type: 'set_added',
      exerciseIndex,
      exerciseId: newLogData[exerciseIndex].exerciseId,
      exerciseName: exercise?.name,
      newSetCount: newLogData[exerciseIndex].sets
    });

    debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
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
      progressBroadcast.broadcastProgress({
        type: 'set_removed',
        exerciseIndex,
        exerciseId: newLogData[exerciseIndex].exerciseId,
        exerciseName: exercise?.name,
        newSetCount: newLogData[exerciseIndex].sets
      });

      debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
    }
  };

  const saveLog = async () => {
    if (isWorkoutFinished || !user || !selectedProgram) return;
    setIsLoading(true);
    try {
      await executeSupabaseOperation(async () => {
        // Use workoutLogService to get existing workout log
        const existingLog = await workoutLogService.getWorkoutLog(
          user.id,
          selectedProgram.id,
          selectedWeek,
          selectedDay
        );

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

        if (existingLog) {
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
          await workoutLogService.createWorkoutLog(user.id, workoutData);
        }
        showUserMessage('Workout saved successfully!', 'success');
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
      // Use workoutLogService.finishWorkout method with enhanced error handling
      await executeSupabaseOperation(async () => {
        const result = await workoutLogService.finishWorkout(
          user.id,
          selectedProgram.id,
          selectedWeek,
          selectedDay,
          logData
        );
      }, 'finishing workout');

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
      progressBroadcast.broadcastProgress({
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

      setShowSummaryModal(true);
    } catch (error) {
      // Handle both workout completion and processing errors
      if (error.message && error.message.includes('processing')) {
        // Non-critical error - workout is saved but processing failed
        handleError(error, 'triggering workout processing', 'Workout saved but processing failed. Analytics may be delayed.');
        setIsWorkoutFinished(true);
        setShowSummaryModal(true);
      } else {
        // Critical error - workout completion failed
        handleError(error, 'finishing workout', 'Error finishing workout. Please try again.');
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
          isWorkoutFinished: prev[key]?.isWorkoutFinished || false
        }
      }));

      // Trigger auto-save
      debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);

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
          isWorkoutFinished: prev[key]?.isWorkoutFinished || false
        }
      }));

      // Trigger auto-save
      debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);

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
              <WorkoutRealtimeIndicator
                realtimeHook={realtimeHook}
                showProgress={true}
                showPresence={true}
                className="ms-auto"
              />
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
        onHide={() => setShowSummaryModal(false)}
        workoutData={logData.map(ex => ({ ...ex, name: exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Unknown' }))}
        exercisesList={exercisesList}
        weightUnit={selectedProgram?.weightUnit || 'LB'}
      />
    </Container>
  );
}

export default LogWorkout;
