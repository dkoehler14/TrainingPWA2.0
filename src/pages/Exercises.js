import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Button, ListGroup, Accordion, Alert } from 'react-bootstrap';
import { PencilSquare, PlusLg } from 'react-bootstrap-icons';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import ExerciseCreationModal from '../components/ExerciseCreationModal';
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
    //resetAddForm();
    setValidationError('');
    //setShowAddModal(true);
    setIsEditMode(false);
    setCurrentExercise(null);
    setShowModal(true);
  };

  const openEditModal = (exercise) => {
    // setEditExerciseId(exercise.id);
    setValidationError('');
    // setShowEditModal(true);
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

  // const validateExercise = async (exerciseName, primaryGroup, secondaryGroups, checkingExistingId = null) => {
  //   // Reset previous error message
  //   setValidationError('');

  //   // Validate exercise name
  //   if (!exerciseName.trim()) {
  //     setValidationError('Exercise name is required.');
  //     return false;
  //   }

  //   // Check for duplicate exercise name
  //   const exerciseQuery = query(collection(db, "exercises"), where("name", "==", exerciseName.trim()));
  //   const querySnapshot = await getDocs(exerciseQuery);
    
  //   // When editing, we need to exclude the current exercise from duplicate check
  //   if (!querySnapshot.empty) {
  //     // If we're in edit mode, check if the duplicate is the exercise we're editing
  //     let isDuplicate = false;
  //     querySnapshot.forEach((doc) => {
  //       if (checkingExistingId && doc.id === checkingExistingId) {
  //         // This is our own exercise, so not a duplicate
  //       } else {
  //         isDuplicate = true;
  //       }
  //     });

  //     if (isDuplicate) {
  //       setValidationError('An exercise with this name already exists.');
  //       return false;
  //     }
  //   }

  //   // Validate primary muscle group
  //   if (!primaryGroup || primaryGroup === '' || String(primaryGroup).trim() === '') {
  //     setValidationError('Primary muscle group is required.');
  //     return false;
  //   }

  //   return true;
  // };

  const groupByPrimaryMuscle = () => {
    return exercises.reduce((acc, exercise) => {
      const group = exercise.primaryMuscleGroup;
      if (!acc[group]) acc[group] = [];
      acc[group].push(exercise);
      return acc;
    }, {});
  };

  const groupedExercises = groupByPrimaryMuscle();

  return (
    <Container fluid className="soft-container exercises-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card exercises-card shadow border-0">
            <h1 className="soft-title exercises-title text-center">Exercises</h1>

            {/* Success message display */}
            {successMessage && (
              <Alert variant="success" onClose={() => setSuccessMessage('')} dismissible>
                {successMessage}
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

            {/* Accordion for grouped exercises */}
            <Accordion>
              {Object.keys(groupedExercises).map((muscleGroup, index) => (
                <Accordion.Item key={index} eventKey={index.toString()} className="soft-accordion-item exercises-accordion-item">
                  <Accordion.Header>{muscleGroup}</Accordion.Header>
                  <Accordion.Body>
                    <ListGroup>
                      {groupedExercises[muscleGroup].map((exercise) => (
                        <ListGroup.Item key={exercise.id} className="soft-list-group-item exercises-list-group-item d-flex justify-content-start align-items-center">
                          <Button 
                            variant="outline-primary" 
                            size="lg"
                            onClick={() => openEditModal(exercise)}
                            className="exercises-edit-button"
                          >
                            <PencilSquare />
                          </Button>
                          <div>
                            <strong>{exercise.name}</strong>
                            {exercise.exerciseType && (
                              <span className="ms-2 badge bg-info text-dark">{exercise.exerciseType}</span>
                            )}
                          </div>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  </Accordion.Body>
                </Accordion.Item>
              ))}
            </Accordion>

            {Object.keys(groupedExercises).length === 0 && (
              <div className="text-center my-5">
                <p className="text-muted">No exercises found. Click the "Add New Exercise" button to create one.</p>
              </div>
            )}
          </div>
        </Col>
      </Row>

      {/* Single ExerciseCreationModal for both add and edit */}
      <ExerciseCreationModal
        show={showModal}
        onHide={() => setShowModal(false)}
        isEditMode={isEditMode}
        exerciseId={isEditMode ? currentExercise?.id : null}
        initialData={isEditMode ? currentExercise : null}
        onExerciseAdded={handleExerciseAdded}
        onExerciseUpdated={handleExerciseUpdated}
      />

      {/* Add Exercise Modal */}
      {/* <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add New Exercise</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {validationError && (
            <Alert variant="danger" onClose={() => setValidationError('')} dismissible>
              {validationError}
            </Alert>
          )}

          <Form>
            <ExerciseFormFields 
              formData={addFormData} 
              setFormData={setAddFormData} 
              isEditForm={false} 
            />
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleAddExercise}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Adding...' : 'Add Exercise'}
          </Button>
        </Modal.Footer>
      </Modal> */}

      {/* Edit Exercise Modal */}
      {/* <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Edit Exercise</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {validationError && (
            <Alert variant="danger" onClose={() => setValidationError('')} dismissible>
              {validationError}
            </Alert>
          )}

          <Form>
            <ExerciseFormFields 
              formData={editFormData} 
              setFormData={setEditFormData} 
              isEditForm={true} 
            />
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
          <Button 
            variant="primary" 
            onClick={handleEditExercise}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </Modal.Footer>
      </Modal> */}
    </Container>
  );
}

export default Exercises;