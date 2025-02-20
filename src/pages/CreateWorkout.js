import React, { useState, useEffect } from 'react';
import { Form, Button, Container, Row, Col, ListGroup } from 'react-bootstrap';
import { db, auth } from '../firebase';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';

function CreateWorkout() {
  const [workout, setWorkout] = useState([]);
  const [exercise, setExercise] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [exercisesList, setExercisesList] = useState([]);
  const [predefinedWorkouts, setPredefinedWorkouts] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchData = async () => {
      // Fetch exercises
      const exerciseSnapshot = await getDocs(collection(db, "exercises"));
      setExercisesList(exerciseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

      // Fetch predefined workouts
      const predefQuery = query(collection(db, "workouts"), where("isPredefined", "==", true));
      const predefSnapshot = await getDocs(predefQuery);
      setPredefinedWorkouts(predefSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchData();
  }, []);

  const addExerciseToWorkout = () => {
    if (exercise && sets && reps) {
      setWorkout([...workout, { exerciseId: exercise, sets: Number(sets), reps: Number(reps) }]);
      setExercise('');
      setSets('');
      setReps('');
    }
  };

  const loadPredefinedWorkout = (predefWorkout) => {
    setWorkout([...predefWorkout.exercises]);
  };

  const saveWorkout = async () => {
    if (!user || workout.length === 0) return;
    try {
      await addDoc(collection(db, "workouts"), {
        userId: user.uid,
        isPredefined: false,
        exercises: workout,
        date: new Date()
      });
      setWorkout([]);
    } catch (error) {
      console.error("Error saving workout: ", error);
    }
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={8}>
          <h1 className="text-center mb-4">Create Workout</h1>
          <Form>
            <Form.Group controlId="formExercise">
              <Form.Label>Exercise</Form.Label>
              <Form.Control 
                as="select"
                value={exercise}
                onChange={e => setExercise(e.target.value)}
              >
                <option value="">Select an exercise</option>
                {exercisesList.map(ex => (
                  <option key={ex.id} value={ex.id}>{ex.name}</option>
                ))}
              </Form.Control>
            </Form.Group>

            <Form.Group controlId="formSets">
              <Form.Label>Sets</Form.Label>
              <Form.Control 
                type="number" 
                value={sets} 
                onChange={e => setSets(e.target.value)} 
                placeholder="Number of sets" 
              />
            </Form.Group>

            <Form.Group controlId="formReps">
              <Form.Label>Reps</Form.Label>
              <Form.Control 
                type="number" 
                value={reps} 
                onChange={e => setReps(e.target.value)} 
                placeholder="Number of reps" 
              />
            </Form.Group>

            <Button variant="primary" onClick={addExerciseToWorkout} className="mt-2">
              Add to Workout
            </Button>
            <Button variant="success" onClick={saveWorkout} className="mt-2 ms-2">
              Save Workout
            </Button>
          </Form>

          <h5 className="mt-4">Predefined Workouts</h5>
          <ListGroup className="mb-4">
            {predefinedWorkouts.map(workout => (
              <ListGroup.Item key={workout.id}>
                <Button variant="link" onClick={() => loadPredefinedWorkout(workout)}>
                  {workout.exercises.length} exercises
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>

          <ListGroup>
            {workout.map((item, index) => (
              <ListGroup.Item key={index}>
                <strong>{exercisesList.find(ex => ex.id === item.exerciseId)?.name || 'Loading...'}</strong> - 
                {item.sets} sets x {item.reps} reps
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Col>
      </Row>
    </Container>
  );
}

export default CreateWorkout;