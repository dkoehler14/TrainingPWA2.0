import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Table, Spinner, Modal, Card } from 'react-bootstrap';
import { Plus, X, BarChart, Pencil } from 'react-bootstrap-icons';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../config/supabase';
import { useNumberInput } from '../hooks/useNumberInput.js';
import '../styles/LogWorkout.css';
import '../styles/QuickWorkoutDraft.css';
import { debounce } from 'lodash';
import { getAvailableExercises } from '../services/exerciseService';
import workoutLogService from '../services/workoutLogService';
import ExerciseGrid from '../components/ExerciseGrid';
import ExerciseHistoryModal from '../components/ExerciseHistoryModal';

import performanceMonitor from '../utils/performanceMonitor';

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
    const [lastSaved, setLastSaved] = useState(null);
    const [showIncompleteWarningModal, setShowIncompleteWarningModal] = useState(false);

    const { user, isAuthenticated } = useAuth();

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

        try {
            const result = await workoutLogService.saveDraft(
                user.id,
                exercises,
                name,
                currentDraft?.id
            );

            setCurrentDraft(result);
            setLastSaved(new Date());

            if (!isAutoSave) {
                showUserMessage('Draft saved successfully!', 'success');
            }
        } catch (error) {
            console.error("Error saving draft:", error);
            if (!isAutoSave) {
                showUserMessage('Failed to save draft. Please try again.', 'error');
            }
        }
    };

    const loadDraft = (draft) => {
        setCurrentDraft(draft);
        setWorkoutName(draft.name || '');

        // Transform Supabase draft data to component format
        const exercises = draft.workout_log_exercises || draft.exercises || [];
        setSelectedExercises(exercises.map(ex => {
            const sets = ex.sets !== undefined && ex.sets !== null ? ex.sets : 3;
            return {
                exerciseId: ex.exercise_id || ex.exerciseId,
                sets: sets,
                reps: ex.reps || Array(sets).fill(''),
                weights: ex.weights || Array(sets).fill(''),
                completed: ex.completed || Array(sets).fill(false),
                notes: ex.notes || '',
                bodyweight: ex.bodyweight || ''
            };
        }));

        setShowResumeModal(false);
        showUserMessage('Draft loaded successfully!', 'success');
    };

    const startFresh = async () => {
        if (!user) return;

        try {
            // Delete any existing draft
            const existingDraft = await workoutLogService.getSingleDraft(user.id);
            if (existingDraft) {
                await workoutLogService.deleteDraft(user.id, existingDraft.id);
            }

            // Clear current state
            setCurrentDraft(null);
            setSelectedExercises([]);
            setWorkoutName('');
            setAvailableDrafts([]);
            setShowResumeModal(false);

            showUserMessage('Starting fresh workout!', 'success');
        } catch (error) {
            console.error("Error starting fresh:", error);
            showUserMessage('Failed to clear previous draft. Please try again.', 'error');
        }
    };

    const fetchSingleDraft = async () => {
        if (!user) return null;

        try {
            const draftData = await workoutLogService.getSingleDraft(user.id);
            setAvailableDrafts(draftData ? [draftData] : []);
            return draftData;
        } catch (error) {
            console.error("Error fetching single draft:", error);
            return null;
        }
    };

    // Auto-save function with debouncing
    const debouncedSaveDraft = useCallback(
        debounce(async (userData, exercises, name, isAutoSave) => {
            if (!userData || !exercises || exercises.length === 0) return;
            try {
                await saveDraft(exercises, name, isAutoSave);
                console.log('Quick workout auto-saved');
            } catch (error) {
                console.error("Error auto-saving quick workout: ", error);
            }
        }, 1000), // 1 second debounce
        [] // Empty dependency array ensures this is only created once
    );

    // Cleanup old drafts using the service
    const cleanupOldDrafts = async () => {
        if (!user) return;

        try {
            const cleanedCount = await workoutLogService.cleanupOldDrafts(user.id);
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
                const startTime = Date.now();

                try {
                    // Phase 1 Optimization: Performance monitoring
                    performanceMonitor.recordParallelLoading(4); // 4 parallel operations

                    // Phase 1 Optimization: Start smart cache warming immediately
                    const cacheWarmingService = (await import('../services/supabaseCacheWarmingService')).default;
                    const warmingPromise = cacheWarmingService.smartWarmCache(user.id, {
                        lastVisitedPage: 'QuickWorkout',
                        timeOfDay: new Date().getHours(),
                        priority: 'high'
                    }).then(() => {
                        performanceMonitor.recordCacheWarming('QuickWorkout initialization');
                        return null;
                    }).catch(error => {
                        console.warn('Cache warming failed:', error);
                        return null;
                    });

                    // Fetch exercises and draft data using Supabase
                    const [exercisesData, draft] = await Promise.all([
                        // Fetch available exercises using Supabase
                        getAvailableExercises(user.id).then(data => {
                            performanceMonitor.recordCacheHit('exercises');
                            performanceMonitor.recordDatabaseRead('exercises', 'supabase');
                            return data;
                        }).catch(error => {
                            performanceMonitor.recordCacheMiss('exercises');
                            performanceMonitor.recordDatabaseRead('exercises', 'error');
                            throw error;
                        }),
                        // Draft data
                        fetchSingleDraft().then(data => {
                            if (data) performanceMonitor.recordCacheHit('workout_draft');
                            return data;
                        })
                    ]);

                    // Process exercises for UI
                    const enhancedExercises = exercisesData.map(ex => ({
                        ...ex,
                        isGlobal: ex.is_global,
                        source: ex.is_global ? 'global' : 'user',
                        createdBy: ex.created_by
                    }));

                    setExercisesList(enhancedExercises);

                    // Background cleanup of old drafts (non-blocking)
                    cleanupOldDrafts().catch(error => {
                        console.warn('Draft cleanup failed:', error);
                    });

                    // Check if we should show resume modal
                    if (draft && !sessionStorage.getItem('quickWorkoutTemplate')) {
                        setShowResumeModal(true);
                    }

                    // Phase 1: Record performance metrics
                    const loadTime = Date.now() - startTime;
                    performanceMonitor.recordLoadTime('QuickWorkout', loadTime);

                    console.log(`✅ Quick Workout initialized: ${enhancedExercises.length} exercises loaded in ${loadTime}ms`);
                } catch (error) {
                    console.error('Error initializing component:', error);
                    showUserMessage('Failed to load exercises', 'error');

                    // Record failed load time
                    const loadTime = Date.now() - startTime;
                    performanceMonitor.recordLoadTime('QuickWorkout_Error', loadTime);
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
        const newExercises = [...selectedExercises, newExercise];
        setSelectedExercises(newExercises);
        setShowExerciseGrid(false);

        // Trigger auto-save
        if (user && newExercises.length > 0) {
            debouncedSaveDraft(user, newExercises, workoutName, true);
        }
    };

    const removeExercise = (index) => {
        const newExercises = selectedExercises.filter((_, i) => i !== index);
        setSelectedExercises(newExercises);

        // Trigger auto-save
        if (user && newExercises.length > 0) {
            debouncedSaveDraft(user, newExercises, workoutName, true);
        }
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

        // Trigger auto-save
        if (user && newExercises.length > 0) {
            debouncedSaveDraft(user, newExercises, workoutName, true);
        }
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

            // Trigger auto-save
            if (user && newExercises.length > 0) {
                debouncedSaveDraft(user, newExercises, workoutName, true);
            }
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

        // Trigger auto-save
        if (user && newExercises.length > 0) {
            debouncedSaveDraft(user, newExercises, workoutName, true);
        }
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

        // Trigger auto-save
        if (user && newExercises.length > 0) {
            debouncedSaveDraft(user, newExercises, workoutName, true);
        }
    };

    const openHistoryModal = (exerciseId) => {
        const exerciseInfo = exercisesList.find(e => e.id === exerciseId);
        setSelectedHistoryExercise({ exerciseId });
        setShowHistoryModal(true);
    };

    // Helper function to check if all sets are completed
    const checkAllSetsCompleted = () => {
        for (let exerciseIndex = 0; exerciseIndex < selectedExercises.length; exerciseIndex++) {
            const exercise = selectedExercises[exerciseIndex];
            for (let setIndex = 0; setIndex < exercise.sets; setIndex++) {
                if (!exercise.completed[setIndex]) {
                    return false;
                }
            }
        }
        return true;
    };

    const handleFinishWorkout = () => {
        if (!user || selectedExercises.length === 0) {
            showUserMessage('Please add at least one exercise to finish the workout', 'error');
            return;
        }

        // Check if all sets are completed
        if (!checkAllSetsCompleted()) {
            setShowIncompleteWarningModal(true);
            return;
        }

        // If all sets are completed, proceed directly
        finishWorkout();
    };

    const finishWorkout = async () => {
        if (!user || selectedExercises.length === 0) {
            showUserMessage('Please add at least one exercise to finish the workout', 'error');
            return;
        }

        setIsSaving(true);
        try {
            if (currentDraft) {
                // Complete existing draft using workoutLogService
                await workoutLogService.completeDraft(
                    user.id,
                    currentDraft.id,
                    selectedExercises,
                    workoutName
                );
            } else {
                // Create new completed workout directly using workoutLogService
                const workoutData = {
                    name: workoutName || `Quick Workout - ${new Date().toLocaleDateString()}`,
                    type: 'quick_workout',
                    date: new Date().toISOString().split('T')[0],
                    isFinished: true,
                    isDraft: false,
                    weightUnit: 'LB',
                    exercises: selectedExercises.map(ex => ({
                        exerciseId: ex.exerciseId,
                        sets: Number(ex.sets),
                        reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
                        weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
                        completed: ex.completed,
                        notes: ex.notes || '',
                        bodyweight: ex.bodyweight ? Number(ex.bodyweight) : null
                    }))
                };

                await workoutLogService.createWorkoutLog(user.id, workoutData);
            }

            showUserMessage('Quick workout finished successfully!', 'success');

            // Reset form
            setSelectedExercises([]);
            setWorkoutName('');
            setCurrentDraft(null);
            setLastSaved(null);
        } catch (error) {
            console.error("Error saving quick workout:", error);
            showUserMessage('Failed to finish workout. Please try again.', 'error');
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

            {/* Header */}
            <Row className="mb-4">
                <Col>
                    <div className="d-flex justify-content-between align-items-start">
                        <div>
                            <h1 className="soft-title">Quick Workout</h1>
                            <p className="soft-text">Create a one-off workout without needing a program</p>
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Workout Name */}
            <Row className="mb-4">
                <Col md={6}>
                    <Form.Group>
                        <Form.Label>Workout Name (Optional)</Form.Label>
                        <Form.Control
                            type="text"
                            placeholder="e.g., Upper Body Session, Leg Day, etc."
                            value={workoutName}
                            onChange={(e) => {
                                const newName = e.target.value;
                                setWorkoutName(newName);
                                // Trigger auto-save when workout name changes
                                if (user && selectedExercises.length > 0) {
                                    debouncedSaveDraft(user, selectedExercises, newName, true);
                                }
                            }}
                        />
                    </Form.Group>
                </Col>
                <Col md={6}>
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
                            onClick={handleFinishWorkout}
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
                                    Finish Workout
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
                    {availableDrafts.length > 0 && (
                        <>
                            <p>You have an unfinished workout. Would you like to resume it?</p>
                            <Card className="mb-3 resume-draft-card">
                                <Card.Body>
                                    <div className="d-flex justify-content-between align-items-start">
                                        <div>
                                            <h6 className="mb-1">{availableDrafts[0].name}</h6>
                                            <small className="text-muted">
                                                {(availableDrafts[0].workout_log_exercises || availableDrafts[0].exercises || []).length} exercises •
                                                Last modified: {availableDrafts[0].updated_at ?
                                                    new Date(availableDrafts[0].updated_at).toLocaleDateString() :
                                                    availableDrafts[0].lastModified?.toDate ?
                                                        availableDrafts[0].lastModified.toDate().toLocaleDateString() :
                                                        new Date(availableDrafts[0].lastModified).toLocaleDateString()}
                                            </small>
                                            <div className="draft-exercise-badges">
                                                {(availableDrafts[0].workout_log_exercises || availableDrafts[0].exercises || []).slice(0, 3).map((ex, idx) => {
                                                    const exerciseId = ex.exercise_id || ex.exerciseId;
                                                    const exercise = exercisesList.find(e => e.id === exerciseId);
                                                    return (
                                                        <span key={idx} className="draft-exercise-badge">
                                                            {exercise?.name || 'Unknown'}
                                                        </span>
                                                    );
                                                })}
                                                {(availableDrafts[0].workout_log_exercises || availableDrafts[0].exercises || []).length > 3 && (
                                                    <span className="draft-exercise-badge">
                                                        +{(availableDrafts[0].workout_log_exercises || availableDrafts[0].exercises || []).length - 3} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Card.Body>
                            </Card>
                        </>
                    )}
                </Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={startFresh}>
                        Start Fresh
                    </Button>
                    {availableDrafts.length > 0 && (
                        <Button
                            variant="primary"
                            onClick={() => loadDraft(availableDrafts[0])}
                            className="soft-button"
                        >
                            Resume Workout
                        </Button>
                    )}
                </Modal.Footer>
            </Modal>

            {/* Incomplete Sets Warning Modal */}
            <Modal show={showIncompleteWarningModal} onHide={() => setShowIncompleteWarningModal(false)} centered>
                <Modal.Header closeButton>
                    <Modal.Title>⚠️ Incomplete Sets Detected</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <p>
                        Some sets in your workout are not marked as complete. Are you sure you want to finish the workout?
                    </p>
                    <div className="bg-light p-3 rounded">
                        <small className="text-muted">
                            <strong>Note:</strong> Incomplete sets will be finished as skipped and won't count toward your progress tracking.
                        </small>
                    </div>
                </Modal.Body>
                <Modal.Footer>
                    <Button
                        variant="secondary"
                        onClick={() => setShowIncompleteWarningModal(false)}
                    >
                        Continue Workout
                    </Button>
                    <Button
                        variant="warning"
                        onClick={() => {
                            setShowIncompleteWarningModal(false);
                            finishWorkout();
                        }}
                        disabled={isSaving}
                    >
                        {isSaving ? (
                            <>
                                <Spinner animation="border" size="sm" className="me-2" />
                                Saving...
                            </>
                        ) : (
                            'Finish Anyway'
                        )}
                    </Button>
                </Modal.Footer>
            </Modal>
        </Container>
    );
}

export default QuickWorkout;
