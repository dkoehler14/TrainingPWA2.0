import React, { useState, useEffect } from 'react';
import { Form, Button, Container, Row, Col, ListGroup, InputGroup } from 'react-bootstrap';
import { db, auth } from '../firebase';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';

function CreateProgram() {
  const [programName, setProgramName] = useState('');
  const [duration, setDuration] = useState(1);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [workoutsList, setWorkoutsList] = useState([]);
  const [predefinedPrograms, setPredefinedPrograms] = useState([]);
  const [weeklyOverrides, setWeeklyOverrides] = useState([]);
  const [exercisesList, setExercisesList] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        // Fetch user workouts
        const userWorkoutsQuery = query(collection(db, "workouts"), where("userId", "==", user.uid));
        const userWorkoutsSnapshot = await getDocs(userWorkoutsQuery);
        const userWorkouts = userWorkoutsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch predefined workouts
        const predefWorkoutsQuery = query(collection(db, "workouts"), where("isPredefined", "==", true));
        const predefWorkoutsSnapshot = await getDocs(predefWorkoutsQuery);
        const predefWorkouts = predefWorkoutsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setWorkoutsList([...userWorkouts, ...predefWorkouts]);

        // Fetch exercises
        const exerciseSnapshot = await getDocs(collection(db, "exercises"));
        setExercisesList(exerciseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        // Fetch predefined programs
        const predefProgramsQuery = query(collection(db, "programs"), where("isPredefined", "==", true));
        const predefProgramsSnapshot = await getDocs(predefProgramsQuery);
        setPredefinedPrograms(predefProgramsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    };
    fetchData();
  }, [user]);

  const selectWorkout = (workout) => {
    setSelectedWorkout(workout);
    setWeeklyOverrides(Array.from({ length: duration }, () => [{ workoutId: workout.id, exercises: [] }]));
  };

  const loadPredefinedProgram = (program) => {
    setProgramName(program.name);
    setDuration(program.duration);
    const workout = workoutsList.find(w => w.id === program.workoutIds[0]);
    setSelectedWorkout(workout);
    setWeeklyOverrides(program.weeklyOverrides);
  };

  const updateOverride = (weekIndex, exerciseIndex, field, value) => {
    const newOverrides = [...weeklyOverrides];
    const exerciseToOverride = selectedWorkout.exercises[exerciseIndex];
    const existingOverride = newOverrides[weekIndex][0].exercises.find(ex => ex.exerciseId === exerciseToOverride.exerciseId);

    if (existingOverride) {
      existingOverride[field] = Number(value);
    } else {
      newOverrides[weekIndex][0].exercises.push({
        exerciseId: exerciseToOverride.exerciseId,
        sets: field === 'sets' ? Number(value) : exerciseToOverride.sets,
        reps: field === 'reps' ? Number(value) : exerciseToOverride.reps
      });
    }
    setWeeklyOverrides(newOverrides);
  };

  const handleDurationChange = (newDuration) => {
    setDuration(newDuration);
    if (selectedWorkout) {
      setWeeklyOverrides(Array.from({ length: newDuration }, () => [{ workoutId: selectedWorkout.id, exercises: [] }]));
    }
  };

  const getWeeklyExercise = (weekIndex, exercise) => {
    const override = weeklyOverrides[weekIndex]?.[0]?.exercises.find(ex => ex.exerciseId === exercise.exerciseId);
    return override ? { ...exercise, ...override } : exercise;
  };

  const saveProgram = async () => {
    if (!user || !programName || !selectedWorkout || weeklyOverrides.length === 0) return;
    try {
      await addDoc(collection(db, "programs"), {
        userId: user.uid,
        isPredefined: false,
        name: programName,
        duration,
        workoutIds: [selectedWorkout.id],
        weeklyOverrides,
        createdAt: new Date()
      });
      setProgramName('');
      setDuration(1);
      setSelectedWorkout(null);
      setWeeklyOverrides([]);
    } catch (error) {
      console.error("Error saving program: ", error);
    }
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={8}>
          <h1 className="text-center mb-4">Create Program</h1>
          <Form>
            <Form.Group controlId="formProgramName">
              <Form.Label>Program Name</Form.Label>
              <Form.Control 
                type="text" 
                value={programName} 
                onChange={e => setProgramName(e.target.value)} 
                placeholder="Enter program name" 
              />
            </Form.Group>

            <Form.Group controlId="formDuration">
              <Form.Label>Duration (Weeks)</Form.Label>
              <Form.Control 
                type="number" 
                value={duration} 
                onChange={e => handleDurationChange(e.target.value)} 
                min="1"
              />
            </Form.Group>

            <Form.Group controlId="formWorkouts">
              <Form.Label>Select Workout</Form.Label>
              <ListGroup>
                {workoutsList.map(workout => (
                  <ListGroup.Item key={workout.id}>
                    <Button 
                      variant="link" 
                      onClick={() => selectWorkout(workout)}
                    >
                      {workout.isPredefined ? "[Predefined] " : ""}{workout.exercises.length} exercises - {workout.date?.toDate().toLocaleDateString() || "N/A"}
                    </Button>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Form.Group>

            <h5 className="mt-4">Predefined Programs</h5>
            <ListGroup className="mb-4">
              {predefinedPrograms.map(program => (
                <ListGroup.Item key={program.id}>
                  <Button variant="link" onClick={() => loadPredefinedProgram(program)}>
                    {program.name} ({program.duration} weeks)
                  </Button>
                </ListGroup.Item>
              ))}
            </ListGroup>

            {selectedWorkout && (
              <>
                <h5 className="mt-4">Weekly Configuration</h5>
                {Array.from({ length: duration }).map((_, weekIndex) => (
                  <div key={weekIndex} className="mb-3">
                    <h6>Week {weekIndex + 1}</h6>
                    {selectedWorkout.exercises.map((ex, exIndex) => {
                      const weeklyEx = getWeeklyExercise(weekIndex, ex);
                      return (
                        <InputGroup key={exIndex} className="mb-2">
                          <Form.Control
                            value={exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Loading...'}
                            disabled
                          />
                          <Form.Control
                            type="number"
                            value={weeklyEx.sets}
                            onChange={e => updateOverride(weekIndex, exIndex, 'sets', e.target.value)}
                            placeholder="Sets"
                          />
                          <Form.Control
                            type="number"
                            value={weeklyEx.reps}
                            onChange={e => updateOverride(weekIndex, exIndex, 'reps', e.target.value)}
                            placeholder="Reps"
                          />
                        </InputGroup>
                      );
                    })}
                  </div>
                ))}
              </>
            )}

            <Button variant="success" onClick={saveProgram} className="mt-3">
              Save Program
            </Button>
          </Form>
        </Col>
      </Row>
    </Container>
  );
}

export default CreateProgram;