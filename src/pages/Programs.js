import React, { useState, useEffect } from 'react';
import { Container, Row, Col, ListGroup, Button, Accordion } from 'react-bootstrap';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import '../styles/Programs.css';

function Programs() {
  const [userPrograms, setUserPrograms] = useState([]);
  const [predefinedPrograms, setPredefinedPrograms] = useState([]);
  const [exercises, setExercises] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        const userProgramsQuery = query(collection(db, "programs"), where("userId", "==", user.uid));
        const userProgramsSnapshot = await getDocs(userProgramsQuery);
        setUserPrograms(userProgramsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const predefProgramsQuery = query(collection(db, "programs"), where("isPredefined", "==", true));
        const predefProgramsSnapshot = await getDocs(predefProgramsQuery);
        setPredefinedPrograms(predefProgramsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

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
        daysPerWeek: program.daysPerWeek,
        weeklyConfigs: program.weeklyConfigs,
        createdAt: new Date()
      });
      const userProgramsQuery = query(collection(db, "programs"), where("userId", "==", user.uid));
      const userProgramsSnapshot = await getDocs(userProgramsQuery);
      setUserPrograms(userProgramsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error adopting program: ", error);
    }
  };

  const getExerciseName = (exerciseId) => {
    return exercises.find(ex => ex.id === exerciseId)?.name || 'Unknown';
  };

  return (
    <Container fluid className="soft-container programs-container">
      <Row className="justify-content-center">
        <Col md={10}>
          <div className="soft-card programs-card shadow border-0">
            <h1 className="soft-title programs-title text-center">Programs</h1>

            <h3 className="soft-subtitle section-title">Your Programs</h3>
            <Accordion className="mb-4">
              {userPrograms.length === 0 ? (
                <p className="soft-text no-programs-text">No programs yet. Create or adopt one!</p>
              ) : (
                userPrograms.map((program, index) => (
                  <Accordion.Item key={program.id} eventKey={index.toString()} className="soft-accordion-item accordion-item">
                    <Accordion.Header className="accordion-header">
                      {program.name} ({program.duration} weeks, {program.daysPerWeek} days/week)
                    </Accordion.Header>
                    <Accordion.Body>
                      {program.weeklyConfigs.map((week, weekIndex) => (
                        <div key={weekIndex} className="mb-3">
                          <h5 className="soft-text week-title">Week {weekIndex + 1}</h5>
                          {week.map((day, dayIndex) => (
                            <div key={dayIndex} className="mb-2">
                              <h6 className="soft-text">Day {dayIndex + 1}</h6>
                              <ListGroup>
                                {day.exercises.map((ex, exIndex) => (
                                  <ListGroup.Item key={exIndex} className="soft-list-group-item list-group-item">
                                    <strong>{getExerciseName(ex.exerciseId)}</strong> - 
                                    {ex.sets} sets x {ex.reps} reps
                                  </ListGroup.Item>
                                ))}
                              </ListGroup>
                            </div>
                          ))}
                        </div>
                      ))}
                    </Accordion.Body>
                  </Accordion.Item>
                ))
              )}
            </Accordion>

            <h3 className="soft-subtitle section-title">Predefined Programs</h3>
            <Accordion>
              {predefinedPrograms.map((program, index) => (
                <Accordion.Item key={program.id} eventKey={index.toString()} className="soft-accordion-item accordion-item">
                  <Accordion.Header className="accordion-header">
                    {program.name} ({program.duration} weeks, {program.daysPerWeek} days/week)
                  </Accordion.Header>
                  <Accordion.Body>
                    {program.weeklyConfigs.map((week, weekIndex) => (
                      <div key={weekIndex} className="mb-3">
                        <h5 className="soft-text week-title">Week {weekIndex + 1}</h5>
                        {week.map((day, dayIndex) => (
                          <div key={dayIndex} className="mb-2">
                            <h6 className="soft-text">Day {dayIndex + 1}</h6>
                            <ListGroup>
                              {day.exercises.map((ex, exIndex) => (
                                <ListGroup.Item key={exIndex} className="soft-list-group-item list-group-item">
                                  <strong>{getExerciseName(ex.exerciseId)}</strong> - 
                                  {ex.sets} sets x {ex.reps} reps
                                </ListGroup.Item>
                              ))}
                            </ListGroup>
                          </div>
                        ))}
                      </div>
                    ))}
                    <Button onClick={() => adoptProgram(program)} className="soft-button adopt-button gradient">
                      Adopt Program
                    </Button>
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

export default Programs;