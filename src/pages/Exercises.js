import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, ListGroup, Accordion, InputGroup, Alert, Modal } from 'react-bootstrap';
import { Trash, PencilSquare, PlusLg } from 'react-bootstrap-icons';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import '../styles/Exercises.css';

function Exercises() {
  const MUSCLE_GROUPS = [
    'Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders', 
    'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 
    'Traps', 'Forearms'
  ];

  const [exercises, setExercises] = useState([]);
  
  // State for validation and feedback
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State for add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addFormData, setAddFormData] = useState({
    name: '',
    primaryMuscleGroup: '',
    secondaryMuscleGroups: [{ group: '' }]
  });
  
  // State for edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editExerciseId, setEditExerciseId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    primaryMuscleGroup: '',
    secondaryMuscleGroups: [{ group: '' }]
  });

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

  const resetAddForm = () => {
    setAddFormData({
      name: '',
      primaryMuscleGroup: '',
      secondaryMuscleGroups: [{ group: '' }]
    });
  };

  const openAddModal = () => {
    resetAddForm();
    setValidationError('');
    setShowAddModal(true);
  };

  const openEditModal = (exercise) => {
    // Transform array of strings to array of objects for the form
    const secondaryGroupsForForm = exercise.secondaryMuscleGroups.length > 0 
      ? exercise.secondaryMuscleGroups.map(group => ({ group }))
      : [{ group: '' }];

    setEditFormData({
      name: exercise.name,
      primaryMuscleGroup: exercise.primaryMuscleGroup,
      secondaryMuscleGroups: secondaryGroupsForForm
    });
    setEditExerciseId(exercise.id);
    setValidationError('');
    setShowEditModal(true);
  };

  const addSecondaryMuscleGroup = (isEditForm = false) => {
    // Get the correct form data and setter based on which form we're working with
    const formData = isEditForm ? editFormData : addFormData;
    const setFormData = isEditForm ? setEditFormData : setAddFormData;
    
    // Prevent adding more secondary muscle groups than available
    if (formData.secondaryMuscleGroups.length < MUSCLE_GROUPS.length - 1) {
      setFormData({
        ...formData,
        secondaryMuscleGroups: [...formData.secondaryMuscleGroups, { group: '' }]
      });
    }
  };

  const handleSecondaryMuscleGroupChange = (index, value, isEditForm = false) => {
    // Get the correct form data and setter based on which form we're working with
    const formData = isEditForm ? editFormData : addFormData;
    const setFormData = isEditForm ? setEditFormData : setAddFormData;
    
    const updated = [...formData.secondaryMuscleGroups];
    updated[index] = { group: value };
    
    setFormData({
      ...formData,
      secondaryMuscleGroups: updated
    });
  };

  const removeSecondaryMuscleGroup = (index, isEditForm = false) => {
    // Get the correct form data and setter based on which form we're working with
    const formData = isEditForm ? editFormData : addFormData;
    const setFormData = isEditForm ? setEditFormData : setAddFormData;
    
    const updated = [...formData.secondaryMuscleGroups];
    updated.splice(index, 1);
    
    setFormData({
      ...formData,
      secondaryMuscleGroups: updated
    });
  };

  const validateExercise = async (exerciseName, primaryGroup, secondaryGroups, checkingExistingId = null) => {
    // Reset previous error message
    setValidationError('');

    // Validate exercise name
    if (!exerciseName.trim()) {
      setValidationError('Exercise name is required.');
      return false;
    }

    // Check for duplicate exercise name
    const exerciseQuery = query(collection(db, "exercises"), where("name", "==", exerciseName.trim()));
    const querySnapshot = await getDocs(exerciseQuery);
    
    // When editing, we need to exclude the current exercise from duplicate check
    if (!querySnapshot.empty) {
      // If we're in edit mode, check if the duplicate is the exercise we're editing
      let isDuplicate = false;
      querySnapshot.forEach((doc) => {
        if (checkingExistingId && doc.id === checkingExistingId) {
          // This is our own exercise, so not a duplicate
        } else {
          isDuplicate = true;
        }
      });

      if (isDuplicate) {
        setValidationError('An exercise with this name already exists.');
        return false;
      }
    }

    // Validate primary muscle group
    if (!primaryGroup || primaryGroup === '' || String(primaryGroup).trim() === '') {
      setValidationError('Primary muscle group is required.');
      return false;
    }

    // Validate secondary muscle groups (optional)
    const validSecondaryGroups = secondaryGroups
      .map(mg => mg.group)
      .filter(Boolean);

    // Prevent duplicate muscle groups
    const uniqueSecondaryGroups = [...new Set(validSecondaryGroups)];
    if (validSecondaryGroups.length !== uniqueSecondaryGroups.length) {
      setValidationError('Remove duplicate secondary muscle groups.');
      return false;
    }

    // Prevent primary muscle group from being a secondary muscle group
    if (validSecondaryGroups.includes(primaryGroup)) {
      setValidationError('Primary muscle group cannot be a secondary muscle group.');
      return false;
    }

    return true;
  };

  const handleAddExercise = async () => {
    // Prevent multiple submissions
    if (isSubmitting) return;
    
    try {
      // Validate before submission
      const isValid = await validateExercise(
        addFormData.name, 
        addFormData.primaryMuscleGroup, 
        addFormData.secondaryMuscleGroups
      );
      if (!isValid) return;

      setIsSubmitting(true);

      // Prepare exercise data
      const exerciseData = {
        name: addFormData.name.trim(),
        primaryMuscleGroup: addFormData.primaryMuscleGroup,
        secondaryMuscleGroups: addFormData.secondaryMuscleGroups
         .map(mg => mg.group)
         .filter(Boolean),
      };

      // Add to Firestore
      await addDoc(collection(db, "exercises"), exerciseData);

      // Reset form and show success message
      setSuccessMessage(`Exercise "${addFormData.name}" added successfully!`);
      resetAddForm();
      setShowAddModal(false);

      // Refresh exercises
      await fetchExercises();
    } catch (error) {
      console.error("Error adding exercise: ", error);
      setValidationError("Failed to add exercise. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditExercise = async () => {
    if (isSubmitting) return;
    
    try {
      // Validate the edit form data
      const isValid = await validateExercise(
        editFormData.name, 
        editFormData.primaryMuscleGroup, 
        editFormData.secondaryMuscleGroups,
        editExerciseId
      );
      if (!isValid) return;

      setIsSubmitting(true);

      // Prepare exercise data
      const exerciseData = {
        name: editFormData.name.trim(),
        primaryMuscleGroup: editFormData.primaryMuscleGroup,
        secondaryMuscleGroups: editFormData.secondaryMuscleGroups
          .map(mg => mg.group)
          .filter(Boolean),
      };

      // Update in Firestore
      const exerciseRef = doc(db, "exercises", editExerciseId);
      await updateDoc(exerciseRef, exerciseData);

      // Show success message
      setSuccessMessage(`Exercise "${editFormData.name}" updated successfully!`);
      
      // Close modal and reset edit form
      setShowEditModal(false);
      setEditExerciseId(null);

      // Refresh exercises
      await fetchExercises();
    } catch (error) {
      console.error("Error updating exercise: ", error);
      setValidationError("Failed to update exercise. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const groupByPrimaryMuscle = () => {
    return exercises.reduce((acc, exercise) => {
      const group = exercise.primaryMuscleGroup;
      if (!acc[group]) acc[group] = [];
      acc[group].push(exercise);
      return acc;
    }, {});
  };

  const groupedExercises = groupByPrimaryMuscle();

  // Reusable form fields component for both add and edit modals
  const ExerciseFormFields = ({ formData, setFormData, isEditForm }) => (
    <>
      <Form.Group controlId={`${isEditForm ? 'edit' : 'add'}FormExerciseName`} className="mb-3">
        <Form.Label>Exercise Name</Form.Label>
        <Form.Control
          type="text"
          value={formData.name}
          onChange={e => setFormData({...formData, name: e.target.value})}
          placeholder="Enter exercise name"
          className="soft-input"
        />
      </Form.Group>

      <Form.Group controlId={`${isEditForm ? 'edit' : 'add'}FormPrimaryMuscleGroup`} className="mb-3">
        <Form.Label>Primary Muscle Group</Form.Label>
        <Form.Control
          as="select"
          value={formData.primaryMuscleGroup}
          onChange={e => setFormData({...formData, primaryMuscleGroup: e.target.value})}
          className="soft-input"
          required
        >
          <option value="">Select Primary Muscle Group</option>
          {MUSCLE_GROUPS.map((group) => (
            <option key={`${isEditForm ? 'edit' : 'add'}-primary-${group}`} value={group}>{group}</option>
          ))}
        </Form.Control>
      </Form.Group>

      <Form.Label>Secondary Muscle Groups</Form.Label>
      {formData.secondaryMuscleGroups.map((muscleGroup, index) => (
        <InputGroup key={`${isEditForm ? 'edit' : 'add'}-secondary-${index}`} className="mb-3">
          <Form.Control
            as="select"
            value={muscleGroup.group}
            onChange={e => handleSecondaryMuscleGroupChange(index, e.target.value, isEditForm)}
            className="soft-input"
          >
            <option value="">Select Secondary Muscle Group</option>
            {MUSCLE_GROUPS.map((group) => (
              <option key={`${isEditForm ? 'edit' : 'add'}-${group}-${index}`} value={group}>{group}</option>
            ))}
          </Form.Control>
          <Button
            variant="outline-secondary"
            onClick={() => addSecondaryMuscleGroup(isEditForm)}
            className="soft-button"
          >
            +
          </Button>
          {index !== 0 && (
            <Button
              variant="outline-danger"
              onClick={() => removeSecondaryMuscleGroup(index, isEditForm)}
              className="soft-button"
            >
              <Trash />
            </Button>
          )}
        </InputGroup>
      ))}
    </>
  );

  return (
    <Container fluid className="soft-container exercises-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card exercises-card shadow border-0">
            <h1 className="soft-title exercises-title text-center">Exercises</h1>

            {successMessage && (
              <Alert variant="success" onClose={() => setSuccessMessage('')} dismissible>
                {successMessage}
              </Alert>
            )}

            <div className="d-flex justify-content-start mb-4">
              <Button 
                onClick={openAddModal}
                className="soft-button exercises-button gradient"
              >
                <PlusLg className="me-2" /> Add New Exercise
              </Button>
            </div>

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
                            {exercise.secondaryMuscleGroups.length > 0 && 
                              <span> - Secondary: {exercise.secondaryMuscleGroups.join(', ')}</span>
                            }
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

      {/* Add Exercise Modal */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered>
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
      </Modal>

      {/* Edit Exercise Modal */}
      <Modal show={showEditModal} onHide={() => setShowEditModal(false)} centered>
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
      </Modal>
    </Container>
  );
}

export default Exercises;