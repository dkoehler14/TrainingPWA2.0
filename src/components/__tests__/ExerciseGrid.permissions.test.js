import React from 'react';
import { render, screen } from '@testing-library/react';
import ExerciseGrid from '../ExerciseGrid';

// Mock data
const mockExercises = [
    {
        id: '1',
        name: 'Global Exercise',
        isGlobal: true,
        primaryMuscleGroup: 'Chest',
        exerciseType: 'Compound'
    },
    {
        id: '2',
        name: 'Custom Exercise',
        isGlobal: false,
        primaryMuscleGroup: 'Arms',
        exerciseType: 'Isolation'
    }
];

const mockOnEditClick = jest.fn();

describe('ExerciseGrid Permissions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('admin user can see edit buttons for global exercises', () => {
        render(
            <ExerciseGrid
                exercises={mockExercises}
                showEditButton={true}
                onEditClick={mockOnEditClick}
                userRole="admin"
            />
        );

        // Admin should see edit buttons for both exercises (look for buttons with edit icon class)
        const editButtons = document.querySelectorAll('.exercises-edit-button');
        expect(editButtons).toHaveLength(2);
    });

    test('non-admin user cannot see edit buttons for global exercises', () => {
        render(
            <ExerciseGrid
                exercises={mockExercises}
                showEditButton={true}
                onEditClick={mockOnEditClick}
                userRole="user"
            />
        );

        // Non-admin should only see edit button for custom exercise
        const editButtons = document.querySelectorAll('.exercises-edit-button');
        expect(editButtons).toHaveLength(1);
    });

    test('non-admin user sees read-only indicator for global exercises', () => {
        render(
            <ExerciseGrid
                exercises={mockExercises}
                showEditButton={true}
                onEditClick={mockOnEditClick}
                userRole="user"
            />
        );

        // Should see read-only indicator
        const readOnlyIndicator = screen.getByTitle('Admin-only exercise - read only');
        expect(readOnlyIndicator).toBeInTheDocument();
        expect(readOnlyIndicator).toHaveTextContent('RO');
    });

    test('admin user does not see read-only indicators', () => {
        render(
            <ExerciseGrid
                exercises={mockExercises}
                showEditButton={true}
                onEditClick={mockOnEditClick}
                userRole="admin"
            />
        );

        // Should not see any read-only indicators
        const readOnlyIndicator = screen.queryByTitle('Admin-only exercise - read only');
        expect(readOnlyIndicator).not.toBeInTheDocument();
    });

    test('custom exercises always show edit buttons regardless of user role', () => {
        const customExercises = [mockExercises[1]]; // Only custom exercise

        render(
            <ExerciseGrid
                exercises={customExercises}
                showEditButton={true}
                onEditClick={mockOnEditClick}
                userRole="user"
            />
        );

        const editButtons = document.querySelectorAll('.exercises-edit-button');
        expect(editButtons).toHaveLength(1);
    });
});