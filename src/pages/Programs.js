import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Card, Button, Modal, Spinner, Accordion, Badge, Alert } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../config/supabase';
import { Trash, Star, Copy, FileText, Clock, Check, PlusCircle, Pencil, Broadcast, GraphUp } from 'react-bootstrap-icons';
import '../styles/Programs.css';
import { getUserPrograms, getProgramById, setCurrentProgram, deleteProgram, copyProgram, getProgramStatistics } from '../services/programService';
import { getAvailableExercises } from '../services/exerciseService';
import workoutLogService from '../services/workoutLogService';
import { parseWeeklyConfigs } from '../utils/programUtils';
import { useRealtimePrograms, useRealtimeExerciseLibrary } from '../hooks/useRealtimePrograms';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function Programs({ userRole }) {
  const [userPrograms, setUserPrograms] = useState([]);
  const [templatePrograms, setTemplatePrograms] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [showProgramDetails, setShowProgramDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const chartContainerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 767);

  // Real-time program updates
  const {
    programs: realtimePrograms,
    exercises: realtimeExercises,
    isConnected: isRealtimeConnected,
    lastUpdate,
    setPrograms: setRealtimePrograms,
    setExercises: setRealtimeExercises
  } = useRealtimePrograms({
    enabled: true,
    onProgramUpdate: (updateData) => {
      console.log('📋 Program updated in real-time:', updateData);
      // Handle program updates
      if (updateData.eventType === 'UPDATE' && selectedProgram && selectedProgram.id === updateData.data.id) {
        setSelectedProgram(prev => ({ ...prev, ...updateData.data }));
      }
    },
    onExerciseUpdate: (updateData) => {
      console.log('💪 Exercise updated in real-time:', updateData);
      // Refresh exercise data when exercises are updated
    },
    onProgramShared: (shareData) => {
      console.log('🔗 Program shared:', shareData);
      // Could show a notification here
    }
  });

  // Real-time exercise library updates
  const {
    newExercises,
    updatedExercises,
    clearNewExercises,
    clearUpdatedExercises
  } = useRealtimeExerciseLibrary({
    enabled: true,
    onExerciseUpdate: (updateData) => {
      console.log('💪 Exercise library updated:', updateData);
    }
  });

  // Function to handle chart resize
  const handleChartResize = () => {
    if (chartContainerRef.current) {
      // Force chart to resize by triggering a window resize event
      window.dispatchEvent(new Event('resize'));

      // Also try to find and resize any Chart.js instances
      const canvas = chartContainerRef.current.querySelector('canvas');
      if (canvas && canvas.chart) {
        canvas.chart.resize();
      }
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        setIsLoading(true);
        try {
          // Cache warming for Programs page
          const cacheWarmingService = (await import('../services/supabaseCacheWarmingService')).default;
          const warmingPromise = cacheWarmingService.smartWarmCache(user.id, {
            lastVisitedPage: 'Programs',
            timeOfDay: new Date().getHours(),
            priority: 'normal'
          }).catch(error => {
            console.warn('Cache warming failed:', error);
            return null;
          });

          // Fetch user programs using Supabase
          const userProgramsData = await getUserPrograms(user.id, { isTemplate: false });
          console.log("userProgramsData: ", userProgramsData);
          const processedUserPrograms = userProgramsData.map(program => ({
            ...program,
            weeklyConfigs: parseWeeklyConfigs(program.weekly_configs, program.duration, program.days_per_week)
          }));
          console.log("processedUserPrograms: ", processedUserPrograms);
          setUserPrograms(processedUserPrograms);
          setRealtimePrograms(processedUserPrograms); // Initialize real-time state

          // Fetch template programs using Supabase
          const templateProgramsData = await getUserPrograms(user.id, { isTemplate: true });
          const processedTemplatePrograms = templateProgramsData.map(program => ({
            ...program,
            weeklyConfigs: parseWeeklyConfigs(program.weekly_configs, program.duration, program.days_per_week)
          }));
          setTemplatePrograms(processedTemplatePrograms);

          // Fetch exercises using Supabase
          const exercisesData = await getAvailableExercises(user.id);
          const processedExercises = exercisesData.map(ex => ({
            ...ex,
            isGlobal: ex.is_global,
            source: ex.is_global ? 'global' : 'user',
            createdBy: ex.created_by
          }));
          setExercises(processedExercises);
          setRealtimeExercises(processedExercises); // Initialize real-time state

        } catch (error) {
          console.error("Error fetching data: ", error);
        } finally {
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user, setRealtimePrograms, setRealtimeExercises]);


  const getExerciseName = (exerciseId) => {
    return exercises.find(ex => ex.id === exerciseId)?.name || 'Unknown';
  };

  const adoptProgram = async (program) => {
    if (!user) return;
    try {
      const newProgramData = {
        user_id: user.id,
        is_template: false,
        name: `${program.name} (Adopted)`,
        duration: program.duration,
        days_per_week: program.days_per_week,
        weight_unit: program.weight_unit || 'LB',
        weekly_configs: program.weekly_configs,
        is_current: false,
        is_active: true,
        completed_weeks: 0
      };

      await copyProgram(program.id, newProgramData, user.id);

      // Refresh programs list
      const updatedPrograms = await getUserPrograms(user.id, { isTemplate: false });
      setUserPrograms(updatedPrograms);

      alert('Program adopted successfully!');
    } catch (error) {
      console.error("Error adopting program: ", error);
      alert('Failed to adopt program');
    }
  };

  const handleDeleteProgram = async (programId) => {
    if (!window.confirm('Are you sure you want to delete this program?')) return;

    setIsDeleting(true);
    try {
      await deleteProgram(programId, user.id);
      setUserPrograms(userPrograms.filter(p => p.id !== programId));
      alert('Program deleted successfully!');
    } catch (error) {
      console.error("Error deleting program: ", error);
      alert('Failed to delete program');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSetCurrentProgram = async (programId) => {
    if (!user) return;

    try {
      await setCurrentProgram(programId, user.id);

      // Update local state
      setUserPrograms(prev => prev.map(p => ({
        ...p,
        is_current: p.id === programId
      })));

      alert('Program set as current!');
    } catch (error) {
      console.error("Error setting current program: ", error);
      alert('Failed to set current program');
    }
  };

  const fetchWorkoutLogs = async (program) => {
    if (!user) return {};

    try {
      // Fetch workout logs using Supabase
      const { data: logsData, error } = await supabase
        .from('workout_logs')
        .select(`
          *,
          workout_log_exercises (
            *,
            exercises (
              id,
              name
            )
          )
        `)
        .eq('user_id', user.id)
        .eq('program_id', program.id);

      if (error) throw error;

      const logs = {};
      logsData.forEach(log => {
        const key = `week${(log.week_index || 0) + 1}_day${(log.day_index || 0) + 1}`;

        if (!logs[key]) {
          logs[key] = {
            exercises: {},
            isWorkoutFinished: log.is_finished || false,
            completedDate: log.completed_date || null
          };
        }

        (log.workout_log_exercises || []).forEach(ex => {
          logs[key].exercises[ex.exercise_id] = {
            exerciseId: ex.exercise_id,
            sets: ex.sets,
            reps: ex.reps,
            weights: ex.weights,
            completed: ex.completed
          };
        });
      });

      return logs;
    } catch (error) {
      console.error("Error fetching workout logs: ", error);
      return {};
    }
  };

  const viewProgramDetails = async (program) => {
    setSelectedProgram(program);

    // Fetch workout logs when viewing program details
    const logs = await fetchWorkoutLogs(program);
    setWorkoutLogs(logs);

    setShowProgramDetails(true);
  };

  const renderWorkoutLogs = (exercise, weekKey) => {
    const log = workoutLogs[weekKey]?.exercises?.[exercise.exerciseId];

    if (!log) {
      return null;
    }

    return (
      <div className="workout-log-details mt-2">
        {log.sets && log.reps && log.weights && (
          <div className="sets-container">
            {Array.from({ length: log.sets }).map((_, index) => (
              <div key={index} className="set-item p-2 bg-light rounded mb-2">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>Set {index + 1}:</strong>
                    <span className="ms-2">
                      {log.reps[index]} reps @ {log.weights[index] || 'N/A'} {selectedProgram.weight_unit || 'LB'}
                    </span>
                  </div>
                  {log.completed?.[index] && <Check className="text-success" />}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleEditProgram = (programId) => {
    navigate(`/edit-program/${programId}`);
  };

  const renderActionButtons = (program, isTemplate) => {
    if (isMobile) {
      return (
        <div className="d-flex flex-column gap-2 w-100">
          <Button
            variant="outline-primary"
            size="sm"
            onClick={() => viewProgramDetails(program)}
            className="w-100"
          >
            <FileText className="me-1" /> Details
          </Button>
          {/* Allow edit for admin on template programs */}
          {(!isTemplate || userRole === 'admin') ? (
            <>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handleEditProgram(program.id)}
                className="w-100"
              >
                <Pencil className="me-1" /> Edit
              </Button>
              {!isTemplate && !program.is_current && (
                <Button
                  variant="outline-success"
                  size="sm"
                  onClick={() => handleSetCurrentProgram(program.id)}
                  className="w-100"
                >
                  <Clock className="me-1" /> Set Current
                </Button>
              )}
              {!isTemplate && (
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() => handleDeleteProgram(program.id)}
                  disabled={isDeleting}
                  className="w-100"
                >
                  <Trash className="me-1" /> Delete
                </Button>
              )}
              {isTemplate && (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => adoptProgram(program)}
                  className="w-100"
                >
                  <Copy className="me-1" /> Adopt
                </Button>
              )}
            </>
          ) : (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => adoptProgram(program)}
              className="w-100"
            >
              <Copy className="me-1" /> Adopt
            </Button>
          )}
        </div>
      );
    }
    // Desktop layout
    return (
      <div className="d-flex gap-2">
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => viewProgramDetails(program)}
        >
          <FileText className="me-1" /> Details
        </Button>
        {/* Allow edit for admin on template programs */}
        {(!isTemplate || userRole === 'admin') ? (
          <>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => handleEditProgram(program.id)}
            >
              <Pencil className="me-1" /> Edit
            </Button>
            {!isTemplate && !program.is_current && (
              <Button
                variant="outline-success"
                size="sm"
                onClick={() => handleSetCurrentProgram(program.id)}
              >
                <Clock className="me-1" /> Set Current
              </Button>
            )}
            {!isTemplate && (
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => handleDeleteProgram(program.id)}
                disabled={isDeleting}
              >
                <Trash className="me-1" /> Delete
              </Button>
            )}
            {isTemplate && (
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => adoptProgram(program)}
                className="w-100"
              >
                <Copy className="me-1" /> Adopt
              </Button>
            )}
          </>
        ) : (
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => adoptProgram(program)}
          >
            <Copy className="me-1" /> Adopt
          </Button>
        )}
      </div>
    );
  };

  const renderProgramCard = (program, isTemplate = false) => {
    return (
      <Card key={program.id} className="mb-3 program-card">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <Card.Title>{program.name}</Card.Title>
              <Card.Subtitle className="text-muted mb-2">
                {program.duration} weeks | {program.days_per_week} days/week
              </Card.Subtitle>
            </div>
            {program.is_current && !isTemplate && (
              <Star className="text-warning" size={24} />
            )}
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3">
            {renderActionButtons(program, isTemplate)}
          </div>
        </Card.Body>
      </Card>
    );
  };

  // Enhanced Program Details Modal (from Claude)
  const renderProgramDetailsModal = () => {
    if (!selectedProgram) return null;

    // Calculate overall program progress
    const calculateProgramProgress = () => {
      let totalWorkouts = 0;
      let completedWorkouts = 0;

      selectedProgram.weeklyConfigs.forEach((week, weekIndex) => {
        week.forEach((day, dayIndex) => {
          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
          totalWorkouts++;
          if (workoutLogs[weekKey]?.isWorkoutFinished) {
            completedWorkouts++;
          }
        });
      });

      return {
        totalWorkouts,
        completedWorkouts,
        percentage: Math.round((completedWorkouts / totalWorkouts) * 100)
      };
    };

    // Calculate weekly progress breakdown
    const calculateWeeklyProgress = () => {
      const weeklyProgress = [];

      selectedProgram.weeklyConfigs.forEach((week, weekIndex) => {
        let totalDays = week.length;
        let completedDays = 0;

        week.forEach((day, dayIndex) => {
          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
          if (workoutLogs[weekKey]?.isWorkoutFinished) {
            completedDays++;
          }
        });

        weeklyProgress.push({
          week: weekIndex + 1,
          totalDays,
          completedDays,
          percentage: Math.round((completedDays / totalDays) * 100)
        });
      });

      return weeklyProgress;
    };

    // Fixed calculateExerciseMetrics function with proper date handling and bodyweight support
    const calculateExerciseMetrics = () => {
      const exerciseMetrics = {};

      // Collect all exercise data from logs
      Object.keys(workoutLogs).forEach(weekKey => {
        if (workoutLogs[weekKey]?.exercises) {
          const logEntry = workoutLogs[weekKey];

          // Get completion date - this should be stored when workout is completed
          const completionDate = logEntry.completedDate ?
            new Date(logEntry.completedDate) :
            null;

          Object.keys(logEntry.exercises).forEach(exerciseId => {
            const exerciseLog = logEntry.exercises[exerciseId];
            const exercise = exercises.find(e => e.id === exerciseId);
            const exerciseType = exercise?.exercise_type || '';

            if (!exerciseMetrics[exerciseId]) {
              exerciseMetrics[exerciseId] = {
                name: getExerciseName(exerciseId),
                exercise_type: exerciseType,
                sessions: [],
                maxWeight: 0,
                totalVolume: 0,
                progressTrend: []
              };
            }

            if (exerciseLog.weights && exerciseLog.reps) {
              // Calculate weights and volume based on exercise type
              let sessionMaxWeight = 0;
              let sessionVolume = 0;
              const calculatedWeights = [];

              exerciseLog.weights.forEach((weight, idx) => {
                const weightValue = parseFloat(weight) || 0;
                const repsValue = exerciseLog.reps[idx] || 0;
                const bodyweightValue = exerciseLog.bodyweight ? parseFloat(exerciseLog.bodyweight) : 0;

                let totalWeight = weightValue;
                let displayWeight = weightValue;

                // Calculate total weight based on exercise type
                if (exerciseType === 'Bodyweight') {
                  totalWeight = bodyweightValue;
                  displayWeight = bodyweightValue;
                } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                  totalWeight = bodyweightValue + weightValue;
                  displayWeight = totalWeight;
                }

                calculatedWeights.push({
                  weight: weightValue,
                  totalWeight: totalWeight,
                  displayWeight: displayWeight,
                  reps: repsValue,
                  bodyweight: bodyweightValue
                });

                // Update session max weight and volume
                if (totalWeight > sessionMaxWeight) {
                  sessionMaxWeight = totalWeight;
                }
                sessionVolume += totalWeight * repsValue;
              });

              // Extract week and day from the key (week1_day1)
              const [weekPart, dayPart] = weekKey.split('_');
              const weekNum = parseInt(weekPart.replace('week', ''));
              const dayNum = parseInt(dayPart.replace('day', ''));

              exerciseMetrics[exerciseId].sessions.push({
                weekNum,
                dayNum,
                weights: calculatedWeights,
                reps: exerciseLog.reps,
                maxWeight: sessionMaxWeight,
                volume: sessionVolume,
                completionDate: completionDate,
                weekKey: weekKey,
                bodyweight: exerciseLog.bodyweight
              });

              exerciseMetrics[exerciseId].maxWeight = Math.max(exerciseMetrics[exerciseId].maxWeight, sessionMaxWeight);
              exerciseMetrics[exerciseId].totalVolume += sessionVolume;
            }
          });
        }
      });

      // Process each exercise's sessions
      Object.values(exerciseMetrics).forEach(exercise => {
        // Sort sessions by actual completion date if available, otherwise by week/day
        exercise.sessions.sort((a, b) => {
          if (a.completionDate && b.completionDate) {
            return a.completionDate - b.completionDate; // Sort by actual date
          }
          // Fallback to week/day sorting
          if (a.weekNum !== b.weekNum) return a.weekNum - b.weekNum;
          return a.dayNum - b.dayNum;
        });

        // Create progress trend based on chronological order
        exercise.progressTrend = exercise.sessions.map((session, index) => ({
          session: index + 1,
          maxWeight: session.maxWeight,
          volume: session.volume,
          date: session.completionDate,
          label: session.completionDate ?
            session.completionDate.toLocaleDateString() :
            `Week ${session.weekNum}, Day ${session.dayNum}`
        }));
      });

      // Sort by total volume
      return Object.values(exerciseMetrics).sort((a, b) => b.totalVolume - a.totalVolume);
    };

    const progress = calculateProgramProgress();
    const weeklyProgress = calculateWeeklyProgress();
    const exerciseMetrics = calculateExerciseMetrics();

    // Find current week based on completion status
    const getCurrentWeekIndex = () => {
      for (let weekIndex = 0; weekIndex < selectedProgram.weeklyConfigs.length; weekIndex++) {
        const week = selectedProgram.weeklyConfigs[weekIndex];
        let isWeekCompleted = true;

        for (let dayIndex = 0; dayIndex < week.length; dayIndex++) {
          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
          if (!workoutLogs[weekKey]?.isWorkoutFinished) {
            isWeekCompleted = false;
            break;
          }
        }

        if (!isWeekCompleted) {
          return weekIndex;
        }
      }

      // If all weeks are completed, return the last week
      return selectedProgram.weeklyConfigs.length - 1;
    };

    const currentWeekIndex = getCurrentWeekIndex();

    const isProgramComplete = (program, workoutLogs) => {
      // Check if all weeks and days have been completed
      for (let weekIndex = 0; weekIndex < program.weeklyConfigs.length; weekIndex++) {
        const week = program.weeklyConfigs[weekIndex];
        for (let dayIndex = 0; dayIndex < week.length; dayIndex++) {
          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
          // If any workout is not marked as finished, program is not complete
          if (!workoutLogs[weekKey]?.isWorkoutFinished) {
            return false;
          }
        }
      }
      return true;
    };

    const programComplete = isProgramComplete(selectedProgram, workoutLogs);

    return (
      <Modal
        show={showProgramDetails}
        onHide={() => {
          setShowProgramDetails(false);
          setActiveTab('overview');
        }}
        size={isMobile ? "fullscreen" : "lg"}
        centered={!isMobile}
        dialogClassName="program-details-modal"
      >
        <Modal.Header closeButton className="border-bottom-0 pb-0">
          <Modal.Title className="d-flex align-items-center">
            <div>
              <h4 className="mb-0">{selectedProgram.name}</h4>
              <div className="text-muted small">
                {selectedProgram.duration} weeks | {selectedProgram.days_per_week} days per week | {selectedProgram.weight_unit || 'LB'}
              </div>
            </div>
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="pt-0">
          {/* Program Progress Summary */}
          <div className="program-progress-summary card shadow-sm mb-4">
            <div className="card-body">
              <div className="row align-items-center">
                <div className="col-md-3 text-center">
                  <div className="progress-circle-container">
                    <div className="progress-circle" style={{ width: '120px', height: '120px' }}>
                      <svg viewBox="0 0 36 36" className="circular-chart">
                        <path
                          className="circle-bg"
                          d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="circle"
                          strokeDasharray={`${progress.percentage}, 100`}
                          d="M18 2.0845
                          a 15.9155 15.9155 0 0 1 0 31.831
                          a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <div className="progress-percentage">{progress.percentage}%</div>
                    </div>
                    <div className="mt-2 text-center">
                      <strong>
                        {(() => {
                          // if (programComplete) {
                          //   return (
                          //     <span className="text-success">
                          //       Program completed! 🎉
                          //     </span>
                          //   );
                          // }

                          // If not complete, show basic progress
                          return (
                            <span className="text-muted">
                              {progress.completedWorkouts} of {progress.totalWorkouts} workouts completed
                            </span>
                          );
                        })()}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="col-md-9">
                  <h5 className="mb-3">Weekly Progress</h5>
                  <div className="weekly-progress-bars">
                    {weeklyProgress.map((weekProgress) => (
                      <div key={weekProgress.week} className="mb-2">
                        <div className="d-flex justify-content-between mb-1">
                          <span>Week {weekProgress.week}</span>
                          <span>{weekProgress.completedDays}/{weekProgress.totalDays} days</span>
                        </div>
                        <div className="progress" style={{ height: '8px' }}>
                          <div
                            className="progress-bar"
                            role="progressbar"
                            style={{ width: `${weekProgress.percentage}%` }}
                            aria-valuenow={weekProgress.percentage}
                            aria-valuemin="0"
                            aria-valuemax="100"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <div className="d-flex justify-content-between">
                      {programComplete ? (
                        <span className="text-success">
                          <strong>Program complete! 🎉</strong>
                        </span>
                      ) : (
                        <>
                          <span><strong>Currently on:</strong> Week {currentWeekIndex + 1}</span>
                          {progress.completedWorkouts > 0 && (
                            <span className="text-muted">
                              On track to complete in {Math.ceil((progress.totalWorkouts * (selectedProgram.duration / progress.completedWorkouts)) / 7)} weeks
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <ul className="nav nav-tabs nav-fill mb-4">
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                Program Overview
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'performance' ? 'active' : ''}`}
                onClick={() => setActiveTab('performance')}
              >
                Performance Metrics
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'workout-logs' ? 'active' : ''}`}
                onClick={() => setActiveTab('workout-logs')}
              >
                Workout Logs
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link ${activeTab === 'schedule' ? 'active' : ''}`}
                onClick={() => setActiveTab('schedule')}
              >
                Full Schedule
              </button>
            </li>
          </ul>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="program-overview">
              <div className="card shadow-sm mb-4">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">Current Week: Week {currentWeekIndex + 1}</h5>
                </div>
                <div className="card-body">
                  <div className="row">
                    {selectedProgram.weeklyConfigs[currentWeekIndex].map((day, dayIndex) => {
                      const weekKey = `week${currentWeekIndex + 1}_day${dayIndex + 1}`;
                      const isWorkoutFinished = workoutLogs[weekKey]?.isWorkoutFinished;

                      return (
                        <div key={dayIndex} className="col-md-6 mb-3">
                          <div className={`card h-100 ${isWorkoutFinished ? 'border-success' : ''}`}>
                            <div className={`card-header d-flex justify-content-between align-items-center ${isWorkoutFinished ? 'bg-success text-white' : ''}`}>
                              <h6 className="mb-0">Day {dayIndex + 1}</h6>
                              {isWorkoutFinished ? (
                                <span className="badge bg-white text-success">Completed</span>
                              ) : (
                                <span className="badge bg-secondary">Pending</span>
                              )}
                            </div>
                            <div className="card-body">
                              {day.exercises.map((ex, exIndex) => {
                                const exerciseName = getExerciseName(ex.exerciseId);
                                const exerciseLog = workoutLogs[weekKey]?.exercises?.[ex.exerciseId];
                                const exercise = exercises.find(e => e.id === ex.exerciseId);
                                const exerciseType = exercise?.exercise_type || '';

                                return (
                                  <div key={exIndex} className="exercise-item p-2 mb-2 bg-light rounded">
                                    <div className="d-flex justify-content-between align-items-center">
                                      <div>
                                        <strong>{exerciseName}</strong>
                                        {exerciseType && (
                                          <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                            {exerciseType}
                                          </span>
                                        )}
                                        <div className="text-muted small">
                                          Target: {ex.sets} sets × {ex.reps} reps
                                        </div>
                                      </div>
                                    </div>

                                    {/* Display logs if completed */}
                                    {exerciseLog && (
                                      <div className="mt-2 exercise-log-details">
                                        <div className="sets-completed">
                                          {Array.from({ length: exerciseLog.sets || 0 }).map((_, setIndex) => {
                                            const weightValue = exerciseLog.weights?.[setIndex] || 0;
                                            const repsValue = exerciseLog.reps?.[setIndex] || 0;
                                            const bodyweightValue = exerciseLog.bodyweight ? parseFloat(exerciseLog.bodyweight) : 0;

                                            let displayWeight = weightValue;
                                            let weightLabel = 'Weight';

                                            // Calculate display weight based on exercise type
                                            if (exerciseType === 'Bodyweight') {
                                              displayWeight = bodyweightValue;
                                              weightLabel = 'Bodyweight';
                                            } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                                              displayWeight = bodyweightValue + weightValue;
                                              weightLabel = 'Total Weight';
                                            }

                                            return (
                                              <div key={setIndex} className="set-data d-flex justify-content-between p-1 border-bottom">
                                                <span>Set {setIndex + 1}:</span>
                                                <span>
                                                  <strong>{repsValue || '-'}</strong> reps @
                                                  <strong> {displayWeight || '-'}</strong> {selectedProgram.weight_unit}
                                                  {exerciseLog.completed?.[setIndex] &&
                                                    <Check className="text-success ms-1" size={14} />
                                                  }
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="row">
                {/* Program Structure Overview */}
                <div className="col-md-6">
                  <div className="card shadow-sm h-100">
                    <div className="card-header">
                      <h5 className="mb-0">Program Structure</h5>
                    </div>
                    <div className="card-body">
                      <div className="table-responsive">
                        <table className="table table-sm">
                          <thead>
                            <tr>
                              <th>Week</th>
                              <th>Workouts</th>
                              <th>Total Exercises</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedProgram.weeklyConfigs.map((week, weekIndex) => {
                              const totalExercises = week.reduce((sum, day) => sum + day.exercises.length, 0);
                              const completedDays = week.filter((_, dayIndex) => {
                                const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
                                return workoutLogs[weekKey]?.isWorkoutFinished;
                              }).length;

                              let status = "Not Started";
                              if (completedDays === week.length) status = "Completed";
                              else if (completedDays > 0) status = "In Progress";

                              let statusClass = "secondary";
                              if (status === "Completed") statusClass = "success";
                              else if (status === "In Progress") statusClass = "primary";

                              return (
                                <tr key={weekIndex}>
                                  <td>Week {weekIndex + 1}</td>
                                  <td>{week.length}</td>
                                  <td>{totalExercises}</td>
                                  <td><span className={`badge bg-${statusClass}`}>{status}</span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Top Exercises */}
                <div className="col-md-6">
                  <div className="card shadow-sm h-100">
                    <div className="card-header">
                      <h5 className="mb-0">Top Exercises</h5>
                    </div>
                    <div className="card-body">
                      {exerciseMetrics.length > 0 ? (
                        <div className="table-responsive">
                          <table className="table table-sm">
                            <thead>
                              <tr>
                                <th>Exercise</th>
                                <th>Sessions</th>
                                <th>Max Weight</th>
                                <th>Total Volume</th>
                              </tr>
                            </thead>
                            <tbody>
                              {exerciseMetrics.slice(0, 5).map((exercise, index) => {
                                const getWeightLabel = () => {
                                  if (exercise.exercise_type === 'Bodyweight') return 'Bodyweight';
                                  if (exercise.exercise_type === 'Bodyweight Loadable') return 'Total Weight';
                                  return 'Weight';
                                };

                                return (
                                  <tr key={index}>
                                    <td>
                                      {exercise.name}
                                      {exercise.exercise_type && (
                                        <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                          {exercise.exercise_type}
                                        </span>
                                      )}
                                    </td>
                                    <td>{exercise.sessions.length}</td>
                                    <td>{exercise.maxWeight} {selectedProgram.weight_unit}</td>
                                    <td>{Math.round(exercise.totalVolume)} {selectedProgram.weight_unit}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-center py-4">
                          <p className="text-muted">No exercise data available yet</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Performance Metrics Tab */}
          {activeTab === 'performance' && (
            <div className="performance-metrics">
              {exerciseMetrics.length > 0 ? (
                <>
                  <div className="row mb-4">
                    <div className="col-12">
                      <div className="card shadow-sm">
                        <div className="card-header">
                          <h5 className="mb-0">Exercise Performance</h5>
                        </div>
                        <div className="card-body pb-0">
                          <Accordion defaultActiveKey="0" alwaysOpen>
                            {exerciseMetrics.map((exercise, index) => {
                              const getWeightLabel = () => {
                                if (exercise.exercise_type === 'Bodyweight') return 'Bodyweight';
                                if (exercise.exercise_type === 'Bodyweight Loadable') return 'Total Weight';
                                return 'Weight';
                              };

                              return (
                                <Accordion.Item eventKey={index.toString()} key={index} className="mb-3">
                                  <Accordion.Header>
                                    <div className="d-flex flex-column w-100">
                                      {/* Exercise name and type */}
                                      <div className="d-flex justify-content-between align-items-start mb-2">
                                        <span className="fw-bold text-truncate me-2">
                                          {exercise.name}
                                          {exercise.exercise_type && (
                                            <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                              {exercise.exercise_type}
                                            </span>
                                          )}
                                        </span>
                                      </div>

                                      {/* Metrics row - responsive layout */}
                                      <div className="d-flex flex-wrap gap-2 justify-content-between">
                                        <span className="metric-box">
                                          <span className="metric-value">{exercise.maxWeight}</span>
                                          <span className="metric-label">
                                            {isMobile ?
                                              (exercise.exercise_type === 'Bodyweight' ? 'Max BW' :
                                                exercise.exercise_type === 'Bodyweight Loadable' ? 'Max Total' : 'Max Wt') :
                                              getWeightLabel()
                                            } ({selectedProgram.weight_unit})
                                          </span>
                                        </span>
                                        <span className="metric-box">
                                          <span className="metric-value">{exercise.sessions.length}</span>
                                          <span className="metric-label">Sessions</span>
                                        </span>
                                        <span className="metric-box">
                                          <span className="metric-value">{Math.round(exercise.totalVolume)}</span>
                                          <span className="metric-label">Total Volume</span>
                                        </span>
                                      </div>
                                    </div>
                                  </Accordion.Header>
                                  <Accordion.Body>
                                    {exercise.sessions.length > 1 && (
                                      <div className="progression-chart mb-4" style={{ overflowX: 'auto' }}>
                                        <h6 className="mb-2">Progression Chart</h6>
                                        <div
                                          ref={chartContainerRef}
                                          className="chart-container"
                                          style={{
                                            minWidth: 320,
                                            width: '100%',
                                            maxWidth: '100%',
                                            height: isMobile ? '250px' : '350px',
                                            position: 'relative'
                                          }}
                                        >
                                          {/* Responsive Line chart for progression */}
                                          <Line
                                            key={`${exercise.name}-${exercise.sessions.length}-${forceUpdate}`}
                                            data={{
                                              labels: exercise.progressTrend.map(session => session.label), // Use actual dates or week/day
                                              datasets: [
                                                {
                                                  label: `${getWeightLabel()} (${selectedProgram.weight_unit})`,
                                                  data: exercise.progressTrend.map(session => session.maxWeight),
                                                  fill: false,
                                                  borderColor: '#007bff',
                                                  backgroundColor: '#007bff',
                                                  tension: 0.2,
                                                  pointRadius: 4,
                                                  pointHoverRadius: 6,
                                                  yAxisID: 'y1',
                                                },
                                                {
                                                  label: `Total Volume (${selectedProgram.weight_unit})`,
                                                  data: exercise.progressTrend.map(session => session.volume),
                                                  fill: false,
                                                  borderColor: '#28a745',
                                                  backgroundColor: '#28a745',
                                                  tension: 0.2,
                                                  pointRadius: 4,
                                                  pointHoverRadius: 6,
                                                  yAxisID: 'y2',
                                                }
                                              ]
                                            }}
                                            options={{
                                              responsive: true,
                                              maintainAspectRatio: false,
                                              plugins: {
                                                legend: {
                                                  display: true,
                                                  position: 'top',
                                                  labels: { font: { size: isMobile ? 10 : 14 } }
                                                },
                                                title: { display: false },
                                                tooltip: {
                                                  callbacks: {
                                                    title: function (context) {
                                                      const session = exercise.progressTrend[context[0].dataIndex];
                                                      return session.date ?
                                                        `Completed: ${session.date.toLocaleDateString()}` :
                                                        session.label;
                                                    }
                                                  }
                                                }
                                              },
                                              scales: {
                                                x: {
                                                  title: {
                                                    display: true,
                                                    text: 'Workout Sessions',
                                                    font: { size: isMobile ? 10 : 14 }
                                                  },
                                                  ticks: {
                                                    font: { size: isMobile ? 9 : 12 },
                                                    maxRotation: 45,
                                                    minRotation: 0
                                                  }
                                                },
                                                y1: {
                                                  type: 'linear',
                                                  display: true,
                                                  position: 'left',
                                                  title: {
                                                    display: true,
                                                    text: `${getWeightLabel()} (${selectedProgram.weight_unit})`,
                                                    font: { size: isMobile ? 10 : 14 }
                                                  },
                                                  beginAtZero: true,
                                                  grid: { drawOnChartArea: true },
                                                  ticks: { font: { size: isMobile ? 9 : 12 } }
                                                },
                                                y2: {
                                                  type: 'linear',
                                                  display: true,
                                                  position: 'right',
                                                  title: {
                                                    display: true,
                                                    text: `Total Volume (${selectedProgram.weight_unit})`,
                                                    font: { size: isMobile ? 10 : 14 }
                                                  },
                                                  beginAtZero: true,
                                                  grid: { drawOnChartArea: false },
                                                  ticks: { font: { size: isMobile ? 9 : 12 } }
                                                }
                                              }
                                            }}
                                          />
                                        </div>
                                      </div>
                                    )}
                                    <div className="table-responsive">
                                      <table className="table table-sm">
                                        <thead>
                                          <tr>
                                            <th>Week</th>
                                            <th>Day</th>
                                            <th>Sets × Reps</th>
                                            <th>{getWeightLabel()} ({selectedProgram.weight_unit})</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {exercise.sessions.sort((a, b) => {
                                            if (a.weekNum !== b.weekNum) return a.weekNum - b.weekNum;
                                            return a.dayNum - b.dayNum;
                                          }).map((session, sessionIdx) => {
                                            const setsReps = session.weights.map((weightData, i) =>
                                              `${session.reps[i] || '-'}`
                                            ).join(' / ');

                                            const weights = session.weights.map(weightData => {
                                              if (exercise.exercise_type === 'Bodyweight Loadable' && weightData.bodyweight > 0 && weightData.weight >= 0) {
                                                return `${weightData.totalWeight}`;
                                              }
                                              return weightData.displayWeight || weightData.weight;
                                            }).join(' / ');

                                            return (
                                              <tr key={sessionIdx}>
                                                <td>Week {session.weekNum}</td>
                                                <td>Day {session.dayNum}</td>
                                                <td>{setsReps}</td>
                                                <td>{weights}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </Accordion.Body>
                                </Accordion.Item>
                              );
                            })}
                          </Accordion>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-5">
                  <p className="text-muted">No workout data available yet to display performance metrics</p>
                </div>
              )}
            </div>
          )}

          {/* Workout Logs Tab */}
          {activeTab === 'workout-logs' && (
            <div className="workout-logs">
              <div className="accordion" id="workoutLogsAccordion">
                {selectedProgram.weeklyConfigs.map((week, weekIndex) => (
                  <div className="accordion-item" key={weekIndex}>
                    <h2 className="accordion-header" id={`heading-week-${weekIndex + 1}`}>
                      <button
                        className={`accordion-button ${weekIndex !== currentWeekIndex ? 'collapsed' : ''}`}
                        type="button"
                        data-bs-toggle="collapse"
                        data-bs-target={`#collapse-week-${weekIndex + 1}`}
                        aria-expanded={weekIndex === currentWeekIndex}
                        aria-controls={`collapse-week-${weekIndex + 1}`}
                      >
                        Week {weekIndex + 1}
                      </button>
                    </h2>
                    <div
                      id={`collapse-week-${weekIndex + 1}`}
                      className={`accordion-collapse collapse ${weekIndex === currentWeekIndex ? 'show' : ''}`}
                      aria-labelledby={`heading-week-${weekIndex + 1}`}
                      data-bs-parent="#workoutLogsAccordion"
                    >
                      <div className="accordion-body">
                        {week.map((day, dayIndex) => {
                          const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
                          const isWorkoutFinished = workoutLogs[weekKey]?.isWorkoutFinished;

                          return (
                            <div key={dayIndex} className="card mb-3">
                              <div className={`card-header d-flex justify-content-between align-items-center ${isWorkoutFinished ? 'bg-success text-white' : ''}`}>
                                <h6 className="mb-0">Day {dayIndex + 1}</h6>
                                {isWorkoutFinished ? (
                                  <span className="badge bg-white text-success">Completed</span>
                                ) : (
                                  <span className="badge bg-secondary">Pending</span>
                                )}
                              </div>
                              <div className="card-body">
                                {day.exercises.map((ex, exIndex) => {
                                  const exerciseName = getExerciseName(ex.exerciseId);
                                  const exerciseLog = workoutLogs[weekKey]?.exercises?.[ex.exerciseId];
                                  const exercise = exercises.find(e => e.id === ex.exerciseId);
                                  const exerciseType = exercise?.exercise_type || '';

                                  const getWeightLabel = () => {
                                    if (exerciseType === 'Bodyweight') return 'Bodyweight';
                                    if (exerciseType === 'Bodyweight Loadable') return 'Total Weight';
                                    return 'Weight';
                                  };

                                  return (
                                    <div key={exIndex} className="exercise-log p-3 mb-3 bg-light rounded">
                                      <div className="d-flex justify-content-between align-items-center mb-2">
                                        <h6 className="mb-0">
                                          {exerciseName}
                                          {exerciseType && (
                                            <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                              {exerciseType}
                                            </span>
                                          )}
                                        </h6>
                                        <div>
                                          <span className="badge bg-primary me-2">
                                            Target: {ex.sets} × {ex.reps}
                                          </span>
                                        </div>
                                      </div>

                                      {exerciseLog ? (
                                        <div className="table-responsive">
                                          <table className="table table-sm">
                                            <thead>
                                              <tr>
                                                <th style={{ width: '80px' }}>Set</th>
                                                <th>Reps</th>
                                                <th>{getWeightLabel()} ({selectedProgram.weight_unit})</th>
                                                <th style={{ width: '80px' }}>Status</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {Array.from({ length: exerciseLog.sets || 0 }).map((_, setIndex) => {
                                                const weightValue = exerciseLog.weights?.[setIndex] || 0;
                                                const repsValue = exerciseLog.reps?.[setIndex] || 0;
                                                const bodyweightValue = exerciseLog.bodyweight ? parseFloat(exerciseLog.bodyweight) : 0;

                                                let displayWeight = weightValue;

                                                // Calculate display weight based on exercise type
                                                if (exerciseType === 'Bodyweight') {
                                                  displayWeight = bodyweightValue;
                                                } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                                                  displayWeight = bodyweightValue + weightValue;
                                                }

                                                return (
                                                  <tr key={setIndex}>
                                                    <td>{setIndex + 1}</td>
                                                    <td>{repsValue || '-'}</td>
                                                    <td>{displayWeight || '-'}</td>
                                                    <td>
                                                      {exerciseLog.completed?.[setIndex] ? (
                                                        <Check className="text-success" />
                                                      ) : (
                                                        <span className="text-muted">-</span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : (
                                        <div className="text-center py-2">
                                          <p className="text-muted mb-0">No data recorded</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Schedule Tab (Similar to original but enhanced) */}
          {activeTab === 'schedule' && (
            <div className="program-schedule">
              <div className="table-responsive">
                <table className="table table-hover">
                  <thead className="table-light">
                    <tr>
                      <th>Week</th>
                      <th>Day</th>
                      <th>Exercises</th>
                      <th>Status</th>
                      <th>Completion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProgram.weeklyConfigs.map((week, weekIndex) => (
                      week.map((day, dayIndex) => {
                        const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
                        const isWorkoutFinished = workoutLogs[weekKey]?.isWorkoutFinished;

                        // Calculate completion date if available
                        let completionDate = null;
                        if (isWorkoutFinished && workoutLogs[weekKey]?.completedDate) {
                          completionDate = new Date(workoutLogs[weekKey].completedDate);
                        }

                        return (
                          <tr key={`${weekIndex}-${dayIndex}`} className={isWorkoutFinished ? 'table-success' : ''}>
                            <td>Week {weekIndex + 1}</td>
                            <td>Day {dayIndex + 1}</td>
                            <td>
                              <ul className="list-unstyled mb-0">
                                {day.exercises.map((ex, exIndex) => {
                                  const exerciseName = getExerciseName(ex.exerciseId);
                                  const log = workoutLogs[weekKey]?.exercises?.[ex.exerciseId];
                                  const exercise = exercises.find(e => e.id === ex.exerciseId);
                                  const exerciseType = exercise?.exercise_type || '';

                                  return (
                                    <li key={exIndex} className="mb-1">
                                      <div className="d-flex justify-content-between">
                                        <div>
                                          <strong>{exerciseName}</strong> ({ex.sets}×{ex.reps})
                                          {exerciseType && (
                                            <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                              {exerciseType}
                                            </span>
                                          )}
                                        </div>
                                        {log && log.weights && (
                                          <div className="small">
                                            {log.weights.map((w, i) => {
                                              const weightValue = w || 0;
                                              const repsValue = log.reps?.[i] || '?';
                                              const bodyweightValue = log.bodyweight ? parseFloat(log.bodyweight) : 0;

                                              let displayWeight = weightValue;

                                              // Calculate display weight based on exercise type
                                              if (exerciseType === 'Bodyweight') {
                                                displayWeight = bodyweightValue;
                                              } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                                                displayWeight = bodyweightValue + weightValue;
                                              }

                                              return `${repsValue} @ ${displayWeight || '-'}`;
                                            }).join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </td>
                            <td>
                              {isWorkoutFinished ? (
                                <span className="badge bg-success">Completed</span>
                              ) : (
                                <span className="badge bg-secondary">Pending</span>
                              )}
                            </td>
                            <td>
                              {completionDate ? (
                                <span>{completionDate.toLocaleDateString()}</span>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal.Body>
        {/* <Modal.Footer>
          <Button variant="secondary" onClick={() => {
            setShowProgramDetails(false);
            setActiveTab('overview');
          }}>
            Close
          </Button>
        </Modal.Footer> */}
      </Modal>
    );
  };

  useEffect(() => {
    const handleResize = () => {
      // Force re-render on resize for responsive updates
      setForceUpdate(prev => !prev);
      // Update mobile state
      setIsMobile(window.innerWidth <= 767);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Effect to handle chart resizing when accordion expands
  useEffect(() => {
    const handleAccordionExpand = () => {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        handleChartResize();
      }, 150);
    };

    // Use MutationObserver to detect when accordion content becomes visible
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          const target = mutation.target;
          if (target.classList.contains('accordion-collapse') && target.classList.contains('show')) {
            handleAccordionExpand();
          }
        }
      });
    });

    // Observe all accordion collapse elements
    const accordionCollapses = document.querySelectorAll('.accordion-collapse');
    accordionCollapses.forEach(collapse => {
      observer.observe(collapse, { attributes: true });
    });

    return () => {
      observer.disconnect();
    };
  }, [activeTab, selectedProgram]);

  // Effect to handle chart rendering when Performance Metrics tab is opened
  useEffect(() => {
    if (activeTab === 'performance' && selectedProgram) {
      // Small delay to ensure DOM is fully rendered
      setTimeout(() => {
        handleChartResize();
      }, 200);
    }
  }, [activeTab, selectedProgram]);

  return (
    <Container fluid className="soft-container programs-container">
      <Row className="justify-content-center">
        <Col md={10}>
          <div className="soft-card programs-card shadow border-0">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div className="d-flex align-items-center">
                <h1 className="soft-title programs-title mb-0 me-3">My Programs</h1>
                <Badge
                  bg={isRealtimeConnected ? 'success' : 'secondary'}
                  className="d-flex align-items-center"
                >
                  <Broadcast className="me-1" size={12} />
                  {isRealtimeConnected ? 'Live' : 'Offline'}
                </Badge>
                {lastUpdate && (
                  <small className="text-muted ms-2">
                    Updated {Math.floor((Date.now() - new Date(lastUpdate.timestamp)) / 1000)}s ago
                  </small>
                )}
              </div>
              <Button
                variant="primary"
                onClick={() => navigate('/create-program')}
                className="d-flex align-items-center"
              >
                <PlusCircle className="me-2" />
                {isMobile ? 'New' : 'Create New Program'}
              </Button>
            </div>

            {/* Real-time updates notifications */}
            {newExercises.length > 0 && (
              <Alert variant="info" className="mb-3" dismissible onClose={clearNewExercises}>
                <div className="d-flex align-items-center">
                  <GraphUp className="me-2" />
                  <span>
                    {newExercises.length} new exercise{newExercises.length !== 1 ? 's' : ''} added: {' '}
                    {newExercises.slice(0, 2).map(ex => ex.name).join(', ')}
                    {newExercises.length > 2 && ` and ${newExercises.length - 2} more`}
                  </span>
                </div>
              </Alert>
            )}

            {updatedExercises.length > 0 && (
              <Alert variant="warning" className="mb-3" dismissible onClose={clearUpdatedExercises}>
                <div className="d-flex align-items-center">
                  <Pencil className="me-2" />
                  <span>
                    {updatedExercises.length} exercise{updatedExercises.length !== 1 ? 's' : ''} updated: {' '}
                    {updatedExercises.slice(0, 2).map(ex => ex.name).join(', ')}
                    {updatedExercises.length > 2 && ` and ${updatedExercises.length - 2} more`}
                  </span>
                </div>
              </Alert>
            )}

            {isLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="spinner-blue" />
                <p className="soft-text mt-2">Loading...</p>
              </div>
            ) : (
              <>
                {userPrograms.length === 0 ? (
                  <div className="text-center p-4">
                    <p className="text-muted mb-3">
                      You haven't created any programs yet.
                      Get started by creating a new workout program!
                    </p>
                    <Button
                      variant="primary"
                      size="lg"
                      onClick={() => navigate('/create-program')}
                    >
                      <PlusCircle className="me-2" /> Create First Program
                    </Button>
                  </div>
                ) : (
                  userPrograms.map(program => renderProgramCard(program))
                )}

                <h2 className="soft-subtitle section-title mt-5 mb-3">Template Programs</h2>
                {templatePrograms.map(program => renderProgramCard(program, true))}
              </>
            )}
          </div>
        </Col>
      </Row>

      {renderProgramDetailsModal()}
    </Container>
  );
}

export default Programs;