import {
  calculateTotalWorkouts,
  calculateExerciseFrequency,
  getMostFrequentExercises,
  calculateRecentActivity,
  calculateWorkoutStreak,
  calculateWorkoutFrequencyMetrics,
  calculateTotalSetsAndExercises,
  getWorkoutStatistics
} from '../workoutStatsUtils';

// Mock workout data for testing
const mockWorkouts = [
  {
    id: 'workout1',
    userId: 'user1',
    name: 'Upper Body',
    type: 'quick_workout',
    exercises: [
      { exerciseId: 'ex1', sets: 3, reps: [10, 10, 8], weights: [100, 100, 105], completed: [true, true, true] },
      { exerciseId: 'ex2', sets: 3, reps: [12, 12, 10], weights: [50, 50, 55], completed: [true, true, false] }
    ],
    date: new Date('2024-01-15'),
    completedDate: new Date('2024-01-15'),
    isWorkoutFinished: true
  },
  {
    id: 'workout2',
    userId: 'user1',
    name: 'Lower Body',
    type: 'quick_workout',
    exercises: [
      { exerciseId: 'ex1', sets: 4, reps: [8, 8, 6, 6], weights: [120, 120, 125, 125], completed: [true, true, true, true] },
      { exerciseId: 'ex3', sets: 3, reps: [15, 15, 12], weights: [0, 0, 0], completed: [true, true, true] }
    ],
    date: new Date('2024-01-10'),
    completedDate: new Date('2024-01-10'),
    isWorkoutFinished: true
  },
  {
    id: 'workout3',
    userId: 'user1',
    name: 'Full Body',
    type: 'quick_workout',
    exercises: [
      { exerciseId: 'ex2', sets: 2, reps: [15, 12], weights: [45, 50], completed: [true, true] }
    ],
    date: new Date('2024-01-05'),
    completedDate: new Date('2024-01-05'),
    isWorkoutFinished: true
  }
];

const mockExercisesMetadata = [
  {
    id: 'ex1',
    name: 'Bench Press',
    primaryMuscleGroup: 'Chest',
    exerciseType: 'Barbell',
    isGlobal: true
  },
  {
    id: 'ex2',
    name: 'Dumbbell Row',
    primaryMuscleGroup: 'Back',
    exerciseType: 'Dumbbell',
    isGlobal: true
  },
  {
    id: 'ex3',
    name: 'Push-ups',
    primaryMuscleGroup: 'Chest',
    exerciseType: 'Bodyweight',
    isGlobal: true
  }
];

