import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Spinner } from 'react-bootstrap';
import { db, auth } from '../firebase';
import '../styles/Progress4.css';
import { getCollectionCached, getAllExercisesMetadata, getDocCached, warmUserCache } from '../api/enhancedFirestoreCache';

// Utility functions
const calculateVolume = (sets, reps, weights) => {
    return reps.reduce((total, rep, index) => {
        const weight = Number(weights[index]) || 0;
        return total + (Number(rep) * weight);
      }, 0);
};

const estimate1RM = (weight, reps) => {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (r === 1) return w;
  return w * (1 + r / 30);
};

const getProgressiveOverloadData = (logs, exerciseId) => {
  const exerciseLogs = logs
    .filter(log => log.exercises.some(ex => ex.exerciseId === exerciseId))
    .sort((a, b) => a.date - b.date);
  return exerciseLogs.map(log => {
    const ex = log.exercises.find(ex => ex.exerciseId === exerciseId);
    const volume = calculateVolume(ex.sets, ex.reps, ex.weights);
    return { date: log.date.toDate().toLocaleString(), volume };
  });
};

const getMuscleGroupVolume = (logs, exercises) => {
  const muscleGroupVolume = {};
  logs.forEach(log => {
    log.exercises.forEach(ex => {
      const exercise = exercises.find(e => e.id === ex.exerciseId);
      if (exercise) {
        const volume = calculateVolume(ex.sets, ex.reps, ex.weights);
        const primary = exercise.primaryMuscleGroup;
        if (primary) {
          muscleGroupVolume[primary] = (muscleGroupVolume[primary] || 0) + volume;
        }
        exercise.secondaryMuscleGroups?.forEach(muscle => {
          muscleGroupVolume[muscle] = (muscleGroupVolume[muscle] || 0) + volume * 0.5; // Half weight for secondary
        });
      }
    });
  });
  return muscleGroupVolume;
};

const getPersonalRecords = (logs, exercises) => {
  const prs = {};
  logs.forEach(log => {
    log.exercises.forEach(ex => {
      const exName = exercises.find(e => e.id === ex.exerciseId)?.name || ex.exerciseId;
      if (!prs[exName]) prs[exName] = {};
      ex.weights.forEach((weight, i) => {
        const reps = ex.reps[i];
        const w = Number(weight) || 0;
        if (w > (prs[exName][reps] || 0)) prs[exName][reps] = w;
      });
    });
  });
  return prs;
};

