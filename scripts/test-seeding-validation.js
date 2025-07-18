#!/usr/bin/env node

/**
 * Simple Seeding System Validation Test
 * 
 * A lightweight test runner that validates the seeding system functionality
 * without relying on external test frameworks.
 */

const {
  UserValidator,
  ExerciseValidator,
  ProgramValidator,
  WorkoutLogValidator,
  validateSeedingConfig,
  validateEmulatorConfig
} = require('./seed/utils/validation');

const { SeedingError, createErrorHandler } = require('./seed/utils/error-handling');

/**
 * Simple test framework
 */
class SimpleTestRunner {
  constructor() {
    this.tests = [];
    this.results = [];
    this.currentSuite = null;
  }

  describe(suiteName, testFn) {
    this.currentSuite = suiteName;
    console.log(`\n📋 ${suiteName}`);
    console.log('─'.repeat(50));
    testFn();
    this.currentSuite = null;
  }

  test(testName, testFn) {
    const fullName = this.currentSuite ? `${this.currentSuite} > ${testName}` : testName;
    
    try {
      testFn();
      this.results.push({ name: fullName, success: true });
      console.log(`✅ ${testName}`);
    } catch (error) {
      this.results.push({ name: fullName, success: false, error: error.message });
      console.log(`❌ ${testName}`);
      console.log(`   Error: ${error.message}`);
    }
  }

