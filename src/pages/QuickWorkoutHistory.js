/**
 * QuickWorkoutHistory Page Component
 * 
 * Main container component for the Quick Workout History feature.
 * Integrates all child components and manages state for workout history viewing,
 * filtering, and detailed workout display.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Container, Row, Col, Spinner, Alert, Modal, Button } from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { getAvailableExercises } from '../services/exerciseService';
import workoutLogService from '../services/workoutLogService';
import { supabase } from '../config/supabase';

// Import child components
import WorkoutStatsCard from '../components/WorkoutStatsCard';
import WorkoutFilters from '../components/WorkoutFilters';
import WorkoutHistoryList from '../components/WorkoutHistoryList';
import WorkoutDetailModal from '../components/WorkoutDetailModal';
import WorkoutHistoryErrorBoundary from '../components/WorkoutHistoryErrorBoundary';
import WorkoutHistorySkeleton from '../components/WorkoutHistorySkeleton';
import useQuickWorkoutHistory from '../hooks/useQuickWorkoutHistory';

// Import styles
import '../styles/LogWorkout.css';
import '../styles/QuickWorkoutHistory.css';

function QuickWorkoutHistoryContent() {
  // Authentication
  const { user, isAuthenticated } = useAuth();

  // Data fetching hook
  const { workouts, isLoading: isLoadingWorkouts, error: workoutsError, refetch } = useQuickWorkoutHistory();

  // Component state
  const [exercises, setExercises] = useState([]);
  const [isLoadingExercises, setIsLoadingExercises] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showDetailView, setShowDetailView] = useState(false);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState({ start: null, end: null });
  const [sortOption, setSortOption] = useState('date-desc');
  
  // UI state
  const [userMessage, setUserMessage] = useState({ text: '', type: '', show: false });
  const [filteredWorkouts, setFilteredWorkouts] = useState([]);
  
  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [workoutToDelete, setWorkoutToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Enhanced user message function
  const showUserMessage = (text, type = 'info') => {
    setUserMessage({ text, type, show: true });
    if (type !== 'error') {
      setTimeout(() => {
        setUserMessage(prev => ({ ...prev, show: false }));
      }, 5000);
    }
  };

  const hideUserMessage = () => {
    setUserMessage(prev => ({ ...prev, show: false }));
  };

  // Fetch exercises metadata on component mount
  useEffect(() => {
    const fetchExercises = async () => {
      if (!user) {
        setIsLoadingExercises(false);
        return;
      }

      try {
        // Phase 1 Optimization: Start cache warming for history page
        const cacheWarmingService = (await import('../services/supabaseCacheWarmingService')).default;
        const warmingPromise = cacheWarmingService.smartWarmCache(user.id, {
          lastVisitedPage: 'QuickWorkoutHistory',
          timeOfDay: new Date().getHours(),
          priority: 'normal'
        }).catch(error => {
          console.warn('Cache warming failed:', error);
          return null;
        });

        // Fetch exercises using Supabase
        const [exercisesData] = await Promise.all([
          // Fetch available exercises using Supabase
          getAvailableExercises(user.id).catch(exerciseError => {
            console.error('Error fetching exercises:', exerciseError);
            showUserMessage('Some exercise data may be unavailable', 'warning');
            return [];
          }),
          // Ensure cache warming completes
          warmingPromise
        ]);

        // Validate and process exercises
        const validExercises = Array.isArray(exercisesData) ? exercisesData : [];
        if (!Array.isArray(exercisesData)) {
          console.warn('Exercises data is not an array:', exercisesData);
        }

        const enhancedExercises = validExercises.map(ex => {
          // Validate exercise structure
          if (!ex || typeof ex !== 'object' || !ex.id) {
            console.warn('Invalid exercise data:', ex);
            return null;
          }
          return {
            ...ex,
            isGlobal: ex.is_global,
            source: ex.is_global ? 'global' : 'user',
            createdBy: ex.created_by
          };
        }).filter(Boolean); // Remove null entries

        setExercises(enhancedExercises);

        // Show warning if no exercises were loaded
        if (enhancedExercises.length === 0) {
          showUserMessage('No exercise data available. Some workout details may be limited.', 'warning');
        }
      } catch (error) {
        console.error('Error fetching exercises:', error);
        
        // Provide user-friendly error message based on error type
        let errorMessage = 'Failed to load exercise data. Some workout details may be limited.';
        if (error.code === 'permission-denied') {
          errorMessage = 'Permission denied when loading exercise data. Please sign in again.';
        } else if (error.code === 'unavailable') {
          errorMessage = 'Exercise data temporarily unavailable. Some workout details may be limited.';
        }
        
        showUserMessage(errorMessage, 'warning');
        
        // Set empty exercises array so the app can still function
        setExercises([]);
      } finally {
        setIsLoadingExercises(false);
      }
    };

    fetchExercises();
  }, [user]);

  // Filter and sort workouts based on current filters
  const applyFiltersAndSort = useCallback((workoutsToFilter) => {
    let filtered = [...workoutsToFilter];

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(workout => {
        // Search in workout name
        const nameMatch = workout.name?.toLowerCase().includes(searchLower);
        
        // Search in exercise names
        const exerciseMatch = workout.exercises?.some(ex => {
          const exercise = exercises.find(e => e.id === ex.exerciseId);
          return exercise?.name?.toLowerCase().includes(searchLower);
        });

        return nameMatch || exerciseMatch;
      });
    }

    // Apply date filter
    if (dateFilter.start || dateFilter.end) {
      filtered = filtered.filter(workout => {
        const workoutDate = workout.date?.toDate ? workout.date.toDate() : new Date(workout.date);
        
        if (dateFilter.start && workoutDate < dateFilter.start) {
          return false;
        }
        if (dateFilter.end && workoutDate > dateFilter.end) {
          return false;
        }
        
        return true;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortOption) {
        case 'date-asc':
          return (a.date?.toDate ? a.date.toDate() : new Date(a.date)) - 
                 (b.date?.toDate ? b.date.toDate() : new Date(b.date));
        case 'date-desc':
          return (b.date?.toDate ? b.date.toDate() : new Date(b.date)) - 
                 (a.date?.toDate ? a.date.toDate() : new Date(a.date));
        case 'name-asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name-desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'exercise-count-asc':
          return (a.exercises?.length || 0) - (b.exercises?.length || 0);
        case 'exercise-count-desc':
          return (b.exercises?.length || 0) - (a.exercises?.length || 0);
        default:
          return 0;
      }
    });

    return filtered;
  }, [searchTerm, dateFilter, sortOption, exercises]);

  // Update filtered workouts when workouts or filters change
  useEffect(() => {
    if (workouts) {
      const filtered = applyFiltersAndSort(workouts);
      setFilteredWorkouts(filtered);
    }
  }, [workouts, applyFiltersAndSort]);


  // Handle workout selection for detail view
  const handleWorkoutSelect = (workout) => {
    setSelectedWorkout(workout);
    setShowDetailView(true);
  };

  // Handle back to list view (close modal)
  const handleBackToList = () => {
    setShowDetailView(false);
    setSelectedWorkout(null);
  };

  // Handle workout deletion - show confirmation modal
  const handleDeleteWorkout = (workoutId) => {
    if (!user || !workoutId) return;

    // Find the workout to delete for display in modal
    const workout = workouts.find(w => w.id === workoutId) || selectedWorkout;
    setWorkoutToDelete({ id: workoutId, workout });
    setShowDeleteModal(true);
  };

  // Confirm and execute workout deletion
  const confirmDeleteWorkout = async () => {
    if (!workoutToDelete || !user) return;

    setIsDeleting(true);

    try {
      // Delete from Supabase
      await workoutLogService.deleteWorkoutLog(workoutToDelete.id);
      
      // Refetch data
      await refetch();
      
      // Show success message
      showUserMessage('Workout deleted successfully', 'success');
      
      // If we're viewing the deleted workout, close modal
      if (selectedWorkout && selectedWorkout.id === workoutToDelete.id) {
        handleBackToList();
      }
      
      // Close modal and reset state
      setShowDeleteModal(false);
      setWorkoutToDelete(null);
    } catch (error) {
      console.error('Error deleting workout:', error);
      showUserMessage('Failed to delete workout. Please try again.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Cancel workout deletion
  const cancelDeleteWorkout = () => {
    setShowDeleteModal(false);
    setWorkoutToDelete(null);
    setIsDeleting(false);
  };

  // Handle using workout as template
  const handleUseAsTemplate = (workout) => {
    if (!workout || !workout.exercises) {
      showUserMessage('Cannot use this workout as template - no exercise data found', 'error');
      return;
    }

    // Navigate to QuickWorkout page with template data
    // Store template data in sessionStorage for the QuickWorkout component to pick up
    const templateData = {
      name: `${workout.name || 'Quick Workout'} (Copy)`,
      exercises: workout.exercises.map(ex => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets || 3,
        reps: Array(ex.sets || 3).fill(''), // Clear previous reps
        weights: Array(ex.sets || 3).fill(''), // Clear previous weights
        completed: Array(ex.sets || 3).fill(false), // Clear completion status
        notes: ex.notes || '', // Maintain exercise notes as defaults
        bodyweight: ex.bodyweight || null // Clear bodyweight values
      }))
    };

    sessionStorage.setItem('quickWorkoutTemplate', JSON.stringify(templateData));
    
    // Navigate to QuickWorkout page using React Router
    window.location.href = '/quick-workout';
  };

  // Handle filter changes
  const handleSearchChange = (newSearchTerm) => {
    setSearchTerm(newSearchTerm);
  };

  const handleDateFilterChange = (newDateFilter) => {
    setDateFilter(newDateFilter);
  };

  const handleSortChange = (newSortOption) => {
    setSortOption(newSortOption);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setDateFilter({ start: null, end: null });
    setSortOption('date-desc');
  };

  // Loading state
  const isLoading = isLoadingWorkouts || isLoadingExercises;

  if (isLoading) {
    return (
      <Container fluid className="soft-container py-4">
        <Row className="mb-4">
          <Col>
            <h1 className="soft-title">Quick Workout History</h1>
            <p className="soft-text">View and manage your quick workout history</p>
          </Col>
        </Row>
        <WorkoutHistorySkeleton type="list" count={5} />
      </Container>
    );
  }

  // Error state
  if (workoutsError) {
    return (
      <Container className="soft-container py-4">
        <Alert variant="danger">
          <h5>Error Loading Workouts</h5>
          <p>{workoutsError}</p>
          <button 
            className="btn btn-outline-danger" 
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </Alert>
      </Container>
    );
  }


  // Main list view
  return (
    <Container fluid className="soft-container py-4">
      {/* User Message */}
      {userMessage.show && (
        <Row className="mb-3">
          <Col>
            <Alert 
              variant={userMessage.type === 'error' ? 'danger' : userMessage.type === 'success' ? 'success' : 'info'}
              dismissible
              onClose={hideUserMessage}
            >
              {userMessage.text}
            </Alert>
          </Col>
        </Row>
      )}

      {/* Header */}
      <Row className="mb-4">
        <Col>
          <h1 className="soft-title">Quick Workout History</h1>
          <p className="soft-text">View and manage your quick workout history</p>
        </Col>
      </Row>

      {/* Workout Statistics */}
      <WorkoutStatsCard 
        workouts={workouts || []} 
        exercises={exercises}
        enableRealtime={true}
      />

      {/* Filters */}
      <WorkoutFilters
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
        dateFilter={dateFilter}
        onDateFilterChange={handleDateFilterChange}
        sortOption={sortOption}
        onSortChange={handleSortChange}
        onClearFilters={handleClearFilters}
        workoutCount={filteredWorkouts.length}
      />

      {/* Workout List */}
      <WorkoutHistoryList
        workouts={filteredWorkouts}
        onWorkoutSelect={handleWorkoutSelect}
        onDeleteWorkout={handleDeleteWorkout}
        onUseAsTemplate={handleUseAsTemplate}
        isLoading={false}
        enableRealtime={true}
      />

      {/* Delete Confirmation Modal */}
      <Modal show={showDeleteModal} onHide={cancelDeleteWorkout} centered>
        <Modal.Header closeButton>
          <Modal.Title>Delete Workout</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            Are you sure you want to delete this workout? This action cannot be undone.
          </p>
          {workoutToDelete?.workout && (
            <div className="bg-light p-3 rounded">
              <strong>Workout:</strong> {workoutToDelete.workout.name || `Quick Workout - ${new Date(workoutToDelete.workout.date?.toDate ? workoutToDelete.workout.date.toDate() : workoutToDelete.workout.date).toLocaleDateString()}`}
              <br />
              <strong>Date:</strong> {new Date(workoutToDelete.workout.date?.toDate ? workoutToDelete.workout.date.toDate() : workoutToDelete.workout.date).toLocaleDateString()}
              <br />
              <strong>Exercises:</strong> {workoutToDelete.workout.exercises?.length || 0}
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button 
            variant="secondary" 
            onClick={cancelDeleteWorkout}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button 
            variant="danger" 
            onClick={confirmDeleteWorkout}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Spinner
                  as="span"
                  animation="border"
                  size="sm"
                  role="status"
                  aria-hidden="true"
                  className="me-2"
                />
                Deleting...
              </>
            ) : (
              'Delete Workout'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Workout Detail Modal */}
      <WorkoutDetailModal
        show={showDetailView}
        onClose={handleBackToList}
        workout={selectedWorkout}
        exercises={exercises}
        onDelete={handleDeleteWorkout}
        onUseAsTemplate={handleUseAsTemplate}
      />
    </Container>
  );
}

// Main component wrapped with error boundary
function QuickWorkoutHistory() {
  return (
    <WorkoutHistoryErrorBoundary>
      <QuickWorkoutHistoryContent />
    </WorkoutHistoryErrorBoundary>
  );
}

export default QuickWorkoutHistory;
