import React, { useState } from 'react';
import { Form, Button, Container, Row, Col, ListGroup } from 'react-bootstrap';

function CreateWorkout() {
  const [workout, setWorkout] = useState([]);
  const [exercise, setExercise] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');

  const addExerciseToWorkout = () => {
    if (exercise && sets && reps) {
      setWorkout([...workout, { exercise, sets, reps }]);
      setExercise('');
      setSets('');
      setReps('');
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
                type="text" 
                value={exercise} 
                onChange={e => setExercise(e.target.value)} 
                placeholder="Enter exercise name" 
              />
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

            <Button variant="primary" onClick={addExerciseToWorkout}>
              Add to Workout
            </Button>
          </Form>

          <ListGroup className="mt-4">
            {workout.map((item, index) => (
              <ListGroup.Item key={index}>
                <strong>{item.exercise}</strong> - {item.sets} sets x {item.reps} reps
              </ListGroup.Item>
            ))}
          </ListGroup>
        </Col>
      </Row>
    </Container>
  );
}

export default CreateWorkout;
