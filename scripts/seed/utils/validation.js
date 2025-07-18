/**
 * Data validation utilities for seeding operations
 * 
 * This module provides comprehensive validation for all data structures
 * used in the seeding process to ensure data integrity and catch errors early.
 */

const { logProgress, logError } = require('./logger');

/**
 * Validation error class for structured error handling
 */
class ValidationError extends Error {
  constructor(message, field = null, value = null, context = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
    this.context = context;
    this.timestamp = new Date();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      field: this.field,
      value: this.value,
      context: this.context,
      timestamp: this.timestamp
    };
  }
}

/**
 * Base validator class with common validation methods
 */
class BaseValidator {
  constructor(context = '') {
    this.context = context;
    this.errors = [];
  }

  /**
   * Add validation error
   * @param {string} message - Error message
   * @param {string} field - Field name
   * @param {*} value - Field value
   */
  addError(message, field = null, value = null) {
    const error = new ValidationError(message, field, value, this.context);
    this.errors.push(error);
  }

  /**
   * Check if validation passed
   * @returns {boolean} True if no errors
   */
  isValid() {
    return this.errors.length === 0;
  }

  /**
   * Get all validation errors
   * @returns {Array<ValidationError>} Array of validation errors
   */
  getErrors() {
    return this.errors;
  }

  /**
   * Clear all validation errors
   */
  clearErrors() {
    this.errors = [];
  }

  /**
   * Validate required field
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name
   * @returns {boolean} True if valid
   */
  validateRequired(value, fieldName) {
    if (value === null || value === undefined || value === '') {
      this.addError(`${fieldName} is required`, fieldName, value);
      return false;
    }
    return true;
  }

  /**
   * Validate string field
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name
   * @param {Object} options - Validation options
   * @returns {boolean} True if valid
   */
  validateString(value, fieldName, options = {}) {
    if (!this.validateRequired(value, fieldName)) {
      return false;
    }

    if (typeof value !== 'string') {
      this.addError(`${fieldName} must be a string`, fieldName, value);
      return false;
    }

    if (options.minLength && value.length < options.minLength) {
      this.addError(`${fieldName} must be at least ${options.minLength} characters`, fieldName, value);
      return false;
    }

    if (options.maxLength && value.length > options.maxLength) {
      this.addError(`${fieldName} must be no more than ${options.maxLength} characters`, fieldName, value);
      return false;
    }

    if (options.pattern && !options.pattern.test(value)) {
      this.addError(`${fieldName} format is invalid`, fieldName, value);
      return false;
    }

    return true;
  }

  /**
   * Validate number field
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name
   * @param {Object} options - Validation options
   * @returns {boolean} True if valid
   */
  validateNumber(value, fieldName, options = {}) {
    if (!this.validateRequired(value, fieldName)) {
      return false;
    }

    if (typeof value !== 'number' || isNaN(value)) {
      this.addError(`${fieldName} must be a valid number`, fieldName, value);
      return false;
    }

    if (options.min !== undefined && value < options.min) {
      this.addError(`${fieldName} must be at least ${options.min}`, fieldName, value);
      return false;
    }

    if (options.max !== undefined && value > options.max) {
      this.addError(`${fieldName} must be no more than ${options.max}`, fieldName, value);
      return false;
    }

    if (options.integer && !Number.isInteger(value)) {
      this.addError(`${fieldName} must be an integer`, fieldName, value);
      return false;
    }

    return true;
  }

  /**
   * Validate array field
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name
   * @param {Object} options - Validation options
   * @returns {boolean} True if valid
   */
  validateArray(value, fieldName, options = {}) {
    if (!this.validateRequired(value, fieldName)) {
      return false;
    }

    if (!Array.isArray(value)) {
      this.addError(`${fieldName} must be an array`, fieldName, value);
      return false;
    }

    if (options.minLength !== undefined && value.length < options.minLength) {
      this.addError(`${fieldName} must have at least ${options.minLength} items`, fieldName, value);
      return false;
    }

    if (options.maxLength !== undefined && value.length > options.maxLength) {
      this.addError(`${fieldName} must have no more than ${options.maxLength} items`, fieldName, value);
      return false;
    }

    return true;
  }

