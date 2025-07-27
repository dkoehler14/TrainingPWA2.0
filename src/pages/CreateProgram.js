import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Form, Button, Accordion, Table, Modal, Dropdown, Card } from 'react-bootstrap';
import { Trash, ChevronDown, ChevronUp, Pencil, ThreeDotsVertical } from 'react-bootstrap-icons';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../config/supabase';
import { useNumberInput } from '../hooks/useNumberInput'; // Adjust path as needed
import ExerciseCreationModal from '../components/ExerciseCreationModal';
import ExerciseGrid from '../components/ExerciseGrid';
import '../styles/CreateProgram.css';
import { useParams, useNavigate } from 'react-router-dom';
import { createCompleteProgram, getProgramById, updateProgram } from '../services/programService';
import { getAvailableExercises } from '../services/exerciseService';
import { parseWeeklyConfigs } from '../utils/programUtils';

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
    { days: [{ name: 'Day 1', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
    { days: [{ name: 'Day 2', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
    { days: [{ name: 'Day 3', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
    { days: [{ name: 'Day 4', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
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
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [step, setStep] = useState(mode === 'edit' ? 3 : 1); // Stepper: 1=choose, 2=select, 3=edit
  const [creationSource, setCreationSource] = useState('scratch'); // 'scratch' | 'template' | 'previous'
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedPreviousProgram, setSelectedPreviousProgram] = useState(null);
  const [templatePrograms, setTemplatePrograms] = useState([]);
  const [userPrograms, setUserPrograms] = useState([]);
  const [previewProgram, setPreviewProgram] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isTemplate, setIsTemplate] = useState(false);
  const [editingDay, setEditingDay] = useState({ dayIndex: null, value: '' });

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
    const fetchExercises = async () => {
      try {
        if (!user) return;
        
        // Fetch exercises using Supabase
        const exercisesData = await getAvailableExercises(user.id);
        
        // Format for UI
        const formattedExercises = exercisesData.map(ex => ({
          ...ex,
          isGlobal: ex.is_global,
          source: ex.is_global ? 'global' : 'user',
          createdBy: ex.created_by,
          label: ex.name,
          value: ex.id,
        }));
        
        setExercises(formattedExercises);
      } catch (error) {
        console.error("Error fetching exercises: ", error);
      }
    };
    
    fetchExercises();
  }, [user]);

  useEffect(() => {
    console.log('CreateProgram mounted:', { mode, programId, isLoading });
  }, []);

  useEffect(() => {
    const loadProgram = async () => {
      console.log('🔄 Starting loadProgram:', { mode, programId, timestamp: new Date().toISOString() });
      if (mode === 'edit' && programId) {
        try {
          console.log('📡 Fetching program document...');
          const programDoc = await getProgramById(programId);
          console.log('📄 Raw program document:', programDoc);
          
          if (programDoc) {
            const programData = programDoc;
            console.log('✅ Program data loaded successfully:', {
              id: programData.id,
              name: programData.name,
              duration: programData.duration,
              daysPerWeek: programData.daysPerWeek,
              weightUnit: programData.weightUnit,
              hasWeeklyConfigs: !!programData.weeklyConfigs,
              weeklyConfigsType: typeof programData.weeklyConfigs,
              weeklyConfigsKeys: programData.weeklyConfigs ? Object.keys(programData.weeklyConfigs) : [],
              weeklyConfigsLength: programData.weeklyConfigs ? Object.keys(programData.weeklyConfigs).length : 0,
              rawWeeklyConfigs: programData.weeklyConfigs
            });
            
            // Validate required fields with detailed logging
            console.log('🔍 Validating program structure...');
            const validationErrors = [];
            
            if (!programData.duration) validationErrors.push('Missing duration');
            if (!programData.daysPerWeek) validationErrors.push('Missing daysPerWeek');
            if (!programData.weeklyConfigs) validationErrors.push('Missing weeklyConfigs');
            
            if (validationErrors.length > 0) {
              console.error('❌ Program validation failed:', {
                errors: validationErrors,
                duration: programData.duration,
                daysPerWeek: programData.daysPerWeek,
                hasWeeklyConfigs: !!programData.weeklyConfigs,
                weeklyConfigsType: typeof programData.weeklyConfigs,
                fullProgramData: programData
              });
              throw new Error(`Invalid program data structure: ${validationErrors.join(', ')}`);
            }
            
            console.log('✅ Program structure validation passed');

            setProgramName(programData.name || '');
            setWeightUnit(programData.weightUnit || 'LB');
            
            // Create the correct structure for weeks
            console.log('🏗️ Creating weeks structure...');
            const weeklyConfigs = Array.from({ length: programData.duration }, (_, weekIdx) => ({
              days: Array.from({ length: programData.daysPerWeek }, (_, dayIdx) => ({
                name: `Day ${dayIdx + 1}`, // Default name
                exercises: []
              }))
            }));

            console.log('📋 Created empty weeklyConfigs structure:', {
              weeksLength: weeklyConfigs.length,
              firstWeekDaysLength: weeklyConfigs[0]?.days?.length,
              firstDayExercisesLength: weeklyConfigs[0]?.days?.[0]?.exercises?.length,
              structurePreview: {
                week0: {
                  daysCount: weeklyConfigs[0]?.days?.length,
                  day0ExercisesCount: weeklyConfigs[0]?.days?.[0]?.exercises?.length
                }
              }
            });

            // Process weeklyConfigs object
            console.log('🔄 Processing weeklyConfigs object...');
            if (typeof programData.weeklyConfigs === 'object' && programData.weeklyConfigs !== null) {
              const configKeys = Object.keys(programData.weeklyConfigs);
              console.log('📊 WeeklyConfigs analysis:', {
                configKeys,
                configCount: configKeys.length,
                configValues: Object.values(programData.weeklyConfigs).map(item => ({
                  type: typeof item,
                  isArray: Array.isArray(item),
                  length: Array.isArray(item) ? item.length : 'N/A',
                  hasName: item && typeof item === 'object' && 'name' in item,
                  hasExercises: item && typeof item === 'object' && 'exercises' in item
                }))
              });

              for (let key in programData.weeklyConfigs) {
                console.log(`🔑 Processing key: ${key}`);
                
                // Handle both old format (week1_day1_exercises) and new format (week1_day1)
                let match = key.match(/week(\d+)_day(\d+)_exercises/);
                if (!match) {
                  match = key.match(/week(\d+)_day(\d+)$/);
                }
                
                if (match) {
                  const weekIndex = parseInt(match[1], 10) - 1;
                  const dayIndex = parseInt(match[2], 10) - 1;
                  const configData = programData.weeklyConfigs[key];
                  
                  console.log('📝 Processing config key:', {
                    key,
                    weekIndex,
                    dayIndex,
                    configDataType: typeof configData,
                    isArray: Array.isArray(configData),
                    configData: configData,
                    exercisesCount: Array.isArray(configData) ? configData.length :
                                   (configData && configData.exercises ? configData.exercises.length : 'N/A')
                  });
                  
                  // Validate indices are within bounds
                  if (weekIndex >= 0 && weekIndex < programData.duration &&
                      dayIndex >= 0 && dayIndex < programData.daysPerWeek) {
                    
                    let exercisesToProcess = [];
                    let dayName = `Day ${dayIndex + 1}`; // Default name
                    
                    // Handle different data formats
                    if (Array.isArray(configData)) {
                      // Old format: direct exercises array
                      exercisesToProcess = configData;
                    } else if (configData && typeof configData === 'object') {
                      // New format: object with name and exercises
                      if (configData.exercises && Array.isArray(configData.exercises)) {
                        exercisesToProcess = configData.exercises;
                      }
                      if (configData.name) {
                        dayName = configData.name;
                      }
                    }
                    
                    // Ensure each exercise has required fields
                    const processedExercises = exercisesToProcess.map(ex => ({
                      exerciseId: ex.exerciseId || '',
                      sets: ex.sets || 3,
                      reps: ex.reps || 8,
                      notes: ex.notes || '' // Ensure notes field exists
                    }));
                    
                    console.log('✅ Setting exercises for week/day:', {
                      weekIndex,
                      dayIndex,
                      dayName,
                      exercisesCount: processedExercises.length,
                      firstExercise: processedExercises[0],
                      allExercises: processedExercises
                    });
                    
                    // Update the structure
                    weeklyConfigs[weekIndex].days[dayIndex].name = dayName;
                    weeklyConfigs[weekIndex].days[dayIndex].exercises = processedExercises;
                  } else {
                    console.warn('⚠️ Invalid indices - skipping:', {
                      key,
                      weekIndex,
                      dayIndex,
                      duration: programData.duration,
                      daysPerWeek: programData.daysPerWeek,
                      boundsCheck: {
                        weekValid: weekIndex >= 0 && weekIndex < programData.duration,
                        dayValid: dayIndex >= 0 && dayIndex < programData.daysPerWeek
                      }
                    });
                  }
                } else {
                  console.warn('⚠️ Key does not match expected pattern:', key);
                }
              }
            }

            // Log final structure before setting state
            console.log('🏁 Final weeklyConfigs structure analysis:', {
              weeksLength: weeklyConfigs.length,
              firstWeekDaysLength: weeklyConfigs[0]?.days?.length,
              firstDayExercisesLength: weeklyConfigs[0]?.days?.[0]?.exercises?.length,
              firstExercise: weeklyConfigs[0]?.days?.[0]?.exercises?.[0],
              firstDayName: weeklyConfigs[0]?.days?.[0]?.name,
              fullFirstWeek: weeklyConfigs[0],
              allWeeksPreview: weeklyConfigs.map((week, idx) => ({
                weekIndex: idx,
                daysCount: week.days?.length,
                firstDayName: week.days?.[0]?.name,
                firstDayExercisesCount: week.days?.[0]?.exercises?.length
              }))
            });

            // Validate the structure before setting state
            const isValidStructure = weeklyConfigs.length > 0 &&
                                   weeklyConfigs[0].days?.length > 0 &&
                                   Array.isArray(weeklyConfigs[0].days);
                                   
            console.log('🔍 Structure validation:', {
              hasWeeks: weeklyConfigs.length > 0,
              hasDays: weeklyConfigs[0]?.days?.length > 0,
              daysIsArray: Array.isArray(weeklyConfigs[0]?.days),
              isValidStructure
            });

            if (isValidStructure) {
              console.log('✅ Setting weeks state with valid structure');
              setWeeks(weeklyConfigs);
            } else {
              console.error('❌ Invalid weekly configs structure, setting default fallback');
              const fallbackWeeks = [
                { days: [{ name: 'Day 1', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
              ];
              console.log('🔄 Fallback structure:', fallbackWeeks);
              setWeeks(fallbackWeeks);
            }
          } else {
            console.error('❌ Program document not found:', {
              programId,
              docExists: !!programDoc,
              docType: typeof programDoc
            });
            throw new Error("Program not found");
          }
        } catch (error) {
          console.error("💥 Error loading program:", {
            error: error.message,
            stack: error.stack,
            programId,
            mode
          });
          alert(`Failed to load program data: ${error.message}. Starting with empty program.`);
          const errorFallbackWeeks = [
            { days: [{ name: 'Day 1', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
          ];
          console.log('🔄 Error fallback structure:', errorFallbackWeeks);
          setWeeks(errorFallbackWeeks);
        } finally {
          console.log('🏁 Load program completed, setting isLoading to false');
          setIsLoading(false);
        }
      } else {
        console.log('ℹ️ Skipping loadProgram - not in edit mode or no programId:', { mode, programId });
      }
    };
    loadProgram();
  }, [mode, programId]);

  // Fetch templates or previous programs as needed
  useEffect(() => {
    if (step === 2 && creationSource === 'template') {
      getCollectionCached('programs', { where: [['isTemplate', '==', true]] }, 30 * 60 * 1000)
        .then(setTemplatePrograms)
        .catch(console.error);
    }
    if (step === 2 && creationSource === 'previous') {
      if (user) {
        getCollectionCached('programs', { where: [['userId', '==', user.id], ['isTemplate', '==', false]] }, 30 * 60 * 1000)
          .then(setUserPrograms)
          .catch(console.error);
      }
    }
  }, [step, creationSource, user]);

  // Prefill form state when entering step 3
  useEffect(() => {
    if (step === 3) {
      if (creationSource === 'template' && selectedTemplate) {
        setProgramName((selectedTemplate.name || '') + ' (Copy)');
        setWeightUnit(selectedTemplate.weightUnit || 'LB');
        // Convert template's weeklyConfigs to weeks state
        if (selectedTemplate.weeklyConfigs && selectedTemplate.duration && selectedTemplate.daysPerWeek) {
          const weeksArr = parseWeeklyConfigs(selectedTemplate.weeklyConfigs, selectedTemplate.duration, selectedTemplate.daysPerWeek);
          // Convert parseWeeklyConfigs output to expected format
          const convertedWeeks = weeksArr.map((weekDays, weekIndex) => ({
            days: Array.isArray(weekDays) ? weekDays : []
          }));
          setWeeks(convertedWeeks);
        }
      } else if (creationSource === 'previous' && selectedPreviousProgram) {
        setProgramName((selectedPreviousProgram.name || '') + ' (Copy)');
        setWeightUnit(selectedPreviousProgram.weightUnit || 'LB');
        if (selectedPreviousProgram.weeklyConfigs && selectedPreviousProgram.duration && selectedPreviousProgram.daysPerWeek) {
          const weeksArr = parseWeeklyConfigs(selectedPreviousProgram.weeklyConfigs, selectedPreviousProgram.duration, selectedPreviousProgram.daysPerWeek);
          // Convert parseWeeklyConfigs output to expected format
          const convertedWeeks = weeksArr.map((weekDays, weekIndex) => ({
            days: Array.isArray(weekDays) ? weekDays : []
          }));
          setWeeks(convertedWeeks);
        }
      } else if (creationSource === 'scratch') {
        // Reset to default state
        setProgramName('');
        setWeightUnit('LB');
        setWeeks([
          { days: [{ name: 'Day 1', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ name: 'Day 2', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ name: 'Day 3', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ name: 'Day 4', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
        ]);
      }
    }
    // eslint-disable-next-line
  }, [step]);

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
      days: week.days.filter((_, index) => index !== dayIndex).map((day, idx) => ({ ...day, name: `Day ${idx + 1}` }))
    }));
    setWeeks(newWeeks);
  };

  const addDay = () => {
    const newWeeks = weeks.map(week => ({
      ...week,
      days: [
        ...week.days,
        { name: `Day ${week.days.length + 1}`, exercises: [{ exerciseId: '', sets: 3, reps: 8 }] }
      ]
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
          flattenedConfigs[`week${weekIndex + 1}_day${dayIndex + 1}`] = {
            name: day.name || `Day ${dayIndex + 1}`,
            exercises: day.exercises.map(ex => ({
              exerciseId: ex.exerciseId,
              sets: isNaN(Number(ex.sets)) ? String(ex.sets) : Number(ex.sets),
              reps: isNaN(Number(ex.reps)) ? String(ex.reps) : Number(ex.reps),
              notes: ex.notes || '',
            }))
          };
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
        invalidateProgramCache(user.id);
        alert('Program updated successfully!');
        navigate('/programs');
      } else {
        await addDoc(collection(db, "programs"), {
          ...programData,
          ...(userRole === 'admin' && isTemplate
            ? { isTemplate: true, userId: user.id, createdAt: new Date() }
            : { userId: user.id, isTemplate: false, createdAt: new Date() }
          )
        });
        invalidateProgramCache(user.id);
        alert('Program created successfully!');
        // Reset form for new program
        setProgramName('');
        setWeightUnit('LB');
        setWeeks([
          { days: [{ name: 'Day 1', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ name: 'Day 2', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ name: 'Day 3', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] },
          { days: [{ name: 'Day 4', exercises: [{ exerciseId: '', sets: 3, reps: 8, notes: '' }] }] }
        ]);
        setIsTemplate(false);
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

  // Inline day name editing handlers
  const handleDayNameClick = (dayIndex, currentName) => {
    setEditingDay({ dayIndex, value: currentName || `Day ${dayIndex + 1}` });
  };

  const handleDayNameChange = (e) => {
    setEditingDay(prev => ({ ...prev, value: e.target.value }));
  };

  const handleDayNameBlur = (dayIndex) => {
    if (editingDay.value.trim() === '') {
      setEditingDay({ dayIndex: null, value: '' });
      return;
    }
    // Update the name for all weeks at this day index
    const newWeeks = weeks.map(week => ({
      ...week,
      days: week.days.map((day, idx) =>
        idx === dayIndex ? { ...day, name: editingDay.value } : day
      )
    }));
    setWeeks(newWeeks);
    setEditingDay({ dayIndex: null, value: '' });
  };

  const handleDayNameKeyDown = (e, dayIndex) => {
    if (e.key === 'Enter') {
      handleDayNameBlur(dayIndex);
    } else if (e.key === 'Escape') {
      setEditingDay({ dayIndex: null, value: '' });
    }
  };

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
      {/* Stepper UI */}
      <div className="stepper mb-4 d-flex justify-content-center align-items-center" style={{gap: 0}}>
        <div className={`step px-3 py-2 text-center${step === 1 ? ' active-step' : ''}`} style={{borderBottom: step === 1 ? '3px solid #0d6efd' : '1px solid #dee2e6', fontWeight: step === 1 ? 'bold' : 'normal', color: step === 1 ? '#0d6efd' : '#6c757d', minWidth: 90, transition: 'all 0.2s'}}>1. Start</div>
        <div className="step-separator mx-2" style={{color: '#adb5bd', fontSize: 24}}>→</div>
        <div className={`step px-3 py-2 text-center${step === 2 ? ' active-step' : ''}`} style={{borderBottom: step === 2 ? '3px solid #0d6efd' : '1px solid #dee2e6', fontWeight: step === 2 ? 'bold' : 'normal', color: step === 2 ? '#0d6efd' : '#6c757d', minWidth: 90, transition: 'all 0.2s'}}>2. Select</div>
        <div className="step-separator mx-2" style={{color: '#adb5bd', fontSize: 24}}>→</div>
        <div className={`step px-3 py-2 text-center${step === 3 ? ' active-step' : ''}`} style={{borderBottom: step === 3 ? '3px solid #0d6efd' : '1px solid #dee2e6', fontWeight: step === 3 ? 'bold' : 'normal', color: step === 3 ? '#0d6efd' : '#6c757d', minWidth: 90, transition: 'all 0.2s'}}>3. Edit</div>
      </div>
      {/* Step 1: Choose how to start */}
      {step === 1 && (
        <div className="step-choose-source text-center mb-5">
          <h4>How would you like to start?</h4>
          <div className="d-flex flex-column flex-md-row justify-content-center gap-3 mt-4">
            <Button
              variant="outline-primary"
              className="stepper-choice"
              style={{minWidth: 220, minHeight: 70, fontSize: 18, borderWidth: 2, transition: 'all 0.15s'}}
              onClick={() => { setCreationSource('scratch'); setStep(3); }}
            >
              Start from Scratch
            </Button>
            <Button
              variant="outline-primary"
              className="stepper-choice"
              style={{minWidth: 220, minHeight: 70, fontSize: 18, borderWidth: 2, transition: 'all 0.15s'}}
              onClick={() => { setCreationSource('template'); setStep(2); }}
            >
              Use a Template
            </Button>
            <Button
              variant="outline-primary"
              className="stepper-choice"
              style={{minWidth: 220, minHeight: 70, fontSize: 18, borderWidth: 2, transition: 'all 0.15s'}}
              onClick={() => { setCreationSource('previous'); setStep(2); }}
            >
              Use Previous Program
            </Button>
          </div>
        </div>
      )}
      {/* Step 2: Select template or previous program */}
      {step === 2 && creationSource === 'template' && (
        <div className="step-select-template mb-5">
          <h4>Select a Template</h4>
          <div className="template-list d-flex flex-wrap justify-content-center gap-3 mt-4">
            {templatePrograms.length === 0 ? (
              <div className="text-muted">No templates found.</div>
            ) : (
              templatePrograms.map(template => (
                <Card
                  key={template.id}
                  className={`mb-2 selectable-card ${selectedTemplate?.id === template.id ? 'border-primary' : ''}`}
                  style={{ minWidth: 250, cursor: 'pointer', borderWidth: selectedTemplate?.id === template.id ? 2 : 1 }}
                  onClick={(e) => { e.stopPropagation(); setPreviewProgram(template); setShowPreviewModal(true); }}
                >
                  <Card.Body>
                    <Card.Title>{template.name}</Card.Title>
                    <Card.Text>{template.duration} weeks, {template.daysPerWeek} days/week</Card.Text>
                  </Card.Body>
                </Card>
              ))
            )}
          </div>
          <div className="mt-4">
            <Button
              variant="success"
              disabled={!selectedTemplate}
              onClick={() => setStep(3)}
            >
              Next
            </Button>
            <Button variant="secondary" onClick={() => setStep(1)} className="ms-2">Back</Button>
          </div>
        </div>
      )}
      {step === 2 && creationSource === 'previous' && (
        <div className="step-select-previous mb-5">
          <h4>Select a Previous Program</h4>
          <div className="program-list d-flex flex-wrap justify-content-center gap-3 mt-4">
            {userPrograms.length === 0 ? (
              <div className="text-muted">No previous programs found.</div>
            ) : (
              [...userPrograms].sort((a, b) => {
                const aDate = a.updatedAt ? a.updatedAt.seconds : (a.createdAt ? a.createdAt.seconds : 0);
                const bDate = b.updatedAt ? b.updatedAt.seconds : (b.createdAt ? b.createdAt.seconds : 0);
                return bDate - aDate;
              }).map(program => (
                <Card
                  key={program.id}
                  className={`mb-3 selectable-card shadow-sm${selectedPreviousProgram?.id === program.id ? ' border-primary' : ''}`}
                  style={{
                    minWidth: 280,
                    maxWidth: 340,
                    cursor: 'pointer',
                    borderWidth: selectedPreviousProgram?.id === program.id ? 2 : 1,
                    borderColor: selectedPreviousProgram?.id === program.id ? '#0d6efd' : '#dee2e6',
                    boxShadow: selectedPreviousProgram?.id === program.id ? '0 0 0 0.2rem #0d6efd22' : '0 2px 8px #0001',
                    transition: 'all 0.15s',
                    background: selectedPreviousProgram?.id === program.id ? '#f5faff' : '#fff',
                    position: 'relative',
                    margin: '0 8px 16px 8px',
                  }}
                  onClick={(e) => { e.stopPropagation(); setPreviewProgram(program); setShowPreviewModal(true); }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px #0d6efd22'}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = selectedPreviousProgram?.id === program.id ? '0 0 0 0.2rem #0d6efd22' : '0 2px 8px #0001'}
                >
                  <Card.Body>
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <Card.Title className="mb-0" style={{fontSize: 20, fontWeight: 600, color: '#0d223a'}}>{program.name}</Card.Title>
                      {program.isCurrent && (
                        <span className="badge bg-success ms-2" title="Current Program" style={{fontSize: 12}}>Current</span>
                      )}
                    </div>
                    <div className="mb-2" style={{fontSize: 15, color: '#495057'}}>
                      <span className="me-3"><strong>{program.duration}</strong> weeks</span>
                      <span><strong>{program.daysPerWeek}</strong> days/week</span>
                    </div>
                    <div style={{fontSize: 13, color: '#6c757d'}}>
                      Last edited: {program.updatedAt ? new Date(program.updatedAt.seconds * 1000).toLocaleDateString() : (program.createdAt ? new Date(program.createdAt.seconds * 1000).toLocaleDateString() : '—')}
                    </div>
                  </Card.Body>
                  {selectedPreviousProgram?.id === program.id && (
                    <div style={{position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: '#0d6efd', borderTopLeftRadius: 6, borderTopRightRadius: 6}} />
                  )}
                </Card>
              ))
            )}
          </div>
          <div className="mt-4">
            <Button
              variant="success"
              disabled={!selectedPreviousProgram}
              onClick={() => setStep(3)}
            >
              Next
            </Button>
            <Button variant="secondary" onClick={() => setStep(1)} className="ms-2">Back</Button>
          </div>
        </div>
      )}
      {/* Step 3: Main form (existing UI) */}
      {step === 3 && (
        <>
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
              {/* Admin template switch below Program Name */}
              {userRole === 'admin' && mode !== 'edit' && (
                <Form.Group className="mt-3">
                  <Form.Check
                    type="switch"
                    id="template-switch"
                    label="Create as Template Program (available to all users)"
                    checked={isTemplate}
                    onChange={e => setIsTemplate(e.target.checked)}
                  />
                </Form.Group>
              )}
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
                    {/* Inline editable day name */}
                    <span className="me-3">
                      {editingDay.dayIndex === dayIndex ? (
                        <Form.Control
                          type="text"
                          value={editingDay.value}
                          autoFocus
                          onChange={(e) => handleDayNameChange(e)}
                          onBlur={() => handleDayNameBlur(dayIndex)}
                          onKeyDown={(e) => handleDayNameKeyDown(e, dayIndex)}
                          style={{ maxWidth: 160, display: 'inline-block' }}
                          size="sm"
                        />
                      ) : (
                        <span
                          style={{ cursor: 'pointer', fontWeight: 500 }}
                          onClick={(e) => { e.stopPropagation(); handleDayNameClick(dayIndex, day.name); }}
                          title="Click to edit day name"
                        >
                          {day.name || `Day ${dayIndex + 1}`}
                        </span>
                      )}
                    </span>
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
                              {/* Inline editable day name */}
                              {editingDay.dayIndex === dayIndex ? (
                                <Form.Control
                                  type="text"
                                  value={editingDay.value}
                                  autoFocus
                                  onChange={(e) => handleDayNameChange(e)}
                                  onBlur={() => handleDayNameBlur(dayIndex)}
                                  onKeyDown={(e) => handleDayNameKeyDown(e, dayIndex)}
                                  style={{ maxWidth: 160, display: 'inline-block' }}
                                  size="sm"
                                />
                              ) : (
                                <span
                                  style={{ cursor: 'pointer', fontWeight: 500 }}
                                  onClick={(e) => { e.stopPropagation(); handleDayNameClick(dayIndex, day.name); }}
                                  title="Click to edit day name"
                                >
                                  {day.name || `Day ${dayIndex + 1}`}
                                </span>
                              )}
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
                {currentNoteExercise.dayIndex !== null && weeks && weeks[0]?.days?.[currentNoteExercise.dayIndex]?.exercises?.[currentNoteExercise.exIndex] && (
                  <div className="text-muted fs-6">
                    {(() => {
                      const exerciseId = weeks[0].days[currentNoteExercise.dayIndex].exercises[currentNoteExercise.exIndex].exerciseId;
                      const exercise = exercises.find(e => e.value === exerciseId);
                      return exercise?.label || 'Exercise';
                    })()}
                  </div>
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
            userRole={userRole}
            user={user}
          />
        </>
      )}
      {/* Program Preview Modal (always rendered so it works in all steps) */}
      <Modal show={showPreviewModal} onHide={() => setShowPreviewModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Program Preview</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {previewProgram ? (
            <div>
              <h5>{previewProgram.name}</h5>
              <div className="mb-2 text-muted">
                {previewProgram.duration} weeks, {previewProgram.daysPerWeek} days/week
              </div>
              <div style={{maxHeight: 350, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 12, background: '#f8f9fa'}}>
                {(() => {
                  // Convert flattened weeklyConfigs to array if needed
                  let weeksArr = [];
                  try {
                    if (previewProgram.weeklyConfigs && previewProgram.duration && previewProgram.daysPerWeek) {
                      const parsedWeeks = parseWeeklyConfigs(previewProgram.weeklyConfigs, previewProgram.duration, previewProgram.daysPerWeek);
                      
                      // Convert parseWeeklyConfigs output to expected format
                      // parseWeeklyConfigs returns: [week][day] = { name, exercises }
                      // We need: [week] = { days: [{ name, exercises }] }
                      weeksArr = parsedWeeks.map((weekDays, weekIndex) => ({
                        days: Array.isArray(weekDays) ? weekDays : []
                      }));
                    }
                  } catch (error) {
                    console.error('Error parsing weekly configs for preview:', error);
                    weeksArr = [];
                  }
                  
                  // Helper to get exercise name from exercises list
                  const getExerciseName = (exerciseId) => {
                    const found = exercises.find(e => e.value === exerciseId || e.id === exerciseId);
                    return found ? found.label || found.name : exerciseId;
                  };
                  
                  // Ensure all days have a name and handle undefined days
                  weeksArr.forEach((week, wIdx) => {
                    if (week && week.days && Array.isArray(week.days)) {
                      week.days.forEach((day, dIdx) => {
                        if (day && typeof day === 'object') {
                          if (!day.name) day.name = `Day ${dIdx + 1}`;
                          if (!Array.isArray(day.exercises)) day.exercises = [];
                        }
                      });
                    }
                  });
                  return (
                    <div>
                      {weeksArr.length === 0 ? (
                        <div className="text-muted">No structure available.</div>
                      ) : (
                        weeksArr.map((week, wIdx) => (
                          <div key={wIdx} className="mb-2">
                            <div style={{fontWeight: 600, color: '#0d6efd'}}>Week {wIdx + 1}</div>
                            {week && week.days && Array.isArray(week.days) ? (
                              week.days.map((day, dIdx) => (
                                <div key={dIdx} className="ms-3 mb-1">
                                  <span style={{fontWeight: 500}}>{day && day.name ? day.name : `Day ${dIdx + 1}`}:</span>
                                  {!day || !Array.isArray(day.exercises) || day.exercises.length === 0 ? (
                                    <span className="text-muted ms-2">No exercises</span>
                                  ) : (
                                    <ul className="mb-1" style={{marginLeft: 16}}>
                                      {day.exercises.map((ex, eIdx) => (
                                        <li key={eIdx}>
                                          {getExerciseName(ex.exerciseId) || ex.exerciseId || 'Exercise'}
                                          {ex.sets && ex.reps && (
                                            <span className="ms-2 text-muted">({ex.sets} x {ex.reps})</span>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              ))
                            ) : (
                              <div className="ms-3 text-muted">No days configured</div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : null}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowPreviewModal(false)}>Close</Button>
          {previewProgram && (
            <Button
              variant="primary"
              onClick={() => {
                if (creationSource === 'template') {
                  setSelectedTemplate(previewProgram);
                } else if (creationSource === 'previous') {
                  setSelectedPreviousProgram(previewProgram);
                }
                setShowPreviewModal(false);
                setTimeout(() => setStep(3), 0);
              }}
            >
              Select This Program
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default CreateProgram;
