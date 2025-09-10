import React, { useState, useEffect, useRef } from 'react';
import { Container, Row, Col, Form, Button, Accordion, Table, Modal, Dropdown, Card } from 'react-bootstrap';
import { Trash, ChevronDown, ChevronUp, Pencil, ThreeDotsVertical, GripVertical, BarChart } from 'react-bootstrap-icons';
import { useAuth } from '../hooks/useAuth';
import { useNumberInput } from '../hooks/useNumberInput'; // Adjust path as needed
import { useFormPersistence } from '../hooks/useFormPersistence';
import { useIsCoach } from '../hooks/useRoleChecking';
import ExerciseCreationModal from '../components/ExerciseCreationModal';
import ExerciseGrid from '../components/ExerciseGrid';
import ExerciseHistoryModal from '../components/ExerciseHistoryModal';
import AutoSaveIndicator from '../components/AutoSaveIndicator';
import ProgramAssignmentModal from '../components/ProgramAssignmentModal';
import '../styles/CreateProgram.css';
import '../styles/ProgramAssignmentModal.css';
import { useParams, useNavigate } from 'react-router-dom';
import { createCompleteProgram, getProgramById, updateCompleteProgram, getUserPrograms, getProgramTemplates } from '../services/programService';
import { getAvailableExercises } from '../services/exerciseService';
import { getCoachClients } from '../services/coachService';
import { assignProgramToClient } from '../services/programAssignmentService';
import { parseWeeklyConfigs } from '../utils/programUtils';
import { transformSupabaseExercises } from '../utils/dataTransformations';
import { invalidateProgramCache } from '../api/supabaseCache';

// Import @dnd-kit components
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Helper function to convert Supabase program structure to weeks state
const convertSupabaseProgramToWeeks = (program) => {
  const weeks = Array.from({ length: program.duration }, (_, weekIdx) => ({
    days: Array.from({ length: program.days_per_week }, (_, dayIdx) => ({
      name: `Day ${dayIdx + 1}`,
      exercises: []
    }))
  }));

  if (program.program_workouts && Array.isArray(program.program_workouts)) {
    program.program_workouts.forEach(workout => {
      const weekIndex = workout.week_number - 1;
      const dayIndex = workout.day_number - 1;

      if (weekIndex >= 0 && weekIndex < program.duration &&
        dayIndex >= 0 && dayIndex < program.days_per_week) {

        weeks[weekIndex].days[dayIndex].name = workout.name || `Day ${dayIndex + 1}`;

        if (workout.program_exercises && Array.isArray(workout.program_exercises)) {
          weeks[weekIndex].days[dayIndex].exercises = workout.program_exercises.map(ex => ({
            exerciseId: ex.exercise_id || '',
            sets: ex.sets || 3,
            reps: ex.reps || 8,
            notes: ex.notes || ''
          }));
        }
      }
    });
  }

  return weeks;
};

