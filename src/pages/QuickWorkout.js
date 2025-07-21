import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Table, Spinner, Modal, Card } from 'react-bootstrap';
import { Plus, X, BarChart, Pencil, Clock, Save, Trash } from 'react-bootstrap-icons';
import { db, auth } from '../firebase';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { useNumberInput } from '../hooks/useNumberInput.js';
import '../styles/LogWorkout.css';
import '../styles/QuickWorkoutDraft.css';
import { debounce } from 'lodash';
import { getAllExercisesMetadata, getDocCached, invalidateWorkoutCache } from '../api/enhancedFirestoreCache';
import ExerciseGrid from '../components/ExerciseGrid';
import ExerciseHistoryModal from '../components/ExerciseHistoryModal';
import quickWorkoutDraftService from '../services/quickWorkoutDraftService';

function QuickWorkout() {
    const [exercisesList, setExercisesList] = useState([]);
    const [selectedExercises, setSelectedExercises] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showExerciseGrid, setShowExerciseGrid] = useState(false);
    const [showNotesModal, setShowNotesModal] = useState(false);
    const [currentExerciseIndex, setCurrentExerciseIndex] = useState(null);
    const [exerciseNotes, setExerciseNotes] = useState('');
    const [showBodyweightModal, setShowBodyweightModal] = useState(false);
    const [bodyweightInput, setBodyweightInput] = useState('');
    const [bodyweightExerciseIndex, setBodyweightExerciseIndex] = useState(null);
    const [workoutName, setWorkoutName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [userMessage, setUserMessage] = useState({ text: '', type: '', show: false });
    
    // Exercise history state
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [selectedHistoryExercise, setSelectedHistoryExercise] = useState(null);

    // Draft system state
    const [currentDraft, setCurrentDraft] = useState(null);
    const [showResumeModal, setShowResumeModal] = useState(false);
    const [availableDrafts, setAvailableDrafts] = useState([]);
    const [isDraftSaving, setIsDraftSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const [autoSaveStatus, setAutoSaveStatus] = useState('');

    const user = auth.currentUser;

    // Refs for number inputs
    const repsInputRef = useRef(null);
    const weightInputRef = useRef(null);

    // Use the hook for double-click selection
    useNumberInput(repsInputRef);
    useNumberInput(weightInputRef);

    // Enhanced user message function
    const showUserMessage = (text, type = 'info') => {
        setUserMessage({ text, type, show: true });
        if (type !== 'error') {
            setTimeout(() => {
                setUserMessage(prev => ({ ...prev, show: false }));
            }, 5000);
        }
    };

    const hideUserMessage = () => {
        setUserMessage(prev => ({ ...prev, show: false }));
    };

    // Draft management functions using the service
    const saveDraft = async (exercises, name, isAutoSave = false) => {
        if (!user || exercises.length === 0) return;

        if (!isAutoSave) setIsDraftSaving(true);
        try {
            const result = await quickWorkoutDraftService.saveDraft(
                user.uid, 
                exercises, 
                name, 
                currentDraft?.id
            );
            
            setCurrentDraft(result);
            setLastSaved(new Date());
            
            if (isAutoSave) {
                setAutoSaveStatus('Draft saved');
                setTimeout(() => setAutoSaveStatus(''), 2000);
            } else {
                showUserMessage('Draft saved successfully!', 'success');
            }
        } catch (error) {
            console.error("Error saving draft:", error);
            if (!isAutoSave) {
                showUserMessage('Failed to save draft. Please try again.', 'error');
            }
        } finally {
            if (!isAutoSave) setIsDraftSaving(false);
        }
    };

    const loadDraft = (draft) => {
        setCurrentDraft(draft);
        setWorkoutName(draft.name || '');
        setSelectedExercises(draft.exercises.map(ex => ({
            ...ex,
            reps: ex.reps || Array(ex.sets).fill(''),
            weights: ex.weights || Array(ex.sets).fill(''),
            completed: ex.completed || Array(ex.sets).fill(false),
            notes: ex.notes || '',
            bodyweight: ex.bodyweight || ''
        })));
        setShowResumeModal(false);
        showUserMessage('Draft loaded successfully!', 'success');
    };

    const deleteDraft = async (draftId) => {
        if (!user || !draftId) return;

        try {
            await quickWorkoutDraftService.deleteDraft(user.uid, draftId);
            
            if (currentDraft && currentDraft.id === draftId) {
                setCurrentDraft(null);
                setSelectedExercises([]);
                setWorkoutName('');
            }
            
            // Refresh available drafts
            await fetchDrafts();
            showUserMessage('Draft deleted successfully!', 'success');
        } catch (error) {
            console.error("Error deleting draft:", error);
            showUserMessage('Failed to delete draft. Please try again.', 'error');
        }
    };

    const fetchDrafts = async () => {
        if (!user) return [];

        try {
            const draftsData = await quickWorkoutDraftService.loadDrafts(user.uid);
            setAvailableDrafts(draftsData);
            return draftsData;
        } catch (error) {
            console.error("Error fetching drafts:", error);
            return [];
        }
    };

    // Auto-save function with debouncing
    const debouncedSaveDraft = useCallback(
        debounce(async (exercises, name) => {
            if (exercises.length > 0) {
                await saveDraft(exercises, name, true);
            }
        }, 2000), // 2 second debounce
        [user, currentDraft]
    );

    // Cleanup old drafts using the service
    const cleanupOldDrafts = async () => {
        if (!user) return;

        try {
            const cleanedCount = await quickWorkoutDraftService.cleanupOldDrafts(user.uid);
            if (cleanedCount > 0) {
                console.log(`Cleaned up ${cleanedCount} old drafts`);
            }
        } catch (error) {
            console.error("Error cleaning up old drafts:", error);
        }
    };

    useEffect(() => {
        const initializeComponent = async () => {
            if (user) {
                try {
                    // Fetch exercises using metadata approach
                    const globalExercises = await getAllExercisesMetadata(60 * 60 * 1000);
                    const enhancedGlobalExercises = globalExercises.map(ex => ({
                        ...ex,
                        isGlobal: true,
                        source: 'global',
                        createdBy: null
                    }));

                    // Fetch user-specific exercises
                    let userExercises = [];
                    if (user?.uid) {
                        try {
                            const userMetadata = await getDocCached('exercises_metadata', user.uid, 60 * 60 * 1000);
                            if (userMetadata && userMetadata.exercises) {
                                userExercises = Object.entries(userMetadata.exercises).map(([id, ex]) => ({
                                    id,
                                    ...ex,
                                    isGlobal: false,
                                    source: 'custom',
                                    createdBy: user.uid
                                }));
                            }
                        } catch (userError) {
                            console.log('No user-specific exercises found');
                        }
                    }

                    const allExercises = [...enhancedGlobalExercises, ...userExercises];
                    setExercisesList(allExercises);

                    // Fetch available drafts and check for resume
                    const drafts = await fetchDrafts();
                    
                    // Clean up old drafts
                    await cleanupOldDrafts();

                    // Check if we should show resume modal
                    if (drafts.length > 0 && !sessionStorage.getItem('quickWorkoutTemplate')) {
                        setShowResumeModal(true);
                    }
                } catch (error) {
                    console.error('Error initializing component:', error);
                    showUserMessage('Failed to load exercises', 'error');
                } finally {
                    setIsLoading(false);
                }
            }
        };
        initializeComponent();
    }, [user]);

    // Load template data from sessionStorage if available
    useEffect(() => {
        const loadTemplateData = () => {
            try {
                const templateData = sessionStorage.getItem('quickWorkoutTemplate');
                if (templateData) {
                    const parsedTemplate = JSON.parse(templateData);
                    
                    // Set workout name
                    if (parsedTemplate.name) {
                        setWorkoutName(parsedTemplate.name);
                    }
                    
                    // Set exercises with cleared reps, weights, and completion status
                    // but preserve exercise selection, set counts, and notes
                    if (parsedTemplate.exercises && Array.isArray(parsedTemplate.exercises)) {
                        setSelectedExercises(parsedTemplate.exercises);
                        showUserMessage('Workout template loaded successfully!', 'success');
                    }
                    
                    // Clear the template data from sessionStorage after loading
                    sessionStorage.removeItem('quickWorkoutTemplate');
                }
            } catch (error) {
                console.error('Error loading template data:', error);
                showUserMessage('Failed to load workout template', 'error');
                // Clear invalid data from sessionStorage
                sessionStorage.removeItem('quickWorkoutTemplate');
            }
        };

        // Only load template after exercises are loaded
        if (!isLoading && exercisesList.length > 0) {
            loadTemplateData();
        }
    }, [isLoading, exercisesList]);

    // Auto-save when exercises or workout name changes
    useEffect(() => {
        if (!isLoading && selectedExercises.length > 0 && user) {
            debouncedSaveDraft(selectedExercises, workoutName);
        }
    }, [selectedExercises, workoutName, isLoading, user, debouncedSaveDraft]);

    const addExerciseToWorkout = (exercise) => {
        const newExercise = {
            exerciseId: exercise.id,
            sets: 3, // Default to 3 sets
            reps: Array(3).fill(''),
            weights: Array(3).fill(''),
            completed: Array(3).fill(false),
            notes: '',
            bodyweight: ['Bodyweight', 'Bodyweight Loadable'].includes(exercise.exerciseType) ? '' : null
        };
        setSelectedExercises([...selectedExercises, newExercise]);
        setShowExerciseGrid(false);
    };

    const removeExercise = (index) => {
        const newExercises = selectedExercises.filter((_, i) => i !== index);
        setSelectedExercises(newExercises);
    };

    const updateExerciseData = (exerciseIndex, field, setIndex, value) => {
        const newExercises = [...selectedExercises];
        if (field === 'sets') {
            const newSets = parseInt(value) || 1;
            const oldSets = newExercises[exerciseIndex].sets;
            newExercises[exerciseIndex].sets = newSets;

            // Adjust arrays based on new set count
            if (newSets > oldSets) {
                // Add empty values for new sets
                for (let i = oldSets; i < newSets; i++) {
                    newExercises[exerciseIndex].reps.push('');
                    newExercises[exerciseIndex].weights.push('');
                    newExercises[exerciseIndex].completed.push(false);
                }
            } else if (newSets < oldSets) {
                // Remove excess values
                newExercises[exerciseIndex].reps = newExercises[exerciseIndex].reps.slice(0, newSets);
                newExercises[exerciseIndex].weights = newExercises[exerciseIndex].weights.slice(0, newSets);
                newExercises[exerciseIndex].completed = newExercises[exerciseIndex].completed.slice(0, newSets);
            }
        } else {
            newExercises[exerciseIndex][field][setIndex] = value;
        }
        setSelectedExercises(newExercises);
    };

    const removeSet = (exerciseIndex, setIndex) => {
        const newExercises = [...selectedExercises];
        if (newExercises[exerciseIndex].sets > 1) {
            // Remove the specific set data
            newExercises[exerciseIndex].reps.splice(setIndex, 1);
            newExercises[exerciseIndex].weights.splice(setIndex, 1);
            newExercises[exerciseIndex].completed.splice(setIndex, 1);
            newExercises[exerciseIndex].sets -= 1;
            setSelectedExercises(newExercises);
        }
    };

    // Helper function to check if a set can be marked as complete
    const canMarkSetComplete = (exercise, setIndex) => {
        const weightValue = exercise.weights[setIndex];
        const repsValue = exercise.reps[setIndex];
        const exerciseType = exercisesList.find(e => e.id === exercise.exerciseId)?.exerciseType;

        // Check if reps value is valid (not empty, not 0, not null, not undefined)
        const hasValidReps = repsValue !== '' && repsValue !== null && repsValue !== undefined && Number(repsValue) > 0;

        // Check weight based on exercise type
        let hasValidWeight = false;

        if (exerciseType === 'Bodyweight') {
            // For bodyweight exercises, we need a valid bodyweight value
            hasValidWeight = exercise.bodyweight !== '' && exercise.bodyweight !== null && exercise.bodyweight !== undefined && Number(exercise.bodyweight) > 0;
        } else if (exerciseType === 'Bodyweight Loadable') {
            // For bodyweight loadable, we need either bodyweight OR additional weight
            const hasBodyweight = exercise.bodyweight !== '' && exercise.bodyweight !== null && exercise.bodyweight !== undefined && Number(exercise.bodyweight) > 0;
            const hasAdditionalWeight = weightValue !== '' && weightValue !== null && weightValue !== undefined && Number(weightValue) >= 0;
            hasValidWeight = hasBodyweight || hasAdditionalWeight;
        } else {
            // For regular exercises, we need a valid weight value
            hasValidWeight = weightValue !== '' && weightValue !== null && weightValue !== undefined && Number(weightValue) > 0;
        }

        return hasValidReps && hasValidWeight;
    };

    const handleFocus = (e) => {
        e.currentTarget.select();
    };

    const openNotesModal = (exerciseIndex) => {
        setCurrentExerciseIndex(exerciseIndex);
        setExerciseNotes(selectedExercises[exerciseIndex].notes || '');
        setShowNotesModal(true);
    };

    const saveNote = () => {
        if (currentExerciseIndex === null) return;
        const newExercises = [...selectedExercises];
        newExercises[currentExerciseIndex].notes = exerciseNotes;
        setSelectedExercises(newExercises);
        setShowNotesModal(false);
    };

    const openBodyweightModal = (exerciseIndex) => {
        setBodyweightExerciseIndex(exerciseIndex);
        setBodyweightInput(selectedExercises[exerciseIndex].bodyweight || '');
        setShowBodyweightModal(true);
    };

    const saveBodyweight = () => {
        if (bodyweightExerciseIndex === null) return;
        const newExercises = [...selectedExercises];
        newExercises[bodyweightExerciseIndex].bodyweight = bodyweightInput;

        const exercise = exercisesList.find(e => e.id === newExercises[bodyweightExerciseIndex].exerciseId);
        if (exercise?.exerciseType === 'Bodyweight') {
            newExercises[bodyweightExerciseIndex].weights = Array(newExercises[bodyweightExerciseIndex].sets).fill(bodyweightInput);
        }
        setSelectedExercises(newExercises);
        setShowBodyweightModal(false);
    };

    const openHistoryModal = (exerciseId) => {
        const exerciseInfo = exercisesList.find(e => e.id === exerciseId);
        setSelectedHistoryExercise({ exerciseId });
        setShowHistoryModal(true);
    };

    const saveWorkout = async () => {
        if (!user || selectedExercises.length === 0) {
            showUserMessage('Please add at least one exercise to save the workout', 'error');
            return;
        }

        setIsSaving(true);
        try {
            if (currentDraft) {
                // Complete existing draft
                await quickWorkoutDraftService.completeDraft(
                    user.uid,
                    currentDraft.id,
                    selectedExercises,
                    workoutName
                );
            } else {
                // Create new completed workout directly
                const workoutData = {
                    userId: user.uid,
                    name: workoutName || `Quick Workout - ${new Date().toLocaleDateString()}`,
                    type: 'quick_workout',
                    exercises: selectedExercises.map(ex => ({
                        exerciseId: ex.exerciseId,
                        sets: Number(ex.sets),
                        reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
                        weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
                        completed: ex.completed,
                        notes: ex.notes || '',
                        bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null
                    })),
                    completedDate: Timestamp.fromDate(new Date()),
                    date: Timestamp.fromDate(new Date()),
                    isDraft: false,
                    isWorkoutFinished: true,
                    lastModified: Timestamp.fromDate(new Date())
                };

                await addDoc(collection(db, "workoutLogs"), workoutData);
                invalidateWorkoutCache(user.uid);
            }

            showUserMessage('Quick workout saved successfully!', 'success');

            // Reset form
            setSelectedExercises([]);
            setWorkoutName('');
            setCurrentDraft(null);
            setLastSaved(null);
            setAutoSaveStatus('');
        } catch (error) {
            console.error("Error saving quick workout:", error);
            showUserMessage('Failed to save workout. Please try again.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <Container className="text-center py-5">
                <Spinner animation="border" className="spinner-blue" />
                <p className="soft-text mt-2">Loading exercises...</p>
            </Container>
        );
    }

    return (
        <Container fluid className="soft-container py-4">
            {/* User Message */}
            {userMessage.show && (
                <Row className="mb-3">
                    <Col>
                        <div className={`alert alert-${userMessage.type === 'error' ? 'danger' : userMessage.type === 'success' ? 'success' : 'info'} alert-dismissible`}>
                            {userMessage.text}
                            <button type="button" className="btn-close" onClick={hideUserMessage}></button>
                        </div>
                    </Col>
                </Row>
            )}

            {/* Header with Draft Status */}
            <Row className="mb-4">
                <Col>
                    <div className="d-flex justify-content-between align-items-start">
                        <div>
                            <h1 className="soft-title">Quick Workout</h1>
                            <p className="soft-text">Create a one-off workout without needing a program</p>
                        </div>
                        <div className="text-end">
                            {currentDraft && (
                                <div className="d-flex flex-column align-items-end">
                                    <span className="draft-status-badge">
                                        <Clock size={12} />
                                        Draft Mode
                                    </span>
                                    {lastSaved && (
                                        <div className="draft-last-saved">
                                            Last saved: {lastSaved.toLocaleTimeString()}
                                        </div>
                                    )}
                                </div>
                            )}
                            {autoSaveStatus && (
                                <div className={`auto-save-indicator ${autoSaveStatus ? 'visible' : ''}`}>
                                    <Save size={12} />
                                    <small>{autoSaveStatus}</small>
                                </div>
                            )}
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Workout Name and Draft Controls */}
            <Row className="mb-4">
                <Col md={6}>
                    <Form.Group>
                        <Form.Label>Workout Name (Optional)</Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="e.g., Upper Body Session, Leg Day, etc."
                            value={workoutName}
                            onChange={(e) => setWorkoutName(e.target.value)}
                        />
                    </Form.Group>
                </Col>
                <Col md={6} className="d-flex align-items-end">
                    <div className="draft-controls">
                        {availableDrafts.length > 0 && (
                            <Button
                                variant="outline-info"
                                onClick={() => setShowResumeModal(true)}
                                className="soft-button"
                            >
                                <Clock className="me-2" />
                                Resume Draft
                            </Button>
                        )}
                        {currentDraft && (
                            <>
                                <Button
                                    variant="outline-secondary"
                                    onClick={() => saveDraft(selectedExercises, workoutName, false)}
                                    disabled={isDraftSaving}
                                    className="soft-button"
                                >
                                    {isDraftSaving ? (
                                        <>
                                            <Spinner animation="border" size="sm" className="me-2" />
                                            Saving...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="me-2" />
                                            Save Draft
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outline-danger"
                                    onClick={() => deleteDraft(currentDraft.id)}
                                    className="soft-button"
                                >
                                    <Trash className="me-2" />
                                    Discard
                                </Button>
                            </>
                        )}
                    </div>
                </Col>
            </Row>

            {/* Selected Exercises */}
            {selectedExercises.length > 0 && (
                <Row>
                    <Col>
                        {selectedExercises.map((exercise, exerciseIndex) => {
                            const exerciseInfo = exercisesList.find(e => e.id === exercise.exerciseId);
                            const isBodyweightType = ['Bodyweight', 'Bodyweight Loadable'].includes(exerciseInfo?.exerciseType);

                            return (
                                <Card key={exerciseIndex} className="soft-card mb-4">
                                    <Card.Header className="d-flex justify-content-between align-items-center">
                                        <div>
                                            <h5 className="mb-0">{exerciseInfo?.name || 'Unknown Exercise'}</h5>
                                            <small className="text-muted">{exerciseInfo?.primaryMuscleGroup}</small>
                                        </div>
                                        <div>
                                            {isBodyweightType && (
                                                <Button
                                                    variant="outline-secondary"
                                                    size="sm"
                                                    onClick={() => openBodyweightModal(exerciseIndex)}
                                                    className="me-2"
                                                >
                                                    BW: {exercise.bodyweight || '0'}
                                                </Button>
                                            )}
                                            <Button
                                                variant="outline-info"
                                                size="sm"
                                                onClick={() => openHistoryModal(exercise.exerciseId)}
                                                className="me-2"
                                                title="View History"
                                            >
                                                <BarChart />
                                            </Button>
                                            <Button
                                                variant="outline-secondary"
                                                size="sm"
                                                onClick={() => openNotesModal(exerciseIndex)}
                                                className="me-2"
                                                title={exercise.notes ? 'View/Edit Notes' : 'Add Notes'}
                                            >
                                                <Pencil />
                                                {exercise.notes && <span className="ms-1 badge bg-primary rounded-circle" style={{ width: '8px', height: '8px', padding: '0' }}>&nbsp;</span>}
                                            </Button>
                                            <Button
                                                variant="outline-danger"
                                                size="sm"
                                                onClick={() => removeExercise(exerciseIndex)}
                                            >
                                                <X />
                                            </Button>
                                        </div>
                                    </Card.Header>
                                    
                                    {/* Display notes preview if there is a note */}
                                    {exercise.notes && (
                                        <div className="note-preview mb-2 p-2 bg-light border-top">
                                            <small className="text-muted">
                                                <strong>Note:</strong> {exercise.notes.length > 50 ? `${exercise.notes.substring(0, 50)}...` : exercise.notes}
                                            </small>
                                        </div>
                                    )}
                                    
                                    <Card.Body>
                                        <Table responsive className="workout-log-table">
                                            <thead>
                                                <tr>
                                                    <th></th>
                                                    <th>Set</th>
                                                    <th>Reps</th>
                                                    <th>Weight</th>
                                                    <th>✓</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Array.from({ length: exercise.sets }, (_, setIndex) => (
                                                    <tr key={setIndex}>
                                                        <td className="text-center" style={{ width: '20px', paddingRight: '5px' }}>
                                                            {exercise.sets > 1 && (
                                                                <X
                                                                    size={24}
                                                                    onClick={() => removeSet(exerciseIndex, setIndex)}
                                                                    style={{
                                                                        cursor: 'pointer',
                                                                        color: '#495057',
                                                                        opacity: 0.6
                                                                    }}
                                                                    onMouseEnter={(e) => e.target.style.opacity = '1'}
                                                                    onMouseLeave={(e) => e.target.style.opacity = '0.6'}
                                                                    title="Remove this set"
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="text-center">{setIndex + 1}</td>
                                                        <td className="text-center">
                                                            <Form.Control
                                                                ref={setIndex === 0 ? repsInputRef : null}
                                                                type="number"
                                                                min="0"
                                                                value={exercise.reps[setIndex] || ''}
                                                                onChange={(e) => updateExerciseData(exerciseIndex, 'reps', setIndex, e.target.value)}
                                                                onFocus={handleFocus}
                                                                className="soft-input center-input"
                                                                style={{ width: '50px', display: 'inline-block' }}
                                                            />
                                                        </td>
                                                        <td className="text-center">
                                                            <Form.Control
                                                                ref={setIndex === 0 ? weightInputRef : null}
                                                                type="number"
                                                                min="0"
                                                                step="0.5"
                                                                value={exercise.weights[setIndex] || ''}
                                                                onChange={(e) => updateExerciseData(exerciseIndex, 'weights', setIndex, e.target.value)}
                                                                onFocus={handleFocus}
                                                                className="soft-input center-input"
                                                                style={{ width: '80px', display: 'inline-block' }}
                                                                disabled={exerciseInfo?.exerciseType === 'Bodyweight'}
                                                            />
                                                        </td>
                                                        <td className="text-center">
                                                            <Form.Check
                                                                type="checkbox"
                                                                checked={exercise.completed[setIndex] || false}
                                                                onChange={(e) => updateExerciseData(exerciseIndex, 'completed', setIndex, e.target.checked)}
                                                                className={`completed-checkbox ${canMarkSetComplete(exercise, setIndex) ? 'checkbox-enabled' : ''}`}
                                                                style={{ transform: 'scale(1.5)' }} // Larger checkbox for better touch interaction
                                                                disabled={!canMarkSetComplete(exercise, setIndex)} // Disable if conditions not met
                                                            />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </Table>
                                        
                                        <div className="d-flex justify-content-center mt-3 mb-2">
                                            <Button
                                                variant="outline-secondary"
                                                size="sm"
                                                onClick={() => updateExerciseData(exerciseIndex, 'sets', null, Math.min(20, exercise.sets + 1))}
                                                disabled={exercise.sets >= 20}
                                                className="px-3"
                                                title="Add Set"
                                            >
                                                <Plus size={16} className="me-1" />
                                                Add Set
                                            </Button>
                                        </div>
                                    </Card.Body>
                                </Card>
                            );
                        })}
                    </Col>
                </Row>
            )}

            {/* Add Exercise Button */}
            <Row className="mb-4">
                <Col>
                    <Button
                        variant="primary"
                        onClick={() => setShowExerciseGrid(true)}
                        className="soft-button"
                    >
                        <Plus className="me-2" />
                        Add Exercise
                    </Button>
                </Col>
            </Row>

            {/* Save Workout Button */}
            {selectedExercises.length > 0 && (
                <Row className="mb-4">
                    <Col className="d-flex justify-content-center">
                        <Button
                            variant="success"
                            size="lg"
                            onClick={saveWorkout}
                            disabled={isSaving}
                            className="soft-button"
                        >
                            {isSaving ? (
                                <>
                                    <Spinner animation="border" size="sm" className="me-2" />
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <BarChart className="me-2" />
                                    Save Workout
                                </>
                            )}
                        </Button>
                    </Col>
                </Row>
            )}

            {/* Exercise Grid Modal */}
            <Modal show={showExerciseGrid} onHide={() => setShowExerciseGrid(false)} size="xl">
                <Modal.Header closeButton>
                    <Modal.Title>Select Exercise</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <ExerciseGrid
                        exercises={exercisesList}
                        onExerciseClick={addExerciseToWorkout}
                    />
                </Modal.Body>
            </Modal>

            {/* Notes Modal */}
            <Modal show={showNotesModal} onHide={() => setShowNotesModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>
                        {currentExerciseIndex !== null && exercisesList.find(
                            e => e.id === selectedExercises[currentExerciseIndex]?.exerciseId
                        )?.name || 'Exercise'} Notes
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group>
                        <Form.Label>Notes</Form.Label>
                        <Form.Control
                            as="textarea"
                            rows={3}
                            value={exerciseNotes}
                            onChange={(e) => setExerciseNotes(e.target.value)}
                            placeholder="Add any notes about this exercise..."
                        />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowNotesModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={saveNote}>
                        Save Note
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Bodyweight Modal */}
            <Modal show={showBodyweightModal} onHide={() => setShowBodyweightModal(false)}>
                <Modal.Header closeButton>
                    <Modal.Title>Set Bodyweight</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Form.Group>
                        <Form.Label>Bodyweight</Form.Label>
                        <Form.Control
                            type="number"
                            min="0"
                            step="0.5"
                            value={bodyweightInput}
                            onChange={(e) => setBodyweightInput(e.target.value)}
                            placeholder="Enter your bodyweight"
                        />
                    </Form.Group>
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowBodyweightModal(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={saveBodyweight}>
                        Save Bodyweight
                    </Button>
                </Modal.Footer>
            </Modal>

            {/* Exercise History Modal */}
            <ExerciseHistoryModal
                show={showHistoryModal}
                onHide={() => setShowHistoryModal(false)}
                exercise={selectedHistoryExercise}
                exercisesList={exercisesList}
                weightUnit="LB"
            />

            {/* Resume Draft Modal */}
            <Modal show={showResumeModal} onHide={() => setShowResumeModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>Resume Previous Workout</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>You have {availableDrafts.length} unfinished workout{availableDrafts.length > 1 ? 's' : ''}. Would you like to resume one?</p>
                    
                    {availableDrafts.map((draft, index) => (
                        <Card key={draft.id} className="mb-3 resume-draft-card">
                            <Card.Body>
                                <div className="d-flex justify-content-between align-items-start">
                                    <div>
                                        <h6 className="mb-1">{draft.name}</h6>
                                        <small className="text-muted">
                                            {draft.exercises?.length || 0} exercises • 
                                            Last modified: {draft.lastModified?.toDate ? 
                                                draft.lastModified.toDate().toLocaleDateString() : 
                                                new Date(draft.lastModified).toLocaleDateString()}
                                        </small>
                                        <div className="draft-exercise-badges">
                                            {draft.exercises?.slice(0, 3).map((ex, idx) => {
                                                const exercise = exercisesList.find(e => e.id === ex.exerciseId);
                                                return (
                                                    <span key={idx} className="draft-exercise-badge">
                                                        {exercise?.name || 'Unknown'}
                                                    </span>
                                                );
                                            })}
                                            {draft.exercises?.length > 3 && (
                                                <span className="draft-exercise-badge">
                                                    +{draft.exercises.length - 3} more
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="d-flex flex-column gap-2">
                                        <Button
                                            variant="primary"
                                            size="sm"
                                            onClick={() => loadDraft(draft)}
                                            className="soft-button"
                                        >
                                            Resume
                                        </Button>
                                        <Button
                                            variant="outline-danger"
                                            size="sm"
                                            onClick={() => deleteDraft(draft.id)}
                                            className="soft-button"
                                        >
                                            <Trash size={12} />
                                        </Button>
                                    </div>
                                </div>
                            </Card.Body>
                        </Card>
                    ))}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowResumeModal(false)}>
                        Start Fresh
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
}

export default QuickWorkout;
