/**
 * WorkoutDetailView Component Tests
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutDetailView from '../WorkoutDetailView';

// Mock workout data
const mockWorkout = {
  id: 'workout1',
  name: 'Upper Body Workout',
  date: { toDate: () => new Date('2024-01-15T10:30:00') },
  exercises: [
    {
      exerciseId: 'ex1',
      sets: 3,
      reps: [10, 8, 6],
      weights: [100, 105, 110],
      completed: [true, true, false],
      notes: 'Felt strong today'
    },
    {
      exerciseId: 'ex2',
      sets: 2,
      reps: [12, 10],
      weights: [0, 0],
      completed: [true, true],
      bodyweight: 180
    },
    {
      exerciseId: 'ex3',
      sets: 4,
      reps: [15, 15, 12, 10],
      weights: [50, 50, 55, 60],
      completed: [true, true, true, true]
    }
  ]
};

const mockExercises = [
  {
    id: 'ex1',
    name: 'Bench Press',
    primaryMuscleGroup: 'Chest',
    exerciseType: 'Barbell',
    isGlobal: true
  },
  {
    id: 'ex2',
    name: 'Push-ups',
    primaryMuscleGroup: 'Chest',
    exerciseType: 'Bodyweight',
    isGlobal: true
  },
  {
    id: 'ex3',
    name: 'Dumbbell Row',
    primaryMuscleGroup: 'Back',
    exerciseType: 'Dumbbell',
    isGlobal: true
  }
];

describe('WorkoutDetailView', () => {
  const mockOnBack = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnUseAsTemplate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders workout details correctly', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Upper Body Workout')).toBeInTheDocument();
    expect(screen.getByText('Monday, January 15, 2024')).toBeInTheDocument();
    expect(screen.getByText('10:30 AM')).toBeInTheDocument();
  });

  test('displays workout statistics correctly', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Use more specific selectors to avoid conflicts with set numbers
    const statsContainer = document.querySelector('.workout-stats-overview');
    expect(statsContainer).toBeInTheDocument();
    
    // Check for the specific stats values in the stats container
    expect(screen.getByText('Exercises')).toBeInTheDocument();
    expect(screen.getByText('Total Sets')).toBeInTheDocument();
    expect(screen.getByText('Completed Sets')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('89%')).toBeInTheDocument(); // Completion percentage (8/9)
  });

  test('renders exercise details with correct information', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Check exercise names
    expect(screen.getByText('Bench Press')).toBeInTheDocument();
    expect(screen.getByText('Push-ups')).toBeInTheDocument();
    expect(screen.getByText('Dumbbell Row')).toBeInTheDocument();

    // Check muscle groups
    expect(screen.getAllByText('Chest')).toHaveLength(2);
    expect(screen.getAllByText('Back')).toHaveLength(2); // One muscle group + one "Back" button text

    // Check exercise types
    expect(screen.getByText('Barbell')).toBeInTheDocument();
    expect(screen.getAllByText('Bodyweight')).toHaveLength(3); // Badge + table cells
    expect(screen.getByText('Dumbbell')).toBeInTheDocument();
  });

  test('displays sets data correctly in tables', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Check reps data - use getAllByText since numbers appear multiple times
    expect(screen.getAllByText('10')).toHaveLength(3); // Appears in multiple places
    expect(screen.getAllByText('8')).toHaveLength(2); // Appears in stats and reps
    expect(screen.getAllByText('6')).toHaveLength(1);

    // Check weights data
    expect(screen.getByText('100 lbs')).toBeInTheDocument();
    expect(screen.getByText('105 lbs')).toBeInTheDocument();
    expect(screen.getByText('110 lbs')).toBeInTheDocument();

    // Check completion status
    expect(screen.getAllByText('Done')).toHaveLength(8); // 8 completed sets
    expect(screen.getAllByText('Skipped')).toHaveLength(1); // 1 skipped set
  });

  test('displays bodyweight information for bodyweight exercises', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('BW: 180 lbs')).toBeInTheDocument();
    expect(screen.getAllByText('Bodyweight')).toHaveLength(3); // One in badge, two in table cells
  });

  test('displays exercise notes when present', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Notes:')).toBeInTheDocument();
    expect(screen.getByText('Felt strong today')).toBeInTheDocument();
  });

  test('shows completion badges for exercises', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Bench Press: 2/3 sets
    expect(screen.getByText('2/3 sets')).toBeInTheDocument();
    
    // Push-ups: 2/2 sets
    expect(screen.getByText('2/2 sets')).toBeInTheDocument();
    
    // Dumbbell Row: 4/4 sets
    expect(screen.getByText('4/4 sets')).toBeInTheDocument();
  });

  test('handles back navigation', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    const backButton = screen.getByText('Back to History');
    fireEvent.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });

  test('handles delete action', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    const deleteButton = screen.getByText('Delete Workout');
    fireEvent.click(deleteButton);

    expect(mockOnDelete).toHaveBeenCalledWith('workout1');
  });

  test('handles use as template action', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    const templateButton = screen.getByText('Use as Template');
    fireEvent.click(templateButton);

    expect(mockOnUseAsTemplate).toHaveBeenCalledWith(mockWorkout);
  });

  test('handles missing workout data', () => {
    render(
      <WorkoutDetailView
        workout={null}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Workout Not Found')).toBeInTheDocument();
    expect(screen.getByText('The requested workout could not be loaded. It may have been deleted or there was an error loading the data.')).toBeInTheDocument();
  });

  test('handles invalid workout data structure', () => {
    const invalidWorkout = 'invalid-workout-data';

    render(
      <WorkoutDetailView
        workout={invalidWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Invalid Workout Data')).toBeInTheDocument();
    expect(screen.getByText('This workout contains corrupted or invalid data and cannot be displayed properly.')).toBeInTheDocument();
  });

  test('handles missing exercise metadata gracefully', () => {
    const workoutWithUnknownExercise = {
      ...mockWorkout,
      exercises: [
        {
          exerciseId: 'unknown-exercise',
          sets: 2,
          reps: [10, 8],
          weights: [50, 55],
          completed: [true, false]
        }
      ]
    };

    render(
      <WorkoutDetailView
        workout={workoutWithUnknownExercise}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Unknown Exercise')).toBeInTheDocument();
    expect(screen.getByText('Missing Data')).toBeInTheDocument();
    expect(screen.getByText('Exercise ID: unknown-exercise')).toBeInTheDocument();
  });

  test('handles corrupted exercise data gracefully', () => {
    const workoutWithCorruptedExercise = {
      ...mockWorkout,
      exercises: [
        null, // Invalid exercise
        'invalid-exercise-string', // Invalid type
        { exerciseId: 'ex1', sets: 3 } // Valid exercise
      ]
    };

    render(
      <WorkoutDetailView
        workout={workoutWithCorruptedExercise}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText(/Exercise #1 has corrupted data/)).toBeInTheDocument();
    expect(screen.getByText(/Exercise #2 has corrupted data/)).toBeInTheDocument();
    expect(screen.getByText('Bench Press')).toBeInTheDocument(); // Valid exercise still renders
  });

  test('handles workout without exercises', () => {
    const workoutWithoutExercises = {
      ...mockWorkout,
      exercises: []
    };

    render(
      <WorkoutDetailView
        workout={workoutWithoutExercises}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('No Exercise Data')).toBeInTheDocument();
    expect(screen.getByText('This workout doesn\'t contain any exercise information.')).toBeInTheDocument();
  });

  test('handles different date formats', () => {
    const workoutWithRegularDate = {
      ...mockWorkout,
      date: new Date('2024-01-15T10:30:00')
    };

    render(
      <WorkoutDetailView
        workout={workoutWithRegularDate}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Monday, January 15, 2024')).toBeInTheDocument();
    expect(screen.getByText('10:30 AM')).toBeInTheDocument();
  });

  test('handles workout without date', () => {
    const workoutWithoutDate = {
      ...mockWorkout,
      date: null
    };

    render(
      <WorkoutDetailView
        workout={workoutWithoutDate}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Unknown Date')).toBeInTheDocument();
  });

  test('handles missing sets data gracefully', () => {
    const workoutWithMissingSets = {
      ...mockWorkout,
      exercises: [
        {
          exerciseId: 'ex1',
          sets: 3,
          reps: [10], // Incomplete reps array
          weights: [100, 105], // Incomplete weights array
          completed: [true, false, true]
        }
      ]
    };

    render(
      <WorkoutDetailView
        workout={workoutWithMissingSets}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Should render all 3 sets even with incomplete data
    const setHeaders = screen.getAllByText(/Set/);
    expect(setHeaders.length).toBeGreaterThanOrEqual(3); // At least 3 sets
    const missingData = screen.getAllByText('-');
    expect(missingData.length).toBeGreaterThan(0); // Missing reps and weights show as '-'
  });

  test('displays correct completion percentage in different scenarios', () => {
    const scenarios = [
      { completed: [true, true, true], expected: '100%' },
      { completed: [true, true, false], expected: '67%' },
      { completed: [true, false, false], expected: '33%' },
      { completed: [false, false, false], expected: '0%' }
    ];

    scenarios.forEach(({ completed, expected }) => {
      const testWorkout = {
        ...mockWorkout,
        exercises: [
          {
            exerciseId: 'ex1',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed
          }
        ]
      };

      const { unmount } = render(
        <WorkoutDetailView
          workout={testWorkout}
          exercises={mockExercises}
          onBack={mockOnBack}
          onDelete={mockOnDelete}
          onUseAsTemplate={mockOnUseAsTemplate}
        />
      );

      expect(screen.getByText(expected)).toBeInTheDocument();
      unmount();
    });
  });

  test('handles bodyweight loadable exercises correctly', () => {
    const bodyweightLoadableExercise = {
      id: 'ex4',
      name: 'Weighted Push-ups',
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Bodyweight Loadable',
      isGlobal: true
    };

    const workoutWithBodyweightLoadable = {
      ...mockWorkout,
      exercises: [
        {
          exerciseId: 'ex4',
          sets: 2,
          reps: [10, 8],
          weights: [25, 30], // Additional weight
          completed: [true, true],
          bodyweight: 180
        }
      ]
    };

    render(
      <WorkoutDetailView
        workout={workoutWithBodyweightLoadable}
        exercises={[...mockExercises, bodyweightLoadableExercise]}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    expect(screen.getByText('Weighted Push-ups')).toBeInTheDocument();
    expect(screen.getByText('BW: 180 lbs')).toBeInTheDocument();
    expect(screen.getByText('25 lbs')).toBeInTheDocument(); // Additional weight
    expect(screen.getByText('30 lbs')).toBeInTheDocument();
  });

  test('responsive design elements work correctly', () => {
    render(
      <WorkoutDetailView
        workout={mockWorkout}
        exercises={mockExercises}
        onBack={mockOnBack}
        onDelete={mockOnDelete}
        onUseAsTemplate={mockOnUseAsTemplate}
      />
    );

    // Check for responsive classes
    expect(document.querySelector('.d-none.d-sm-inline')).toBeInTheDocument();
    expect(document.querySelector('.d-sm-none')).toBeInTheDocument();
  });
});