// Sortable Mobile Exercise Component
const SortableMobileExercise = ({
  exercise,
  exIndex,
  dayIndex,
  weekIndex,
  selectedExercise,
  hasExerciseNotes,
  isExpanded,
  onToggleExpand,
  onSelectExercise,
  onApplyPreset,
  onOpenNotes,
  onRemoveExercise,
  onSetsRepsChange,
  weeks
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `exercise-${dayIndex}-${exIndex}`,
    data: {
      type: 'exercise',
      dayIndex,
      exIndex,
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`mb-3 p-2 rounded ${isDragging ? 'bg-light' : ''}`}
    >
      <div
        className="d-flex justify-content-between align-items-center"
        onClick={() => onToggleExpand(dayIndex, exIndex)}
        style={{ cursor: 'pointer' }}
      >
        <div className="d-flex align-items-center" style={{ width: '80%' }}>
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="me-2"
            style={{ cursor: 'grab', touchAction: 'none' }}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={16} className="text-muted" />
          </div>
          {selectedExercise ? (
            <div className="text-truncate">{selectedExercise.label}</div>
          ) : (
            <div className="text-muted">Select Exercise</div>
          )}
        </div>
        <div className="d-flex">
          <div className="p-1">{isExpanded ? <ChevronUp /> : <ChevronDown />}</div>
          <Button
            onClick={(e) => { e.stopPropagation(); onRemoveExercise(0, dayIndex, exIndex); }}
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
              onClick={() => onSelectExercise(0, dayIndex, exIndex)}
              className="w-100 text-start"
              variant="outline-primary"
            >
              {selectedExercise ? selectedExercise.label : 'Select Exercise'}
            </Button>
          </div>

          <div className="mb-3">
            <Form.Label>Presets</Form.Label>
            <div className="d-flex flex-wrap gap-2">
              <Button onClick={() => onApplyPreset(0, dayIndex, exIndex, '3x8')} className="soft-button gradient preset-btn" size="sm">3x8</Button>
              <Button onClick={() => onApplyPreset(0, dayIndex, exIndex, '5x5')} className="soft-button gradient preset-btn" size="sm">5x5</Button>
              <Button onClick={() => onApplyPreset(0, dayIndex, exIndex, '3x5/3/1')} className="soft-button gradient preset-btn" size="sm">3x5/3/1</Button>
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
                    onChange={(e) => onSetsRepsChange(weekIndex, dayIndex, exIndex, 'sets', e.target.value)}
                    className="soft-input create-program-input me-1"
                    placeholder="Sets"
                    min="1"
                    style={{ width: '50px', textAlign: 'center' }}
                  />
                  <span className="mx-1">x</span>
                  <Form.Control
                    type="text"
                    value={week.days[dayIndex].exercises[exIndex]?.reps || ''}
                    onChange={(e) => onSetsRepsChange(weekIndex, dayIndex, exIndex, 'reps', e.target.value)}
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
              onClick={() => onOpenNotes(0, dayIndex, exIndex)}
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

// Sortable Desktop Exercise Component
const SortableDesktopExercise = ({
  exercise,
  exIndex,
  dayIndex,
  weekIndex,
  selectedExercise,
  hasExerciseNotes,
  onSelectExercise,
  onApplyPreset,
  onOpenNotes,
  onRemoveExercise,
  onSetsRepsChange,
  onViewHistory,
  weeks
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `exercise-${dayIndex}-${exIndex}`,
    data: {
      type: 'exercise',
      dayIndex,
      exIndex,
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`d-flex exercise-row mb-3 align-items-center ${isDragging ? 'bg-light' : ''}`}
    >
      <div style={{ width: '40px' }}>
        {/* Drag Handle */}
        <div
          {...attributes}
          {...listeners}
          className="d-flex align-items-center justify-content-center h-100"
          style={{ cursor: 'grab', touchAction: 'none' }}
        >
          <GripVertical size={16} className="text-muted" />
        </div>
      </div>
      <div style={{ width: '230px', paddingRight: '10px' }}>
        <Button
          onClick={() => onSelectExercise(0, dayIndex, exIndex)}
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
                onChange={(e) => onSetsRepsChange(weekIndex, dayIndex, exIndex, 'sets', e.target.value)}
                className="soft-input create-program-input"
                placeholder="Sets"
                min="1"
                style={{ width: '40px', textAlign: 'center' }}
              />
              <span className="mx-1">x</span>
              <Form.Control
                type="text"
                value={week.days[dayIndex].exercises[exIndex]?.reps || ''}
                onChange={(e) => onSetsRepsChange(weekIndex, dayIndex, exIndex, 'reps', e.target.value)}
                className="soft-input create-program-input"
                placeholder="Reps"
                style={{ width: '40px', textAlign: 'center' }}
              />
            </div>
          </div>
        ))}
      </div>
      <div style={{ width: '250px' }} className="preset-buttons d-flex flex-wrap">
        <Button onClick={() => onApplyPreset(0, dayIndex, exIndex, '3x8')} className="soft-button gradient preset-btn me-1 mb-1" size="sm">3x8</Button>
        <Button onClick={() => onApplyPreset(0, dayIndex, exIndex, '5x5')} className="soft-button gradient preset-btn me-1 mb-1" size="sm">5x5</Button>
        <Button onClick={() => onApplyPreset(0, dayIndex, exIndex, '3x5/3/1')} className="soft-button gradient preset-btn mb-1" size="sm">3x5/3/1</Button>
      </div>
      <div style={{ width: '40px' }}>
        <Dropdown>
          <Dropdown.Toggle variant="light" id={`dropdown-exercise-${dayIndex}-${exIndex}`} className="border-0 bg-transparent three-dots-vert" style={{ padding: '0.25rem' }}>
            <ThreeDotsVertical size={18} />
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item onClick={() => onOpenNotes(0, dayIndex, exIndex)} className="d-flex align-items-center">
              <Pencil className="me-2" />
              {hasExerciseNotes ? 'Edit Notes' : 'Add Notes'}
              {hasExerciseNotes && <span className="ms-1 badge bg-primary rounded-circle" style={{ width: '8px', height: '8px', padding: '0' }}> </span>}
            </Dropdown.Item>
            <Dropdown.Item onClick={() => onViewHistory(selectedExercise)} className="d-flex align-items-center">
              <BarChart className="me-2" />
              View History
            </Dropdown.Item>
            <Dropdown.Item onClick={() => onRemoveExercise(0, dayIndex, exIndex)} className="d-flex align-items-center text-danger">
              <Trash className="me-2" />
              Delete Exercise
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </div>
  );
};

