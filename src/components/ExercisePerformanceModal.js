import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Accordion, Spinner, Form, Row, Col, Table } from 'react-bootstrap';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import '../styles/Programs.css';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function ExercisePerformanceModal({ show, onHide, exercise, userId, workoutLogs }) {
  const [timePeriod, setTimePeriod] = useState('3months');
  const [isLoading, setIsLoading] = useState(false);
  const chartContainerRef = useRef(null);

  // Handle chart resize
  const handleChartResize = () => {
    if (chartContainerRef.current) {
      window.dispatchEvent(new Event('resize'));
      const canvas = chartContainerRef.current.querySelector('canvas');
      if (canvas && canvas.chart) {
        canvas.chart.resize();
      }
    }
  };

  // Calculate date filter based on time period
  const getDateFilter = () => {
    const now = new Date();
    const filterDate = new Date();

    switch (timePeriod) {
      case '1month':
        filterDate.setMonth(now.getMonth() - 1);
        break;
      case '3months':
        filterDate.setMonth(now.getMonth() - 3);
        break;
      case '1year':
        filterDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        filterDate.setMonth(now.getMonth() - 3);
    }

    return filterDate;
  };

  // Adapted calculateExerciseMetrics for single exercise with time filtering
  const calculateExerciseMetrics = () => {
    if (!exercise || !workoutLogs) return null;

    const exerciseMetrics = {
      name: exercise.name,
      exercise_type: exercise.exercise_type || '',
      sessions: [],
      maxWeight: 0,
      totalVolume: 0,
      progressTrend: []
    };

    const dateFilter = getDateFilter();

    // Collect all exercise data from logs for this specific exercise
    Object.keys(workoutLogs).forEach(weekKey => {
      if (workoutLogs[weekKey]?.exercises && workoutLogs[weekKey].exercises[exercise.id]) {
        const logEntry = workoutLogs[weekKey];
        const exerciseLog = logEntry.exercises[exercise.id];

        // Get completion date - this should be stored when workout is completed
        const completionDate = logEntry.completedDate ?
          new Date(logEntry.completedDate) :
          null;

        // Skip if completion date is before filter date
        if (completionDate && completionDate < dateFilter) {
          return;
        }

        if (exerciseLog.weights && exerciseLog.reps) {
          // Calculate weights and volume based on exercise type (only for completed sets)
          let sessionMaxWeight = 0;
          let sessionVolume = 0;
          const calculatedWeights = [];

          exerciseLog.weights.forEach((weight, idx) => {
            // Only process completed sets
            if (!exerciseLog.completed?.[idx]) return;

            const weightValue = parseFloat(weight) || 0;
            const repsValue = exerciseLog.reps[idx] || 0;
            const bodyweightValue = exerciseLog.bodyweight ? parseFloat(exerciseLog.bodyweight) : 0;

            let totalWeight = weightValue;
            let displayWeight = weightValue;

            // Calculate total weight based on exercise type
            if (exercise.exercise_type === 'Bodyweight') {
              totalWeight = bodyweightValue;
              displayWeight = bodyweightValue;
            } else if (exercise.exercise_type === 'Bodyweight Loadable' && bodyweightValue > 0) {
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

          // Only add session if there are completed sets
          if (calculatedWeights.length > 0) {
            exerciseMetrics.sessions.push({
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

            exerciseMetrics.maxWeight = Math.max(exerciseMetrics.maxWeight, sessionMaxWeight);
            exerciseMetrics.totalVolume += sessionVolume;
          }
        }
      }
    });

    // Process sessions
    exerciseMetrics.sessions.sort((a, b) => {
      if (a.completionDate && b.completionDate) {
        return a.completionDate - b.completionDate; // Sort by actual date
      }
      // Fallback to week/day sorting
      if (a.weekNum !== b.weekNum) return a.weekNum - b.weekNum;
      return a.dayNum - b.dayNum;
    });

    // Create progress trend based on chronological order
    exerciseMetrics.progressTrend = exerciseMetrics.sessions.map((session, index) => ({
      session: index + 1,
      maxWeight: session.maxWeight,
      volume: session.volume,
      date: session.completionDate,
      label: session.completionDate ?
        session.completionDate.toLocaleDateString() :
        `Week ${session.weekNum}, Day ${session.dayNum}`
    }));

    return exerciseMetrics;
  };

  const exerciseMetrics = calculateExerciseMetrics();

  const getWeightLabel = () => {
    if (exercise?.exercise_type === 'Bodyweight') return 'Bodyweight';
    if (exercise?.exercise_type === 'Bodyweight Loadable') return 'Total Weight';
    return 'Weight';
  };

  useEffect(() => {
    if (show) {
      setTimeout(() => handleChartResize(), 200);
    }
  }, [show, timePeriod]);

  if (!exercise) return null;

  return (
    <Modal
      show={show}
      onHide={onHide}
      size="lg"
      centered
      className="exercise-performance-modal"
    >
      <Modal.Header closeButton>
        <Modal.Title>
          {exercise.name} Performance Metrics
          {exercise.exercise_type && (
            <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
              {exercise.exercise_type}
            </span>
          )}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Time Period Selector */}
        <Row className="mb-4">
          <Col md={4}>
            <Form.Group>
              <Form.Label>Time Period</Form.Label>
              <Form.Select
                value={timePeriod}
                onChange={(e) => setTimePeriod(e.target.value)}
              >
                <option value="1month">Last Month</option>
                <option value="3months">Last 3 Months</option>
                <option value="1year">Last Year</option>
              </Form.Select>
            </Form.Group>
          </Col>
        </Row>

        {isLoading ? (
          <div className="text-center py-4">
            <Spinner animation="border" />
            <p className="mt-2">Loading performance data...</p>
          </div>
        ) : exerciseMetrics && exerciseMetrics.sessions.length > 0 ? (
          <>
            {/* Performance Summary */}
            <Row className="mb-4">
              <Col md={4}>
                <div className="text-center p-3 bg-light rounded">
                  <h4>{exerciseMetrics.maxWeight}</h4>
                  <small className="text-muted">Max {getWeightLabel()} (lbs)</small>
                </div>
              </Col>
              <Col md={4}>
                <div className="text-center p-3 bg-light rounded">
                  <h4>{exerciseMetrics.sessions.length}</h4>
                  <small className="text-muted">Total Sessions</small>
                </div>
              </Col>
              <Col md={4}>
                <div className="text-center p-3 bg-light rounded">
                  <h4>{Math.round(exerciseMetrics.totalVolume)}</h4>
                  <small className="text-muted">Total Volume (lbs)</small>
                </div>
              </Col>
            </Row>

            {/* Progression Chart */}
            <div className="mb-4">
              <h5>Progression Over Time</h5>
              <div
                ref={chartContainerRef}
                className="chart-container"
                style={{
                  width: '100%',
                  height: '350px',
                  position: 'relative'
                }}
              >
                <Line
                  data={{
                    labels: exerciseMetrics.progressTrend.map(session => session.label),
                    datasets: [
                      {
                        label: `${getWeightLabel()} (lbs)`,
                        data: exerciseMetrics.progressTrend.map(session => session.maxWeight),
                        fill: false,
                        borderColor: '#007bff',
                        backgroundColor: '#007bff',
                        tension: 0.2,
                        pointRadius: 4,
                        pointHoverRadius: 6,
                        yAxisID: 'y1',
                      },
                      {
                        label: `Total Volume (lbs)`,
                        data: exerciseMetrics.progressTrend.map(session => session.volume),
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
                        position: 'top'
                      },
                      title: { display: false },
                      tooltip: {
                        callbacks: {
                          title: function (context) {
                            const session = exerciseMetrics.progressTrend[context[0].dataIndex];
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
                          text: 'Workout Sessions'
                        },
                        ticks: {
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
                          text: `${getWeightLabel()} (lbs)`
                        },
                        beginAtZero: true,
                        grid: { drawOnChartArea: true }
                      },
                      y2: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                          display: true,
                          text: `Total Volume (lbs)`
                        },
                        beginAtZero: true,
                        grid: { drawOnChartArea: false }
                      }
                    }
                  }}
                />
              </div>
            </div>

            {/* Session Details Table */}
            <div>
              <h5>Session Details</h5>
              <div className="table-responsive">
                <Table striped bordered hover>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Week/Day</th>
                      <th>Sets × Reps</th>
                      <th>{getWeightLabel()} (lbs)</th>
                      <th>Volume (lbs)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exerciseMetrics.sessions.map((session, index) => {
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
                        <tr key={index}>
                          <td>
                            {session.completionDate ?
                              session.completionDate.toLocaleDateString() :
                              'N/A'
                            }
                          </td>
                          <td>Week {session.weekNum}, Day {session.dayNum}</td>
                          <td>{setsReps}</td>
                          <td>{weights}</td>
                          <td>{Math.round(session.volume)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-5">
            <p className="text-muted">No workout data available for this exercise in the selected time period.</p>
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

export default ExercisePerformanceModal;