function Progress4() {
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [timePeriod, setTimePeriod] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const user = auth.currentUser;
      setIsLoading(true);
      if (!user?.uid) {
        setIsLoading(false);
        return;
      }

      try {
        // Enhanced cache warming before data fetching
        await warmUserCache(user.uid, 'normal')
          .then(() => {
            console.log('Cache warming completed for Progress4');
          })
          .catch((error) => {
            console.warn('Cache warming failed, proceeding with data fetch:', error);
          });

        const logsData = await getCollectionCached('workoutLogs', { where: [['userId', '==', user.uid]] });
        setWorkoutLogs(logsData);

        // Use metadata approach for efficient exercise fetching
        let exercisesData = [];
        try {
          // Get global exercises from metadata
          const globalExercises = await getAllExercisesMetadata(60 * 60 * 1000); // 1 hour TTL
          
          // Get user-specific exercises from metadata
          const userExercisesDoc = await getDocCached('exercises_metadata', user.uid, 60 * 60 * 1000);
          const userExercises = userExercisesDoc?.exercises || [];
          
          // Combine global and user exercises
          const allExercises = [...globalExercises, ...userExercises];
          
          // Add source metadata for consistency
          exercisesData = allExercises.map(exercise => ({
            ...exercise,
            source: globalExercises.includes(exercise) ? 'global' : 'user'
          }));
          
          // Remove duplicates based on ID (user exercises override global ones)
          const uniqueExercises = [];
          const seenIds = new Set();
          
          // Process user exercises first (higher priority)
          exercisesData.filter(ex => ex.source === 'user').forEach(exercise => {
            if (!seenIds.has(exercise.id)) {
              uniqueExercises.push(exercise);
              seenIds.add(exercise.id);
            }
          });
          
          // Then process global exercises
          exercisesData.filter(ex => ex.source === 'global').forEach(exercise => {
            if (!seenIds.has(exercise.id)) {
              uniqueExercises.push(exercise);
              seenIds.add(exercise.id);
            }
          });
          
          exercisesData = uniqueExercises;
        } catch (error) {
          console.warn('Failed to fetch exercises using metadata approach, falling back to collection:', error);
          // Fallback to original method
          exercisesData = await getCollectionCached('exercises', {}, 60 * 60 * 1000);
        }
        
        setExercises(exercisesData);
      } catch (error) {
        console.error("Error fetching data: ", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter logs by time period
  const filteredLogs = workoutLogs.filter(log => {
    if (timePeriod === 'all') return true;
    const now = new Date();
    const logDate = log.date.toDate();
    if (timePeriod === 'month') return now - logDate < 30 * 24 * 60 * 60 * 1000;
    if (timePeriod === '3months') return now - logDate < 90 * 24 * 60 * 60 * 1000;
    return true;
  });

  const progressiveData = selectedExercise ? getProgressiveOverloadData(filteredLogs, selectedExercise) : [];
  const muscleVolume = getMuscleGroupVolume(filteredLogs, exercises);
  const prs = getPersonalRecords(filteredLogs, exercises);

  useEffect(() => {
    if (window.Chart) {
      // Progressive Overload Chart
      const ctx1 = document.getElementById('progressiveChart')?.getContext('2d');
      if (ctx1) {
        new window.Chart(ctx1, {
          type: 'line',
          data: {
            labels: progressiveData.map(d => d.date),
            datasets: [{
              label: 'Volume',
              data: progressiveData.map(d => d.volume),
              borderColor: '#007bff',
              fill: false
            }]
          },
          options: { scales: { x: { title: { display: true, text: 'Date' } }, y: { title: { display: true, text: 'Volume' } } } }
        });
      }

      // Muscle Group Volume Chart
      const ctx2 = document.getElementById('volumeChart')?.getContext('2d');
      if (ctx2) {
        new window.Chart(ctx2, {
          type: 'bar',
          data: {
            labels: Object.keys(muscleVolume),
            datasets: [{
              label: 'Volume',
              data: Object.values(muscleVolume),
              backgroundColor: '#007bff'
            }]
          },
          options: { scales: { y: { title: { display: true, text: 'Volume' } } } }
        });
      }
    }
  }, [progressiveData, muscleVolume]);

  return (
    <Container fluid className="soft-container analytics-container">
      <Row className="justify-content-center">
        <Col md={10}>
          {isLoading ? (
            <div className="text-center py-4">
              <Spinner animation="border" className="spinner-blue" />
              <p className="soft-text mt-2">Loading...</p>
            </div>
          ) : (
            <div className="soft-card analytics-card shadow border-0">
              <h1 className="soft-title analytics-title text-center mb-4">Progress</h1>
              <Form.Group className="mb-3">
                <Form.Label>Time Period</Form.Label>
                <Form.Select value={timePeriod} onChange={e => setTimePeriod(e.target.value)} className="soft-input">
                  <option value="all">All Time</option>
                  <option value="month">Last Month</option>
                  <option value="3months">Last 3 Months</option>
                </Form.Select>
              </Form.Group>

              <Row>
                <Col md={6}>
                  <h2>Progressive Overload</h2>
                  <Form.Select
                    value={selectedExercise}
                    onChange={e => setSelectedExercise(e.target.value)}
                    className="soft-input mb-3"
                  >
                    <option value="">Select Exercise</option>
                    {exercises.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </Form.Select>
                  {selectedExercise && <canvas id="progressiveChart" height="200"></canvas>}
                </Col>
                <Col md={6}>
                  <h2>Muscle Group Volume</h2>
                  <canvas id="volumeChart" height="200"></canvas>
                </Col>
              </Row>

              <Row className="mt-4">
                <Col>
                  <h2>Personal Records</h2>
                  <table className="progress4-table">
                    <thead>
                      <tr>
                        <th>Exercise</th>
                        <th>Reps</th>
                        <th>Weight</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(prs).map(([exercise, records]) =>
                        Object.entries(records).map(([reps, weight], idx) => (
                          <tr key={`${exercise}-${reps}-${idx}`}>
                            <td>{exercise}</td>
                            <td>{reps}</td>
                            <td>{weight} {workoutLogs[0]?.weightUnit || 'LB'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </Col>
              </Row>
            </div>
          )}
        </Col>
      </Row>
    </Container>
  );
}

export default Progress4;