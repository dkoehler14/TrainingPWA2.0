import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { Form, Button, Container, Row, Col, ListGroup, Accordion, InputGroup } from 'react-bootstrap';
import { Trash } from 'react-bootstrap-icons';

function App() {
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

  // Function to add a new input field for muscle groups
  const addMuscleGroup = (array, setter) => {
    setter([...array, '']);
  };

  // Function to handle changes in muscle group inputs
  const handleMuscleGroupChange = (index, event, array, setter) => {
    const updatedMuscleGroups = [...array];
    updatedMuscleGroups[index] = event.target.value;
    setter(updatedMuscleGroups);
  };

  // Function to remove a muscle group
  const removeMuscleGroup = (index, array, setter) => {
    const updatedMuscleGroups = [...array];
    updatedMuscleGroups.splice(index, 1);
    setter(updatedMuscleGroups);
  };

  const addExercise = async () => {
    try {
      await addDoc(collection(db, "exercises"), {
        name: newExercise,
        primaryMuscleGroups: primaryMuscleGroups.filter(Boolean),
        secondaryMuscleGroups: secondaryMuscleGroups.filter(Boolean),
        date: new Date()
      });
      setNewExercise('');
      setPrimaryMuscleGroups(['']);
      setSecondaryMuscleGroups(['']);
      // Refetch exercises to update list
      const querySnapshot = await getDocs(collection(db, "exercises"));
      let updatedExercises = [];
      querySnapshot.forEach((doc) => {
        updatedExercises.push({ id: doc.id, ...doc.data() });
      });
      setExercises(updatedExercises);
    } catch (error) {
      console.error("Error adding document: ", error);
    }
  };

  // Helper function to group exercises by primary muscle group
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
          <h1 className="text-center mb-4">Exercise Tracker</h1>
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
                        Secondary: {exercise.secondaryMuscleGroups.join(', ')} - 
                        Added on {exercise.date.toDate().toLocaleDateString()}
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

export default App;