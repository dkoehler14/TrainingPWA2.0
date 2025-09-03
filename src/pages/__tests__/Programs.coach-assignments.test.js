/**
 * Programs Page Coach Assignment Tests
 * 
 * Tests for coach-assigned program functionality in the Programs page
 */

// Mock Supabase configuration before any imports
jest.mock('../../config/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } })
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: null, error: null })
        })
      })
    })
  }
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Programs from '../Programs';
import { useAuth } from '../../hooks/useAuth';
import { useClientCoach } from '../../hooks/useClientCoach';
import { getUserPrograms, getClientAssignedPrograms, setCurrentProgram } from '../../services/programService';
import { getAvailableExercises } from '../../services/exerciseService';
import workoutLogService from '../../services/workoutLogService';

// Mock dependencies
jest.mock('../../hooks/useAuth');
jest.mock('../../hooks/useClientCoach');
jest.mock('../../services/programService');
jest.mock('../../services/exerciseService');
jest.mock('../../services/workoutLogService');
jest.mock('../../utils/dataTransformations', () => ({
  transformSupabaseExercises: jest.fn().mockReturnValue([])
}));
jest.mock('../../utils/programUtils', () => ({
  parseWeeklyConfigs: jest.fn().mockImplementation((flattenedConfigs, duration, daysPerWeek) => {
    // Return a proper nested structure for testing
    if (!flattenedConfigs || !duration || !daysPerWeek) return [];
    
    // Ensure we return a non-empty array with proper structure
    const result = Array.from({ length: Math.max(1, duration) }, (_, weekIndex) =>
      Array.from({ length: Math.max(1, daysPerWeek) }, (_, dayIndex) => ({
        name: `Day ${dayIndex + 1}`,
        exercises: [
          {
            exerciseId: 'exercise-1',
            sets: 3,
            reps: 8,
            notes: ''
          }
        ]
      }))
    );
    
    console.log('Mock parseWeeklyConfigs called with:', { flattenedConfigs, duration, daysPerWeek, result });
    return result;
  })
}));
jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => children,
  useLocation: () => ({
    pathname: '/programs',
    search: '',
    hash: '',
    state: null
  }),
  useNavigate: () => jest.fn()
}));
jest.mock('../../hooks/useRealtimePrograms', () => ({
  useRealtimePrograms: () => ({
    programs: [],
    exercises: [],
    isConnected: true,
    lastUpdate: null,
    setPrograms: jest.fn(),
    setExercises: jest.fn()
  }),
  useRealtimeExerciseLibrary: () => ({
    newExercises: [],
    updatedExercises: [],
    clearNewExercises: jest.fn(),
    clearUpdatedExercises: jest.fn()
  })
}));

const mockUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com'
};

const mockCoachRelationship = {
  id: 'rel-123',
  coach_id: 'coach-456',
  client_id: 'user-123',
  status: 'active',
  coach: {
    id: 'coach-456',
    name: 'Coach Smith',
    email: 'coach@example.com'
  }
};

const mockPersonalPrograms = [
  {
    id: 'prog-1',
    name: 'My Personal Program',
    duration: 2,
    days_per_week: 2,
    is_template: false,
    is_current: true,
    weekly_configs: { 
      week1_day1: { name: 'Day 1', exercises: [{ exerciseId: 'ex1', sets: 3, reps: 8 }] },
      week1_day2: { name: 'Day 2', exercises: [{ exerciseId: 'ex2', sets: 3, reps: 10 }] }
    },
    hasError: false
  }
];

const mockCoachAssignedPrograms = [
  {
    id: 'prog-2',
    name: 'Coach Assigned Program',
    duration: 2,
    days_per_week: 2,
    is_template: false,
    is_current: false,
    coach_assigned: true,
    assigned_to_client: 'user-123',
    coach_notes: 'Focus on strength building',
    client_goals: ['strength', 'muscle gain'],
    program_difficulty: 'intermediate',
    assigned_at: '2024-01-15T10:00:00Z',
    coach: {
      id: 'coach-456',
      name: 'Coach Smith',
      email: 'coach@example.com'
    },
    weekly_configs: { 
      week1_day1: { name: 'Day 1', exercises: [{ exerciseId: 'ex1', sets: 4, reps: 6 }] },
      week1_day2: { name: 'Day 2', exercises: [{ exerciseId: 'ex2', sets: 3, reps: 8 }] },
      week2_day1: { name: 'Day 1', exercises: [{ exerciseId: 'ex1', sets: 4, reps: 6 }] },
      week2_day2: { name: 'Day 2', exercises: [{ exerciseId: 'ex2', sets: 3, reps: 8 }] }
    },
    hasError: false
  }
];

