import React, { useState, useEffect, useContext } from 'react';
import { Container, Row, Col, Form, Spinner } from 'react-bootstrap';
import { AuthContext } from '../context/AuthContext';
import '../styles/Progress4.css';
import { getCollectionCached, getAllExercisesMetadata, getDocCached, warmUserCache } from '../api/supabaseCacheMigration';

// Utility functions
const calculateVolume = (sets, reps, weights) => {
  if (!reps || !Array.isArray(reps) || !weights || !Array.isArray(weights)) return 0;
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
    .filter(log => log.exercises && Array.isArray(log.exercises) && log.exercises.some(ex => ex && ex.exerciseId === exerciseId))
    .sort((a, b) => a.date - b.date);
  return exerciseLogs.map(log => {
    if (!log.exercises || !Array.isArray(log.exercises)) return { date: '', volume: 0 };
    const ex = log.exercises.find(ex => ex && ex.exerciseId === exerciseId);
    if (!ex) return { date: '', volume: 0 };
    const volume = calculateVolume(ex.sets, ex.reps, ex.weights);
    const dateStr = log.date && log.date.toDate ? log.date.toDate().toLocaleString() : '';
    return { date: dateStr, volume };
  });
};

const getMuscleGroupVolume = (logs, exercises) => {
  const muscleGroupVolume = {};
  logs.forEach(log => {
    if (!log.exercises || !Array.isArray(log.exercises)) return;
    log.exercises.forEach(ex => {
      if (!ex || !ex.exerciseId) return;
      const exercise = exercises.find(e => e.id === ex.exerciseId);
      if (exercise) {
        const volume = calculateVolume(ex.sets, ex.reps, ex.weights);
        const primary = exercise.primary_muscle_group || exercise.primaryMuscleGroup;
        if (primary) {
          muscleGroupVolume[primary] = (muscleGroupVolume[primary] || 0) + volume;
        }
        const secondaryGroups = exercise.secondary_muscle_groups || exercise.secondaryMuscleGroups;
        if (secondaryGroups && Array.isArray(secondaryGroups)) {
          secondaryGroups.forEach(muscle => {
            muscleGroupVolume[muscle] = (muscleGroupVolume[muscle] || 0) + volume * 0.5; // Half weight for secondary
          });
        }
      }
    });
  });
  return muscleGroupVolume;
};

const getPersonalRecords = (logs, exercises) => {
  const prs = {};
  logs.forEach(log => {
    if (!log.exercises || !Array.isArray(log.exercises)) return;
    log.exercises.forEach(ex => {
      if (!ex || !ex.exerciseId || !ex.weights || !Array.isArray(ex.weights) || !ex.reps || !Array.isArray(ex.reps)) return;
      const exName = exercises.find(e => e.id === ex.exerciseId)?.name || ex.exerciseId;
      if (!prs[exName]) prs[exName] = {};
      ex.weights.forEach((weight, i) => {
        const reps = ex.reps[i];
        if (reps !== undefined) {
          const w = Number(weight) || 0;
          if (w > (prs[exName][reps] || 0)) prs[exName][reps] = w;
        }
      });
    });
  });
  return prs;
};

function Progress4() {
  const { user, isAuthenticated } = useContext(AuthContext);
  const [workoutLogs, setWorkoutLogs] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [timePeriod, setTimePeriod] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      if (!user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        // Enhanced cache warming before data fetching
        await warmUserCache(user.id, 'normal')
          .then(() => {
            console.log('Cache warming completed for Progress4');
          })
          .catch((error) => {
            console.warn('Cache warming failed, proceeding with data fetch:', error);
          });

        const logsData = await getCollectionCached('workout_logs', { where: [['user_id', '==', user.id]] });
        setWorkoutLogs(logsData);

        // Fetch exercises from new Supabase exercises table
        let exercisesData = [];
        exercisesData = await getCollectionCached('exercises', {}, 60 * 60 * 1000);

        setExercises(exercisesData);
      } catch (error) {
        console.error("Error fetching data: ", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user?.id]);

  // Filter logs by time period
  const filteredLogs = workoutLogs.filter(log => {
    if (timePeriod === 'all') return true;
    if (!log.date) return false;
    const now = new Date();
    const logDate = log.date.toDate ? log.date.toDate() : new Date(log.date);
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