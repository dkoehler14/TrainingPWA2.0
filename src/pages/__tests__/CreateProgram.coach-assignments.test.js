import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock all dependencies before importing the component
jest.mock('../../hooks/useAuth');
jest.mock('../../hooks/useRoleChecking');
jest.mock('../../hooks/useNumberInput');
jest.mock('../../hooks/useFormPersistence');
jest.mock('../../services/coachService');
jest.mock('../../services/exerciseService');
jest.mock('../../services/programService');
jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
      onAuthStateChange: jest.fn()
    }
  }
}));
jest.mock('../../api/supabaseCache');
jest.mock('../../utils/dataTransformations');
jest.mock('../../utils/programUtils');

// Mock missing components
jest.mock('../../components/ExerciseCreationModal', () => {
  return function MockExerciseCreationModal() {
    return <div data-testid="exercise-creation-modal">Exercise Creation Modal</div>;
  };
});

jest.mock('../../components/ExerciseGrid', () => {
  return function MockExerciseGrid() {
    return <div data-testid="exercise-grid">Exercise Grid</div>;
  };
});

jest.mock('../../components/AutoSaveIndicator', () => {
  return function MockAutoSaveIndicator() {
    return <div data-testid="auto-save-indicator">Auto Save Indicator</div>;
  };
});

// Mock React Router hooks
jest.mock('react-router-dom', () => ({
  useParams: () => ({}),
  useNavigate: () => jest.fn()
}));

// Mock DnD Kit components
jest.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div>{children}</div>,
  closestCenter: jest.fn(),
  KeyboardSensor: jest.fn(),
  PointerSensor: jest.fn(),
  useSensor: jest.fn(),
  useSensors: jest.fn(() => []),
  DragOverlay: ({ children }) => <div>{children}</div>,
  defaultDropAnimationSideEffects: {}
}));

jest.mock('@dnd-kit/sortable', () => ({
  arrayMove: jest.fn((arr, from, to) => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  }),
  SortableContext: ({ children }) => <div>{children}</div>,
  sortableKeyboardCoordinates: jest.fn(),
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: jest.fn(),
    transform: null,
    transition: null,
    isDragging: false
  })
}));

jest.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: jest.fn(() => '')
    }
  }
}));

import CreateProgram from '../CreateProgram';
import { useAuth } from '../../hooks/useAuth';
import { useIsCoach } from '../../hooks/useRoleChecking';
import { getCoachClients } from '../../services/coachService';

// Error boundary to catch rendering errors
class TestErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Test Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div data-testid="error-boundary">Error: {this.state.error?.message}</div>;
    }

    return this.props.children;
  }
}

const mockUser = {
  id: 'coach-1',
  name: 'Coach Test',
  email: 'coach@test.com'
};

const mockClients = [
  {
    id: 'rel-1',
    client: {
      id: 'client-1',
      name: 'John Doe',
      email: 'john@test.com'
    }
  },
  {
    id: 'rel-2',
    client: {
      id: 'client-2',
      name: 'Jane Smith',
      email: 'jane@test.com'
    }
  }
];

const renderCreateProgram = () => {
  return render(
    <TestErrorBoundary>
      <CreateProgram />
    </TestErrorBoundary>
  );
};

