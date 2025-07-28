/**
 * WorkoutRealtimeIndicator Component
 * 
 * Displays real-time connection status and recent updates for workout logging.
 * Shows live progress updates, set completions, and exercise additions.
 */

import React, { useState, useEffect } from 'react';
import { Badge, Alert, Toast, ToastContainer } from 'react-bootstrap';
import { 
  Broadcast, 
  CheckCircleFill, 
  PlusCircleFill, 
  TrendingUp,
  ExclamationTriangle
} from 'react-bootstrap-icons';
import { useRealtimeChannelManager } from '../utils/realtimeChannelManager';

const WorkoutRealtimeIndicator = ({ 
  userId, 
  programId, 
  weekIndex, 
  dayIndex,
  isActive = true,
  showToasts = true,
  className = ''
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [recentUpdates, setRecentUpdates] = useState([]);
  const [toasts, setToasts] = useState([]);
  const channelManager = useRealtimeChannelManager();

  useEffect(() => {
    if (!isActive || !userId || !programId || weekIndex === null || dayIndex === null) {
      return;
    }

    // Create workout-specific real-time channel
    const channelName = `workout_${userId}_${programId}_${weekIndex}_${dayIndex}`;
    
    const channel = channelManager.createWorkoutChannel(
      userId, 
      programId, 
      weekIndex, 
      dayIndex,
      {
        onUpdate: (updateData) => {
          console.log('🔄 Real-time workout update:', updateData);
          handleRealtimeUpdate(updateData);
        },
        onBroadcast: (broadcastData) => {
          console.log('📡 Real-time broadcast:', broadcastData);
          handleRealtimeBroadcast(broadcastData);
        },
        onPresenceChange: (presenceData) => {
          console.log('👥 Presence change:', presenceData);
          // Could show other users working out
        }
      }
    );

    // Subscribe to the channel
    channelManager.subscribeChannel(channelName, {
      onStatusChange: (status) => {
        setIsConnected(status === 'SUBSCRIBED');
      },
      onError: (error) => {
        console.error('Real-time connection error:', error);
        setIsConnected(false);
      }
    }).catch(error => {
      console.error('Failed to subscribe to real-time channel:', error);
      setIsConnected(false);
    });

    // Cleanup on unmount
    return () => {
      channelManager.removeChannel(channelName);
    };
  }, [userId, programId, weekIndex, dayIndex, isActive, channelManager]);

  const handleRealtimeUpdate = (updateData) => {
    const update = {
      id: Date.now(),
      type: updateData.table,
      timestamp: updateData.timestamp,
      data: updateData
    };

    setRecentUpdates(prev => [update, ...prev.slice(0, 4)]); // Keep last 5 updates

    // Show toast notification
    if (showToasts) {
      let toastMessage = '';
      let toastVariant = 'info';
      let toastIcon = <TrendingUp />;

      switch (updateData.table) {
        case 'workout_logs':
          if (updateData.eventType === 'UPDATE') {
            toastMessage = 'Workout progress saved';
            toastVariant = 'success';
            toastIcon = <CheckCircleFill />;
          }
          break;
        case 'workout_log_exercises':
          if (updateData.eventType === 'INSERT') {
            toastMessage = 'Exercise added to workout';
            toastVariant = 'info';
            toastIcon = <PlusCircleFill />;
          } else if (updateData.eventType === 'UPDATE') {
            toastMessage = 'Exercise progress updated';
            toastVariant = 'success';
            toastIcon = <CheckCircleFill />;
          }
          break;
        case 'user_analytics':
          toastMessage = 'Analytics updated';
          toastVariant = 'info';
          toastIcon = <TrendingUp />;
          break;
      }

      if (toastMessage) {
        addToast(toastMessage, toastVariant, toastIcon);
      }
    }

    // Clear old updates after 30 seconds
    setTimeout(() => {
      setRecentUpdates(prev => prev.filter(u => u.id !== update.id));
    }, 30000);
  };

  const handleRealtimeBroadcast = (broadcastData) => {
    const { type, payload } = broadcastData;

    if (showToasts) {
      let toastMessage = '';
      let toastVariant = 'info';
      let toastIcon = <Broadcast />;

      switch (type) {
        case 'set_completion':
          toastMessage = `Set ${payload.setIndex + 1} completed`;
          toastVariant = 'success';
          toastIcon = <CheckCircleFill />;
          break;
        case 'exercise_completion':
          toastMessage = `${payload.exerciseName} completed`;
          toastVariant = 'success';
          toastIcon = <CheckCircleFill />;
          break;
        case 'workout_progress':
          toastMessage = `Workout ${payload.percentage}% complete`;
          toastVariant = 'info';
          toastIcon = <TrendingUp />;
          break;
      }

      if (toastMessage) {
        addToast(toastMessage, toastVariant, toastIcon);
      }
    }
  };

  const addToast = (message, variant, icon) => {
    const toast = {
      id: Date.now(),
      message,
      variant,
      icon,
      timestamp: new Date()
    };

    setToasts(prev => [toast, ...prev.slice(0, 2)]); // Keep max 3 toasts

    // Auto-remove toast after 3 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, 3000);
  };

  const removeToast = (toastId) => {
    setToasts(prev => prev.filter(t => t.id !== toastId));
  };

  if (!isActive) {
    return null;
  }

  return (
    <>
      <div className={`d-flex align-items-center ${className}`}>
        <Badge 
          bg={isConnected ? 'success' : 'secondary'} 
          className="d-flex align-items-center me-2"
          title={isConnected ? 'Real-time updates active' : 'Real-time updates inactive'}
        >
          <Broadcast className="me-1" size={12} />
          {isConnected ? 'Live' : 'Offline'}
        </Badge>
        
        {recentUpdates.length > 0 && (
          <small className="text-success">
            {recentUpdates.length} recent update{recentUpdates.length !== 1 ? 's' : ''}
          </small>
        )}
      </div>

      {/* Connection error alert */}
      {!isConnected && isActive && (
        <Alert variant="warning" className="mt-2 py-2">
          <ExclamationTriangle className="me-2" />
          <small>Real-time updates temporarily unavailable. Your progress is still being saved.</small>
        </Alert>
      )}

      {/* Toast notifications */}
      {showToasts && (
        <ToastContainer position="top-end" className="p-3">
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              onClose={() => removeToast(toast.id)}
              show={true}
              delay={3000}
              autohide
              bg={toast.variant}
            >
              <Toast.Body className="d-flex align-items-center text-white">
                {toast.icon && <span className="me-2">{toast.icon}</span>}
                {toast.message}
              </Toast.Body>
            </Toast>
          ))}
        </ToastContainer>
      )}
    </>
  );
};

export default WorkoutRealtimeIndicator;