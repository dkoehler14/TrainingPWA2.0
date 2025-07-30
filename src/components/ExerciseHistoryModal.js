import React, { useState, useEffect, useContext } from 'react';
import { Modal, Button, Spinner } from 'react-bootstrap';
import { AuthContext } from '../context/AuthContext';
import { getCollectionCached } from '../api/supabaseCacheMigration';
import {
  groupExerciseHistoryBySessions,
  formatWeightDisplay,
  formatSessionSummary,
  isValidHistoryData,
  getEmptyStateConfig
} from '../utils/exerciseHistoryUtils';
import '../styles/ExerciseHistoryCards.css';

/**
 * Reusable Exercise History Modal Component
 * Used by both LogWorkout and QuickWorkout pages
 */
function ExerciseHistoryModal({
  show,
  onHide,
  exercise,
  exercisesList,
  weightUnit = 'LB'
}) {
  const [historyData, setHistoryData] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const { user, isAuthenticated } = useContext(AuthContext);

  // Fetch exercise history when modal opens
  useEffect(() => {
    if (show && exercise && user) {
      fetchExerciseHistory(exercise.exerciseId);
    }
  }, [show, exercise, user]);

  const fetchExerciseHistory = async (exerciseId) => {
    if (!user || !exerciseId) return;

    setIsLoadingHistory(true);
    try {
      // Query for all workout logs that contain this exercise
      const logsData = await getCollectionCached(
        'workoutLogs',
        {
          where: [
            ['userId', '==', user.id],
            ['isWorkoutFinished', '==', true]
          ],
          orderBy: [['date', 'desc']],
          limit: 50
        },
        15 * 60 * 1000 // 15 minute cache
      );

      console.log(`Found ${logsData.length} workout logs`);

      const historyData = [];

      // Get the current exercise to determine its type
      const currentExercise = exercisesList.find(e => e.id === exerciseId);
      const exerciseType = currentExercise?.exerciseType || '';

      logsData.forEach(log => {
        // Find the exercise in this log
        const exerciseInLog = log.exercises.find(ex => ex.exerciseId === exerciseId);

        if (exerciseInLog) {
          for (let setIndex = 0; setIndex < exerciseInLog.weights.length; setIndex++) {
            if (Array.isArray(exerciseInLog.completed) && exerciseInLog.completed[setIndex] === true) {
              const weight = exerciseInLog.weights[setIndex];
              const reps = exerciseInLog.reps[setIndex];
              const bodyweight = exerciseInLog.bodyweight;

              const weightValue = weight === '' || weight === null ? 0 : Number(weight);
              const repsValue = reps === '' || reps === null ? 0 : Number(reps);
              const bodyweightValue = bodyweight ? Number(bodyweight) : 0;

              if (weightValue === 0 && repsValue === 0) continue;

              if (!isNaN(weightValue) && !isNaN(repsValue)) {
                // Calculate total weight based on exercise type
                let totalWeight = weightValue;
                let displayWeight = weightValue;

                if (exerciseType === 'Bodyweight') {
                  totalWeight = bodyweightValue;
                  displayWeight = bodyweightValue;
                } else if (exerciseType === 'Bodyweight Loadable' && bodyweightValue > 0) {
                  totalWeight = bodyweightValue + weightValue;
                  displayWeight = `${bodyweightValue} + ${weightValue} = ${totalWeight}`;
                }

                historyData.push({
                  date: log.completedDate?.toDate ? log.completedDate.toDate() : 
                        log.completedDate || 
                        log.date?.toDate ? log.date.toDate() : log.date,
                  week: log.weekIndex ? log.weekIndex + 1 : null,
                  day: log.dayIndex ? log.dayIndex + 1 : null,
                  workoutName: log.name || (log.weekIndex !== undefined && log.dayIndex !== undefined ? 
                    `W${log.weekIndex + 1} D${log.dayIndex + 1}` : 'Quick Workout'),
                  set: setIndex + 1,
                  weight: weightValue,
                  totalWeight: totalWeight,
                  displayWeight: displayWeight,
                  reps: repsValue,
                  completed: true,
                  bodyweight: bodyweightValue,
                  exerciseType: exerciseType
                });
              }
            }
          }
        }
      });

      // Sort by date (most recent first)
      historyData.sort((a, b) => b.date - a.date);
      
      // Group the data into workout sessions
      const groupedSessions = groupExerciseHistoryBySessions(historyData);
      setHistoryData(groupedSessions);
    } catch (error) {
      console.error("Error fetching exercise history: ", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const exerciseName = exercise && exercisesList.find(e => e.id === exercise.exerciseId)?.name || 'Exercise';

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      centered
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {exerciseName} History
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isLoadingHistory ? (
          <div className="text-center py-3">
            <Spinner animation="border" className="spinner-blue" />
            <p className="mt-2">Loading history...</p>
          </div>
        ) : isValidHistoryData(historyData) ? (
          <div className="exercise-history-cards">
            {historyData.map((session, sessionIndex) => (
              <div key={sessionIndex} className="session-card">
                <div className="session-header">
                  <div className="prominent-date-header">
                    {session.date.toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                  <div className="session-summary">
                    {formatSessionSummary(session, weightUnit)}
                  </div>
                </div>
                <div className="sets-container">
                  {session.sets.map((set, setIndex) => (
                    <div key={setIndex} className="set-chip">
                      <span className="set-number">{set.setNumber}</span>
                      <span className="set-weight">
                        {formatWeightDisplay(set, session.exerciseType, weightUnit)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Modern Performance Summary */}
            {historyData.length > 0 && (
              <div className="modern-performance-summary">
                <div className="summary-header">
                  <h5 className="summary-title">📊 Performance Overview</h5>
                  <span className="summary-subtitle">Based on your recent sessions</span>
                </div>
                <div className="stats-grid">
                  {(() => {
                    // Flatten all sets from all sessions for calculations
                    const allSets = historyData.flatMap(session => session.sets);
                    const exerciseType = historyData[0]?.exerciseType;
                    const weightLabel = exerciseType === 'Bodyweight' ? 'Bodyweight' : 'Weight';
                    
                    const maxWeight = Math.max(...allSets.map(set => set.totalWeight || set.weight || 0));
                    const maxReps = Math.max(...allSets.map(set => set.reps || 0));
                    const avgWeight = (allSets.reduce((sum, set) => sum + (set.totalWeight || set.weight || 0), 0) / allSets.length).toFixed(1);
                    const avgReps = (allSets.reduce((sum, set) => sum + (set.reps || 0), 0) / allSets.length).toFixed(1);
                    
                    return (
                      <>
                        <div className="stat-card highlight">
                          <div className="stat-icon">🏆</div>
                          <div className="stat-content">
                            <div className="stat-value">{maxWeight}</div>
                            <div className="stat-label">Peak {weightLabel}</div>
                          </div>
                        </div>
                        <div className="stat-card highlight">
                          <div className="stat-icon">🔥</div>
                          <div className="stat-content">
                            <div className="stat-value">{maxReps}</div>
                            <div className="stat-label">Max Reps</div>
                          </div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon">📈</div>
                          <div className="stat-content">
                            <div className="stat-value">{avgWeight}</div>
                            <div className="stat-label">Avg {weightLabel}</div>
                          </div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-icon">🎯</div>
                          <div className="stat-content">
                            <div className="stat-value">{avgReps}</div>
                            <div className="stat-label">Avg Reps</div>
                          </div>
                        </div>
                        {exerciseType === 'Bodyweight Loadable' && allSets.some(set => (set.weight || 0) > 0) && (
                          <div className="stat-card additional-weight">
                            <div className="stat-icon">➕</div>
                            <div className="stat-content">
                              <div className="stat-value">
                                {(allSets.filter(set => (set.weight || 0) > 0).reduce((sum, set) => sum + (set.weight || 0), 0) / allSets.filter(set => (set.weight || 0) > 0).length).toFixed(1)}
                              </div>
                              <div className="stat-label">Avg Added Weight</div>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="exercise-history-empty">
            {(() => {
              const emptyConfig = getEmptyStateConfig('no-history', exerciseName);
              return (
                <div className="empty-state">
                  <div className="empty-icon">{emptyConfig.icon}</div>
                  <h6 className="empty-title">{emptyConfig.title}</h6>
                  <p className="empty-message">{emptyConfig.message}</p>
                </div>
              );
            })()}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default ExerciseHistoryModal;