  expect(actual) {
    return {
      toBe: (expected) => {
        if (actual !== expected) {
          throw new Error(`Expected ${expected}, but got ${actual}`);
        }
      },
      toEqual: (expected) => {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) {
          throw new Error(`Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`);
        }
      },
      toBeGreaterThan: (expected) => {
        if (actual <= expected) {
          throw new Error(`Expected ${actual} to be greater than ${expected}`);
        }
      },
      toHaveLength: (expected) => {
        if (!actual || actual.length !== expected) {
          throw new Error(`Expected length ${expected}, but got ${actual ? actual.length : 'undefined'}`);
        }
      },
      toContain: (expected) => {
        if (!actual || !actual.includes(expected)) {
          throw new Error(`Expected array to contain ${expected}`);
        }
      },
      toThrow: (expectedMessage) => {
        try {
          if (typeof actual === 'function') {
            actual();
          }
          throw new Error('Expected function to throw an error');
        } catch (error) {
          if (expectedMessage && !error.message.includes(expectedMessage)) {
            throw new Error(`Expected error message to contain "${expectedMessage}", but got "${error.message}"`);
          }
        }
      }
    };
  }

  getSummary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;

    return { total, passed, failed, results: this.results };
  }

  logSummary() {
    const summary = this.getSummary();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${summary.total}`);
    console.log(`✅ Passed: ${summary.passed}`);
    console.log(`❌ Failed: ${summary.failed}`);
    
    if (summary.failed > 0) {
      console.log('\n❌ Failed Tests:');
      summary.results.filter(r => !r.success).forEach(result => {
        console.log(`   • ${result.name}: ${result.error}`);
      });
    }
    
    console.log(`\n🎯 Success Rate: ${Math.round((summary.passed / summary.total) * 100)}%`);
    console.log('='.repeat(60));
    
    return summary.failed === 0;
  }
}

// Create test runner instance
const runner = new SimpleTestRunner();

// User Validation Tests
runner.describe('User Data Validation', () => {
  runner.test('should validate correct user scenario', () => {
    const validator = new UserValidator();
    const validUserScenario = {
      id: 'beginner-user',
      email: 'beginner@test.com',
      password: 'test123',
      name: 'Alex Beginner',
      profile: {
        name: 'Alex Beginner',
        experienceLevel: 'beginner',
        preferredUnits: 'LB',
        age: 25,
        goals: ['strength', 'muscle_gain']
      }
    };

    const isValid = validator.validateUserScenario(validUserScenario);
    runner.expect(isValid).toBe(true);
    runner.expect(validator.getErrors()).toHaveLength(0);
  });

  runner.test('should reject user scenario with invalid email', () => {
    const validator = new UserValidator();
    const invalidUserScenario = {
      id: 'test-user',
      email: 'invalid-email',
      password: 'test123',
      name: 'Test User',
      profile: {
        name: 'Test User',
        experienceLevel: 'beginner',
        preferredUnits: 'LB'
      }
    };

    const isValid = validator.validateUserScenario(invalidUserScenario);
    runner.expect(isValid).toBe(false);
    runner.expect(validator.getErrors().length).toBeGreaterThan(0);
  });

  runner.test('should reject user scenario with short password', () => {
    const validator = new UserValidator();
    const invalidUserScenario = {
      id: 'test-user',
      email: 'test@example.com',
      password: '123',
      name: 'Test User',
      profile: {
        name: 'Test User',
        experienceLevel: 'beginner',
        preferredUnits: 'LB'
      }
    };

    const isValid = validator.validateUserScenario(invalidUserScenario);
    runner.expect(isValid).toBe(false);
  });
});

// Exercise Validation Tests
runner.describe('Exercise Data Validation', () => {
  runner.test('should validate correct exercise data', () => {
    const validator = new ExerciseValidator();
    const validExercise = {
      name: 'Barbell Back Squat',
      primaryMuscleGroup: 'Quads',
      exerciseType: 'Barbell',
      instructions: 'Stand with feet shoulder-width apart...'
    };

    const isValid = validator.validateExercise(validExercise);
    runner.expect(isValid).toBe(true);
    runner.expect(validator.getErrors()).toHaveLength(0);
  });

  runner.test('should reject exercise with missing required fields', () => {
    const validator = new ExerciseValidator();
    const invalidExercise = {
      name: 'Squat'
      // Missing primaryMuscleGroup and exerciseType
    };

    const isValid = validator.validateExercise(invalidExercise);
    runner.expect(isValid).toBe(false);
    runner.expect(validator.getErrors().length).toBeGreaterThan(0);
  });

  runner.test('should validate exercise database structure', () => {
    const validator = new ExerciseValidator();
    const validDatabase = {
      compound: [
        {
          name: 'Barbell Back Squat',
          primaryMuscleGroup: 'Quads',
          exerciseType: 'Barbell'
        }
      ],
      isolation: [
        {
          name: 'Bicep Curl',
          primaryMuscleGroup: 'Biceps',
          exerciseType: 'Dumbbell'
        }
      ]
    };

    const isValid = validator.validateExerciseDatabase(validDatabase);
    runner.expect(isValid).toBe(true);
  });
});

// Program Validation Tests
runner.describe('Program Data Validation', () => {
  runner.test('should validate correct program template', () => {
    const validator = new ProgramValidator();
    const validTemplate = {
      name: 'Starting Strength',
      description: 'A beginner program',
      duration: 12,
      daysPerWeek: 3,
      weightUnit: 'LB',
      difficulty: 'beginner',
      goals: ['strength'],
      equipment: ['barbell'],
      workoutStructure: {
        weeks_1_4: {
          day1: {
            name: 'Workout A',
            exercises: [
              {
                exerciseName: 'Squat',
                sets: 3,
                reps: 5,
                restMinutes: 3
              }
            ]
          }
        }
      }
    };

    const isValid = validator.validateProgramTemplate(validTemplate);
    runner.expect(isValid).toBe(true);
  });

  runner.test('should reject program with invalid duration', () => {
    const validator = new ProgramValidator();
    const invalidTemplate = {
      name: 'Test Program',
      description: 'Test',
      duration: 0, // Invalid duration
      daysPerWeek: 3,
      weightUnit: 'LB',
      difficulty: 'beginner',
      workoutStructure: {}
    };

    const isValid = validator.validateProgramTemplate(invalidTemplate);
    runner.expect(isValid).toBe(false);
  });
});

// Workout Log Validation Tests
runner.describe('Workout Log Data Validation', () => {
  runner.test('should validate correct workout log', () => {
    const validator = new WorkoutLogValidator();
    const validLog = {
      userId: 'user123',
      programId: 'program123',
      weekIndex: 0,
      dayIndex: 0,
      exercises: [
        {
          exerciseId: 'exercise123',
          sets: 3,
          reps: [5, 5, 5],
          weights: [135, 135, 135],
          completed: [true, true, true]
        }
      ],
      date: new Date(),
      isWorkoutFinished: true
    };

    const isValid = validator.validateWorkoutLog(validLog);
    runner.expect(isValid).toBe(true);
  });

  runner.test('should reject workout log with mismatched array lengths', () => {
    const validator = new WorkoutLogValidator();
    const invalidLog = {
      userId: 'user123',
      programId: 'program123',
      weekIndex: 0,
      dayIndex: 0,
      exercises: [
        {
          exerciseId: 'exercise123',
          sets: 3,
          reps: [5, 5], // Length doesn't match sets
          weights: [135, 135, 135],
          completed: [true, true, true]
        }
      ]
    };

    const isValid = validator.validateWorkoutLog(invalidLog);
    runner.expect(isValid).toBe(false);
  });
});

// Configuration Validation Tests
runner.describe('Configuration Validation', () => {
  runner.test('should validate correct seeding configuration', () => {
    const validConfig = {
      scenarios: 'basic',
      verbose: true,
      includeHistoricalData: true
    };

    const result = validateSeedingConfig(validConfig);
    runner.expect(result.isValid).toBe(true);
    runner.expect(result.errors).toHaveLength(0);
  });

  runner.test('should reject invalid scenario names', () => {
    const invalidConfig = {
      scenarios: 'invalid-scenario'
    };

    const result = validateSeedingConfig(invalidConfig);
    runner.expect(result.isValid).toBe(false);
    runner.expect(result.errors.length).toBeGreaterThan(0);
  });

  runner.test('should validate emulator configuration', () => {
    const validConfig = {
      auth: 'http://localhost:9099',
      firestore: 'localhost:8080'
    };

    const result = validateEmulatorConfig(validConfig);
    runner.expect(result.isValid).toBe(true);
  });
});

// Error Handling Tests
runner.describe('Error Handling', () => {
  runner.test('should create SeedingError with proper structure', () => {
    const error = new SeedingError('Test error', 'testOperation', { test: true });
    
    runner.expect(error.name).toBe('SeedingError');
    runner.expect(error.message).toBe('Test error');
    runner.expect(error.operation).toBe('testOperation');
    runner.expect(error.context.test).toBe(true);
  });

  runner.test('should create error handler with default options', () => {
    const errorHandler = createErrorHandler();
    
    runner.expect(typeof errorHandler.executeWithRetry).toBe('function');
    runner.expect(typeof errorHandler.handlePartialFailure).toBe('function');
  });
});

// Boundary Condition Tests
runner.describe('Boundary Conditions', () => {
  runner.test('should handle null and undefined values gracefully', () => {
    const validator = new UserValidator();
    
    runner.expect(validator.validateUserScenario(null)).toBe(false);
    runner.expect(validator.validateUserScenario(undefined)).toBe(false);
    runner.expect(validator.validateUserScenario({})).toBe(false);
  });

  runner.test('should validate minimum and maximum values', () => {
    const validator = new ProgramValidator();
    
    // Test minimum duration
    const minDurationProgram = {
      name: 'Test',
      description: 'Test',
      duration: 1, // Minimum valid
      daysPerWeek: 1,
      weightUnit: 'LB',
      difficulty: 'beginner',
      workoutStructure: {}
    };
    
    runner.expect(validator.validateProgramTemplate(minDurationProgram)).toBe(true);
    
    // Test maximum duration
    const maxDurationProgram = {
      ...minDurationProgram,
      duration: 52 // Maximum valid
    };
    
    runner.expect(validator.validateProgramTemplate(maxDurationProgram)).toBe(true);
    
    // Test beyond maximum
    const beyondMaxProgram = {
      ...minDurationProgram,
      duration: 53 // Beyond maximum
    };
    
    runner.expect(validator.validateProgramTemplate(beyondMaxProgram)).toBe(false);
  });

  runner.test('should handle empty arrays and objects', () => {
    const exerciseValidator = new ExerciseValidator();
    
    const emptyDatabase = {
      compound: [],
      isolation: []
    };
    
    runner.expect(exerciseValidator.validateExerciseDatabase(emptyDatabase)).toBe(true);
  });
});

// Run all tests and show summary
console.log('🧪 Starting Seeding System Validation Tests');
console.log('='.repeat(60));

const success = runner.logSummary();

if (success) {
  console.log('\n🎉 All tests passed! The seeding system validation is working correctly.');
  process.exit(0);
} else {
  console.log('\n💥 Some tests failed. Please review the errors above.');
  process.exit(1);
}