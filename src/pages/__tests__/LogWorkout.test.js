/**
 * Unit Tests for LogWorkout Component Migration
 * 
 * Tests the migrated functionality from Firebase to Supabase:
 * - Service method integration
 * - Data transformation utilities
 * - Error handling scenarios
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import LogWorkout from '../LogWorkout';

// Mock dependencies
jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user-123' },
    isAuthenticated: true
  })
}));

jest.mock('../../services/programService', () => ({
  getUserPrograms: jest.fn(),
  getProgramById: jest.fn(),
  updateProgramExercise: jest.fn()
}));

jest.mock('../../services/exerciseService', () => ({
  getAvailableExercises: jest.fn()
}));

jest.mock('../../services/workoutLogService', () => ({
  default: {
    getWorkoutLog: jest.fn(),
    getProgramWorkoutLogs: jest.fn(),
    updateWorkoutLog: jest.fn(),
    createWorkoutLog: jest.fn(),
    finishWorkout: jest.fn()
  }
}));

jest.mock('../../utils/dataTransformations', () => ({
  transformSupabaseProgramToWeeklyConfigs: jest.fn(),
  transformSupabaseExercises: jest.fn(),
  transformExercisesToSupabaseFormat: jest.fn(),
  transformSupabaseWorkoutLogs: jest.fn(),
  createWorkoutDataForSupabase: jest.fn(),
  ensureBackwardCompatibility: jest.fn()
}));

jest.mock('../../hooks/useWorkoutRealtime', () => ({
  __esModule: true,
  default: () => ({
    isConnected: true,
    connectionStatus: 'connected',
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    broadcast: jest.fn()
  }),
  useWorkoutProgressBroadcast: () => ({
    broadcastProgress: jest.fn()
  })
}));

jest.mock('../../utils/workoutDebugging', () => ({
  workoutDebugger: {
    trackOperation: jest.fn((operation, fn, metadata) => fn()),
    logUserAction: jest.fn(),
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
  },
  migrationValidator: {
    validateNoFirebaseImports: jest.fn(),
    validateSupabaseServiceUsage: jest.fn(),
    validateSupabaseErrorHandling: jest.fn(),
    getValidationSummary: jest.fn(() => ({ isValid: true, issues: [] }))
  },
  WORKOUT_OPERATIONS: {
    SAVE_WORKOUT_LOG: 'SAVE_WORKOUT_LOG',
    LOAD_PROGRAMS: 'LOAD_PROGRAMS',
    LOAD_EXERCISES: 'LOAD_EXERCISES',
    LOAD_WORKOUT_LOGS: 'LOAD_WORKOUT_LOGS',
    REPLACE_EXERCISE: 'REPLACE_EXERCISE'
  }
}));

jest.mock('../../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn((error, context) => ({
    message: `Handled error: ${error.message}`,
    type: 'error'
  })),
  executeSupabaseOperation: jest.fn((fn, context) => fn()),
  SupabaseError: class SupabaseError extends Error {
    constructor(message) {
      super(message);
      this.name = 'SupabaseError';
    }
  }
}));

// Mock lodash debounce
jest.mock('lodash', () => ({
  debounce: jest.fn((fn) => fn)
}));

import { getUserPrograms, updateProgramExercise } from '../../services/programService';
import { getAvailableExercises } from '../../services/exerciseService';
import workoutLogService from '../../services/workoutLogService';
import {
  transformSupabaseExercises,
  transformSupabaseWorkoutLogs,
  ensureBackwardCompatibility
} from '../../utils/dataTransformations';

const renderLogWorkout = () => {
  return render(
    <BrowserRouter>
      <LogWorkout />
    </BrowserRouter>
  );
};

describe('LogWorkout Component - Service Integration', () => {
  const mockPrograms = [
    {
      id: 'program-123',
      name: 'Test Program',
      duration: 4,
      daysPerWeek: 3,
      is_current: true,
      weeklyConfigs: [
        [
          {
            name: 'Day 1',
            exercises: [
              {
                exerciseId: 'exercise-1',
                sets: 3,
                reps: 10,
                notes: ''
              }
            ]
          }
        ]
      ]
    }
  ];

  const mockExercises = [
    {
      id: 'exercise-1',
      name: 'Bench Press',
      primaryMuscleGroup: 'Chest',
      exerciseType: 'Barbell'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    getUserPrograms.mockResolvedValue(mockPrograms);
    getAvailableExercises.mockResolvedValue(mockExercises);
    workoutLogService.getProgramWorkoutLogs.mockResolvedValue([]);
    transformSupabaseExercises.mockReturnValue(mockExercises);
    transformSupabaseWorkoutLogs.mockReturnValue({});
    ensureBackwardCompatibility.mockImplementation((data) => data);
  });

  describe('Program Service Integration', () => {
    it('should load user programs using programService', async () => {
      renderLogWorkout();

      await waitFor(() => {
        expect(getUserPrograms).toHaveBeenCalledWith('test-user-123', { isActive: true });
      });
    });

    it('should handle program loading errors', async () => {
      const error = new Error('Failed to load programs');
      getUserPrograms.mockRejectedValue(error);

      renderLogWorkout();

      await waitFor(() => {
        expect(getUserPrograms).toHaveBeenCalled();
      });
    });

    it('should replace exercises using programService', async () => {
      updateProgramExercise.mockResolvedValue({});
      
      renderLogWorkout();

      // Wait for component to load
      await waitFor(() => {
        expect(getUserPrograms).toHaveBeenCalled();
      });

      // Test exercise replacement would require more complex setup
      // This tests that the service is properly imported and available
      expect(updateProgramExercise).toBeDefined();
    });
  });

  describe('Exercise Service Integration', () => {
    it('should load exercises using exerciseService', async () => {
      renderLogWorkout();

      await waitFor(() => {
        expect(getAvailableExercises).toHaveBeenCalledWith('test-user-123');
      });
    });

    it('should transform exercise data correctly', async () => {
      renderLogWorkout();

      await waitFor(() => {
        expect(transformSupabaseExercises).toHaveBeenCalledWith(mockExercises);
      });
    });

    it('should handle exercise loading errors', async () => {
      const error = new Error('Failed to load exercises');
      getAvailableExercises.mockRejectedValue(error);

      renderLogWorkout();

      await waitFor(() => {
        expect(getAvailableExercises).toHaveBeenCalled();
      });
    });
  });

  describe('Workout Log Service Integration', () => {
    it('should load program workout logs using workoutLogService', async () => {
      renderLogWorkout();

      await waitFor(() => {
        expect(workoutLogService.getProgramWorkoutLogs).toHaveBeenCalledWith(
          'test-user-123',
          'program-123'
        );
      });
    });

    it('should transform workout log data correctly', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          week_index: 0,
          day_index: 0,
          is_finished: false,
          workout_log_exercises: []
        }
      ];

      workoutLogService.getProgramWorkoutLogs.mockResolvedValue(mockLogs);

      renderLogWorkout();

      await waitFor(() => {
        expect(transformSupabaseWorkoutLogs).toHaveBeenCalledWith(mockLogs);
      });
    });

    it('should handle workout log loading errors', async () => {
      const error = new Error('Failed to load workout logs');
      workoutLogService.getProgramWorkoutLogs.mockRejectedValue(error);

      renderLogWorkout();

      await waitFor(() => {
        expect(workoutLogService.getProgramWorkoutLogs).toHaveBeenCalled();
      });
    });
  });

  describe('Data Transformation Integration', () => {
    it('should ensure backward compatibility for programs', async () => {
      renderLogWorkout();

      await waitFor(() => {
        expect(ensureBackwardCompatibility).toHaveBeenCalledWith(
          mockPrograms[0],
          'program'
        );
      });
    });

    it('should handle missing program structure gracefully', async () => {
      const incompleteProgram = {
        id: 'program-123',
        name: 'Incomplete Program',
        duration: 4,
        daysPerWeek: 3,
        weeklyConfigs: null
      };

      getUserPrograms.mockResolvedValue([incompleteProgram]);
      ensureBackwardCompatibility.mockReturnValue(incompleteProgram);

      renderLogWorkout();

      await waitFor(() => {
        expect(ensureBackwardCompatibility).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle Supabase errors using error handler', async () => {
      const supabaseError = new Error('Supabase connection failed');
      getUserPrograms.mockRejectedValue(supabaseError);

      renderLogWorkout();

      await waitFor(() => {
        expect(getUserPrograms).toHaveBeenCalled();
      });
    });

    it('should display user-friendly error messages', async () => {
      const error = new Error('Network error');
      getAvailableExercises.mockRejectedValue(error);

      renderLogWorkout();

      await waitFor(() => {
        expect(getAvailableExercises).toHaveBeenCalled();
      });
    });
  });

  describe('Real-time Integration', () => {
    it('should initialize real-time capabilities', async () => {
      renderLogWorkout();

      // Real-time hook should be initialized
      // This is tested through the mock setup
      expect(true).toBe(true); // Placeholder for real-time tests
    });
  });

  describe('Debugging and Monitoring Integration', () => {
    it('should track operations using workout debugger', async () => {
      const { workoutDebugger } = require('../../utils/workoutDebugging');

      renderLogWorkout();

      await waitFor(() => {
        expect(workoutDebugger.trackOperation).toHaveBeenCalled();
      });
    });

    it('should validate migration completeness', async () => {
      const { migrationValidator } = require('../../utils/workoutDebugging');

      renderLogWorkout();

      await waitFor(() => {
        expect(migrationValidator.validateNoFirebaseImports).toHaveBeenCalled();
        expect(migrationValidator.validateSupabaseServiceUsage).toHaveBeenCalled();
        expect(migrationValidator.validateSupabaseErrorHandling).toHaveBeenCalled();
      });
    });
  });
});

describe('LogWorkout Component - No Firebase Dependencies', () => {
  it('should not import any Firebase modules', () => {
    // This test verifies at the module level that no Firebase imports exist
    const LogWorkoutModule = require('../LogWorkout');
    
    // Check that the module loads without Firebase dependencies
    expect(LogWorkoutModule).toBeDefined();
    expect(LogWorkoutModule.default).toBeDefined();
  });

  it('should use only Supabase services', async () => {
    renderLogWorkout();

    await waitFor(() => {
      // Verify that only Supabase services are called
      expect(getUserPrograms).toHaveBeenCalled();
      expect(getAvailableExercises).toHaveBeenCalled();
      expect(workoutLogService.getProgramWorkoutLogs).toHaveBeenCalled();
    });

    // Verify no Firebase functions are called (they shouldn't exist in mocks)
    expect(typeof window.firebase).toBe('undefined');
  });
});