describe('workoutStatsUtils', () => {
  describe('calculateTotalWorkouts', () => {
    it('should return correct total workout count', () => {
      expect(calculateTotalWorkouts(mockWorkouts)).toBe(3);
    });

    it('should return 0 for empty array', () => {
      expect(calculateTotalWorkouts([])).toBe(0);
    });

    it('should return 0 for non-array input', () => {
      expect(calculateTotalWorkouts(null)).toBe(0);
      expect(calculateTotalWorkouts(undefined)).toBe(0);
      expect(calculateTotalWorkouts('not an array')).toBe(0);
    });
  });

  describe('calculateExerciseFrequency', () => {
    it('should calculate exercise frequency correctly', () => {
      const frequency = calculateExerciseFrequency(mockWorkouts, mockExercisesMetadata);
      
      expect(frequency).toHaveLength(3);
      
      // ex1 appears in 2 workouts, ex2 appears in 2 workouts, ex3 appears in 1 workout
      const ex1Freq = frequency.find(f => f.exerciseId === 'ex1');
      const ex2Freq = frequency.find(f => f.exerciseId === 'ex2');
      const ex3Freq = frequency.find(f => f.exerciseId === 'ex3');
      
      expect(ex1Freq.frequency).toBe(2);
      expect(ex1Freq.name).toBe('Bench Press');
      expect(ex1Freq.percentage).toBe(67); // 2/3 * 100 rounded
      
      expect(ex2Freq.frequency).toBe(2);
      expect(ex2Freq.name).toBe('Dumbbell Row');
      
      expect(ex3Freq.frequency).toBe(1);
      expect(ex3Freq.name).toBe('Push-ups');
      expect(ex3Freq.percentage).toBe(33); // 1/3 * 100 rounded
    });

    it('should handle workouts without exercise metadata', () => {
      const frequency = calculateExerciseFrequency(mockWorkouts, []);
      
      expect(frequency).toHaveLength(3);
      expect(frequency[0].name).toBe('Unknown Exercise');
      expect(frequency[0].primaryMuscleGroup).toBe('Unknown');
    });

    it('should return empty array for empty workouts', () => {
      expect(calculateExerciseFrequency([])).toEqual([]);
      expect(calculateExerciseFrequency(null)).toEqual([]);
    });

    it('should sort by frequency descending', () => {
      const frequency = calculateExerciseFrequency(mockWorkouts, mockExercisesMetadata);
      
      // Should be sorted by frequency (ex1 and ex2 both have 2, ex3 has 1)
      expect(frequency[0].frequency).toBeGreaterThanOrEqual(frequency[1].frequency);
      expect(frequency[1].frequency).toBeGreaterThanOrEqual(frequency[2].frequency);
    });
  });

  describe('getMostFrequentExercises', () => {
    it('should return top N most frequent exercises', () => {
      const topExercises = getMostFrequentExercises(mockWorkouts, mockExercisesMetadata, 2);
      
      expect(topExercises).toHaveLength(2);
      expect(topExercises[0].frequency).toBeGreaterThanOrEqual(topExercises[1].frequency);
    });

    it('should default to 5 exercises if no limit specified', () => {
      const topExercises = getMostFrequentExercises(mockWorkouts, mockExercisesMetadata);
      
      // Should return all 3 exercises since we only have 3 unique exercises
      expect(topExercises).toHaveLength(3);
    });
  });

  describe('calculateRecentActivity', () => {
    beforeEach(() => {
      // Mock current date to be consistent
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-20'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should calculate recent activity correctly', () => {
      const recentActivity = calculateRecentActivity(mockWorkouts, 30);
      
      expect(recentActivity.recentWorkouts).toBe(3); // All workouts are within 30 days
      expect(recentActivity.averageWorkoutsPerWeek).toBeGreaterThan(0);
      expect(recentActivity.lastWorkoutDate).toEqual(new Date('2024-01-15'));
      expect(recentActivity.daysSinceLastWorkout).toBe(5); // 20 - 15 = 5 days
    });

    it('should handle empty workouts array', () => {
      const recentActivity = calculateRecentActivity([]);
      
      expect(recentActivity.recentWorkouts).toBe(0);
      expect(recentActivity.averageWorkoutsPerWeek).toBe(0);
      expect(recentActivity.lastWorkoutDate).toBeNull();
      expect(recentActivity.daysSinceLastWorkout).toBeNull();
      expect(recentActivity.workoutStreak).toBe(0);
    });

    it('should filter workouts by date range', () => {
      const recentActivity = calculateRecentActivity(mockWorkouts, 10); // Only last 10 days
      
      expect(recentActivity.recentWorkouts).toBe(2); // Workouts from 2024-01-15 and 2024-01-10 are within 10 days from 2024-01-20
    });
  });

  describe('calculateWorkoutStreak', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-20'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should calculate workout streak correctly', () => {
      // Create workouts for consecutive days
      const consecutiveWorkouts = [
        { ...mockWorkouts[0], completedDate: new Date('2024-01-19') },
        { ...mockWorkouts[1], completedDate: new Date('2024-01-18') },
        { ...mockWorkouts[2], completedDate: new Date('2024-01-17') }
      ];
      
      const streak = calculateWorkoutStreak(consecutiveWorkouts);
      expect(streak).toBe(3);
    });

    it('should return 0 for empty workouts', () => {
      expect(calculateWorkoutStreak([])).toBe(0);
    });

    it('should handle non-consecutive workouts', () => {
      const streak = calculateWorkoutStreak(mockWorkouts);
      // Since workouts are not on consecutive days, streak should be 0 or 1
      expect(streak).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateWorkoutFrequencyMetrics', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2024-01-20'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should calculate frequency metrics for different periods', () => {
      const metrics = calculateWorkoutFrequencyMetrics(mockWorkouts);
      
      expect(metrics.allTime).toBe(3);
      expect(metrics.last30Days).toBe(3); // All workouts within 30 days
      expect(metrics.last7Days).toBe(1); // Only one workout within 7 days
      expect(metrics.thisMonth).toBe(3); // All workouts in January 2024
      expect(metrics.thisYear).toBe(3); // All workouts in 2024
    });

    it('should handle empty workouts array', () => {
      const metrics = calculateWorkoutFrequencyMetrics([]);
      
      expect(metrics.last7Days).toBe(0);
      expect(metrics.last30Days).toBe(0);
      expect(metrics.last90Days).toBe(0);
      expect(metrics.thisMonth).toBe(0);
      expect(metrics.thisYear).toBe(0);
      expect(metrics.allTime).toBe(0);
    });
  });

  describe('calculateTotalSetsAndExercises', () => {
    it('should calculate total sets and exercises correctly', () => {
      const totals = calculateTotalSetsAndExercises(mockWorkouts);
      
      expect(totals.totalExercises).toBe(5); // 2 + 2 + 1 exercises across workouts
      expect(totals.totalSets).toBe(15); // 3 + 3 + 4 + 3 + 2 sets across all exercises
      expect(totals.averageExercisesPerWorkout).toBe(1.7); // 5/3 rounded to 1 decimal
      expect(totals.averageSetsPerWorkout).toBe(5.0); // 15/3 rounded to 1 decimal
    });

    it('should handle empty workouts array', () => {
      const totals = calculateTotalSetsAndExercises([]);
      
      expect(totals.totalSets).toBe(0);
      expect(totals.totalExercises).toBe(0);
      expect(totals.averageSetsPerWorkout).toBe(0);
      expect(totals.averageExercisesPerWorkout).toBe(0);
    });

    it('should handle workouts without exercises', () => {
      const workoutsWithoutExercises = [
        { id: 'workout1', exercises: [] },
        { id: 'workout2', exercises: null },
        { id: 'workout3' } // No exercises property
      ];
      
      const totals = calculateTotalSetsAndExercises(workoutsWithoutExercises);
      
      expect(totals.totalSets).toBe(0);
      expect(totals.totalExercises).toBe(0);
    });
  });

  describe('getWorkoutStatistics', () => {
    it('should return comprehensive statistics', () => {
      const stats = getWorkoutStatistics(mockWorkouts, mockExercisesMetadata);
      
      expect(stats.totalWorkouts).toBe(3);
      expect(stats.frequentExercises).toHaveLength(3);
      expect(stats.recentActivity).toBeDefined();
      expect(stats.frequencyMetrics).toBeDefined();
      expect(stats.setsAndExercises).toBeDefined();
      expect(stats.hasData).toBe(true);
    });

    it('should indicate no data for empty workouts', () => {
      const stats = getWorkoutStatistics([], mockExercisesMetadata);
      
      expect(stats.totalWorkouts).toBe(0);
      expect(stats.hasData).toBe(false);
    });
  });
});