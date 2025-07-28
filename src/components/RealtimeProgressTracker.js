/**
 * RealtimeProgressTracker Component
 * 
 * Provides real-time progress tracking capabilities with PR notifications,
 * analytics updates, and exercise history changes.
 */

import React, { useState, useEffect } from 'react';
import { Card, Badge, Alert, ProgressBar, ListGroup } from 'react-bootstrap';
import { 
  TrendingUp, 
  Trophy, 
  Activity, 
  Broadcast,
  CheckCircleFill,
  ExclamationTriangle
} from 'react-bootstrap-icons';
import { useRealtimeProgress, useRealtimePRNotifications } from '../hooks/useRealtimeProgress';

const RealtimeProgressTracker = ({ 
  exerciseId = null,
  showPRNotifications = true,
  showAnalyticsUpdates = true,
  showHistoryUpdates = true,
  className = '',
  compact = false
}) => {
  const [recentPRs, setRecentPRs] = useState([]);
  const [analyticsChanges, setAnalyticsChanges] = useState([]);

  // Real-time progress tracking
  const {
    analytics,
    exerciseHistory,
    isConnected,
    lastUpdate
  } = useRealtimeProgress({
    enabled: true,
    exerciseId,
    onAnalyticsUpdate: (update) => {
      if (showAnalyticsUpdates) {
        setAnalyticsChanges(prev => [
          {
            id: Date.now(),
            exerciseId: update.data.exercise_id,
            exerciseName: update.data.exercises?.name || 'Unknown Exercise',
            type: 'analytics',
            timestamp: update.timestamp,
            data: update.data
          },
          ...prev.slice(0, 4) // Keep last 5 changes
        ]);

        // Clear old changes after 30 seconds
        setTimeout(() => {
          setAnalyticsChanges(current => 
            current.filter(change => Date.now() - new Date(change.timestamp) < 30000)
          );
        }, 30000);
      }
    },
    onHistoryUpdate: (update) => {
      console.log('📊 Exercise history updated:', update);
      // Could add history change tracking here
    }
  });

  // PR notifications
  const {
    prNotifications,
    clearPRNotifications
  } = useRealtimePRNotifications({
    enabled: showPRNotifications,
    showNotifications: false, // We'll handle display ourselves
    onPR: (prUpdate) => {
      setRecentPRs(prev => [prUpdate, ...prev.slice(0, 2)]); // Keep last 3 PRs
      
      // Clear old PRs after 60 seconds
      setTimeout(() => {
        setRecentPRs(current => 
          current.filter(pr => Date.now() - new Date(pr.date) < 60000)
        );
      }, 60000);
    }
  });

  // Calculate progress metrics
  const getProgressMetrics = () => {
    if (!analytics || analytics.length === 0) {
      return { totalExercises: 0, totalVolume: 0, recentPRs: 0 };
    }

    const totalExercises = analytics.length;
    const totalVolume = analytics.reduce((sum, analytic) => sum + (analytic.total_volume || 0), 0);
    const recentPRCount = analytics.filter(analytic => {
      if (!analytic.pr_date) return false;
      const prDate = new Date(analytic.pr_date);
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return prDate > thirtyDaysAgo;
    }).length;

    return {
      totalExercises,
      totalVolume: Math.round(totalVolume),
      recentPRs: recentPRCount
    };
  };

  const metrics = getProgressMetrics();

  if (compact) {
    return (
      <div className={`d-flex align-items-center ${className}`}>
        <Badge 
          bg={isConnected ? 'success' : 'secondary'} 
          className="d-flex align-items-center me-2"
        >
          <Broadcast className="me-1" size={12} />
          {isConnected ? 'Live' : 'Offline'}
        </Badge>
        
        {recentPRs.length > 0 && (
          <Badge bg="warning" className="d-flex align-items-center me-2">
            <Trophy className="me-1" size={12} />
            {recentPRs.length} PR{recentPRs.length !== 1 ? 's' : ''}
          </Badge>
        )}

        {analyticsChanges.length > 0 && (
          <Badge bg="info" className="d-flex align-items-center">
            <TrendingUp className="me-1" size={12} />
            {analyticsChanges.length} update{analyticsChanges.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className={`${className}`}>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center">
          <Activity className="me-2" />
          <h6 className="mb-0">Real-time Progress</h6>
        </div>
        <Badge 
          bg={isConnected ? 'success' : 'secondary'} 
          className="d-flex align-items-center"
        >
          <Broadcast className="me-1" size={12} />
          {isConnected ? 'Live' : 'Offline'}
        </Badge>
      </Card.Header>
      
      <Card.Body>
        {/* Connection error */}
        {!isConnected && (
          <Alert variant="warning" className="mb-3 py-2">
            <ExclamationTriangle className="me-2" />
            <small>Real-time updates temporarily unavailable</small>
          </Alert>
        )}

        {/* Progress metrics */}
        <div className="row text-center mb-3">
          <div className="col-4">
            <div className="h5 mb-0 text-primary">{metrics.totalExercises}</div>
            <small className="text-muted">Exercises</small>
          </div>
          <div className="col-4">
            <div className="h5 mb-0 text-success">{metrics.totalVolume}</div>
            <small className="text-muted">Total Volume</small>
          </div>
          <div className="col-4">
            <div className="h5 mb-0 text-warning">{metrics.recentPRs}</div>
            <small className="text-muted">Recent PRs</small>
          </div>
        </div>

        {/* Recent PR notifications */}
        {showPRNotifications && recentPRs.length > 0 && (
          <Alert variant="success" className="mb-3 py-2">
            <div className="d-flex align-items-center mb-2">
              <Trophy className="me-2" />
              <strong>New Personal Records!</strong>
            </div>
            {recentPRs.map((pr, index) => (
              <div key={index} className="small">
                <strong>{pr.exerciseName}:</strong> {pr.newPR} lbs 
                <span className="text-success"> (+{pr.improvement})</span>
              </div>
            ))}
          </Alert>
        )}

        {/* Analytics updates */}
        {showAnalyticsUpdates && analyticsChanges.length > 0 && (
          <div>
            <div className="d-flex align-items-center mb-2">
              <TrendingUp className="me-2 text-info" />
              <small className="text-muted">Recent Analytics Updates</small>
            </div>
            <ListGroup variant="flush">
              {analyticsChanges.slice(0, 3).map(change => (
                <ListGroup.Item key={change.id} className="px-0 py-1">
                  <div className="d-flex justify-content-between align-items-center">
                    <small>
                      <strong>{change.exerciseName}</strong> analytics updated
                    </small>
                    <small className="text-muted">
                      {Math.floor((Date.now() - new Date(change.timestamp)) / 1000)}s ago
                    </small>
                  </div>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
        )}

        {/* Last update timestamp */}
        {lastUpdate && (
          <div className="text-center mt-3">
            <small className="text-muted">
              Last update: {new Date(lastUpdate.timestamp).toLocaleTimeString()}
            </small>
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default RealtimeProgressTracker;