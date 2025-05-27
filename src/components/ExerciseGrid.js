import React, { useState } from 'react';
import { Row, Col, Form, Button } from 'react-bootstrap';
import { PencilSquare } from 'react-bootstrap-icons';

// Constants for filtering
const MUSCLE_GROUPS = [
    'Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders',
    'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves',
    'Traps', 'Forearms'
];

const EXERCISE_TYPES = [
    'Dumbbell', 'Barbell', 'Cable', 'Trap Bar', 'Safety Squat Bar',
    'Bodyweight Only', 'Bodyweight Loadable', 'Kettlebell', 'Swiss Bar',
    'Machine', 'Smith Machine', 'Camber Bar'
];

const ExerciseGrid = ({
    exercises,
    onExerciseClick,
    showEditButton = false,
    onEditClick = null,
    emptyMessage = "No exercises found.",
    className = ""
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [muscleFilter, setMuscleFilter] = useState('');
    const [sortOption, setSortOption] = useState('name-asc');

    // Filtering and sorting logic
    const filteredExercises = exercises
        .filter(ex => !typeFilter || ex.exerciseType === typeFilter)
        .filter(ex => !muscleFilter || ex.primaryMuscleGroup === muscleFilter)
        .filter(ex => ex.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (sortOption === 'name-asc') return a.name.localeCompare(b.name);
            if (sortOption === 'name-desc') return b.name.localeCompare(a.name);
            if (sortOption === 'muscle') return a.primaryMuscleGroup.localeCompare(b.primaryMuscleGroup);
            if (sortOption === 'type') return a.exerciseType.localeCompare(b.exerciseType);
            return 0;
        });

    return (
        <div className={className}>
            {/* Search and Filter Controls */}
            <Form.Control
                type="text"
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="soft-input mb-3"
            />

            <Row className="mb-3">
                <Col md={4} className="mb-2">
                    <Form.Select
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value)}
                        className="soft-input"
                    >
                        <option value="">All Types</option>
                        {EXERCISE_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </Form.Select>
                </Col>
                <Col md={4} className="mb-2">
                    <Form.Select
                        value={muscleFilter}
                        onChange={e => setMuscleFilter(e.target.value)}
                        className="soft-input"
                    >
                        <option value="">All Muscle Groups</option>
                        {MUSCLE_GROUPS.map(group => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </Form.Select>
                </Col>
                <Col md={4} className="mb-2">
                    <Form.Select
                        value={sortOption}
                        onChange={e => setSortOption(e.target.value)}
                        className="soft-input"
                    >
                        <option value="name-asc">Name (A-Z)</option>
                        <option value="name-desc">Name (Z-A)</option>
                        <option value="muscle">Primary Muscle</option>
                        <option value="type">Exercise Type</option>
                    </Form.Select>
                </Col>
            </Row>

            {/* Results count */}
            <div className="mb-3 text-muted">
                Showing {filteredExercises.length} of {exercises.length} exercises
            </div>

            {/* Exercise Grid */}
            {filteredExercises.length === 0 && (
                <p className="text-muted text-center my-5">{emptyMessage}</p>
            )}

            <Row>
                {filteredExercises.map(ex => (
                    <Col xs={12} md={6} lg={4} key={ex.id} className="mb-3">
                        <div
                            className="p-3 border rounded exercise-card h-100 d-flex flex-column"
                            style={{
                                cursor: onExerciseClick ? 'pointer' : 'default',
                                backgroundColor: '#f8f9fa',
                                transition: 'all 0.2s',
                                position: 'relative'
                            }}
                            onMouseEnter={e => {
                                if (onExerciseClick) {
                                    e.currentTarget.style.backgroundColor = '#e9ecef';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (onExerciseClick) {
                                    e.currentTarget.style.backgroundColor = '#f8f9fa';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }
                            }}
                            onClick={() => onExerciseClick && onExerciseClick(ex)}
                        >
                            {/* Edit button in top right corner */}
                            {showEditButton && onEditClick && (
                                <Button
                                    variant="outline-primary"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEditClick(ex);
                                    }}
                                    className="position-absolute exercises-edit-button"
                                    style={{ top: '8px', right: '8px', zIndex: 10 }}
                                >
                                    <PencilSquare size={14} />
                                </Button>
                            )}

                            <div className={showEditButton ? 'pe-5' : ''}>
                                <div className="fw-bold mb-2 text-truncate" title={ex.name}>
                                    {ex.name}
                                </div>

                                <div className="mt-auto">
                                    <div className="d-flex flex-wrap gap-1">
                                        {ex.exerciseType && (
                                            <span className="badge bg-info text-dark">{ex.exerciseType}</span>
                                        )}
                                        {ex.primaryMuscleGroup && (
                                            <span className="badge bg-secondary">{ex.primaryMuscleGroup}</span>
                                        )}
                                    </div>

                                    {/* {ex.secondaryMuscleGroups && ex.secondaryMuscleGroups.length > 0 && (
                                        <div className="mt-2">
                                            <small className="text-muted">
                                                Secondary: {ex.secondaryMuscleGroups.join(', ')}
                                            </small>
                                        </div>
                                    )} */}
                                </div>
                            </div>
                        </div>
                    </Col>
                ))}
            </Row>
        </div>
    );
};

export default ExerciseGrid;