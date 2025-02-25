import React, { useState, useEffect, useRef } from 'react';
import { Form, Button, Container, Row, Col, ListGroup, InputGroup, Accordion } from 'react-bootstrap';
import { Trash, ChevronDown, ChevronUp } from 'react-bootstrap-icons';
import { db, auth } from '../firebase';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { useNumberInput } from '../hooks/useNumberInput.js';
import '../styles/CreateProgram.css';

function CreateProgram() {
  const [programName, setProgramName] = useState('');
  const [duration, setDuration] = useState(1);
  const [daysPerWeek, setDaysPerWeek] = useState(1);
  const [weeklyConfigs, setWeeklyConfigs] = useState([]);
  const [newExercise, setNewExercise] = useState('');
  const [newExerciseDay, setNewExerciseDay] = useState(0);
  const [exercisesList, setExercisesList] = useState([]);
  const [predefinedPrograms, setPredefinedPrograms] = useState([]);
  const [activeWeek, setActiveWeek] = useState(null);
  const user = auth.currentUser;

  // Refs for number inputs
  const durationRef = useRef(null);
  const daysPerWeekRef = useRef(null);
  const setsRef = useRef(null); // Example for sets in exercise config
  const repsRef = useRef(null); // Example for reps in exercise config

  // Use the hook for double-click selection
  useNumberInput(durationRef);
  useNumberInput(daysPerWeekRef);
  useNumberInput(setsRef);
  useNumberInput(repsRef);

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
      const newConfigs = weeklyConfigs.map(week => {
        const newWeek = [...week];
        newWeek[newExerciseDay] = {
          exercises: [
            ...newWeek[newExerciseDay].exercises,
            { exerciseId: newExercise, sets: 0, reps: 0 }
          ]
        };
        return newWeek;
      });
      setWeeklyConfigs(newConfigs);
      setNewExercise('');
    }
  };

  const removeExercise = (weekIndex, dayIndex, exerciseIndex) => {
    const newConfigs = weeklyConfigs.map(week => {
      const newWeek = [...week];
      newWeek[dayIndex] = {
        exercises: newWeek[dayIndex].exercises.filter((_, idx) => idx !== exerciseIndex)
      };
      return newWeek;
    });
    setWeeklyConfigs(newConfigs);
  };

  const updateExerciseConfig = (weekIndex, dayIndex, exerciseIndex, field, value) => {
    const newConfigs = [...weeklyConfigs];
    newConfigs[weekIndex][dayIndex].exercises[exerciseIndex][field] = Number(value);
    setWeeklyConfigs(newConfigs);
  };

  const applyProgressionPreset = (weekIndex, dayIndex, exerciseIndex, preset) => {
    const newConfigs = [...weeklyConfigs];
    switch (preset) {
      case '3x10':
        newConfigs[weekIndex][dayIndex].exercises[exerciseIndex].sets = 3;
        newConfigs[weekIndex][dayIndex].exercises[exerciseIndex].reps = 10;
        break;
      case '5x5':
        newConfigs[weekIndex][dayIndex].exercises[exerciseIndex].sets = 5;
        newConfigs[weekIndex][dayIndex].exercises[exerciseIndex].reps = 5;
        break;
      case '5/3/1':
        newConfigs[weekIndex][dayIndex].exercises[exerciseIndex].sets = 3;
        newConfigs[weekIndex][dayIndex].exercises[exerciseIndex].reps = weekIndex === 0 ? 5 : weekIndex === 1 ? 3 : 1;
        break;
      default:
        break;
    }
    setWeeklyConfigs(newConfigs);
  };

  const loadPredefinedProgram = (program) => {
    setProgramName(program.name);
    setDuration(program.duration);
    setDaysPerWeek(program.daysPerWeek || 1);
    setWeeklyConfigs(program.weeklyConfigs || []);
  };

  const saveProgram = async () => {
    if (!user || !programName || weeklyConfigs.length === 0 || weeklyConfigs[0][0].exercises.length === 0) return;

    // Transform weeklyConfigs into a Firestore-compatible format
    const flattenedConfigs = {};
    weeklyConfigs.forEach((week, weekIndex) => {
      week.forEach((day, dayIndex) => {
        const key = `week${weekIndex + 1}_day${dayIndex + 1}_exercises`;
        flattenedConfigs[key] = day.exercises.map(exercise => ({
          exerciseId: exercise.exerciseId,
          sets: exercise.sets,
          reps: exercise.reps,
        }));
      });
    });

    try {
      await addDoc(collection(db, "programs"), {
        userId: user.uid,
        isPredefined: false,
        name: programName,
        duration,
        daysPerWeek,
        weeklyConfigs: flattenedConfigs, // Use flattened object instead of nested arrays
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

  const getExercisePreview = () => {
    const preview = Array(daysPerWeek).fill().map(() => []);
    weeklyConfigs[0].forEach((day, dayIndex) => {
      day.exercises.forEach(ex => {
        preview[dayIndex].push(exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Loading...');
      });
    });
    return preview;
  };

  const handleAccordionToggle = (weekIndex) => {
    const newActiveWeek = activeWeek === weekIndex ? null : weekIndex;
    setActiveWeek(newActiveWeek);
    console.log('Accordion toggled, activeWeek:', newActiveWeek);
  };

  return (
    <Container className="soft-container create-program-container">
      <Row className="justify-content-center">
        <Col md={8} xs={12}>
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
                  className="soft-input create-program-input-wide program-name-input"
                />
              </Form.Group>

              <Form.Group controlId="formDurationDays" className="create-program-form-group d-flex flex-row">
                <div className="flex-grow-1 me-2">
                  <Form.Label className="soft-label create-program-label">Duration (Weeks)</Form.Label>
                  <Form.Control
                    type="number"
                    value={duration}
                    onChange={e => handleDurationChange(Number(e.target.value))}
                    min="1"
                    className="soft-input create-program-input-wide duration-input"
                    ref={durationRef}
                  />
                </div>
                <div className="flex-grow-1">
                  <Form.Label className="soft-label create-program-label">Days per Week</Form.Label>
                  <Form.Control
                    type="number"
                    value={daysPerWeek}
                    onChange={e => handleDaysPerWeekChange(Number(e.target.value))}
                    min="1"
                    max="7"
                    className="soft-input create-program-input-wide days-input"
                    ref={daysPerWeekRef}
                  />
                </div>
              </Form.Group>

              <Form.Group controlId="formNewExercise" className="create-program-form-group">
                <Form.Label className="soft-label create-program-label">Add Exercise</Form.Label>
                <Form.Control
                  as="select"
                  value={newExercise}
                  onChange={e => setNewExercise(e.target.value)}
                  className="soft-input create-program-input-wide exercise-input"
                >
                  <option value="">Select an exercise</option>
                  {exercisesList.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </Form.Control>
              </Form.Group>

              <Form.Group controlId="formExerciseDay" className="create-program-form-group">
                <Form.Label className="soft-label create-program-label">Day of Week</Form.Label>
                <InputGroup>
                  <Form.Control
                    as="select"
                    value={newExerciseDay}
                    onChange={e => setNewExerciseDay(Number(e.target.value))}
                    className="soft-input create-program-input-wide"
                    style={{ backgroundColor: '#e6f0ff' }}
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
                  <h5 className="soft-subtitle create-program-subtitle">Exercise Preview</h5>
                  <Row className="mb-3">
                    {getExercisePreview().map((dayExercises, dayIndex) => (
                      <Col key={dayIndex} md={Math.floor(12 / daysPerWeek)} xs={12}>
                        <h6 className="soft-label">Day {dayIndex + 1}</h6>
                        <ListGroup>
                          {dayExercises.map((name, exIndex) => (
                            <ListGroup.Item key={exIndex} className="soft-list-group-item">{name}</ListGroup.Item>
                          ))}
                        </ListGroup>
                      </Col>
                    ))}
                  </Row>

                  <h5 className="soft-subtitle create-program-subtitle">Weekly Configurations</h5>
                  <Accordion activeKey={activeWeek} onSelect={handleAccordionToggle}>
                    {weeklyConfigs.map((week, weekIndex) => (
                      <Accordion.Item key={weekIndex} eventKey={weekIndex.toString()} className="soft-accordion-item">
                        <Accordion.Header className="week-header">
                          Week {weekIndex + 1} {activeWeek === weekIndex.toString() ? <ChevronUp className="ms-2" /> : <ChevronDown className="ms-2" />}
                        </Accordion.Header>
                        <Accordion.Body>
                          {week.map((day, dayIndex) => (
                            <div key={dayIndex} className="mb-3">
                              <h6 className="soft-label">Day {dayIndex + 1}</h6>
                              <div className="d-flex header-labels mb-2">
                                <span className="soft-label sets-label">Sets</span>
                                <span className="soft-label reps-label">Reps</span>
                              </div>
                              {day.exercises.map((ex, exIndex) => (
                                <div key={exIndex} className="mb-2 exercise-row d-flex desktop-row">
                                  <Form.Control
                                    value={exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Loading...'}
                                    disabled
                                    className="soft-input create-program-input-wide me-2"
                                    style={{ width: 'auto', flexGrow: 1, minWidth: '150px' }}
                                  />
                                  <InputGroup style={{ width: 'auto' }}>
                                    <Form.Control
                                      type="number"
                                      value={ex.sets}
                                      onChange={e => updateExerciseConfig(weekIndex, dayIndex, exIndex, 'sets', e.target.value)}
                                      placeholder="Sets"
                                      min="1"
                                      className="soft-input create-program-input"
                                      style={{ width: '40px' }}
                                      ref={setsRef}
                                    />
                                    <InputGroup.Text className="soft-text">x</InputGroup.Text>
                                    <Form.Control
                                      type="number"
                                      value={ex.reps}
                                      onChange={e => updateExerciseConfig(weekIndex, dayIndex, exIndex, 'reps', e.target.value)}
                                      placeholder="Reps"
                                      min="1"
                                      className="soft-input create-program-input"
                                      style={{ width: '40px' }}
                                      ref={repsRef}
                                    />
                                  </InputGroup>
                                  <div className="preset-buttons d-flex flex-wrap">
                                    <Button
                                      variant="outline-secondary"
                                      onClick={() => applyProgressionPreset(weekIndex, dayIndex, exIndex, '3x10')}
                                      className="ms-2 preset-btn"
                                    >
                                      3x10
                                    </Button>
                                    <Button
                                      variant="outline-secondary"
                                      onClick={() => applyProgressionPreset(weekIndex, dayIndex, exIndex, '5x5')}
                                      className="ms-2 preset-btn"
                                    >
                                      5x5
                                    </Button>
                                    <Button
                                      variant="outline-secondary"
                                      onClick={() => applyProgressionPreset(weekIndex, dayIndex, exIndex, '5/3/1')}
                                      className="ms-2 preset-btn"
                                    >
                                      5/3/1
                                    </Button>
                                    <Button
                                      variant="outline-danger"
                                      onClick={() => removeExercise(weekIndex, dayIndex, exIndex)}
                                      className="ms-2 preset-btn"
                                    >
                                      <Trash />
                                    </Button>
                                  </div>
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