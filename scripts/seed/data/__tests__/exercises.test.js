/**
 * Tests for exercise database seeding module
 */

const { 
  seedExercises, 
  getAllExercises, 
  clearExerciseData, 
  EXERCISE_DATABASE, 
  MUSCLE_GROUPS, 
  EXERCISE_TYPES 
} = require('../exercises');

// Mock Firebase Admin SDK
jest.mock('../../utils/firebase-config', () => ({
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        id: 'mock-exercise-id',
        set: jest.fn()
      })),
      get: jest.fn(() => ({
        docs: []
      }))
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn()
    }))
  }))
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logProgress: jest.fn()
}));

describe('Exercise Database Seeding', () => {
  describe('EXERCISE_DATABASE structure', () => {
    test('should have all required categories', () => {
      expect(EXERCISE_DATABASE).toHaveProperty('compound');
      expect(EXERCISE_DATABASE).toHaveProperty('isolation');
      expect(EXERCISE_DATABASE).toHaveProperty('bodyweight');
      expect(EXERCISE_DATABASE).toHaveProperty('machine');
    });

    test('should have compound exercises with required fields', () => {
      const compoundExercises = EXERCISE_DATABASE.compound;
      expect(compoundExercises.length).toBeGreaterThan(0);
      
      compoundExercises.forEach(exercise => {
        expect(exercise).toHaveProperty('name');
        expect(exercise).toHaveProperty('primaryMuscleGroup');
        expect(exercise).toHaveProperty('exerciseType');
        expect(exercise).toHaveProperty('instructions');
        expect(typeof exercise.name).toBe('string');
        expect(typeof exercise.primaryMuscleGroup).toBe('string');
        expect(typeof exercise.exerciseType).toBe('string');
        expect(typeof exercise.instructions).toBe('string');
      });
    });

    test('should include major movement patterns', () => {
      const compoundNames = EXERCISE_DATABASE.compound.map(ex => ex.name.toLowerCase());
      
      // Check for major movement patterns mentioned in requirements
      expect(compoundNames.some(name => name.includes('squat'))).toBe(true);
      expect(compoundNames.some(name => name.includes('deadlift'))).toBe(true);
      expect(compoundNames.some(name => name.includes('bench press'))).toBe(true);
      expect(compoundNames.some(name => name.includes('overhead press') || name.includes('press'))).toBe(true);
      expect(compoundNames.some(name => name.includes('row'))).toBe(true);
    });

    test('should use valid muscle groups', () => {
      const allExercises = [
        ...EXERCISE_DATABASE.compound,
        ...EXERCISE_DATABASE.isolation,
        ...EXERCISE_DATABASE.bodyweight,
        ...EXERCISE_DATABASE.machine
      ];

      allExercises.forEach(exercise => {
        expect(MUSCLE_GROUPS).toContain(exercise.primaryMuscleGroup);
      });
    });

    test('should use valid exercise types', () => {
      const allExercises = [
        ...EXERCISE_DATABASE.compound,
        ...EXERCISE_DATABASE.isolation,
        ...EXERCISE_DATABASE.bodyweight,
        ...EXERCISE_DATABASE.machine
      ];

      allExercises.forEach(exercise => {
        expect(EXERCISE_TYPES).toContain(exercise.exerciseType);
      });
    });
  });

  describe('MUSCLE_GROUPS constant', () => {
    test('should include all required muscle groups', () => {
      const expectedGroups = [
        'Back', 'Biceps', 'Triceps', 'Chest', 'Shoulders',
        'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves'
      ];
      
      expectedGroups.forEach(group => {
        expect(MUSCLE_GROUPS).toContain(group);
      });
    });
  });

  describe('EXERCISE_TYPES constant', () => {
    test('should include all required exercise types', () => {
      const expectedTypes = [
        'Dumbbell', 'Barbell', 'Cable', 'Bodyweight Only', 
        'Bodyweight Loadable', 'Machine'
      ];
      
      expectedTypes.forEach(type => {
        expect(EXERCISE_TYPES).toContain(type);
      });
    });
  });

  describe('seedExercises function', () => {
    test('should return seeding results with correct structure', async () => {
      const result = await seedExercises({ verbose: false });
      
      expect(result).toHaveProperty('totalExercises');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('muscleGroups');
      expect(result).toHaveProperty('exerciseTypes');
      
      expect(result.categories).toHaveProperty('compound');
      expect(result.categories).toHaveProperty('isolation');
      expect(result.categories).toHaveProperty('bodyweight');
      expect(result.categories).toHaveProperty('machine');
      
      expect(Array.isArray(result.muscleGroups)).toBe(true);
      expect(Array.isArray(result.exerciseTypes)).toBe(true);
    });

    test('should calculate correct totals', async () => {
      const result = await seedExercises({ verbose: false });
      
      const expectedTotal = 
        EXERCISE_DATABASE.compound.length +
        EXERCISE_DATABASE.isolation.length +
        EXERCISE_DATABASE.bodyweight.length +
        EXERCISE_DATABASE.machine.length;
      
      expect(result.totalExercises).toBe(expectedTotal);
      expect(result.categories.compound).toBe(EXERCISE_DATABASE.compound.length);
      expect(result.categories.isolation).toBe(EXERCISE_DATABASE.isolation.length);
      expect(result.categories.bodyweight).toBe(EXERCISE_DATABASE.bodyweight.length);
      expect(result.categories.machine).toBe(EXERCISE_DATABASE.machine.length);
    });
  });

  describe('Exercise data quality', () => {
    test('should have meaningful exercise instructions', () => {
      const allExercises = [
        ...EXERCISE_DATABASE.compound,
        ...EXERCISE_DATABASE.isolation,
        ...EXERCISE_DATABASE.bodyweight,
        ...EXERCISE_DATABASE.machine
      ];

      allExercises.forEach(exercise => {
        expect(exercise.instructions.length).toBeGreaterThan(20);
        expect(exercise.instructions).not.toContain('TODO');
        expect(exercise.instructions).not.toContain('placeholder');
      });
    });

    test('should have unique exercise names', () => {
      const allExercises = [
        ...EXERCISE_DATABASE.compound,
        ...EXERCISE_DATABASE.isolation,
        ...EXERCISE_DATABASE.bodyweight,
        ...EXERCISE_DATABASE.machine
      ];

      const names = allExercises.map(ex => ex.name);
      const uniqueNames = [...new Set(names)];
      
      expect(names.length).toBe(uniqueNames.length);
    });

    test('should have appropriate exercise types for categories', () => {
      // Compound exercises should primarily use barbells
      const compoundTypes = EXERCISE_DATABASE.compound.map(ex => ex.exerciseType);
      expect(compoundTypes.filter(type => type === 'Barbell').length).toBeGreaterThan(0);

      // Bodyweight exercises should use bodyweight types
      const bodyweightTypes = EXERCISE_DATABASE.bodyweight.map(ex => ex.exerciseType);
      bodyweightTypes.forEach(type => {
        expect(['Bodyweight Only', 'Bodyweight Loadable'].includes(type)).toBe(true);
      });

      // Machine exercises should use machine types
      const machineTypes = EXERCISE_DATABASE.machine.map(ex => ex.exerciseType);
      machineTypes.forEach(type => {
        expect(['Machine', 'Cable'].includes(type)).toBe(true);
      });
    });
  });
});