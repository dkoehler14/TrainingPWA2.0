import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Table, Spinner, Modal, Card } from 'react-bootstrap';
import { Plus, X, BarChart, Pencil } from 'react-bootstrap-icons';
import { db, auth } from '../firebase';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { useNumberInput } from '../hooks/useNumberInput.js';
import '../styles/LogWorkout.css';
import { debounce } from 'lodash';
import { getAllExercisesMetadata, getDocCached, getCollectionCached } from '../api/enhancedFirestoreCache';
import ExerciseGrid from '../components/ExerciseGrid';
import ExerciseHistoryModal from '../components/ExerciseHistoryModal';

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

    useEffect(() => {
        const fetchExercises = async () => {
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
                } catch (error) {
                    console.error('Error fetching exercises:', error);
                    showUserMessage('Failed to load exercises', 'error');
                } finally {
                    setIsLoading(false);
                }
            }
        };
        fetchExercises();
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
                isWorkoutFinished: true
            };

            await addDoc(collection(db, "workoutLogs"), workoutData);
            showUserMessage('Quick workout saved successfully!', 'success');

            // Reset form
            setSelectedExercises([]);
            setWorkoutName('');
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

            {/* Header */}
            <Row className="mb-4">
                <Col>
                    <h1 className="soft-title">Quick Workout</h1>
                    <p className="soft-text">Create a one-off workout without needing a program</p>
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
                            onChange={(e) => setWorkoutName(e.target.value)}
                        />
                    </Form.Group>
                </Col>
            </Row>

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
                                            >
                                                <Pencil />
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
                                    <Card.Body>
                                        <Row className="mb-3">
                                            <Col xs={4} md={2}>
                                                <Form.Group>
                                                    <Form.Label>Sets</Form.Label>
                                                    <Form.Control
                                                        type="number"
                                                        min="1"
                                                        max="20"
                                                        value={exercise.sets}
                                                        onChange={(e) => updateExerciseData(exerciseIndex, 'sets', null, e.target.value)}
                                                        className="soft-input"
                                                        style={{ width: '70px' }}
                                                    />
                                                </Form.Group>
                                            </Col>
                                        </Row>

                                        <Table responsive className="workout-log-table">
                                            <thead>
                                                <tr>
                                                    <th>Set</th>
                                                    <th>Reps</th>
                                                    <th>Weight</th>
                                                    <th>✓</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Array.from({ length: exercise.sets }, (_, setIndex) => (
                                                    <tr key={setIndex}>
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
                                    </Card.Body>
                                </Card>
                            );
                        })}
                    </Col>
                </Row>
            )}

            {/* Save Workout Button */}
            {selectedExercises.length > 0 && (
                <Row className="mb-4">
                    <Col>
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
                    <Modal.Title>Exercise Notes</Modal.Title>
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
        </Container>
    );
}

export default QuickWorkout;