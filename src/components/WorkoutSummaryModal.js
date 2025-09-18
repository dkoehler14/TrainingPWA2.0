import React from 'react';
import { Modal, Button, Table } from 'react-bootstrap';

function WorkoutSummaryModal({ show, onHide, workoutData, exercisesList, weightUnit }) {
  // Calculate total volume
  const totalVolume = workoutData.reduce((sum, ex) => {
    const exercise = exercisesList.find(e => e.id === ex.exerciseId);
    const exerciseType = exercise?.exerciseType || '';
    let exerciseVolume = 0;
    if (exerciseType === 'Bodyweight') {
      exerciseVolume = ex.weights.reduce((acc, weight, idx) => {
        // Only include completed sets in volume calculation
        if (ex.completed && ex.completed[idx]) {
          return acc + (Number(weight) || 0) * (Number(ex.reps[idx]) || 0);
        }
        return acc;
      }, 0);
    } else if (exerciseType === 'Bodyweight Loadable') {
      exerciseVolume = ex.weights.reduce((acc, weight, idx) => {
        // Only include completed sets in volume calculation
        if (ex.completed && ex.completed[idx]) {
          return acc + ((Number(ex.bodyweight) || 0) + (Number(weight) || 0)) * (Number(ex.reps[idx]) || 0);
        }
        return acc;
      }, 0);
    } else {
      exerciseVolume = ex.weights.reduce((acc, weight, idx) => {
        // Only include completed sets in volume calculation
        if (ex.completed && ex.completed[idx]) {
          return acc + (Number(weight) || 0) * (Number(ex.reps[idx]) || 0);
        }
        return acc;
      }, 0);
    }
    return sum + exerciseVolume;
  }, 0);

  // Calculate muscle group metrics
  const muscleGroupMetrics = workoutData.reduce((acc, ex) => {
    const exercise = exercisesList.find(e => e.id === ex.exerciseId);
    const muscleGroup = exercise?.primaryMuscleGroup || 'Unknown';
    const exerciseType = exercise?.exerciseType || '';
    let volume = 0;
    let completedSets = 0;

    if (exerciseType === 'Bodyweight') {
      volume = ex.weights.reduce((sum, weight, idx) => {
        // Only include completed sets in volume calculation
        if (ex.completed && ex.completed[idx]) {
          completedSets++;
          return sum + (Number(weight) || 0) * (Number(ex.reps[idx]) || 0);
        }
        return sum;
      }, 0);
    } else if (exerciseType === 'Bodyweight Loadable') {
      volume = ex.weights.reduce((sum, weight, idx) => {
        // Only include completed sets in volume calculation
        if (ex.completed && ex.completed[idx]) {
          completedSets++;
          return sum + ((Number(ex.bodyweight) || 0) + (Number(weight) || 0)) * (Number(ex.reps[idx]) || 0);
        }
        return sum;
      }, 0);
    } else {
      volume = ex.weights.reduce((sum, weight, idx) => {
        // Only include completed sets in volume calculation
        if (ex.completed && ex.completed[idx]) {
          completedSets++;
          return sum + (Number(weight) || 0) * (Number(ex.reps[idx]) || 0);
        }
        return sum;
      }, 0);
    }

    if (!acc[muscleGroup]) {
      acc[muscleGroup] = { volume: 0, sets: 0 };
    }
    acc[muscleGroup].volume += volume;
    acc[muscleGroup].sets += completedSets; // Only count completed sets
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

export default WorkoutSummaryModal;