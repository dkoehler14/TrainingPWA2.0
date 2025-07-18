/**
 * Tests for workout program seeding functionality
 */

const { 
  seedPrograms, 
  getAllPrograms, 
  clearProgramData, 
  PROGRAM_TEMPLATES,
  getProgramTemplateForUser 
} = require('../programs');
const { seedExercises } = require('../exercises');
const { initializeFirebase } = require('../../utils/firebase-config');

// Mock test users
const mockUsers = [
  {
    uid: 'test-beginner-uid',
    scenario: 'beginner',
    profile: {
      name: 'Test Beginner',
      experienceLevel: 'beginner',
      preferredUnits: 'LB',
      availableEquipment: ['barbell', 'bench', 'squat_rack']
    }
  },
  {
    uid: 'test-intermediate-uid',
    scenario: 'intermediate',
    profile: {
      name: 'Test Intermediate',
      experienceLevel: 'intermediate',
      preferredUnits: 'LB',
      availableEquipment: ['barbell', 'dumbbells', 'bench', 'squat_rack', 'plates']
    }
  },
  {
    uid: 'test-advanced-uid',
    scenario: 'advanced',
    profile: {
      name: 'Test Advanced',
      experienceLevel: 'advanced',
      preferredUnits: 'KG',
      availableEquipment: ['barbell', 'dumbbells', 'bench', 'squat_rack', 'plates', 'specialty_bars']
    }
  }
];

