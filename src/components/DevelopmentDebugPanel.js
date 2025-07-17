/**
 * Development Debug Panel Component
 * 
 * Provides a UI panel for viewing debugging information, service status,
 * and development tools in the browser.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Badge, Collapse, Table, Alert } from 'react-bootstrap';
import { 
  getDevelopmentDebuggingStatus,
  serviceStatusLogger,
  developmentLogger
} from '../utils/developmentDebugger';
import { getStoredErrors, clearStoredErrors } from '../utils/developmentErrorHandler';

const DevelopmentDebugPanel = () => {
  const [debugStatus, setDebugStatus] = useState(null);
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('status');
  const [storedErrors, setStoredErrors] = useState([]);

  const refreshDebugInfo = useCallback(() => {
    try {
      const status = getDevelopmentDebuggingStatus();
      setDebugStatus(status);
      
      const errors = getStoredErrors();
      setStoredErrors(errors);
    } catch (error) {
      console.error('Failed to refresh debug info:', error);
    }
  }, []);

  useEffect(() => {
    // Only run in development mode
    if (process.env.NODE_ENV !== 'development') {
      return;
    }

    // Initial load
    refreshDebugInfo();

    // Set up auto-refresh
    const interval = setInterval(refreshDebugInfo, 5000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [refreshDebugInfo]);

  // Only render in development mode
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const handleClearErrors = () => {
    clearStoredErrors();
    setStoredErrors([]);
    developmentLogger.info('🧹 Debug errors cleared by user');
  };

  const getServiceStatusBadge = (service) => {
    if (!debugStatus?.services?.firebase?.services?.[service]) {
      return <Badge bg="secondary">Unknown</Badge>;
    }

    const serviceInfo = debugStatus.services.firebase.services[service];
    if (serviceInfo.status === 'connected') {
      return <Badge bg="success">Connected</Badge>;
    } else if (serviceInfo.status === 'failed') {
      return <Badge bg="danger">Failed</Badge>;
    } else {
      return <Badge bg="warning">Initializing</Badge>;
    }
  };

  const getEmulatorStatusBadge = (service) => {
    if (!debugStatus?.services?.emulators) {
      return <Badge bg="secondary">Unknown</Badge>;
    }

    const emulators = debugStatus.services.emulators;
    if (emulators.connectedServices?.includes(service)) {
      return <Badge bg="success">Connected</Badge>;
    } else if (emulators.failedServices?.includes(service)) {
      return <Badge bg="danger">Failed</Badge>;
    } else {
      return <Badge bg="warning">Checking</Badge>;
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleTimeString();
  };

  const renderStatusTab = () => (
    <div>
      <h6>Environment Status</h6>
      <Table size="sm" striped>
        <tbody>
          <tr>
            <td>Development Mode</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.isDevelopment ? 'success' : 'danger'}>
                {debugStatus?.capabilities?.isDevelopment ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
          </tr>
          <tr>
            <td>Emulator Mode</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.isEmulatorMode ? 'success' : 'secondary'}>
                {debugStatus?.capabilities?.isEmulatorMode ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
          </tr>
          <tr>
            <td>Source Maps</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.sourceMapSupport?.enabled ? 'success' : 'warning'}>
                {debugStatus?.capabilities?.sourceMapSupport?.enabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
          </tr>
          <tr>
            <td>React DevTools</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.debugging?.reactDevTools ? 'success' : 'warning'}>
                {debugStatus?.capabilities?.debugging?.reactDevTools ? 'Available' : 'Not Available'}
              </Badge>
            </td>
          </tr>
        </tbody>
      </Table>

      <h6 className="mt-3">Firebase Services</h6>
      <Table size="sm" striped>
        <tbody>
          <tr>
            <td>Firestore</td>
            <td>{getServiceStatusBadge('firestore')}</td>
            <td>{getEmulatorStatusBadge('firestore')}</td>
          </tr>
          <tr>
            <td>Authentication</td>
            <td>{getServiceStatusBadge('auth')}</td>
            <td>{getEmulatorStatusBadge('auth')}</td>
          </tr>
          <tr>
            <td>Functions</td>
            <td>{getServiceStatusBadge('functions')}</td>
            <td>{getEmulatorStatusBadge('functions')}</td>
          </tr>
        </tbody>
      </Table>
    </div>
  );

  const renderErrorsTab = () => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6>Development Errors ({storedErrors.length})</h6>
        <Button size="sm" variant="outline-danger" onClick={handleClearErrors}>
          Clear Errors
        </Button>
      </div>
      
      {storedErrors.length === 0 ? (
        <Alert variant="success">No development errors recorded</Alert>
      ) : (
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {storedErrors.slice().reverse().map((error, index) => (
            <Alert key={index} variant="warning" className="mb-2">
              <div className="d-flex justify-content-between">
                <strong>{error.type}</strong>
                <small>{formatTimestamp(error.timestamp)}</small>
              </div>
              <div>
                <strong>Service:</strong> {error.service || 'General'}
              </div>
              <div>
                <strong>Message:</strong> {error.message}
              </div>
              {error.context && Object.keys(error.context).length > 0 && (
                <details className="mt-2">
                  <summary>Context</summary>
                  <pre style={{ fontSize: '0.8em', marginTop: '0.5em' }}>
                    {JSON.stringify(error.context, null, 2)}
                  </pre>
                </details>
              )}
            </Alert>
          ))}
        </div>
      )}
    </div>
  );

  const renderCapabilitiesTab = () => (
    <div>
      <h6>Development Capabilities</h6>
      <Table size="sm" striped>
        <tbody>
          <tr>
            <td>Console Logging</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.debugging?.consoleLogging ? 'success' : 'secondary'}>
                {debugStatus?.capabilities?.debugging?.consoleLogging ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
          </tr>
          <tr>
            <td>Verbose Logging</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.debugging?.verboseLogging ? 'success' : 'secondary'}>
                {debugStatus?.capabilities?.debugging?.verboseLogging ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
          </tr>
          <tr>
            <td>Error Reporting</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.debugging?.errorReporting ? 'success' : 'secondary'}>
                {debugStatus?.capabilities?.debugging?.errorReporting ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
          </tr>
          <tr>
            <td>Performance Monitoring</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.performance?.monitoring ? 'success' : 'secondary'}>
                {debugStatus?.capabilities?.performance?.monitoring ? 'Enabled' : 'Disabled'}
              </Badge>
            </td>
          </tr>
          <tr>
            <td>Web Vitals API</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.performance?.webVitals ? 'success' : 'warning'}>
                {debugStatus?.capabilities?.performance?.webVitals ? 'Available' : 'Not Available'}
              </Badge>
            </td>
          </tr>
          <tr>
            <td>Memory Info</td>
            <td>
              <Badge bg={debugStatus?.capabilities?.performance?.memoryInfo ? 'success' : 'warning'}>
                {debugStatus?.capabilities?.performance?.memoryInfo ? 'Available' : 'Not Available'}
              </Badge>
            </td>
          </tr>
        </tbody>
      </Table>

      {debugStatus?.capabilities?.browser && (
        <>
          <h6 className="mt-3">Browser Information</h6>
          <Table size="sm" striped>
            <tbody>
              <tr>
                <td>User Agent</td>
                <td style={{ fontSize: '0.8em' }}>{debugStatus.capabilities.browser.userAgent}</td>
              </tr>
              <tr>
                <td>Language</td>
                <td>{debugStatus.capabilities.browser.language}</td>
              </tr>
              <tr>
                <td>Online Status</td>
                <td>
                  <Badge bg={debugStatus.capabilities.browser.onLine ? 'success' : 'danger'}>
                    {debugStatus.capabilities.browser.onLine ? 'Online' : 'Offline'}
                  </Badge>
                </td>
              </tr>
              <tr>
                <td>Local Storage</td>
                <td>
                  <Badge bg={debugStatus.capabilities.browser.localStorage ? 'success' : 'danger'}>
                    {debugStatus.capabilities.browser.localStorage ? 'Available' : 'Not Available'}
                  </Badge>
                </td>
              </tr>
            </tbody>
          </Table>
        </>
      )}
    </div>
  );

  if (!debugStatus) {
    return (
      <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 9999 }}>
        <Button variant="outline-secondary" size="sm" disabled>
          Loading Debug Info...
        </Button>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', top: '10px', right: '10px', zIndex: 9999 }}>
      <Button 
        variant="outline-info" 
        size="sm" 
        onClick={() => setShowPanel(!showPanel)}
        className="mb-2"
      >
        🔧 Debug Panel {storedErrors.length > 0 && (
          <Badge bg="danger" className="ms-1">{storedErrors.length}</Badge>
        )}
      </Button>
      
      <Collapse in={showPanel}>
        <Card style={{ width: '400px', maxHeight: '500px' }}>
          <Card.Header>
            <div className="d-flex justify-content-between align-items-center">
              <span>Development Debug Panel</span>
              <Button 
                variant="outline-secondary" 
                size="sm" 
                onClick={refreshDebugInfo}
              >
                🔄
              </Button>
            </div>
            <div className="mt-2">
              <Button 
                size="sm" 
                variant={activeTab === 'status' ? 'primary' : 'outline-primary'}
                onClick={() => setActiveTab('status')}
                className="me-1"
              >
                Status
              </Button>
              <Button 
                size="sm" 
                variant={activeTab === 'errors' ? 'primary' : 'outline-primary'}
                onClick={() => setActiveTab('errors')}
                className="me-1"
              >
                Errors {storedErrors.length > 0 && (
                  <Badge bg="light" text="dark">{storedErrors.length}</Badge>
                )}
              </Button>
              <Button 
                size="sm" 
                variant={activeTab === 'capabilities' ? 'primary' : 'outline-primary'}
                onClick={() => setActiveTab('capabilities')}
              >
                Capabilities
              </Button>
            </div>
          </Card.Header>
          <Card.Body style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {activeTab === 'status' && renderStatusTab()}
            {activeTab === 'errors' && renderErrorsTab()}
            {activeTab === 'capabilities' && renderCapabilitiesTab()}
          </Card.Body>
          <Card.Footer className="text-muted" style={{ fontSize: '0.8em' }}>
            Last updated: {formatTimestamp(debugStatus.timestamp)}
          </Card.Footer>
        </Card>
      </Collapse>
    </div>
  );
};

export default DevelopmentDebugPanel;