  /**
   * Validate email format
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name
   * @returns {boolean} True if valid
   */
  validateEmail(value, fieldName) {
    if (!this.validateString(value, fieldName)) {
      return false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value)) {
      this.addError(`${fieldName} must be a valid email address`, fieldName, value);
      return false;
    }

    return true;
  }

  /**
   * Validate enum value
   * @param {*} value - Value to validate
   * @param {string} fieldName - Field name
   * @param {Array} allowedValues - Array of allowed values
   * @returns {boolean} True if valid
   */
  validateEnum(value, fieldName, allowedValues) {
    if (!this.validateRequired(value, fieldName)) {
      return false;
    }

    if (!allowedValues.includes(value)) {
      this.addError(`${fieldName} must be one of: ${allowedValues.join(', ')}`, fieldName, value);
      return false;
    }

    return true;
  }
}

/**
 * User data validator
 */
class UserValidator extends BaseValidator {
  constructor() {
    super('User Validation');
  }

  /**
   * Validate user scenario configuration
   * @param {Object} userScenario - User scenario object
   * @returns {boolean} True if valid
   */
  validateUserScenario(userScenario) {
    this.clearErrors();

    if (!userScenario || typeof userScenario !== 'object') {
      this.addError('User scenario must be an object', 'userScenario', userScenario);
      return false;
    }

    // Validate required fields
    this.validateEmail(userScenario.email, 'email');
    this.validateString(userScenario.password, 'password', { minLength: 6 });
    this.validateString(userScenario.id, 'id');
    this.validateString(userScenario.name, 'name');

    // Validate profile
    if (userScenario.profile) {
      this.validateUserProfile(userScenario.profile);
    } else {
      this.addError('User profile is required', 'profile', userScenario.profile);
    }

    return this.isValid();
  }

  /**
   * Validate user profile data
   * @param {Object} profile - User profile object
   * @returns {boolean} True if valid
   */
  validateUserProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      this.addError('User profile must be an object', 'profile', profile);
      return false;
    }

    // Required fields
    this.validateString(profile.name, 'profile.name', { minLength: 1, maxLength: 100 });
    this.validateEnum(profile.experienceLevel, 'profile.experienceLevel', 
      ['beginner', 'intermediate', 'advanced']);
    this.validateEnum(profile.preferredUnits, 'profile.preferredUnits', ['LB', 'KG']);

    // Optional numeric fields
    if (profile.age !== undefined) {
      this.validateNumber(profile.age, 'profile.age', { min: 13, max: 120, integer: true });
    }
    if (profile.weight !== undefined) {
      this.validateNumber(profile.weight, 'profile.weight', { min: 50, max: 500 });
    }
    if (profile.height !== undefined) {
      this.validateNumber(profile.height, 'profile.height', { min: 100, max: 250 });
    }

    // Array fields
    if (profile.goals) {
      this.validateArray(profile.goals, 'profile.goals', { minLength: 1 });
    }
    if (profile.availableEquipment) {
      this.validateArray(profile.availableEquipment, 'profile.availableEquipment');
    }

    return this.isValid();
  }

  /**
   * Validate created user object
   * @param {Object} user - Created user object
   * @returns {boolean} True if valid
   */
  validateCreatedUser(user) {
    this.clearErrors();

    if (!user || typeof user !== 'object') {
      this.addError('User object must be provided', 'user', user);
      return false;
    }

    this.validateString(user.uid, 'uid');
    this.validateEmail(user.email, 'email');
    this.validateString(user.scenario, 'scenario');

    return this.isValid();
  }
}

/**
 * Exercise data validator
 */
class ExerciseValidator extends BaseValidator {
  constructor() {
    super('Exercise Validation');
  }

  /**
   * Validate exercise object
   * @param {Object} exercise - Exercise object
   * @returns {boolean} True if valid
   */
  validateExercise(exercise) {
    this.clearErrors();

    if (!exercise || typeof exercise !== 'object') {
      this.addError('Exercise must be an object', 'exercise', exercise);
      return false;
    }

    // Required fields
    this.validateString(exercise.name, 'name', { minLength: 1, maxLength: 100 });
    this.validateString(exercise.primaryMuscleGroup, 'primaryMuscleGroup');
    this.validateString(exercise.exerciseType, 'exerciseType');

    // Optional fields
    if (exercise.instructions) {
      this.validateString(exercise.instructions, 'instructions', { maxLength: 1000 });
    }

    return this.isValid();
  }

