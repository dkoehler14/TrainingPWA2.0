import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { Form, Button, Container, Row, Col, ListGroup, Accordion, InputGroup } from 'react-bootstrap';
import { Trash } from 'react-bootstrap-icons';

function Exercises() {
  const [exercises, setExercises] = useState([]);
  const [newExercise, setNewExercise] = useState('');
  const [primaryMuscleGroups, setPrimaryMuscleGroups] = useState(['']);
  const [secondaryMuscleGroups, setSecondaryMuscleGroups] = useState(['']);

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

  const addMuscleGroup = (array, setter) => setter([...array, '']);
  const handleMuscleGroupChange = (index, event, array, setter) => {
    const updated = [...array];
    updated[index] = event.target.value;
    setter(updated);
  };
  const removeMuscleGroup = (index, array, setter) => {
    const updated = [...array];
    updated.splice(index, 1);
    setter(updated);
  };

  const addExercise = async () => {
    try {
      await addDoc(collection(db, "exercises"), {
        name: newExercise,
        primaryMuscleGroups: primaryMuscleGroups.filter(Boolean),
        secondaryMuscleGroups: secondaryMuscleGroups.filter(Boolean),
      });
      setNewExercise('');
      setPrimaryMuscleGroups(['']);
      setSecondaryMuscleGroups(['']);
      const querySnapshot = await getDocs(collection(db, "exercises"));
      setExercises(querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error adding exercise: ", error);
    }
  };

  const groupByPrimaryMuscle = () => {
    return exercises.reduce((acc, exercise) => {
      for (let group of exercise.primaryMuscleGroups) {
        if (!acc[group]) acc[group] = [];
        acc[group].push(exercise);
      }
      return acc;
    }, {});
  };

  const groupedExercises = groupByPrimaryMuscle();

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={8}>
          <h1 className="text-center mb-4">Exercises</h1>
          <Form>
            <Form.Group controlId="formExerciseName">
              <Form.Label>Exercise Name</Form.Label>
              <Form.Control 
                type="text" 
                value={newExercise} 
                onChange={e => setNewExercise(e.target.value)} 
                placeholder="Enter exercise name" 
              />
            </Form.Group>

            <h5>Primary Muscle Groups</h5>
            {primaryMuscleGroups.map((group, index) => (
              <InputGroup key={index} className="mb-2">
                <Form.Control 
                  type="text" 
                  value={group} 
                  onChange={e => handleMuscleGroupChange(index, e, primaryMuscleGroups, setPrimaryMuscleGroups)} 
                  placeholder="Primary muscle group"
                />
                <Button 
                  variant="outline-secondary" 
                  onClick={() => addMuscleGroup(primaryMuscleGroups, setPrimaryMuscleGroups)}
                >+</Button>
                {index !== 0 && (
                  <Button 
                    variant="outline-danger" 
                    onClick={() => removeMuscleGroup(index, primaryMuscleGroups, setPrimaryMuscleGroups)}
                  >
                    <Trash />
                  </Button>
                )}
              </InputGroup>
            ))}

            <h5 className="mt-3">Secondary Muscle Groups</h5>
            {secondaryMuscleGroups.map((group, index) => (
              <InputGroup key={index} className="mb-2">
                <Form.Control 
                  type="text" 
                  value={group} 
                  onChange={e => handleMuscleGroupChange(index, e, secondaryMuscleGroups, setSecondaryMuscleGroups)} 
                  placeholder="Secondary muscle group"
                />
                <Button 
                  variant="outline-secondary" 
                  onClick={() => addMuscleGroup(secondaryMuscleGroups, setSecondaryMuscleGroups)}
                >+</Button>
                {index !== 0 && (
                  <Button 
                    variant="outline-danger" 
                    onClick={() => removeMuscleGroup(index, secondaryMuscleGroups, setSecondaryMuscleGroups)}
                  >
                    <Trash />
                  </Button>
                )}
              </InputGroup>
            ))}

            <Button variant="primary" onClick={addExercise} className="mt-3">
              Add Exercise
            </Button>
          </Form>

          <Accordion className="mt-4">
            {Object.keys(groupedExercises).map((muscleGroup, index) => (
              <Accordion.Item key={index} eventKey={index.toString()}>
                <Accordion.Header>{muscleGroup}</Accordion.Header>
                <Accordion.Body>
                  <ListGroup>
                    {groupedExercises[muscleGroup].map((exercise) => (
                      <ListGroup.Item key={exercise.id}>
                        <strong>{exercise.name}</strong> - 
                        Secondary: {exercise.secondaryMuscleGroups.join(', ')}
                      </ListGroup.Item>
                    ))}
                  </ListGroup>
                </Accordion.Body>
              </Accordion.Item>
            ))}
          </Accordion>
        </Col>
      </Row>
    </Container>
  );
}

export default Exercises;