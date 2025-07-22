import React, { useState } from 'react';
import { Row, Col, Form, Button, ButtonGroup, Badge } from 'react-bootstrap';
import { PencilSquare, Globe, Person } from 'react-bootstrap-icons';
import ExerciseSourceBadge from './ExerciseSourceBadge';
import '../styles/ExerciseGrid.css';

// Constants for filtering
const MUSCLE_GROUPS = [
    'Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders',
    'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves',
    'Traps', 'Forearms'
];

const EXERCISE_TYPES = [
    'Dumbbell', 'Barbell', 'Cable', 'Trap Bar', 'Safety Squat Bar',
    'Bodyweight', 'Bodyweight Loadable', 'Kettlebell', 'Swiss Bar',
    'Machine', 'Smith Machine', 'Camber Bar', 'Bands'
];

const SOURCE_FILTERS = [
    { value: 'all', label: 'All Sources', icon: null },
    { value: 'global', label: 'Global Only', icon: Globe },
    { value: 'custom', label: 'Custom Only', icon: Person }
];

const ExerciseGrid = ({
    exercises,
    onExerciseClick,
    showEditButton = false,
    onEditClick = null,
    emptyMessage = "No exercises found.",
    className = "",
    initialTypeFilter = '',
    initialMuscleFilter = '',
    initialSearchTerm = '',
    initialSourceFilter = 'all'
}) => {
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
    const [typeFilter, setTypeFilter] = useState(initialTypeFilter);
    const [muscleFilter, setMuscleFilter] = useState(initialMuscleFilter);
    const [sourceFilter, setSourceFilter] = useState(initialSourceFilter);
    const [sortOption, setSortOption] = useState('name-asc');
    const [showAdvancedFilters] = useState(true);

    // Enhanced filtering and sorting logic
    const filteredExercises = exercises
        .filter(ex => {
            // Source filter
            if (sourceFilter === 'global' && !ex.isGlobal) return false;
            if (sourceFilter === 'custom' && ex.isGlobal) return false;
            return true;
        })
        .filter(ex => !typeFilter || ex.exerciseType === typeFilter)
        .filter(ex => !muscleFilter || ex.primaryMuscleGroup === muscleFilter)
        .filter(ex => ex.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .sort((a, b) => {
            if (sortOption === 'name-asc') return a.name.localeCompare(b.name);
            if (sortOption === 'name-desc') return b.name.localeCompare(a.name);
            if (sortOption === 'muscle') return a.primaryMuscleGroup.localeCompare(b.primaryMuscleGroup);
            if (sortOption === 'type') return a.exerciseType.localeCompare(b.exerciseType);
            if (sortOption === 'source-global-first') {
                if (a.isGlobal && !b.isGlobal) return -1;
                if (!a.isGlobal && b.isGlobal) return 1;
                return a.name.localeCompare(b.name);
            }
            if (sortOption === 'source-custom-first') {
                if (!a.isGlobal && b.isGlobal) return -1;
                if (a.isGlobal && !b.isGlobal) return 1;
                return a.name.localeCompare(b.name);
            }
            return 0;
        });

    // Statistics for display
    const stats = {
        total: exercises.length,
        filtered: filteredExercises.length,
        global: exercises.filter(ex => ex.isGlobal).length,
        custom: exercises.filter(ex => !ex.isGlobal).length,
        globalFiltered: filteredExercises.filter(ex => ex.isGlobal).length,
        customFiltered: filteredExercises.filter(ex => !ex.isGlobal).length
    };

    const clearAllFilters = () => {
        setSearchTerm('');
        setTypeFilter('');
        setMuscleFilter('');
        setSourceFilter('all');
        setSortOption('name-asc');
    };

    const hasActiveFilters = searchTerm || typeFilter || muscleFilter || sourceFilter !== 'all';

    return (
        <div className={className}>
            {/* Search Bar */}
            <Form.Control
                type="text"
                placeholder="Search exercises..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="soft-input mb-3"
            />

            {/* Source Filter Buttons */}
            <div className="mb-3">
                <ButtonGroup className="w-100 mb-2">
                    {SOURCE_FILTERS.map(filter => {
                        const IconComponent = filter.icon;
                        const isActive = sourceFilter === filter.value;
                        return (
                            <Button
                                key={filter.value}
                                variant={isActive ? 'primary' : 'outline-secondary'}
                                onClick={() => setSourceFilter(filter.value)}
                                className="d-flex align-items-center justify-content-center"
                            >
                                {IconComponent && <IconComponent className="me-1" size={14} />}
                                {filter.label}
                            </Button>
                        );
                    })}
                </ButtonGroup>
                {/* <div className="d-flex justify-content-between align-items-center mb-2">
                    <small className="text-muted fw-bold">FILTER BY SOURCE</small>
                    <Button
                        variant="link"
                        size="sm"
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        className="p-0 text-decoration-none"
                    >
                        <FunnelFill className="me-1" size={12} />
                        {showAdvancedFilters ? 'Hide' : 'Show'} Advanced
                    </Button>
                </div> */}
            </div>

            {/* Advanced Filters */}
            {showAdvancedFilters && (
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
                            <option value="source-global-first">Global First</option>
                            <option value="source-custom-first">Custom First</option>
                        </Form.Select>
                    </Col>
                </Row>
            )}

            {/* Results Summary and Clear Filters */}
            <div className="mb-3 d-flex justify-content-between align-items-center">
                <div className="d-flex flex-wrap gap-2 align-items-center">
                    <span className="text-muted">
                        Showing {stats.filtered} of {stats.total} exercises
                    </span>
                    {sourceFilter !== 'all' && (
                        <Badge bg={sourceFilter === 'global' ? 'primary' : 'success'}>
                            {sourceFilter === 'global' ? stats.globalFiltered : stats.customFiltered} {sourceFilter}
                        </Badge>
                    )}
                    {sourceFilter === 'all' && (
                        <>
                            <Badge bg="primary">{stats.globalFiltered} global</Badge>
                            <Badge bg="success">{stats.customFiltered} custom</Badge>
                        </>
                    )}
                </div>
                {hasActiveFilters && (
                    <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={clearAllFilters}
                    >
                        Clear Filters
                    </Button>
                )}
            </div>

            {/* Exercise Grid */}
            {filteredExercises.length === 0 && (
                <p className="text-muted text-center my-5">{emptyMessage}</p>
            )}

            <Row>
                {filteredExercises.map(ex => (
                    <Col xs={12} md={6} lg={4} key={ex.id} className="mb-3">
                        <div
                            className={`p-3 border rounded exercise-card h-100 d-flex flex-column ${ex.isGlobal ? 'exercise-card-global' : 'exercise-card-custom'}`}
                            style={{
                                cursor: onExerciseClick ? 'pointer' : 'default',
                                backgroundColor: '#f8f9fa',
                                transition: 'all 0.2s',
                                position: 'relative',
                                borderLeft: `4px solid ${ex.isGlobal ? 'var(--primary-color, #007bff)' : 'var(--success-color, #28a745)'}`
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
                            {/* Source icon in top left corner */}
                            <div
                                className="position-absolute"
                                style={{ top: '8px', left: '8px', zIndex: 5 }}
                                title={ex.isGlobal ? 'Global Exercise' : 'Custom Exercise'}
                            >
                                {ex.isGlobal ? (
                                    <Globe
                                        size={16}
                                        className="text-primary"
                                        style={{ opacity: 0.7 }}
                                    />
                                ) : (
                                    <Person
                                        size={16}
                                        className="text-success"
                                        style={{ opacity: 0.7 }}
                                    />
                                )}
                            </div>

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

                            <div className={showEditButton ? 'pe-5 ps-4' : 'ps-4'}>
                                <div className="fw-bold mb-2 text-truncate" title={ex.name}>
                                    {ex.name}
                                </div>

                                <div className="mt-auto">
                                    <div className="d-flex flex-wrap gap-1 mb-2">
                                        <ExerciseSourceBadge
                                            isGlobal={ex.isGlobal}
                                            size="sm"
                                            showIcon={true}
                                            showText={true}
                                        />
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