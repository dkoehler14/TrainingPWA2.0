import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, Alert } from 'react-bootstrap';
import { PlusLg } from 'react-bootstrap-icons';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import ExerciseCreationModal from '../components/ExerciseCreationModal';
import ExerciseGrid from '../components/ExerciseGrid';
import '../styles/Exercises.css';

function Exercises() {
  const [exercises, setExercises] = useState([]);

  // State for validation and feedback
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(null);

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "exercises"));
      let exercisesData = [];
      querySnapshot.forEach((doc) => {
        exercisesData.push({ id: doc.id, ...doc.data() });
      });
      setExercises(exercisesData);
    } catch (error) {
      console.error("Error fetching exercises: ", error);
      setValidationError("Failed to load exercises. Please refresh the page.");
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
    setExercises(prev => [...prev, newExercise]);
    setSuccessMessage(`Exercise "${newExercise.name}" added successfully!`);
    setShowModal(false);
  };

  // Callback for when an exercise is updated
  const handleExerciseUpdated = (updatedExercise) => {
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