import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Alert, Spinner } from 'react-bootstrap';
import { PlusLg } from 'react-bootstrap-icons';
import ExerciseCreationModal from '../components/ExerciseCreationModal';
import ExerciseGrid from '../components/ExerciseGrid';
import '../styles/Exercises.css';
import { getExercisesCached, invalidateCache } from '../api/firestoreCache';

function Exercises() {
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
  }, []);

  const fetchExercises = async () => {
    setIsLoading(true);
    try {
      const exercisesData = await getExercisesCached();
      setExercises(exercisesData);
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
    invalidateCache('exercises');
    setExercises(prev => [...prev, newExercise]);
    setSuccessMessage(`Exercise "${newExercise.name}" added successfully!`);
    setShowModal(false);
  };

  // Callback for when an exercise is updated
  const handleExerciseUpdated = (updatedExercise) => {
    invalidateCache('exercises');
    setExercises(prev => prev.map(ex => ex.id === updatedExercise.id ? updatedExercise : ex));
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

                {/* Exercise Grid */}
                <ExerciseGrid
                  exercises={exercises}
                  showEditButton={true}
                  onEditClick={openEditModal}
                  emptyMessage="No exercises found. Click the 'Add New Exercise' button to create one."
                  className="exercises-grid"
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