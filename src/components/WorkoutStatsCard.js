/**
 * WorkoutStatsCard Component
 * 
 * Displays workout statistics including total count, frequent exercises,
 * and recent activity summary for quick workout history with enhanced error handling.
 */

import React from 'react';
import { Card, Row, Col, Badge, Table, Alert } from 'react-bootstrap';
import { BarChart, Calendar, Clock, CheckCircleFill, ExclamationTriangle } from 'react-bootstrap-icons';
import { getWorkoutStatistics } from '../utils/workoutStatsUtils';
import '../styles/QuickWorkoutHistory.css';

const WorkoutStatsCard = ({ workouts = [], exercises = [] }) => {
  // Calculate comprehensive statistics with error handling
  let stats;
  let hasError = false;
  
  try {
    stats = getWorkoutStatistics(workouts, exercises);
  } catch (error) {
    console.error('Error calculating workout statistics:', error);
    hasError = true;
    stats = { hasData: false };
  }

  // Handle calculation errors
  if (hasError) {
    return (
      <Card className="soft-card mb-4">
        <Card.Header className="d-flex align-items-center">
          <BarChart className="me-2" />
          <h5 className="mb-0">Workout Statistics</h5>
        </Card.Header>
        <Card.Body>
          <Alert variant="warning" className="mb-0">
            <div className="text-center">
              <ExclamationTriangle size={32} className="mb-2 text-warning" />
              <p className="mb-0">Unable to calculate statistics</p>
              <small className="text-muted">
                There was an error processing your workout data. Some statistics may be unavailable.
              </small>
            </div>
          </Alert>
        </Card.Body>
      </Card>
    );
  }

  // Handle cases with insufficient data
  if (!stats.hasData) {
    return (
      <Card className="soft-card mb-4">
        <Card.Header className="d-flex align-items-center">
          <BarChart className="me-2" />
          <h5 className="mb-0">Workout Statistics</h5>
        </Card.Header>
        <Card.Body>
          <Alert variant="info" className="mb-0">
            <div className="text-center">
              <Calendar size={32} className="mb-2 text-muted" />
              <p className="mb-0">No workout data available yet.</p>
              <small className="text-muted">
                Complete some quick workouts to see your statistics here!
              </small>
            </div>
          </Alert>
        </Card.Body>
      </Card>
    );
  }

  const formatLastWorkoutDate = (date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  const getStreakBadgeVariant = (streak) => {
    if (streak >= 7) return 'success';
    if (streak >= 3) return 'warning';
    if (streak >= 1) return 'info';
    return 'secondary';
  };

  const getActivityBadgeVariant = (count) => {
    if (count >= 12) return 'success'; // 3+ per week
    if (count >= 8) return 'warning';  // 2+ per week
    if (count >= 4) return 'info';     // 1+ per week
    return 'secondary';
  };

  return (
    <Card className="soft-card stats-card mb-4">
      <Card.Header className="stats-header d-flex align-items-center">
        <BarChart className="me-2" />
        <h5 className="mb-0">Workout Statistics</h5>
      </Card.Header>
      <Card.Body className="stats-body">
        {/* Overview Stats */}
        <div className="stats-overview-grid">
          <div className="stats-overview-item">
            <div className="stats-overview-value text-primary">{stats.totalWorkouts}</div>
            <div className="stats-overview-label">Total Workouts</div>
          </div>
          <div className="stats-overview-item">
            <div className="stats-overview-value text-success">{stats.setsAndExercises.totalSets}</div>
            <div className="stats-overview-label">Total Sets</div>
          </div>
          <div className="stats-overview-item">
            <div className="stats-overview-value text-info">{stats.setsAndExercises.totalExercises}</div>
            <div className="stats-overview-label">Total Exercises</div>
          </div>
          <div className="stats-overview-item">
            <Badge 
              bg={getStreakBadgeVariant(stats.recentActivity.workoutStreak)} 
              className="stats-overview-value"
            >
              {stats.recentActivity.workoutStreak}
            </Badge>
            <div className="stats-overview-label">Day Streak</div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="stats-section">
          <Row>
            <Col md={6} className="mb-4 mb-md-0">
              <div className="stats-section-title">
                <Clock className="text-primary" />
                Recent Activity (30 days)
              </div>
              <Table size="sm" className="mb-0">
                <tbody>
                  <tr>
                    <td>Workouts completed</td>
                    <td>
                      <Badge bg={getActivityBadgeVariant(stats.recentActivity.recentWorkouts)}>
                        {stats.recentActivity.recentWorkouts}
                      </Badge>
                    </td>
                  </tr>
                  <tr>
                    <td>Average per week</td>
                    <td>
                      <span className="text-muted">
                        {stats.recentActivity.averageWorkoutsPerWeek}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Last workout</td>
                    <td>
                      <span className="text-muted">
                        {formatLastWorkoutDate(stats.recentActivity.lastWorkoutDate)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </Col>
            <Col md={6}>
              <div className="stats-section-title">
                <CheckCircleFill className="text-success" />
                Workout Averages
              </div>
              <Table size="sm" className="mb-0">
                <tbody>
                  <tr>
                    <td>Sets per workout</td>
                    <td>
                      <span className="text-muted">
                        {stats.setsAndExercises.averageSetsPerWorkout}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Exercises per workout</td>
                    <td>
                      <span className="text-muted">
                        {stats.setsAndExercises.averageExercisesPerWorkout}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>This month</td>
                    <td>
                      <Badge bg="info">
                        {stats.frequencyMetrics.thisMonth}
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </Table>
            </Col>
          </Row>
        </div>

        {/* Most Frequent Exercises */}
        {stats.frequentExercises.length > 0 && (
          <div className="stats-section">
            <div className="stats-section-title">
              <BarChart />
              Most Frequent Exercises
            </div>
            <Table size="sm" striped className="frequent-exercises-table">
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th className="d-none d-sm-table-cell">Muscle Group</th>
                  <th>Count</th>
                  <th className="d-none d-md-table-cell">%</th>
                </tr>
              </thead>
              <tbody>
                {stats.frequentExercises.slice(0, 5).map((exercise, index) => (
                  <tr key={exercise.exerciseId}>
                    <td>
                      <div className="d-flex align-items-center">
                        <Badge 
                          bg="light" 
                          text="dark" 
                          className="me-2"
                          style={{ minWidth: '20px' }}
                        >
                          {index + 1}
                        </Badge>
                        <div>
                          <div>{exercise.name}</div>
                          <small className="text-muted d-sm-none">
                            {exercise.primaryMuscleGroup}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="d-none d-sm-table-cell">
                      <small className="text-muted">
                        {exercise.primaryMuscleGroup}
                      </small>
                    </td>
                    <td>
                      <Badge bg="primary">
                        {exercise.frequency}
                      </Badge>
                    </td>
                    <td className="d-none d-md-table-cell">
                      <small className="text-muted">
                        {exercise.percentage}%
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default WorkoutStatsCard;