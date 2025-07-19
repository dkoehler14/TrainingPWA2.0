/**
 * QuickWorkoutHistory Page Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import QuickWorkoutHistory from '../QuickWorkoutHistory';
import { auth } from '../../firebase';
import { deleteDoc } from 'firebase/firestore';
import { invalidateWorkoutCache } from '../../api/enhancedFirestoreCache';
import useQuickWorkoutHistory from '../../hooks/useQuickWorkoutHistory';

// Mock Firebase
jest.mock('../../firebase', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' }
  },
  db: {}
}));

// Mock Firestore functions
jest.mock('firebase/firestore', () => ({
  deleteDoc: jest.fn(),
  doc: jest.fn()
}));

// Mock enhanced cache
jest.mock('../../api/enhancedFirestoreCache', () => ({
  getAllExercisesMetadata: jest.fn(),
  getDocCached: jest.fn(),
  invalidateWorkoutCache: jest.fn()
}));

// Mock the custom hook
jest.mock('../../hooks/useQuickWorkoutHistory');

// Mock React Router hooks
const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockUseParams(),
  BrowserRouter: ({ children }) => children,
  Routes: ({ children }) => children,
  Route: ({ children }) => children,
  Navigate: () => null
}));

// Mock child components
jest.mock('../../components/WorkoutStatsCard', () => {
  return function MockWorkoutStatsCard() {
    return <div data-testid="workout-stats-card">Workout Stats</div>;
  };
});

jest.mock('../../components/WorkoutFilters', () => {
  return function MockWorkoutFilters({ onSearchChange, onDateFilterChange, onSortChange, onClearFilters }) {
    return (
      <div data-testid="workout-filters">
        <button onClick={() => onSearchChange('test')}>Search</button>
        <button onClick={() => onDateFilterChange({ start: new Date(), end: new Date() })}>Filter Date</button>
        <button onClick={() => onSortChange('name-asc')}>Sort</button>
        <button onClick={onClearFilters}>Clear</button>
      </div>
    );
  };
});

jest.mock('../../components/WorkoutHistoryList', () => {
  return function MockWorkoutHistoryList({ onWorkoutSelect, onDeleteWorkout, onUseAsTemplate }) {
    return (
      <div data-testid="workout-history-list">
        <button onClick={() => onWorkoutSelect({ id: 'workout1', name: 'Test Workout' })}>
          Select Workout
        </button>
        <button onClick={() => onDeleteWorkout('workout1')}>
          Delete Workout
        </button>
        <button onClick={() => onUseAsTemplate({ id: 'workout1', exercises: [] })}>
          Use Template
        </button>
      </div>
    );
  };
});

jest.mock('../../components/WorkoutDetailView', () => {
  return function MockWorkoutDetailView({ onBack, onDelete, onUseAsTemplate }) {
    return (
      <div data-testid="workout-detail-view">
        <button onClick={onBack}>Back</button>
        <button onClick={() => onDelete('workout1')}>Delete</button>
        <button onClick={() => onUseAsTemplate({ id: 'workout1', exercises: [] })}>Use Template</button>
      </div>
    );
  };
});

// Mock workout data
const mockWorkouts = [
  {
    id: 'workout1',
    name: 'Test Workout',
    date: { toDate: () => new Date('2024-01-15') },
    exercises: [
      { exerciseId: 'ex1', sets: 3, completed: [true, true, false] }
    ]
  },
  {
    id: 'workout2',
    name: 'Another Workout',
    date: { toDate: () => new Date('2024-01-14') },
    exercises: [
      { exerciseId: 'ex2', sets: 2, completed: [true, true] }
    ]
  }
];

const mockExercises = [
  { id: 'ex1', name: 'Push Up', primaryMuscleGroup: 'Chest', exerciseType: 'Bodyweight', isGlobal: true },
  { id: 'ex2', name: 'Squat', primaryMuscleGroup: 'Legs', exerciseType: 'Bodyweight', isGlobal: true }
];

describe('QuickWorkoutHistory', () => {
  const mockRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset router mocks
    mockNavigate.mockClear();
    mockUseParams.mockReturnValue({});
    
    // Mock the hook return value
    useQuickWorkoutHistory.mockReturnValue({
      workouts: mockWorkouts,
      isLoading: false,
      error: null,
      refetch: mockRefetch
    });

    // Mock getAllExercisesMetadata
    require('../../api/enhancedFirestoreCache').getAllExercisesMetadata.mockResolvedValue(mockExercises);
    require('../../api/enhancedFirestoreCache').getDocCached.mockResolvedValue(null);
  });

  // Helper function to render component with router
  const renderWithRouter = (component) => {
    return render(
      <BrowserRouter>
        {component}
      </BrowserRouter>
    );
  };

  test('renders main components correctly', async () => {
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      expect(screen.getByText('Quick Workout History')).toBeInTheDocument();
      expect(screen.getByTestId('workout-stats-card')).toBeInTheDocument();
      expect(screen.getByTestId('workout-filters')).toBeInTheDocument();
      expect(screen.getByTestId('workout-history-list')).toBeInTheDocument();
    });
  });

  test('shows loading state initially', () => {
    useQuickWorkoutHistory.mockReturnValue({
      workouts: [],
      isLoading: true,
      error: null,
      refetch: mockRefetch
    });

    renderWithRouter(<QuickWorkoutHistory />);
    
    expect(screen.getByText('Loading workout history...')).toBeInTheDocument();
  });

  test('shows error state when there is an error', async () => {
    useQuickWorkoutHistory.mockReturnValue({
      workouts: [],
      isLoading: false,
      error: 'Failed to load workouts',
      refetch: mockRefetch
    });

    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      expect(screen.getByText('Error Loading Workouts')).toBeInTheDocument();
      expect(screen.getByText('Failed to load workouts')).toBeInTheDocument();
    });
  });

  test('handles workout selection and navigates to detail URL', async () => {
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      const selectButton = screen.getByText('Select Workout');
      fireEvent.click(selectButton);
    });

    expect(mockNavigate).toHaveBeenCalledWith('/quick-workout-history/workout1');
  });

  test('handles back navigation from detail view', async () => {
    // Mock URL parameter to show detail view
    mockUseParams.mockReturnValue({ workoutId: 'workout1' });
    
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      expect(screen.getByTestId('workout-detail-view')).toBeInTheDocument();
    });

    const backButton = screen.getByText('Back');
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/quick-workout-history');
  });

  test('shows delete confirmation modal when delete is clicked', async () => {
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      const deleteButton = screen.getByTestId('workout-history-list').querySelector('button:nth-child(2)');
      fireEvent.click(deleteButton);
    });

    expect(screen.getByText('Are you sure you want to delete this workout? This action cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getAllByText('Delete Workout')).toHaveLength(2); // One in list, one in modal
  });

  test('cancels deletion when Cancel button is clicked', async () => {
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      const deleteButton = screen.getByTestId('workout-history-list').querySelector('button:nth-child(2)');
      fireEvent.click(deleteButton);
    });

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(screen.queryByText('Are you sure you want to delete this workout?')).not.toBeInTheDocument();
    });
  });

  test('executes deletion when confirmed', async () => {
    deleteDoc.mockResolvedValue();
    
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      const deleteButton = screen.getByTestId('workout-history-list').querySelector('button:nth-child(2)');
      fireEvent.click(deleteButton);
    });

    // Get the modal delete button (danger variant)
    const confirmButton = screen.getByRole('dialog').querySelector('.btn-danger');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deleteDoc).toHaveBeenCalled();
      expect(invalidateWorkoutCache).toHaveBeenCalledWith('test-user-id');
      expect(mockRefetch).toHaveBeenCalled();
    });

    // Check for success message
    await waitFor(() => {
      expect(screen.getByText('Workout deleted successfully')).toBeInTheDocument();
    });
  });

  test('shows error message when deletion fails', async () => {
    deleteDoc.mockRejectedValue(new Error('Delete failed'));
    
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      const deleteButton = screen.getByTestId('workout-history-list').querySelector('button:nth-child(2)');
      fireEvent.click(deleteButton);
    });

    const confirmButton = screen.getByRole('dialog').querySelector('.btn-danger');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to delete workout. Please try again.')).toBeInTheDocument();
    });
  });

  test('shows loading state during deletion', async () => {
    // Make deleteDoc hang to test loading state
    deleteDoc.mockImplementation(() => new Promise(() => {}));
    
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      const deleteButton = screen.getByTestId('workout-history-list').querySelector('button:nth-child(2)');
      fireEvent.click(deleteButton);
    });

    const confirmButton = screen.getByRole('dialog').querySelector('.btn-danger');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Deleting...')).toBeInTheDocument();
      expect(confirmButton).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });
  });

  test('navigates back to list when deleting currently viewed workout', async () => {
    deleteDoc.mockResolvedValue();
    
    // Mock URL parameter to show detail view initially
    mockUseParams.mockReturnValue({ workoutId: 'workout1' });
    
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      expect(screen.getByTestId('workout-detail-view')).toBeInTheDocument();
    });

    // Delete from detail view
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    // Wait for modal to appear and click confirm
    await waitFor(() => {
      const confirmButton = screen.getByRole('dialog').querySelector('.btn-danger');
      fireEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/quick-workout-history');
    });
  });

  test('handles use as template functionality with React Router navigation', async () => {
    // Mock sessionStorage
    const mockSessionStorage = {
      setItem: jest.fn()
    };
    Object.defineProperty(window, 'sessionStorage', {
      value: mockSessionStorage
    });

    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      const templateButton = screen.getByText('Use Template');
      fireEvent.click(templateButton);
    });

    expect(mockSessionStorage.setItem).toHaveBeenCalledWith(
      'quickWorkoutTemplate',
      expect.stringContaining('Quick Workout (Copy)')
    );
    expect(mockNavigate).toHaveBeenCalledWith('/quick-workout');
  });

  test('handles filter changes correctly', async () => {
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      const searchButton = screen.getByText('Search');
      fireEvent.click(searchButton);
    });

    // Component should handle the search change
    expect(screen.getByTestId('workout-filters')).toBeInTheDocument();
  });

  test('dismisses user messages', async () => {
    renderWithRouter(<QuickWorkoutHistory />);
    
    // Trigger a success message by deleting a workout
    deleteDoc.mockResolvedValue();
    
    await waitFor(() => {
      const deleteButton = screen.getByTestId('workout-history-list').querySelector('button:nth-child(2)');
      fireEvent.click(deleteButton);
    });

    const confirmButton = screen.getByRole('dialog').querySelector('.btn-danger');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('Workout deleted successfully')).toBeInTheDocument();
    });

    // Find and click the dismiss button
    const dismissButton = screen.getByRole('button', { name: 'Close alert' });
    fireEvent.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByText('Workout deleted successfully')).not.toBeInTheDocument();
    });
  });

  // New tests for URL-based navigation functionality
  test('shows detail view when workoutId is in URL', async () => {
    mockUseParams.mockReturnValue({ workoutId: 'workout1' });
    
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      expect(screen.getByTestId('workout-detail-view')).toBeInTheDocument();
      expect(screen.queryByTestId('workout-history-list')).not.toBeInTheDocument();
    });
  });

  test('redirects to list view when workout not found in URL', async () => {
    mockUseParams.mockReturnValue({ workoutId: 'nonexistent-workout' });
    
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/quick-workout-history', { replace: true });
    });
  });

  test('shows list view when no workoutId in URL', async () => {
    mockUseParams.mockReturnValue({});
    
    renderWithRouter(<QuickWorkoutHistory />);
    
    await waitFor(() => {
      expect(screen.getByTestId('workout-history-list')).toBeInTheDocument();
      expect(screen.queryByTestId('workout-detail-view')).not.toBeInTheDocument();
    });
  });
});