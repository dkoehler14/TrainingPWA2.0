import React, { useState, useEffect } from 'react';
import { Modal, Form, Button, Alert } from 'react-bootstrap';
import { createExercise, updateExercise, checkExerciseNameExists } from '../services/exerciseService';
import { MUSCLE_GROUPS, EXERCISE_TYPES } from '../constants/exercise';
import { useAuth } from '../hooks/useAuth';

function ExerciseCreationModal({
    show,
    onHide,
    onExerciseAdded,  // Callback when exercise is successfully added
    onExerciseUpdated,    // Callback for editing (optional)
    isEditMode = false,   // Add or edit mode
    exerciseId,           // Required if isEditMode is true
    initialData          // Optional object with name, primaryMuscleGroup
}) {
    const { user, userProfile } = useAuth();
    const userRole = userProfile?.role || 'user';
    const [formData, setFormData] = useState({
        name: '',
        primary_muscle_group: '',
        exercise_type: ''
    });

    const [adminVisibility, setAdminVisibility] = useState('main'); // 'main' or 'personal'

    useEffect(() => {
        if (show) {
            if (isEditMode && initialData) {
                setFormData({
                    name: initialData.name || '',
                    primary_muscle_group: initialData?.primary_muscle_group || '',
                    exercise_type: initialData?.exercise_type || ''
                });
                if (userRole === 'admin' && initialData?.created_by) {
                    setAdminVisibility('personal');
                } else {
                    setAdminVisibility('main');
                }
            } else {
                setFormData({
                    name: '',
                    primary_muscle_group: '',
                    exercise_type: ''
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
            primary_muscle_group: '',
            exercise_type: ''
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
        if (!formData.exercise_type) {
            setValidationError('Exercise type is required.');
            return false;
        }

        // Validate primary muscle group
        if (!formData.primary_muscle_group) {
            setValidationError('Primary muscle group is required.');
            return false;
        }

        // Check for duplicate exercise name
        try {
            const nameExists = await checkExerciseNameExists(
                formData.name.trim(),
                user?.id,
                isEditMode ? exerciseId : null
            );

            if (nameExists) {
                setValidationError('An exercise with this name already exists.');
                return false;
            }
        } catch (error) {
            console.error('Error checking for duplicate exercises:', error);
            setValidationError('Error validating exercise name. Please try again.');
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
                primary_muscle_group: formData.primary_muscle_group,
                exercise_type: formData.exercise_type
            };

            // Set visibility and user association
            if (userRole === 'admin' && adminVisibility === 'main') {
                // Admin creating global exercise
                exerciseData.is_global = true;
                exerciseData.created_by = user?.id;
            } else {
                // Regular user or admin creating personal exercise
                exerciseData.is_global = false;
                exerciseData.created_by = user?.id;
            }

            let result;
            if (isEditMode) {
                result = await updateExercise(exerciseId, exerciseData);
                if (onExerciseUpdated) {
                    onExerciseUpdated(result);
                }
            } else {
                result = await createExercise(exerciseData);
                if (onExerciseAdded) {
                    onExerciseAdded({
                        ...result,
                        label: result.name,
                        value: result.id,
                    });
                }
            }

            // Reset form and close modal
            resetForm();
            onHide();
        } catch (error) {
            console.error("Error adding/updating exercise: ", error);
            setValidationError(error.message || "Failed to add/update exercise. Please try again.");
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
                            value={formData.exercise_type}
                            onChange={e => setFormData({ ...formData, exercise_type: e.target.value })}
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
                            value={formData.primary_muscle_group}
                            onChange={e => setFormData({ ...formData, primary_muscle_group: e.target.value })}
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
