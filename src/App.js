import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Exercises from './pages/Exercises';
import CreateProgram from './pages/CreateProgram';
import ProgramsWorkoutHub from './pages/ProgramsWorkoutHub';
import UserProfile from './pages/UserProfile';
import LogWorkout from './pages/LogWorkout';
import QuickWorkout from './pages/QuickWorkout';
import ProgressTracker from './pages/ProgressTracker';
import Auth from './pages/Auth';
import ResetPassword from './pages/ResetPassword';
import ProgressTracker2 from './pages/ProgressTracker2';
import ProgressTracker3 from './pages/Progress3';
import ProgressCoach from './pages/ProgressCoach';
import Progress4 from './pages/Progress4';
import Admin from './pages/Admin';
import CoachDashboard from './pages/CoachDashboard';
import CacheDemo from './components/CacheDemo';
import { CoachRoute, AdminRoute } from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Spinner } from 'react-bootstrap';
import { getCacheStats } from './api/supabaseCache';
import cacheWarmingService from './services/supabaseCacheWarmingService';
import {
  getDevelopmentDebuggingStatus,
  developmentLogger,
  serviceStatusLogger
} from './utils/developmentDebugger';
import DevelopmentDebugPanel from './components/DevelopmentDebugPanel';
import { useAuth, useRoles } from './hooks/useAuth';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  const [cacheInitialized, setCacheInitialized] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const { } = useTheme();

  // Use auth hook instead of Firebase auth
  const { user, userProfile, loading, isReady, isInitialized, isAuthenticated } = useAuth();
  const { userRole } = useRoles();

  // Initialize app cache and development debugging on startup
  useEffect(() => {
    const initializeCache = async () => {
      try {
        developmentLogger.info('🚀 Initializing app cache...');
        await cacheWarmingService.initializeAppCache();
        setCacheInitialized(true);
        developmentLogger.info('✅ App cache initialized successfully');

        // Add debugging tools to window for development
        if (process.env.NODE_ENV === 'development') {
          window.getCacheStats = getCacheStats;
          window.cacheWarmingService = cacheWarmingService;
          window.getDevelopmentDebuggingStatus = getDevelopmentDebuggingStatus;
          window.serviceStatusLogger = serviceStatusLogger;
          window.developmentLogger = developmentLogger;

          developmentLogger.info('🔧 Development debugging tools available', {
            tools: [
              'window.getCacheStats()',
              'window.cacheWarmingService',
              'window.getDevelopmentDebuggingStatus()',
              'window.serviceStatusLogger',
              'window.developmentLogger'
            ]
          });

          // Log initial debugging status
          const debugStatus = getDevelopmentDebuggingStatus();
          developmentLogger.info('📊 Development debugging status', debugStatus, {
            group: true,
            includeSourceMap: true
          });
        }
      } catch (error) {
        developmentLogger.error('❌ Cache initialization failed', error);
        setCacheInitialized(true); // Continue anyway
      }
    };

    initializeCache();
  }, []);

  // Smart cache warming when user is authenticated
  useEffect(() => {
    if (user && cacheInitialized && isReady) {
      const context = {
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        isNewSession: true
      };

      // Warm user cache in background
      cacheWarmingService.smartWarmCache(user.id, context)
        .then(result => {
          if (result && !result.success && !result.alreadyQueued) {
            console.warn('⚠️ Cache warming could not be queued:', result.message);
          }
        })
        .catch(error => console.warn('⚠️ Cache warming failed:', error));
    }
  }, [user, cacheInitialized, isReady]);

  // Track page navigation for smart cache warming
  useEffect(() => {
    if (user && cacheInitialized && isReady) {
      const currentPath = window.location.pathname;
      const pageName = currentPath.split('/')[1] || 'home';

      // Progressive warming for heavy pages
      if (['progress-tracker', 'log-workout', 'programs'].includes(pageName)) {
        cacheWarmingService.progressiveWarmCache(user.id)
          .then(result => {
            if (result && !result.success && !result.alreadyQueued) {
              console.warn('⚠️ Progressive cache warming could not be queued:', result.message);
            }
          })
          .catch(error => console.warn('⚠️ Progressive cache warming failed:', error));
      }
    }
  }, [user, cacheInitialized, isReady]);

  // Only show loading on initial app load, not on tab switches
  if (!isInitialized) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <Spinner animation="border" className="spinner-blue" />
          <p className="soft-text mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <NavBar user={user} userRole={userRole} isReady={isReady} />
      <Routes>
        <Route path="/" element={user ? <Home user={user} /> : <Navigate to="/auth" />} />
        <Route path="/exercises" element={user ? <Exercises user={user} userRole={userRole} /> : <Navigate to="/auth" />} />
        <Route path="/create-program" element={user ? <CreateProgram /> : <Navigate to="/auth" />} />
        <Route path="/programs" element={user ? <ProgramsWorkoutHub userRole={userRole} /> : <Navigate to="/auth" />} />
        <Route path="/profile" element={user ? <UserProfile /> : <Navigate to="/auth" />} />
        <Route path="/log-workout" element={isAuthenticated ? <LogWorkout /> : <Navigate to="/auth" />} />
        <Route path="/quick-workout" element={isAuthenticated ? <QuickWorkout /> : <Navigate to="/auth" />} />
        <Route path="/quick-workout-history" element={<Navigate to="/programs?view=quick-workouts" replace />} />
        <Route path="/progress-tracker" element={user ? <ProgressTracker /> : <Navigate to="/" />} />
        <Route path="/progress-coach" element={user ? <ProgressCoach /> : <Navigate to="/auth" />} />
        <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/" />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/progress-tracker-2" element={user ? <ProgressTracker2 /> : <Navigate to="/auth" />} />
        <Route path="/progress-tracker-3" element={user ? <ProgressTracker3 /> : <Navigate to="/auth" />} />
        <Route path="/progress-tracker-4" element={user ? <Progress4 /> : <Navigate to="/auth" />} />
        <Route path="/edit-program/:programId" element={<CreateProgram mode="edit" />} />
        <Route path="/coach-dashboard" element={
          <CoachRoute>
            <CoachDashboard />
          </CoachRoute>
        } />
        <Route path="/admin" element={
          <AdminRoute>
            <Admin />
          </AdminRoute>
        } />
        <Route path="/cache-demo" element={(() => {
          // If not authenticated, redirect to auth
          if (!user) {
            return <Navigate to="/auth" />;
          }

          // If authenticated but not ready, show loading
          if (!isReady) {
            return (
              <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '50vh' }}>
                <div className="text-center">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-2">Loading user permissions...</p>
                </div>
              </div>
            );
          }

          // Check if user has access (admin or development mode)
          if (userRole !== 'admin' && process.env.NODE_ENV !== 'development') {
            return <Navigate to="/" />;
          }

          // All checks passed, show cache demo
          return <CacheDemo />;
        })()} />
      </Routes>
      <DevelopmentDebugPanel />
    </Router>
  );
}

export default App;