const mockTemplatePrograms = [
  {
    id: 'prog-3',
    name: 'Community Template',
    duration: 2,
    days_per_week: 2,
    is_template: true,
    is_current: false,
    weekly_configs: { 
      week1_day1: { name: 'Day 1', exercises: [{ exerciseId: 'ex1', sets: 3, reps: 12 }] },
      week1_day2: { name: 'Day 2', exercises: [{ exerciseId: 'ex2', sets: 4, reps: 8 }] }
    },
    hasError: false
  }
];

const renderPrograms = (hasCoach = false) => {
  useAuth.mockReturnValue({
    user: mockUser,
    isAuthenticated: true
  });

  useClientCoach.mockReturnValue({
    hasActiveCoach: hasCoach,
    coachRelationship: hasCoach ? mockCoachRelationship : null,
    loading: false,
    error: null
  });

  getUserPrograms.mockResolvedValue([
    ...mockPersonalPrograms,
    ...mockTemplatePrograms
  ]);

  getClientAssignedPrograms.mockResolvedValue(
    hasCoach ? mockCoachAssignedPrograms : []
  );

  getAvailableExercises.mockResolvedValue([]);
  workoutLogService.getWorkoutLogs = jest.fn().mockResolvedValue([]);
  setCurrentProgram.mockResolvedValue();

  return render(
    <BrowserRouter>
      <Programs userRole="user" />
    </BrowserRouter>
  );
};

