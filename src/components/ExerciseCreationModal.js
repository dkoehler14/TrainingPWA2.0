import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Alert, InputGroup } from 'react-bootstrap';
import { Trash } from 'react-bootstrap-icons';
import { db } from '../firebase';
import { collection, addDoc, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';

const MUSCLE_GROUPS = [
    'Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders',
    'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves',
    'Traps', 'Forearms'
];

function ExerciseCreationModal({
    show,
    onHide,
    onExerciseAdded,  // Callback when exercise is successfully added
    onExerciseUpdated,    // Callback for editing (optional)
    isEditMode = false,   // Add or edit mode
    exerciseId,           // Required if isEditMode is true
    initialData,          // Optional object with name, primaryMuscleGroup, secondaryMuscleGroups
}) {
    const [formData, setFormData] = useState({
        name: '',
        primaryMuscleGroup: '',
        secondaryMuscleGroups: [{ group: '' }]
    });

    useEffect(() => {
        if (show) {
            if (isEditMode && initialData) {
                const secondaryGroups = initialData.secondaryMuscleGroups?.length > 0
                    ? initialData.secondaryMuscleGroups.map(group => ({ group }))
                    : [{ group: '' }];
                setFormData({
                    name: initialData.name || '',
                    primaryMuscleGroup: initialData?.primaryMuscleGroup || '',
                    secondaryMuscleGroups: secondaryGroups
                });
            } else {
                setFormData({
                    name: '',
                    primaryMuscleGroup: '',
                    secondaryMuscleGroups: [{ group: '' }]
                });
            }
        }
    }, [show, isEditMode, initialData]);

    const [validationError, setValidationError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const resetForm = () => {
        setFormData({
            name: '',
            primaryMuscleGroup: '',
            secondaryMuscleGroups: [{ group: '' }]
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

        // Check for duplicate exercise name
        let exerciseQuery;
        if (isEditMode) {
            exerciseQuery = query(collection(db, "exercises"), where("name", "==", formData.name.trim()), where("__name__", "!=", exerciseId));
        } else {
            exerciseQuery = query(collection(db, "exercises"), where("name", "==", formData.name.trim()));
        }
        const querySnapshot = await getDocs(exerciseQuery);

        if (!querySnapshot.empty) {
            setValidationError('An exercise with this name already exists.');
            return false;
        }

        // Validate primary muscle group
        if (!formData.primaryMuscleGroup) {
            setValidationError('Primary muscle group is required.');
            return false;
        }

        // Validate secondary muscle groups
        const validSecondaryGroups = formData.secondaryMuscleGroups
            .map(mg => mg.group)
            .filter(Boolean);

        // Prevent duplicate muscle groups
        const uniqueSecondaryGroups = [...new Set(validSecondaryGroups)];
        if (validSecondaryGroups.length !== uniqueSecondaryGroups.length) {
            setValidationError('Remove duplicate secondary muscle groups.');
            return false;
        }

        // Prevent primary muscle group from being a secondary muscle group
        if (validSecondaryGroups.includes(formData.primaryMuscleGroup)) {
            setValidationError('Primary muscle group cannot be a secondary muscle group.');
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
                secondaryMuscleGroups: formData.secondaryMuscleGroups
                    .map(mg => mg.group)
                    .filter(Boolean),
            };

            if (isEditMode) {
                // Update in Firestore
                const exerciseRef = doc(db, "exercises", exerciseId);
                await updateDoc(exerciseRef, exerciseData);
                if (onExerciseUpdated) {
                    onExerciseUpdated({ id: exerciseId, ...exerciseData });
                }
            } else {
                // Add to Firestore
                const docRef = await addDoc(collection(db, "exercises"), exerciseData);
                // Call the callback with the new exercise data
                if (onExerciseAdded) {
                    onExerciseAdded({
                        id: docRef.id,
                        ...exerciseData,
                        label: exerciseData.name,
                        value: docRef.id,
                    });
                }
            }

            // Reset form and close modal
            resetForm();
            onHide();
        } catch (error) {
            console.error("Error adding exercise: ", error);
            setValidationError("Failed to add exercise. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const addSecondaryMuscleGroup = () => {
        if (formData.secondaryMuscleGroups.length < MUSCLE_GROUPS.length - 1) {
            setFormData({
                ...formData,
                secondaryMuscleGroups: [...formData.secondaryMuscleGroups, { group: '' }]
            });
        }
    };

    const handleSecondaryMuscleGroupChange = (index, value) => {
        const updated = [...formData.secondaryMuscleGroups];
        updated[index] = { group: value };

        setFormData({
            ...formData,
            secondaryMuscleGroups: updated
        });
    };

    const removeSecondaryMuscleGroup = (index) => {
        const updated = [...formData.secondaryMuscleGroups];
        updated.splice(index, 1);

        setFormData({
            ...formData,
            secondaryMuscleGroups: updated
        });
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
                        />
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

                    <Form.Label>Secondary Muscle Groups</Form.Label>
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
                    ))}
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