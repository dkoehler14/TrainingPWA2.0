/**
 * Tests for data validation utilities
 */

const {
  ValidationError,
  BaseValidator,
  UserValidator,
  ExerciseValidator,
  ProgramValidator,
  WorkoutLogValidator,
  validateSeedingConfig,
  validateEmulatorConfig
} = require('../validation');

describe('Data Validation', () => {
  describe('ValidationError', () => {
    test('should create validation error with all properties', () => {
      const error = new ValidationError(
        'Test validation error',
        'testField',
        'testValue',
        'testContext'
      );

      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Test validation error');
      expect(error.field).toBe('testField');
      expect(error.value).toBe('testValue');
      expect(error.context).toBe('testContext');
      expect(error.timestamp).toBeInstanceOf(Date);
    });

    test('should serialize to JSON correctly', () => {
      const error = new ValidationError('Test error', 'field', 'value', 'context');
      const json = error.toJSON();

      expect(json.name).toBe('ValidationError');
      expect(json.message).toBe('Test error');
      expect(json.field).toBe('field');
      expect(json.value).toBe('value');
      expect(json.context).toBe('context');
      expect(json.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('BaseValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new BaseValidator('Test Context');
    });

    test('should validate required fields', () => {
      expect(validator.validateRequired('value', 'testField')).toBe(true);
      expect(validator.validateRequired('', 'emptyField')).toBe(false);
      expect(validator.validateRequired(null, 'nullField')).toBe(false);
      expect(validator.validateRequired(undefined, 'undefinedField')).toBe(false);

      expect(validator.getErrors()).toHaveLength(3);
      expect(validator.getErrors()[0].message).toContain('emptyField is required');
    });

    test('should validate string fields', () => {
      expect(validator.validateString('valid string', 'testField')).toBe(true);
      expect(validator.validateString(123, 'numberField')).toBe(false);
      expect(validator.validateString('', 'emptyField')).toBe(false);

      validator.clearErrors();
      expect(validator.validateString('short', 'lengthField', { minLength: 10 })).toBe(false);
      expect(validator.validateString('very long string', 'lengthField', { maxLength: 5 })).toBe(false);

      validator.clearErrors();
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(validator.validateString('test@example.com', 'emailField', { pattern: emailPattern })).toBe(true);
      expect(validator.validateString('invalid-email', 'emailField', { pattern: emailPattern })).toBe(false);
    });

    test('should validate number fields', () => {
      expect(validator.validateNumber(42, 'numberField')).toBe(true);
      expect(validator.validateNumber('not a number', 'stringField')).toBe(false);
      expect(validator.validateNumber(NaN, 'nanField')).toBe(false);

      validator.clearErrors();
      expect(validator.validateNumber(5, 'rangeField', { min: 1, max: 10 })).toBe(true);
      expect(validator.validateNumber(0, 'rangeField', { min: 1 })).toBe(false);
      expect(validator.validateNumber(15, 'rangeField', { max: 10 })).toBe(false);

      validator.clearErrors();
      expect(validator.validateNumber(5, 'integerField', { integer: true })).toBe(true);
      expect(validator.validateNumber(5.5, 'integerField', { integer: true })).toBe(false);
    });

    test('should validate array fields', () => {
      expect(validator.validateArray(['item1', 'item2'], 'arrayField')).toBe(true);
      expect(validator.validateArray('not an array', 'stringField')).toBe(false);

      validator.clearErrors();
      expect(validator.validateArray(['item'], 'arrayField', { minLength: 2 })).toBe(false);
      expect(validator.validateArray(['1', '2', '3'], 'arrayField', { maxLength: 2 })).toBe(false);
    });

    test('should validate email format', () => {
      expect(validator.validateEmail('test@example.com', 'emailField')).toBe(true);
      expect(validator.validateEmail('user+tag@domain.co.uk', 'emailField')).toBe(true);
      expect(validator.validateEmail('invalid-email', 'emailField')).toBe(false);
      expect(validator.validateEmail('missing@domain', 'emailField')).toBe(false);
      expect(validator.validateEmail('@domain.com', 'emailField')).toBe(false);
    });

    test('should validate enum values', () => {
      const allowedValues = ['option1', 'option2', 'option3'];
      
      expect(validator.validateEnum('option1', 'enumField', allowedValues)).toBe(true);
      expect(validator.validateEnum('invalid', 'enumField', allowedValues)).toBe(false);

      const errors = validator.getErrors();
      expect(errors[0].message).toContain('must be one of: option1, option2, option3');
    });

    test('should manage error state correctly', () => {
      validator.addError('Test error', 'testField', 'testValue');
      expect(validator.isValid()).toBe(false);
      expect(validator.getErrors()).toHaveLength(1);

      validator.clearErrors();
      expect(validator.isValid()).toBe(true);
      expect(validator.getErrors()).toHaveLength(0);
    });
  });

  describe('UserValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new UserValidator();
    });

    test('should validate complete user scenario', () => {
      const validScenario = {
        id: 'beginner',
        name: 'Beginner User',
        email: 'beginner@test.com',
        password: 'test123',
        profile: {
          name: 'John Beginner',
          experienceLevel: 'beginner',
          preferredUnits: 'LB',
          age: 25,
          weight: 180,
          height: 175,
          goals: ['strength', 'muscle_gain'],
          availableEquipment: ['barbell', 'dumbbells']
        }
      };

      expect(validator.validateUserScenario(validScenario)).toBe(true);
      expect(validator.getErrors()).toHaveLength(0);
    });

    test('should reject invalid user scenario', () => {
      const invalidScenario = {
        id: 'test',
        email: 'invalid-email',
        password: '123', // too short
        profile: {
          name: '',
          experienceLevel: 'expert', // invalid enum
          preferredUnits: 'POUNDS', // invalid enum
          age: 5, // too young
          weight: -10, // negative
          goals: [] // empty array
        }
      };

      expect(validator.validateUserScenario(invalidScenario)).toBe(false);
      
      const errors = validator.getErrors();
      expect(errors.some(e => e.message.includes('email'))).toBe(true);
      expect(errors.some(e => e.message.includes('password'))).toBe(true);
      expect(errors.some(e => e.message.includes('name'))).toBe(true);
      expect(errors.some(e => e.message.includes('experienceLevel'))).toBe(true);
      expect(errors.some(e => e.message.includes('preferredUnits'))).toBe(true);
    });

    test('should validate created user object', () => {
      const validUser = {
        uid: 'test-uid-123',
        email: 'test@example.com',
        scenario: 'beginner'
      };

      expect(validator.validateCreatedUser(validUser)).toBe(true);

      const invalidUser = {
        uid: '',
        email: 'invalid-email',
        scenario: ''
      };

      expect(validator.validateCreatedUser(invalidUser)).toBe(false);
    });
  });

  describe('ExerciseValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new ExerciseValidator();
    });

    test('should validate complete exercise', () => {
      const validExercise = {
        name: 'Barbell Back Squat',
        primaryMuscleGroup: 'Quads',
        exerciseType: 'Barbell',
        instructions: 'Stand with feet shoulder-width apart...'
      };

      expect(validator.validateExercise(validExercise)).toBe(true);
      expect(validator.getErrors()).toHaveLength(0);
    });

    test('should reject invalid exercise', () => {
      const invalidExercise = {
        name: '', // empty name
        primaryMuscleGroup: null, // null value
        exerciseType: 123, // wrong type
        instructions: 'x'.repeat(1001) // too long
      };

      expect(validator.validateExercise(invalidExercise)).toBe(false);
      
      const errors = validator.getErrors();
      expect(errors.length).toBeGreaterThan(0);
    });

    test('should validate exercise database structure', () => {
      const validDatabase = {
        compound: [
          {
            name: 'Squat',
            primaryMuscleGroup: 'Quads',
            exerciseType: 'Barbell',
            instructions: 'Squat down and up'
          }
        ],
        isolation: [
          {
            name: 'Bicep Curl',
            primaryMuscleGroup: 'Biceps',
            exerciseType: 'Dumbbell',
            instructions: 'Curl the weight'
          }
        ]
      };

      expect(validator.validateExerciseDatabase(validDatabase)).toBe(true);

      const invalidDatabase = {
        compound: 'not an array',
        isolation: [
          {
            name: '', // invalid exercise
            primaryMuscleGroup: 'Biceps'
          }
        ]
      };

      expect(validator.validateExerciseDatabase(invalidDatabase)).toBe(false);
    });
  });

  describe('ProgramValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new ProgramValidator();
    });

    test('should validate complete program template', () => {
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

      expect(validator.validateProgramTemplate(validTemplate)).toBe(true);
      expect(validator.getErrors()).toHaveLength(0);
    });

    test('should reject invalid program template', () => {
      const invalidTemplate = {
        name: '', // empty name
        duration: 0, // invalid duration
        daysPerWeek: 8, // too many days
        weightUnit: 'POUNDS', // invalid enum
        difficulty: 'expert', // invalid enum
        workoutStructure: null // missing structure
      };

      expect(validator.validateProgramTemplate(invalidTemplate)).toBe(false);
      expect(validator.getErrors().length).toBeGreaterThan(0);
    });

    test('should validate program document', () => {
      const validProgram = {
        userId: 'user-123',
        name: 'Test Program',
        duration: 8,
        daysPerWeek: 4,
        weeklyConfigs: {
          week1_day1: {
            name: 'Day 1',
            exercises: [
              {
                exerciseId: 'exercise-123',
                sets: 3,
                reps: 8
              }
            ]
          }
        }
      };

      expect(validator.validateProgramDocument(validProgram)).toBe(true);

      const invalidProgram = {
        userId: '', // empty user ID
        name: 'Test',
        duration: -1, // negative duration
        weeklyConfigs: {
          week1_day1: {
            name: 'Day 1',
            exercises: [
              {
                exerciseId: null, // null exercise ID
                sets: 3,
                reps: 8
              }
            ]
          }
        }
      };

      expect(validator.validateProgramDocument(invalidProgram)).toBe(false);
    });
  });

  describe('WorkoutLogValidator', () => {
    let validator;

    beforeEach(() => {
      validator = new WorkoutLogValidator();
    });

    test('should validate complete workout log', () => {
      const validLog = {
        userId: 'user-123',
        programId: 'program-123',
        weekIndex: 0,
        dayIndex: 0,
        exercises: [
          {
            exerciseId: 'exercise-123',
            sets: 3,
            reps: [5, 5, 5],
            weights: [135, 135, 135],
            completed: [true, true, true]
          }
        ],
        date: new Date(),
        isWorkoutFinished: true
      };

      expect(validator.validateWorkoutLog(validLog)).toBe(true);
      expect(validator.getErrors()).toHaveLength(0);
    });

    test('should reject invalid workout log', () => {
      const invalidLog = {
        userId: '', // empty user ID
        programId: null, // null program ID
        weekIndex: -1, // negative index
        exercises: [
          {
            exerciseId: '',
            sets: 3,
            reps: [5, 5], // wrong array length
            weights: [135, 135, 135],
            completed: [true, true, true]
          }
        ]
      };

      expect(validator.validateWorkoutLog(invalidLog)).toBe(false);
      expect(validator.getErrors().length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Validators', () => {
    test('should validate seeding configuration', () => {
      const validConfig = {
        scenarios: 'basic',
        verbose: true,
        includeHistoricalData: true
      };

      const result = validateSeedingConfig(validConfig);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);

      const invalidConfig = {
        scenarios: 'invalid-scenario'
      };

      const invalidResult = validateSeedingConfig(invalidConfig);
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors.length).toBeGreaterThan(0);
    });

    test('should validate emulator configuration', () => {
      const validConfig = {
        auth: 'http://localhost:9099',
        firestore: 'localhost:8080'
      };

      const result = validateEmulatorConfig(validConfig);
      expect(result.isValid).toBe(true);

      const invalidConfig = {
        auth: 'invalid-url',
        firestore: ''
      };

      const invalidResult = validateEmulatorConfig(invalidConfig);
      expect(invalidResult.isValid).toBe(false);
    });

    test('should validate scenario arrays', () => {
      const configWithArray = {
        scenarios: ['beginner', 'intermediate']
      };

      const result = validateSeedingConfig(configWithArray);
      expect(result.isValid).toBe(true);

      const configWithInvalidArray = {
        scenarios: ['beginner', 'invalid-scenario']
      };

      const invalidResult = validateSeedingConfig(configWithInvalidArray);
      expect(invalidResult.isValid).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle null and undefined inputs gracefully', () => {
      const validator = new BaseValidator();

      expect(validator.validateString(null, 'nullField')).toBe(false);
      expect(validator.validateString(undefined, 'undefinedField')).toBe(false);
      expect(validator.validateNumber(null, 'nullNumber')).toBe(false);
      expect(validator.validateArray(null, 'nullArray')).toBe(false);
    });

    test('should handle empty objects and arrays', () => {
      const userValidator = new UserValidator();
      const exerciseValidator = new ExerciseValidator();

      expect(userValidator.validateUserScenario({})).toBe(false);
      expect(exerciseValidator.validateExerciseDatabase({})).toBe(true); // Empty database is valid
    });

    test('should validate complex nested structures', () => {
      const programValidator = new ProgramValidator();
      
      const complexProgram = {
        name: 'Complex Program',
        description: 'A complex program with multiple phases',
        duration: 16,
        daysPerWeek: 5,
        weightUnit: 'KG',
        difficulty: 'advanced',
        goals: ['strength', 'powerlifting'],
        equipment: ['barbell', 'dumbbells', 'machines'],
        workoutStructure: {
          weeks_1_4: {
            day1: {
              name: 'Upper Power',
              exercises: [
                {
                  exerciseName: 'Bench Press',
                  sets: 5,
                  reps: 3,
                  restMinutes: 4,
                  notes: 'Focus on speed'
                }
              ]
            },
            day2: {
              name: 'Lower Power',
              exercises: [
                {
                  exerciseName: 'Squat',
                  sets: 5,
                  reps: 3,
                  restMinutes: 4
                }
              ]
            }
          },
          weeks_5_8: {
            day1: {
              name: 'Upper Hypertrophy',
              exercises: [
                {
                  exerciseName: 'Incline Press',
                  sets: 4,
                  reps: 8,
                  restMinutes: 3
                }
              ]
            }
          }
        }
      };

      expect(programValidator.validateProgramTemplate(complexProgram)).toBe(true);
    });
  });
});