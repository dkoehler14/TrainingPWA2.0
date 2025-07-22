import React, { useState } from 'react';
import { Card, Row, Col, Button, Badge, Collapse } from 'react-bootstrap';
import { ChevronDown, ChevronUp, BarChart } from 'react-bootstrap-icons';
import ExerciseGrid from './ExerciseGrid';
import '../styles/ExerciseOrganizer.css';

const ExerciseOrganizer = ({ 
    exercises, 
    onExerciseClick, 
    showEditButton = false, 
    onEditClick = null,
    className = "",
    userRole = "user"
}) => {
    const [viewMode] = useState('grid'); // 'grid', 'list', 'grouped'
    const [showStats, setShowStats] = useState(false);
    const [groupBy] = useState('source'); // 'source', 'muscle', 'type'

    // Calculate statistics
    const stats = {
        total: exercises.length,
        global: exercises.filter(ex => ex.isGlobal).length,
        custom: exercises.filter(ex => !ex.isGlobal).length,
        byMuscle: exercises.reduce((acc, ex) => {
            const muscle = ex.primaryMuscleGroup || 'Unknown';
            acc[muscle] = (acc[muscle] || 0) + 1;
            return acc;
        }, {}),
        byType: exercises.reduce((acc, ex) => {
            const type = ex.exerciseType || 'Unknown';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {})
    };

    // Group exercises based on groupBy setting
    const groupedExercises = () => {
        if (groupBy === 'source') {
            return {
                'Global Exercises': exercises.filter(ex => ex.isGlobal),
                'Custom Exercises': exercises.filter(ex => !ex.isGlobal)
            };
        } else if (groupBy === 'muscle') {
            return exercises.reduce((acc, ex) => {
                const muscle = ex.primaryMuscleGroup || 'Unknown';
                if (!acc[muscle]) acc[muscle] = [];
                acc[muscle].push(ex);
                return acc;
            }, {});
        } else if (groupBy === 'type') {
            return exercises.reduce((acc, ex) => {
                const type = ex.exerciseType || 'Unknown';
                if (!acc[type]) acc[type] = [];
                acc[type].push(ex);
                return acc;
            }, {});
        }
        return {};
    };

    const renderGroupedView = () => {
        const groups = groupedExercises();
        
        return (
            <div>
                {Object.entries(groups).map(([groupName, groupExercises]) => (
                    <Card key={groupName} className="mb-4 border-0 shadow-sm">
                        <Card.Header className="bg-light border-0 d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center">
                                <h5 className="mb-0 me-2">{groupName}</h5>
                                <Badge 
                                    bg={groupBy === 'source' && groupName.includes('Global') ? 'primary' : 
                                        groupBy === 'source' && groupName.includes('Custom') ? 'success' : 'secondary'}
                                >
                                    {groupExercises.length}
                                </Badge>
                            </div>
                        </Card.Header>
                        <Card.Body>
                            <ExerciseGrid
                                exercises={groupExercises}
                                onExerciseClick={onExerciseClick}
                                showEditButton={showEditButton}
                                onEditClick={onEditClick}
                                emptyMessage={`No ${groupName.toLowerCase()} found.`}
                            />
                        </Card.Body>
                    </Card>
                ))}
            </div>
        );
    };

    const renderListView = () => {
        return (
            <div className="list-group">
                {exercises.map(ex => (
                    <div 
                        key={ex.id}
                        className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${ex.isGlobal ? 'border-start border-primary border-3' : 'border-start border-success border-3'}`}
                        onClick={() => onExerciseClick && onExerciseClick(ex)}
                        style={{ cursor: onExerciseClick ? 'pointer' : 'default' }}
                    >
                        <div className="d-flex align-items-center">
                            <div className="me-3">
                                <div className="fw-bold">{ex.name}</div>
                                <small className="text-muted">
                                    {ex.primaryMuscleGroup} • {ex.exerciseType}
                                </small>
                            </div>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <Badge bg={ex.isGlobal ? 'primary' : 'success'}>
                                {ex.isGlobal ? 'Global' : 'Custom'}
                            </Badge>
                            {showEditButton && onEditClick && (
                                <Button
                                    variant="outline-primary"
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onEditClick(ex);
                                    }}
                                >
                                    Edit
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderStatsPanel = () => {
        return (
            <Collapse in={showStats}>
                <Card className="mb-4 border-0 shadow-sm">
                    <Card.Body>
                        <Row>
                            <Col md={4}>
                                <h6 className="text-muted mb-3">Exercise Sources</h6>
                                <div className="d-flex justify-content-between mb-2">
                                    <span>Global:</span>
                                    <Badge bg="primary">{stats.global}</Badge>
                                </div>
                                <div className="d-flex justify-content-between mb-2">
                                    <span>Custom:</span>
                                    <Badge bg="success">{stats.custom}</Badge>
                                </div>
                                <div className="d-flex justify-content-between last">
                                    <strong>Total:</strong>
                                    <Badge bg="secondary">{stats.total}</Badge>
                                </div>
                            </Col>
                            <Col md={4}>
                                <h6 className="text-muted mb-3">By Muscle Group</h6>
                                {Object.entries(stats.byMuscle)
                                    .sort(([,a], [,b]) => b - a)
                                    .slice(0, 5)
                                    .map(([muscle, count]) => (
                                        <div key={muscle} className="d-flex justify-content-between mb-1">
                                            <small>{muscle}:</small>
                                            <Badge bg="info" className="badge-sm">{count}</Badge>
                                        </div>
                                    ))}
                            </Col>
                            <Col md={4}>
                                <h6 className="text-muted mb-3">By Exercise Type</h6>
                                {Object.entries(stats.byType)
                                    .sort(([,a], [,b]) => b - a)
                                    .slice(0, 5)
                                    .map(([type, count]) => (
                                        <div key={type} className="d-flex justify-content-between mb-1">
                                            <small>{type}:</small>
                                            <Badge bg="warning" className="badge-sm">{count}</Badge>
                                        </div>
                                    ))}
                            </Col>
                        </Row>
                    </Card.Body>
                </Card>
            </Collapse>
        );
    };

    return (
        <div className={`exercises-organizer${className ? ` ${className}` : ''}`}>
            {/* View Controls */}
            <div className="d-flex justify-content-between align-items-center mb-3">
                {/* <div className="d-flex gap-2">
                    <ButtonGroup>
                        <Button
                            variant={viewMode === 'grid' ? 'primary' : 'outline-secondary'}
                            onClick={() => setViewMode('grid')}
                            size="sm"
                        >
                            <Grid3x3Gap className="me-1" size={14} />
                            Grid
                        </Button>
                        <Button
                            variant={viewMode === 'list' ? 'primary' : 'outline-secondary'}
                            onClick={() => setViewMode('list')}
                            size="sm"
                        >
                            <List className="me-1" size={14} />
                            List
                        </Button>
                        <Button
                            variant={viewMode === 'grouped' ? 'primary' : 'outline-secondary'}
                            onClick={() => setViewMode('grouped')}
                            size="sm"
                        >
                            <Grid3x3Gap className="me-1" size={14} />
                            Grouped
                        </Button>
                    </ButtonGroup>

                    {viewMode === 'grouped' && (
                        <ButtonGroup>
                            <Button
                                variant={groupBy === 'source' ? 'info' : 'outline-info'}
                                onClick={() => setGroupBy('source')}
                                size="sm"
                            >
                                Source
                            </Button>
                            <Button
                                variant={groupBy === 'muscle' ? 'info' : 'outline-info'}
                                onClick={() => setGroupBy('muscle')}
                                size="sm"
                            >
                                Muscle
                            </Button>
                            <Button
                                variant={groupBy === 'type' ? 'info' : 'outline-info'}
                                onClick={() => setGroupBy('type')}
                                size="sm"
                            >
                                Type
                            </Button>
                        </ButtonGroup>
                    )}
                </div> */}

                {userRole === 'admin' && (
                    <Button
                        variant="outline-secondary"
                        size="sm"
                        onClick={() => setShowStats(!showStats)}
                    >
                        <BarChart className="me-1" size={14} />
                        Stats
                        {showStats ? <ChevronUp className="ms-1" size={12} /> : <ChevronDown className="ms-1" size={12} />}
                    </Button>
                )}
            </div>

            {/* Statistics Panel */}
            {userRole === 'admin' && renderStatsPanel()}

            {/* Exercise Display */}
            {viewMode === 'grid' && (
                <ExerciseGrid
                    exercises={exercises}
                    onExerciseClick={onExerciseClick}
                    showEditButton={showEditButton}
                    onEditClick={onEditClick}
                />
            )}

            {viewMode === 'list' && renderListView()}

            {viewMode === 'grouped' && renderGroupedView()}
        </div>
    );
};

export default ExerciseOrganizer;