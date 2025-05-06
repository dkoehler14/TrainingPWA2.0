import React, { useState } from 'react';
import { Row, Col, Dropdown } from 'react-bootstrap';
import { CheckCircleFill, Circle, ThreeDotsVertical } from 'react-bootstrap-icons';
import '../styles/WorkoutDaySelector.css';

const WorkoutDaySelector = ({
    program,
    selectedWeek,
    selectedDay,
    setSelectedWeek,
    setSelectedDay,
    completedWorkouts = {},
    exercisesList = []
}) => {
    const [showDropdown, setShowDropdown] = useState(false);

    if (!program) return null;

    // Helper to get the main focus of a day's workout (e.g., "Upper", "Lower", etc.)
    const getDayFocus = (weekIndex, dayIndex) => {
        if (!program?.weeklyConfigs?.[weekIndex]?.[dayIndex]?.exercises) return '';

        // Get primary muscle groups from the first 2-3 exercises
        const exercises = program.weeklyConfigs[weekIndex][dayIndex].exercises;
        const muscleGroups = new Set();

        exercises.slice(0, 3).forEach(ex => {
            const exercise = exercisesList.find(e => e.id === ex.exerciseId);
            if (exercise?.primaryMuscleGroup) {
                muscleGroups.add(exercise.primaryMuscleGroup);
            }
        });

        // If we have multiple muscle groups, return a general category
        if (muscleGroups.size > 1) {
            const groups = Array.from(muscleGroups);
            if (groups.some(g => ['Chest', 'Shoulders', 'Triceps'].includes(g)) &&
                !groups.some(g => ['Quads', 'Hamstrings', 'Glutes'].includes(g))) {
                return 'Upper';
            } else if (groups.some(g => ['Quads', 'Hamstrings', 'Glutes'].includes(g)) &&
                !groups.some(g => ['Chest', 'Shoulders', 'Triceps'].includes(g))) {
                return 'Lower';
            } else {
                return 'Full Body';
            }
        }

        return muscleGroups.size ? Array.from(muscleGroups)[0] : '';
    };

    // Check if a day is completed
    const isDayCompleted = (weekIndex, dayIndex) => {
        return completedWorkouts[`${weekIndex}_${dayIndex}`] === true;
    };

    const handleSelect = (weekIndex, dayIndex) => {
        setSelectedWeek(weekIndex);
        setSelectedDay(dayIndex);
        setShowDropdown(false);
    };

    return (
        <div className="workout-selector mb-4">
            <div className="current-workout-display d-flex justify-content-between align-items-center p-3 border-bottom">
                <div>
                    <h5 className="mb-1">Week {selectedWeek + 1} / Day {selectedDay + 1}</h5>
                    <small className="text-muted">
                        {getDayFocus(selectedWeek, selectedDay) || 'Workout Day'}
                    </small>
                </div>
                <Dropdown show={showDropdown} onToggle={(isOpen) => setShowDropdown(isOpen)}>
                    <Dropdown.Toggle variant="link" className="btn-icon">
                        <ThreeDotsVertical size={24} />
                    </Dropdown.Toggle>

                    <Dropdown.Menu className="workout-dropdown">
                        {Array.from({ length: program.duration }).map((_, weekIndex) => (
                            <div key={weekIndex} className="week-section">
                                <div className="week-header px-3 py-2">
                                    Week {weekIndex + 1}
                                </div>
                                {Array.from({ length: program.daysPerWeek }).map((_, dayIndex) => {
                                    const isCompleted = isDayCompleted(weekIndex, dayIndex);
                                    const isSelected = selectedWeek === weekIndex && selectedDay === dayIndex;
                                    
                                    return (
                                        <Dropdown.Item 
                                            key={`${weekIndex}-${dayIndex}`}
                                            onClick={() => handleSelect(weekIndex, dayIndex)}
                                            className={`day-item d-flex justify-content-between align-items-center ${isSelected ? 'active' : ''}`}
                                        >
                                            <span>Day {dayIndex + 1}</span>
                                            {isCompleted && <CheckCircleFill className="text-success" />}
                                        </Dropdown.Item>
                                    );
                                })}
                            </div>
                        ))}
                    </Dropdown.Menu>
                </Dropdown>
            </div>
        </div>
    );
};

export default WorkoutDaySelector;