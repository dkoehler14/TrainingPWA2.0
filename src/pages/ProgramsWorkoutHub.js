/**
 * ProgramsWorkoutHub - Main container component for consolidated Programs and Quick Workouts page
 * 
 * This component manages view state and URL synchronization between Programs and Quick Workouts views.
 * It provides a unified interface with a header dropdown to switch between the two views.
 * 
 * Features:
 * - State preservation: Maintains view-specific state when switching between views
 * - Performance optimization: Lazy loading and component memoization
 * - Caching: Preserves filters and search states across view switches
 */

import React, { useState, useEffect, useCallback, Suspense, lazy, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Spinner } from 'react-bootstrap';
import ViewSelector from '../components/ViewSelector';
import ProgramsWorkoutHubErrorBoundary from '../components/ProgramsWorkoutHubErrorBoundary';
import '../styles/ProgramsWorkoutHub.css';
import performanceMonitor from '../utils/performanceMonitor';
import { useViewStateCache } from '../utils/viewStateCache';

// Lazy load view wrapper components for better performance
const ProgramsView = lazy(() => import('../components/ProgramsView'));
const QuickWorkoutsView = lazy(() => import('../components/QuickWorkoutsView'));

// View configuration
const VIEW_CONFIG = {
  programs: {
    label: 'Programs',
    component: ProgramsView,
    defaultRoute: '/programs'
  },
  'quick-workouts': {
    label: 'Quick Workouts',
    component: QuickWorkoutsView,
    defaultRoute: '/programs?view=quick-workouts'
  }
};

const VIEW_OPTIONS = [
  { value: 'programs', label: 'Programs' },
  { value: 'quick-workouts', label: 'Quick Workouts' }
];

const DEFAULT_VIEW = 'programs';

