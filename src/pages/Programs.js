import React, { useState, useEffect } from 'react';
import { Container, Row, Col, ListGroup, Button, Accordion } from 'react-bootstrap';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';

function Programs() {
  const [userPrograms, setUserPrograms] = useState([]);
  const [predefinedPrograms, setPredefinedPrograms] = useState([]);
  const [workouts, setWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        // Fetch user programs
        const userProgramsQuery = query(collection(db, "programs"), where("userId", "==", user.uid));
        const userProgramsSnapshot = await getDocs(userProgramsQuery);
        setUserPrograms(userProgramsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        // Fetch predefined programs
        const predefProgramsQuery = query(collection(db, "programs"), where("isPredefined", "==", true));
        const predefProgramsSnapshot = await getDocs(predefProgramsQuery);
        setPredefinedPrograms(predefProgramsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        // Fetch all workouts (user and predefined)
        const workoutsSnapshot = await getDocs(collection(db, "workouts"));
        setWorkouts(workoutsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        // Fetch exercises
        const exercisesSnapshot = await getDocs(collection(db, "exercises"));
        setExercises(exercisesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    };
    fetchData();
  }, [user]);

  const adoptProgram = async (program) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "programs"), {
        userId: user.uid,
        isPredefined: false,
        name: `${program.name} (Adopted)`,
        duration: program.duration,
        workoutIds: program.workoutIds,
        weeklyOverrides: program.weeklyOverrides,
        createdAt: new Date()
      });
      // Refresh user programs
      const userProgramsQuery = query(collection(db, "programs"), where("userId", "==", user.uid));
      const userProgramsSnapshot = await getDocs(userProgramsQuery);
      setUserPrograms(userProgramsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error adopting program: ", error);
    }
  };

  const getWorkoutDetails = (workoutId) => {
    return workouts.find(w => w.id === workoutId) || { exercises: [] };
  };

  const getExerciseName = (exerciseId) => {
    return exercises.find(ex => ex.id === exerciseId)?.name || 'Unknown';
  };

  const getWeeklyExercise = (baseExercises, overrides) => {
    return baseExercises.map(ex => {
      const override = overrides.find(o => o.exerciseId === ex.exerciseId);
      return override ? { ...ex, ...override } : ex;
    });
  };

  return (
    <Container className="mt-5">
      <Row className="justify-content-center">
        <Col md={10}>
          <h1 className="text-center mb-4">Programs</h1>

          <h3>Your Programs</h3>
          <Accordion className="mb-4">
            {userPrograms.length === 0 ? (
              <p>No programs yet. Create or adopt one!</p>
            ) : (
              userPrograms.map((program, index) => (
                <Accordion.Item key={program.id} eventKey={index.toString()}>
                  <Accordion.Header>{program.name} ({program.duration} weeks)</Accordion.Header>
                  <Accordion.Body>
                    {program.weeklyOverrides.map((week, weekIndex) => (
                      <div key={weekIndex} className="mb-3">
                        <h5>Week {weekIndex + 1}</h5>
                        {week.map((workoutOverride) => {
                          const workout = getWorkoutDetails(workoutOverride.workoutId);
                          const weeklyExercises = getWeeklyExercise(workout.exercises, workoutOverride.exercises);
                          return (
                            <ListGroup key={workoutOverride.workoutId}>
                              {weeklyExercises.map((ex, exIndex) => (
                                <ListGroup.Item key={exIndex}>
                                  <strong>{getExerciseName(ex.exerciseId)}</strong> - {ex.sets} sets x {ex.reps} reps
                                </ListGroup.Item>
                              ))}
                            </ListGroup>
                          );
                        })}
                      </div>
                    ))}
                  </Accordion.Body>
                </Accordion.Item>
              ))
            )}
          </Accordion>

          <h3>Predefined Programs</h3>
          <Accordion>
            {predefinedPrograms.map((program, index) => (
              <Accordion.Item key={program.id} eventKey={index.toString()}>
                <Accordion.Header>{program.name} ({program.duration} weeks)</Accordion.Header>
                <Accordion.Body>
                  {program.weeklyOverrides.map((week, weekIndex) => (
                    <div key={weekIndex} className="mb-3">
                      <h5>Week {weekIndex + 1}</h5>
                      {week.map((workoutOverride) => {
                        const workout = getWorkoutDetails(workoutOverride.workoutId);
                        const weeklyExercises = getWeeklyExercise(workout.exercises, workoutOverride.exercises);
                        return (
                          <ListGroup key={workoutOverride.workoutId}>
                            {weeklyExercises.map((ex, exIndex) => (
                              <ListGroup.Item key={exIndex}>
                                <strong>{getExerciseName(ex.exerciseId)}</strong> - {ex.sets} sets x {ex.reps} reps
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                        );
                      })}
                    </div>
                  ))}
                  <Button variant="primary" onClick={() => adoptProgram(program)} className="mt-3">
                    Adopt Program
                  </Button>
                </Accordion.Body>
              </Accordion.Item>
            ))}
          </Accordion>
        </Col>
      </Row>
    </Container>
  );
}

export default Programs;