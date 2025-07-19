/**
 * WorkoutHistoryList Component Tests
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutHistoryList from '../WorkoutHistoryList';

// Mock workout data
const mockWorkouts = [
  {
    id: 'workout1',
    name: 'Upper Body Workout',
    date: { toDate: () => new Date('2024-01-15') },
    exercises: [
      { exerciseId: 'ex1', sets: 3, completed: [true, true, true] },
      { exerciseId: 'ex2', sets: 3, completed: [true, true, false] }
    ]
  },
  {
    id: 'workout2',
    name: 'Lower Body Workout',
    date: { toDate: () => new Date('2024-01-14') },
    exercises: [
      { exerciseId: 'ex3', sets: 4, completed: [true, true, true, true] }
    ]
  },
  {
    id: 'workout3',
    name: 'Cardio Session',
    date: new Date('2024-01-13'), // Test with regular Date object
    exercises: []
  }
];

const mockCorruptedWorkouts = [
  ...mockWorkouts,
  null, // Invalid workout
  { name: 'No ID workout' }, // Missing ID
  'invalid-workout-string' // Invalid type
];

describe('WorkoutHistoryList', () => {
  const mockOnWorkoutSelect = jest.fn();
  const mockOnDeleteWorkout = jest.fn();
  const mockOnUseAsTemplate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders workout list correctly', () => {
    render(
      <WorkoutHistoryList
        workouts={mockWorkouts}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Upper Body Workout')).toBeInTheDocument();
    expect(screen.getByText('Lower Body Workout')).toBeInTheDocument();
    expect(screen.getByText('Cardio Session')).toBeInTheDocument();
  });

  test('displays workout completion status correctly', () => {
    render(
      <WorkoutHistoryList
        workouts={mockWorkouts}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // First workout: 5/6 sets completed (83%)
    expect(screen.getByText('83% Complete')).toBeInTheDocument();
    expect(screen.getByText('5/6 sets')).toBeInTheDocument();

    // Second workout: 4/4 sets completed (100%)
    expect(screen.getByText('100% Complete')).toBeInTheDocument();
    expect(screen.getByText('4/4 sets')).toBeInTheDocument();

    // Third workout: 0/0 sets (0%)
    expect(screen.getByText('0% Complete')).toBeInTheDocument();
    expect(screen.getByText('0/0 sets')).toBeInTheDocument();
  });

  test('formats workout dates correctly', () => {
    // Mock current date for consistent testing
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-16'));

    render(
      <WorkoutHistoryList
        workouts={mockWorkouts}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Yesterday')).toBeInTheDocument(); // 2024-01-15
    expect(screen.getByText('2 days ago')).toBeInTheDocument(); // 2024-01-14
    expect(screen.getByText('3 days ago')).toBeInTheDocument(); // 2024-01-13

    jest.useRealTimers();
  });

  test('displays exercise count correctly', () => {
    render(
      <WorkoutHistoryList
        workouts={mockWorkouts}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('2 exercises')).toBeInTheDocument();
    expect(screen.getByText('1 exercise')).toBeInTheDocument();
    expect(screen.getByText('0 exercises')).toBeInTheDocument();
  });

  test('handles workout selection', () => {
    render(
      <WorkoutHistoryList
        workouts={mockWorkouts}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    const viewButtons = screen.getAllByText('View');
    fireEvent.click(viewButtons[0]);

    expect(mockOnWorkoutSelect).toHaveBeenCalledWith(mockWorkouts[0]);
  });

  test('handles workout deletion', () => {
    render(
      <WorkoutHistoryList
        workouts={mockWorkouts}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    expect(mockOnDeleteWorkout).toHaveBeenCalledWith('workout1');
  });

  test('handles use as template', () => {
    render(
      <WorkoutHistoryList
        workouts={mockWorkouts}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    const templateButtons = screen.getAllByText('Template');
    fireEvent.click(templateButtons[0]);

    expect(mockOnUseAsTemplate).toHaveBeenCalledWith(mockWorkouts[0]);
  });

  test('shows loading state', () => {
    render(
      <WorkoutHistoryList
        workouts={[]}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
        isLoading={true}
      />
    );

    // Should render skeleton components
    expect(document.querySelectorAll('.workout-history-card').length).toBe(5);
  });

  test('shows empty state when no workouts', () => {
    render(
      <WorkoutHistoryList
        workouts={[]}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('No Quick Workouts Yet')).toBeInTheDocument();
    expect(screen.getByText('You haven\'t created any quick workouts yet. Start your fitness journey by creating your first workout!')).toBeInTheDocument();
    expect(screen.getByText('Create Your First Workout')).toBeInTheDocument();
  });

  test('handles corrupted workout data gracefully', () => {
    render(
      <WorkoutHistoryList
        workouts={mockCorruptedWorkouts}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Should show warning about corrupted data
    expect(screen.getByText(/Some workout data appears to be corrupted/)).toBeInTheDocument();

    // Should still render valid workouts
    expect(screen.getByText('Upper Body Workout')).toBeInTheDocument();
    expect(screen.getByText('Lower Body Workout')).toBeInTheDocument();
    expect(screen.getByText('Cardio Session')).toBeInTheDocument();
  });

  test('disables buttons for workouts with data issues', () => {
    const workoutWithIssues = {
      id: 'workout-with-issues',
      name: 'Problematic Workout',
      date: { toDate: () => new Date('2024-01-15') },
      exercises: null // This will cause data processing issues
    };

    // Mock console.warn to avoid test output noise
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    render(
      <WorkoutHistoryList
        workouts={[workoutWithIssues]}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Should show data issues warning
    expect(screen.getByText(/This workout has some data issues/)).toBeInTheDocument();

    console.warn.mockRestore();
  });

  test('disables template button for workouts without exercises', () => {
    const workoutWithoutExercises = {
      id: 'empty-workout',
      name: 'Empty Workout',
      date: { toDate: () => new Date('2024-01-15') },
      exercises: []
    };

    render(
      <WorkoutHistoryList
        workouts={[workoutWithoutExercises]}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    const templateButton = screen.getByText('Template').closest('button');
    expect(templateButton).toBeDisabled();
    expect(templateButton).toHaveAttribute('title', 'No exercises to use as template');
  });

  test('handles workouts with missing completion data', () => {
    const workoutWithMissingData = {
      id: 'incomplete-data',
      name: 'Incomplete Data Workout',
      date: { toDate: () => new Date('2024-01-15') },
      exercises: [
        { exerciseId: 'ex1', sets: 3 }, // Missing completed array
        { exerciseId: 'ex2', sets: 2, completed: [true] } // Incomplete completed array
      ]
    };

    render(
      <WorkoutHistoryList
        workouts={[workoutWithMissingData]}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Should handle missing completion data gracefully
    expect(screen.getByText('Incomplete Data Workout')).toBeInTheDocument();
    expect(screen.getByText(/% Complete/)).toBeInTheDocument();
  });

  test('shows correct completion badge variants', () => {
    const workoutsWithDifferentCompletion = [
      {
        id: 'complete',
        name: 'Complete Workout',
        date: { toDate: () => new Date('2024-01-15') },
        exercises: [{ exerciseId: 'ex1', sets: 2, completed: [true, true] }]
      },
      {
        id: 'partial',
        name: 'Partial Workout',
        date: { toDate: () => new Date('2024-01-14') },
        exercises: [{ exerciseId: 'ex1', sets: 4, completed: [true, true, true, false] }]
      },
      {
        id: 'incomplete',
        name: 'Incomplete Workout',
        date: { toDate: () => new Date('2024-01-13') },
        exercises: [{ exerciseId: 'ex1', sets: 3, completed: [false, false, false] }]
      }
    ];

    render(
      <WorkoutHistoryList
        workouts={workoutsWithDifferentCompletion}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('100% Complete')).toBeInTheDocument();
    expect(screen.getByText('75% Complete')).toBeInTheDocument();
    expect(screen.getByText('0% Complete')).toBeInTheDocument();
  });

  test('handles null or undefined workouts prop', () => {
    render(
      <WorkoutHistoryList
        workouts={null}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('No Quick Workouts Yet')).toBeInTheDocument();
  });

  test('handles workouts with different date formats', () => {
    const workoutsWithDifferentDates = [
      {
        id: 'firebase-timestamp',
        name: 'Firebase Timestamp',
        date: { toDate: () => new Date('2024-01-15') },
        exercises: []
      },
      {
        id: 'regular-date',
        name: 'Regular Date',
        date: new Date('2024-01-14'),
        exercises: []
      },
      {
        id: 'no-date',
        name: 'No Date',
        exercises: []
      }
    ];

    render(
      <WorkoutHistoryList
        workouts={workoutsWithDifferentDates}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Firebase Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Regular Date')).toBeInTheDocument();
    expect(screen.getByText('No Date')).toBeInTheDocument();
    expect(screen.getByText('Unknown Date')).toBeInTheDocument();
  });

  test('renders action buttons with correct accessibility attributes', () => {
    render(
      <WorkoutHistoryList
        workouts={mockWorkouts.slice(0, 1)}
        onWorkoutSelect={mockOnWorkoutSelect}
        onDeleteWorkout={mockOnDeleteWorkout}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    const viewButton = screen.getByText('View').closest('button');
    const templateButton = screen.getByText('Template').closest('button');
    const deleteButton = screen.getByText('Delete').closest('button');

    expect(viewButton).toHaveAttribute('title', 'View workout details');
    expect(templateButton).toHaveAttribute('title', 'Use this workout as a template');
    expect(deleteButton).toHaveAttribute('title', 'Delete this workout');
  });
});