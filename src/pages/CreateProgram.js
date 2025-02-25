import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Form, Button, Accordion, ListGroup, Spinner } from 'react-bootstrap';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { useNumberInput } from '../hooks/useNumberInput'; // Adjust path as needed
import Select from 'react-select';
import '../styles/CreateProgram.css';

function CreateProgram() {
  const [programName, setProgramName] = useState('');
  const [weeks, setWeeks] = useState([{ days: [{ exercises: [] }] }]); // Start with Week 1, Day 1
  const [exercises, setExercises] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const user = auth.currentUser;

  // Refs for number inputs
  const setsRef = useRef(null); // For sets in exercises
  const repsRef = useRef(null); // For reps in exercises

  // Use the hook for double-click selection
  useNumberInput(setsRef);
  useNumberInput(repsRef);

  useEffect(() => {
    console.log('Refs initialized:', {
      setsRef: setsRef.current,
      repsRef: repsRef.current,
    });
    const fetchData = async () => {
      if (user) {
        try {
          const exercisesSnapshot = await getDocs(collection(db, "exercises"));
          setExercises(exercisesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            label: doc.data().name,
            value: doc.id,
          }))); // Format for react-select with label and value
        } catch (error) {
          console.error("Error fetching exercises: ", error);
        }
      }
    };
    fetchData();
  }, [user]);

  const addWeek = () => {
    setWeeks([...weeks, { days: [] }]); // Add a new week with no days initially
  };

  const addDay = (weekIndex) => {
    const newWeeks = [...weeks];
    newWeeks[weekIndex].days.push({ exercises: [] });
    setWeeks(newWeeks);
  };

  const addExercise = (weekIndex, dayIndex) => {
    const newWeeks = [...weeks];
    const exercise = {
      exerciseId: '',
      sets: 3, // Default preset (3x10)
      reps: 10, // Default preset (3x10)
    };
    newWeeks[weekIndex].days[dayIndex].exercises.push(exercise);
    // Automatically replicate to the same day in all weeks
    weeks.forEach((week, wIndex) => {
      if (wIndex !== weekIndex) {
        newWeeks[wIndex].days[dayIndex] = newWeeks[wIndex].days[dayIndex] || { exercises: [] };
        newWeeks[wIndex].days[dayIndex].exercises.push({ ...exercise });
      }
    });
    setWeeks(newWeeks);
  };

  const updateExercise = (weekIndex, dayIndex, exIndex, field, value) => {
    const newWeeks = [...weeks];
    if (field === 'exerciseId') {
      newWeeks[weekIndex].days[dayIndex].exercises[exIndex][field] = value ? value.value : '';
    } else {
      newWeeks[weekIndex].days[dayIndex].exercises[exIndex][field] = Number(value) || '';
    }
    // Automatically replicate the change to the same day in all weeks
    weeks.forEach((week, wIndex) => {
      if (wIndex !== weekIndex && newWeeks[wIndex].days[dayIndex]) {
        newWeeks[wIndex].days[dayIndex].exercises[exIndex] = { ...newWeeks[weekIndex].days[dayIndex].exercises[exIndex] };
      }
    });
    setWeeks(newWeeks);
  };

  const removeExercise = (weekIndex, dayIndex, exIndex) => {
    const newWeeks = [...weeks];
    newWeeks[weekIndex].days[dayIndex].exercises.splice(exIndex, 1);
    // Automatically replicate removal to the same day in all weeks
    weeks.forEach((week, wIndex) => {
      if (wIndex !== weekIndex && newWeeks[wIndex].days[dayIndex]) {
        newWeeks[wIndex].days[dayIndex].exercises.splice(exIndex, 1);
      }
    });
    setWeeks(newWeeks);
  };

  const applyPreset = (weekIndex, dayIndex, exIndex, preset) => {
    const presets = {
      '3x10': { sets: 3, reps: 10 },
      '5x5': { sets: 5, reps: 5 },
      '5/3/1': { sets: 5, reps: [5, 3, 1] }, // Simplified to average or first value for now
    };
    const { sets, reps } = presets[preset];
    updateExercise(weekIndex, dayIndex, exIndex, 'sets', sets);
    updateExercise(weekIndex, dayIndex, exIndex, 'reps', Array.isArray(reps) ? reps[0] : reps); // Use first value for simplicity
  };

  const saveProgram = async () => {
    if (!user || !programName || weeks.length === 0 || weeks.some(week => week.days.length === 0)) return;

    setIsSubmitting(true);
    try {
      const flattenedConfigs = {};
      weeks.forEach((week, weekIndex) => {
        week.days.forEach((day, dayIndex) => {
          flattenedConfigs[`week${weekIndex + 1}_day${dayIndex + 1}_exercises`] = day.exercises.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets,
            reps: ex.reps,
          }));
        });
      });

      await addDoc(collection(db, "programs"), {
        userId: user.uid,
        isPredefined: false,
        name: programName,
        duration: weeks.length,
        daysPerWeek: weeks[0].days.length, // Assume consistent days per week
        weeklyConfigs: flattenedConfigs,
        createdAt: new Date()
      });
      alert('Program created successfully!');
      setProgramName('');
      setWeeks([{ days: [{ exercises: [] }] }]); // Reset to Week 1, Day 1
    } catch (error) {
      console.error("Error saving program: ", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Custom styles for react-select to match Soft UI Design System
  const customStyles = {
    control: (provided, state) => ({
      ...provided,
      borderRadius: '10px',
      border: state.isFocused ? '1px solid #0056D2' : '1px solid #e9ecef', // Match focus state
      boxShadow: state.isFocused ? '0 0 0 2px rgba(0, 86, 210, 0.3)' : 'none', // Focus glow
      background: 'white',
      '&:hover': {
        borderColor: '#0056D2',
      },
      minHeight: '38px',
      padding: '0 8px',
      fontFamily: 'Roboto, sans-serif',
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isFocused ? '#f8f9fa' : 'white',
      color: '#344767',
      padding: '8px 12px',
      fontFamily: 'Roboto, sans-serif',
      cursor: 'pointer',
    }),
    menu: (provided) => ({
      ...provided,
      borderRadius: '10px',
      boxShadow: '0 4px 15px rgba(0, 123, 255, 0.1)',
      zIndex: 1000, // Ensure menu appears above other elements
      background: 'white',
      fontFamily: 'Roboto, sans-serif',
    }),
    singleValue: (provided) => ({
      ...provided,
      color: '#344767',
      fontFamily: 'Roboto, sans-serif',
    }),
    placeholder: (provided) => ({
      ...provided,
      color: '#67748e',
      fontFamily: 'Roboto, sans-serif',
    }),
    input: (provided) => ({
      ...provided,
      color: '#344767',
      fontFamily: 'Roboto, sans-serif',
    }),
    indicatorSeparator: (provided) => ({
      ...provided,
      display: 'none', // Remove the separator line between the input and dropdown arrow
    }),
    dropdownIndicator: (provided, state) => ({
      ...provided,
      color: '#67748e',
      '&:hover': {
        color: '#0056D2',
      },
      transform: state.selectProps.menuIsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      transition: 'transform 0.3s ease',
    }),
  };

  return (
    <Container fluid className="soft-container create-program-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card create-program-card shadow border-0">
            <h1 className="soft-title text-center">Create Program</h1>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label className="soft-label">Program Name</Form.Label>
                <Form.Control
                  type="text"
                  value={programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  className="soft-input create-program-input"
                  placeholder="Enter program name"
                />
              </Form.Group>

              <Accordion>
                {weeks.map((week, weekIndex) => (
                  <Accordion.Item key={weekIndex} eventKey={weekIndex.toString()} className="soft-accordion-item">
                    <Accordion.Header className="accordion-header">Week {weekIndex + 1}</Accordion.Header>
                    <Accordion.Body>
                      {week.days.map((day, dayIndex) => (
                        <div key={dayIndex} className="mb-3">
                          <h5 className="soft-text">Day {dayIndex + 1}</h5>
                          <ListGroup>
                            {day.exercises.map((exercise, exIndex) => (
                              <ListGroup.Item key={exIndex} className="soft-list-group-item d-flex align-items-center justify-content-between">
                                <Select
                                  options={exercises}
                                  value={exercises.find(opt => opt.value === exercise.exerciseId) || null}
                                  onChange={(selectedOption) => updateExercise(weekIndex, dayIndex, exIndex, 'exerciseId', selectedOption)}
                                  className="soft-input create-program-input me-2"
                                  styles={customStyles}
                                  placeholder="Select Exercise"
                                  isClearable
                                  isSearchable
                                  style={{ flex: 2 }}
                                />
                                <Form.Control
                                  type="number"
                                  value={exercise.sets}
                                  onChange={(e) => updateExercise(weekIndex, dayIndex, exIndex, 'sets', e.target.value)}
                                  className="soft-input create-program-input me-2"
                                  min="1"
                                  style={{ width: '80px', flex: 1 }}
                                  ref={setsRef} // Attach ref for double-click
                                />
                                <Form.Control
                                  type="number"
                                  value={exercise.reps}
                                  onChange={(e) => updateExercise(weekIndex, dayIndex, exIndex, 'reps', e.target.value)}
                                  className="soft-input create-program-input me-2"
                                  min="1"
                                  style={{ width: '80px', flex: 1 }}
                                  ref={repsRef} // Attach ref for double-click
                                />
                                <div className="d-flex gap-2">
                                  <Button
                                    onClick={() => applyPreset(weekIndex, dayIndex, exIndex, '3x10')}
                                    className="soft-button create-program-button gradient"
                                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.875rem' }}
                                  >
                                    3x10
                                  </Button>
                                  <Button
                                    onClick={() => applyPreset(weekIndex, dayIndex, exIndex, '5x5')}
                                    className="soft-button create-program-button gradient"
                                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.875rem' }}
                                  >
                                    5x5
                                  </Button>
                                  <Button
                                    onClick={() => applyPreset(weekIndex, dayIndex, exIndex, '5/3/1')}
                                    className="soft-button create-program-button gradient"
                                    style={{ flex: 1, padding: '6px 10px', fontSize: '0.875rem' }}
                                  >
                                    5/3/1
                                  </Button>
                                </div>
                                <Button
                                  onClick={() => removeExercise(weekIndex, dayIndex, exIndex)}
                                  className="soft-button create-program-button gradient ms-2"
                                  style={{ flex: 1 }}
                                >
                                  Remove
                                </Button>
                              </ListGroup.Item>
                            ))}
                          </ListGroup>
                          <Button
                            onClick={() => addExercise(weekIndex, dayIndex)}
                            className="soft-button create-program-button gradient mt-2 me-2"
                          >
                            Add Exercise
                          </Button>
                        </div>
                      ))}
                      <Button
                        onClick={() => addDay(weekIndex)}
                        className="soft-button create-program-button gradient mt-2"
                      >
                        Add Day
                      </Button>
                    </Accordion.Body>
                  </Accordion.Item>
                ))}
              </Accordion>
              <Button
                onClick={addWeek}
                className="soft-button create-program-button gradient mt-3"
              >
                Add Week
              </Button>

              <Button
                onClick={saveProgram}
                className="soft-button create-program-button gradient mt-3"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Spinner animation="border" className="spinner-blue" size="sm" /> Saving...
                  </>
                ) : 'Save Program'}
              </Button>
            </Form>
          </div>
        </Col>
      </Row>
    </Container>
  );
}

export default CreateProgram;