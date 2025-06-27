import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Form, Button, Accordion, Table, Modal, Dropdown } from 'react-bootstrap';
import { Trash, ChevronDown, ChevronUp, Pencil, ThreeDotsVertical } from 'react-bootstrap-icons';
import { db, auth } from '../firebase';
import { addDoc, updateDoc, doc, collection } from 'firebase/firestore';
import { useNumberInput } from '../hooks/useNumberInput'; // Adjust path as needed
import ExerciseCreationModal from '../components/ExerciseCreationModal';
import ExerciseGrid from '../components/ExerciseGrid';
import '../styles/CreateProgram.css';
import { useParams, useNavigate } from 'react-router-dom';
import { getCollectionCached, getDocCached, invalidateCache } from '../api/firestoreCache';

// New Exercise Selection Modal Component using ExerciseGrid
const ExerciseSelectionModal = ({ show, onHide, onSelect, exercises, onCreateNew }) => {
  const handleExerciseSelect = (exercise) => {
    onSelect({ value: exercise.id, label: exercise.name });
    onHide();
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Select an Exercise</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Add a button to create a new exercise */}
        <div className="text-center mb-3">
          <Button
            variant="outline-primary"
            onClick={onCreateNew}
            className="soft-button"
          >
            Create New Exercise
          </Button>
        </div>

        <ExerciseGrid
          exercises={exercises}
          onExerciseClick={handleExerciseSelect}
          emptyMessage="No exercises found."
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

function CreateProgram({ mode = 'create' }) {
  const { programId } = useParams();
  const navigate = useNavigate();
  const [programName, setProgramName] = useState('');
  const [weightUnit, setWeightUnit] = useState('LB');
  const [weeks, setWeeks] = useState([
    { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
    { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
    { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
    { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
  ]);
  const [exercises, setExercises] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 767);
  const [expandedExercise, setExpandedExercise] = useState(null);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [currentNoteExercise, setCurrentNoteExercise] = useState({ weekIndex: 0, dayIndex: 0, exIndex: 0, tempNotes: '' });
  const [showExerciseModal, setShowExerciseModal] = useState(false); // New state for exercise selection modal
  const [currentExerciseSelection, setCurrentExerciseSelection] = useState({ weekIndex: 0, dayIndex: 0, exIndex: 0 }); // Track which exercise is being selected
  const [showExerciseCreationModal, setShowExerciseCreationModal] = useState(false);
  const user = auth.currentUser;
  const [isLoading, setIsLoading] = useState(mode === 'edit');

  const setsRef = useRef(null);
  const repsRef = useRef(null);

  useNumberInput(setsRef);
  useNumberInput(repsRef);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 767);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        try {
          const exercisesData = await getCollectionCached('exercises');
          setExercises(exercisesData.map(ex => ({
            ...ex,
            label: ex.name,
            value: ex.id,
          })));
        } catch (error) {
          console.error("Error fetching exercises: ", error);
        }
      }
    };
    fetchData();
  }, [user]);

  useEffect(() => {
    console.log('CreateProgram mounted:', { mode, programId, isLoading });
  }, []);

  useEffect(() => {
    const loadProgram = async () => {
      console.log('Starting loadProgram:', { mode, programId });
      if (mode === 'edit' && programId) {
        try {
          const programDoc = await getDocCached('programs', programId);
          if (programDoc) {
            const programData = programDoc;
            console.log('Loaded program data:', {
              name: programData.name,
              duration: programData.duration,
              daysPerWeek: programData.daysPerWeek,
              hasWeeklyConfigs: !!programData.weeklyConfigs,
              weeklyConfigsKeys: programData.weeklyConfigs ? Object.keys(programData.weeklyConfigs) : []
            });
            
            // Validate required fields
            if (!programData.duration || !programData.daysPerWeek || !programData.weeklyConfigs) {
              console.error('Invalid program structure:', {
                duration: programData.duration,
                daysPerWeek: programData.daysPerWeek,
                hasWeeklyConfigs: !!programData.weeklyConfigs
              });
              throw new Error("Invalid program data structure");
            }

            setProgramName(programData.name || '');
            setWeightUnit(programData.weightUnit || 'LB');
            
            // Create the correct structure for weeks
            const weeklyConfigs = Array.from({ length: programData.duration }, () => ({
              days: Array.from({ length: programData.daysPerWeek }, () => ({
                exercises: []
              }))
            }));

            console.log('Created empty weeklyConfigs structure:', {
              weeksLength: weeklyConfigs.length,
              firstWeekDaysLength: weeklyConfigs[0]?.days?.length,
              firstDayExercisesLength: weeklyConfigs[0]?.days?.[0]?.exercises?.length
            });

            // Ensure weeklyConfigs is an object
            if (typeof programData.weeklyConfigs === 'object') {
              console.log('Processing weeklyConfigs object:', {
                configKeys: Object.keys(programData.weeklyConfigs),
                configValues: Object.values(programData.weeklyConfigs).map(exercises => exercises?.length)
              });

              for (let key in programData.weeklyConfigs) {
                const match = key.match(/week(\d+)_day(\d+)_exercises/);
                if (match) {
                  const weekIndex = parseInt(match[1], 10) - 1;
                  const dayIndex = parseInt(match[2], 10) - 1;
                  
                  console.log('Processing config key:', {
                    key,
                    weekIndex,
                    dayIndex,
                    exercisesCount: programData.weeklyConfigs[key]?.length
                  });
                  
                  // Validate indices are within bounds
                  if (weekIndex >= 0 && weekIndex < programData.duration &&
                      dayIndex >= 0 && dayIndex < programData.daysPerWeek) {
                    // Ensure each exercise has a notes field
                    const processedExercises = (programData.weeklyConfigs[key] || []).map(ex => ({
                      ...ex,
                      notes: ex.notes || '' // Ensure notes field exists with empty string as default
                    }));
                    
                    console.log('Setting exercises for week/day:', {
                      weekIndex,
                      dayIndex,
                      exercisesCount: processedExercises.length,
                      firstExercise: processedExercises[0]
                    });
                    
                    // Update the structure to use the correct path
                    weeklyConfigs[weekIndex].days[dayIndex].exercises = processedExercises;
                  } else {
                    console.warn('Invalid indices:', {
                      weekIndex,
                      dayIndex,
                      duration: programData.duration,
                      daysPerWeek: programData.daysPerWeek
                    });
                  }
                }
              }
            }

            // Log final structure before setting state
            console.log('Final weeklyConfigs structure:', {
              weeksLength: weeklyConfigs.length,
              firstWeekDaysLength: weeklyConfigs[0]?.days?.length,
              firstDayExercisesLength: weeklyConfigs[0]?.days?.[0]?.exercises?.length,
              firstExercise: weeklyConfigs[0]?.days?.[0]?.exercises?.[0],
              structure: weeklyConfigs[0] // Log the first week's structure to verify
            });

            // Validate the structure before setting state
            if (weeklyConfigs.length > 0 && weeklyConfigs[0].days?.length > 0) {
              console.log('Setting weeks state with valid structure');
              setWeeks(weeklyConfigs);
            } else {
              console.warn('Invalid weekly configs structure, setting default');
              setWeeks([
                { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
              ]);
            }
          } else {
            console.error('Program not found:', programId);
            throw new Error("Program not found");
          }
        } catch (error) {
          console.error("Error loading program:", error);
          alert("Failed to load program data. Starting with empty program.");
          setWeeks([
            { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
          ]);
        } finally {
          setIsLoading(false);
        }
      }
    };
    loadProgram();
  }, [mode, programId]);

  const openNotesModal = (weekIndex, dayIndex, exIndex) => {
    console.log('Opening notes modal:', {
      weekIndex,
      dayIndex,
      exIndex,
      hasWeeks: !!weeks,
      hasDays: !!weeks?.[0]?.days,
      hasExercise: !!weeks?.[0]?.days?.[dayIndex]?.exercises?.[exIndex]
    });

    // Validate indices before opening modal
    if (!weeks || !weeks[0]?.days?.[dayIndex]?.exercises?.[exIndex]) {
      console.error('Invalid indices for notes modal:', {
        weekIndex,
        dayIndex,
        exIndex,
        weeksLength: weeks?.length,
        daysLength: weeks?.[0]?.days?.length,
        exercisesLength: weeks?.[0]?.days?.[dayIndex]?.exercises?.length
      });
      return;
    }

    const currentNotes = weeks[0].days[dayIndex].exercises[exIndex].notes || '';
    setCurrentNoteExercise({ weekIndex, dayIndex, exIndex, tempNotes: currentNotes });
    setShowNotesModal(true);
  };

  const handleNewExerciseAdded = (newExercise) => {
    // Add the newly created exercise to the exercises state
    setExercises(prevExercises => [...prevExercises, newExercise]);
  };

  const saveNotes = () => {
    const { weekIndex, dayIndex, exIndex, tempNotes } = currentNoteExercise;
    
    console.log('Saving notes:', {
      weekIndex,
      dayIndex,
      exIndex,
      hasWeeks: !!weeks,
      hasDays: !!weeks?.[0]?.days,
      hasExercise: !!weeks?.[0]?.days?.[dayIndex]?.exercises?.[exIndex]
    });

    // Validate indices before saving
    if (!weeks || !weeks[0]?.days?.[dayIndex]?.exercises?.[exIndex]) {
      console.error('Invalid indices for saving notes:', {
        weekIndex,
        dayIndex,
        exIndex,
        weeksLength: weeks?.length,
        daysLength: weeks?.[0]?.days?.length,
        exercisesLength: weeks?.[0]?.days?.[dayIndex]?.exercises?.length
      });
      return;
    }

    const newWeeks = [...weeks];
    newWeeks.forEach(week => {
      if (week.days[dayIndex]?.exercises[exIndex]) {
      week.days[dayIndex].exercises[exIndex].notes = tempNotes || '';
      }
    });
    setWeeks(newWeeks);
    setShowNotesModal(false);
  };

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
      days: [...week.days, { exercises: [{ exerciseId: '', sets: 3, reps: 8 }] }]
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

  const removeWeek = () => {
    if (weeks.length <= 1) {
      alert("Cannot remove the last week. A program must have at least one week.");
      return;
    }
    setWeeks(weeks.slice(0, -1));
  };

  const addExercise = (weekIndex, dayIndex) => {
    const newWeeks = [...weeks];
    const exercise = { exerciseId: '', sets: 3, reps: 8 };
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
    if (expandedExercise && expandedExercise.dayIndex === dayIndex && expandedExercise.exIndex === exIndex) {
      setExpandedExercise(null);
    }
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
          ? { ...day, exercises: day.exercises.map((ex, eIndex) => eIndex === exIndex ? { ...ex, sets, reps } : ex) }
          : day
      )
    }));
    setWeeks(newWeeks);
  };

  const saveProgram = async () => {
    console.log('Starting saveProgram:', {
      mode,
      programId,
      hasUser: !!user,
      programName,
      weeksLength: weeks?.length,
      firstWeekDays: weeks?.[0]?.days?.length
    });

    if (!user || !programName || !weeks || weeks.length === 0 || !weeks[0]?.days || weeks[0].days.length === 0) {
      console.warn('Save program validation failed:', {
        hasUser: !!user,
        hasProgramName: !!programName,
        hasWeeks: !!weeks,
        weeksLength: weeks?.length,
        firstWeekDays: weeks?.[0]?.days?.length
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const flattenedConfigs = {};
      weeks.forEach((week, weekIndex) => {
        week.days.forEach((day, dayIndex) => {
          flattenedConfigs[`week${weekIndex + 1}_day${dayIndex + 1}_exercises`] = day.exercises.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets,
            reps: ex.reps,
            notes: ex.notes || '',
          }));
        });
      });

      const programData = {
        name: programName,
        weightUnit: weightUnit,
        duration: weeks.length,
        daysPerWeek: weeks[0].days.length,
        weeklyConfigs: flattenedConfigs,
      };

      if (mode === 'edit') {
        await updateDoc(doc(db, "programs", programId), programData);
        invalidateCache('programs');
        alert('Program updated successfully!');
        navigate('/programs');
      } else {
        await addDoc(collection(db, "programs"), {
          ...programData,
          userId: user.uid,
          isTemplate: false,
          createdAt: new Date()
        });
        invalidateCache('programs');
        alert('Program created successfully!');
        // Reset form for new program
        setProgramName('');
        setWeightUnit('LB');
        setWeeks([
          { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
        ]);
      }
    } catch (error) {
      console.error("Error saving program:", error);
      alert(mode === 'edit' ? 'Failed to update program' : 'Failed to create program');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetsRepsChange = (weekIndex, dayIndex, exIndex, field, value) => {
    const newWeeks = [...weeks];
    newWeeks[weekIndex].days[dayIndex].exercises[exIndex][field] = value;
    setWeeks(newWeeks);
  };

  const hasNotes = (dayIndex, exIndex) => {
    const notes = weeks[0]?.days?.[dayIndex]?.exercises?.[exIndex]?.notes;
    return notes !== undefined && notes !== null && notes.trim().length > 0;
  };

  const calculateTableWidth = () => {
    const baseWidth = 550;
    const weekWidth = 125;
    return baseWidth + (weeks.length * weekWidth);
  };

  const tableWidth = calculateTableWidth();

  const toggleExerciseExpand = (dayIndex, exIndex) => {
    if (expandedExercise && expandedExercise.dayIndex === dayIndex && expandedExercise.exIndex === exIndex) {
      setExpandedExercise(null);
    } else {
      setExpandedExercise({ dayIndex, exIndex });
    }
  };

  const isExerciseExpanded = (dayIndex, exIndex) => {
    return expandedExercise && expandedExercise.dayIndex === dayIndex && expandedExercise.exIndex === exIndex;
  };

  const openExerciseModal = (weekIndex, dayIndex, exIndex) => {
    setCurrentExerciseSelection({ weekIndex, dayIndex, exIndex });
    setShowExerciseModal(true);
  };

  const renderMobileExerciseRow = (day, dayIndex, exercise, exIndex) => {
    const isExpanded = isExerciseExpanded(dayIndex, exIndex);
    const selectedExercise = exercises.find(opt => opt.value === exercise.exerciseId);
    const hasExerciseNotes = hasNotes(dayIndex, exIndex);

    return (
      <div key={exIndex} className="mb-3 p-2 rounded" style={{ border: '1px solid #e9ecef' }}>
        <div
          className="d-flex justify-content-between align-items-center"
          onClick={() => toggleExerciseExpand(dayIndex, exIndex)}
          style={{ cursor: 'pointer' }}
        >
          <div className="d-flex align-items-center" style={{ width: '80%' }}>
            {selectedExercise ? (
              <div className="text-truncate">{selectedExercise.label}</div>
            ) : (
              <div className="text-muted">Select Exercise</div>
            )}
          </div>
          <div className="d-flex">
            <div className="p-1">{isExpanded ? <ChevronUp /> : <ChevronDown />}</div>
            <Button
              onClick={(e) => { e.stopPropagation(); removeExercise(0, dayIndex, exIndex); }}
              className="p-1"
              variant="link"
              size="sm"
            >
              <Trash className="text-danger" />
            </Button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3">
              <Form.Label>Exercise</Form.Label>
              <Button
                onClick={() => openExerciseModal(0, dayIndex, exIndex)}
                className="w-100 text-start"
                variant="outline-primary"
              >
                {selectedExercise ? selectedExercise.label : 'Select Exercise'}
              </Button>
            </div>

            <div className="mb-3">
              <Form.Label>Presets</Form.Label>
              <div className="d-flex flex-wrap gap-2">
                <Button onClick={() => applyPreset(0, dayIndex, exIndex, '3x8')} className="soft-button gradient preset-btn" size="sm">3x8</Button>
                <Button onClick={() => applyPreset(0, dayIndex, exIndex, '5x5')} className="soft-button gradient preset-btn" size="sm">5x5</Button>
                <Button onClick={() => applyPreset(0, dayIndex, exIndex, '3x5/3/1')} className="soft-button gradient preset-btn" size="sm">3x5/3/1</Button>
              </div>
            </div>

            <div>
              <Form.Label>Sets & Reps by Week</Form.Label>
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="d-flex align-items-center mb-2">
                  <div className="me-2" style={{ width: '70px' }}>Week {weekIndex + 1}:</div>
                  <div className="d-flex align-items-center">
                    <Form.Control
                      type="number"
                      value={week.days[dayIndex].exercises[exIndex]?.sets || ''}
                      onChange={(e) => handleSetsRepsChange(weekIndex, dayIndex, exIndex, 'sets', e.target.value)}
                      className="soft-input create-program-input me-1"
                      placeholder="Sets"
                      min="1"
                      style={{ width: '50px', textAlign: 'center' }}
                    />
                    <span className="mx-1">x</span>
                    <Form.Control
                      type="text"
                      value={week.days[dayIndex].exercises[exIndex]?.reps || ''}
                      onChange={(e) => handleSetsRepsChange(weekIndex, dayIndex, exIndex, 'reps', e.target.value)}
                      className="soft-input create-program-input"
                      placeholder="Reps"
                      style={{ width: '50px', textAlign: 'center' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Button
                onClick={() => openNotesModal(0, dayIndex, exIndex)}
                className="soft-button w-100"
                variant={hasExerciseNotes ? "outline-primary" : "outline-secondary"}
                size="sm"
              >
                <Pencil className="me-1" />
                {hasExerciseNotes ? 'Edit Notes' : 'Add Notes'}
              </Button>
              {hasExerciseNotes && (
                <div className="mt-2 p-2 bg-light rounded">
                  <small className="text-muted">
                    {exercise.notes.length > 50 ? exercise.notes.substring(0, 50) + '...' : exercise.notes}
                  </small>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDesktopExerciseRow = (day, dayIndex, exercise, exIndex) => {
    const hasExerciseNotes = hasNotes(dayIndex, exIndex);
    const selectedExercise = exercises.find(opt => opt.value === exercise.exerciseId);

    return (
      <div key={exIndex} className="d-flex exercise-row mb-3 align-items-center">
        <div style={{ width: '40px' }}>
          <Dropdown>
            <Dropdown.Toggle variant="light" id={`dropdown-exercise-${dayIndex}-${exIndex}`} className="border-0 bg-transparent three-dots-vert" style={{ padding: '0.25rem' }}>
              <ThreeDotsVertical size={18} />
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Item onClick={() => openNotesModal(0, dayIndex, exIndex)} className="d-flex align-items-center">
                <Pencil className="me-2" />
                {hasExerciseNotes ? 'Edit Notes' : 'Add Notes'}
                {hasExerciseNotes && <span className="ms-1 badge bg-primary rounded-circle" style={{ width: '8px', height: '8px', padding: '0' }}> </span>}
              </Dropdown.Item>
              <Dropdown.Item onClick={() => removeExercise(0, dayIndex, exIndex)} className="d-flex align-items-center text-danger">
                <Trash className="me-2" />
                Delete Exercise
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
        <div style={{ width: '230px', paddingRight: '10px' }}>
          <Button
            onClick={() => openExerciseModal(0, dayIndex, exIndex)}
            className="w-100 text-start select-exercise-btn"
            variant="outline-primary"
          >
            {selectedExercise ? selectedExercise.label : 'Select Exercise'}
          </Button>
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
          <Button onClick={() => applyPreset(0, dayIndex, exIndex, '3x8')} className="soft-button gradient preset-btn me-1 mb-1" size="sm">3x8</Button>
          <Button onClick={() => applyPreset(0, dayIndex, exIndex, '5x5')} className="soft-button gradient preset-btn me-1 mb-1" size="sm">5x5</Button>
          <Button onClick={() => applyPreset(0, dayIndex, exIndex, '3x5/3/1')} className="soft-button gradient preset-btn mb-1" size="sm">3x5/3/1</Button>
        </div>
      </div>
    );
  };

  useEffect(() => {
    console.log('Weeks state updated:', {
      weeksLength: weeks?.length,
      firstWeekDays: weeks?.[0]?.days?.length,
      firstDayExercises: weeks?.[0]?.days?.[0]?.exercises?.length
    });
  }, [weeks]);

  useEffect(() => {
    console.log('Render conditions:', {
      isLoading,
      hasWeeks: !!weeks,
      weeksLength: weeks?.length,
      firstWeekDays: weeks?.[0]?.days?.length,
      isMobile
    });
  }, [isLoading, weeks, isMobile]);

  if (isLoading) {
    return (
      <Container fluid className="soft-container create-program-container">
        <div className="text-center p-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3">Loading program data...</p>
        </div>
      </Container>
    );
  }

  return (
    <Container fluid className="soft-container create-program-container">
      <Row className="mb-4 program-misc-input">
        <Col xs={12} md={6} className="mb-3 mb-md-0">
          <Form.Group>
            <Form.Label>Program Name</Form.Label>
            <Form.Control
              type="text"
              value={programName}
              onChange={(e) => setProgramName(e.target.value)}
              className="soft-input"
              placeholder="Enter program name"
              required
            />
          </Form.Group>
        </Col>
        <Col xs={12} md={6}>
          <Form.Group>
            <Form.Label>Units</Form.Label>
            <Form.Select
              value={weightUnit}
              onChange={(e) => setWeightUnit(e.target.value)}
              className="soft-input"
              style={{ width: '70px' }}
            >
              <option value="LB">LB</option>
              <option value="KG">KG</option>
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>
      <div className="d-flex justify-content-between align-items-center mb-3 program-misc-input">
        <div className="d-flex flex-wrap week-indicators">
          {weeks && weeks.length > 0 ? (
            weeks.map((_, index) => (
            <div key={index} className="me-2 mb-2">
              <span className="badge bg-secondary">Week {index + 1}</span>
            </div>
            ))
          ) : (
            <div className="text-muted">No weeks added yet</div>
          )}
        </div>
        <div className={`d-flex ${isMobile ? 'flex-column w-100 button-container' : ''}`}>
          <Button onClick={addWeek} className={`soft-button gradient ${isMobile ? 'mb-2 w-100' : 'me-2'}`}>Add Week</Button>
          <Button onClick={removeWeek} className={`soft-button gradient ${isMobile ? 'w-100' : ''}`} disabled={!weeks || weeks.length <= 1}>Remove Week</Button>
        </div>
      </div>

      {isMobile ? (
        <Accordion defaultActiveKey="0" className="mb-4">
          {weeks && weeks.length > 0 && weeks[0]?.days ? (
            weeks[0].days.map((day, dayIndex) => (
            <Accordion.Item eventKey={dayIndex.toString()} key={dayIndex}>
              <Accordion.Header className="d-flex justify-content-between">
                <span className="me-3">Day {dayIndex + 1}</span>
                <div onClick={(e) => e.stopPropagation()} className="me-3">
                  <Button onClick={() => removeDay(dayIndex)} className="preset-btn delete-btn" variant="outline-danger" size="sm"><Trash /></Button>
                </div>
              </Accordion.Header>
              <Accordion.Body>
                {day.exercises.map((exercise, exIndex) => renderMobileExerciseRow(day, dayIndex, exercise, exIndex))}
                <div className="text-center mt-3">
                  <Button onClick={() => addExercise(0, dayIndex)} className="soft-button gradient" size="sm">Add Exercise</Button>
                </div>
              </Accordion.Body>
            </Accordion.Item>
            ))
          ) : (
            <div className="text-center p-3">
              <p className="text-muted">No days added to the program yet. Click "Add Day" to get started.</p>
            </div>
          )}
        </Accordion>
      ) : (
        <div style={{ width: `${tableWidth}px`, maxWidth: '100%', overflowX: 'auto' }}>
          <Table responsive className="program-table">
            <thead>
              <tr>
                <th style={{ width: '215px', border: 'none' }}></th>
                {weeks && weeks.length > 0 ? (
                  weeks.map((_, index) => (
                  <th key={index} style={{ textAlign: 'center', width: '100px' }}>Week {index + 1}</th>
                  ))
                ) : (
                  <th style={{ textAlign: 'center', width: '100px' }}>No Weeks</th>
                )}
                <th style={{ width: '235px' }}></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={weeks.length * 2 + 2}>
                  <Accordion defaultActiveKey="0">
                    {weeks && weeks.length > 0 && weeks[0]?.days ? (
                      weeks[0].days.map((day, dayIndex) => (
                      <Accordion.Item eventKey={dayIndex.toString()} key={dayIndex}>
                        <Accordion.Header>
                          Day {dayIndex + 1}
                          <Button
                            onClick={(e) => { e.stopPropagation(); removeDay(dayIndex); }}
                            className="ms-2 preset-btn delete-btn"
                            variant="outline-danger"
                            size="sm"
                          >
                            <Trash />
                          </Button>
                        </Accordion.Header>
                        <Accordion.Body>
                          {day.exercises.map((exercise, exIndex) => renderDesktopExerciseRow(day, dayIndex, exercise, exIndex))}
                          <div className="text-center">
                            <Button onClick={() => addExercise(0, dayIndex)} className="soft-button gradient" size="sm">Add Exercise</Button>
                          </div>
                        </Accordion.Body>
                      </Accordion.Item>
                      ))
                    ) : (
                      <div className="text-center p-3">
                        <p className="text-muted">No days added to the program yet. Click "Add Day" to get started.</p>
                      </div>
                    )}
                  </Accordion>
                </td>
              </tr>
            </tbody>
          </Table>
        </div>
      )}

      <div className={`d-flex ${isMobile ? 'flex-column program-misc-input' : 'justify-content-between'} mt-3`}>
        <Button onClick={addDay} className={`soft-button create-program-button gradient ${isMobile ? 'mb-3 w-100' : ''}`}>Add Day</Button>
        <Button
          onClick={saveProgram}
          className={`soft-button create-program-button gradient ${isMobile ? 'w-100' : ''}`}
          disabled={isSubmitting || !programName}
        >
          {mode === 'edit' ? 'Update Program' : 'Save Program'}
        </Button>
      </div>

      <Modal show={showNotesModal} onHide={() => setShowNotesModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>
            Exercise Notes
            {currentNoteExercise.dayIndex !== null && weeks && weeks[0]?.days?.[currentNoteExercise.dayIndex]?.exercises?.[currentNoteExercise.exIndex] ? (
              <div className="text-muted fs-6">
                {(() => {
                  const exerciseId = weeks[0].days[currentNoteExercise.dayIndex].exercises[currentNoteExercise.exIndex].exerciseId;
                  const exercise = exercises.find(e => e.value === exerciseId);
                  console.log('Notes modal exercise lookup:', {
                    exerciseId,
                    foundExercise: !!exercise,
                    currentNoteExercise,
                    hasWeeks: !!weeks,
                    hasDays: !!weeks?.[0]?.days,
                    dayIndex: currentNoteExercise.dayIndex,
                    exIndex: currentNoteExercise.exIndex
                  });
                  return exercise?.label || 'Exercise';
                })()}
              </div>
            ) : (
              console.warn('Notes modal missing data:', {
                currentNoteExercise,
                hasWeeks: !!weeks,
                hasDays: !!weeks?.[0]?.days,
                dayIndex: currentNoteExercise?.dayIndex,
                exIndex: currentNoteExercise?.exIndex
              })
            )}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Control
            as="textarea"
            rows={5}
            value={currentNoteExercise.tempNotes || ''}
            onChange={(e) => setCurrentNoteExercise(prev => ({ ...prev, tempNotes: e.target.value }))}
            className="soft-input notes-input"
            placeholder="Add notes about weight, form cues, or any other details for this exercise"
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowNotesModal(false)}>Cancel</Button>
          <Button 
            className="soft-button gradient" 
            onClick={() => {
              console.log('Saving notes:', {
                currentNoteExercise,
                hasWeeks: !!weeks,
                hasDays: !!weeks?.[0]?.days,
                dayIndex: currentNoteExercise?.dayIndex,
                exIndex: currentNoteExercise?.exIndex
              });
              saveNotes();
            }}
          >
            Add Note
          </Button>
        </Modal.Footer>
      </Modal>

      <ExerciseSelectionModal
        show={showExerciseModal}
        onHide={() => setShowExerciseModal(false)}
        onSelect={(selectedOption) => updateExercise(
          currentExerciseSelection.weekIndex,
          currentExerciseSelection.dayIndex,
          currentExerciseSelection.exIndex,
          'exerciseId',
          selectedOption
        )}
        exercises={exercises}
        onCreateNew={() => setShowExerciseCreationModal(true)}
      />

      {/* New Exercise Creation Modal */}
      <ExerciseCreationModal
        show={showExerciseCreationModal}
        onHide={() => setShowExerciseCreationModal(false)}
        onExerciseAdded={handleNewExerciseAdded}
      />
    </Container>
  );
}

export default CreateProgram;