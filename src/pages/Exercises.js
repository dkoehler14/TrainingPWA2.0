import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Alert, Spinner } from 'react-bootstrap';
import { PlusLg } from 'react-bootstrap-icons';
import ExerciseCreationModal from '../components/ExerciseCreationModal';
import ExerciseOrganizer from '../components/ExerciseOrganizer';
import ExercisePerformanceModal from '../components/ExercisePerformanceModal';
import '../styles/Exercises.css';
import '../styles/ExerciseGrid.css';
import '../styles/ExerciseOrganizer.css';
import { getAvailableExercises } from '../services/exerciseService';
import { useAuth, useRoles, useAuthLoading } from '../hooks/useAuth';
import { transformSupabaseExercises } from '../utils/dataTransformations';
import { supabase } from '../config/supabase';

function Exercises() {
  const { user, isAuthenticated } = useAuth();
  const { userRole } = useRoles();
  const { isProfileLoading } = useAuthLoading();
  const [exercises, setExercises] = useState([]);

  // State for validation and feedback
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Performance modal state
  const [showPerformanceModal, setShowPerformanceModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [workoutLogs, setWorkoutLogs] = useState({});

  useEffect(() => {
    fetchExercises();
  }, [user]);

  const fetchExercises = async () => {
    setIsLoading(true);
    try {
      let allExercises = [];

      if (isAuthenticated && user) {
        // Fetch available exercises for authenticated user (global + user-created)
        allExercises = await getAvailableExercises(user.id);
      } else {
        // Fetch only global exercises for non-authenticated users
        const { getExercises } = await import('../services/exerciseService');
        allExercises = await getExercises({ isGlobal: true });
      }

      // Transform exercises to proper format for components
      const transformedExercises = transformSupabaseExercises(allExercises);

      setExercises(transformedExercises);
    } catch (error) {
      console.error("Error fetching exercises: ", error);
      setValidationError("Failed to load exercises. Please refresh the page.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWorkoutLogsForExercise = async (exercise) => {
    if (!user) return {};

    try {
      // Fetch workout logs for this specific exercise
      const { data: logsData, error } = await supabase
        .from('workout_log_exercises')
        .select(`
          *,
          workout_logs (
            id,
            user_id,
            program_id,
            week_index,
            day_index,
            completed_date,
            is_finished
          )
        `)
        .eq('exercise_id', exercise.id)
        .eq('workout_logs.user_id', user.id);

      if (error) throw error;

      const logs = {};
      logsData.forEach(log => {
        const workoutLog = log.workout_logs;
        if (workoutLog) {
          const key = `week${(workoutLog.week_index || 0) + 1}_day${(workoutLog.day_index || 0) + 1}`;

          if (!logs[key]) {
            logs[key] = {
              exercises: {},
              isWorkoutFinished: workoutLog.is_finished || false,
              completedDate: workoutLog.completed_date || null
            };
          }

          logs[key].exercises[exercise.id] = {
            exerciseId: exercise.id,
            sets: log.sets,
            reps: log.reps,
            weights: log.weights,
            completed: log.completed,
            bodyweight: log.bodyweight
          };
        }
      });

      return logs;
    } catch (error) {
      console.error("Error fetching workout logs for exercise: ", error);
      return {};
    }
  };

  const openAddModal = () => {
    setValidationError('');
    setIsEditMode(false);
    setCurrentExercise(null);
    setShowModal(true);
  };

  const openEditModal = (exercise) => {
    setValidationError('');
    setIsEditMode(true);
    setCurrentExercise(exercise);
    setShowModal(true);
  };

  const handleExerciseClick = async (exercise) => {
    setSelectedExercise(exercise);
    const logs = await fetchWorkoutLogsForExercise(exercise);
    setWorkoutLogs(logs);
    setShowPerformanceModal(true);
  };

  // Callback for when a new exercise is added
  const handleExerciseAdded = (newExercise) => {
    const transformedExercise = transformSupabaseExercises([newExercise])[0];
    setExercises(prev => [...prev, transformedExercise]);
    setSuccessMessage(`Exercise "${newExercise.name}" added successfully!`);
    setShowModal(false);
  };

  // Callback for when an exercise is updated
  const handleExerciseUpdated = (updatedExercise) => {
    const transformedExercise = transformSupabaseExercises([updatedExercise])[0];
    setExercises(prev => prev.map(ex => ex.id === updatedExercise.id ? transformedExercise : ex));
    setSuccessMessage(`Exercise "${updatedExercise.name}" updated successfully!`);
    setShowModal(false);
  };

  return (
    <Container fluid className="soft-container exercises-container">
      <Row className="justify-content-center">
        <Col lg={10} xl={8}>
          <div className="soft-card exercises-card shadow border-0">
            <h1 className="soft-title exercises-title text-center mb-4">Exercises</h1>

            {/* Success message display */}
            {successMessage && (
              <Alert variant="success" onClose={() => setSuccessMessage('')} dismissible>
                {successMessage}
              </Alert>
            )}

            {/* Error message display */}
            {validationError && (
              <Alert variant="danger" onClose={() => setValidationError('')} dismissible>
                {validationError}
              </Alert>
            )}

            {isLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="spinner-blue" />
                <p className="soft-text mt-2">Loading...</p>
              </div>
            ) : (
              <>
                {/* Add exercise button */}
                <div className="d-flex justify-content-start mb-4">
                  <Button
                    onClick={openAddModal}
                    className="soft-button exercises-button gradient"
                  >
                    <PlusLg className="me-2" /> {userRole === 'admin' ? 'Add New Exercise' : 'Create Custom Exercise'}
                  </Button>
                </div>

                {/* Exercise Organizer */}
                <ExerciseOrganizer
                  exercises={exercises}
                  showEditButton={true}
                  onEditClick={openEditModal}
                  onExerciseClick={handleExerciseClick}
                  className="exercises-organizer"
                  userRole={isProfileLoading ? null : userRole}
                  isRoleLoading={isProfileLoading}
                />
              </>
            )}
          </div>
        </Col>
      </Row>

      {/* Exercise Creation/Edit Modal */}
      <ExerciseCreationModal
        show={showModal}
        onHide={() => setShowModal(false)}
        isEditMode={isEditMode}
        exerciseId={isEditMode ? currentExercise?.id : null}
        initialData={isEditMode ? currentExercise : null}
        onExerciseAdded={handleExerciseAdded}
        onExerciseUpdated={handleExerciseUpdated}
      />

      {/* Exercise Performance Modal */}
      <ExercisePerformanceModal
        show={showPerformanceModal}
        onHide={() => setShowPerformanceModal(false)}
        exercise={selectedExercise}
        userId={user?.id}
        workoutLogs={workoutLogs}
      />
    </Container>
  );
}

export default Exercises;