describe('Program Seeding', () => {
  beforeAll(async () => {
    // Initialize Firebase for testing
    initializeFirebase();
    
    // Seed exercises first (required for program creation)
    await seedExercises({ verbose: false });
  });

  afterAll(async () => {
    // Clean up test data
    await clearProgramData();
  });

  beforeEach(async () => {
    // Clear programs before each test
    await clearProgramData();
  });

  describe('Program Templates', () => {
    test('should have templates for all experience levels', () => {
      expect(PROGRAM_TEMPLATES.beginner).toBeDefined();
      expect(PROGRAM_TEMPLATES.intermediate).toBeDefined();
      expect(PROGRAM_TEMPLATES.advanced).toBeDefined();
    });

    test('beginner template should have correct structure', () => {
      const template = PROGRAM_TEMPLATES.beginner;
      expect(template.name).toBe('Starting Strength');
      expect(template.difficulty).toBe('beginner');
      expect(template.daysPerWeek).toBe(3);
      expect(template.duration).toBe(12);
      expect(template.workoutStructure).toBeDefined();
    });

    test('intermediate template should have correct structure', () => {
      const template = PROGRAM_TEMPLATES.intermediate;
      expect(template.name).toBe('5/3/1 for Beginners');
      expect(template.difficulty).toBe('intermediate');
      expect(template.daysPerWeek).toBe(4);
      expect(template.duration).toBe(16);
    });

    test('advanced template should have correct structure', () => {
      const template = PROGRAM_TEMPLATES.advanced;
      expect(template.name).toBe('Conjugate Method');
      expect(template.difficulty).toBe('advanced');
      expect(template.daysPerWeek).toBe(4);
      expect(template.duration).toBe(20);
      expect(template.weightUnit).toBe('KG');
    });
  });

  describe('Template Selection', () => {
    test('should return correct template for experience level', () => {
      expect(getProgramTemplateForUser('beginner')).toBe(PROGRAM_TEMPLATES.beginner);
      expect(getProgramTemplateForUser('intermediate')).toBe(PROGRAM_TEMPLATES.intermediate);
      expect(getProgramTemplateForUser('advanced')).toBe(PROGRAM_TEMPLATES.advanced);
    });

    test('should default to beginner for unknown experience level', () => {
      expect(getProgramTemplateForUser('unknown')).toBe(PROGRAM_TEMPLATES.beginner);
      expect(getProgramTemplateForUser(null)).toBe(PROGRAM_TEMPLATES.beginner);
    });
  });

  describe('Program Seeding', () => {
    test('should create programs for all users', async () => {
      const results = await seedPrograms(mockUsers, { verbose: false });
      
      expect(results.totalPrograms).toBe(3);
      expect(results.programsByLevel.beginner).toBe(1);
      expect(results.programsByLevel.intermediate).toBe(1);
      expect(results.programsByLevel.advanced).toBe(1);
    });

    test('should create programs with correct user associations', async () => {
      await seedPrograms(mockUsers, { verbose: false });
      
      const allPrograms = await getAllPrograms();
      expect(allPrograms).toHaveLength(3);
      
      // Check that each user has a program
      const beginnerProgram = allPrograms.find(p => p.userId === 'test-beginner-uid');
      const intermediateProgram = allPrograms.find(p => p.userId === 'test-intermediate-uid');
      const advancedProgram = allPrograms.find(p => p.userId === 'test-advanced-uid');
      
      expect(beginnerProgram).toBeDefined();
      expect(intermediateProgram).toBeDefined();
      expect(advancedProgram).toBeDefined();
    });

    test('should create programs with correct properties', async () => {
      await seedPrograms(mockUsers, { verbose: false });
      
      const beginnerProgram = (await getAllPrograms()).find(p => p.userId === 'test-beginner-uid');
      
      expect(beginnerProgram.name).toBe('Starting Strength');
      expect(beginnerProgram.difficulty).toBe('beginner');
      expect(beginnerProgram.isCurrent).toBe(true);
      expect(beginnerProgram.isActive).toBe(true);
      expect(beginnerProgram.weightUnit).toBe('LB');
      expect(beginnerProgram.weeklyConfigs).toBeDefined();
      expect(Object.keys(beginnerProgram.weeklyConfigs).length).toBeGreaterThan(0);
    });

    test('should respect user weight unit preferences', async () => {
      await seedPrograms(mockUsers, { verbose: false });
      
      const programs = await getAllPrograms();
      const beginnerProgram = programs.find(p => p.userId === 'test-beginner-uid');
      const advancedProgram = programs.find(p => p.userId === 'test-advanced-uid');
      
      expect(beginnerProgram.weightUnit).toBe('LB');
      expect(advancedProgram.weightUnit).toBe('KG');
    });

    test('should create weekly configs with exercise IDs', async () => {
      await seedPrograms(mockUsers, { verbose: false });
      
      const beginnerProgram = (await getAllPrograms()).find(p => p.userId === 'test-beginner-uid');
      const weeklyConfigs = beginnerProgram.weeklyConfigs;
      
      // Check that we have weekly configs
      expect(Object.keys(weeklyConfigs).length).toBeGreaterThan(0);
      
      // Check first workout has exercises with IDs
      const firstWorkout = Object.values(weeklyConfigs)[0];
      expect(firstWorkout.exercises).toBeDefined();
      expect(firstWorkout.exercises.length).toBeGreaterThan(0);
      
      // Each exercise should have an exerciseId
      firstWorkout.exercises.forEach(exercise => {
        expect(exercise.exerciseId).toBeDefined();
        expect(exercise.exerciseId).not.toBeNull();
        expect(exercise.sets).toBeDefined();
        expect(exercise.reps).toBeDefined();
      });
    });

    test('should handle single user seeding', async () => {
      const singleUser = [mockUsers[0]];
      const results = await seedPrograms(singleUser, { verbose: false });
      
      expect(results.totalPrograms).toBe(1);
      expect(results.programsByLevel.beginner).toBe(1);
      expect(results.programsByLevel.intermediate).toBe(0);
      expect(results.programsByLevel.advanced).toBe(0);
    });
  });

  describe('Program Retrieval', () => {
    beforeEach(async () => {
      await seedPrograms(mockUsers, { verbose: false });
    });

    test('should retrieve all programs', async () => {
      const programs = await getAllPrograms();
      expect(programs).toHaveLength(3);
    });

    test('should filter programs by user ID', async () => {
      const userPrograms = await getAllPrograms('test-beginner-uid');
      expect(userPrograms).toHaveLength(1);
      expect(userPrograms[0].userId).toBe('test-beginner-uid');
    });

    test('should return empty array for non-existent user', async () => {
      const userPrograms = await getAllPrograms('non-existent-uid');
      expect(userPrograms).toHaveLength(0);
    });
  });

  describe('Program Cleanup', () => {
    test('should clear all program data', async () => {
      await seedPrograms(mockUsers, { verbose: false });
      
      // Verify programs exist
      let programs = await getAllPrograms();
      expect(programs.length).toBeGreaterThan(0);
      
      // Clear programs
      await clearProgramData();
      
      // Verify programs are cleared
      programs = await getAllPrograms();
      expect(programs).toHaveLength(0);
    });
  });
});