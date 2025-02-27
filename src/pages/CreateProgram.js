import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Form, Button, Accordion, ListGroup, Spinner, Table } from 'react-bootstrap';
import { Trash } from 'react-bootstrap-icons'
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { useNumberInput } from '../hooks/useNumberInput'; // Adjust path as needed
import Select from 'react-select';
import '../styles/CreateProgram.css';

function CreateProgram() {
  const [programName, setProgramName] = useState('');
  const [weeks, setWeeks] = useState([
    { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }] },
    { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }] },
    { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }] },
    { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }] }
  ]); // Start with Week 1, Day 1, and one empty exercise
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

  const removeDay = (dayIndex) => {
    const newWeeks = weeks.map(week => ({
      ...week,
      days: week.days.filter((_, index) => index !== dayIndex)
    }));
    setWeeks(newWeeks);
  };

  const addDay = () => {
    const newWeeks = weeks.map(week => ({
      ...week,
      days: [...week.days, { exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }]
    }));
    setWeeks(newWeeks);
  };

  const addWeek = () => {
    const newWeek = {
      days: weeks[0].days.map(day => ({
        exercises: day.exercises.map(exercise => ({ ...exercise }))
      }))
    };
    setWeeks([...weeks, newWeek]);
  };

  const addExercise = (weekIndex, dayIndex) => {
    const newWeeks = [...weeks];
    const exercise = {
      exerciseId: '',
      sets: 3,
      reps: 8,
    };
    newWeeks.forEach(week => {
      week.days[dayIndex].exercises.push({ ...exercise });
    });
    setWeeks(newWeeks);
  };

  const updateExercise = (weekIndex, dayIndex, exIndex, field, value) => {
    const newWeeks = [...weeks];
    newWeeks.forEach(week => {
      if (field === 'exerciseId') {
        week.days[dayIndex].exercises[exIndex][field] = value ? value.value : '';
      } else {
        week.days[dayIndex].exercises[exIndex][field] = value;
      }
    });
    setWeeks(newWeeks);
  };

  const removeExercise = (weekIndex, dayIndex, exIndex) => {
    const newWeeks = weeks.map(week => ({
      ...week,
      days: week.days.map((day, dIndex) =>
        dIndex === dayIndex
          ? { ...day, exercises: day.exercises.filter((_, index) => index !== exIndex) }
          : day
      )
    }));
    setWeeks(newWeeks);
  };

  const applyPreset = (weekIndex, dayIndex, exIndex, preset) => {
    const presets = {
      '3x8': { sets: 3, reps: 8 },
      '5x5': { sets: 5, reps: 5 },
      '3x5/3/1': { sets: 3, reps: '5/3/1' },
    };
    const { sets, reps } = presets[preset];
    const newWeeks = weeks.map(week => ({
      ...week,
      days: week.days.map((day, dIndex) =>
        dIndex === dayIndex
          ? {
            ...day,
            exercises: day.exercises.map((ex, eIndex) =>
              eIndex === exIndex ? { ...ex, sets, reps } : ex
            )
          }
          : day
      )
    }));
    setWeeks(newWeeks);
  };

  const saveProgram = async () => {
    if (!user || !programName || weeks.length === 0 || weeks[0].days.length === 0) return;

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
        daysPerWeek: weeks[0].days.length,
        weeklyConfigs: flattenedConfigs,
        createdAt: new Date()
      });
      alert('Program created successfully!');
      setProgramName('');
      setWeeks([{ days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }] }, { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }] }, { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }] }, { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, }] }] }]); // Start with Week 1, Day 1, and one empty exercise
    } catch (error) {
      console.error("Error saving program: ", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // New function to handle sets and reps change
  const handleSetsRepsChange = (weekIndex, dayIndex, exIndex, field, value) => {
    const newWeeks = [...weeks];
    newWeeks[weekIndex].days[dayIndex].exercises[exIndex][field] = value;
    setWeeks(newWeeks);
  };

  // Calculate table width based on number of weeks
  const calculateTableWidth = () => {
    // Base width for exercise selector and preset buttons
    const baseWidth = 550; // px
    // Width per week column
    const weekWidth = 125; // px
    // Total width based on number of weeks
    return baseWidth + (weeks.length * weekWidth);
  };

  const tableWidth = calculateTableWidth();

  // Calculate the column width dynamically based on number of weeks
  const calculateWeekColWidth = () => {
    const totalWeeks = weeks.length;
    // Ensure columns don't get too narrow as weeks increase
    const minWidth = 8; // Minimum width percentage
    const calculatedWidth = Math.max(minWidth, Math.floor(100 / totalWeeks));
    return calculatedWidth;
  };

  const weekColWidth = calculateWeekColWidth();

  // Custom styles for react-select to match Soft UI Design System
  const customStyles = {
    control: (provided, state) => ({
      ...provided,
      borderRadius: '10px',
      border: state.isFocused ? '1px solid #0056D2' : '1px solid #e9ecef',
      boxShadow: state.isFocused ? '0 0 0 2px rgba(0, 86, 210, 0.3)' : 'none',
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
      zIndex: 1000,
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
      display: 'none',
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
      <div>
        <div style={{ width: `${tableWidth}px`, maxWidth: '100%' }}>
          <Table responsive className="program-table">
            <thead>
              <tr>
                <th style={{ width: '215px', border: 'none;' }}></th>
                {weeks.map((_, index) => (
                  <React.Fragment key={index}>
                    <th key={index} style={{ "textAlign": "center", width: '100px' }}>Week {index + 1}</th>
                  </React.Fragment>
                ))}
                <th style={{ width: '235px' }}>
                  <Button onClick={addWeek} className="soft-button gradient">
                    Add Week
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={weeks.length * 2 + 2}>
                  <Accordion defaultActiveKey="0">
                    {weeks[0].days.map((day, dayIndex) => (
                      <Accordion.Item eventKey={dayIndex.toString()} key={dayIndex}>
                        <Accordion.Header>
                          Day {dayIndex + 1}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent accordion toggle
                              removeDay(dayIndex);
                            }}
                            className="ms-2 preset-btn delete-btn"
                            variant="outline-danger"
                            size="sm"
                          >
                            <Trash />
                          </Button>
                        </Accordion.Header>
                        <Accordion.Body>
                          {day.exercises.map((exercise, exIndex) => (
                            <div key={exIndex} className="d-flex exercise-row mb-3 align-items-center">
                              <div style={{ width: '250px', paddingRight: '10px' }}>
                                <Select
                                  options={exercises}
                                  value={exercises.find(opt => opt.value === exercise.exerciseId) || null}
                                  onChange={(selectedOption) => updateExercise(0, dayIndex, exIndex, 'exerciseId', selectedOption)}
                                  className="soft-input create-program-input"
                                  styles={customStyles}
                                  placeholder="Select Exercise"
                                  isSearchable
                                />
                              </div>
                              <div className="d-flex align-items-center">
                                {weeks.map((week, weekIndex) => (
                                  <div key={weekIndex} style={{ width: '120px', textAlign: 'center' }}>
                                    <div className="d-flex align-items-center justify-content-center">
                                      <Form.Control
                                        type="number"
                                        value={week.days[dayIndex].exercises[exIndex]?.sets || ''}
                                        onChange={(e) => handleSetsRepsChange(weekIndex, dayIndex, exIndex, 'sets', e.target.value)}
                                        className="soft-input create-program-input"
                                        placeholder="Sets"
                                        min="1"
                                        style={{ width: '40px', textAlign: 'center' }}
                                      />
                                      <span className="mx-1">x</span>
                                      <Form.Control
                                        type="text"
                                        value={week.days[dayIndex].exercises[exIndex]?.reps || ''}
                                        onChange={(e) => handleSetsRepsChange(weekIndex, dayIndex, exIndex, 'reps', e.target.value)}
                                        className="soft-input create-program-input"
                                        placeholder="Reps"
                                        style={{ width: '40px', textAlign: 'center' }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ width: '250px' }} className="preset-buttons d-flex flex-wrap">
                                <Button
                                  onClick={() => applyPreset(0, dayIndex, exIndex, '3x8')}
                                  className="soft-button gradient preset-btn me-1 mb-1"
                                  size="sm"
                                >
                                  3x8
                                </Button>
                                <Button
                                  onClick={() => applyPreset(0, dayIndex, exIndex, '5x5')}
                                  className="soft-button gradient preset-btn me-1 mb-1"
                                  size="sm"
                                >
                                  5x5
                                </Button>
                                <Button
                                  onClick={() => applyPreset(0, dayIndex, exIndex, '3x5/3/1')}
                                  className="soft-button gradient preset-btn mb-1"
                                  size="sm"
                                >
                                  3x5/3/1
                                </Button>
                              </div>
                            </div>
                          ))}
                          <div className="text-center">
                            <Button
                              onClick={() => addExercise(0, dayIndex)}
                              className="soft-button gradient"
                              size="sm"
                            >
                              Add Exercise
                            </Button>
                          </div>
                        </Accordion.Body>
                      </Accordion.Item>
                    ))}
                  </Accordion>
                </td>
              </tr>
            </tbody>
          </Table>
        </div>
      </div>

      <div className="d-flex justify-content-between mt-3">
        <Button onClick={addDay} className="soft-button create-program-button gradient mt-3">
          Add Day
        </Button>
      </div>
      <div className="d-flex justify-content-center mt-3">
        <Button
          onClick={saveProgram}
          className="soft-button create-program-button gradient mt-3"
          disabled={isSubmitting}
          style={{ float: 'right' }}
        >
          Save Program
        </Button>
      </div>
    </Container>
  );
}

export default CreateProgram;