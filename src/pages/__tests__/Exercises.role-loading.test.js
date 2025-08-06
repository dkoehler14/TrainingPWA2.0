import React from 'react';
import { render, screen } from '@testing-library/react';
import Exercises from '../Exercises';

// Mock the hooks
jest.mock('../../hooks/useAuth', () => ({
  useAuth: jest.fn(),
  useRoles: jest.fn(),
  useAuthLoading: jest.fn()
}));

// Mock the services
jest.mock('../../services/exerciseService', () => ({
  getAvailableExercises: jest.fn()
}));

// Mock the utils
jest.mock('../../utils/dataTransformations', () => ({
  transformSupabaseExercises: jest.fn(exercises => exercises)
}));

// Mock ExerciseOrganizer to verify props
jest.mock('../../components/ExerciseOrganizer', () => {
  return function MockExerciseOrganizer({ userRole, isRoleLoading }) {
    return (
      <div data-testid="exercise-organizer">
        <span data-testid="user-role">{userRole === null ? 'null' : userRole}</span>
        <span data-testid="is-role-loading">{isRoleLoading.toString()}</span>
      </div>
    );
  };
});

// Mock ExerciseCreationModal
jest.mock('../../components/ExerciseCreationModal', () => {
  return function MockExerciseCreationModal() {
    return <div data-testid="exercise-creation-modal" />;
  };
});

describe('Exercises Page Role Loading', () => {
  const mockUseAuth = require('../../hooks/useAuth').useAuth;
  const mockUseRoles = require('../../hooks/useAuth').useRoles;
  const mockUseAuthLoading = require('../../hooks/useAuth').useAuthLoading;
  const mockGetAvailableExercises = require('../../services/exerciseService').getAvailableExercises;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockUseAuth.mockReturnValue({
      user: { id: 'test-user' },
      isAuthenticated: true
    });
    
    mockGetAvailableExercises.mockResolvedValue([]);
  });

  test('passes null userRole when profile is loading', async () => {
    mockUseRoles.mockReturnValue({
      userRole: 'admin'
    });
    
    mockUseAuthLoading.mockReturnValue({
      isProfileLoading: true
    });

    render(<Exercises />);

    // Wait for component to render
    await screen.findByTestId('exercise-organizer');

    const exerciseOrganizer = screen.getByTestId('exercise-organizer');
    const userRoleSpan = exerciseOrganizer.querySelector('[data-testid="user-role"]');
    const isRoleLoadingSpan = exerciseOrganizer.querySelector('[data-testid="is-role-loading"]');

    expect(userRoleSpan).toHaveTextContent('null');
    expect(isRoleLoadingSpan).toHaveTextContent('true');
  });

  test('passes actual userRole when profile is not loading', async () => {
    mockUseRoles.mockReturnValue({
      userRole: 'admin'
    });
    
    mockUseAuthLoading.mockReturnValue({
      isProfileLoading: false
    });

    render(<Exercises />);

    // Wait for component to render
    await screen.findByTestId('exercise-organizer');

    const exerciseOrganizer = screen.getByTestId('exercise-organizer');
    const userRoleSpan = exerciseOrganizer.querySelector('[data-testid="user-role"]');
    const isRoleLoadingSpan = exerciseOrganizer.querySelector('[data-testid="is-role-loading"]');

    expect(userRoleSpan).toHaveTextContent('admin');
    expect(isRoleLoadingSpan).toHaveTextContent('false');
  });

  test('handles regular user role correctly', async () => {
    mockUseRoles.mockReturnValue({
      userRole: 'user'
    });
    
    mockUseAuthLoading.mockReturnValue({
      isProfileLoading: false
    });

    render(<Exercises />);

    // Wait for component to render
    await screen.findByTestId('exercise-organizer');

    const exerciseOrganizer = screen.getByTestId('exercise-organizer');
    const userRoleSpan = exerciseOrganizer.querySelector('[data-testid="user-role"]');

    expect(userRoleSpan).toHaveTextContent('user');
  });
});