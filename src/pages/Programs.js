import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Modal, Spinner, Accordion } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc, orderBy } from 'firebase/firestore';
import { Trash, Star, Copy, FileText, Clock, Check, PlusCircle, Pencil } from 'react-bootstrap-icons';
import '../styles/Programs.css';
import { getCollectionCached, invalidateCache } from '../api/firestoreCache';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function Programs() {
  const [userPrograms, setUserPrograms] = useState([]);
  const [predefinedPrograms, setPredefinedPrograms] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [showProgramDetails, setShowProgramDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState({});
  const [activeTab, setActiveTab] = useState('overview');
  const user = auth.currentUser;
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        setIsLoading(true);
        try {
          // Fetch user programs
          const userProgramsData = await getCollectionCached(
            'programs',
            {
              where: [
                ['userId', '==', user.uid],
                ['isPredefined', '==', false]
              ],
              orderBy: [['createdAt', 'desc']]
            }
          );
          setUserPrograms(userProgramsData.map(doc => ({
            ...doc,
            weeklyConfigs: parseWeeklyConfigs(doc.weeklyConfigs, doc.duration, doc.daysPerWeek)
          })));

          // Fetch predefined programs
          const predefinedProgramsData = await getCollectionCached(
            'programs',
            {
              where: [
                ['isPredefined', '==', true]
              ]
            }
          );
          setPredefinedPrograms(predefinedProgramsData.map(doc => ({
            ...doc,
            weeklyConfigs: parseWeeklyConfigs(doc.weeklyConfigs, doc.duration, doc.daysPerWeek)
          })));

          // Fetch exercises
          const exercisesData = await getCollectionCached('exercises');
          setExercises(exercisesData);
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
    // eslint-disable-next-line
  }, [user]);

  const parseWeeklyConfigs = (flattenedConfigs, duration, daysPerWeek) => {
    const weeklyConfigs = Array.from({ length: duration }, () =>
      Array.from({ length: daysPerWeek }, () => ({ exercises: [] }))
    );

    for (let key in flattenedConfigs) {
      if (flattenedConfigs.hasOwnProperty(key)) {
        const match = key.match(/week(\d+)_day(\d+)_exercises/);
        if (match) {
          const weekIndex = parseInt(match[1], 10) - 1;
          const dayIndex = parseInt(match[2], 10) - 1;
          weeklyConfigs[weekIndex][dayIndex].exercises = flattenedConfigs[key];
        }
      }
    }

    return weeklyConfigs;
  };

  const getExerciseName = (exerciseId) => {
    return exercises.find(ex => ex.id === exerciseId)?.name || 'Unknown';
  };

  const adoptProgram = async (program) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "programs"), {
        userId: user.uid,
        isPredefined: false,
        name: `${program.name} (Adopted)`,
        duration: program.duration,
        daysPerWeek: program.daysPerWeek,
        weightUnit: program.weightUnit || 'LB',
        weeklyConfigs: program.weeklyConfigs,
        createdAt: new Date(),
        isCurrent: false
      });
      invalidateCache('programs');
      alert('Program adopted successfully!');
    } catch (error) {
      console.error("Error adopting program: ", error);
    }
  };

  const deleteProgram = async (programId) => {
    if (!window.confirm('Are you sure you want to delete this program?')) return;

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "programs", programId));
      setUserPrograms(userPrograms.filter(p => p.id !== programId));
      invalidateCache('programs');
      alert('Program deleted successfully!');
    } catch (error) {
      console.error("Error deleting program: ", error);
      alert('Failed to delete program');
    } finally {
      setIsDeleting(false);
    }
  };

  const setCurrentProgram = async (programId) => {
    if (!user) return;

    try {
      // First, set all user's programs to not current
      const userProgramsData = await getCollectionCached(
        'programs',
        {
          where: [
            ['userId', '==', user.uid],
            ['isPredefined', '==', false]
          ]
        }
      );
      // Batch update to set all programs to not current
      const batch = [];
      userProgramsData.forEach(programDoc => {
        const updatePromise = updateDoc(doc(db, "programs", programDoc.id), {
          isCurrent: false
        });
        batch.push(updatePromise);
      });
      await Promise.all(batch);
      await updateDoc(doc(db, "programs", programId), {
        isCurrent: true
      });
      invalidateCache('programs');
      setUserPrograms(userPrograms.map(program => ({
        ...program,
        isCurrent: program.id === programId
      })));
      alert('Current program updated successfully!');
    } catch (error) {
      console.error("Error setting current program: ", error);
      alert('Failed to update current program');
    }
  };

  const fetchWorkoutLogs = async (program) => {
    if (!user) return {};

    try {
      const logsQuery = query(
        collection(db, "workoutLogs"),
        where("userId", "==", user.uid),
        where("programId", "==", program.id)
      );

      const logsSnapshot = await getDocs(logsQuery);

      const logs = {};
      logsSnapshot.docs.forEach(logDoc => {
        const log = logDoc.data();
        const key = `week${log.weekIndex + 1}_day${log.dayIndex + 1}`;

        if (!logs[key]) {
          logs[key] = {
            exercises: {},
            isWorkoutFinished: log.isWorkoutFinished || false
          };
        }

        log.exercises.forEach(ex => {
          logs[key].exercises[ex.exerciseId] = ex;
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
                      {log.reps[index]} reps @ {log.weights[index] || 'N/A'} {selectedProgram.weightUnit || 'LB'}
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

  const renderActionButtons = (program, isPredefined) => {
    const isMobile = window.innerWidth <= 767;
    
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
          
          {!isPredefined ? (
            <>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handleEditProgram(program.id)}
                className="w-100"
              >
                <Pencil className="me-1" /> Edit
              </Button>
              {!program.isCurrent && (
                <Button
                  variant="outline-success"
                  size="sm"
                  onClick={() => setCurrentProgram(program.id)}
                  className="w-100"
                >
                  <Clock className="me-1" /> Set Current
                </Button>
              )}
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => deleteProgram(program.id)}
                disabled={isDeleting}
                className="w-100"
              >
                <Trash className="me-1" /> Delete
              </Button>
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
    
    // Desktop layout (existing code)
    return (
      <div className="d-flex gap-2">
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => viewProgramDetails(program)}
        >
          <FileText className="me-1" /> Details
        </Button>
        
        {!isPredefined ? (
          <>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => handleEditProgram(program.id)}
            >
              <Pencil className="me-1" /> Edit
            </Button>
            {!program.isCurrent && (
              <Button
                variant="outline-success"
                size="sm"
                onClick={() => setCurrentProgram(program.id)}
              >
                <Clock className="me-1" /> Set Current
              </Button>
            )}
            <Button
              variant="outline-danger"
              size="sm"
              onClick={() => deleteProgram(program.id)}
              disabled={isDeleting}
            >
              <Trash className="me-1" /> Delete
            </Button>
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

  const renderProgramCard = (program, isPredefined = false) => {
    return (
      <Card key={program.id} className="mb-3 program-card">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <Card.Title>{program.name}</Card.Title>
              <Card.Subtitle className="text-muted mb-2">
                {program.duration} weeks | {program.daysPerWeek} days/week
              </Card.Subtitle>
            </div>
            {program.isCurrent && !isPredefined && (
              <Star className="text-warning" size={24} />
            )}
          </div>

          <div className="d-flex justify-content-between align-items-center mt-3">
            {renderActionButtons(program, isPredefined)}
          </div>
        </Card.Body>
      </Card>
    );
  };

  // Enhanced Program Details Modal (from Claude)
  const renderProgramDetailsModal = () => {
    if (!selectedProgram) return null;
    
    const isMobile = window.innerWidth <= 767;
    
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

    // Calculate exercise performance metrics
    const calculateExerciseMetrics = () => {
      const exerciseMetrics = {};

      // Collect all exercise data from logs
      Object.keys(workoutLogs).forEach(weekKey => {
        if (workoutLogs[weekKey]?.exercises) {
          Object.keys(workoutLogs[weekKey].exercises).forEach(exerciseId => {
            const exerciseLog = workoutLogs[weekKey].exercises[exerciseId];

            if (!exerciseMetrics[exerciseId]) {
              exerciseMetrics[exerciseId] = {
                name: getExerciseName(exerciseId),
                sessions: [],
                maxWeight: 0,
                totalVolume: 0,
                progressTrend: []
              };
            }

            if (exerciseLog.weights && exerciseLog.reps) {
              const sessionMaxWeight = Math.max(...exerciseLog.weights.filter(w => !isNaN(parseFloat(w))).map(w => parseFloat(w)) || [0]);
              const sessionVolume = exerciseLog.weights.reduce((total, weight, idx) => {
                return total + (parseFloat(weight) || 0) * (exerciseLog.reps[idx] || 0);
              }, 0);

              // Extract week and day from the key (week1_day1)
              const [weekPart, dayPart] = weekKey.split('_');
              const weekNum = parseInt(weekPart.replace('week', ''));
              const dayNum = parseInt(dayPart.replace('day', ''));

              exerciseMetrics[exerciseId].sessions.push({
                weekNum,
                dayNum,
                weights: exerciseLog.weights,
                reps: exerciseLog.reps,
                maxWeight: sessionMaxWeight,
                volume: sessionVolume
              });

              exerciseMetrics[exerciseId].maxWeight = Math.max(exerciseMetrics[exerciseId].maxWeight, sessionMaxWeight);
              exerciseMetrics[exerciseId].totalVolume += sessionVolume;

              // Add to progress trend for charting
              exerciseMetrics[exerciseId].progressTrend.push({
                session: exerciseMetrics[exerciseId].sessions.length,
                maxWeight: sessionMaxWeight,
                volume: sessionVolume
              });
            }
          });
        }
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
                {selectedProgram.duration} weeks | {selectedProgram.daysPerWeek} days per week | {selectedProgram.weightUnit || 'LB'}
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

                                return (
                                  <div key={exIndex} className="exercise-item p-2 mb-2 bg-light rounded">
                                    <div className="d-flex justify-content-between align-items-center">
                                      <div>
                                        <strong>{exerciseName}</strong>
                                        <div className="text-muted small">
                                          Target: {ex.sets} sets × {ex.reps} reps
                                        </div>
                                      </div>
                                    </div>

                                    {/* Display logs if completed */}
                                    {exerciseLog && (
                                      <div className="mt-2 exercise-log-details">
                                        <div className="sets-completed">
                                          {Array.from({ length: exerciseLog.sets || 0 }).map((_, setIndex) => (
                                            <div key={setIndex} className="set-data d-flex justify-content-between p-1 border-bottom">
                                              <span>Set {setIndex + 1}:</span>
                                              <span>
                                                <strong>{exerciseLog.reps?.[setIndex] || '-'}</strong> reps @
                                                <strong> {exerciseLog.weights?.[setIndex] || '-'}</strong> {selectedProgram.weightUnit}
                                                {exerciseLog.completed?.[setIndex] &&
                                                  <Check className="text-success ms-1" size={14} />
                                                }
                                              </span>
                                            </div>
                                          ))}
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
                              {exerciseMetrics.slice(0, 5).map((exercise, index) => (
                                <tr key={index}>
                                  <td>{exercise.name}</td>
                                  <td>{exercise.sessions.length}</td>
                                  <td>{exercise.maxWeight} {selectedProgram.weightUnit}</td>
                                  <td>{Math.round(exercise.totalVolume)} {selectedProgram.weightUnit}</td>
                                </tr>
                              ))}
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
                            {exerciseMetrics.map((exercise, index) => (
                              <Accordion.Item eventKey={index.toString()} key={index} className="mb-3">
                                <Accordion.Header>
                                  <div className="d-flex flex-column flex-md-row w-100 justify-content-between align-items-md-center">
                                    <span className="fw-bold">{exercise.name}</span>
                                    <div className="d-flex gap-3 mt-2 mt-md-0">
                                      <span className="metric-box"><span className="metric-value">{exercise.maxWeight}</span> <span className="metric-label">Max Weight ({selectedProgram.weightUnit})</span></span>
                                      <span className="metric-box"><span className="metric-value">{exercise.sessions.length}</span> <span className="metric-label">Sessions</span></span>
                                      <span className="metric-box"><span className="metric-value">{Math.round(exercise.totalVolume)}</span> <span className="metric-label">Total Volume</span></span>
                                    </div>
                                  </div>
                                </Accordion.Header>
                                <Accordion.Body>
                                  {exercise.sessions.length > 1 && (
                                    <div className="progression-chart mb-4" style={{ overflowX: 'auto' }}>
                                      <h6 className="mb-2">Progression Chart</h6>
                                      <div className="chart-container" style={{ minWidth: 320, width: '100%', maxWidth: '100%' }}>
                                        {/* Responsive Line chart for progression */}
                                        <Line
                                          data={{
                                            labels: exercise.progressTrend.map((session, idx) => `Session ${session.session}`),
                                            datasets: [
                                              {
                                                label: `Max Weight (${selectedProgram.weightUnit})`,
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
                                                label: `Total Volume (${selectedProgram.weightUnit})`,
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
                                              legend: { display: true, position: 'top', labels: { font: { size: window.innerWidth <= 767 ? 10 : 14 } } },
                                              title: { display: false }
                                            },
                                            scales: {
                                              x: {
                                                title: { display: true, text: 'Session', font: { size: window.innerWidth <= 767 ? 10 : 14 } },
                                                ticks: { font: { size: window.innerWidth <= 767 ? 9 : 12 } }
                                              },
                                              y1: {
                                                type: 'linear',
                                                display: true,
                                                position: 'left',
                                                title: { display: true, text: `Max Weight (${selectedProgram.weightUnit})`, font: { size: window.innerWidth <= 767 ? 10 : 14 } },
                                                beginAtZero: true,
                                                grid: { drawOnChartArea: true },
                                                ticks: { font: { size: window.innerWidth <= 767 ? 9 : 12 } }
                                              },
                                              y2: {
                                                type: 'linear',
                                                display: true,
                                                position: 'right',
                                                title: { display: true, text: `Total Volume (${selectedProgram.weightUnit})`, font: { size: window.innerWidth <= 767 ? 10 : 14 } },
                                                beginAtZero: true,
                                                grid: { drawOnChartArea: false },
                                                ticks: { font: { size: window.innerWidth <= 767 ? 9 : 12 } }
                                              }
                                            }
                                          }}
                                          height={window.innerWidth <= 767 ? 200 : 300}
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
                                          <th>Weights ({selectedProgram.weightUnit})</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {exercise.sessions.sort((a, b) => {
                                          if (a.weekNum !== b.weekNum) return a.weekNum - b.weekNum;
                                          return a.dayNum - b.dayNum;
                                        }).map((session, sessionIdx) => {
                                          const setsReps = session.weights.map((_, i) =>
                                            `${session.reps[i] || '-'}`
                                          ).join(' / ');

                                          const weights = session.weights.join(' / ');

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
                            ))}
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

                                  return (
                                    <div key={exIndex} className="exercise-log p-3 mb-3 bg-light rounded">
                                      <div className="d-flex justify-content-between align-items-center mb-2">
                                        <h6 className="mb-0">{exerciseName}</h6>
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
                                                <th>Weight ({selectedProgram.weightUnit})</th>
                                                <th style={{ width: '80px' }}>Status</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {Array.from({ length: exerciseLog.sets || 0 }).map((_, setIndex) => (
                                                <tr key={setIndex}>
                                                  <td>{setIndex + 1}</td>
                                                  <td>{exerciseLog.reps?.[setIndex] || '-'}</td>
                                                  <td>{exerciseLog.weights?.[setIndex] || '-'}</td>
                                                  <td>
                                                    {exerciseLog.completed?.[setIndex] ? (
                                                      <Check className="text-success" />
                                                    ) : (
                                                      <span className="text-muted">-</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
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
                        if (isWorkoutFinished && workoutLogs[weekKey]?.completedAt) {
                          completionDate = new Date(workoutLogs[weekKey].completedAt.toDate());
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

                                  return (
                                    <li key={exIndex} className="mb-1">
                                      <div className="d-flex justify-content-between">
                                        <div>
                                          <strong>{exerciseName}</strong> ({ex.sets}×{ex.reps})
                                        </div>
                                        {log && log.weights && (
                                          <div className="small">
                                            {log.weights.map((w, i) => `${log.reps?.[i] || '?'} @ ${w || '-'}`).join(', ')}
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
        <Modal.Footer>
          <Button variant="secondary" onClick={() => {
            setShowProgramDetails(false);
            setActiveTab('overview');
          }}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    );
  };

  useEffect(() => {
    const handleResize = () => {
      // Force re-render on resize for responsive updates
      setForceUpdate(prev => !prev);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <Container fluid className="soft-container programs-container">
      <Row className="justify-content-center">
        <Col md={10}>
          <div className="soft-card programs-card shadow border-0">
            <h1 className="soft-title programs-title text-center mb-4">My Programs</h1>

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
                {predefinedPrograms.map(program => renderProgramCard(program, true))}
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