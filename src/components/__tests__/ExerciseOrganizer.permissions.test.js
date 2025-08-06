import React from 'react';
import { render, screen } from '@testing-library/react';
import ExerciseOrganizer from '../ExerciseOrganizer';

// Mock ExerciseGrid to verify props are passed correctly
jest.mock('../ExerciseGrid', () => {
  return function MockExerciseGrid({ userRole, exercises, showEditButton, onEditClick }) {
    return (
      <div data-testid="exercise-grid">
        <span data-testid="user-role">{userRole}</span>
        <span data-testid="exercise-count">{exercises.length}</span>
        <span data-testid="show-edit-button">{showEditButton.toString()}</span>
        <span data-testid="has-edit-handler">{!!onEditClick ? 'true' : 'false'}</span>
      </div>
    );
  };
});

describe('ExerciseOrganizer Role Passing', () => {
  const mockExercises = [
    {
      id: '1',
      name: 'Push Up',
      isGlobal: true,
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Bodyweight'
    },
    {
      id: '2',
      name: 'Custom Exercise',
      isGlobal: false,
      primaryMuscleGroup: 'Arms',
      exerciseType: 'Dumbbell'
    }
  ];

  const mockEditClick = jest.fn();

  it('should pass admin userRole to ExerciseGrid', () => {
    render(
      <ExerciseOrganizer
        exercises={mockExercises}
        userRole="admin"
        showEditButton={true}
        onEditClick={mockEditClick}
      />
    );

    expect(screen.getByTestId('user-role')).toHaveTextContent('admin');
    expect(screen.getByTestId('exercise-count')).toHaveTextContent('2');
    expect(screen.getByTestId('show-edit-button')).toHaveTextContent('true');
    expect(screen.getByTestId('has-edit-handler')).toHaveTextContent('true');
  });

  it('should pass regular user userRole to ExerciseGrid', () => {
    render(
      <ExerciseOrganizer
        exercises={mockExercises}
        userRole="user"
        showEditButton={true}
        onEditClick={mockEditClick}
      />
    );

    expect(screen.getByTestId('user-role')).toHaveTextContent('user');
  });

  it('should default to user role when no userRole prop provided', () => {
    render(
      <ExerciseOrganizer
        exercises={mockExercises}
        showEditButton={true}
        onEditClick={mockEditClick}
      />
    );

    expect(screen.getByTestId('user-role')).toHaveTextContent('user');
  });

  it('should show stats button only for admin users', () => {
    const { rerender } = render(
      <ExerciseOrganizer
        exercises={mockExercises}
        userRole="admin"
      />
    );

    // Admin should see stats button
    expect(screen.getByText('Stats')).toBeInTheDocument();

    // Regular user should not see stats button
    rerender(
      <ExerciseOrganizer
        exercises={mockExercises}
        userRole="user"
      />
    );

    expect(screen.queryByText('Stats')).not.toBeInTheDocument();
  });

  it('should pass all required props to ExerciseGrid in default grid view', () => {
    render(
      <ExerciseOrganizer
        exercises={mockExercises}
        userRole="admin"
        showEditButton={true}
        onEditClick={mockEditClick}
      />
    );

    // Should have one ExerciseGrid component in default grid view
    const exerciseGrids = screen.getAllByTestId('exercise-grid');
    expect(exerciseGrids).toHaveLength(1); // One grid showing all exercises

    // Grid should have admin role
    const roleSpan = exerciseGrids[0].querySelector('[data-testid="user-role"]');
    expect(roleSpan).toHaveTextContent('admin');
    
    // Should show all exercises
    const exerciseCount = exerciseGrids[0].querySelector('[data-testid="exercise-count"]');
    expect(exerciseCount).toHaveTextContent('2');
  });
});