import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, ListGroup, Accordion, InputGroup, Alert } from 'react-bootstrap';
import { Trash } from 'react-bootstrap-icons';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import '../styles/Exercises.css';

function Exercises() {
  const MUSCLE_GROUPS = [
    'Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders', 
    'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 
    'Traps', 'Forearms'
  ];

  const [exercises, setExercises] = useState([]);
  const [newExercise, setNewExercise] = useState('');
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState(['']);
  const [secondaryMuscleGroups, setSecondaryMuscleGroups] = useState([{ group: ''}]);

  // New state for validation and feedback
  const [validationError, setValidationError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchExercises = async () => {
      const querySnapshot = await getDocs(collection(db, "exercises"));
      let exercisesData = [];
      querySnapshot.forEach((doc) => {
        exercisesData.push({ id: doc.id, ...doc.data() });
      });
      setExercises(exercisesData);
    };
    fetchExercises();
  }, []);

  const addSecondaryMuscleGroup = () => {
    // Prevent adding more secondary muscle groups than primary groups
    if (secondaryMuscleGroups.length < MUSCLE_GROUPS.length - 1) {
      setSecondaryMuscleGroups([...secondaryMuscleGroups, { group: '' }]);
    }
  }

  const handleSecondaryMuscleGroupChange = (index, value) => {
    const updated = [...secondaryMuscleGroups];
    updated[index] = { group: value };
    setSecondaryMuscleGroups(updated);
  };

  const removeSecondaryMuscleGroup = (index) => {
    const updated = [...secondaryMuscleGroups];
    updated.splice(index, 1);
    setSecondaryMuscleGroups(updated);
  };

  const validateExercise = async () => {
    // Reset previous messages
    setValidationError('');
    setSuccessMessage('');

    // Validate exercise name
    if (!newExercise.trim()) {
      setValidationError('Exercise name is required.');
      return false;
    }

    // Check for duplicate exercise name
    const exerciseQuery = query(collection(db, "exercises"), where("name", "==", newExercise.trim()));
    const querySnapshot = await getDocs(exerciseQuery);
    if (!querySnapshot.empty) {
      setValidationError('An exercise with this name already exists.');
      return false;
    }

    // Validate primary muscle group
    console.log('primaryMuscleGroup:', primaryMuscleGroup);
    if (!primaryMuscleGroup || primaryMuscleGroup === '' || String(primaryMuscleGroup).trim() === '') {
      setValidationError('Primary muscle group is required.');
      return false;
    }

    // Validate secondary muscle groups (optional)
    const validSecondaryGroups = secondaryMuscleGroups
      .map(mg => mg.group)
      .filter(Boolean);

    // Prevent duplicate muscle groups
    const uniqueSecondaryGroups = [...new Set(validSecondaryGroups)];
    if (validSecondaryGroups.length !== uniqueSecondaryGroups.length) {
      setValidationError('Remove duplicate secondary muscle groups.');
      return false;
    }

    // Prevent primary muscle group from being a secondary muscle group
    if (validSecondaryGroups.includes(primaryMuscleGroup)) {
      setValidationError('Primary muscle group cannot be a secondary muscle group.');
      return false;
    }

    return true;
  };

  const addExercise = async () => {
    // Prevent multiple submissions
    if (isSubmitting) return;
    
    try {
      // Validate before submission
      const isValid = await validateExercise();
      if (!isValid) return;

      setIsSubmitting(true);

      // Prepare exercise data
      const exerciseData = {
        name: newExercise.trim(),
        primaryMuscleGroup: primaryMuscleGroup,
        secondaryMuscleGroups: secondaryMuscleGroups
         .map(mg => mg.group)
         .filter(Boolean),
      };

      // Add to Firestore
      await addDoc(collection(db, "exercises"), exerciseData);

      // Reset form and show success message
      setSuccessMessage(`Exercise "${newExercise}" added successfully!`);
      setNewExercise('');
      setPrimaryMuscleGroup('');
      setSecondaryMuscleGroups([{ group: '' }]);

      // Refresh exercises
      const querySnapshot = await getDocs(collection(db, "exercises"));
      setExercises(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error adding exercise: ", error);
      setValidationError("Failed to add exercise. Please try again.");
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

  return (
    <Container fluid className="soft-container exercises-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card exercises-card shadow border-0">
            <h1 className="soft-title exercises-title text-center">Exercises</h1>

            {validationError && (
              <Alert variant="danger" onClose={() => setValidationError('')} dismissible>
                {validationError}
              </Alert>
            )}

            {successMessage && (
              <Alert variant="success" onClose={() => setSuccessMessage('')} dismissible>
                {successMessage}
              </Alert>
            )}

            <Form>
              <Form.Group controlId="formExerciseName" className="exercises-form-group">
                <Form.Label className="soft-label exercises-label">Exercise Name</Form.Label>
                <Form.Control
                  type="text"
                  value={newExercise}
                  onChange={e => setNewExercise(e.target.value)}
                  placeholder="Enter exercise name"
                  className="soft-input exercises-input"
                />
              </Form.Group>

              <h5 className="soft-label exercises-label">Primary Muscle Group</h5>
              <Form.Group controlId="formPrimaryMuscleGroup" className="exercises-form-group">
                <Form.Control
                  as="select"
                  value={primaryMuscleGroup}
                  onChange={e => setPrimaryMuscleGroup(e.target.value)}
                  className="soft-input exercises-input"
                  required
                >
                  <option value="">Select Primary Muscle Group</option>
                  {MUSCLE_GROUPS.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </Form.Control>
              </Form.Group>

              <h5 className="soft-label exercises-label mt-3">Secondary Muscle Groups</h5>
              {secondaryMuscleGroups.map((muscleGroup, index) => (
                <InputGroup key={index} className="exercises-form-group">
                  <Form.Control
                    as="select"
                    value={muscleGroup.group}
                    onChange={e => handleSecondaryMuscleGroupChange(index, e.target.value)}
                    //placeholder="Secondary muscle group"
                    className="soft-input exercises-input"
                  >
                    <option value="">Select Secondary Muscle Group</option>
                    {MUSCLE_GROUPS.map((group) => (
                      <option key={`${group}-${index}`} value={group}>{group}</option>
                    ))}
                  </Form.Control>
                  <Button
                    variant="outline-secondary"
                    onClick={addSecondaryMuscleGroup}
                    className="soft-button exercises-button"
                  >
                    +
                  </Button>
                  {index !== 0 && (
                    <Button
                      variant="outline-danger"
                      onClick={() => removeSecondaryMuscleGroup(index)}
                      className="soft-button exercises-button"
                    >
                      <Trash />
                    </Button>
                  )}
                </InputGroup>
              ))}

              <Button 
                onClick={addExercise}
                className="soft-button exercises-button gradient"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Add Exercise'}
              </Button>
            </Form>

            <Accordion className="mt-4">
              {Object.keys(groupedExercises).map((muscleGroup, index) => (
                <Accordion.Item key={index} eventKey={index.toString()} className="soft-accordion-item exercises-accordion-item">
                  <Accordion.Header>{muscleGroup}</Accordion.Header>
                  <Accordion.Body>
                    <ListGroup>
                      {groupedExercises[muscleGroup].map((exercise) => (
                        <ListGroup.Item key={exercise.id} className="soft-list-group-item exercises-list-group-item">
                          <strong>{exercise.name}</strong> - Secondary: {exercise.secondaryMuscleGroups.join(', ')}
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  </Accordion.Body>
                </Accordion.Item>
              ))}
            </Accordion>
          </div>
        </Col>
      </Row>
    </Container>
  );
}

export default Exercises;