  /**
   * Validate exercise database structure
   * @param {Object} exerciseDatabase - Exercise database object
   * @returns {boolean} True if valid
   */
  validateExerciseDatabase(exerciseDatabase) {
    this.clearErrors();

    if (!exerciseDatabase || typeof exerciseDatabase !== 'object') {
      this.addError('Exercise database must be an object', 'exerciseDatabase', exerciseDatabase);
      return false;
    }

    // Validate each category
    const categories = ['compound', 'isolation', 'bodyweight', 'machine'];
    for (const category of categories) {
      if (exerciseDatabase[category]) {
        if (!Array.isArray(exerciseDatabase[category])) {
          this.addError(`${category} exercises must be an array`, category, exerciseDatabase[category]);
          continue;
        }

        // Validate each exercise in category
        exerciseDatabase[category].forEach((exercise, index) => {
          const exerciseValidator = new ExerciseValidator();
          if (!exerciseValidator.validateExercise(exercise)) {
            exerciseValidator.getErrors().forEach(error => {
              this.addError(`${category}[${index}]: ${error.message}`, error.field, error.value);
            });
          }
        });
      }
    }

    return this.isValid();
  }
}

/**
 * Program data validator
 */
class ProgramValidator extends BaseValidator {
  constructor() {
    super('Program Validation');
  }

  /**
   * Validate program template
   * @param {Object} template - Program template object
   * @returns {boolean} True if valid
   */
  validateProgramTemplate(template) {
    this.clearErrors();

    if (!template || typeof template !== 'object') {
      this.addError('Program template must be an object', 'template', template);
      return false;
    }

    // Required fields
    this.validateString(template.name, 'name', { minLength: 1, maxLength: 100 });
    this.validateString(template.description, 'description', { maxLength: 500 });
    this.validateNumber(template.duration, 'duration', { min: 1, max: 52, integer: true });
    this.validateNumber(template.daysPerWeek, 'daysPerWeek', { min: 1, max: 7, integer: true });
    this.validateEnum(template.weightUnit, 'weightUnit', ['LB', 'KG']);
    this.validateEnum(template.difficulty, 'difficulty', ['beginner', 'intermediate', 'advanced']);

    // Array fields
    if (template.goals) {
      this.validateArray(template.goals, 'goals', { minLength: 1 });
    }
    if (template.equipment) {
      this.validateArray(template.equipment, 'equipment', { minLength: 1 });
    }

    // Validate workout structure
    if (template.workoutStructure) {
      this.validateWorkoutStructure(template.workoutStructure);
    } else {
      this.addError('Workout structure is required', 'workoutStructure', template.workoutStructure);
    }

    return this.isValid();
  }

  /**
   * Validate workout structure
   * @param {Object} workoutStructure - Workout structure object
   * @returns {boolean} True if valid
   */
  validateWorkoutStructure(workoutStructure) {
    if (!workoutStructure || typeof workoutStructure !== 'object') {
      this.addError('Workout structure must be an object', 'workoutStructure', workoutStructure);
      return false;
    }

    // Validate each week range
    Object.entries(workoutStructure).forEach(([weekRange, days]) => {
      if (!days || typeof days !== 'object') {
        this.addError(`Week range ${weekRange} must contain day objects`, weekRange, days);
        return;
      }

      // Validate each day
      Object.entries(days).forEach(([dayKey, dayData]) => {
        this.validateWorkoutDay(dayData, `${weekRange}.${dayKey}`);
      });
    });

    return this.isValid();
  }

  /**
   * Validate workout day
   * @param {Object} dayData - Workout day data
   * @param {string} context - Context for error messages
   * @returns {boolean} True if valid
   */
  validateWorkoutDay(dayData, context) {
    if (!dayData || typeof dayData !== 'object') {
      this.addError(`${context} must be an object`, context, dayData);
      return false;
    }

    this.validateString(dayData.name, `${context}.name`);
    
    if (!this.validateArray(dayData.exercises, `${context}.exercises`, { minLength: 1 })) {
      return false;
    }

    // Validate each exercise
    dayData.exercises.forEach((exercise, index) => {
      this.validateWorkoutExercise(exercise, `${context}.exercises[${index}]`);
    });

    return this.isValid();
  }

