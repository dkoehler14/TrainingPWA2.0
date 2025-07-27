import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Alert, Spinner } from 'react-bootstrap';
import { PlusLg } from 'react-bootstrap-icons';
import ExerciseCreationModal from '../components/ExerciseCreationModal';
import ExerciseOrganizer from '../components/ExerciseOrganizer';
import '../styles/Exercises.css';
import '../styles/ExerciseGrid.css';
import '../styles/ExerciseOrganizer.css';
import { getAvailableExercises, getUserExercises, createExercise, updateExercise, deleteExercise } from '../services/exerciseService';
import { useAuth } from '../hooks/useAuth';
import { MUSCLE_GROUPS, EXERCISE_TYPES } from '../constants/exercise';

function Exercises() {
  const { user, isAuthenticated } = useAuth();
  const [exercises, setExercises] = useState([]);

  // State for validation and feedback
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

      // Add source metadata to exercises
      const enhancedExercises = allExercises.map(ex => ({
        ...ex,
        isGlobal: ex.is_global,
        source: ex.is_global ? 'global' : 'user',
        createdBy: ex.created_by
      }));
      
      setExercises(enhancedExercises);
    } catch (error) {
      console.error("Error fetching exercises: ", error);
      setValidationError("Failed to load exercises. Please refresh the page.");
    } finally {
      setIsLoading(false);
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

  // Callback for when a new exercise is added
  const handleExerciseAdded = (newExercise) => {
    const enhancedExercise = {
      ...newExercise,
      isGlobal: newExercise.is_global,
      source: newExercise.is_global ? 'global' : 'user',
      createdBy: newExercise.created_by
    };
    setExercises(prev => [...prev, enhancedExercise]);
    setSuccessMessage(`Exercise "${newExercise.name}" added successfully!`);
    setShowModal(false);
  };

  // Callback for when an exercise is updated
  const handleExerciseUpdated = (updatedExercise) => {
    const enhancedExercise = {
      ...updatedExercise,
      isGlobal: updatedExercise.is_global,
      source: updatedExercise.is_global ? 'global' : 'user',
      createdBy: updatedExercise.created_by
    };
    setExercises(prev => prev.map(ex => ex.id === updatedExercise.id ? enhancedExercise : ex));
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
                    <PlusLg className="me-2" /> Add New Exercise
                  </Button>
                </div>

                {/* Exercise Organizer */}
                <ExerciseOrganizer
                  exercises={exercises}
                  showEditButton={true}
                  onEditClick={openEditModal}
                  className="exercises-organizer"
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
    </Container>
  );
}

export default Exercises;