describe('CreateProgram Coach Assignments', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Mock useAuth
    useAuth.mockReturnValue({
      user: mockUser,
      isAuthenticated: true,
      userRole: 'coach'
    });
    
    // Mock useIsCoach
    useIsCoach.mockReturnValue({
      hasRole: true,
      isChecking: false,
      error: null
    });
    
    // Mock useNumberInput
    const mockUseNumberInput = require('../../hooks/useNumberInput');
    mockUseNumberInput.useNumberInput = jest.fn();
    
    // Mock useFormPersistence
    const mockUseFormPersistence = require('../../hooks/useFormPersistence');
    mockUseFormPersistence.useFormPersistence = jest.fn().mockReturnValue({
      clearSavedState: jest.fn()
    });
    
    // Mock coach service
    getCoachClients.mockResolvedValue(mockClients);
    
    // Mock other services
    const mockExerciseService = require('../../services/exerciseService');
    mockExerciseService.getAvailableExercises = jest.fn().mockResolvedValue([]);
    
    const mockProgramService = require('../../services/programService');
    mockProgramService.getUserPrograms = jest.fn().mockResolvedValue([]);
    mockProgramService.getProgramTemplates = jest.fn().mockResolvedValue([]);
    mockProgramService.createCompleteProgram = jest.fn().mockResolvedValue({});
    mockProgramService.updateCompleteProgram = jest.fn().mockResolvedValue({});
    mockProgramService.getProgramById = jest.fn().mockResolvedValue(null);
    
    // Mock cache functions
    const mockSupabaseCache = require('../../api/supabaseCache');
    mockSupabaseCache.invalidateProgramCache = jest.fn();
    
    // Mock transformations
    const mockDataTransformations = require('../../utils/dataTransformations');
    mockDataTransformations.transformSupabaseExercises = jest.fn().mockReturnValue([]);
    
    const mockProgramUtils = require('../../utils/programUtils');
    mockProgramUtils.parseWeeklyConfigs = jest.fn();
    
    // Mock window resize
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    
    // Mock addEventListener
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('displays coach assignment section for coaches', async () => {
    // Create a version of CreateProgram that starts at step 3
    const CreateProgramStep3 = () => {
      return <CreateProgram mode="create" />;
    };
    
    render(<CreateProgramStep3 />);
    
    // Wait for component to load
    await waitFor(() => {
      // Look for any element that indicates the component loaded
      const programNameInput = screen.queryByPlaceholderText('Enter program name');
      if (programNameInput) {
        return;
      }
      // If we can find the stepper, click on step 3 or "Start from Scratch"
      const startFromScratchBtn = screen.queryByText('Start from Scratch');
      if (startFromScratchBtn) {
        fireEvent.click(startFromScratchBtn);
        return;
      }
      throw new Error('Component not loading');
    }, { timeout: 3000 });

    // Check if coach assignment section is visible
    await waitFor(() => {
      expect(screen.getByText('Coach Assignment')).toBeInTheDocument();
    });
    
    expect(screen.getByText('Assign to Client')).toBeInTheDocument();
    expect(screen.getByText('Program Difficulty')).toBeInTheDocument();
    expect(screen.getByText('Expected Duration (weeks)')).toBeInTheDocument();
    expect(screen.getByText('Client Goals')).toBeInTheDocument();
    expect(screen.getByText('Coach Notes')).toBeInTheDocument();
  });

  test('loads and displays coach clients in dropdown', async () => {
    renderCreateProgram();
    
    await waitFor(() => {
      const startFromScratchBtn = screen.getByText('Start from Scratch');
      fireEvent.click(startFromScratchBtn);
    });

    await waitFor(() => {
      expect(getCoachClients).toHaveBeenCalledWith(mockUser.id);
    });

    // Check if clients are in the dropdown
    const clientSelect = screen.getByDisplayValue('');
    expect(clientSelect).toBeInTheDocument();
    
    // Check if options are available (they should be in the select element)
    fireEvent.click(clientSelect);
    await waitFor(() => {
      expect(screen.getByText('John Doe (john@test.com)')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith (jane@test.com)')).toBeInTheDocument();
    });
  });

  test('allows adding and removing client goals', async () => {
    renderCreateProgram();
    
    await waitFor(() => {
      const startFromScratchBtn = screen.getByText('Start from Scratch');
      fireEvent.click(startFromScratchBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Coach Assignment')).toBeInTheDocument();
    });

    // Add a goal
    const goalInput = screen.getByPlaceholderText('Add a goal');
    const addButton = screen.getByText('Add');
    
    fireEvent.change(goalInput, { target: { value: 'Lose 10 pounds' } });
    fireEvent.click(addButton);
    
    // Check if goal was added
    expect(screen.getByText('Lose 10 pounds')).toBeInTheDocument();
    
    // Add another goal by pressing Enter
    fireEvent.change(goalInput, { target: { value: 'Build muscle' } });
    fireEvent.keyDown(goalInput, { key: 'Enter' });
    
    expect(screen.getByText('Build muscle')).toBeInTheDocument();
    
    // Remove a goal
    const closeButtons = screen.getAllByRole('button', { name: '' }); // Close buttons
    const goalCloseButton = closeButtons.find(btn => 
      btn.className.includes('btn-close') && 
      btn.closest('.goal-badge')
    );
    
    if (goalCloseButton) {
      fireEvent.click(goalCloseButton);
    }
  });

  test('sets program difficulty and expected duration', async () => {
    renderCreateProgram();
    
    await waitFor(() => {
      const startFromScratchBtn = screen.getByText('Start from Scratch');
      fireEvent.click(startFromScratchBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Coach Assignment')).toBeInTheDocument();
    });

    // Set difficulty
    const difficultySelect = screen.getByDisplayValue('Intermediate');
    fireEvent.change(difficultySelect, { target: { value: 'advanced' } });
    expect(difficultySelect.value).toBe('advanced');
    
    // Set expected duration
    const durationInput = screen.getByPlaceholderText('e.g., 12');
    fireEvent.change(durationInput, { target: { value: '16' } });
    expect(durationInput.value).toBe('16');
  });

  test('allows entering coach notes', async () => {
    renderCreateProgram();
    
    await waitFor(() => {
      const startFromScratchBtn = screen.getByText('Start from Scratch');
      fireEvent.click(startFromScratchBtn);
    });

    await waitFor(() => {
      expect(screen.getByText('Coach Assignment')).toBeInTheDocument();
    });

    const notesTextarea = screen.getByPlaceholderText(/Add notes about this program/);
    const testNotes = 'Focus on compound movements and progressive overload';
    
    fireEvent.change(notesTextarea, { target: { value: testNotes } });
    expect(notesTextarea.value).toBe(testNotes);
  });

  test('does not display coach assignment section for non-coaches', () => {
    useIsCoach.mockReturnValue({
      hasRole: false,
      isChecking: false,
      error: null
    });
    
    renderCreateProgram();
    
    // Coach assignment section should not be visible
    expect(screen.queryByText('Coach Assignment')).not.toBeInTheDocument();
  });
});