  /**
   * Validate workout exercise
   * @param {Object} exercise - Exercise object
   * @param {string} context - Context for error messages
   * @returns {boolean} True if valid
   */
  validateWorkoutExercise(exercise, context) {
    if (!exercise || typeof exercise !== 'object') {
      this.addError(`${context} must be an object`, context, exercise);
      return false;
    }

    this.validateString(exercise.exerciseName, `${context}.exerciseName`);
    this.validateNumber(exercise.sets, `${context}.sets`, { min: 1, max: 20, integer: true });
    
    // Reps can be number or string (for time-based exercises)
    if (typeof exercise.reps !== 'number' && typeof exercise.reps !== 'string') {
      this.addError(`${context}.reps must be a number or string`, `${context}.reps`, exercise.reps);
    }

    if (exercise.restMinutes !== undefined) {
      this.validateNumber(exercise.restMinutes, `${context}.restMinutes`, { min: 0, max: 10 });
    }

    return this.isValid();
  }

  /**
   * Validate created program document
   * @param {Object} program - Program document
   * @returns {boolean} True if valid
   */
  validateProgramDocument(program) {
    this.clearErrors();

    if (!program || typeof program !== 'object') {
      this.addError('Program document must be an object', 'program', program);
      return false;
    }

    this.validateString(program.userId, 'userId');
    this.validateString(program.name, 'name');
    this.validateNumber(program.duration, 'duration', { min: 1, integer: true });
    this.validateNumber(program.daysPerWeek, 'daysPerWeek', { min: 1, max: 7, integer: true });

    if (program.weeklyConfigs) {
      this.validateWeeklyConfigs(program.weeklyConfigs);
    }

    return this.isValid();
  }

  /**
   * Validate weekly configs structure
   * @param {Object} weeklyConfigs - Weekly configs object
   * @returns {boolean} True if valid
   */
  validateWeeklyConfigs(weeklyConfigs) {
    if (!weeklyConfigs || typeof weeklyConfigs !== 'object') {
      this.addError('Weekly configs must be an object', 'weeklyConfigs', weeklyConfigs);
      return false;
    }

    Object.entries(weeklyConfigs).forEach(([configKey, config]) => {
      if (!config || typeof config !== 'object') {
        this.addError(`Config ${configKey} must be an object`, configKey, config);
        return;
      }

      this.validateString(config.name, `${configKey}.name`);
      
      if (config.exercises) {
        this.validateArray(config.exercises, `${configKey}.exercises`);
        
        config.exercises.forEach((exercise, index) => {
          if (exercise.exerciseId === null || exercise.exerciseId === undefined) {
            this.addError(`${configKey}.exercises[${index}].exerciseId is required`, 
              `${configKey}.exercises[${index}].exerciseId`, exercise.exerciseId);
          }
        });
      }
    });

    return this.isValid();
  }
}

/**
 * Workout log data validator
 */
class WorkoutLogValidator extends BaseValidator {
  constructor() {
    super('Workout Log Validation');
  }

  /**
   * Validate workout log document
   * @param {Object} workoutLog - Workout log document
   * @returns {boolean} True if valid
   */
  validateWorkoutLog(workoutLog) {
    this.clearErrors();

    if (!workoutLog || typeof workoutLog !== 'object') {
      this.addError('Workout log must be an object', 'workoutLog', workoutLog);
      return false;
    }

    // Required fields
    this.validateString(workoutLog.userId, 'userId');
    this.validateString(workoutLog.programId, 'programId');
    this.validateNumber(workoutLog.weekIndex, 'weekIndex', { min: 0, integer: true });
    this.validateNumber(workoutLog.dayIndex, 'dayIndex', { min: 0, integer: true });

    // Validate exercises array
    if (!this.validateArray(workoutLog.exercises, 'exercises', { minLength: 1 })) {
      return false;
    }

    // Validate each exercise
    workoutLog.exercises.forEach((exercise, index) => {
      this.validateLoggedExercise(exercise, `exercises[${index}]`);
    });

    // Validate date
    if (workoutLog.date && !(workoutLog.date instanceof Date) && !workoutLog.date.toDate) {
      this.addError('Date must be a Date object or Firestore Timestamp', 'date', workoutLog.date);
    }

    return this.isValid();
  }

