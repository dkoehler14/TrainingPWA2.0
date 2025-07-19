/**
 * WorkoutHistoryErrorBoundary Component
 * 
 * Production-ready error boundary specifically for the Quick Workout History feature.
 * Provides graceful error handling with user-friendly messages and recovery options.
 */

import React from 'react';
import { Alert, Button, Container, Card } from 'react-bootstrap';
import { ExclamationTriangle, ArrowClockwise, House } from 'react-bootstrap-icons';

class WorkoutHistoryErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('WorkoutHistoryErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Report error to monitoring service if available
    if (window.gtag) {
      window.gtag('event', 'exception', {
        description: error.toString(),
        fatal: false,
        custom_map: {
          component: 'WorkoutHistory',
          errorBoundary: true
        }
      });
    }
  }

  handleRetry = () => {
    this.setState(prevState => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prevState.retryCount + 1
    }));
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { error, retryCount } = this.state;
      
      // Determine error type and provide appropriate message
      let errorTitle = 'Something went wrong';
      let errorMessage = 'An unexpected error occurred while loading your workout history.';
      let showRetry = true;
      
      if (error?.message?.includes('Network')) {
        errorTitle = 'Connection Problem';
        errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
      } else if (error?.message?.includes('Firebase') || error?.message?.includes('Firestore')) {
        errorTitle = 'Database Error';
        errorMessage = 'There was a problem accessing your workout data. This is usually temporary.';
      } else if (error?.message?.includes('Permission')) {
        errorTitle = 'Access Denied';
        errorMessage = 'You don\'t have permission to access this workout data. Please sign in again.';
        showRetry = false;
      } else if (retryCount >= 3) {
        errorTitle = 'Persistent Error';
        errorMessage = 'The error persists after multiple attempts. Please try refreshing the page or contact support if the problem continues.';
        showRetry = false;
      }

      return (
        <Container className="py-5">
          <Card className="soft-card">
            <Card.Body className="text-center py-5">
              <div className="mb-4">
                <ExclamationTriangle size={64} className="text-warning mb-3" />
                <h3 className="text-danger mb-3">{errorTitle}</h3>
                <p className="text-muted mb-4 mx-auto" style={{ maxWidth: '500px' }}>
                  {errorMessage}
                </p>
              </div>

              <div className="d-flex justify-content-center gap-3 flex-wrap">
                {showRetry && (
                  <Button 
                    variant="primary" 
                    onClick={this.handleRetry}
                    className="d-flex align-items-center"
                  >
                    <ArrowClockwise className="me-2" />
                    Try Again
                  </Button>
                )}
                
                <Button 
                  variant="outline-secondary" 
                  onClick={this.handleGoHome}
                  className="d-flex align-items-center"
                >
                  <House className="me-2" />
                  Go Home
                </Button>
                
                <Button 
                  variant="outline-info" 
                  onClick={() => window.location.reload()}
                  className="d-flex align-items-center"
                >
                  <ArrowClockwise className="me-2" />
                  Refresh Page
                </Button>
              </div>

              {retryCount > 0 && (
                <Alert variant="info" className="mt-4 mb-0">
                  <small>
                    Retry attempts: {retryCount}
                    {retryCount >= 2 && ' - If the problem persists, try refreshing the page.'}
                  </small>
                </Alert>
              )}

              {process.env.NODE_ENV === 'development' && error && (
                <Alert variant="secondary" className="mt-4 text-start">
                  <details>
                    <summary>Error Details (Development Only)</summary>
                    <pre className="mt-2 small">
                      <strong>Error:</strong> {error.toString()}
                      {this.state.errorInfo && (
                        <>
                          <br />
                          <strong>Component Stack:</strong>
                          {this.state.errorInfo.componentStack}
                        </>
                      )}
                    </pre>
                  </details>
                </Alert>
              )}
            </Card.Body>
          </Card>
        </Container>
      );
    }

    return this.props.children;
  }
}

export default WorkoutHistoryErrorBoundary;