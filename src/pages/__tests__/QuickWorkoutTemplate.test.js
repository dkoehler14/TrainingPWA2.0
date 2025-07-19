/**
 * QuickWorkout Template Functionality Tests
 * 
 * Tests the template creation feature that allows users to use previous workouts as templates
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickWorkout from '../QuickWorkout';
import { auth } from '../../firebase';
import { getAllExercisesMetadata, getDocCached } from '../../api/enhancedFirestoreCache';

// Mock Firebase
jest.mock('../../firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' }
  },
  db: {}
}));

// Mock Firestore functions
jest.mock('firebase/firestore', () => ({
  addDoc: jest.fn(),
  collection: jest.fn(),
  Timestamp: {
    fromDate: jest.fn(() => ({ seconds: 1234567890 }))
  }
}));

// Mock enhanced cache
jest.mock('../../api/enhancedFirestoreCache');

// Mock lodash debounce
jest.mock('lodash', () => ({
  debounce: jest.fn(fn => fn)
}));

// Mock ExerciseGrid component
jest.mock('../../components/ExerciseGrid', () => {
  return function MockExerciseGrid({ exercises, onExerciseClick }) {
    return (
      <div data-testid="exercise-grid">
        {exercises.map(exercise => (
          <button
            key={exercise.id}
            onClick={() => onExerciseClick(exercise)}
            data-testid={`exercise-${exercise.id}`}
          >
            {exercise.name}
          </button>
        ))}
      </div>
    );
  };
});

const mockExercises = [
  {
    id: 'exercise1',
    name: 'Push-ups',
    primaryMuscleGroup: 'Chest',
    exerciseType: 'Bodyweight',
    isGlobal: true
  },
  {
    id: 'exercise2',
    name: 'Squats',
    primaryMuscleGroup: 'Legs',
    exerciseType: 'Bodyweight',
    isGlobal: true
  }
];

describe('QuickWorkout Template Functionality', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
    
    // Mock the enhanced cache functions
    getAllExercisesMetadata.mockResolvedValue(mockExercises);
    getDocCached.mockResolvedValue(null);
    
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
  });

  test('loads template data from sessionStorage on component mount', async () => {
    // Set up template data in sessionStorage
    const templateData = {
      name: 'Test Workout (Copy)',
      exercises: [
        {
          exerciseId: 'exercise1',
          sets: 3,
          reps: ['', '', ''],
          weights: ['', '', ''],
          completed: [false, false, false],
          notes: 'Test notes',
          bodyweight: null
        }
      ]
    };
    
    sessionStorage.setItem('quickWorkoutTemplate', JSON.stringify(templateData));

    render(<QuickWorkout />);

    // Wait for component to load and process template
    await waitFor(() => {
      expect(screen.queryByText('Loading exercises...')).not.toBeInTheDocument();
    });

    // Check that workout name is set from template
    await waitFor(() => {
      const workoutNameInput = screen.getByDisplayValue('Test Workout (Copy)');
      expect(workoutNameInput).toBeInTheDocument();
    });

    // Check that success message is shown
    await waitFor(() => {
      expect(screen.getByText('Workout template loaded successfully!')).toBeInTheDocument();
    });

    // Verify sessionStorage is cleared after loading
    expect(sessionStorage.getItem('quickWorkoutTemplate')).toBeNull();
  });

  test('preserves exercise selection and notes from template', async () => {
    const templateData = {
      name: 'Template Workout',
      exercises: [
        {
          exerciseId: 'exercise1',
          sets: 4,
          reps: ['', '', '', ''],
          weights: ['', '', '', ''],
          completed: [false, false, false, false],
          notes: 'Keep good form',
          bodyweight: null
        }
      ]
    };
    
    sessionStorage.setItem('quickWorkoutTemplate', JSON.stringify(templateData));

    render(<QuickWorkout />);

    await waitFor(() => {
      expect(screen.queryByText('Loading exercises...')).not.toBeInTheDocument();
    });

    // Wait for template to load
    await waitFor(() => {
      expect(screen.getByText('Workout template loaded successfully!')).toBeInTheDocument();
    });

    // Check that exercise is added with correct set count
    await waitFor(() => {
      expect(screen.getByText('Push-ups')).toBeInTheDocument();
    });

    // Check that sets input shows correct value
    await waitFor(() => {
      const setsInput = screen.getByDisplayValue('4');
      expect(setsInput).toBeInTheDocument();
    });

    // Verify that reps and weights are cleared (empty inputs)
    const repsInputs = screen.getAllByRole('spinbutton').filter(input => 
      input.getAttribute('type') === 'number' && 
      input.value === '' &&
      input !== screen.getByDisplayValue('4') // Exclude the sets input
    );
    expect(repsInputs.length).toBeGreaterThan(0);
  });

  test('clears reps, weights, and completion status from template', async () => {
    const templateData = {
      name: 'Previous Workout',
      exercises: [
        {
          exerciseId: 'exercise2',
          sets: 3,
          reps: ['', '', ''], // Should remain empty
          weights: ['', '', ''], // Should remain empty
          completed: [false, false, false], // Should remain false
          notes: 'Previous notes',
          bodyweight: null
        }
      ]
    };
    
    sessionStorage.setItem('quickWorkoutTemplate', JSON.stringify(templateData));

    render(<QuickWorkout />);

    await waitFor(() => {
      expect(screen.queryByText('Loading exercises...')).not.toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Workout template loaded successfully!')).toBeInTheDocument();
    });

    // Check that exercise is loaded
    await waitFor(() => {
      expect(screen.getByText('Squats')).toBeInTheDocument();
    });

    // Verify checkboxes are unchecked
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach(checkbox => {
      expect(checkbox).not.toBeChecked();
    });
  });

  test('handles invalid template data gracefully', async () => {
    // Set invalid JSON in sessionStorage
    sessionStorage.setItem('quickWorkoutTemplate', 'invalid-json');

    render(<QuickWorkout />);

    await waitFor(() => {
      expect(screen.queryByText('Loading exercises...')).not.toBeInTheDocument();
    });

    // Should show error message
    await waitFor(() => {
      expect(screen.getByText('Failed to load workout template')).toBeInTheDocument();
    });

    // Should clear the invalid data from sessionStorage
    expect(sessionStorage.getItem('quickWorkoutTemplate')).toBeNull();
  });

  test('does not load template if no template data exists', async () => {
    // Ensure no template data exists
    expect(sessionStorage.getItem('quickWorkoutTemplate')).toBeNull();

    render(<QuickWorkout />);

    await waitFor(() => {
      expect(screen.queryByText('Loading exercises...')).not.toBeInTheDocument();
    });

    // Should not show template success message
    expect(screen.queryByText('Workout template loaded successfully!')).not.toBeInTheDocument();
    
    // Should show default empty state
    expect(screen.getByText('Add Exercise')).toBeInTheDocument();
  });

  test('only loads template after exercises are loaded', async () => {
    const templateData = {
      name: 'Test Workout',
      exercises: [
        {
          exerciseId: 'exercise1',
          sets: 3,
          reps: ['', '', ''],
          weights: ['', '', ''],
          completed: [false, false, false],
          notes: '',
          bodyweight: null
        }
      ]
    };
    
    sessionStorage.setItem('quickWorkoutTemplate', JSON.stringify(templateData));

    // Mock exercises loading to be slow
    getAllExercisesMetadata.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve(mockExercises), 100))
    );

    render(<QuickWorkout />);

    // Initially should show loading
    expect(screen.getByText('Loading exercises...')).toBeInTheDocument();
    
    // Template should not be loaded yet
    expect(screen.queryByText('Workout template loaded successfully!')).not.toBeInTheDocument();

    // Wait for exercises to load
    await waitFor(() => {
      expect(screen.queryByText('Loading exercises...')).not.toBeInTheDocument();
    });

    // Now template should be loaded
    await waitFor(() => {
      expect(screen.getByText('Workout template loaded successfully!')).toBeInTheDocument();
    });
  });
});