function ProgramsWorkoutHub({ userRole }) {
  const location = useLocation();
  const navigate = useNavigate();

  // Performance monitoring and state caching hooks
  // Performance monitoring is available as a singleton
  // const performanceMonitor is already imported above
  const stateCache = useViewStateCache();

  // State for active view and loading
  const [activeView, setActiveView] = useState(DEFAULT_VIEW);
  const [isViewSwitching, setIsViewSwitching] = useState(false);

  // Track mounted views to prevent unnecessary re-mounting
  const [mountedViews, setMountedViews] = useState(new Set([DEFAULT_VIEW]));

  // Performance tracking refs
  const viewSwitchStartTime = useRef(null);
  const componentMountTime = useRef(Date.now());

  // Parse URL parameters to determine initial view
  const parseViewFromURL = useCallback(() => {
    const searchParams = new URLSearchParams(location.search);
    const viewParam = searchParams.get('view');

    // Validate view parameter
    if (viewParam && VIEW_CONFIG[viewParam]) {
      return viewParam;
    }

    return DEFAULT_VIEW;
  }, [location.search]);

  // Initialize view from URL on component mount and URL changes
  useEffect(() => {
    const urlView = parseViewFromURL();
    setActiveView(urlView);
  }, [parseViewFromURL]);

  // Update document title based on active view
  useEffect(() => {
    const viewConfig = VIEW_CONFIG[activeView];
    const baseTitle = 'Hypertrophy Hub';
    const viewTitle = viewConfig ? viewConfig.label : 'Programs';
    document.title = `${viewTitle} - ${baseTitle}`;

    // Update meta description for better SEO
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      const description = activeView === 'programs'
        ? 'Manage your workout programs and templates in Hypertrophy Hub'
        : 'View and manage your quick workout history in Hypertrophy Hub';
      metaDescription.setAttribute('content', description);
    }
  }, [activeView]);

  // Handle view changes with URL synchronization and state preservation
  const handleViewChange = useCallback((newView) => {
    if (!VIEW_CONFIG[newView] || newView === activeView) {
      return;
    }

    // Start performance monitoring for view switch
    viewSwitchStartTime.current = Date.now();

    // Set loading state during view switch
    setIsViewSwitching(true);

    // Add new view to mounted views set for lazy loading optimization
    setMountedViews(prev => new Set([...prev, newView]));

    // Update state
    setActiveView(newView);

    // Update URL with proper history management
    const newSearchParams = new URLSearchParams(location.search);

    if (newView === DEFAULT_VIEW) {
      // Remove view parameter for default view to keep URL clean
      newSearchParams.delete('view');
    } else {
      // Set view parameter for non-default views
      newSearchParams.set('view', newView);
    }

    const newSearch = newSearchParams.toString();
    const newPath = location.pathname + (newSearch ? `?${newSearch}` : '');

    // Use navigate to update URL and browser history
    navigate(newPath, { replace: false });

    // Clear loading state after a brief delay to allow for smooth transition
    setTimeout(() => {
      setIsViewSwitching(false);
      
      // Track view switch performance using the correct API
      const switchDuration = Date.now() - viewSwitchStartTime.current;
      performanceMonitor.trackUserInteraction(`view_switch_${activeView}_to_${newView}`, switchDuration, {
        fromView: activeView,
        toView: newView
      });
    }, 100);
  }, [activeView, location.pathname, location.search, navigate, performanceMonitor]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const urlView = parseViewFromURL();
      setActiveView(urlView);
    };

    // Listen for browser navigation events
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [parseViewFromURL]);

  // Performance monitoring and cleanup effects
  useEffect(() => {
    // Monitor initial component mount time
    const mountDuration = Date.now() - componentMountTime.current;
    performanceMonitor.trackPageLoad('ProgramsWorkoutHub', mountDuration, {
      component: 'ProgramsWorkoutHub',
      initialView: activeView
    });

    // Cleanup function
    return () => {
      // Log performance summary on unmount
      if (process.env.NODE_ENV === 'development') {
        console.log('[ProgramsWorkoutHub] Performance Dashboard:', performanceMonitor.getPerformanceDashboard());
        console.log('[ProgramsWorkoutHub] Cache Stats:', stateCache.getStats());
      }
    };
  }, [activeView, stateCache]);

  // Periodic cache cleanup
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      stateCache.cleanup(30 * 60 * 1000); // Clean up states older than 30 minutes
    }, 5 * 60 * 1000); // Run cleanup every 5 minutes

    return () => clearInterval(cleanupInterval);
  }, [stateCache]);

  // Get current view configuration
  const currentViewConfig = VIEW_CONFIG[activeView];

  // Memoized loading component for better performance
  const LoadingSpinner = useMemo(() => (
    <div className="d-flex justify-content-center align-items-center py-5">
      <Spinner animation="border" role="status" variant="primary">
        <span className="visually-hidden">Loading {currentViewConfig.label}...</span>
      </Spinner>
    </div>
  ), [currentViewConfig.label]);

  // State preservation functions with enhanced caching
  const saveViewState = useCallback((view, state) => {
    stateCache.mergeState(view, state);
    // Track cache operation using the correct API
    performanceMonitor.trackCacheOperation(`${view}_state_save`, true, 0, {
      view,
      stateSize: JSON.stringify(state).length
    });
  }, [stateCache]);

  const getViewState = useCallback((view) => {
    return stateCache.getStateWithFallback(view, 'default', {});
  }, [stateCache]);

  // Memoized view components with state preservation
  const MemoizedProgramsView = useMemo(() => {
    if (!mountedViews.has('programs')) return null;

    return (
      <ProgramsView
        userRole={userRole}
        initialState={getViewState('programs')}
        onStateChange={(state) => saveViewState('programs', state)}
        isActive={activeView === 'programs'}
      />
    );
  }, [userRole, mountedViews, activeView, getViewState, saveViewState]);

  const MemoizedQuickWorkoutsView = useMemo(() => {
    if (!mountedViews.has('quick-workouts')) return null;

    return (
      <QuickWorkoutsView
        initialState={getViewState('quick-workouts')}
        onStateChange={(state) => saveViewState('quick-workouts', state)}
        isActive={activeView === 'quick-workouts'}
      />
    );
  }, [mountedViews, activeView, getViewState, saveViewState]);

  // Render current view with error boundary, lazy loading, and state preservation
  const renderCurrentView = () => {
    if (isViewSwitching) {
      return LoadingSpinner;
    }

    return (
      <ProgramsWorkoutHubErrorBoundary activeView={activeView}>
        <Suspense fallback={LoadingSpinner}>
          <div style={{ display: 'contents' }}>
            {/* Programs View - only render when active or previously mounted */}
            <div style={{ display: activeView === 'programs' ? 'block' : 'none' }}>
              {MemoizedProgramsView}
            </div>

            {/* Quick Workouts View - only render when active or previously mounted */}
            <div style={{ display: activeView === 'quick-workouts' ? 'block' : 'none' }}>
              {MemoizedQuickWorkoutsView}
            </div>
          </div>
        </Suspense>
      </ProgramsWorkoutHubErrorBoundary>
    );
  };

  return (
    <Container fluid className="soft-container py-4">
      {/* Prominent View Selector Header */}
      <Row className="mb-4">
        <Col>
          <div className="programs-workout-hub-header">
            <div className="prominent-view-selector-container">
              <label htmlFor="view-selector" className="visually-hidden">
                Switch between Programs and Quick Workouts view
              </label>
              <ViewSelector
                id="view-selector"
                activeView={activeView}
                onViewChange={handleViewChange}
                options={VIEW_OPTIONS}
                className="programs-workout-hub-selector prominent-selector"
                disabled={isViewSwitching}
              />
              <p className="view-description">
                {activeView === 'programs'
                  ? 'Manage your workout programs and templates'
                  : 'View and manage your quick workout history'
                }
              </p>
            </div>
          </div>
        </Col>
      </Row>

      {/* Current View Content */}
      <Row>
        <Col>
          <div className={`view-content view-content--${activeView}`} data-view={activeView}>
            {renderCurrentView()}
          </div>
        </Col>
      </Row>
    </Container>
  );
}

export default ProgramsWorkoutHub;