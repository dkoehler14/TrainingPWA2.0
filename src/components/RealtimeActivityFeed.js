/**
 * Real-time Activity Feed Component
 * 
 * Displays live activity updates for coaching interactions including:
 * - Client workout completions
 * - Invitation status changes
 * - Program assignments
 * - Coaching insights delivery
 * 
 * Requirements: 7.2, 2.6, 4.2
 */

import React, { useState, useEffect } from 'react';
import {
  Card,
  Badge,
  Button,
  Spinner,
  Alert,
  ListGroup,
  OverlayTrigger,
  Tooltip
} from 'react-bootstrap';
import { Link } from 'react-router-dom';

function RealtimeActivityFeed({
  activities = [],
  isConnected = false,
  error = null,
  maxItems = 10,
  showHeader = true,
  compact = false,
  onViewAll = null
}) {
  const [visibleItems, setVisibleItems] = useState(maxItems);

  // Format activity timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get activity icon and color
  const getActivityDisplay = (activity) => {
    switch (activity.type) {
      case 'workout_completed':
        return {
          icon: '✅',
          color: 'success',
          title: 'Workout Completed',
          description: 'Client completed a workout session'
        };
      case 'workout':
        if (activity.event === 'INSERT') {
          return {
            icon: '🏋️',
            color: 'primary',
            title: 'Workout Started',
            description: 'Client started a new workout'
          };
        } else if (activity.event === 'UPDATE') {
          return {
            icon: '📝',
            color: 'info',
            title: 'Workout Updated',
            description: 'Client updated their workout'
          };
        }
        break;
      case 'exercise':
        return {
          icon: '💪',
          color: 'secondary',
          title: 'Exercise Activity',
          description: 'Client updated exercise data'
        };
      case 'program':
        if (activity.event === 'INSERT') {
          return {
            icon: '📋',
            color: 'success',
            title: 'Program Assigned',
            description: 'New program was assigned'
          };
        } else if (activity.event === 'UPDATE') {
          return {
            icon: '📝',
            color: 'info',
            title: 'Program Updated',
            description: 'Program was modified'
          };
        }
        break;
      case 'insight_created':
        return {
          icon: '💡',
          color: 'warning',
          title: 'Insight Created',
          description: 'New coaching insight was created'
        };
      case 'insight_response':
        return {
          icon: '💬',
          color: 'info',
          title: 'Client Response',
          description: 'Client responded to an insight'
        };
      case 'invitation_accepted':
        return {
          icon: '🤝',
          color: 'success',
          title: 'Invitation Accepted',
          description: 'Client accepted coaching invitation'
        };
      case 'invitation_declined':
        return {
          icon: '❌',
          color: 'danger',
          title: 'Invitation Declined',
          description: 'Client declined coaching invitation'
        };
      default:
        return {
          icon: '📊',
          color: 'secondary',
          title: 'Activity',
          description: 'Client activity detected'
        };
    }
  };

  // Get client identifier from activity data
  const getClientInfo = (activity) => {
    if (activity.data?.user_id) {
      return {
        id: activity.data.user_id,
        displayId: activity.data.user_id.substring(0, 8) + '...'
      };
    }
    if (activity.data?.client_id) {
      return {
        id: activity.data.client_id,
        displayId: activity.data.client_id.substring(0, 8) + '...'
      };
    }
    return null;
  };

  // Get additional context from activity data
  const getActivityContext = (activity) => {
    const context = [];

    if (activity.data?.program_name) {
      context.push(`Program: ${activity.data.program_name}`);
    }
    if (activity.data?.exercise_name) {
      context.push(`Exercise: ${activity.data.exercise_name}`);
    }
    if (activity.data?.title) {
      context.push(`"${activity.data.title}"`);
    }
    if (activity.data?.workout_duration) {
      context.push(`Duration: ${Math.round(activity.data.workout_duration / 60)}min`);
    }

    return context;
  };

  const displayedActivities = activities.slice(0, visibleItems);

  return (
    <Card className={`soft-card ${compact ? 'compact-activity-feed' : 'activity-feed'}`}>
      {showHeader && (
        <Card.Header className="d-flex justify-content-between align-items-center">
          <div>
            <h6 className="mb-0">
              Recent Activity
              {isConnected && (
                <Badge bg="success" className="ms-2" style={{ fontSize: '0.6rem' }}>
                  🔴 LIVE
                </Badge>
              )}
            </h6>
            {error && (
              <OverlayTrigger
                placement="top"
                overlay={<Tooltip>Real-time updates unavailable</Tooltip>}
              >
                <Badge bg="warning" style={{ fontSize: '0.6rem' }}>
                  ⚠️ OFFLINE
                </Badge>
              </OverlayTrigger>
            )}
          </div>
          {activities.length > maxItems && (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={onViewAll || (() => setVisibleItems(prev => prev + 10))}
            >
              {onViewAll ? 'View All' : 'Load More'}
            </Button>
          )}
        </Card.Header>
      )}

      <Card.Body className={compact ? 'p-2' : ''}>
        {error && !isConnected && (
          <Alert variant="warning" className="mb-3">
            <small>
              Real-time updates are currently unavailable.
              Activity may not reflect the latest changes.
            </small>
          </Alert>
        )}

        {displayedActivities.length > 0 ? (
          <ListGroup variant="flush">
            {displayedActivities.map((activity, index) => {
              const display = getActivityDisplay(activity);
              const clientInfo = getClientInfo(activity);
              const context = getActivityContext(activity);

              return (
                <ListGroup.Item
                  key={`${activity.timestamp}-${index}`}
                  className={`border-0 ${compact ? 'py-2' : 'py-3'} ${index === 0 ? 'border-top-0' : ''}`}
                >
                  <div className="d-flex align-items-start">
                    <div className={`activity-icon me-3 ${compact ? 'fs-6' : 'fs-5'}`}>
                      {display.icon}
                    </div>
                    <div className="flex-grow-1 min-width-0">
                      <div className="d-flex justify-content-between align-items-start">
                        <div className="flex-grow-1">
                          <div className={`activity-title ${compact ? 'small' : ''} fw-medium`}>
                            {display.title}
                          </div>
                          <div className={`text-muted ${compact ? 'small' : ''} mb-1`}>
                            {display.description}
                          </div>

                          {/* Activity context */}
                          {context.length > 0 && (
                            <div className="activity-context">
                              {context.map((item, idx) => (
                                <small key={idx} className="text-muted me-2">
                                  {item}
                                </small>
                              ))}
                            </div>
                          )}

                          {/* Client info and timestamp */}
                          <div className="d-flex justify-content-between align-items-center mt-1">
                            <div>
                              {clientInfo && (
                                <small className="text-muted">
                                  Client: {clientInfo.displayId}
                                </small>
                              )}
                            </div>
                            <small className="text-muted">
                              {formatTimestamp(activity.timestamp)}
                            </small>
                          </div>
                        </div>

                        <Badge
                          bg={display.color}
                          className={`activity-badge ${compact ? 'small' : ''}`}
                        >
                          {activity.event || 'NEW'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </ListGroup.Item>
              );
            })}
          </ListGroup>
        ) : (
          <div className={`text-center ${compact ? 'py-3' : 'py-4'}`}>
            {isConnected ? (
              <>
                <div className="mb-2">🔄</div>
                <p className="soft-text mb-0">
                  Waiting for client activity...
                </p>
                <small className="text-muted">
                  Live updates will appear here
                </small>
              </>
            ) : (
              <>
                <div className="mb-2">📊</div>
                <p className="soft-text mb-0">
                  No recent activity
                </p>
                <small className="text-muted">
                  Activity will show when clients are active
                </small>
              </>
            )}
          </div>
        )}

        {/* Connection status indicator */}
        {!compact && (
          <div className="mt-3 pt-2 border-top">
            <div className="d-flex justify-content-between align-items-center">
              <small className="text-muted">
                {isConnected ? (
                  <span className="text-success">
                    🟢 Real-time updates active
                  </span>
                ) : (
                  <span className="text-warning">
                    🟡 Updates may be delayed
                  </span>
                )}
              </small>
              {activities.length > 0 && (
                <small className="text-muted">
                  {activities.length} total activities
                </small>
              )}
            </div>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

export default RealtimeActivityFeed;