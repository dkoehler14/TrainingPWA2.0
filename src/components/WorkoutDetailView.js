/**
 * WorkoutDetailView Component
 * 
 * Displays detailed workout information including complete exercise details,
 * sets, reps, weights, completion status, notes, and bodyweight values.
 * Provides navigation back to list and action buttons for delete and template use.
 */

import React from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Button, 
  Table, 
  Badge, 
  Alert,
  Container
} from 'react-bootstrap';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Activity, 
  Trash, 
  Copy, 
  CheckCircleFill, 
  XCircleFill,
  StickyFill,
  PersonFill
} from 'react-bootstrap-icons';
import '../styles/QuickWorkoutHistory.css';

const WorkoutDetailView = ({
  workout,
  exercises = [],
  onBack,
  onDelete,
  onUseAsTemplate
}) => {

  // Handle missing workout data
  if (!workout) {
    return (
      <Container className="py-4">
        <Alert variant="danger">
          <h5>Workout Not Found</h5>
          <p>The requested workout could not be loaded. It may have been deleted or there was an error loading the data.</p>
          <Button variant="outline-primary" onClick={onBack}>
            <ArrowLeft className="me-2" />
            Back to History
          </Button>
        </Alert>
      </Container>
    );
  }

  // Validate workout data structure
  const hasValidData = workout && typeof workout === 'object' && workout.id;
  if (!hasValidData) {
    return (
      <Container className="py-4">
        <Alert variant="warning">
          <h5>Invalid Workout Data</h5>
          <p>This workout contains corrupted or invalid data and cannot be displayed properly.</p>
          <div className="d-flex gap-2">
            <Button variant="outline-primary" onClick={onBack}>
              <ArrowLeft className="me-2" />
              Back to History
            </Button>
            <Button variant="outline-danger" onClick={() => onDelete(workout?.id)}>
              Delete Corrupted Workout
            </Button>
          </div>
        </Alert>
      </Container>
    );
  }

  // Format date for display
  const formatWorkoutDate = (date) => {
    if (!date) return 'Unknown Date';
    
    const workoutDate = date.toDate ? date.toDate() : new Date(date);
    return workoutDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format time for display
  const formatWorkoutTime = (date) => {
    if (!date) return '';
    
    const workoutDate = date.toDate ? date.toDate() : new Date(date);
    return workoutDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Calculate workout completion statistics
  const getWorkoutStats = () => {
    if (!workout.exercises || workout.exercises.length === 0) {
      return { totalSets: 0, completedSets: 0, percentage: 0, totalExercises: 0 };
    }

    let totalSets = 0;
    let completedSets = 0;

    workout.exercises.forEach(exercise => {
      if (!exercise || typeof exercise !== 'object') {
        return; // Skip invalid exercises
      }
      const sets = exercise.sets || 0;
      const completed = exercise.completed || [];
      
      totalSets += sets;
      completedSets += completed.filter(Boolean).length;
    });

    return {
      totalSets,
      completedSets,
      percentage: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0,
      totalExercises: workout.exercises.length
    };
  };

  // Get exercise metadata by ID
  const getExerciseMetadata = (exerciseId) => {
    const exercise = exercises.find(ex => ex.id === exerciseId);
    return exercise || {
      name: 'Unknown Exercise',
      primaryMuscleGroup: 'Unknown',
      exerciseType: 'Unknown',
      isGlobal: false
    };
  };

  // Get completion badge variant
  const getCompletionBadgeVariant = (percentage) => {
    if (percentage === 100) return 'success';
    if (percentage >= 75) return 'warning';
    if (percentage >= 50) return 'info';
    if (percentage > 0) return 'secondary';
    return 'light';
  };

  // Check if exercise is bodyweight type
  const isBodyweightExercise = (exerciseType) => {
    return ['Bodyweight', 'Bodyweight Loadable'].includes(exerciseType);
  };

  const stats = getWorkoutStats();

  return (
    <Container fluid className="soft-container py-4">
      {/* Header with Navigation */}
      <div className="workout-detail-header">
        <div className="d-flex align-items-center justify-content-between flex-wrap">
          <div className="d-flex align-items-center flex-wrap">
            <Button
              variant="outline-secondary"
              onClick={onBack}
              className="me-3 mb-2 mb-md-0"
            >
              <ArrowLeft className="me-2" />
              <span className="d-none d-sm-inline">Back to History</span>
              <span className="d-sm-none">Back</span>
            </Button>
            <div>
              <h1 className="soft-title mb-1">
                {workout.name || `Quick Workout - ${formatWorkoutDate(workout.date)}`}
              </h1>
              <div className="d-flex align-items-center gap-3 text-muted flex-wrap">
                <div className="d-flex align-items-center">
                  <Calendar className="me-1" size={14} />
                  <small>{formatWorkoutDate(workout.date)}</small>
                </div>
                {workout.date && (
                  <div className="d-flex align-items-center">
                    <Clock className="me-1" size={14} />
                    <small>{formatWorkoutTime(workout.date)}</small>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="workout-action-buttons d-flex">
            <Button
              variant="outline-success"
              onClick={() => onUseAsTemplate(workout)}
              className="d-flex align-items-center"
            >
              <Copy className="me-2" />
              <span className="d-none d-sm-inline">Use as Template</span>
              <span className="d-sm-none">Template</span>
            </Button>
            <Button
              variant="outline-danger"
              onClick={() => onDelete(workout.id)}
              className="d-flex align-items-center"
            >
              <Trash className="me-2" />
              <span className="d-none d-sm-inline">Delete Workout</span>
              <span className="d-sm-none">Delete</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Workout Summary Stats */}
      <Row className="mb-4">
        <Col>
          <Card className="soft-card workout-stats-overview">
            <Card.Body>
              <Row className="text-center">
                <Col md={3} sm={6} className="workout-stats-item">
                  <div className="workout-stats-value text-primary">{stats.totalExercises}</div>
                  <div className="workout-stats-label">Exercises</div>
                </Col>
                <Col md={3} sm={6} className="workout-stats-item">
                  <div className="workout-stats-value text-success">{stats.totalSets}</div>
                  <div className="workout-stats-label">Total Sets</div>
                </Col>
                <Col md={3} sm={6} className="workout-stats-item">
                  <div className="workout-stats-value text-info">{stats.completedSets}</div>
                  <div className="workout-stats-label">Completed Sets</div>
                </Col>
                <Col md={3} sm={6} className="workout-stats-item">
                  <Badge 
                    bg={getCompletionBadgeVariant(stats.percentage)} 
                    className="workout-stats-value"
                  >
                    {stats.percentage}%
                  </Badge>
                  <div className="workout-stats-label">Complete</div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Exercise Details */}
      <Row>
        <Col>
          {workout.exercises && workout.exercises.length > 0 ? (
            workout.exercises.map((exercise, exerciseIndex) => {
              // Handle missing or corrupted exercise data gracefully
              if (!exercise || typeof exercise !== 'object') {
                return (
                  <Card key={exerciseIndex} className="soft-card exercise-detail-card">
                    <Card.Body>
                      <Alert variant="warning" className="mb-0">
                        <small>
                          Exercise #{exerciseIndex + 1} has corrupted data and cannot be displayed.
                        </small>
                      </Alert>
                    </Card.Body>
                  </Card>
                );
              }

              const exerciseMetadata = getExerciseMetadata(exercise.exerciseId);
              const isBodyweight = isBodyweightExercise(exerciseMetadata.exerciseType);
              const completedSets = exercise.completed ? exercise.completed.filter(Boolean).length : 0;
              const totalSets = exercise.sets || 0;
              
              // Check if exercise metadata is missing (unknown exercise)
              const isMissingMetadata = exerciseMetadata.name === 'Unknown Exercise';
              
              return (
                <Card key={exerciseIndex} className="soft-card exercise-detail-card">
                  <Card.Header className="exercise-detail-header">
                    <Row className="align-items-center">
                      <Col>
                        <div className="d-flex align-items-center mb-1">
                          <h5 className="mb-0 me-2">{exerciseMetadata.name}</h5>
                          {isMissingMetadata && (
                            <Badge bg="warning" className="text-dark">
                              <small>Missing Data</small>
                            </Badge>
                          )}
                        </div>
                        <div className="d-flex align-items-center exercise-metadata-badges flex-wrap">
                          <small className="text-muted me-2">
                            {exerciseMetadata.primaryMuscleGroup}
                          </small>
                          <Badge variant="outline-secondary" className="exercise-metadata-badges badge me-2">
                            {exerciseMetadata.exerciseType}
                          </Badge>
                          {isBodyweight && exercise.bodyweight && (
                            <div className="d-flex align-items-center text-muted">
                              <PersonFill className="me-1" size={14} />
                              <small>BW: {exercise.bodyweight} lbs</small>
                            </div>
                          )}
                        </div>
                        {isMissingMetadata && (
                          <small className="text-muted mt-1">
                            Exercise ID: {exercise.exerciseId || 'Unknown'}
                          </small>
                        )}
                      </Col>
                      <Col xs="auto">
                        <Badge 
                          bg={completedSets === totalSets ? 'success' : completedSets > 0 ? 'warning' : 'secondary'}
                          className="d-flex align-items-center workout-completion-badge"
                        >
                          {completedSets === totalSets ? (
                            <CheckCircleFill className="me-1" size={12} />
                          ) : completedSets === 0 ? (
                            <XCircleFill className="me-1" size={12} />
                          ) : null}
                          {completedSets}/{totalSets} sets
                        </Badge>
                      </Col>
                    </Row>
                  </Card.Header>
                  <Card.Body>
                    {/* Sets Table */}
                    <Table responsive className="workout-table">
                      <thead>
                        <tr>
                          <th>Set</th>
                          <th>Reps</th>
                          <th>Weight</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: totalSets }, (_, setIndex) => {
                          const reps = exercise.reps && exercise.reps[setIndex] ? exercise.reps[setIndex] : 0;
                          const weight = exercise.weights && exercise.weights[setIndex] ? exercise.weights[setIndex] : 0;
                          const completed = exercise.completed && exercise.completed[setIndex];
                          
                          return (
                            <tr key={setIndex} className={completed ? 'table-success' : ''}>
                              <td>
                                <Badge bg="light" text="dark" className="set-number-badge">
                                  {setIndex + 1}
                                </Badge>
                              </td>
                              <td>
                                <strong>{reps || '-'}</strong>
                              </td>
                              <td>
                                {isBodyweight && exerciseMetadata.exerciseType === 'Bodyweight' ? (
                                  <span className="text-muted">Bodyweight</span>
                                ) : (
                                  <strong>{weight || '-'} lbs</strong>
                                )}
                              </td>
                              <td>
                                {completed ? (
                                  <Badge bg="success" className="d-flex align-items-center workout-completion-badge">
                                    <CheckCircleFill className="me-1" size={12} />
                                    <span className="d-none d-sm-inline">Done</span>
                                    <span className="d-sm-none">✓</span>
                                  </Badge>
                                ) : (
                                  <Badge bg="secondary" className="d-flex align-items-center workout-completion-badge">
                                    <XCircleFill className="me-1" size={12} />
                                    <span className="d-none d-sm-inline">Skipped</span>
                                    <span className="d-sm-none">✗</span>
                                  </Badge>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>

                    {/* Exercise Notes */}
                    {exercise.notes && exercise.notes.trim() && (
                      <div className="exercise-notes-section">
                        <div className="d-flex align-items-center mb-2">
                          <StickyFill className="me-2 text-warning" size={16} />
                          <strong>Notes:</strong>
                        </div>
                        <div>
                          <small>{exercise.notes}</small>
                        </div>
                      </div>
                    )}
                  </Card.Body>
                </Card>
              );
            })
          ) : (
            <Card className="soft-card">
              <Card.Body className="text-center py-5">
                <Activity size={48} className="text-muted mb-3" />
                <h5>No Exercise Data</h5>
                <p className="text-muted mb-0">
                  This workout doesn't contain any exercise information.
                </p>
              </Card.Body>
            </Card>
          )}
        </Col>
      </Row>
    </Container>
  );
};

export default WorkoutDetailView;