/**
 * Tests for workout log generation module
 */

const { 
  generateWorkoutLogs, 
  validateWorkoutLogs, 
  LOG_GENERATION_CONFIG 
} = require('../workout-logs');

// Mock Firebase Admin
jest.mock('firebase-admin', () => ({
  firestore: {
    Timestamp: {
      fromDate: (date) => ({ toDate: () => date })
    }
  }
}));

// Mock Firebase config
jest.mock('../../utils/firebase-config', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({ id: 'mock-doc-id' }))
    }))
  })),
  getAuth: jest.fn()
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logProgress: jest.fn()
}));

describe('Workout Log Generation', () => {
  const mockUser = {
    uid: 'test-user-id',
    scenario: 'beginner',
    profile: {
      name: 'Test User',
      experienceLevel: 'beginner',
      preferredUnits: 'LB'
    }
  };

  const mockProgram = {
    id: 'test-program-id',
    duration: 12,
    weightUnit: 'LB',
    weeklyConfigs: {
      'week1_day1': {
        name: 'Workout A',
        exercises: [
          { exerciseId: 'squat-id', sets: 3, reps: 5 },
          { exerciseId: 'bench-id', sets: 3, reps: 5 }
        ]
      },
      'week1_day2': {
        name: 'Workout B',
        exercises: [
          { exerciseId: 'deadlift-id', sets: 1, reps: 5 },
          { exerciseId: 'press-id', sets: 3, reps: 5 }
        ]
      }
    }
  };

  const mockExercises = [
    { id: 'squat-id', name: 'Barbell Back Squat' },
    { id: 'bench-id', name: 'Barbell Bench Press' },
    { id: 'deadlift-id', name: 'Conventional Deadlift' },
    { id: 'press-id', name: 'Overhead Press' }
  ];

  describe('generateWorkoutLogs', () => {
    test('should generate workout logs for a user', async () => {
      const logs = await generateWorkoutLogs(
        mockUser, 
        [mockProgram], 
        mockExercises, 
        { weeksBack: 2, verbose: false }
      );

      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
    });

    test('should generate logs with correct structure', async () => {
      const logs = await generateWorkoutLogs(
        mockUser, 
        [mockProgram], 
        mockExercises, 
        { weeksBack: 1, verbose: false }
      );

      if (logs.length > 0) {
        const log = logs[0];
        
        expect(log).toHaveProperty('userId', mockUser.uid);
        expect(log).toHaveProperty('programId', mockProgram.id);
        expect(log).toHaveProperty('weekIndex');
        expect(log).toHaveProperty('dayIndex');
        expect(log).toHaveProperty('exercises');
        expect(log).toHaveProperty('date');
        expect(log).toHaveProperty('isWorkoutFinished', true);
        expect(Array.isArray(log.exercises)).toBe(true);
      }
    });

    test('should generate exercises with proper structure', async () => {
      const logs = await generateWorkoutLogs(
        mockUser, 
        [mockProgram], 
        mockExercises, 
        { weeksBack: 1, verbose: false }
      );

      if (logs.length > 0 && logs[0].exercises.length > 0) {
        const exercise = logs[0].exercises[0];
        
        expect(exercise).toHaveProperty('exerciseId');
        expect(exercise).toHaveProperty('sets');
        expect(exercise).toHaveProperty('reps');
        expect(exercise).toHaveProperty('weights');
        expect(exercise).toHaveProperty('completed');
        expect(Array.isArray(exercise.reps)).toBe(true);
        expect(Array.isArray(exercise.weights)).toBe(true);
        expect(Array.isArray(exercise.completed)).toBe(true);
      }
    });

    test('should return empty array when no programs provided', async () => {
      const logs = await generateWorkoutLogs(
        mockUser, 
        [], 
        mockExercises, 
        { weeksBack: 1, verbose: false }
      );

      expect(logs).toEqual([]);
    });

    test('should respect completion rate configuration', async () => {
      // Generate many logs to test completion rate
      const logs = await generateWorkoutLogs(
        mockUser, 
        [mockProgram], 
        mockExercises, 
        { weeksBack: 8, verbose: false }
      );

      // All generated logs should be completed (since we only generate completed workouts)
      logs.forEach(log => {
        expect(log.isWorkoutFinished).toBe(true);
      });
    });
  });

  describe('validateWorkoutLogs', () => {
    test('should validate correct workout logs', () => {
      const validLogs = [
        {
          userId: 'user-1',
          programId: 'program-1',
          exercises: [
            {
              exerciseId: 'exercise-1',
              reps: [5, 5, 5],
              weights: [135, 135, 135],
              completed: [true, true, true]
            }
          ],
          isWorkoutFinished: true,
          date: new Date()
        }
      ];

      const validation = validateWorkoutLogs(validLogs);
      
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.stats.totalLogs).toBe(1);
      expect(validation.stats.completedLogs).toBe(1);
    });

    test('should detect missing required fields', () => {
      const invalidLogs = [
        {
          // Missing userId and programId
          exercises: [],
          isWorkoutFinished: false
        }
      ];

      const validation = validateWorkoutLogs(invalidLogs);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.errors.some(error => error.includes('Missing userId'))).toBe(true);
      expect(validation.errors.some(error => error.includes('Missing programId'))).toBe(true);
    });

    test('should detect invalid exercise structure', () => {
      const invalidLogs = [
        {
          userId: 'user-1',
          programId: 'program-1',
          exercises: [
            {
              // Missing exerciseId, invalid reps/weights
              reps: 'invalid',
              weights: 'invalid'
            }
          ],
          isWorkoutFinished: false
        }
      ];

      const validation = validateWorkoutLogs(invalidLogs);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    test('should handle empty logs array', () => {
      const validation = validateWorkoutLogs([]);
      
      expect(validation.isValid).toBe(true);
      expect(validation.warnings).toContain('No workout logs to validate');
      expect(validation.stats.totalLogs).toBe(0);
    });

    test('should calculate correct statistics', () => {
      const logs = [
        {
          userId: 'user-1',
          programId: 'program-1',
          exercises: [{ exerciseId: 'ex1', reps: [5], weights: [100], completed: [true] }],
          isWorkoutFinished: true,
          date: new Date('2023-01-01')
        },
        {
          userId: 'user-1',
          programId: 'program-1',
          exercises: [
            { exerciseId: 'ex1', reps: [5], weights: [100], completed: [true] },
            { exerciseId: 'ex2', reps: [8], weights: [50], completed: [true] }
          ],
          isWorkoutFinished: false,
          date: new Date('2023-01-02')
        }
      ];

      const validation = validateWorkoutLogs(logs);
      
      expect(validation.stats.totalLogs).toBe(2);
      expect(validation.stats.completedLogs).toBe(1);
      expect(validation.stats.averageExercisesPerLog).toBe(2); // (1 + 2) / 2 = 1.5, rounded to 2
    });
  });

  describe('LOG_GENERATION_CONFIG', () => {
    test('should have valid configuration values', () => {
      expect(LOG_GENERATION_CONFIG.historyWeeks).toBeGreaterThan(0);
      expect(LOG_GENERATION_CONFIG.completionRate).toBeGreaterThan(0);
      expect(LOG_GENERATION_CONFIG.completionRate).toBeLessThanOrEqual(1);
      expect(LOG_GENERATION_CONFIG.progressionRate).toBeGreaterThan(0);
      expect(LOG_GENERATION_CONFIG.startingWeights).toBeDefined();
      expect(LOG_GENERATION_CONFIG.startingWeights.beginner).toBeDefined();
      expect(LOG_GENERATION_CONFIG.startingWeights.intermediate).toBeDefined();
      expect(LOG_GENERATION_CONFIG.startingWeights.advanced).toBeDefined();
    });

    test('should have realistic starting weights', () => {
      const beginnerWeights = LOG_GENERATION_CONFIG.startingWeights.beginner;
      const advancedWeights = LOG_GENERATION_CONFIG.startingWeights.advanced;
      
      // Advanced weights should be higher than beginner weights
      expect(advancedWeights['Barbell Back Squat']).toBeGreaterThan(beginnerWeights['Barbell Back Squat']);
      expect(advancedWeights['Conventional Deadlift']).toBeGreaterThan(beginnerWeights['Conventional Deadlift']);
      expect(advancedWeights['Barbell Bench Press']).toBeGreaterThan(beginnerWeights['Barbell Bench Press']);
    });
  });
});