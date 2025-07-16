/**
 * Development Error Boundary Component
 * 
 * Provides enhanced error handling and recovery options specifically for development.
 * Shows detailed error information and troubleshooting suggestions.
 */

import React from 'react';
import { 
  reportDevelopmentError, 
  ERROR_TYPES, 
  getStoredErrors, 
  clearStoredErrors,
  getServiceStatus,
  attemptServiceRecovery
} from '../utils/developmentErrorHandler';
import { isDevelopment, getDevelopmentConfig } from '../config/environment';

class DevelopmentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      serviceStatus: {},
      recoveryAttempts: 0
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo,
      serviceStatus: getServiceStatus()
    });

    // Report the error using our development error handler
    reportDevelopmentError(
      error,
      ERROR_TYPES.SERVICE_STARTUP,
      null,
      {
        componentStack: errorInfo.componentStack,
        errorBoundary: true
      }
    );
  }

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      recoveryAttempts: prevState.recoveryAttempts + 1
    }));
  };

  handleServiceRecovery = async (service) => {
    console.log(`Attempting to recover ${service}...`);
    const success = await attemptServiceRecovery(service);
    
    if (success) {
      this.setState({
        serviceStatus: getServiceStatus()
      });
    }
    
    return success;
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  clearErrors = () => {
    clearStoredErrors();
    this.forceUpdate();
  };

  render() {
    if (!isDevelopment) {
      // In production, use a simple error boundary
      if (this.state.hasError) {
        return (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>Something went wrong</h2>
            <p>Please refresh the page and try again.</p>
            <button onClick={this.handleRetry}>Retry</button>
          </div>
        );
      }
      return this.props.children;
    }

    if (this.state.hasError) {
      const { error, errorInfo, showDetails, serviceStatus } = this.state;
      const developmentConfig = getDevelopmentConfig();
      const storedErrors = getStoredErrors();

      return (
        <div style={styles.errorContainer}>
          <div style={styles.errorHeader}>
            <h1 style={styles.errorTitle}>🚨 Development Error</h1>
            <p style={styles.errorMessage}>
              An error occurred in the React application. This enhanced error boundary 
              provides detailed information to help you debug the issue.
            </p>
          </div>

          <div style={styles.errorActions}>
            <button onClick={this.handleRetry} style={styles.button}>
              🔄 Retry Application
            </button>
            <button onClick={this.toggleDetails} style={styles.button}>
              {showDetails ? '📄 Hide Details' : '🔍 Show Details'}
            </button>
            <button onClick={this.clearErrors} style={styles.button}>
              🧹 Clear Error History
            </button>
          </div>

          {/* Error Details */}
          {showDetails && (
            <div style={styles.detailsContainer}>
              <div style={styles.section}>
                <h3>Error Information</h3>
                <pre style={styles.codeBlock}>
                  <strong>Message:</strong> {error?.message || 'Unknown error'}
                  {'\n'}
                  <strong>Stack:</strong> {error?.stack || 'No stack trace available'}
                </pre>
              </div>

              {errorInfo && (
                <div style={styles.section}>
                  <h3>Component Stack</h3>
                  <pre style={styles.codeBlock}>
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}

              {/* Service Status */}
              <div style={styles.section}>
                <h3>Firebase Service Status</h3>
                <div style={styles.serviceGrid}>
                  {Object.entries(serviceStatus).map(([service, status]) => (
                    <div key={service} style={styles.serviceCard}>
                      <div style={styles.serviceHeader}>
                        <span style={styles.serviceName}>{service}</span>
                        <span style={{
                          ...styles.serviceStatus,
                          color: status.connected ? '#4CAF50' : '#f44336'
                        }}>
                          {status.connected ? '✅ Connected' : '❌ Disconnected'}
                        </span>
                      </div>
                      {status.error && (
                        <div style={styles.serviceError}>
                          Error: {status.error.message}
                        </div>
                      )}
                      {!status.connected && (
                        <button 
                          onClick={() => this.handleServiceRecovery(service)}
                          style={styles.recoveryButton}
                        >
                          🔄 Attempt Recovery
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Development Configuration */}
              <div style={styles.section}>
                <h3>Development Configuration</h3>
                <pre style={styles.codeBlock}>
                  {JSON.stringify(developmentConfig, null, 2)}
                </pre>
              </div>

              {/* Error History */}
              {storedErrors.length > 0 && (
                <div style={styles.section}>
                  <h3>Recent Error History ({storedErrors.length})</h3>
                  <div style={styles.errorHistory}>
                    {storedErrors.slice(-5).map((errorEntry, index) => (
                      <div key={index} style={styles.errorHistoryItem}>
                        <div style={styles.errorHistoryHeader}>
                          <span>{errorEntry.type}</span>
                          <span>{new Date(errorEntry.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div style={styles.errorHistoryMessage}>
                          {errorEntry.service && `[${errorEntry.service}] `}
                          {errorEntry.message}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Troubleshooting Tips */}
          <div style={styles.section}>
            <h3>🔧 Quick Troubleshooting</h3>
            <ul style={styles.troubleshootingList}>
              <li>Make sure Firebase emulators are running: <code>firebase emulators:start</code></li>
              <li>Check that all required ports are available (8080, 9099, 5001)</li>
              <li>Verify your .env.development file has correct configuration</li>
              <li>Try clearing browser cache and local storage</li>
              <li>Check the browser console for additional error details</li>
              <li>Restart the development server if issues persist</li>
            </ul>
          </div>

          {/* Recovery Attempts Counter */}
          {this.state.recoveryAttempts > 0 && (
            <div style={styles.recoveryInfo}>
              Recovery attempts: {this.state.recoveryAttempts}
            </div>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

// Styles for the error boundary
const styles = {
  errorContainer: {
    padding: '20px',
    margin: '20px',
    border: '2px solid #f44336',
    borderRadius: '8px',
    backgroundColor: '#fff5f5',
    fontFamily: 'monospace',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  errorHeader: {
    marginBottom: '20px'
  },
  errorTitle: {
    color: '#f44336',
    margin: '0 0 10px 0'
  },
  errorMessage: {
    color: '#666',
    lineHeight: '1.5'
  },
  errorActions: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  button: {
    padding: '8px 16px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#f8f9fa',
    cursor: 'pointer',
    fontSize: '14px'
  },
  detailsContainer: {
    marginTop: '20px'
  },
  section: {
    marginBottom: '20px',
    padding: '15px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#f8f9fa'
  },
  codeBlock: {
    backgroundColor: '#f1f1f1',
    padding: '10px',
    borderRadius: '4px',
    overflow: 'auto',
    fontSize: '12px',
    whiteSpace: 'pre-wrap'
  },
  serviceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '10px'
  },
  serviceCard: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#fff'
  },
  serviceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '5px'
  },
  serviceName: {
    fontWeight: 'bold',
    textTransform: 'capitalize'
  },
  serviceStatus: {
    fontSize: '12px'
  },
  serviceError: {
    fontSize: '11px',
    color: '#f44336',
    marginBottom: '5px'
  },
  recoveryButton: {
    padding: '4px 8px',
    fontSize: '11px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    backgroundColor: '#e3f2fd',
    cursor: 'pointer'
  },
  errorHistory: {
    maxHeight: '200px',
    overflow: 'auto'
  },
  errorHistoryItem: {
    padding: '8px',
    marginBottom: '5px',
    border: '1px solid #ddd',
    borderRadius: '3px',
    backgroundColor: '#fff'
  },
  errorHistoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#666',
    marginBottom: '3px'
  },
  errorHistoryMessage: {
    fontSize: '12px'
  },
  troubleshootingList: {
    paddingLeft: '20px'
  },
  recoveryInfo: {
    marginTop: '10px',
    padding: '8px',
    backgroundColor: '#e8f5e8',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#2e7d32'
  }
};

export default DevelopmentErrorBoundary;