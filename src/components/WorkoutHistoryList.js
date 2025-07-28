/**
 * WorkoutHistoryList Component
 * 
 * Displays a card-based list of quick workouts with workout details,
 * action buttons, and empty state handling with enhanced error handling.
 * Now includes real-time updates for workout progress.
 */

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Button, Badge, Alert } from 'react-bootstrap';
import { 
  Calendar, 
  Eye, 
  Trash, 
  Copy, 
  CheckCircleFill, 
  XCircleFill,
  Plus,
  Activity,
  ExclamationTriangle,
  Broadcast
} from 'react-bootstrap-icons';
import { WorkoutHistoryListSkeleton } from './WorkoutHistorySkeleton';
import { useRealtimeWorkoutHistory } from '../hooks/useRealtimeWorkouts';
import '../styles/QuickWorkoutHistory.css';

const WorkoutHistoryList = ({
  workouts = [],
  onWorkoutSelect,
  onDeleteWorkout,
  onUseAsTemplate,
  isLoading = false,
  enableRealtime = true
}) => {
  // Real-time workout updates
  const {
    workouts: realtimeWorkouts,
    isConnected: isRealtimeConnected,
    error: realtimeError
  } = useRealtimeWorkoutHistory(20);

  // State for real-time indicators
  const [recentUpdates, setRecentUpdates] = useState([]);

  // Use real-time workouts if available and enabled, otherwise use props
  const displayWorkouts = enableRealtime && realtimeWorkouts.length > 0 ? realtimeWorkouts : workouts;

  // Track recent updates for visual feedback
  useEffect(() => {
    if (enableRealtime && realtimeWorkouts.length > 0) {
      const newWorkouts = realtimeWorkouts.filter(rw => 
        !workouts.find(w => w.id === rw.id)
      );
      
      if (newWorkouts.length > 0) {
        setRecentUpdates(prev => [
          ...newWorkouts.map(w => ({ id: w.id, type: 'new', timestamp: Date.now() })),
          ...prev.slice(0, 4) // Keep last 5 updates
        ]);
        
        // Clear update indicators after 5 seconds
        setTimeout(() => {
          setRecentUpdates(prev => prev.filter(u => Date.now() - u.timestamp < 5000));
        }, 5000);
      }
    }
  }, [realtimeWorkouts, workouts, enableRealtime]);

  // Format date for display
  const formatWorkoutDate = (date) => {
    if (!date) return 'Unknown Date';
    
    const workoutDate = date.toDate ? date.toDate() : new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now - workoutDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return workoutDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: workoutDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
  };

  // Calculate workout completion status
  const getWorkoutCompletionStatus = (workout) => {
    if (!workout.exercises || workout.exercises.length === 0) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    let totalSets = 0;
    let completedSets = 0;

    workout.exercises.forEach(exercise => {
      const sets = exercise.sets || 0;
      const completed = exercise.completed || [];
      
      totalSets += sets;
      completedSets += completed.filter(Boolean).length;
    });

    return {
      completed: completedSets,
      total: totalSets,
      percentage: totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0
    };
  };

  // Get completion badge variant based on percentage
  const getCompletionBadgeVariant = (percentage) => {
    if (percentage === 100) return 'success';
    if (percentage >= 75) return 'warning';
    if (percentage >= 50) return 'info';
    if (percentage > 0) return 'secondary';
    return 'light';
  };

  // Loading state
  if (isLoading) {
    return <WorkoutHistoryListSkeleton count={5} />;
  }

  // Empty state
  if (!workouts || workouts.length === 0) {
    return (
      <Card className="soft-card">
        <Card.Body className="empty-state">
          <div className="empty-state-icon">
            <Activity />
          </div>
          <h5 className="empty-state-title">No Quick Workouts Yet</h5>
          <p className="empty-state-description">
            You haven't created any quick workouts yet. Start your fitness journey by creating your first workout!
          </p>
          <Button 
            variant="primary" 
            size="lg"
            className="soft-button empty-state-action"
            onClick={() => window.location.href = '/quick-workout'}
          >
            <Plus className="me-2" />
            Create Your First Workout
          </Button>
        </Card.Body>
      </Card>
    );
  }

  // Validate and filter workouts to handle corrupted data
  const validWorkouts = workouts.filter(workout => {
    if (!workout || typeof workout !== 'object') {
      console.warn('Invalid workout data structure:', workout);
      return false;
    }
    if (!workout.id) {
      console.warn('Workout missing ID:', workout);
      return false;
    }
    return true;
  });

  // Show warning if some workouts were filtered out
  const hasCorruptedData = workouts.length !== validWorkouts.length;

  return (
    <div>
      {/* Real-time connection status */}
      {enableRealtime && (
        <div className="d-flex justify-content-between align-items-center mb-2">
          <Badge 
            bg={isRealtimeConnected ? 'success' : 'secondary'} 
            className="d-flex align-items-center"
          >
            <Broadcast className="me-1" size={12} />
            {isRealtimeConnected ? 'Live Updates Active' : 'Live Updates Inactive'}
          </Badge>
          {recentUpdates.length > 0 && (
            <small className="text-success">
              {recentUpdates.length} recent update{recentUpdates.length !== 1 ? 's' : ''}
            </small>
          )}
        </div>
      )}

      {/* Real-time error alert */}
      {enableRealtime && realtimeError && (
        <Alert variant="warning" className="mb-3">
          <ExclamationTriangle className="me-2" />
          Real-time updates temporarily unavailable: {realtimeError.message}
        </Alert>
      )}

      {hasCorruptedData && (
        <Alert variant="warning" className="mb-3">
          <ExclamationTriangle className="me-2" />
          Some workout data appears to be corrupted and has been hidden. 
          If this persists, please contact support.
        </Alert>
      )}
      
      {validWorkouts.map((workout) => {
        // Handle potential data corruption gracefully
        let completionStatus;
        let exerciseCount = 0;
        let hasDataIssues = false;

        try {
          completionStatus = getWorkoutCompletionStatus(workout);
          exerciseCount = workout.exercises ? workout.exercises.length : 0;
        } catch (error) {
          console.warn('Error processing workout data:', error, workout);
          hasDataIssues = true;
          completionStatus = { completed: 0, total: 0, percentage: 0 };
        }
        
        // Check if this workout was recently updated
        const isRecentUpdate = recentUpdates.find(u => u.id === workout.id);
        
        return (
          <Card 
            key={workout.id} 
            className={`soft-card workout-history-card ${isRecentUpdate ? 'border-success' : ''}`}
            style={isRecentUpdate ? { boxShadow: '0 0 10px rgba(40, 167, 69, 0.3)' } : {}}
          >
            <Card.Body>
              {hasDataIssues && (
                <Alert variant="warning" size="sm" className="mb-2">
                  <small>
                    <ExclamationTriangle className="me-1" size={12} />
                    This workout has some data issues. Some information may be incomplete.
                  </small>
                </Alert>
              )}
              
              <Row className="align-items-center">
                {/* Workout Info */}
                <Col md={8}>
                  <div className="d-flex align-items-start justify-content-between mb-2">
                    <div className="flex-grow-1">
                      <h5 className="mb-1">
                        {workout.name || `Quick Workout - ${formatWorkoutDate(workout.date)}`}
                      </h5>
                      <div className="d-flex align-items-center gap-3 mb-2 flex-wrap">
                        <div className="d-flex align-items-center text-muted">
                          <Calendar className="me-1" size={14} />
                          <small>{formatWorkoutDate(workout.date)}</small>
                        </div>
                        <div className="d-flex align-items-center text-muted">
                          <Activity className="me-1" size={14} />
                          <small>{exerciseCount} exercise{exerciseCount !== 1 ? 's' : ''}</small>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Completion Status */}
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Badge 
                      bg={getCompletionBadgeVariant(completionStatus.percentage)}
                      className="d-flex align-items-center workout-completion-badge"
                    >
                      {completionStatus.percentage === 100 ? (
                        <CheckCircleFill className="me-1" size={12} />
                      ) : completionStatus.percentage === 0 ? (
                        <XCircleFill className="me-1" size={12} />
                      ) : null}
                      {completionStatus.percentage}% Complete
                    </Badge>
                    <small className="text-muted">
                      {completionStatus.completed}/{completionStatus.total} sets
                    </small>
                  </div>
                </Col>

                {/* Action Buttons */}
                <Col md={4}>
                  <div className="workout-action-buttons d-flex justify-content-md-end justify-content-start">
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => onWorkoutSelect(workout)}
                      className="d-flex align-items-center"
                      disabled={hasDataIssues}
                      title={hasDataIssues ? "Cannot view workout due to data issues" : "View workout details"}
                    >
                      <Eye className="me-1" size={14} />
                      <span className="d-none d-sm-inline">View</span>
                    </Button>
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => onUseAsTemplate(workout)}
                      className="d-flex align-items-center"
                      disabled={hasDataIssues || !workout.exercises || workout.exercises.length === 0}
                      title={hasDataIssues ? "Cannot use as template due to data issues" : 
                             !workout.exercises || workout.exercises.length === 0 ? "No exercises to use as template" : 
                             "Use this workout as a template"}
                    >
                      <Copy className="me-1" size={14} />
                      <span className="d-none d-sm-inline">Template</span>
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => onDeleteWorkout(workout.id)}
                      className="d-flex align-items-center"
                      title="Delete this workout"
                    >
                      <Trash className="me-1" size={14} />
                      <span className="d-none d-sm-inline">Delete</span>
                    </Button>
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        );
      })}
    </div>
  );
};

export default WorkoutHistoryList;