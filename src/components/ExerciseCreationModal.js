import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Alert } from 'react-bootstrap';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, runTransaction } from 'firebase/firestore';
import { getCollectionCached, invalidateExerciseCache } from '../api/enhancedFirestoreCache';

const MUSCLE_GROUPS = [
    'Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders',
    'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves',
    'Traps', 'Forearms'
];

const EXERCISE_TYPES = [
    'Dumbbell', 'Barbell', 'Cable', 'Trap Bar', 'Safety Squat Bar',
    'Bodyweight', 'Bodyweight Loadable', 'Swiss Bar', 'Kettlebell',
    'Machine', 'Smith Machine', 'Camber Bar', 'Bands'
];

function ExerciseCreationModal({
    show,
    onHide,
    onExerciseAdded,  // Callback when exercise is successfully added
    onExerciseUpdated,    // Callback for editing (optional)
    isEditMode = false,   // Add or edit mode
    exerciseId,           // Required if isEditMode is true
    initialData,          // Optional object with name, primaryMuscleGroup
    user,                 // The current user object
    userRole              // The current user's role
}) {
    const [formData, setFormData] = useState({
        name: '',
        primaryMuscleGroup: '',
        exerciseType: ''
    });

    const [adminVisibility, setAdminVisibility] = useState('main'); // 'main' or 'personal'

    useEffect(() => {
        if (show) {
            if (isEditMode && initialData) {
                setFormData({
                    name: initialData.name || '',
                    primaryMuscleGroup: initialData?.primaryMuscleGroup || '',
                    exerciseType: initialData?.exerciseType || ''
                });
                if (userRole === 'admin' && initialData?.userId) {
                    setAdminVisibility('personal');
                } else {
                    setAdminVisibility('main');
                }
            } else {
                setFormData({
                    name: '',
                    primaryMuscleGroup: '',
                    exerciseType: ''
                });
                setAdminVisibility('main');
            }
        }
    }, [show, isEditMode, initialData, userRole]);

    const [validationError, setValidationError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resetForm = () => {
        setFormData({
            name: '',
            primaryMuscleGroup: '',
            exerciseType: ''
        });
        setValidationError('');
    };

    const validateExercise = async () => {
        // Reset previous error message
        setValidationError('');

        // Validate exercise name
        if (!formData.name.trim()) {
            setValidationError('Exercise name is required.');
            return false;
        }

        // Validate exercise type
        if (!formData.exerciseType) {
            setValidationError('Exercise type is required.');
            return false;
        }

        // Check for duplicate exercise name using enhanced cache
        const exerciseQuery = {
            where: [['name', '==', formData.name.trim()]]
        };
        
        const existingExercises = await getCollectionCached('exercises', exerciseQuery, 60 * 60 * 1000); // 1 hour TTL
        
        // Filter out current exercise if in edit mode
        const duplicates = isEditMode
            ? existingExercises.filter(ex => ex.id !== exerciseId)
            : existingExercises;

        if (duplicates.length > 0) {
            setValidationError('An exercise with this name already exists.');
            return false;
        }

        // Validate primary muscle group
        if (!formData.primaryMuscleGroup) {
            setValidationError('Primary muscle group is required.');
            return false;
        }

        return true;
    };

    const handleSubmit = async () => {
        if (isSubmitting) return;

        try {
            // Validate before submission
            const isValid = await validateExercise();
            if (!isValid) return;

            setIsSubmitting(true);

            // Prepare exercise data
            const exerciseData = {
                name: formData.name.trim(),
                primaryMuscleGroup: formData.primaryMuscleGroup,
                exerciseType: formData.exerciseType
            };
            // Admin: set userId only if personal, not main
            if (!isEditMode && userRole === 'admin' && adminVisibility === 'personal' && user && user.uid) {
                exerciseData.userId = user.uid;
            }
            // Regular user: always set userId
            if (!isEditMode && userRole !== 'admin' && user && user.uid) {
                exerciseData.userId = user.uid;
            }

            // --- Begin Transaction for Exercise and Metadata ---
            await runTransaction(db, async (transaction) => {
                let exerciseRef;
                let newExerciseId = exerciseId;
                if (isEditMode) {
                    exerciseRef = doc(db, "exercises", exerciseId);
                    transaction.update(exerciseRef, exerciseData);
                } else {
                    exerciseRef = doc(collection(db, "exercises"));
                    transaction.set(exerciseRef, exerciseData);
                    newExerciseId = exerciseRef.id;
                }

                // --- Only update global metadata for global exercises ---
                if (!exerciseData.userId) {
                    const metadataRef = doc(db, "exercises_metadata", "all_exercises");
                    const metadataDoc = await transaction.get(metadataRef);
                    let metadata = metadataDoc.exists() ? metadataDoc.data() : { exercises: {} };
                    if (!metadata.exercises) metadata.exercises = {};
                    metadata.exercises[newExerciseId] = exerciseData;
                    metadata.lastUpdated = new Date(); // client-side timestamp
                    transaction.set(metadataRef, metadata);
                }

                // --- Per-user metadata for personal exercises ---
                if (exerciseData.userId) {
                    const userMetadataRef = doc(db, "exercises_metadata", exerciseData.userId);
                    const userMetadataDoc = await transaction.get(userMetadataRef);
                    let userMetadata = userMetadataDoc.exists() ? userMetadataDoc.data() : { exercises: {} };
                    if (!userMetadata.exercises) userMetadata.exercises = {};
                    userMetadata.exercises[newExerciseId] = exerciseData;
                    userMetadata.lastUpdated = new Date();
                    transaction.set(userMetadataRef, userMetadata);
                }
                // --- End per-user metadata ---

                // Callbacks after transaction
                if (isEditMode) {
                    if (onExerciseUpdated) {
                        onExerciseUpdated({ id: exerciseId, ...exerciseData });
                    }
                } else {
                    if (onExerciseAdded) {
                        onExerciseAdded({
                            id: newExerciseId,
                            ...exerciseData,
                            label: exerciseData.name,
                            value: newExerciseId,
                        });
                    }
                }
            });
            // --- End Transaction ---

            // Invalidate exercise cache after creation/update
            invalidateExerciseCache();

            // Reset form and close modal
            resetForm();
            onHide();
        } catch (error) {
            console.error("Error adding/updating exercise: ", error);
            setValidationError("Failed to add/update exercise. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal show={show} onHide={onHide} centered>
            <Modal.Header closeButton>
                <Modal.Title>{isEditMode ? 'Edit Exercise' : 'Add New Exercise'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                {validationError && (
                    <Alert variant="danger" onClose={() => setValidationError('')} dismissible>
                        {validationError}
                    </Alert>
                )}

                <Form>
                    <Form.Group className="mb-3">
                        <Form.Label>Exercise Name</Form.Label>
                        <Form.Control
                            type="text"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Enter exercise name"
                            className="soft-input"
                            autoFocus
                        />
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Exercise Type</Form.Label>
                        <Form.Control
                            as="select"
                            value={formData.exerciseType}
                            onChange={e => setFormData({ ...formData, exerciseType: e.target.value })}
                            className="soft-input"
                            required
                        >
                            <option value="">Select Exercise Type</option>
                            {EXERCISE_TYPES.map((type) => (
                                <option key={`type-${type}`} value={type}>{type}</option>
                            ))}
                        </Form.Control>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label>Primary Muscle Group</Form.Label>
                        <Form.Control
                            as="select"
                            value={formData.primaryMuscleGroup}
                            onChange={e => setFormData({ ...formData, primaryMuscleGroup: e.target.value })}
                            className="soft-input"
                            required
                        >
                            <option value="">Select Primary Muscle Group</option>
                            {MUSCLE_GROUPS.map((group) => (
                                <option key={`primary-${group}`} value={group}>{group}</option>
                            ))}
                        </Form.Control>
                    </Form.Group>

                    {/* <Form.Label>Secondary Muscle Groups</Form.Label>
                    {formData.secondaryMuscleGroups.map((muscleGroup, index) => (
                        <InputGroup key={`secondary-${index}`} className="mb-3">
                            <Form.Control
                                as="select"
                                value={muscleGroup.group}
                                onChange={e => handleSecondaryMuscleGroupChange(index, e.target.value)}
                                className="soft-input"
                            >
                                <option value="">Select Secondary Muscle Group</option>
                                {MUSCLE_GROUPS.map((group) => (
                                    <option key={`${group}-${index}`} value={group}>{group}</option>
                                ))}
                            </Form.Control>
                            <Button
                                variant="outline-secondary"
                                onClick={addSecondaryMuscleGroup}
                                className="soft-button"
                            >
                                +
                            </Button>
                            {index !== 0 && (
                                <Button
                                    variant="outline-danger"
                                    onClick={() => removeSecondaryMuscleGroup(index)}
                                    className="soft-button"
                                >
                                    <Trash />
                                </Button>
                            )}
                        </InputGroup>
                    ))} */}

                    {/* Admin visibility select */}
                    {userRole === 'admin' && !isEditMode && (
                        <Form.Group className="mb-3">
                            <Form.Label>Exercise Visibility</Form.Label>
                            <Form.Select
                                value={adminVisibility}
                                onChange={e => setAdminVisibility(e.target.value)}
                                className="soft-input"
                            >
                                <option value="main">Main List (Global)</option>
                                <option value="personal">Personal (Custom)</option>
                            </Form.Select>
                        </Form.Group>
                    )}
                </Form>
            </Modal.Body>
            <Modal.Footer>
                <Button variant="secondary" onClick={onHide}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (isEditMode ? 'Updating...' : 'Adding...') : (isEditMode ? 'Update Exercise' : 'Add Exercise')}
                </Button>
            </Modal.Footer>
        </Modal>
    );
}

export default ExerciseCreationModal;