// New Exercise Selection Modal Component using ExerciseGrid
const ExerciseSelectionModal = ({ show, onHide, onSelect, exercises, onCreateNew, userRole }) => {
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
          userRole={userRole}
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
  const { user, isAuthenticated, userRole } = useAuth();
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
  const [autoSaveTriggered, setAutoSaveTriggered] = useState(false);
  const [activeId, setActiveId] = useState(null); // Track active drag item
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedExerciseHistory, setSelectedExerciseHistory] = useState(null);

  // Coach-specific state variables
  const { hasRole: isCoach } = useIsCoach();
  const [coachClients, setCoachClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [coachNotes, setCoachNotes] = useState('');
  const [clientGoals, setClientGoals] = useState([]);
  const [programDifficulty, setProgramDifficulty] = useState('intermediate');
  const [expectedDurationWeeks, setExpectedDurationWeeks] = useState(null);
  const [newGoal, setNewGoal] = useState('');
  
  // Program assignment modal state
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);

  const setsRef = useRef(null);
  const repsRef = useRef(null);

  // Dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Drag event handlers
  const handleDragStart = (event) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over) {
      setActiveId(null);
      return;
    }

    if (active.id === over.id) {
      setActiveId(null);
      return;
    }

    try {
      // Parse the IDs to get the indices
      const activeData = active.data.current;
      const overData = over.data.current;

      if (!activeData || !overData || activeData.type !== 'exercise' || overData.type !== 'exercise') {
        setActiveId(null);
        return;
      }

      const { dayIndex: activeDayIndex, exIndex: activeExIndex } = activeData;
      const { dayIndex: overDayIndex, exIndex: overExIndex } = overData;

      // Only allow reordering within the same day (as per requirements)
      if (activeDayIndex !== overDayIndex) {
        setActiveId(null);
        return;
      }

      // Reorder exercises within the day for EACH week independently
      const newWeeks = [...weeks];
      newWeeks.forEach((week, weekIndex) => {
        if (week.days[activeDayIndex] && week.days[activeDayIndex].exercises) {
          const dayExercises = [...week.days[activeDayIndex].exercises];
          // Only reorder if both indices are valid for this week's exercises
          if (activeExIndex < dayExercises.length && overExIndex < dayExercises.length) {
            // Move the exercise to the new position within this week's day
            const reorderedExercises = arrayMove(dayExercises, activeExIndex, overExIndex);
            // Update only this week's exercises for this day
            week.days[activeDayIndex].exercises = [...reorderedExercises];
          }
          // If indices are out of bounds for this week, skip reordering for this week
          // This preserves data integrity by not affecting weeks with fewer exercises
        }
      });

      setWeeks(newWeeks);
    } catch (error) {
      console.error('Error during drag operation:', error);
    } finally {
      setActiveId(null);
    }
  };

  const handleDragOver = (event) => {
    // Handle drag over if needed for future cross-day dragging
    // For now, we only allow same-day reordering
  };

  useNumberInput(setsRef);
  useNumberInput(repsRef);

  // Form persistence to prevent data loss on tab switches
  const formState = {
    programName,
    weightUnit,
    weeks,
    step,
    creationSource,
    isTemplate,
    // Coach-specific fields
    selectedClient,
    coachNotes,
    clientGoals,
    programDifficulty,
    expectedDurationWeeks
  };

  const { clearSavedState } = useFormPersistence(
    `createProgram_${mode}_${programId || 'new'}`,
    formState,
    (savedState) => {
      // Only restore state if we're not in edit mode or if we haven't loaded the program yet
      if (mode !== 'edit' && savedState) {
        if (savedState.programName !== undefined) setProgramName(savedState.programName);
        if (savedState.weightUnit !== undefined) setWeightUnit(savedState.weightUnit);
        if (savedState.weeks !== undefined) setWeeks(savedState.weeks);
        if (savedState.step !== undefined) setStep(savedState.step);
        if (savedState.creationSource !== undefined) setCreationSource(savedState.creationSource);
        if (savedState.isTemplate !== undefined) setIsTemplate(savedState.isTemplate);
        // Coach-specific fields
        if (savedState.selectedClient !== undefined) setSelectedClient(savedState.selectedClient);
        if (savedState.coachNotes !== undefined) setCoachNotes(savedState.coachNotes);
        if (savedState.clientGoals !== undefined) setClientGoals(savedState.clientGoals);
        if (savedState.programDifficulty !== undefined) setProgramDifficulty(savedState.programDifficulty);
        if (savedState.expectedDurationWeeks !== undefined) setExpectedDurationWeeks(savedState.expectedDurationWeeks);
      }
    },
    {
      debounceMs: 1000,
      exclude: ['isLoading'], // Don't persist loading states
      condition: () => mode !== 'edit' && step === 3 // Only persist when actively editing
    }
  );

  // Trigger auto-save indicator when form state changes
  useEffect(() => {
    if (mode !== 'edit' && step === 3 && (programName || weeks.some(w => w.days.some(d => d.exercises.some(e => e.exerciseId))))) {
      setAutoSaveTriggered(true);
    }
  }, [formState, mode, step, programName, weeks]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 767);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const fetchExercises = async () => {
      try {
        if (!user) return;

        // Cache warming for CreateProgram page
        const cacheWarmingService = (await import('../services/supabaseCacheWarmingService')).default;
        const warmingPromise = cacheWarmingService.smartWarmCache(user.id, {
          lastVisitedPage: 'CreateProgram',
          timeOfDay: new Date().getHours(),
          priority: 'low' // Lower priority since it's not as data-intensive
        }).catch(error => {
          console.warn('Cache warming failed:', error);
          return null;
        });

        // Fetch exercises using Supabase
        const exercisesData = await getAvailableExercises(user.id);

        // Format for UI using transformSupabaseExercises
        const transformedExercises = transformSupabaseExercises(exercisesData);
        const formattedExercises = transformedExercises.map(ex => ({
          ...ex,
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

  // Load coach clients if user is a coach
  useEffect(() => {
    const fetchCoachClients = async () => {
      if (!user || !isCoach) return;
      
      try {
        const clients = await getCoachClients(user.id);
        setCoachClients(clients);
      } catch (error) {
        console.error("Error fetching coach clients:", error);
      }
    };

    fetchCoachClients();
  }, [user, isCoach]);

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
            if (!programData.days_per_week) validationErrors.push('Missing days_per_week');

            if (validationErrors.length > 0) {
              console.error('❌ Program validation failed:', {
                errors: validationErrors,
                duration: programData.duration,
                daysPerWeek: programData.days_per_week,
                hasWorkouts: !!programData.program_workouts,
                workoutsCount: programData.program_workouts?.length || 0,
                fullProgramData: programData
              });
              throw new Error(`Invalid program data structure: ${validationErrors.join(', ')}`);
            }

            console.log('✅ Program structure validation passed');

            setProgramName(programData.name || '');
            setWeightUnit(programData.weight_unit || 'LB');
            
            // Load coach-specific fields if they exist
            if (programData.coach_assigned) {
              setCoachNotes(programData.coach_notes || '');
              setClientGoals(programData.client_goals || []);
              setProgramDifficulty(programData.program_difficulty || 'intermediate');
              setExpectedDurationWeeks(programData.expected_duration_weeks || null);
              
              // If there's an assigned client, find them in the coach's client list
              if (programData.assigned_to_client && coachClients.length > 0) {
                const assignedClient = coachClients.find(c => c.client.id === programData.assigned_to_client);
                setSelectedClient(assignedClient || null);
              }
            }

            // Create the correct structure for weeks from Supabase data
            console.log('🏗️ Creating weeks structure from Supabase data...');
            const weeklyConfigs = Array.from({ length: programData.duration }, (_, weekIdx) => ({
              days: Array.from({ length: programData.days_per_week }, (_, dayIdx) => ({
                name: `Day ${dayIdx + 1}`, // Default name
                exercises: []
              }))
            }));

            console.log('📋 Created empty weeklyConfigs structure:', {
              weeksLength: weeklyConfigs.length,
              firstWeekDaysLength: weeklyConfigs[0]?.days?.length,
              firstDayExercisesLength: weeklyConfigs[0]?.days?.[0]?.exercises?.length
            });

            // Process program_workouts from Supabase
            console.log('🔄 Processing program_workouts from Supabase...');
            if (programData.program_workouts && Array.isArray(programData.program_workouts)) {
              console.log('📊 Program workouts analysis:', {
                workoutsCount: programData.program_workouts.length,
                firstWorkout: programData.program_workouts[0]
              });

              programData.program_workouts.forEach((workout, workoutIdx) => {
                const weekIndex = workout.week_number - 1;
                const dayIndex = workout.day_number - 1;

                console.log('📝 Processing workout:', {
                  workoutIdx,
                  weekNumber: workout.week_number,
                  dayNumber: workout.day_number,
                  weekIndex,
                  dayIndex,
                  workoutName: workout.name,
                  exercisesCount: workout.program_exercises?.length || 0
                });

                // Validate indices are within bounds
                if (weekIndex >= 0 && weekIndex < programData.duration &&
                  dayIndex >= 0 && dayIndex < programData.days_per_week) {

                  // Set workout name
                  weeklyConfigs[weekIndex].days[dayIndex].name = workout.name || `Day ${dayIndex + 1}`;

                  // Process exercises for this workout
                  if (workout.program_exercises && Array.isArray(workout.program_exercises)) {
                    const processedExercises = workout.program_exercises.map(ex => ({
                      exerciseId: ex.exercise_id || '',
                      sets: ex.sets || 3,
                      reps: ex.reps || 8,
                      notes: ex.notes || ''
                    }));

                    weeklyConfigs[weekIndex].days[dayIndex].exercises = processedExercises;

                    console.log('✅ Set exercises for week/day:', {
                      weekIndex,
                      dayIndex,
                      exercisesCount: processedExercises.length,
                      firstExercise: processedExercises[0]
                    });
                  }
                } else {
                  console.warn('⚠️ Invalid workout indices - skipping:', {
                    weekNumber: workout.week_number,
                    dayNumber: workout.day_number,
                    weekIndex,
                    dayIndex,
                    duration: programData.duration,
                    daysPerWeek: programData.days_per_week
                  });
                }
              });
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
      getProgramTemplates()
        .then(setTemplatePrograms)
        .catch(console.error);
    }
    if (step === 2 && creationSource === 'previous') {
      if (user) {
        getUserPrograms(user.id, { isTemplate: false })
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
        setWeightUnit(selectedTemplate.weight_unit || 'LB');
        // Convert template's program_workouts to weeks state
        if (selectedTemplate.program_workouts && selectedTemplate.duration && selectedTemplate.days_per_week) {
          const convertedWeeks = convertSupabaseProgramToWeeks(selectedTemplate);
          setWeeks(convertedWeeks);
        }
      } else if (creationSource === 'previous' && selectedPreviousProgram) {
        setProgramName((selectedPreviousProgram.name || '') + ' (Copy)');
        setWeightUnit(selectedPreviousProgram.weight_unit || 'LB');
        if (selectedPreviousProgram.program_workouts && selectedPreviousProgram.duration && selectedPreviousProgram.days_per_week) {
          const convertedWeeks = convertSupabaseProgramToWeeks(selectedPreviousProgram);
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

    if (field === 'exerciseId') {
      // Check for duplicate exercises within the same day
      const selectedExerciseId = value ? value.value : '';
      if (selectedExerciseId) {
        // Check if this exercise is already selected in the current day
        const currentDayExercises = newWeeks[0].days[dayIndex].exercises;
        const isDuplicate = currentDayExercises.some((exercise, index) =>
          index !== exIndex && exercise.exerciseId === selectedExerciseId
        );

        if (isDuplicate) {
          // Find the exercise name for the error message
          const exerciseName = exercises.find(ex => ex.value === selectedExerciseId)?.label || 'this exercise';
          alert(`Cannot add duplicate exercise: ${exerciseName} is already selected for this day.`);
          return; // Don't update the exercise
        }
      }

      newWeeks.forEach(week => {
        week.days[dayIndex].exercises[exIndex][field] = value ? value.value : '';
      });
    } else {
      newWeeks.forEach(week => {
        week.days[dayIndex].exercises[exIndex][field] = value;
      });
    }

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

  // Coach-specific helper functions
  const addGoal = () => {
    if (newGoal.trim() && !clientGoals.includes(newGoal.trim())) {
      setClientGoals([...clientGoals, newGoal.trim()]);
      setNewGoal('');
    }
  };

  const removeGoal = (index) => {
    setClientGoals(clientGoals.filter((_, i) => i !== index));
  };

  // Handle program assignment confirmation
  const handleAssignmentConfirmation = async (assignmentData) => {
    try {
      setIsAssigning(true);
      
      // Update local state with assignment data
      setCoachNotes(assignmentData.coachNotes || '');
      setClientGoals(assignmentData.clientGoals || []);
      setExpectedDurationWeeks(assignmentData.expectedDurationWeeks);
      setProgramDifficulty(assignmentData.programDifficulty || 'intermediate');
      
      // Save the program first
      await saveProgramInternal(true); // Pass true to indicate this is an assignment
      
      setShowAssignmentModal(false);
    } catch (error) {
      console.error('Assignment confirmation failed:', error);
      throw error; // Re-throw to be handled by the modal
    } finally {
      setIsAssigning(false);
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

    // If coach is assigning to client, show assignment confirmation modal
    if (isCoach && selectedClient && mode !== 'edit') {
      setShowAssignmentModal(true);
      return;
    }

    // Coach-specific validation for edit mode
    if (isCoach && selectedClient && !expectedDurationWeeks) {
      alert('Please specify the expected duration when assigning a program to a client.');
      return;
    }

    await saveProgramInternal(false);
  };

  const saveProgramInternal = async (isAssignment = false) => {
    setIsSubmitting(true);
    try {
      // Convert weeks structure to Supabase format
      const programData = {
        name: programName,
        weight_unit: weightUnit,
        duration: weeks.length,
        days_per_week: weeks[0].days.length,
        user_id: user.id,
        is_template: userRole === 'admin' && isTemplate,
        is_active: true,
        // Coach-specific fields
        coach_assigned: isCoach && selectedClient ? true : false,
        assigned_to_client: selectedClient?.client?.id || null,
        assigned_at: isCoach && selectedClient ? new Date().toISOString() : null,
        coach_notes: coachNotes || null,
        client_goals: clientGoals.length > 0 ? clientGoals : null,
        expected_duration_weeks: expectedDurationWeeks || null,
        program_difficulty: programDifficulty,
        visibility: isCoach && selectedClient ? 'coach_only' : 'private'
      };

      // Create workouts data for Supabase
      const workoutsData = [];
      weeks.forEach((week, weekIndex) => {
        week.days.forEach((day, dayIndex) => {
          const workout = {
            week_number: weekIndex + 1,
            day_number: dayIndex + 1,
            name: day.name || `Day ${dayIndex + 1}`,
            exercises: day.exercises
              .filter(ex => ex.exerciseId) // Only include exercises with selected exercise
              .map(ex => ({
                exercise_id: ex.exerciseId,
                sets: isNaN(Number(ex.sets)) ? 3 : Number(ex.sets),
                // Preserve rep ranges (e.g., "8-10", "5/3/1"). If reps contains non-digits, store as string; otherwise store numeric as string for consistency
                reps: (() => {
                  const raw = ex.reps;
                  if (raw === undefined || raw === null) return '8';
                  const str = String(raw).trim();
                  if (str === '') return '8';
                  // If contains any non-digit characters (beyond whitespace), treat as a range string
                  if (/[^\d\s]/.test(str)) {
                    return str;
                  }
                  // Pure digits: normalize to string form for storage
                  return String(Number(str));
                })(),
                notes: ex.notes || '',
              }))
          };
          workoutsData.push(workout);
        });
      });

      let createdProgram;
      
      if (mode === 'edit') {
        // For edit mode, use updateCompleteProgram to handle the full workout structure
        createdProgram = await updateCompleteProgram(programId, programData, workoutsData);
        invalidateProgramCache(user.id);
        clearSavedState(); // Clear saved form data
        
        if (isAssignment) {
          alert('Program assigned and updated successfully!');
        } else {
          alert('Program updated successfully!');
        }
        navigate('/programs');
      } else {
        // For create mode, use createCompleteProgram with workouts
        createdProgram = await createCompleteProgram(programData, workoutsData);
        invalidateProgramCache(user.id);
        clearSavedState(); // Clear saved form data
        
        // If this is a coach assignment, trigger the assignment workflow
        if (isCoach && selectedClient && isAssignment) {
          try {
            await assignProgramToClient(
              createdProgram.program.id,
              selectedClient.client.id,
              user.id,
              {
                coachNotes,
                clientGoals,
                expectedDurationWeeks,
                programDifficulty,
                assignedAt: new Date().toISOString()
              }
            );
            alert('Program created and assigned to client successfully!');
          } catch (assignmentError) {
            console.error('Program assignment failed:', assignmentError);
            // The program was created, but the assignment failed.
            alert('Program created, but assignment failed. You can find the program in your list and assign it manually.');
          }
        } else {
          alert('Program created successfully!');
        }
        
        navigate('/programs');
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
        setSelectedClient(null);
        setCoachNotes('');
        setClientGoals([]);
        setExpectedDurationWeeks(null);
        setProgramDifficulty('intermediate');
      }
    } catch (error) {
      console.error("Error saving program:", error);
      
      // Handle different error types from updateCompleteProgram
      if (mode === 'edit') {
        // Check if it's a user-friendly error message from updateCompleteProgram
        const errorMessage = error.message || 'Failed to update program';
        if (errorMessage.includes('validation') || errorMessage.includes('backup') || errorMessage.includes('rollback')) {
          alert(`Update failed: ${errorMessage}`);
        } else {
          alert('Failed to update program. Please try again.');
        }
      } else {
        alert('Failed to create program');
      }
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
  
  const openHistoryModal = (exercise) => {
    console.log("Open History Modal exercise:", exercise);
    setSelectedExerciseHistory(exercise);
    console.log("Selected Exercise History", selectedExerciseHistory);
    setShowHistoryModal(true);
    console.log(showHistoryModal);
  };

  const renderMobileExerciseRow = (day, dayIndex, exercise, exIndex) => {
    const isExpanded = isExerciseExpanded(dayIndex, exIndex);
    const selectedExercise = exercises.find(opt => opt.value === exercise.exerciseId);
    const hasExerciseNotes = hasNotes(dayIndex, exIndex);
  
    return (
      <SortableMobileExercise
        key={`exercise-${0}-${dayIndex}-${exIndex}`}
        exercise={exercise}
        exIndex={exIndex}
        dayIndex={dayIndex}
        weekIndex={0}
        selectedExercise={selectedExercise}
        hasExerciseNotes={hasExerciseNotes}
        isExpanded={isExpanded}
        onToggleExpand={toggleExerciseExpand}
        onSelectExercise={openExerciseModal}
        onApplyPreset={applyPreset}
        onOpenNotes={openNotesModal}
        onRemoveExercise={removeExercise}
        onSetsRepsChange={handleSetsRepsChange}
        onViewHistory={openHistoryModal}
        weeks={weeks}
      />
    );
  };

  const renderDesktopExerciseRow = (day, dayIndex, exercise, exIndex) => {
    const hasExerciseNotes = hasNotes(dayIndex, exIndex);
    const selectedExercise = exercises.find(opt => opt.value === exercise.exerciseId);
  
    return (
      <SortableDesktopExercise
        key={`exercise-${0}-${dayIndex}-${exIndex}`}
        exercise={exercise}
        exIndex={exIndex}
        dayIndex={dayIndex}
        weekIndex={0}
        selectedExercise={selectedExercise}
        hasExerciseNotes={hasExerciseNotes}
        onSelectExercise={openExerciseModal}
        onApplyPreset={applyPreset}
        onOpenNotes={openNotesModal}
        onRemoveExercise={removeExercise}
        onSetsRepsChange={handleSetsRepsChange}
        onViewHistory={openHistoryModal}
        weeks={weeks}
      />
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
      <div className="stepper mb-4 d-flex justify-content-center align-items-center" style={{ gap: 0 }}>
        <div className={`step px-3 py-2 text-center${step === 1 ? ' active-step' : ''}`} style={{ borderBottom: step === 1 ? '3px solid #0d6efd' : '1px solid #dee2e6', fontWeight: step === 1 ? 'bold' : 'normal', color: step === 1 ? '#0d6efd' : '#6c757d', minWidth: 90, transition: 'all 0.2s' }}>1. Start</div>
        <div className="step-separator mx-2" style={{ color: '#adb5bd', fontSize: 24 }}>→</div>
        <div className={`step px-3 py-2 text-center${step === 2 ? ' active-step' : ''}`} style={{ borderBottom: step === 2 ? '3px solid #0d6efd' : '1px solid #dee2e6', fontWeight: step === 2 ? 'bold' : 'normal', color: step === 2 ? '#0d6efd' : '#6c757d', minWidth: 90, transition: 'all 0.2s' }}>2. Select</div>
        <div className="step-separator mx-2" style={{ color: '#adb5bd', fontSize: 24 }}>→</div>
        <div className={`step px-3 py-2 text-center${step === 3 ? ' active-step' : ''}`} style={{ borderBottom: step === 3 ? '3px solid #0d6efd' : '1px solid #dee2e6', fontWeight: step === 3 ? 'bold' : 'normal', color: step === 3 ? '#0d6efd' : '#6c757d', minWidth: 90, transition: 'all 0.2s' }}>3. Edit</div>
      </div>
      {/* Step 1: Choose how to start */}
      {step === 1 && (
        <div className="step-choose-source text-center mb-5">
          <h4>How would you like to start?</h4>
          <div className="d-flex flex-column flex-md-row justify-content-center gap-3 mt-4">
            <Button
              variant="outline-primary"
              className="stepper-choice"
              style={{ minWidth: 220, minHeight: 70, fontSize: 18, borderWidth: 2, transition: 'all 0.15s' }}
              onClick={() => { setCreationSource('scratch'); setStep(3); }}
            >
              Start from Scratch
            </Button>
            <Button
              variant="outline-primary"
              className="stepper-choice"
              style={{ minWidth: 220, minHeight: 70, fontSize: 18, borderWidth: 2, transition: 'all 0.15s' }}
              onClick={() => { setCreationSource('template'); setStep(2); }}
            >
              Use a Template
            </Button>
            <Button
              variant="outline-primary"
              className="stepper-choice"
              style={{ minWidth: 220, minHeight: 70, fontSize: 18, borderWidth: 2, transition: 'all 0.15s' }}
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
                    <Card.Text>{template.duration} weeks, {template.days_per_week} days/week</Card.Text>
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
                      <Card.Title className="mb-0" style={{ fontSize: 20, fontWeight: 600, color: '#0d223a' }}>{program.name}</Card.Title>
                      {program.isCurrent && (
                        <span className="badge bg-success ms-2" title="Current Program" style={{ fontSize: 12 }}>Current</span>
                      )}
                    </div>
                    <div className="mb-2" style={{ fontSize: 15, color: '#495057' }}>
                      <span className="me-3"><strong>{program.duration}</strong> weeks</span>
                      <span><strong>{program.days_per_week}</strong> days/week</span>
                    </div>
                    <div style={{ fontSize: 13, color: '#6c757d' }}>
                      Last edited: {program.updatedAt ? new Date(program.updatedAt.seconds * 1000).toLocaleDateString() : (program.createdAt ? new Date(program.createdAt.seconds * 1000).toLocaleDateString() : '—')}
                    </div>
                  </Card.Body>
                  {selectedPreviousProgram?.id === program.id && (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: 4, background: '#0d6efd', borderTopLeftRadius: 6, borderTopRightRadius: 6 }} />
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
                <div className="d-flex justify-content-between align-items-center">
                  <Form.Label>Program Name</Form.Label>
                  {mode !== 'edit' && <AutoSaveIndicator isActive={autoSaveTriggered} />}
                </div>
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

          {/* Coach-specific fields */}
          {isCoach && (
            <Row className="mb-4">
              <Col xs={12}>
                <Card className="coach-assignment-card">
                  <Card.Header className="bg-primary text-white">
                    <h6 className="mb-0">Coach Assignment</h6>
                  </Card.Header>
                  <Card.Body>
                    <Row>
                      <Col xs={12} md={6} className="mb-3">
                        <Form.Group>
                          <Form.Label>Assign to Client</Form.Label>
                          <Form.Select
                            value={selectedClient?.id || ''}
                            onChange={(e) => {
                              const relationshipId = e.target.value;
                              const relationship = coachClients.find(c => c.id === relationshipId);
                              setSelectedClient(relationship || null);
                            }}
                            className="soft-input"
                          >
                            <option value="">Select a client (optional)</option>
                            {coachClients.map(relationship => (
                              <option key={relationship.id} value={relationship.id}>
                                {relationship.client.name} ({relationship.client.email})
                              </option>
                            ))}
                          </Form.Select>
                          <Form.Text className="text-muted">
                            Leave empty to create a personal program
                          </Form.Text>
                        </Form.Group>
                      </Col>
                      <Col xs={12} md={6} className="mb-3">
                        <Form.Group>
                          <Form.Label>Program Difficulty</Form.Label>
                          <Form.Select
                            value={programDifficulty}
                            onChange={(e) => setProgramDifficulty(e.target.value)}
                            className="soft-input"
                          >
                            <option value="beginner">Beginner</option>
                            <option value="intermediate">Intermediate</option>
                            <option value="advanced">Advanced</option>
                          </Form.Select>
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col xs={12} md={6} className="mb-3">
                        <Form.Group>
                          <Form.Label>Expected Duration (weeks)</Form.Label>
                          <Form.Control
                            type="number"
                            value={expectedDurationWeeks || ''}
                            onChange={(e) => setExpectedDurationWeeks(e.target.value ? parseInt(e.target.value) : null)}
                            className="soft-input"
                            placeholder="e.g., 12"
                            min="1"
                            max="52"
                          />
                          <Form.Text className="text-muted">
                            How long should the client follow this program?
                          </Form.Text>
                        </Form.Group>
                      </Col>
                      <Col xs={12} md={6} className="mb-3">
                        <Form.Group>
                          <Form.Label>Client Goals</Form.Label>
                          <div className="d-flex mb-2">
                            <Form.Control
                              type="text"
                              value={newGoal}
                              onChange={(e) => setNewGoal(e.target.value)}
                              className="soft-input me-2"
                              placeholder="Add a goal"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && newGoal.trim()) {
                                  setClientGoals([...clientGoals, newGoal.trim()]);
                                  setNewGoal('');
                                }
                              }}
                            />
                            <Button
                              variant="outline-primary"
                              size="sm"
                              onClick={() => {
                                if (newGoal.trim()) {
                                  setClientGoals([...clientGoals, newGoal.trim()]);
                                  setNewGoal('');
                                }
                              }}
                            >
                              Add
                            </Button>
                          </div>
                          {clientGoals.length > 0 && (
                            <div className="d-flex flex-wrap gap-1">
                              {clientGoals.map((goal, index) => (
                                <span key={index} className="goal-badge">
                                  {goal}
                                  <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => removeGoal(index)}
                                  ></button>
                                </span>
                              ))}
                            </div>
                          )}
                        </Form.Group>
                      </Col>
                    </Row>
                    <Row>
                      <Col xs={12}>
                        <Form.Group>
                          <Form.Label>Coach Notes</Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={3}
                            value={coachNotes}
                            onChange={(e) => setCoachNotes(e.target.value)}
                            className="soft-input"
                            placeholder="Add notes about this program, training focus, or instructions for the client..."
                          />
                        </Form.Group>
                      </Col>
                    </Row>
                  </Card.Body>
                </Card>
              </Col>
            </Row>
          )}
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
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
                        <SortableContext
                          items={day.exercises.map((_, exIndex) => `exercise-${dayIndex}-${exIndex}`)}
                          strategy={verticalListSortingStrategy}
                        >
                          {day.exercises.map((exercise, exIndex) => renderMobileExerciseRow(day, dayIndex, exercise, exIndex))}
                        </SortableContext>
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
            </DndContext>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
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
                                  <SortableContext
                                    items={day.exercises.map((_, exIndex) => `exercise-${dayIndex}-${exIndex}`)}
                                    strategy={verticalListSortingStrategy}
                                  >
                                    {day.exercises.map((exercise, exIndex) => renderDesktopExerciseRow(day, dayIndex, exercise, exIndex))}
                                  </SortableContext>
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
            </DndContext>
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
            userRole={userRole}
          />

          {/* New Exercise Creation Modal */}
          <ExerciseCreationModal
            show={showExerciseCreationModal}
            onHide={() => setShowExerciseCreationModal(false)}
            onExerciseAdded={handleNewExerciseAdded}
            userRole={userRole}
            user={user}
          />

          {/* Program Assignment Modal */}
          <ProgramAssignmentModal
            show={showAssignmentModal}
            onHide={() => setShowAssignmentModal(false)}
            program={{
              name: programName,
              duration: weeks.length,
              days_per_week: weeks[0]?.days?.length || 0
            }}
            client={selectedClient}
            onConfirmAssignment={handleAssignmentConfirmation}
            isLoading={isAssigning}
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
                {previewProgram.duration} weeks, {previewProgram.days_per_week} days/week
              </div>
              <div style={{ maxHeight: 350, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 12, background: '#f8f9fa' }}>
                {(() => {
                  // Convert Supabase program structure to weeks array for preview
                  let weeksArr = [];
                  try {
                    if (previewProgram.program_workouts && previewProgram.duration && previewProgram.days_per_week) {
                      weeksArr = convertSupabaseProgramToWeeks(previewProgram);
                    } else if (previewProgram.weeklyConfigs && previewProgram.duration && previewProgram.daysPerWeek) {
                      // Fallback for old format
                      const parsedWeeks = parseWeeklyConfigs(previewProgram.weeklyConfigs, previewProgram.duration, previewProgram.daysPerWeek);
                      weeksArr = parsedWeeks.map((weekDays, weekIndex) => ({
                        days: Array.isArray(weekDays) ? weekDays : []
                      }));
                    }
                  } catch (error) {
                    console.error('Error parsing program structure for preview:', error);
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
                            <div style={{ fontWeight: 600, color: '#0d6efd' }}>Week {wIdx + 1}</div>
                            {week && week.days && Array.isArray(week.days) ? (
                              week.days.map((day, dIdx) => (
                                <div key={dIdx} className="ms-3 mb-1">
                                  <span style={{ fontWeight: 500 }}>{day && day.name ? day.name : `Day ${dIdx + 1}`}:</span>
                                  {!day || !Array.isArray(day.exercises) || day.exercises.length === 0 ? (
                                    <span className="text-muted ms-2">No exercises</span>
                                  ) : (
                                    <ul className="mb-1" style={{ marginLeft: 16 }}>
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

      {/* Exercise History Modal */}
      <ExerciseHistoryModal
        show={showHistoryModal}
        onHide={() => setShowHistoryModal(false)}
        exercise={selectedExerciseHistory}
        exercisesList={exercises}
        weightUnit={weightUnit}
      />

      {/* Drag Overlay for visual feedback */}
      <DragOverlay dropAnimation={defaultDropAnimationSideEffects}>
        {activeId ? (() => {
          // Find the active exercise data
          const activeIdParts = activeId.split('-');
          if (activeIdParts.length === 3 && activeIdParts[0] === 'exercise') {
            const dayIndex = parseInt(activeIdParts[1]);
            const exIndex = parseInt(activeIdParts[2]);

            // Use week 0 as reference for the drag overlay
            if (weeks[0]?.days[dayIndex]?.exercises[exIndex]) {
              const exercise = weeks[0].days[dayIndex].exercises[exIndex];
              const selectedExercise = exercises.find(opt => opt.value === exercise.exerciseId);

              return (
                <div className="p-2 rounded bg-white border shadow-lg" style={{ border: '1px solid #e9ecef', maxWidth: '400px' }}>
                  <div className="d-flex align-items-center">
                    <GripVertical size={16} className="text-muted me-2" />
                    {selectedExercise ? (
                      <div className="text-truncate">{selectedExercise.label}</div>
                    ) : (
                      <div className="text-muted">Select Exercise</div>
                    )}
                  </div>
                </div>
              );
            }
          }
          return null;
        })() : null}
      </DragOverlay>
    </Container>
  );
}

export default CreateProgram;
