/**
 * Real-time Status Indicator Component
 * 
 * Shows the connection status of real-time coaching subscriptions
 * with detailed information about active channels and metrics.
 * 
 * Requirements: 7.2, 2.6, 4.2
 */

import React, { useState } from 'react';
import { 
  Badge, 
  Button, 
  Modal, 
  Table, 
  Alert,
  OverlayTrigger,
  Tooltip,
  Card
} from 'react-bootstrap';
import { getCoachingSubscriptionMetrics } from '../services/realtimeCoachingService';

function RealtimeStatusIndicator({ 
  isConnected = false, 
  error = null, 
  connectionStatus = {},
  compact = false,
  showDetails = true
}) {
  const [showModal, setShowModal] = useState(false);
  const [metrics, setMetrics] = useState(null);

  // Load detailed metrics
  const loadMetrics = () => {
    try {
      const currentMetrics = getCoachingSubscriptionMetrics();
      setMetrics(currentMetrics);
      setShowModal(true);
    } catch (err) {
      console.error('Failed to load metrics:', err);
    }
  };

  // Get status display
  const getStatusDisplay = () => {
    if (error) {
      return {
        variant: 'danger',
        icon: '🔴',
        text: 'ERROR',
        tooltip: `Real-time error: ${error.message || 'Connection failed'}`
      };
    }
    
    if (isConnected) {
      return {
        variant: 'success',
        icon: '🟢',
        text: 'LIVE',
        tooltip: 'Real-time updates are active'
      };
    }
    
    return {
      variant: 'warning',
      icon: '🟡',
      text: 'OFFLINE',
      tooltip: 'Real-time updates are not available'
    };
  };

  const status = getStatusDisplay();

  if (compact) {
    return (
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip>{status.tooltip}</Tooltip>}
      >
        <Badge 
          bg={status.variant} 
          className="realtime-status-compact"
          style={{ fontSize: '0.6rem', cursor: showDetails ? 'pointer' : 'default' }}
          onClick={showDetails ? loadMetrics : undefined}
        >
          {status.icon} {status.text}
        </Badge>
      </OverlayTrigger>
    );
  }

  return (
    <>
      <div className="realtime-status-indicator d-flex align-items-center">
        <Badge 
          bg={status.variant} 
          className="me-2"
          style={{ fontSize: '0.7rem' }}
        >
          {status.icon} {status.text}
        </Badge>
        
        <span className="text-muted small">
          {status.tooltip}
        </span>
        
        {showDetails && (
          <Button 
            variant="link" 
            size="sm" 
            className="p-0 ms-2 text-decoration-none"
            onClick={loadMetrics}
          >
            Details
          </Button>
        )}
      </div>

      {/* Detailed metrics modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Real-time Connection Status</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {metrics ? (
            <>
              {/* Overall Status */}
              <Alert variant={status.variant.replace('warning', 'info')}>
                <div className="d-flex align-items-center">
                  <span className="fs-4 me-3">{status.icon}</span>
                  <div>
                    <strong>Status: {status.text}</strong>
                    <br />
                    <small>{status.tooltip}</small>
                  </div>
                </div>
              </Alert>

              {/* Metrics Summary */}
              <Card className="mb-3">
                <Card.Header>
                  <h6 className="mb-0">Connection Metrics</h6>
                </Card.Header>
                <Card.Body>
                  <div className="row g-3">
                    <div className="col-md-3">
                      <div className="text-center">
                        <h4 className="text-primary mb-0">
                          {metrics.totalSubscriptions}
                        </h4>
                        <small className="text-muted">Total Subscriptions</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="text-center">
                        <h4 className="text-success mb-0">
                          {metrics.activeSubscriptions}
                        </h4>
                        <small className="text-muted">Active</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="text-center">
                        <h4 className="text-danger mb-0">
                          {metrics.errors}
                        </h4>
                        <small className="text-muted">Errors</small>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="text-center">
                        <h4 className="text-warning mb-0">
                          {metrics.reconnections}
                        </h4>
                        <small className="text-muted">Reconnections</small>
                      </div>
                    </div>
                  </div>
                </Card.Body>
              </Card>

              {/* Active Subscriptions */}
              {metrics.subscriptionNames && metrics.subscriptionNames.length > 0 && (
                <Card className="mb-3">
                  <Card.Header>
                    <h6 className="mb-0">Active Subscriptions</h6>
                  </Card.Header>
                  <Card.Body>
                    <Table responsive size="sm">
                      <thead>
                        <tr>
                          <th>Channel</th>
                          <th>Status</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.subscriptionNames.map((channelName, index) => {
                          const channelStatus = metrics.connectionStatuses[channelName] || 'UNKNOWN';
                          const channelType = channelName.includes('insights') ? 'Insights' :
                                            channelName.includes('invitations') ? 'Invitations' :
                                            channelName.includes('activity') ? 'Client Activity' : 'Unknown';
                          
                          return (
                            <tr key={index}>
                              <td>
                                <code className="small">{channelName}</code>
                              </td>
                              <td>
                                <Badge 
                                  bg={
                                    channelStatus === 'SUBSCRIBED' ? 'success' :
                                    channelStatus === 'CHANNEL_ERROR' ? 'danger' :
                                    'warning'
                                  }
                                  className="small"
                                >
                                  {channelStatus}
                                </Badge>
                              </td>
                              <td>
                                <small className="text-muted">{channelType}</small>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </Card.Body>
                </Card>
              )}

              {/* Error Information */}
              {error && (
                <Alert variant="danger">
                  <Alert.Heading>Connection Error</Alert.Heading>
                  <p className="mb-0">
                    <strong>Error:</strong> {error.message}
                  </p>
                  {error.code && (
                    <p className="mb-0">
                      <strong>Code:</strong> {error.code}
                    </p>
                  )}
                  <hr />
                  <small className="text-muted">
                    Real-time updates may not work properly. Try refreshing the page or check your internet connection.
                  </small>
                </Alert>
              )}

              {/* Troubleshooting */}
              <Card>
                <Card.Header>
                  <h6 className="mb-0">Troubleshooting</h6>
                </Card.Header>
                <Card.Body>
                  <div className="small">
                    <p><strong>If real-time updates aren't working:</strong></p>
                    <ul className="mb-0">
                      <li>Check your internet connection</li>
                      <li>Refresh the page to reconnect</li>
                      <li>Disable browser extensions that might block WebSocket connections</li>
                      <li>Contact support if the issue persists</li>
                    </ul>
                  </div>
                </Card.Body>
              </Card>
            </>
          ) : (
            <div className="text-center py-4">
              <p>Unable to load connection metrics.</p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default RealtimeStatusIndicator;