  /**
   * Validate logged exercise
   * @param {Object} exercise - Logged exercise object
   * @param {string} context - Context for error messages
   * @returns {boolean} True if valid
   */
  validateLoggedExercise(exercise, context) {
    if (!exercise || typeof exercise !== 'object') {
      this.addError(`${context} must be an object`, context, exercise);
      return false;
    }

    this.validateString(exercise.exerciseId, `${context}.exerciseId`);
    this.validateNumber(exercise.sets, `${context}.sets`, { min: 1, integer: true });

    // Validate arrays
    if (exercise.reps) {
      this.validateArray(exercise.reps, `${context}.reps`);
    }
    if (exercise.weights) {
      this.validateArray(exercise.weights, `${context}.weights`);
    }
    if (exercise.completed) {
      this.validateArray(exercise.completed, `${context}.completed`);
    }

    // Validate array lengths match sets
    if (exercise.reps && exercise.reps.length !== exercise.sets) {
      this.addError(`${context}.reps array length must match sets count`, 
        `${context}.reps`, exercise.reps);
    }
    if (exercise.weights && exercise.weights.length !== exercise.sets) {
      this.addError(`${context}.weights array length must match sets count`, 
        `${context}.weights`, exercise.weights);
    }
    if (exercise.completed && exercise.completed.length !== exercise.sets) {
      this.addError(`${context}.completed array length must match sets count`, 
        `${context}.completed`, exercise.completed);
    }

    return this.isValid();
  }
}

/**
 * Validate seeding configuration
 * @param {Object} config - Seeding configuration
 * @returns {Object} Validation result
 */
function validateSeedingConfig(config) {
  const validator = new BaseValidator('Seeding Configuration');

  if (!config || typeof config !== 'object') {
    validator.addError('Seeding configuration must be an object', 'config', config);
    return { isValid: false, errors: validator.getErrors() };
  }

  // Validate scenarios
  if (config.scenarios) {
    if (typeof config.scenarios === 'string') {
      validator.validateEnum(config.scenarios, 'scenarios', 
        ['basic', 'beginner', 'intermediate', 'advanced', 'comprehensive', 'all']);
    } else if (Array.isArray(config.scenarios)) {
      config.scenarios.forEach((scenario, index) => {
        validator.validateEnum(scenario, `scenarios[${index}]`, 
          ['basic', 'beginner', 'intermediate', 'advanced', 'comprehensive']);
      });
    } else {
      validator.addError('Scenarios must be a string or array', 'scenarios', config.scenarios);
    }
  }

  return {
    isValid: validator.isValid(),
    errors: validator.getErrors()
  };
}

/**
 * Validate emulator connectivity requirements
 * @param {Object} emulatorConfig - Emulator configuration
 * @returns {Object} Validation result
 */
function validateEmulatorConfig(emulatorConfig) {
  const validator = new BaseValidator('Emulator Configuration');

  if (!emulatorConfig || typeof emulatorConfig !== 'object') {
    validator.addError('Emulator configuration must be an object', 'emulatorConfig', emulatorConfig);
    return { isValid: false, errors: validator.getErrors() };
  }

  // Validate auth emulator URL
  if (emulatorConfig.auth) {
    validator.validateString(emulatorConfig.auth, 'auth');
    if (emulatorConfig.auth && !emulatorConfig.auth.startsWith('http')) {
      validator.addError('Auth emulator URL must start with http', 'auth', emulatorConfig.auth);
    }
  }

  // Validate firestore emulator host
  if (emulatorConfig.firestore) {
    validator.validateString(emulatorConfig.firestore, 'firestore');
  }

  return {
    isValid: validator.isValid(),
    errors: validator.getErrors()
  };
}

module.exports = {
  ValidationError,
  BaseValidator,
  UserValidator,
  ExerciseValidator,
  ProgramValidator,
  WorkoutLogValidator,
  validateSeedingConfig,
  validateEmulatorConfig
};