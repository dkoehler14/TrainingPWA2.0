import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Spinner } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import {
  getDocCached,
  getCollectionCached,
  warmUserCache,
  getCacheStats
} from '../api/enhancedFirestoreCache';
import ErrorMessage from '../components/ErrorMessage';
import '../styles/Home.css';

// A simple chart component placeholder
const ProgressSnapshot = () => (
  <div className="progress-snapshot-placeholder">
    <p className="soft-text">Progress chart coming soon...</p>
  </div>
);

function Home({ user }) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cacheWarmed, setCacheWarmed] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    userName: '',
    volumeLifted: 0,
    prsThisMonth: 0,
    currentProgram: null,
    recentActivity: [],
  });

  // Cache warming effect - runs once when user is available
  useEffect(() => {
    if (!user || cacheWarmed) return;

    const warmCache = async () => {
      try {
        console.log('🔥 Warming cache for Home dashboard...');
        
        // Warm user-specific cache with high priority for dashboard
        await warmUserCache(user.uid, 'high');
        setCacheWarmed(true);
        
        // Log cache stats for debugging
        if (process.env.NODE_ENV === 'development') {
          const stats = getCacheStats();
          console.log('📊 Cache stats after warming:', stats);
        }
      } catch (error) {
        console.warn('⚠️ Cache warming failed, continuing with normal loading:', error);
        setCacheWarmed(true); // Continue anyway
      }
    };

    warmCache();
  }, [user, cacheWarmed]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Enhanced cache usage with longer TTL for user profile (30 minutes)
        const userProfile = await getDocCached('users', user.uid, 30 * 60 * 1000);
        
        // Fetch workout logs for stats with optimized caching (15 minutes)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const workoutLogs = await getCollectionCached('workoutLogs', {
          where: [['userId', '==', user.uid], ['date', '>=', sevenDaysAgo]],
          orderBy: [['date', 'desc']],
          limit: 5
        }, 15 * 60 * 1000); // 15-minute cache for recent activity

        // Fetch current program with extended cache (1 hour)
        let currentProgram = null;
        if (userProfile && userProfile.activeProgramId) {
          currentProgram = await getDocCached('programs', userProfile.activeProgramId, 60 * 60 * 1000);
        }
        
        // **Data Processing (Simplified)**
        // NOTE: In a real app, these calculations might be more complex or done server-side.
        // Calculate total volume for the week using reps and weights arrays
        const volumeThisWeek = workoutLogs.reduce((total, log) =>
          total + log.exercises.reduce((vol, ex) => {
            // If reps and weights are arrays, sum over all sets
            if (Array.isArray(ex.reps) && Array.isArray(ex.weights)) {
              return vol + ex.reps.reduce((setSum, r, i) => setSum + (Number(r) * Number(ex.weights[i] ?? 0)), 0);
            }
            // Fallback for legacy data
            if (typeof ex.sets === 'number' && typeof ex.reps === 'number' && typeof ex.weight === 'number') {
              return vol + (ex.sets * ex.reps * ex.weight);
            }
            return vol;
          }, 0), 0);

        setDashboardData({
          userName: userProfile?.name || user.email,
          volumeLifted: volumeThisWeek,
          prsThisMonth: 0, // Placeholder - PR calculation is complex
          currentProgram: currentProgram,
          recentActivity: workoutLogs,
        });

      } catch (e) {
        console.error("Error fetching dashboard data:", e);
        setError("Failed to load dashboard data. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, cacheWarmed]); // Include cacheWarmed to ensure data loads after cache warming

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
                          <span className="soft-text-secondary">{
                            (() => {
                              // Robust date handling: Firestore Timestamp or JS Date
                              let d = activity.date;
                              if (d && typeof d.toDate === 'function') {
                                d = d.toDate();
                              } else if (d && typeof d.seconds === 'number') {
                                d = new Date(d.seconds * 1000);
                              } else if (!(d instanceof Date)) {
                                d = new Date(d);
                              }
                              return d && !isNaN(d) ? d.toLocaleDateString() : '';
                            })()
                          }</span>
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