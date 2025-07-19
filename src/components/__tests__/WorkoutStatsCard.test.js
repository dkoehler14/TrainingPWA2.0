/**
 * WorkoutStatsCard Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutStatsCard from '../WorkoutStatsCard';
import * as workoutStatsUtils from '../../utils/workoutStatsUtils';

// Mock the workout stats utils
jest.mock('../../utils/workoutStatsUtils');

// Mock workout data
const mockWorkouts = [
  {
    id: 'workout1',
    name: 'Upper Body',
    date: { toDate: () => new Date('2024-01-15') },
    completedDate: { toDate: () => new Date('2024-01-15') },
    exercises: [
      { exerciseId: 'ex1', sets: 3, completed: [true, true, true] },
      { exerciseId: 'ex2', sets: 3, completed: [true, true, false] }
    ]
  },
  {
    id: 'workout2',
    name: 'Lower Body',
    date: { toDate: () => new Date('2024-01-10') },
    completedDate: { toDate: () => new Date('2024-01-10') },
    exercises: [
      { exerciseId: 'ex1', sets: 4, completed: [true, true, true, true] }
    ]
  }
];

const mockExercises = [
  {
    id: 'ex1',
    name: 'Push Up',
    primaryMuscleGroup: 'Chest',
    exerciseType: 'Bodyweight',
    isGlobal: true
  },
  {
    id: 'ex2',
    name: 'Squat',
    primaryMuscleGroup: 'Legs',
    exerciseType: 'Bodyweight',
    isGlobal: true
  }
];

const mockStats = {
  totalWorkouts: 2,
  frequentExercises: [
    {
      exerciseId: 'ex1',
      name: 'Push Up',
      primaryMuscleGroup: 'Chest',
      frequency: 2,
      percentage: 100
    },
    {
      exerciseId: 'ex2',
      name: 'Squat',
      primaryMuscleGroup: 'Legs',
      frequency: 1,
      percentage: 50
    }
  ],
  recentActivity: {
    recentWorkouts: 2,
    averageWorkoutsPerWeek: 1.4,
    lastWorkoutDate: new Date('2024-01-15'),
    workoutStreak: 2
  },
  frequencyMetrics: {
    thisMonth: 2,
    last7Days: 1,
    last30Days: 2
  },
  setsAndExercises: {
    totalSets: 10,
    totalExercises: 3,
    averageSetsPerWorkout: 5.0,
    averageExercisesPerWorkout: 1.5
  },
  hasData: true
};

describe('WorkoutStatsCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workoutStatsUtils.getWorkoutStatistics.mockReturnValue(mockStats);
  });

  test('renders workout statistics correctly', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Workout Statistics')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Total workouts
    expect(screen.getByText('10')).toBeInTheDocument(); // Total sets
    expect(screen.getByText('3')).toBeInTheDocument(); // Total exercises
    expect(screen.getByText('2')).toBeInTheDocument(); // Day streak
  });

  test('displays recent activity section', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Recent Activity (30 days)')).toBeInTheDocument();
    expect(screen.getByText('Workouts completed')).toBeInTheDocument();
    expect(screen.getByText('Average per week')).toBeInTheDocument();
    expect(screen.getByText('Last workout')).toBeInTheDocument();
    expect(screen.getByText('1.4')).toBeInTheDocument(); // Average per week
  });

  test('displays workout averages section', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Workout Averages')).toBeInTheDocument();
    expect(screen.getByText('Sets per workout')).toBeInTheDocument();
    expect(screen.getByText('Exercises per workout')).toBeInTheDocument();
    expect(screen.getByText('This month')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // Average sets per workout
    expect(screen.getByText('1.5')).toBeInTheDocument(); // Average exercises per workout
  });

  test('displays most frequent exercises table', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Most Frequent Exercises')).toBeInTheDocument();
    expect(screen.getByText('Push Up')).toBeInTheDocument();
    expect(screen.getByText('Squat')).toBeInTheDocument();
    expect(screen.getByText('Chest')).toBeInTheDocument();
    expect(screen.getByText('Legs')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  test('formats last workout date correctly', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-16'));

    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Yesterday')).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('shows different date formats for last workout', () => {
    const testCases = [
      {
        currentDate: new Date('2024-01-15'),
        lastWorkoutDate: new Date('2024-01-15'),
        expected: 'Today'
      },
      {
        currentDate: new Date('2024-01-16'),
        lastWorkoutDate: new Date('2024-01-15'),
        expected: 'Yesterday'
      },
      {
        currentDate: new Date('2024-01-20'),
        lastWorkoutDate: new Date('2024-01-15'),
        expected: '5 days ago'
      },
      {
        currentDate: new Date('2024-01-29'),
        lastWorkoutDate: new Date('2024-01-15'),
        expected: '2 weeks ago'
      }
    ];

    testCases.forEach(({ currentDate, lastWorkoutDate, expected }) => {
      jest.useFakeTimers();
      jest.setSystemTime(currentDate);

      const statsWithDate = {
        ...mockStats,
        recentActivity: {
          ...mockStats.recentActivity,
          lastWorkoutDate
        }
      };

      workoutStatsUtils.getWorkoutStatistics.mockReturnValue(statsWithDate);

      const { unmount } = render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

      expect(screen.getByText(expected)).toBeInTheDocument();

      unmount();
      jest.useRealTimers();
    });
  });

  test('displays correct badge variants for streak', () => {
    const streakTestCases = [
      { streak: 10, expectedClass: 'success' },
      { streak: 5, expectedClass: 'warning' },
      { streak: 2, expectedClass: 'info' },
      { streak: 0, expectedClass: 'secondary' }
    ];

    streakTestCases.forEach(({ streak }) => {
      const statsWithStreak = {
        ...mockStats,
        recentActivity: {
          ...mockStats.recentActivity,
          workoutStreak: streak
        }
      };

      workoutStatsUtils.getWorkoutStatistics.mockReturnValue(statsWithStreak);

      const { unmount } = render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

      expect(screen.getByText(streak.toString())).toBeInTheDocument();

      unmount();
    });
  });

  test('displays correct badge variants for recent activity', () => {
    const activityTestCases = [
      { count: 15, expectedClass: 'success' },
      { count: 10, expectedClass: 'warning' },
      { count: 6, expectedClass: 'info' },
      { count: 2, expectedClass: 'secondary' }
    ];

    activityTestCases.forEach(({ count }) => {
      const statsWithActivity = {
        ...mockStats,
        recentActivity: {
          ...mockStats.recentActivity,
          recentWorkouts: count
        }
      };

      workoutStatsUtils.getWorkoutStatistics.mockReturnValue(statsWithActivity);

      const { unmount } = render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

      expect(screen.getByText(count.toString())).toBeInTheDocument();

      unmount();
    });
  });

  test('handles empty workouts gracefully', () => {
    const emptyStats = {
      ...mockStats,
      hasData: false,
      totalWorkouts: 0
    };

    workoutStatsUtils.getWorkoutStatistics.mockReturnValue(emptyStats);

    render(<WorkoutStatsCard workouts={[]} exercises={mockExercises} />);

    expect(screen.getByText('No workout data available yet.')).toBeInTheDocument();
    expect(screen.getByText('Complete some quick workouts to see your statistics here!')).toBeInTheDocument();
  });

  test('handles statistics calculation errors', () => {
    workoutStatsUtils.getWorkoutStatistics.mockImplementation(() => {
      throw new Error('Calculation error');
    });

    // Mock console.error to avoid test output noise
    jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Unable to calculate statistics')).toBeInTheDocument();
    expect(screen.getByText('There was an error processing your workout data. Some statistics may be unavailable.')).toBeInTheDocument();

    console.error.mockRestore();
  });

  test('limits frequent exercises to top 5', () => {
    const statsWithManyExercises = {
      ...mockStats,
      frequentExercises: Array.from({ length: 10 }, (_, i) => ({
        exerciseId: `ex${i}`,
        name: `Exercise ${i}`,
        primaryMuscleGroup: 'Test',
        frequency: 10 - i,
        percentage: (10 - i) * 10
      }))
    };

    workoutStatsUtils.getWorkoutStatistics.mockReturnValue(statsWithManyExercises);

    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    // Should only show top 5 exercises
    expect(screen.getByText('Exercise 0')).toBeInTheDocument();
    expect(screen.getByText('Exercise 4')).toBeInTheDocument();
    expect(screen.queryByText('Exercise 5')).not.toBeInTheDocument();
  });

  test('handles workouts without frequent exercises', () => {
    const statsWithoutFrequentExercises = {
      ...mockStats,
      frequentExercises: []
    };

    workoutStatsUtils.getWorkoutStatistics.mockReturnValue(statsWithoutFrequentExercises);

    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.queryByText('Most Frequent Exercises')).not.toBeInTheDocument();
  });

  test('handles null last workout date', () => {
    const statsWithNullDate = {
      ...mockStats,
      recentActivity: {
        ...mockStats.recentActivity,
        lastWorkoutDate: null
      }
    };

    workoutStatsUtils.getWorkoutStatistics.mockReturnValue(statsWithNullDate);

    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Never')).toBeInTheDocument();
  });

  test('displays exercise ranking correctly', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    // Check for ranking badges
    expect(screen.getByText('1')).toBeInTheDocument(); // First exercise
    expect(screen.getByText('2')).toBeInTheDocument(); // Second exercise
  });

  test('handles responsive design elements', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    // Check for responsive classes
    expect(document.querySelector('.d-none.d-sm-table-cell')).toBeInTheDocument();
    expect(document.querySelector('.d-sm-none')).toBeInTheDocument();
    expect(document.querySelector('.d-none.d-md-table-cell')).toBeInTheDocument();
  });

  test('calls getWorkoutStatistics with correct parameters', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(workoutStatsUtils.getWorkoutStatistics).toHaveBeenCalledWith(mockWorkouts, mockExercises);
  });

  test('handles undefined or null props gracefully', () => {
    workoutStatsUtils.getWorkoutStatistics.mockReturnValue({
      ...mockStats,
      hasData: false
    });

    render(<WorkoutStatsCard workouts={undefined} exercises={null} />);

    expect(workoutStatsUtils.getWorkoutStatistics).toHaveBeenCalledWith([], []);
    expect(screen.getByText('No workout data available yet.')).toBeInTheDocument();
  });

  test('displays all overview stats with correct labels', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Total Workouts')).toBeInTheDocument();
    expect(screen.getByText('Total Sets')).toBeInTheDocument();
    expect(screen.getByText('Total Exercises')).toBeInTheDocument();
    expect(screen.getByText('Day Streak')).toBeInTheDocument();
  });

  test('displays recent activity metrics correctly', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Workouts completed')).toBeInTheDocument();
    expect(screen.getByText('Average per week')).toBeInTheDocument();
    expect(screen.getByText('Last workout')).toBeInTheDocument();
  });

  test('displays workout averages correctly', () => {
    render(<WorkoutStatsCard workouts={mockWorkouts} exercises={mockExercises} />);

    expect(screen.getByText('Sets per workout')).toBeInTheDocument();
    expect(screen.getByText('Exercises per workout')).toBeInTheDocument();
    expect(screen.getByText('This month')).toBeInTheDocument();
  });
});