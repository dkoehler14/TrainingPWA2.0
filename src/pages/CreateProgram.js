import React, { useState, useEffect } from 'react';
import { Form, Button, Container, Row, Col, ListGroup, InputGroup, Accordion } from 'react-bootstrap';
import { db, auth } from '../firebase';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import '../styles/CreateProgram.css';

function CreateProgram() {
  const [programName, setProgramName] = useState('');
  const [duration, setDuration] = useState(1);
  const [daysPerWeek, setDaysPerWeek] = useState(1);
  const [weeklyConfigs, setWeeklyConfigs] = useState([]); // Weekly configs with days
  const [newExercise, setNewExercise] = useState('');
  const [newExerciseDay, setNewExerciseDay] = useState(0);
  const [exercisesList, setExercisesList] = useState([]);
  const [predefinedPrograms, setPredefinedPrograms] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        const exerciseSnapshot = await getDocs(collection(db, "exercises"));
        setExercisesList(exerciseSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const predefProgramsQuery = query(collection(db, "programs"), where("isPredefined", "==", true));
        const predefProgramsSnapshot = await getDocs(predefProgramsQuery);
        setPredefinedPrograms(predefProgramsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    };
    fetchData();
  }, [user]);

  const initializeWeeklyConfigs = (newDuration, newDaysPerWeek) => {
    setWeeklyConfigs(Array(newDuration).fill().map(() => 
      Array(newDaysPerWeek).fill().map(() => ({ exercises: [] }))
    ));
  };

  const handleDurationChange = (newDuration) => {
    setDuration(newDuration);
    initializeWeeklyConfigs(newDuration, daysPerWeek);
  };

  const handleDaysPerWeekChange = (newDays) => {
    setDaysPerWeek(newDays);
    initializeWeeklyConfigs(duration, newDays);
  };

  const addExercise = () => {
    if (newExercise && weeklyConfigs.length > 0) {
      const newConfigs = [...weeklyConfigs];
      newConfigs.forEach(week => {
        week[newExerciseDay].exercises.push({
          exerciseId: newExercise,
          sets: 0,
          reps: 0
        });
      });
      setWeeklyConfigs(newConfigs);
      setNewExercise('');
    }
  };

  const updateExerciseConfig = (weekIndex, dayIndex, exerciseIndex, field, value) => {
    const newConfigs = [...weeklyConfigs];
    newConfigs[weekIndex][dayIndex].exercises[exerciseIndex][field] = Number(value);
    setWeeklyConfigs(newConfigs);
  };

  const loadPredefinedProgram = (program) => {
    setProgramName(program.name);
    setDuration(program.duration);
    setDaysPerWeek(program.daysPerWeek || 1); // Default to 1 if missing
    setWeeklyConfigs(program.weeklyConfigs || []);
  };

  const saveProgram = async () => {
    if (!user || !programName || weeklyConfigs.length === 0 || weeklyConfigs[0][0].exercises.length === 0) return;
    try {
      await addDoc(collection(db, "programs"), {
        userId: user.uid,
        isPredefined: false,
        name: programName,
        duration,
        daysPerWeek,
        weeklyConfigs,
        createdAt: new Date()
      });
      setProgramName('');
      setDuration(1);
      setDaysPerWeek(1);
      setWeeklyConfigs([]);
      setNewExercise('');
    } catch (error) {
      console.error("Error saving program: ", error);
    }
  };

  return (
    <Container fluid className="soft-container create-program-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card create-program-card shadow border-0">
            <h1 className="soft-title create-program-title text-center">Create Program</h1>
            <Form>
              <Form.Group controlId="formProgramName" className="create-program-form-group">
                <Form.Label className="soft-label create-program-label">Program Name</Form.Label>
                <Form.Control
                  type="text"
                  value={programName}
                  onChange={e => setProgramName(e.target.value)}
                  placeholder="Enter program name"
                  className="soft-input create-program-input"
                />
              </Form.Group>

              <Form.Group controlId="formDuration" className="create-program-form-group">
                <Form.Label className="soft-label create-program-label">Duration (Weeks)</Form.Label>
                <Form.Control
                  type="number"
                  value={duration}
                  onChange={e => handleDurationChange(Number(e.target.value))}
                  min="1"
                  className="soft-input create-program-input"
                />
              </Form.Group>

              <Form.Group controlId="formDaysPerWeek" className="create-program-form-group">
                <Form.Label className="soft-label create-program-label">Days per Week</Form.Label>
                <Form.Control
                  type="number"
                  value={daysPerWeek}
                  onChange={e => handleDaysPerWeekChange(Number(e.target.value))}
                  min="1"
                  max="7"
                  className="soft-input create-program-input"
                />
              </Form.Group>

              <Form.Group controlId="formExercise" className="create-program-form-group">
                <Form.Label className="soft-label create-program-label">Add Exercise to Day</Form.Label>
                <InputGroup>
                  <Form.Control
                    as="select"
                    value={newExercise}
                    onChange={e => setNewExercise(e.target.value)}
                    className="soft-input create-program-input"
                  >
                    <option value="">Select an exercise</option>
                    {exercisesList.map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </Form.Control>
                  <Form.Control
                    as="select"
                    value={newExerciseDay}
                    onChange={e => setNewExerciseDay(Number(e.target.value))}
                    className="soft-input create-program-input"
                  >
                    {Array.from({ length: daysPerWeek }).map((_, index) => (
                      <option key={index} value={index}>Day {index + 1}</option>
                    ))}
                  </Form.Control>
                  <Button onClick={addExercise} className="soft-button create-program-button gradient">Add</Button>
                </InputGroup>
              </Form.Group>

              {weeklyConfigs.length > 0 && (
                <>
                  <h5 className="soft-subtitle create-program-subtitle">Weekly Configurations</h5>
                  <Accordion>
                    {weeklyConfigs.map((week, weekIndex) => (
                      <Accordion.Item key={weekIndex} eventKey={weekIndex.toString()} className="soft-accordion-item">
                        <Accordion.Header>Week {weekIndex + 1}</Accordion.Header>
                        <Accordion.Body>
                          {week.map((day, dayIndex) => (
                            <div key={dayIndex} className="mb-3">
                              <h6 className="soft-label">Day {dayIndex + 1}</h6>
                              {day.exercises.map((ex, exIndex) => (
                                <div key={exIndex} className="mb-2">
                                  <Form.Control
                                    value={exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Loading...'}
                                    disabled
                                    className="soft-input create-program-input mb-2"
                                  />
                                  <InputGroup>
                                    <Form.Control
                                      type="number"
                                      value={ex.sets}
                                      onChange={e => updateExerciseConfig(weekIndex, dayIndex, exIndex, 'sets', e.target.value)}
                                      placeholder="Sets"
                                      min="1"
                                      className="soft-input create-program-input"
                                    />
                                    <Form.Control
                                      type="number"
                                      value={ex.reps}
                                      onChange={e => updateExerciseConfig(weekIndex, dayIndex, exIndex, 'reps', e.target.value)}
                                      placeholder="Reps"
                                      min="1"
                                      className="soft-input create-program-input"
                                    />
                                  </InputGroup>
                                </div>
                              ))}
                            </div>
                          ))}
                        </Accordion.Body>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </>
              )}

              <h5 className="soft-subtitle create-program-subtitle">Predefined Programs</h5>
              <ListGroup className="mb-4">
                {predefinedPrograms.map(program => (
                  <ListGroup.Item key={program.id} className="soft-list-group-item create-program-list-group-item">
                    <Button variant="link" onClick={() => loadPredefinedProgram(program)}>
                      {program.name} ({program.duration} weeks)
                    </Button>
                  </ListGroup.Item>
                ))}
              </ListGroup>

              <Button onClick={saveProgram} className="soft-button create-program-button gradient mt-3">Save Program</Button>
            </Form>
          </div>
        </Col>
      </Row>
    </Container>
  );
}

export default CreateProgram;