import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeWorkoutHistory } from '../hooks/useRealtimeWorkouts';
import workoutLogService from '../services/workoutLogService';
import { getUserPrograms } from '../services/programService';
import ErrorMessage from '../components/ErrorMessage';
import { supabase } from '../config/supabase';
import '../styles/Home.css';

// A simple chart component placeholder
const ProgressSnapshot = () => (
  <div className="progress-snapshot-placeholder">
    <p className="soft-text">Progress chart coming soon...</p>
  </div>
);

function Home() {
  const { user, userProfile, isAuthenticated, loading: authLoading } = useAuth();
  const { workouts: recentWorkouts, isConnected } = useRealtimeWorkoutHistory(5);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboardData, setDashboardData] = useState({
    userName: '',
    volumeLifted: 0,
    prsThisMonth: 0,
    currentProgram: null,
    recentActivity: [],
  });

  // Update dashboard data when real-time workouts change
  useEffect(() => {
    if (!isAuthenticated || !user || authLoading) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Get current program
        let currentProgram = null;
        try {
          const programs = await getUserPrograms(user.id, {
            is_current: true
          });
          currentProgram = programs.length > 0 ? programs[0] : null;
          console.log("home.js currentProgram: ", currentProgram);
        } catch (programError) {
          console.warn('Failed to fetch current program:', programError);
        }

        // Get PRs this month from user analytics
        let prsThisMonth = 0;
        try {
          const oneMonthAgo = new Date();
          oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

          const { data: analytics } = await supabase
            .from('user_analytics')
            .select('*')
            .eq('user_id', user.id)
            .gte('pr_date', oneMonthAgo.toISOString().split('T')[0]);

          prsThisMonth = analytics?.length || 0;
        } catch (analyticsError) {
          console.warn('Failed to fetch PR data:', analyticsError);
        }

        setDashboardData(prev => ({
          ...prev,
          userName: userProfile?.name || user.email,
          prsThisMonth: prsThisMonth,
          currentProgram: currentProgram,
        }));

      } catch (e) {
        console.error("Error fetching dashboard data:", e);
        setError("Failed to load dashboard data. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, userProfile, isAuthenticated, authLoading]);

  // Update dashboard data when real-time workouts change
  useEffect(() => {
    if (!recentWorkouts || recentWorkouts.length === 0) return;

    // Calculate total volume for the week using real-time workout data
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentWorkoutsThisWeek = recentWorkouts.filter(log => {
      const logDate = new Date(log.completed_date || log.date);
      return logDate >= sevenDaysAgo;
    });

    const volumeThisWeek = recentWorkoutsThisWeek.reduce((total, log) => {
      if (!log.workout_log_exercises) return total;

      return total + log.workout_log_exercises.reduce((vol, ex) => {
        if (!ex.completed || !ex.weights || !ex.reps) return vol;

        // Sum volume for completed sets
        return vol + ex.completed.reduce((setVol, isCompleted, index) => {
          if (isCompleted && ex.weights[index] && ex.reps[index]) {
            const weight = Number(ex.weights[index]) || 0;
            const reps = Number(ex.reps[index]) || 0;
            const bodyweight = Number(ex.bodyweight) || 0;

            // Handle different exercise types
            let effectiveWeight = weight;
            if (ex.exercises?.exercise_type === 'Bodyweight') {
              effectiveWeight = bodyweight;
            } else if (ex.exercises?.exercise_type === 'Bodyweight Loadable') {
              effectiveWeight = bodyweight + weight;
            }

            return setVol + (effectiveWeight * reps);
          }
          return setVol;
        }, 0);
      }, 0);
    }, 0);

    setDashboardData(prev => ({
      ...prev,
      volumeLifted: volumeThisWeek,
      recentActivity: recentWorkouts,
    }));
  }, [recentWorkouts]);

  return (
    <Container fluid className="soft-container home-container py-4">
      {isLoading ? (
        <div className="text-center py-5">
          <Spinner animation="border" className="spinner-blue" />
          <p className="soft-text mt-2">Loading your dashboard...</p>
        </div>
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <>
          {/* Header */}
          <Row className="align-items-center mb-4 home-header-row">
            <Col>
              <h1 className="soft-title dashboard-greeting">
                👋 Welcome back, {dashboardData.userName}!
              </h1>
              {isConnected && (
                <small className="text-success">
                  🟢 Real-time updates active
                </small>
              )}
            </Col>
            <Col xs="auto">
              <Button as={Link} to="/log-workout" className="soft-button gradient cta-button">
                🚀 Start Today's Workout
              </Button>
            </Col>
          </Row>

          {/* Key Metrics */}
          <Row className="g-4 mb-4">
            <Col md={4}>
              <Card className="soft-card metric-card h-100">
                <Card.Body>
                  <Card.Title className="metric-title">Volume Lifted (This Week)</Card.Title>
                  <Card.Text className="metric-value">{dashboardData.volumeLifted.toLocaleString()} lbs</Card.Text>
                </Card.Body>
              </Card>
            </Col>
            <Col md={4}>
              <Card className="soft-card metric-card h-100">
                <Card.Body>
                  <Card.Title className="metric-title">PRs This Month</Card.Title>
                  <Card.Text className="metric-value">{dashboardData.prsThisMonth}</Card.Text>
                </Card.Body>
              </Card>
            </Col>
          </Row>

          {/* Main Dashboard */}
          <Row className="g-4">
            {/* Left Column */}
            <Col lg={7}>
              <Card className="soft-card widget-card mb-4">
                <Card.Body>
                  <Card.Title className="widget-title">Progress Snapshot</Card.Title>
                  <ProgressSnapshot />
                </Card.Body>
              </Card>
              <Card className="soft-card widget-card">
                <Card.Body>
                  <Card.Title className="widget-title">Recent Activity</Card.Title>
                  {dashboardData.recentActivity.length > 0 ? (
                    <ul className="list-unstyled">
                      {dashboardData.recentActivity.map(activity => (
                        <li key={activity.id} className="recent-activity-item">
                          <span>{activity.name || 'Workout'}</span>
                          <span className="soft-text-secondary">
                            {activity.completed_date ?
                              new Date(activity.completed_date).toLocaleDateString() :
                              activity.date ?
                                new Date(activity.date).toLocaleDateString() :
                                ''
                            }
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="soft-text">No recent workouts logged.</p>
                  )}
                </Card.Body>
              </Card>
            </Col>

            {/* Right Column */}
            <Col lg={5}>
              {dashboardData.currentProgram && (
                <Card className="soft-card widget-card mb-4">
                  <Card.Body>
                    <Card.Title className="widget-title">Current Program</Card.Title>
                    <p className="program-name">{dashboardData.currentProgram.name}</p>
                    {/* <p className="soft-text-secondary">Next: {dashboardData.currentProgram.nextWorkout}</p> */}
                    <Button as={Link} to={`/programs/${dashboardData.currentProgram.id}`} className="soft-button-secondary mt-2">View Program</Button>
                  </Card.Body>
                </Card>
              )}
              <Card className="soft-card widget-card">
                <Card.Body>
                  <Card.Title className="widget-title">Navigate To...</Card.Title>
                  <div className="d-grid gap-2">
                    <Button as={Link} to="/quick-workout" className="soft-button-secondary">Quick Workout</Button>
                    <Button as={Link} to="/create-program" className="soft-button-secondary">Create Program</Button>
                    <Button as={Link} to="/exercises" className="soft-button-secondary">Exercises</Button>
                    <Button as={Link} to="/profile" className="soft-button-secondary">Profile</Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </Container>
  );
}

export default Home;