describe('Programs Page - Coach Assignments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('User without coach', () => {
    test('should show only personal and template tabs', async () => {
      renderPrograms(false);

      await waitFor(() => {
        expect(screen.getByText('Personal Programs (1)')).toBeInTheDocument();
        expect(screen.getByText('Templates (1)')).toBeInTheDocument();
        expect(screen.queryByText(/Coach Assigned/)).not.toBeInTheDocument();
      });
    });

    test('should display personal programs with correct badges', async () => {
      renderPrograms(false);

      await waitFor(() => {
        expect(screen.getByText('My Personal Program')).toBeInTheDocument();
        expect(screen.getByText('Personal')).toBeInTheDocument();
        expect(screen.getByText('Current')).toBeInTheDocument();
      });
    });
  });

  describe('User with active coach', () => {
    test('should show all three tabs including coach assigned', async () => {
      renderPrograms(true);

      await waitFor(() => {
        expect(screen.getByText('Personal Programs (1)')).toBeInTheDocument();
        expect(screen.getByText('Coach Assigned (1)')).toBeInTheDocument();
        expect(screen.getByText('Templates (1)')).toBeInTheDocument();
      });
    });

    test('should display coach assigned programs with correct attribution', async () => {
      renderPrograms(true);

      // Switch to coach assigned tab
      const coachTab = await screen.findByText('Coach Assigned (1)');
      fireEvent.click(coachTab);

      await waitFor(() => {
        expect(screen.getByText('Coach Assigned Program')).toBeInTheDocument();
        expect(screen.getByText('Coach Assigned')).toBeInTheDocument();
        expect(screen.getByText('• By Coach Smith')).toBeInTheDocument();
      });
    });

    test('should display coach assignment details', async () => {
      renderPrograms(true);

      // Switch to coach assigned tab
      const coachTab = await screen.findByText('Coach Assigned (1)');
      fireEvent.click(coachTab);

      await waitFor(() => {
        expect(screen.getByText('Coach Notes:')).toBeInTheDocument();
        expect(screen.getByText('Focus on strength building')).toBeInTheDocument();
        expect(screen.getByText('Goals:')).toBeInTheDocument();
        expect(screen.getByText('strength, muscle gain')).toBeInTheDocument();
        expect(screen.getByText('Difficulty:')).toBeInTheDocument();
        expect(screen.getByText('Intermediate')).toBeInTheDocument();
        expect(screen.getByText('Assigned:')).toBeInTheDocument();
      });
    });

    test('should show limited actions for coach assigned programs', async () => {
      renderPrograms(true);

      // Switch to coach assigned tab
      const coachTab = await screen.findByText('Coach Assigned (1)');
      fireEvent.click(coachTab);

      await waitFor(() => {
        // Should have Details and Set Current buttons
        expect(screen.getByText('Details')).toBeInTheDocument();
        expect(screen.getByText('Set Current')).toBeInTheDocument();
        
        // Should NOT have Edit or Delete buttons
        expect(screen.queryByText('Edit')).not.toBeInTheDocument();
        expect(screen.queryByText('Delete')).not.toBeInTheDocument();
      });
    });

    test('should show coach information in coach assigned tab', async () => {
      renderPrograms(true);

      // Switch to coach assigned tab
      const coachTab = await screen.findByText('Coach Assigned (1)');
      fireEvent.click(coachTab);

      await waitFor(() => {
        expect(screen.getByText('Coach Assigned Programs')).toBeInTheDocument();
        expect(screen.getByText('Programs assigned by your coach (Coach Smith)')).toBeInTheDocument();
      });
    });
  });

  describe('Tab navigation', () => {
    test('should switch between tabs correctly', async () => {
      renderPrograms(true);

      // Start on personal tab
      await waitFor(() => {
        expect(screen.getByText('Your Personal Programs')).toBeInTheDocument();
      });

      // Switch to coach assigned tab
      const coachTab = await screen.findByText('Coach Assigned (1)');
      fireEvent.click(coachTab);

      await waitFor(() => {
        expect(screen.getByText('Coach Assigned Programs')).toBeInTheDocument();
        expect(screen.queryByText('Your Personal Programs')).not.toBeInTheDocument();
      });

      // Switch to templates tab
      const templatesTab = screen.getByText('Templates (1)');
      fireEvent.click(templatesTab);

      await waitFor(() => {
        expect(screen.getByText('Template Programs')).toBeInTheDocument();
        expect(screen.queryByText('Coach Assigned Programs')).not.toBeInTheDocument();
      });
    });

    test('should have correct active tab styling', async () => {
      renderPrograms(true);

      const personalTab = await screen.findByText('Personal Programs (1)');
      const coachTab = await screen.findByText('Coach Assigned (1)');

      // Personal tab should be active initially
      expect(personalTab).toHaveClass('active');
      expect(coachTab).not.toHaveClass('active');

      // Click coach tab
      fireEvent.click(coachTab);

      await waitFor(() => {
        expect(coachTab).toHaveClass('active');
        expect(personalTab).not.toHaveClass('active');
      });
    });
  });

  describe('Program source indicators', () => {
    test('should show correct badges for different program types', async () => {
      renderPrograms(true);

      // Check personal program badge
      await waitFor(() => {
        const personalBadge = screen.getByText('Personal');
        expect(personalBadge).toBeInTheDocument();
        expect(personalBadge).toHaveClass('bg-info');
      });

      // Switch to coach assigned tab and check badge
      const coachTab = await screen.findByText('Coach Assigned (1)');
      fireEvent.click(coachTab);

      await waitFor(() => {
        const coachBadge = screen.getByText('Coach Assigned');
        expect(coachBadge).toBeInTheDocument();
        expect(coachBadge).toHaveClass('bg-success');
      });

      // Switch to templates tab and check badge
      const templatesTab = screen.getByText('Templates (1)');
      fireEvent.click(templatesTab);

      await waitFor(() => {
        const templateBadge = screen.getByText('Template');
        expect(templateBadge).toBeInTheDocument();
        expect(templateBadge).toHaveClass('bg-secondary');
      });
    });
  });

  describe('Empty states', () => {
    test('should show empty state for coach assigned programs when none exist', async () => {
      useAuth.mockReturnValue({
        user: mockUser,
        isAuthenticated: true
      });

      useClientCoach.mockReturnValue({
        hasActiveCoach: true,
        coachRelationship: mockCoachRelationship,
        loading: false,
        error: null
      });

      getUserPrograms.mockResolvedValue(mockPersonalPrograms);
      getClientAssignedPrograms.mockResolvedValue([]);

      render(
        <BrowserRouter>
          <Programs userRole="user" />
        </BrowserRouter>
      );

      // Switch to coach assigned tab
      const coachTab = await screen.findByText('Coach Assigned (0)');
      fireEvent.click(coachTab);

      await waitFor(() => {
        expect(screen.getByText('No programs assigned by your coach yet.')).toBeInTheDocument();
        expect(screen.getByText('Your coach: Coach Smith')).toBeInTheDocument();
      });
    });
  });
});