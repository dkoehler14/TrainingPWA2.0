#!/usr/bin/env node

/**
 * Data Transformation and Mapping Tool
 * 
 * This script transforms Firestore documents to PostgreSQL-compatible rows,
 * handling data type conversions, relationship mapping, and data normalization.
 * 
 * Features:
 * - Schema-based transformation
 * - Data type conversion (Firestore -> PostgreSQL)
 * - Relationship mapping and foreign key resolution
 * - Data cleaning and normalization
 * - Validation of transformed data
 * - Support for nested document flattening
 * 
 * Usage:
 *   node scripts/migration/data-transformer.js [options]
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('crypto').randomUUID ? require('crypto') : { randomUUID: () => require('crypto').randomBytes(16).toString('hex') };
const { BatchProcessor } = require('./batch-processor');

// PostgreSQL schema definitions
const POSTGRES_SCHEMAS = {
  users: {
    tableName: 'users',
    columns: {
      id: { type: 'UUID', primaryKey: true },
      email: { type: 'VARCHAR(255)', unique: true, required: true },
      name: { type: 'VARCHAR(255)', required: true },
      roles: { type: 'TEXT[]', default: "DEFAULT ARRAY['user']" },
      experience_level: { type: 'VARCHAR(50)', default: 'beginner' },
      preferred_units: { type: 'VARCHAR(10)', default: 'LB' },
      age: { type: 'INTEGER' },
      weight_lbs: { type: 'DECIMAL(5,2)' },
      height_feet: { type: 'INTEGER' },
      height_inches: { type: 'INTEGER' },
      goals: { type: 'TEXT[]' },
      available_equipment: { type: 'TEXT[]' },
      injuries: { type: 'TEXT[]' },
      preferences: { type: 'JSONB', default: '{}' },
      settings: { type: 'JSONB', default: '{}' },
      created_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' },
      updated_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' }
    }
  },

  exercises: {
    tableName: 'exercises',
    columns: {
      id: { type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
      name: { type: 'VARCHAR(255)', required: true },
      primary_muscle_group: { type: 'VARCHAR(100)', required: true },
      exercise_type: { type: 'VARCHAR(100)', required: true },
      instructions: { type: 'TEXT' },
      is_global: { type: 'BOOLEAN', default: true },
      created_by: { type: 'UUID', references: 'users(id)' },
      created_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' },
      updated_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' }
    }
  },

  programs: {
    tableName: 'programs',
    columns: {
      id: { type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
      user_id: { type: 'UUID', required: true, references: 'users(id)', onDelete: 'CASCADE' },
      name: { type: 'VARCHAR(255)', required: true },
      description: { type: 'TEXT' },
      duration: { type: 'INTEGER', required: true },
      days_per_week: { type: 'INTEGER', required: true },
      weight_unit: { type: 'VARCHAR(10)', default: 'LB' },
      difficulty: { type: 'VARCHAR(50)' },
      goals: { type: 'TEXT[]' },
      equipment: { type: 'TEXT[]' },
      is_template: { type: 'BOOLEAN', default: false },
      is_current: { type: 'BOOLEAN', default: false },
      is_active: { type: 'BOOLEAN', default: true },
      start_date: { type: 'DATE' },
      completed_weeks: { type: 'INTEGER', default: 0 },
      created_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' },
      updated_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' }
    }
  },

  program_workouts: {
    tableName: 'program_workouts',
    columns: {
      id: { type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
      program_id: { type: 'UUID', required: true, references: 'programs(id)', onDelete: 'CASCADE' },
      week_number: { type: 'INTEGER', required: true },
      day_number: { type: 'INTEGER', required: true },
      name: { type: 'VARCHAR(255)', required: true },
      created_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' }
    }
  },

  program_exercises: {
    tableName: 'program_exercises',
    columns: {
      id: { type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
      workout_id: { type: 'UUID', required: true, references: 'program_workouts(id)', onDelete: 'CASCADE' },
      exercise_id: { type: 'UUID', required: true, references: 'exercises(id)' },
      sets: { type: 'INTEGER', required: true },
      reps: { type: 'VARCHAR(50)' },
      rest_minutes: { type: 'INTEGER' },
      notes: { type: 'TEXT' },
      order_index: { type: 'INTEGER', required: true },
      created_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' },
      updated_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' }
    }
  },

  workout_logs: {
    tableName: 'workout_logs',
    columns: {
      id: { type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
      user_id: { type: 'UUID', required: true, references: 'users(id)', onDelete: 'CASCADE' },
      program_id: { type: 'UUID', references: 'programs(id)' },
      week_index: { type: 'INTEGER' },
      day_index: { type: 'INTEGER' },
      name: { type: 'VARCHAR(255)' },
      type: { type: 'VARCHAR(50)', default: 'program_workout' },
      date: { type: 'DATE', required: true },
      completed_date: { type: 'TIMESTAMP WITH TIME ZONE' },
      is_finished: { type: 'BOOLEAN', default: false },
      is_draft: { type: 'BOOLEAN', default: false },
      weight_unit: { type: 'VARCHAR(10)', default: 'LB' },
      duration: { type: 'INTEGER' },
      notes: { type: 'TEXT' },
      created_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' },
      updated_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' }
    }
  },

  workout_log_exercises: {
    tableName: 'workout_log_exercises',
    columns: {
      id: { type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
      workout_log_id: { type: 'UUID', required: true, references: 'workout_logs(id)', onDelete: 'CASCADE' },
      exercise_id: { type: 'UUID', required: true, references: 'exercises(id)' },
      sets: { type: 'INTEGER', required: true },
      reps: { type: 'INTEGER[]' },
      weights: { type: 'DECIMAL(6,2)[]' },
      completed: { type: 'BOOLEAN[]' },
      bodyweight: { type: 'DECIMAL(5,2)' },
      notes: { type: 'TEXT' },
      is_added: { type: 'BOOLEAN', default: false },
      added_type: { type: 'VARCHAR(50)' },
      original_index: { type: 'INTEGER', default: -1 },
      order_index: { type: 'INTEGER', required: true },
      created_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' }
    }
  },

  user_analytics: {
    tableName: 'user_analytics',
    columns: {
      id: { type: 'UUID', primaryKey: true, default: 'gen_random_uuid()' },
      user_id: { type: 'UUID', required: true, references: 'users(id)', onDelete: 'CASCADE' },
      exercise_id: { type: 'UUID', required: true, references: 'exercises(id)' },
      total_volume: { type: 'DECIMAL(10,2)', default: 0 },
      max_weight: { type: 'DECIMAL(6,2)', default: 0 },
      total_reps: { type: 'INTEGER', default: 0 },
      total_sets: { type: 'INTEGER', default: 0 },
      last_workout_date: { type: 'DATE' },
      pr_date: { type: 'DATE' },
      created_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' },
      updated_at: { type: 'TIMESTAMP WITH TIME ZONE', default: 'NOW()' }
    }
  }
};

class DataTransformer {
  constructor(options = {}) {
    this.options = {
      inputDir: options.inputDir || './migration-data',
      outputDir: options.outputDir || './transformed-data',
      userMappingFile: options.userMappingFile || path.join(options.inputDir || './migration-data', 'user_mapping.json'),
      batchSize: options.batchSize || 100,
      validateOutput: options.validateOutput || true,
      cleanData: options.cleanData || true,
      verbose: options.verbose || false,
      // Validation configuration options
      enableValidation: options.enableValidation !== false, // Default to true
      validationLevel: options.validationLevel || 'lenient', // 'strict', 'lenient'
      skipInvalidExercises: options.skipInvalidExercises || false, // Skip exercises that fail validation
      logValidationDetails: options.logValidationDetails !== false, // Include detailed validation logs
      validateExerciseReferences: options.validateExerciseReferences !== false,
      validateUserReferences: options.validateUserReferences !== false,
      validateDataTypes: options.validateDataTypes !== false,
      validateRequiredFields: options.validateRequiredFields !== false,
      validateArrayBounds: options.validateArrayBounds !== false,
      maxValidationErrors: options.maxValidationErrors || 100,
      stopOnValidationFailure: options.stopOnValidationFailure || false,
      ...options
    };

    this.stats = {
      totalDocuments: 0,
      transformedDocuments: 0,
      failedTransformations: 0,
      cleaningOperations: 0,
      validationErrors: 0,
      relationshipsMapped: 0,
      userMappingsLoaded: 0,
      programsTransformed: 0,
      workoutsTransformed: 0,
      exercisesTransformed: 0,
      workoutLogsTransformed: 0,
      workoutLogExercisesTransformed: 0,
      // Validation statistics
      validationChecksPerformed: 0,
      validationIssuesFound: 0,
      validationIssuesResolved: 0,
      exerciseReferenceValidations: 0,
      userReferenceValidations: 0,
      dataTypeValidations: 0,
      requiredFieldValidations: 0,
      arrayBoundsValidations: 0,
      validationWarnings: 0,
      validationErrorsByType: {
        exerciseReference: 0,
        userReference: 0,
        dataType: 0,
        requiredField: 0,
        arrayBounds: 0,
        other: 0
      },
      // Workout log exercise validation statistics
      validationStats: {
        exercisesValidated: 0,
        repsValidationIssues: 0,
        weightsValidationIssues: 0,
        arrayLengthCorrections: 0,
        invalidExercisesSkipped: 0,
        totalValidationWarnings: 0
      }
    };

    this.idMappings = {
      users: new Map(),
      exercises: new Map(),
      programs: new Map(),
      program_workouts: new Map()
    };

    // User mapping from Firestore IDs to Supabase auth UUIDs
    this.userIdMapping = new Map();

    this.duplicateWorkoutTracker = new Map();
    this.errors = [];
    this.warnings = [];
    
    // Validation-specific properties
    this.validationIssues = [];
    this.validationContext = {
      currentCollection: null,
      currentDocument: null,
      currentField: null
    };
    this.validationRules = this.initializeValidationRules();
    this.validationCache = {
      exerciseIds: new Set(),
      userIds: new Set(),
      programIds: new Set()
    };
    
    // Performance monitoring properties
    this.performanceMetrics = {
      validationStartTime: null,
      validationEndTime: null,
      totalValidationTime: 0,
      averageValidationTime: 0,
      validationCallCount: 0,
      memoryUsageStart: null,
      memoryUsageEnd: null,
      memoryUsagePeak: 0,
      validationMethodTimes: {
        validateRepsArray: { totalTime: 0, callCount: 0 },
        validateWeightsArray: { totalTime: 0, callCount: 0 },
        validateCompletedArray: { totalTime: 0, callCount: 0 },
        normalizeArrayLength: { totalTime: 0, callCount: 0 },
        validateWorkoutLogExercise: { totalTime: 0, callCount: 0 }
      }
    };
    
    // Enhanced validation logging categories
    this.validationWarningCategories = {
      REPS_VALIDATION: 'reps_validation',
      WEIGHTS_VALIDATION: 'weights_validation', 
      ARRAY_LENGTH: 'array_length',
      DATA_TYPE: 'data_type',
      REQUIRED_FIELD: 'required_field',
      REFERENCE_VALIDATION: 'reference_validation',
      BODYWEIGHT_VALIDATION: 'bodyweight_validation'
    };
  }

  // Performance monitoring utility methods
  startPerformanceTimer(methodName) {
    const startTime = process.hrtime.bigint();
    this.trackMemoryUsage();
    return {
      methodName: methodName,
      startTime: startTime,
      startMemory: this.getCurrentMemoryUsage()
    };
  }

  endPerformanceTimer(timerData) {
    const endTime = process.hrtime.bigint();
    const executionTime = Number(endTime - timerData.startTime) / 1000000; // Convert to milliseconds
    
    // Update method-specific metrics
    if (this.performanceMetrics.validationMethodTimes[timerData.methodName]) {
      this.performanceMetrics.validationMethodTimes[timerData.methodName].totalTime += executionTime;
      this.performanceMetrics.validationMethodTimes[timerData.methodName].callCount++;
    }
    
    // Update overall validation metrics
    this.performanceMetrics.totalValidationTime += executionTime;
    this.performanceMetrics.validationCallCount++;
    this.performanceMetrics.averageValidationTime = 
      this.performanceMetrics.totalValidationTime / this.performanceMetrics.validationCallCount;
    
    // Track memory usage
    const endMemory = this.getCurrentMemoryUsage();
    if (endMemory > this.performanceMetrics.memoryUsagePeak) {
      this.performanceMetrics.memoryUsagePeak = endMemory;
    }
    
    return {
      executionTime: executionTime,
      memoryDelta: endMemory - timerData.startMemory,
      endMemory: endMemory
    };
  }

  getCurrentMemoryUsage() {
    try {
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const usage = process.memoryUsage();
        return usage.heapUsed / 1024 / 1024; // Convert to MB
      }
    } catch (error) {
      // Fallback if memory monitoring is not available
      return 0;
    }
    return 0;
  }

  trackMemoryUsage() {
    const currentMemory = this.getCurrentMemoryUsage();
    if (currentMemory > this.performanceMetrics.memoryUsagePeak) {
      this.performanceMetrics.memoryUsagePeak = currentMemory;
    }
  }

  startValidationPerformanceTracking() {
    this.performanceMetrics.validationStartTime = process.hrtime.bigint();
    this.performanceMetrics.memoryUsageStart = this.getCurrentMemoryUsage();
  }

  endValidationPerformanceTracking() {
    this.performanceMetrics.validationEndTime = process.hrtime.bigint();
    this.performanceMetrics.memoryUsageEnd = this.getCurrentMemoryUsage();
    
    if (this.performanceMetrics.validationStartTime) {
      const totalTime = Number(this.performanceMetrics.validationEndTime - this.performanceMetrics.validationStartTime) / 1000000;
      this.performanceMetrics.totalValidationTime = totalTime;
    }
  }

  initializeValidationRules() {
    return {
      exerciseReference: {
        enabled: this.options.validateExerciseReferences,
        severity: 'error',
        message: 'Invalid exercise reference'
      },
      userReference: {
        enabled: this.options.validateUserReferences,
        severity: 'error',
        message: 'Invalid user reference'
      },
      dataType: {
        enabled: this.options.validateDataTypes,
        severity: 'warning',
        message: 'Data type validation failed'
      },
      requiredField: {
        enabled: this.options.validateRequiredFields,
        severity: 'error',
        message: 'Required field missing or invalid'
      },
      arrayBounds: {
        enabled: this.options.validateArrayBounds,
        severity: 'warning',
        message: 'Array bounds validation failed'
      }
    };
  }

  async transform() {
    console.log('🔄 Starting data transformation...');

    // Create output directory
    await fs.mkdir(this.options.outputDir, { recursive: true });

    // Load user ID mapping
    await this.loadUserMapping();

    // Load source data
    const sourceData = await this.loadSourceData();

    // Transform in order (respecting dependencies)
    const transformationOrder = [
      'users',
      'exercises',
      'programs',
      'workoutLogs',
      'user_analytics'
    ];

    const transformedData = {
      users: [],
      exercises: [],
      programs: [],
      program_workouts: [],
      program_exercises: [],
      workout_logs: [],
      workout_log_exercises: [],
      user_analytics: []
    };

    for (const collection of transformationOrder) {
      if (sourceData[collection] && sourceData[collection].length > 0) {
        console.log(`\n📋 Transforming ${collection}...`);
        const results = await this.transformCollection(
          collection,
          sourceData[collection]
        );

        // Process complex objects and separate into appropriate tables
        if (collection === 'programs') {
          for (const result of results) {
            if (result.program) {
              // This is a complex program object
              transformedData.programs.push(result.program);
              this.stats.programsTransformed++;

              if (result.workouts) {
                transformedData.program_workouts.push(...result.workouts);
                this.stats.workoutsTransformed += result.workouts.length;
              }
              if (result.exercises) {
                transformedData.program_exercises.push(...result.exercises);
                this.stats.exercisesTransformed += result.exercises.length;
              }
            } else {
              // This is a simple program object
              transformedData.programs.push(result);
              this.stats.programsTransformed++;
            }
          }
        } else if (collection === 'workoutLogs') {
          for (const result of results) {
            if (result.workout_log) {
              // This is a complex workout log object
              transformedData.workout_logs.push(result.workout_log);
              this.stats.workoutLogsTransformed++;

              if (result.exercises) {
                transformedData.workout_log_exercises.push(...result.exercises);
                this.stats.workoutLogExercisesTransformed += result.exercises.length;
              }
            } else {
              // This is a simple workout log object
              transformedData.workout_logs.push(result);
              this.stats.workoutLogsTransformed++;
            }
          }
        } else if (collection === 'exercises_metadata') {
          // exercises_metadata returns an array of exercises
          transformedData.exercises.push(...results);
          this.stats.exercisesTransformed += results.length;
        } else {
          // Simple collections can be added directly
          transformedData[collection].push(...results);
        }
      }
    }

    // Save transformed data
    await this.saveTransformedData(transformedData);

    // Print transformation summary
    console.log('\n📊 Final Transformation Summary:');
    console.log(`Users: ${transformedData.users.length}`);
    console.log(`Exercises: ${transformedData.exercises.length}`);
    console.log(`Programs: ${transformedData.programs.length}`);
    console.log(`Program Workouts: ${transformedData.program_workouts.length}`);
    console.log(`Program Exercises: ${transformedData.program_exercises.length}`);
    console.log(`Workout Logs: ${transformedData.workout_logs.length}`);
    console.log(`Workout Log Exercises: ${transformedData.workout_log_exercises.length}`);
    console.log(`User Analytics: ${transformedData.user_analytics.length}`);

    // End validation performance tracking
    if (this.options.enableValidation && this.performanceMetrics.validationStartTime) {
      this.endValidationPerformanceTracking();
    }

    // Validate transformed data if enabled
    if (this.options.validateOutput) {
      await this.validateTransformedData(transformedData);
      this.validateDataIntegrity(transformedData);
    }

    // Generate transformation report
    await this.generateReport();

    console.log('\n✅ Data transformation completed!');
    this.printSummary();

    return transformedData;
  }

  async loadUserMapping() {
    console.log('🔗 Loading user ID mapping...');

    try {
      const mappingContent = await fs.readFile(this.options.userMappingFile, 'utf8');
      const mappingData = JSON.parse(mappingContent);

      if (mappingData.users && typeof mappingData.users === 'object') {
        for (const [firestoreId, supabaseId] of Object.entries(mappingData.users)) {
          this.userIdMapping.set(firestoreId, supabaseId);
          this.stats.userMappingsLoaded++;
        }
        console.log(`   Loaded ${this.stats.userMappingsLoaded} user ID mappings`);
      } else {
        throw new Error('Invalid user mapping format - expected { "users": { "firestoreId": "supabaseId" } }');
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`   ⚠️ User mapping file not found at ${this.options.userMappingFile}`);
        console.log('   Proceeding without user ID mapping - original Firestore IDs will be used');
      } else {
        throw new Error(`Failed to load user mapping: ${error.message}`);
      }
    }
  }

  async loadSourceData() {
    console.log('📂 Loading source data...');

    const sourceData = {};
    const collections = ['users', 'exercises', 'exercises_metadata', 'programs', 'workoutLogs', 'userAnalytics'];

    for (const collection of collections) {
      const filePath = path.join(this.options.inputDir, `${collection}.json`);

      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        sourceData[collection] = JSON.parse(fileContent);
        console.log(`   Loaded ${sourceData[collection].length} documents from ${collection}`);
        this.stats.totalDocuments += sourceData[collection].length;
      } catch (error) {
        if (error.code === 'ENOENT') {
          console.log(`   Collection ${collection} not found, skipping...`);
          sourceData[collection] = [];
        } else {
          throw new Error(`Failed to load ${collection}: ${error.message}`);
        }
      }
    }

    return sourceData;
  }

  async transformCollection(collectionName, documents) {
    const processor = new BatchProcessor({
      batchSize: this.options.batchSize,
      verbose: this.options.verbose
    });

    const transformedDocuments = [];

    const processorFn = async (batch) => {
      const batchResults = [];

      for (const doc of batch) {
        try {
          // Validate document structure
          if (!doc || typeof doc !== 'object') {
            this.warnings.push(`Skipping malformed document in ${collectionName}: ${JSON.stringify(doc)}`);
            continue;
          }

          const transformed = await this.transformDocument(collectionName, doc);
          if (transformed) {
            if (Array.isArray(transformed)) {
              batchResults.push(...transformed);
            } else if (transformed.program || transformed.workout_log) {
              // Handle complex objects that contain multiple table records
              // These will be processed separately in the main transform method
              batchResults.push(transformed);
            } else {
              batchResults.push(transformed);
            }
            this.stats.transformedDocuments++;
          }
        } catch (error) {
          this.stats.failedTransformations++;
          this.errors.push({
            collection: collectionName,
            documentId: doc && doc.id ? doc.id : 'unknown',
            error: error.message,
            timestamp: new Date().toISOString()
          });

          if (this.options.verbose) {
            console.error(`   ❌ Failed to transform ${doc && doc.id ? doc.id : 'unknown'}: ${error.message}`);
          }
        }
      }

      transformedDocuments.push(...batchResults);
      return batchResults;
    };

    await processor.processInBatches(documents, processorFn);

    console.log(`   Transformed ${transformedDocuments.length} documents`);
    return transformedDocuments;
  }

  async transformDocument(collectionName, document) {
    switch (collectionName) {
      case 'users':
        return this.transformUser(document);
      case 'exercises':
        return this.transformExercise(document);
      case 'exercises_metadata':
        return this.transformExercisesMetadata(document);
      case 'programs':
        return this.transformProgram(document);
      case 'workoutLogs':
        return this.transformWorkoutLog(document);
      case 'userAnalytics':
        return this.transformUserAnalytics(document);
      default:
        throw new Error(`Unknown collection: ${collectionName}`);
    }
  }

  transformUser(user) {
    // Map Firestore user ID to Supabase auth UUID
    const mappedUserId = this.userIdMapping.get(user.id);
    if (!mappedUserId) {
      this.warnings.push(`No Supabase auth UUID mapping found for Firestore user ID: ${user.id}`);
      // Skip this user if no mapping exists
      return null;
    }

    const transformed = {
      id: mappedUserId, // Use the mapped Supabase auth UUID
      email: this.cleanEmail(user.email),
      name: this.cleanString(user.name) || 'Unknown User',
      roles: this.normalizeRoles(user.role),
      experience_level: this.mapExperienceLevel(user.experienceLevel),
      preferred_units: this.mapUnits(user.preferredUnits),
      age: this.cleanNumber(user.age),
      weight_lbs: this.cleanNumber(user.weightLbs),
      height_feet: this.cleanNumber(user.heightFeet),
      height_inches: this.cleanNumber(user.heightInches),
      goals: this.cleanArray(user.goals),
      available_equipment: this.cleanArray(user.availableEquipment),
      injuries: this.cleanArray(user.injuries),
      preferences: this.cleanJSON(user.preferences),
      settings: this.cleanJSON(user.settings) || {},
      created_at: this.convertTimestamp(user.createdAt),
      updated_at: this.convertTimestamp(user.updatedAt)
    };

    // Store ID mapping for foreign key resolution (Firestore ID -> Supabase UUID)
    this.idMappings.users.set(user.id, transformed.id);

    return transformed;
  }

  transformExercise(exercise) {
    const transformed = {
      id: this.generateUUID(),
      name: this.cleanString(exercise.name),
      primary_muscle_group: this.cleanString(exercise.primaryMuscleGroup),
      exercise_type: this.cleanString(exercise.exerciseType),
      instructions: this.cleanString(exercise.instructions),
      is_global: exercise.isGlobal !== false, // Default to true
      created_by: this.resolveUserReference(exercise.createdBy),
      created_at: this.convertTimestamp(exercise.createdAt),
      updated_at: this.convertTimestamp(exercise.updatedAt)
    };

    // Store ID mapping
    this.idMappings.exercises.set(exercise.id, transformed.id);

    return transformed;
  }

  transformExercisesMetadata(metadata) {
    // exercises_metadata contains a map of exercises
    // We need to extract individual exercises and transform them
    const exercises = [];

    if (metadata.exercises && typeof metadata.exercises === 'object') {
      for (const [exerciseId, exerciseData] of Object.entries(metadata.exercises)) {
        const exercise = {
          id: exerciseId,
          ...exerciseData
        };

        const transformed = this.transformExercise(exercise);
        exercises.push(transformed);
      }
    }

    return exercises;
  }

  transformProgram(program) {
    // Validate required fields
    if (!program.userId) {
      throw new Error(`Program ${program.id} missing required userId`);
    }
    if (!program.name) {
      throw new Error(`Program ${program.id} missing required name`);
    }

    const transformed = {
      id: this.generateUUID(),
      user_id: this.resolveUserReference(program.userId),
      name: this.cleanString(program.name),
      description: this.cleanString(program.description),
      duration: this.cleanNumber(program.duration) || 4, // Default to 4 weeks if missing
      days_per_week: this.cleanNumber(program.daysPerWeek) || 3, // Default to 3 days if missing
      weight_unit: this.mapUnits(program.weightUnit),
      difficulty: this.cleanString(program.difficulty),
      goals: this.cleanArray(program.goals),
      equipment: this.cleanArray(program.equipment),
      is_template: Boolean(program.isTemplate),
      is_current: Boolean(program.isCurrent),
      is_active: program.isActive !== false, // Default to true
      start_date: this.convertDate(program.startDate),
      completed_weeks: this.cleanNumber(program.completedWeeks) || 0,
      created_at: this.convertTimestamp(program.createdAt),
      updated_at: this.convertTimestamp(program.updatedAt)
    };

    // Store ID mapping
    this.idMappings.programs.set(program.id, transformed.id);

    // Transform weeklyConfigs into workouts and exercises
    const workouts = [];
    const exercises = [];

    if (program.weeklyConfigs && typeof program.weeklyConfigs === 'object') {
      for (const [configKey, workoutConfig] of Object.entries(program.weeklyConfigs)) {
        let weekNumber, dayNumber, workoutName, workoutExercises;

        // Handle new format: "week1_day1": { "name": "...", "exercises": [...] }
        const newFormatMatch = configKey.match(/^week(\d+)_day(\d+)$/);
        if (newFormatMatch) {
          weekNumber = parseInt(newFormatMatch[1], 10);
          dayNumber = parseInt(newFormatMatch[2], 10);
          workoutName = workoutConfig.name || `Week ${weekNumber} Day ${dayNumber}`;
          workoutExercises = workoutConfig.exercises || [];
        }
        // Handle legacy format: "week4_day4_exercises": [...]
        else {
          const legacyFormatMatch = configKey.match(/^week(\d+)_day(\d+)_exercises$/);
          if (legacyFormatMatch) {
            weekNumber = parseInt(legacyFormatMatch[1], 10);
            dayNumber = parseInt(legacyFormatMatch[2], 10);
            workoutName = `Week ${weekNumber} Day ${dayNumber}`;
            workoutExercises = Array.isArray(workoutConfig) ? workoutConfig : [];
          } else {
            this.warnings.push(`Invalid weeklyConfig key format: ${configKey} in program ${program.id}`);
            continue;
          }
        }

        // Create workout object
        const workout = {
          id: `${program.id}_${configKey}`, // Create a unique ID for mapping
          name: workoutName,
          weekNumber,
          dayNumber,
          exercises: workoutExercises,
          createdAt: program.createdAt
        };

        const transformedWorkout = this.transformProgramWorkout(workout, transformed.id);
        workouts.push(transformedWorkout);

        // Transform workout exercises
        if (workout.exercises && Array.isArray(workout.exercises)) {
          for (let i = 0; i < workout.exercises.length; i++) {
            const exercise = workout.exercises[i];
            const transformedExercise = this.transformProgramExercise(exercise, transformedWorkout.id, i);
            exercises.push(transformedExercise);
          }
        }
      }
    }

    if (this.options.verbose) {
      console.log(`   Program ${transformed.id}: ${workouts.length} workouts, ${exercises.length} exercises`);
    }

    // Return program with related data
    return {
      program: transformed,
      workouts,
      exercises
    };
  }

  transformProgramWorkout(workout, programId) {
    // Validate required fields
    if (!workout.name) {
      throw new Error(`Program workout missing required name`);
    }

    const transformed = {
      id: this.generateUUID(),
      program_id: programId,
      week_number: this.cleanNumber(workout.weekNumber) || 1,
      day_number: this.cleanNumber(workout.dayNumber) || 1,
      name: this.cleanString(workout.name) || 'Workout',
      created_at: this.convertTimestamp(workout.createdAt)
    };

    // Check for duplicate workouts based on unique constraint
    const existingKey = `${programId}-${transformed.week_number}-${transformed.day_number}`;
    if (this.duplicateWorkoutTracker.has(existingKey)) {
      // Increment day_number to avoid constraint violation
      const nextDayNumber = this.duplicateWorkoutTracker.get(existingKey) + 1;
      transformed.day_number = nextDayNumber;
      this.duplicateWorkoutTracker.set(existingKey, nextDayNumber);
      this.warnings.push(`Duplicate workout detected for program ${programId}, week ${transformed.week_number}, day ${workout.dayNumber}. Adjusted to day ${transformed.day_number}`);
    } else {
      this.duplicateWorkoutTracker.set(existingKey, transformed.day_number);
    }

    // Store ID mapping
    this.idMappings.program_workouts.set(workout.id, transformed.id);

    return transformed;
  }

  transformProgramExercise(exercise, workoutId, orderIndex = 0) {
    // Validate required fields
    if (!exercise.exerciseId) {
      throw new Error(`Program exercise missing required exerciseId`);
    }
    if (!exercise.sets) {
      throw new Error(`Program exercise missing required sets`);
    }

    return {
      id: this.generateUUID(),
      workout_id: workoutId,
      exercise_id: this.resolveExerciseReference(exercise.exerciseId),
      sets: this.cleanNumber(exercise.sets) || 1,
      reps: this.cleanString(exercise.reps), // Changed to VARCHAR(50) to match schema
      rest_minutes: this.cleanNumber(exercise.restMinutes),
      notes: this.cleanString(exercise.notes),
      order_index: this.cleanNumber(exercise.orderIndex) || orderIndex,
      created_at: this.convertTimestamp(exercise.createdAt),
      updated_at: this.convertTimestamp(exercise.updatedAt)
    };
  }

  transformWorkoutLog(log) {
    // Validate required fields
    if (!log.userId) {
      throw new Error(`Workout log ${log.id} missing required userId`);
    }
    if (!log.date) {
      throw new Error(`Workout log ${log.id} missing required date`);
    }

    const transformed = {
      id: this.generateUUID(),
      user_id: this.resolveUserReference(log.userId),
      program_id: this.resolveProgramReference(log.programId),
      week_index: this.cleanNumber(log.weekIndex),
      day_index: this.cleanNumber(log.dayIndex),
      name: this.cleanString(log.name),
      type: this.cleanString(log.type) || 'program_workout',
      date: this.convertDate(log.date) || this.convertDate(new Date()), // Default to today if missing
      completed_date: this.convertTimestamp(log.completedDate),
      is_finished: Boolean(log.isWorkoutFinished || log.isFinished),
      is_draft: Boolean(log.isDraft),
      weight_unit: this.mapUnits(log.weightUnit),
      duration: this.cleanNumber(log.duration),
      notes: this.cleanString(log.notes),
      created_at: this.convertTimestamp(log.createdAt),
      updated_at: this.convertTimestamp(log.updatedAt)
    };

    // Transform exercises
    const exercises = [];
    if (log.exercises && Array.isArray(log.exercises)) {
      for (let i = 0; i < log.exercises.length; i++) {
        const exercise = log.exercises[i];
        const transformedExercise = this.transformWorkoutLogExercise(exercise, transformed.id, i);
        // Only add exercise if validation didn't reject it (null return)
        if (transformedExercise !== null) {
          exercises.push(transformedExercise);
        }
      }
    }

    if (this.options.verbose) {
      console.log(`   Workout log ${transformed.id}: ${exercises.length} exercises`);
    }

    return {
      workout_log: transformed,
      exercises
    };
  }

  transformWorkoutLogExercise(exercise, workoutLogId, orderIndex) {
    // Validate required fields
    if (!exercise.exerciseId) {
      throw new Error(`Workout log exercise missing required exerciseId`);
    }
    if (!exercise.sets) {
      throw new Error(`Workout log exercise missing required sets`);
    }

    // Create initial transformed exercise
    const transformedExercise = {
      id: this.generateUUID(),
      workout_log_id: workoutLogId,
      exercise_id: this.resolveExerciseReference(exercise.exerciseId),
      sets: this.cleanNumber(exercise.sets) || 1,
      reps: this.cleanNumberArray(exercise.reps), // Changed to INTEGER[]
      weights: this.cleanDecimalArray(exercise.weights),
      completed: this.cleanBooleanArray(exercise.completed),
      bodyweight: this.cleanDecimal(exercise.bodyweight),
      notes: this.cleanString(exercise.notes),
      is_added: Boolean(exercise.isAdded),
      added_type: this.cleanString(exercise.addedType),
      original_index: this.cleanNumber(exercise.originalIndex) || -1,
      order_index: orderIndex,
      created_at: this.convertTimestamp(exercise.createdAt)
    };

    // Apply validation if enabled
    if (this.options.enableValidation) {
      // Start performance tracking for this exercise validation
      if (!this.performanceMetrics.validationStartTime) {
        this.startValidationPerformanceTracking();
      }
      
      const validationResult = this.validateWorkoutLogExercise(transformedExercise, exercise);
      
      // Log validation issues using enhanced structured logging
      if (this.options.logValidationDetails && validationResult.issues.length > 0) {
        const context = {
          exerciseId: exercise.exerciseId || 'unknown',
          workoutLogId: transformedExercise.workout_log_id,
          documentId: exercise.exerciseId || 'unknown'
        };

        validationResult.issues.forEach(issue => {
          this.logStructuredValidationIssue(issue, context);
        });
      }

      // Check for critical validation failures (requirement 4.4)
      const criticalErrors = validationResult.issues.filter(issue => issue.severity === 'error');
      if (criticalErrors.length > 0 && this.options.stopOnValidationFailure) {
        const errorMessage = `Critical validation failure in exercise ${exercise.exerciseId}: ${criticalErrors.map(e => e.message).join(', ')}`;
        throw new Error(errorMessage);
      }

      // Handle validation results based on configured mode
      if (!validationResult.isValid) {
        if (this.options.skipInvalidExercises || this.options.validationLevel === 'strict') {
          // Skip this exercise entirely and update statistics
          this.stats.validationIssuesResolved++;
          this.stats.validationStats.invalidExercisesSkipped++;
          return null;
        }
      }

      // Use corrected exercise data if validation provided corrections
      if (validationResult.correctedExercise) {
        // Merge corrections back into transformed exercise
        Object.assign(transformedExercise, validationResult.correctedExercise);
        this.stats.validationIssuesResolved += validationResult.issues.length;
      }

      // Update validation statistics based on outcomes (requirements 1.5, 3.5)
      this.updateValidationStatistics(validationResult);
    }

    return transformedExercise;
  }

  transformUserAnalytics(analytics) {
    return {
      id: this.generateUUID(),
      user_id: this.resolveUserReference(analytics.userId),
      exercise_id: this.resolveExerciseReference(analytics.exerciseId),
      total_volume: this.cleanDecimal(analytics.totalVolume) || 0,
      max_weight: this.cleanDecimal(analytics.maxWeight) || 0,
      total_reps: this.cleanNumber(analytics.totalReps) || 0,
      total_sets: this.cleanNumber(analytics.totalSets) || 0,
      last_workout_date: this.convertDate(analytics.lastWorkoutDate),
      pr_date: this.convertDate(analytics.prDate),
      created_at: this.convertTimestamp(analytics.createdAt),
      updated_at: this.convertTimestamp(analytics.updatedAt)
    };
  }

  // Data cleaning and conversion methods
  cleanString(value) {
    if (typeof value !== 'string') return null;
    return value.trim() || null;
  }

  cleanEmail(email) {
    if (!email || typeof email !== 'string') return null;
    const cleaned = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(cleaned) ? cleaned : null;
  }

  cleanNumber(value) {
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  cleanDecimal(value) {
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? null : parsed;
    }
    return null;
  }

  cleanArray(value) {
    if (!Array.isArray(value)) return null;
    const cleaned = value.filter(item => item != null && item !== '');
    return cleaned.length > 0 ? cleaned : null;
  }

  cleanNumberArray(value) {
    if (!Array.isArray(value)) return null;
    const cleaned = value.map(item => this.cleanNumber(item)).filter(item => item !== null);
    return cleaned.length > 0 ? cleaned : null;
  }

  cleanDecimalArray(value) {
    if (!Array.isArray(value)) return null;
    const cleaned = value.map(item => this.cleanDecimal(item)).filter(item => item !== null);
    return cleaned.length > 0 ? cleaned : null;
  }

  cleanBooleanArray(value) {
    if (!Array.isArray(value)) return null;
    const cleaned = value.map(item => Boolean(item));
    return cleaned.length > 0 ? cleaned : null;
  }

  // Validation utility methods for workout log exercises
  validateRepsArray(reps, sets) {
    const timer = this.startPerformanceTimer('validateRepsArray');
    const issues = [];
    let correctedReps = [];

    try {
      // Handle null or undefined input
      if (!reps) {
        correctedReps = new Array(sets).fill(null);
        issues.push({
          type: 'reps',
          field: 'reps',
          originalValue: reps,
          correctedValue: correctedReps,
          message: 'Reps array was null/undefined, initialized with null values',
          severity: 'warning'
        });
        return { correctedReps, issues };
      }
    } catch (error) {
      // Fallback behavior for validation failures
      this.logValidationError('reps_validation', 
        { field: 'reps', documentId: 'unknown' }, 
        `Critical error in validateRepsArray: ${error.message}`, 
        { originalValue: reps, sets: sets }
      );
      
      // Return safe fallback values
      return {
        correctedReps: new Array(sets || 1).fill(null),
        issues: [{
          type: 'reps',
          field: 'reps',
          originalValue: reps,
          correctedValue: new Array(sets || 1).fill(null),
          message: `Validation error recovery: ${error.message}`,
          severity: 'error'
        }]
      };
    }

    try {
      // Handle non-array input
      if (!Array.isArray(reps)) {
        correctedReps = new Array(sets).fill(null);
        issues.push({
          type: 'reps',
          field: 'reps',
          originalValue: reps,
          correctedValue: correctedReps,
          message: 'Reps was not an array, initialized with null values',
          severity: 'warning'
        });
        return { correctedReps, issues };
      }

      // Validate each rep value
      correctedReps = reps.map((rep, index) => {
        try {
          // Allow null values
          if (rep === null || rep === undefined) {
            return null;
          }

          // Convert to number if possible
          let numericRep;
          if (typeof rep === 'number') {
            numericRep = rep;
          } else if (typeof rep === 'string') {
            numericRep = parseInt(rep, 10);
          } else {
            issues.push({
              type: 'reps',
              field: `reps[${index}]`,
              originalValue: rep,
              correctedValue: null,
              message: `Rep value at index ${index} is not a valid type, converted to null`,
              severity: 'warning'
            });
            return null;
          }

          // Check if conversion was successful
          if (isNaN(numericRep)) {
            issues.push({
              type: 'reps',
              field: `reps[${index}]`,
              originalValue: rep,
              correctedValue: null,
              message: `Rep value at index ${index} could not be converted to number, converted to null`,
              severity: 'warning'
            });
            return null;
          }

          // Check if rep is positive integer
          if (numericRep <= 0 || !Number.isInteger(numericRep)) {
            issues.push({
              type: 'reps',
              field: `reps[${index}]`,
              originalValue: rep,
              correctedValue: null,
              message: `Rep value at index ${index} must be a positive integer, converted to null`,
              severity: 'warning'
            });
            return null;
          }

          return numericRep;
        } catch (error) {
          // Individual rep validation error recovery
          issues.push({
            type: 'reps',
            field: `reps[${index}]`,
            originalValue: rep,
            correctedValue: null,
            message: `Rep validation error at index ${index}: ${error.message}`,
            severity: 'error'
          });
          return null;
        }
      });

      // Normalize array length to match sets count
      const lengthResult = this.normalizeArrayLength(correctedReps, sets, null);
      if (lengthResult.corrected) {
        correctedReps = lengthResult.array;
        issues.push({
          type: 'array_length',
          field: 'reps',
          originalValue: reps,
          correctedValue: correctedReps,
          message: `Reps array length (${reps.length}) adjusted to match sets count (${sets})`,
          severity: 'warning'
        });
      }

      const performanceData = this.endPerformanceTimer(timer);
      return { correctedReps, issues, performanceData };
    } catch (error) {
      // Fallback behavior for array processing failures
      this.logValidationError('reps_validation', 
        { field: 'reps', documentId: 'unknown' }, 
        `Critical error in reps array processing: ${error.message}`, 
        { originalValue: reps, sets: sets }
      );
      
      // End performance timer even on error
      const performanceData = this.endPerformanceTimer(timer);
      
      // Return safe fallback values
      return {
        correctedReps: new Array(sets || 1).fill(null),
        issues: [{
          type: 'reps',
          field: 'reps',
          originalValue: reps,
          correctedValue: new Array(sets || 1).fill(null),
          message: `Reps array processing error recovery: ${error.message}`,
          severity: 'error'
        }],
        performanceData
      };
    }
  }

  validateWeightsArray(weights, sets) {
    const timer = this.startPerformanceTimer('validateWeightsArray');
    const issues = [];
    let correctedWeights = [];

    try {
      // Handle null or undefined input
      if (!weights) {
        correctedWeights = new Array(sets).fill(0);
        issues.push({
          type: 'weights',
          field: 'weights',
          originalValue: weights,
          correctedValue: correctedWeights,
          message: 'Weights array was null/undefined, initialized with zero values',
          severity: 'warning'
        });
        return { correctedWeights, issues };
      }
    } catch (error) {
      // Fallback behavior for validation failures
      this.logValidationError('weights_validation', 
        { field: 'weights', documentId: 'unknown' }, 
        `Critical error in validateWeightsArray: ${error.message}`, 
        { originalValue: weights, sets: sets }
      );
      
      // Return safe fallback values
      return {
        correctedWeights: new Array(sets || 1).fill(0),
        issues: [{
          type: 'weights',
          field: 'weights',
          originalValue: weights,
          correctedValue: new Array(sets || 1).fill(0),
          message: `Weights validation error recovery: ${error.message}`,
          severity: 'error'
        }]
      };
    }

    try {
      // Handle non-array input
      if (!Array.isArray(weights)) {
        correctedWeights = new Array(sets).fill(0);
        issues.push({
          type: 'weights',
          field: 'weights',
          originalValue: weights,
          correctedValue: correctedWeights,
          message: 'Weights was not an array, initialized with zero values',
          severity: 'warning'
        });
        return { correctedWeights, issues };
      }

      // Validate each weight value
      correctedWeights = weights.map((weight, index) => {
        try {
          // Allow null values (convert to 0)
          if (weight === null || weight === undefined) {
            return 0;
          }

          // Convert to number if possible
          let numericWeight;
          if (typeof weight === 'number') {
            numericWeight = weight;
          } else if (typeof weight === 'string') {
            numericWeight = parseFloat(weight);
          } else {
            issues.push({
              type: 'weights',
              field: `weights[${index}]`,
              originalValue: weight,
              correctedValue: 0,
              message: `Weight value at index ${index} is not a valid type, converted to 0`,
              severity: 'warning'
            });
            return 0;
          }

          // Check if conversion was successful
          if (isNaN(numericWeight)) {
            issues.push({
              type: 'weights',
              field: `weights[${index}]`,
              originalValue: weight,
              correctedValue: 0,
              message: `Weight value at index ${index} could not be converted to number, converted to 0`,
              severity: 'warning'
            });
            return 0;
          }

          // Check if weight is non-negative (allow 0 for bodyweight exercises)
          if (numericWeight < 0) {
            issues.push({
              type: 'weights',
              field: `weights[${index}]`,
              originalValue: weight,
              correctedValue: 0,
              message: `Weight value at index ${index} cannot be negative, converted to 0`,
              severity: 'warning'
            });
            return 0;
          }

          return numericWeight;
        } catch (error) {
          // Individual weight validation error recovery
          issues.push({
            type: 'weights',
            field: `weights[${index}]`,
            originalValue: weight,
            correctedValue: 0,
            message: `Weight validation error at index ${index}: ${error.message}`,
            severity: 'error'
          });
          return 0;
        }
      });

      // Normalize array length to match sets count
      const lengthResult = this.normalizeArrayLength(correctedWeights, sets, 0);
      if (lengthResult.corrected) {
        correctedWeights = lengthResult.array;
        issues.push({
          type: 'array_length',
          field: 'weights',
          originalValue: weights,
          correctedValue: correctedWeights,
          message: `Weights array length (${weights.length}) adjusted to match sets count (${sets})`,
          severity: 'warning'
        });
      }

      const performanceData = this.endPerformanceTimer(timer);
      return { correctedWeights, issues, performanceData };
    } catch (error) {
      // Fallback behavior for array processing failures
      this.logValidationError('weights_validation', 
        { field: 'weights', documentId: 'unknown' }, 
        `Critical error in weights array processing: ${error.message}`, 
        { originalValue: weights, sets: sets }
      );
      
      // End performance timer even on error
      const performanceData = this.endPerformanceTimer(timer);
      
      // Return safe fallback values
      return {
        correctedWeights: new Array(sets || 1).fill(0),
        issues: [{
          type: 'weights',
          field: 'weights',
          originalValue: weights,
          correctedValue: new Array(sets || 1).fill(0),
          message: `Weights array processing error recovery: ${error.message}`,
          severity: 'error'
        }],
        performanceData
      };
    }
  }

  validateCompletedArray(completed, sets) {
    const timer = this.startPerformanceTimer('validateCompletedArray');
    const issues = [];
    let correctedCompleted = [];

    try {
      // Handle null or undefined input
      if (!completed) {
        correctedCompleted = new Array(sets).fill(false);
        issues.push({
          type: 'completed',
          field: 'completed',
          originalValue: completed,
          correctedValue: correctedCompleted,
          message: 'Completed array was null/undefined, initialized with false values',
          severity: 'warning'
        });
        return { correctedCompleted, issues };
      }

      // Handle non-array input
      if (!Array.isArray(completed)) {
        correctedCompleted = new Array(sets).fill(false);
        issues.push({
          type: 'completed',
          field: 'completed',
          originalValue: completed,
          correctedValue: correctedCompleted,
          message: 'Completed was not an array, initialized with false values',
          severity: 'warning'
        });
        return { correctedCompleted, issues };
      }

      // Validate each completed value
      correctedCompleted = completed.map((isCompleted, index) => {
        try {
          // Handle null/undefined values
          if (isCompleted === null || isCompleted === undefined) {
            return false;
          }

          // Handle boolean values
          if (typeof isCompleted === 'boolean') {
            return isCompleted;
          }

          // Handle string values - attempt type coercion
          if (typeof isCompleted === 'string') {
            const lowerValue = isCompleted.toLowerCase().trim();
            if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
              return true;
            } else if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no' || lowerValue === '') {
              return false;
            } else {
              issues.push({
                type: 'completed',
                field: `completed[${index}]`,
                originalValue: isCompleted,
                correctedValue: false,
                message: `Completed value at index ${index} could not be converted to boolean, converted to false`,
                severity: 'warning'
              });
              return false;
            }
          }

          // Handle numeric values - attempt type coercion
          if (typeof isCompleted === 'number') {
            const boolValue = Boolean(isCompleted);
            if (isCompleted !== 0 && isCompleted !== 1) {
              issues.push({
                type: 'completed',
                field: `completed[${index}]`,
                originalValue: isCompleted,
                correctedValue: boolValue,
                message: `Completed value at index ${index} was numeric (${isCompleted}), converted to boolean (${boolValue})`,
                severity: 'warning'
              });
            }
            return boolValue;
          }

          // Handle other types - convert to false with warning
          issues.push({
            type: 'completed',
            field: `completed[${index}]`,
            originalValue: isCompleted,
            correctedValue: false,
            message: `Completed value at index ${index} is not a valid type, converted to false`,
            severity: 'warning'
          });
          return false;
        } catch (error) {
          // Individual completed validation error recovery
          issues.push({
            type: 'completed',
            field: `completed[${index}]`,
            originalValue: isCompleted,
            correctedValue: false,
            message: `Completed validation error at index ${index}: ${error.message}`,
            severity: 'error'
          });
          return false;
        }
      });

      // Normalize array length to match sets count
      const lengthResult = this.normalizeArrayLength(correctedCompleted, sets, false);
      if (lengthResult.corrected) {
        correctedCompleted = lengthResult.array;
        issues.push({
          type: 'array_length',
          field: 'completed',
          originalValue: completed,
          correctedValue: correctedCompleted,
          message: `Completed array length (${completed.length}) adjusted to match sets count (${sets})`,
          severity: 'warning'
        });
      }

      const performanceData = this.endPerformanceTimer(timer);
      return { correctedCompleted, issues, performanceData };
    } catch (error) {
      // Fallback behavior for validation failures
      this.logValidationError('completed_validation', 
        { field: 'completed', documentId: 'unknown' }, 
        `Critical error in validateCompletedArray: ${error.message}`, 
        { originalValue: completed, sets: sets }
      );
      
      // End performance timer even on error
      const performanceData = this.endPerformanceTimer(timer);
      
      // Return safe fallback values
      return {
        correctedCompleted: new Array(sets || 1).fill(false),
        issues: [{
          type: 'completed',
          field: 'completed',
          originalValue: completed,
          correctedValue: new Array(sets || 1).fill(false),
          message: `Completed validation error recovery: ${error.message}`,
          severity: 'error'
        }],
        performanceData
      };
    }
  }

  normalizeArrayLength(array, targetLength, defaultValue) {
    const timer = this.startPerformanceTimer('normalizeArrayLength');
    
    try {
      // Validate inputs
      if (typeof targetLength !== 'number' || targetLength < 0) {
        throw new Error(`Invalid targetLength: ${targetLength}`);
      }

      if (!Array.isArray(array)) {
        return {
          array: new Array(targetLength).fill(defaultValue),
          corrected: true,
          originalLength: 0,
          targetLength: targetLength
        };
      }

      const originalLength = array.length;
      
      // Array is already the correct length
      if (originalLength === targetLength) {
        return {
          array: array,
          corrected: false,
          originalLength: originalLength,
          targetLength: targetLength
        };
      }

      let normalizedArray;

      // Array is too short - pad with default values
      if (originalLength < targetLength) {
        normalizedArray = [...array];
        const paddingNeeded = targetLength - originalLength;
        for (let i = 0; i < paddingNeeded; i++) {
          normalizedArray.push(defaultValue);
        }
      }
      // Array is too long - truncate to target length
      else {
        normalizedArray = array.slice(0, targetLength);
      }

      const performanceData = this.endPerformanceTimer(timer);
      return {
        array: normalizedArray,
        corrected: true,
        originalLength: originalLength,
        targetLength: targetLength,
        performanceData
      };
    } catch (error) {
      // Fallback behavior for array normalization failures
      this.logValidationError('array_normalization', 
        { field: 'array_length', documentId: 'unknown' }, 
        `Critical error in normalizeArrayLength: ${error.message}`, 
        { originalArray: array, targetLength: targetLength, defaultValue: defaultValue }
      );
      
      // End performance timer even on error
      const performanceData = this.endPerformanceTimer(timer);
      
      // Return safe fallback
      const safeTargetLength = Math.max(1, targetLength || 1);
      return {
        array: new Array(safeTargetLength).fill(defaultValue),
        corrected: true,
        originalLength: Array.isArray(array) ? array.length : 0,
        targetLength: safeTargetLength,
        error: error.message,
        performanceData
      };
    }
  }

  // Main validation orchestrator method
  validateWorkoutLogExercise(exercise, originalData) {
    const timer = this.startPerformanceTimer('validateWorkoutLogExercise');
    const issues = [];
    let correctedExercise = { ...exercise };
    let isValid = true;
    const performanceBreakdown = {};

    try {
      // Pre-validation: Check required fields
      if (!exercise.exercise_id) {
        issues.push({
          type: 'required_field',
          field: 'exercise_id',
          originalValue: exercise.exercise_id,
          correctedValue: null,
          message: 'Missing required exercise_id',
          severity: 'error'
        });
        isValid = false;
      }

      if (!exercise.sets || exercise.sets <= 0) {
        issues.push({
          type: 'required_field',
          field: 'sets',
          originalValue: exercise.sets,
          correctedValue: null,
          message: 'Missing or invalid sets count',
          severity: 'error'
        });
        isValid = false;
      }

      // If critical validation fails and we're in strict mode, return early
      if (!isValid && this.options.validationLevel === 'strict') {
        return {
          isValid: false,
          correctedExercise: null,
          issues: issues
        };
      }

      // Skip validation if sets is invalid (can't validate arrays without valid sets count)
      if (!exercise.sets || exercise.sets <= 0) {
        return {
          isValid: false,
          correctedExercise: correctedExercise,
          issues: issues
        };
      }

      const sets = exercise.sets;

      // Validate reps array with error recovery and performance tracking
      try {
        const repsValidation = this.validateRepsArray(exercise.reps, sets);
        performanceBreakdown.repsValidation = repsValidation.performanceData;
        if (repsValidation.issues.length > 0) {
          issues.push(...repsValidation.issues);
          correctedExercise.reps = repsValidation.correctedReps;
        }
      } catch (error) {
        issues.push({
          type: 'reps',
          field: 'reps',
          originalValue: exercise.reps,
          correctedValue: new Array(sets).fill(null),
          message: `Reps validation failed: ${error.message}`,
          severity: 'error'
        });
        correctedExercise.reps = new Array(sets).fill(null);
      }

      // Validate weights array with error recovery and performance tracking
      try {
        const weightsValidation = this.validateWeightsArray(exercise.weights, sets);
        performanceBreakdown.weightsValidation = weightsValidation.performanceData;
        if (weightsValidation.issues.length > 0) {
          issues.push(...weightsValidation.issues);
          correctedExercise.weights = weightsValidation.correctedWeights;
        }
      } catch (error) {
        issues.push({
          type: 'weights',
          field: 'weights',
          originalValue: exercise.weights,
          correctedValue: new Array(sets).fill(0),
          message: `Weights validation failed: ${error.message}`,
          severity: 'error'
        });
        correctedExercise.weights = new Array(sets).fill(0);
      }

      // Validate completed array with error recovery and performance tracking
      try {
        const completedValidation = this.validateCompletedArray(exercise.completed, sets);
        performanceBreakdown.completedValidation = completedValidation.performanceData;
        if (completedValidation.issues.length > 0) {
          issues.push(...completedValidation.issues);
          correctedExercise.completed = completedValidation.correctedCompleted;
        }
      } catch (error) {
        issues.push({
          type: 'completed',
          field: 'completed',
          originalValue: exercise.completed,
          correctedValue: new Array(sets).fill(false),
          message: `Completed validation failed: ${error.message}`,
          severity: 'error'
        });
        correctedExercise.completed = new Array(sets).fill(false);
      }

      // Validate bodyweight if present with error recovery
      try {
        if (exercise.bodyweight !== null && exercise.bodyweight !== undefined) {
          const bodyweight = this.cleanDecimal(exercise.bodyweight);
          if (bodyweight === null || bodyweight < 0) {
            issues.push({
              type: 'data_type',
              field: 'bodyweight',
              originalValue: exercise.bodyweight,
              correctedValue: null,
              message: 'Invalid bodyweight value, must be a positive number',
              severity: 'warning'
            });
            correctedExercise.bodyweight = null;
          } else {
            correctedExercise.bodyweight = bodyweight;
          }
        }
      } catch (error) {
        issues.push({
          type: 'data_type',
          field: 'bodyweight',
          originalValue: exercise.bodyweight,
          correctedValue: null,
          message: `Bodyweight validation failed: ${error.message}`,
          severity: 'error'
        });
        correctedExercise.bodyweight = null;
      }

      // Update statistics with error recovery
      try {
        this.stats.validationChecksPerformed++;
        this.stats.validationIssuesFound += issues.length;
        this.stats.validationStats.exercisesValidated++;

        // Count issues by type
        issues.forEach(issue => {
          if (issue.type === 'reps') {
            this.stats.validationStats.repsValidationIssues++;
            this.stats.validationErrorsByType.arrayBounds++;
          } else if (issue.type === 'weights') {
            this.stats.validationStats.weightsValidationIssues++;
            this.stats.validationErrorsByType.arrayBounds++;
          } else if (issue.type === 'completed' || issue.type === 'array_length') {
            this.stats.validationStats.arrayLengthCorrections++;
            this.stats.validationErrorsByType.arrayBounds++;
          } else if (issue.type === 'data_type') {
            this.stats.validationErrorsByType.dataType++;
          } else if (issue.type === 'required_field') {
            this.stats.validationErrorsByType.requiredField++;
          } else {
            this.stats.validationErrorsByType.other++;
          }

          if (issue.severity === 'warning') {
            this.stats.validationWarnings++;
            this.stats.validationStats.totalValidationWarnings++;
          } else if (issue.severity === 'error') {
            this.stats.validationErrors++;
          }
        });
      } catch (error) {
        // Even statistics tracking can fail - ensure transformation continues
        this.logValidationError('statistics_tracking', 
          { field: 'stats', documentId: 'unknown' }, 
          `Statistics tracking failed: ${error.message}`, 
          { issuesCount: issues.length }
        );
      }

      // Determine final validation result
      const hasErrors = issues.some(issue => issue.severity === 'error');
      const finalIsValid = !hasErrors;

      // In strict mode, reject exercises with any validation issues
      if (this.options.validationLevel === 'strict' && issues.length > 0) {
        return {
          isValid: false,
          correctedExercise: null,
          issues: issues
        };
      }

      // In lenient mode, accept corrected data
      const performanceData = this.endPerformanceTimer(timer);
      return {
        isValid: finalIsValid,
        correctedExercise: correctedExercise,
        issues: issues,
        performanceData: performanceData,
        performanceBreakdown: performanceBreakdown
      };
    } catch (error) {
      // Critical error in validation orchestrator - ensure transformation continues
      this.logValidationError('validation_orchestrator', 
        { field: 'exercise', documentId: originalData?.exerciseId || 'unknown' }, 
        `Critical validation failure: ${error.message}`, 
        { exercise: exercise, originalData: originalData }
      );
      
      // End performance timer even on error
      const performanceData = this.endPerformanceTimer(timer);
      
      // Return safe fallback exercise with minimal valid data
      const safeSets = Math.max(1, exercise.sets || 1);
      return {
        isValid: false,
        correctedExercise: {
          ...exercise,
          reps: new Array(safeSets).fill(null),
          weights: new Array(safeSets).fill(0),
          completed: new Array(safeSets).fill(false),
          bodyweight: null
        },
        issues: [{
          type: 'validation_failure',
          field: 'exercise',
          originalValue: exercise,
          correctedValue: null,
          message: `Critical validation error recovery: ${error.message}`,
          severity: 'error'
        }],
        performanceData: performanceData,
        performanceBreakdown: performanceBreakdown
      };
    }
  }

  // Enhanced validation logging methods
  logValidationWarning(category, context, message, details = {}) {
    const warning = {
      category: category,
      message: message,
      context: {
        collection: context.collection || this.validationContext.currentCollection,
        documentId: context.documentId || this.validationContext.currentDocument,
        field: context.field || this.validationContext.currentField,
        exerciseId: context.exerciseId,
        workoutLogId: context.workoutLogId
      },
      details: details,
      timestamp: new Date().toISOString(),
      severity: 'warning'
    };

    // Add to warnings array with structured format
    this.warnings.push(warning);
    
    // Also add simple string format for backward compatibility
    const simpleMessage = `[${category}] ${message} (${context.collection}/${context.documentId})`;
    if (!this.warnings.includes(simpleMessage)) {
      this.warnings.push(simpleMessage);
    }

    // Update statistics
    this.stats.validationWarnings++;
    this.stats.validationStats.totalValidationWarnings++;
  }

  logValidationError(category, context, message, details = {}) {
    const error = {
      category: category,
      collection: context.collection || this.validationContext.currentCollection,
      documentId: context.documentId || this.validationContext.currentDocument,
      error: message,
      context: {
        field: context.field || this.validationContext.currentField,
        exerciseId: context.exerciseId,
        workoutLogId: context.workoutLogId
      },
      details: details,
      timestamp: new Date().toISOString(),
      type: 'validation',
      severity: 'error'
    };

    this.errors.push(error);
    this.stats.validationErrors++;
  }

  logStructuredValidationIssue(issue, context) {
    const enhancedContext = {
      collection: 'workout_log_exercises',
      documentId: context.exerciseId || context.documentId || 'unknown',
      field: issue.field,
      exerciseId: context.exerciseId,
      workoutLogId: context.workoutLogId
    };

    const details = {
      originalValue: issue.originalValue,
      correctedValue: issue.correctedValue,
      issueType: issue.type,
      validationRule: issue.validationRule || 'unknown'
    };

    // Map issue types to warning categories
    let category;
    switch (issue.type) {
      case 'reps':
        category = this.validationWarningCategories.REPS_VALIDATION;
        break;
      case 'weights':
        category = this.validationWarningCategories.WEIGHTS_VALIDATION;
        break;
      case 'completed':
      case 'array_length':
        category = this.validationWarningCategories.ARRAY_LENGTH;
        break;
      case 'data_type':
        category = this.validationWarningCategories.DATA_TYPE;
        break;
      case 'required_field':
        category = this.validationWarningCategories.REQUIRED_FIELD;
        break;
      case 'bodyweight':
        category = this.validationWarningCategories.BODYWEIGHT_VALIDATION;
        break;
      default:
        category = 'validation_other';
    }

    if (issue.severity === 'error') {
      this.logValidationError(category, enhancedContext, issue.message, details);
    } else {
      this.logValidationWarning(category, enhancedContext, issue.message, details);
    }
  }

  // Update validation statistics based on validation outcomes (requirements 1.5, 3.5)
  updateValidationStatistics(validationResult) {
    if (!validationResult || !validationResult.issues) return;

    // Count specific validation issue types for detailed reporting
    validationResult.issues.forEach(issue => {
      switch (issue.type) {
        case 'reps':
          this.stats.validationStats.repsValidationIssues++;
          break;
        case 'weights':
          this.stats.validationStats.weightsValidationIssues++;
          break;
        case 'completed':
        case 'array_length':
          this.stats.validationStats.arrayLengthCorrections++;
          break;
      }

      // Track warnings vs errors
      if (issue.severity === 'warning') {
        this.stats.validationStats.totalValidationWarnings++;
      }
    });

    // Track corrections made
    if (validationResult.correctedExercise && validationResult.issues.length > 0) {
      this.stats.validationIssuesResolved += validationResult.issues.length;
    }
  }

  cleanJSON(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  // Enhanced data cleaning for workout-specific data
  cleanWorkoutData(workout) {
    if (!workout || typeof workout !== 'object') return null;

    // Ensure exercises array exists and is valid
    if (!Array.isArray(workout.exercises)) {
      workout.exercises = [];
    }

    // Clean exercise data
    workout.exercises = workout.exercises.filter(exercise => {
      return exercise && exercise.exerciseId && exercise.sets;
    });

    return workout;
  }

  normalizeRoles(value) {
    // Accepts string or array; always returns a non-empty array; defaults to ['user']
    if (Array.isArray(value)) {
      const cleaned = value
        .filter(v => typeof v === 'string')
        .map(v => v.trim())
        .filter(v => v.length > 0);
      return cleaned.length > 0 ? cleaned : ['user'];
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : ['user'];
    }
    return ['user'];
  }

  // Data mapping methods
  mapExperienceLevel(level) {
    const mapping = {
      'beginner': 'beginner',
      'intermediate': 'intermediate',
      'advanced': 'advanced',
      'Beginner': 'beginner',
      'Intermediate': 'intermediate',
      'Advanced': 'advanced'
    };
    return mapping[level] || 'beginner';
  }

  mapUnits(units) {
    const mapping = {
      'LB': 'LB',
      'KG': 'KG',
      'lb': 'LB',
      'kg': 'KG',
      'pounds': 'LB',
      'kilograms': 'KG'
    };
    return mapping[units] || 'LB';
  }

  // Reference resolution methods
  resolveUserReference(userId) {
    if (!userId) return null;

    // First try to get the mapped ID from our internal mapping (Firestore -> Supabase)
    const mappedId = this.idMappings.users.get(userId);
    if (mappedId) {
      this.stats.relationshipsMapped++;
      return mappedId;
    }

    // If not found in internal mapping, try direct lookup in user mapping
    const directMappedId = this.userIdMapping.get(userId);
    if (directMappedId) {
      this.stats.relationshipsMapped++;
      return directMappedId;
    }

    this.warnings.push(`User reference not found in mappings: ${userId}`);
    return null;
  }

  resolveExerciseReference(exerciseId) {
    if (!exerciseId) return null;
    const mappedId = this.idMappings.exercises.get(exerciseId);
    if (!mappedId) {
      this.warnings.push(`Exercise reference not found: ${exerciseId}`);
      return null;
    }
    this.stats.relationshipsMapped++;
    return mappedId;
  }

  resolveProgramReference(programId) {
    if (!programId) return null;
    const mappedId = this.idMappings.programs.get(programId);
    if (!mappedId) {
      this.warnings.push(`Program reference not found: ${programId}`);
      return null;
    }
    this.stats.relationshipsMapped++;
    return mappedId;
  }

  // Timestamp conversion methods
  convertTimestamp(timestamp) {
    if (!timestamp) return null;

    // Handle Firestore Timestamp objects
    if (timestamp && typeof timestamp === 'object' && timestamp.seconds) {
      return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1000000).toISOString();
    }

    // Handle Date objects
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }

    // Handle ISO strings
    if (typeof timestamp === 'string') {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date.toISOString();
    }

    return null;
  }

  convertDate(date) {
    if (!date) return null;

    const timestamp = this.convertTimestamp(date);
    if (!timestamp) return null;

    // Return just the date part (YYYY-MM-DD)
    return timestamp.split('T')[0];
  }

  generateUUID() {
    // Use crypto.randomUUID if available, otherwise fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback UUID generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  async saveTransformedData(transformedData) {
    console.log('\n💾 Saving transformed data...');

    for (const [collection, data] of Object.entries(transformedData)) {
      if (data && data.length > 0) {
        const filePath = path.join(this.options.outputDir, `${collection}.json`);
        const jsonData = JSON.stringify(data, null, 2);

        await fs.writeFile(filePath, jsonData, 'utf8');
        console.log(`   Saved ${data.length} records to ${collection}.json`);
      }
    }
  }

  async generateReport() {
    const report = {
      summary: this.stats,
      errors: this.errors,
      warnings: this.warnings,
      validationConfiguration: {
        enableValidation: this.options.enableValidation,
        validationLevel: this.options.validationLevel,
        skipInvalidExercises: this.options.skipInvalidExercises,
        logValidationDetails: this.options.logValidationDetails,
        stopOnValidationFailure: this.options.stopOnValidationFailure,
        // Additional validation settings (requirement 5.5)
        validationRules: {
          exerciseReferences: this.options.validateExerciseReferences,
          userReferences: this.options.validateUserReferences,
          dataTypes: this.options.validateDataTypes,
          requiredFields: this.options.validateRequiredFields,
          arrayBounds: this.options.validateArrayBounds
        },
        validationLimits: {
          maxValidationErrors: this.options.maxValidationErrors,
          batchSize: this.options.batchSize
        }
      },
      validationSummary: {
        totalValidationChecks: this.stats.validationChecksPerformed,
        totalIssuesFound: this.stats.validationIssuesFound,
        totalIssuesResolved: this.stats.validationIssuesResolved,
        exerciseValidationStats: this.stats.validationStats,
        issueBreakdownByType: this.stats.validationErrorsByType,
        validationWarnings: this.stats.validationWarnings,
        validationErrors: this.stats.validationErrors,
        categorizedWarnings: this.getCategorizedValidationWarnings(),
        structuredErrors: this.getStructuredValidationErrors(),
        // Enhanced validation issue breakdown by type (requirement 4.3, 5.3)
        detailedIssueBreakdown: {
          repsValidation: {
            issuesFound: this.stats.validationStats.repsValidationIssues,
            description: 'Issues with rep values (negative, zero, or non-numeric values converted to null)'
          },
          weightsValidation: {
            issuesFound: this.stats.validationStats.weightsValidationIssues,
            description: 'Issues with weight values (negative or non-numeric values converted to 0)'
          },
          arrayLengthCorrections: {
            issuesFound: this.stats.validationStats.arrayLengthCorrections,
            description: 'Array length mismatches corrected (padded or truncated to match sets count)'
          },
          invalidExercisesSkipped: {
            count: this.stats.validationStats.invalidExercisesSkipped,
            description: 'Exercises skipped due to critical validation failures'
          }
        },
        // Validation effectiveness metrics (requirement 5.5)
        validationEffectiveness: {
          exercisesProcessed: this.stats.validationStats.exercisesValidated,
          correctionRate: this.stats.validationStats.exercisesValidated > 0 
            ? ((this.stats.validationIssuesResolved / this.stats.validationStats.exercisesValidated) * 100).toFixed(2) + '%'
            : '0%',
          warningRate: this.stats.validationStats.exercisesValidated > 0
            ? ((this.stats.validationStats.totalValidationWarnings / this.stats.validationStats.exercisesValidated) * 100).toFixed(2) + '%'
            : '0%'
        },
        // Performance metrics (requirement 4.1)
        performanceMetrics: {
          totalValidationTime: this.performanceMetrics.totalValidationTime.toFixed(2) + 'ms',
          averageValidationTime: this.performanceMetrics.averageValidationTime.toFixed(2) + 'ms',
          validationCallCount: this.performanceMetrics.validationCallCount,
          memoryUsage: {
            startMemory: this.performanceMetrics.memoryUsageStart ? this.performanceMetrics.memoryUsageStart.toFixed(2) + 'MB' : 'N/A',
            endMemory: this.performanceMetrics.memoryUsageEnd ? this.performanceMetrics.memoryUsageEnd.toFixed(2) + 'MB' : 'N/A',
            peakMemory: this.performanceMetrics.memoryUsagePeak.toFixed(2) + 'MB',
            memoryDelta: this.performanceMetrics.memoryUsageStart && this.performanceMetrics.memoryUsageEnd 
              ? (this.performanceMetrics.memoryUsageEnd - this.performanceMetrics.memoryUsageStart).toFixed(2) + 'MB'
              : 'N/A'
          },
          methodBreakdown: Object.entries(this.performanceMetrics.validationMethodTimes).reduce((acc, [method, data]) => {
            if (data.callCount > 0) {
              acc[method] = {
                totalTime: data.totalTime.toFixed(2) + 'ms',
                averageTime: (data.totalTime / data.callCount).toFixed(2) + 'ms',
                callCount: data.callCount,
                percentageOfTotal: this.performanceMetrics.totalValidationTime > 0 
                  ? ((data.totalTime / this.performanceMetrics.totalValidationTime) * 100).toFixed(2) + '%'
                  : '0%'
              };
            }
            return acc;
          }, {}),
          performanceImpact: {
            validationOverhead: this.stats.validationStats.exercisesValidated > 0 && this.performanceMetrics.totalValidationTime > 0
              ? (this.performanceMetrics.totalValidationTime / this.stats.validationStats.exercisesValidated).toFixed(2) + 'ms per exercise'
              : 'N/A',
            memoryEfficiency: this.performanceMetrics.memoryUsagePeak > 0 && this.stats.validationStats.exercisesValidated > 0
              ? (this.performanceMetrics.memoryUsagePeak / this.stats.validationStats.exercisesValidated).toFixed(2) + 'MB per exercise'
              : 'N/A'
          }
        }
      },
      idMappings: {
        users: Object.fromEntries(this.idMappings.users),
        exercises: Object.fromEntries(this.idMappings.exercises),
        programs: Object.fromEntries(this.idMappings.programs),
        program_workouts: Object.fromEntries(this.idMappings.program_workouts)
      },
      timestamp: new Date().toISOString()
    };

    const reportPath = path.join(this.options.outputDir, 'transformation-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`📄 Transformation report saved to: ${reportPath}`);
  }

  getCategorizedValidationWarnings() {
    const categorized = {};
    
    // Initialize categories
    Object.values(this.validationWarningCategories).forEach(category => {
      categorized[category] = [];
    });
    categorized['other'] = [];

    // Categorize warnings
    this.warnings.forEach(warning => {
      if (typeof warning === 'object' && warning.category) {
        if (categorized[warning.category]) {
          categorized[warning.category].push(warning);
        } else {
          categorized['other'].push(warning);
        }
      }
    });

    return categorized;
  }

  getStructuredValidationErrors() {
    return this.errors.filter(error => 
      error.type === 'validation' && error.category
    ).reduce((acc, error) => {
      if (!acc[error.category]) {
        acc[error.category] = [];
      }
      acc[error.category].push(error);
      return acc;
    }, {});
  }

  printSummary() {
    console.log('\n📋 Transformation Summary:');
    console.log('='.repeat(50));
    console.log(`Total Documents: ${this.stats.totalDocuments}`);
    console.log(`Transformed Documents: ${this.stats.transformedDocuments}`);
    console.log(`Failed Transformations: ${this.stats.failedTransformations}`);
    console.log(`User Mappings Loaded: ${this.stats.userMappingsLoaded}`);
    console.log(`Relationships Mapped: ${this.stats.relationshipsMapped}`);
    console.log(`Cleaning Operations: ${this.stats.cleaningOperations}`);
    console.log(`Validation Errors: ${this.stats.validationErrors}`);
    console.log(`Warnings: ${this.warnings.length}`);

    console.log('\n📊 Table Transformation Summary:');
    console.log(`Programs: ${this.stats.programsTransformed}`);
    console.log(`Program Workouts: ${this.stats.workoutsTransformed}`);
    console.log(`Program Exercises: ${this.stats.exercisesTransformed}`);
    console.log(`Workout Logs: ${this.stats.workoutLogsTransformed}`);
    console.log(`Workout Log Exercises: ${this.stats.workoutLogExercisesTransformed}`);

    // Enhanced validation statistics reporting
    if (this.options.enableValidation && this.stats.validationStats.exercisesValidated > 0) {
      console.log('\n🔍 Validation Statistics:');
      console.log('='.repeat(50));
      console.log(`Exercises Validated: ${this.stats.validationStats.exercisesValidated}`);
      console.log(`Reps Validation Issues: ${this.stats.validationStats.repsValidationIssues}`);
      console.log(`Weights Validation Issues: ${this.stats.validationStats.weightsValidationIssues}`);
      console.log(`Array Length Corrections: ${this.stats.validationStats.arrayLengthCorrections}`);
      console.log(`Invalid Exercises Skipped: ${this.stats.validationStats.invalidExercisesSkipped}`);
      console.log(`Total Validation Warnings: ${this.stats.validationStats.totalValidationWarnings}`);
      
      // Enhanced validation effectiveness metrics (requirement 5.5)
      const correctionRate = this.stats.validationStats.exercisesValidated > 0 
        ? ((this.stats.validationIssuesResolved / this.stats.validationStats.exercisesValidated) * 100).toFixed(2)
        : '0';
      const warningRate = this.stats.validationStats.exercisesValidated > 0
        ? ((this.stats.validationStats.totalValidationWarnings / this.stats.validationStats.exercisesValidated) * 100).toFixed(2)
        : '0';
      
      console.log('\n📊 Validation Effectiveness:');
      console.log(`Correction Rate: ${correctionRate}% (${this.stats.validationIssuesResolved} corrections)`);
      console.log(`Warning Rate: ${warningRate}% (${this.stats.validationStats.totalValidationWarnings} warnings)`);
      console.log(`Validation Mode: ${this.options.validationLevel} (${this.options.enableValidation ? 'enabled' : 'disabled'})`);
      
      console.log('\n📈 Validation Issues by Type:');
      console.log(`Exercise References: ${this.stats.validationErrorsByType.exerciseReference}`);
      console.log(`User References: ${this.stats.validationErrorsByType.userReference}`);
      console.log(`Data Types: ${this.stats.validationErrorsByType.dataType}`);
      console.log(`Required Fields: ${this.stats.validationErrorsByType.requiredField}`);
      console.log(`Array Bounds: ${this.stats.validationErrorsByType.arrayBounds}`);
      console.log(`Other Issues: ${this.stats.validationErrorsByType.other}`);
      
      // Performance metrics summary (requirement 4.1)
      if (this.performanceMetrics.validationCallCount > 0) {
        console.log('\n⚡ Validation Performance Metrics:');
        console.log('='.repeat(50));
        console.log(`Total Validation Time: ${this.performanceMetrics.totalValidationTime.toFixed(2)}ms`);
        console.log(`Average Validation Time: ${this.performanceMetrics.averageValidationTime.toFixed(2)}ms`);
        console.log(`Validation Calls: ${this.performanceMetrics.validationCallCount}`);
        console.log(`Peak Memory Usage: ${this.performanceMetrics.memoryUsagePeak.toFixed(2)}MB`);
        
        if (this.performanceMetrics.memoryUsageStart && this.performanceMetrics.memoryUsageEnd) {
          const memoryDelta = this.performanceMetrics.memoryUsageEnd - this.performanceMetrics.memoryUsageStart;
          console.log(`Memory Delta: ${memoryDelta >= 0 ? '+' : ''}${memoryDelta.toFixed(2)}MB`);
        }
        
        // Method breakdown
        console.log('\n📊 Method Performance Breakdown:');
        Object.entries(this.performanceMetrics.validationMethodTimes).forEach(([method, data]) => {
          if (data.callCount > 0) {
            const avgTime = (data.totalTime / data.callCount).toFixed(2);
            const percentage = this.performanceMetrics.totalValidationTime > 0 
              ? ((data.totalTime / this.performanceMetrics.totalValidationTime) * 100).toFixed(1)
              : '0';
            console.log(`${method}: ${avgTime}ms avg (${data.callCount} calls, ${percentage}% of total)`);
          }
        });
        
        // Performance impact
        if (this.stats.validationStats.exercisesValidated > 0) {
          const overheadPerExercise = (this.performanceMetrics.totalValidationTime / this.stats.validationStats.exercisesValidated).toFixed(2);
          console.log(`\n💡 Validation Overhead: ${overheadPerExercise}ms per exercise`);
        }
      }
    }

    if (this.errors.length > 0) {
      console.log(`\n❌ Errors (${this.errors.length}):`);
      this.errors.slice(0, 5).forEach(error => {
        console.log(`   ${error.collection}/${error.documentId}: ${error.error}`);
      });

      if (this.errors.length > 5) {
        console.log(`   ... and ${this.errors.length - 5} more errors`);
      }
    }
  }

  async validateTransformedData(transformedData) {
    console.log('\n🔍 Validating transformed data...');

    for (const [collection, data] of Object.entries(transformedData)) {
      if (!POSTGRES_SCHEMAS[collection]) {
        console.log(`   ⚠️ No schema defined for ${collection}, skipping validation`);
        continue;
      }

      const schema = POSTGRES_SCHEMAS[collection];
      let validationErrors = 0;

      for (const record of data) {
        const recordErrors = this.validateRecord(record, schema);
        if (recordErrors.length > 0) {
          validationErrors += recordErrors.length;

          // Capture in report errors array
          const documentId = record && (record.id || record.workout_log_id || record.workout_id || record.program_id || record.exercise_id) || 'unknown';
          for (const err of recordErrors) {
            this.errors.push({
              collection,
              documentId,
              error: `Validation: ${err}`,
              timestamp: new Date().toISOString(),
              type: 'validation'
            });
          }

          if (this.options.verbose) {
            console.log(`   ❌ Validation errors in ${collection} (record ${documentId}):`, recordErrors);
          }
        }
      }

      if (validationErrors > 0) {
        console.log(`   ❌ ${validationErrors} validation errors in ${collection}`);
        this.stats.validationErrors += validationErrors;
      } else {
        console.log(`   ✅ ${collection} validation passed`);
      }
    }
  }

  validateRecord(record, schema) {
    const errors = [];

    for (const [columnName, columnDef] of Object.entries(schema.columns)) {
      if (columnDef.required && record[columnName] === undefined) {
        errors.push(`Missing required column: ${columnName}`);
        continue;
      }

      if (record[columnName] !== undefined && record[columnName] !== null) {
        const value = record[columnName];
        const expectedType = columnDef.type;

        // Basic type validation
        if (expectedType.includes('UUID') && typeof value !== 'string') {
          errors.push(`Column ${columnName} should be UUID string, got ${typeof value}`);
        } else if (expectedType.includes('VARCHAR') && typeof value !== 'string') {
          errors.push(`Column ${columnName} should be string, got ${typeof value}`);
          // } else if (expectedType.includes('INTEGER') && typeof value !== 'number') {
          //   errors.push(`Column ${columnName} should be number, got ${typeof value}`);
          // } else if (expectedType.includes('DECIMAL') && typeof value !== 'number') {
          //   errors.push(`Column ${columnName} should be number, got ${typeof value}`);
          // } else if (expectedType.includes('BOOLEAN') && typeof value !== 'boolean') {
          //   errors.push(`Column ${columnName} should be boolean, got ${typeof value}`);
        } else if (expectedType.includes('TIMESTAMP') && typeof value !== 'string') {
          errors.push(`Column ${columnName} should be ISO string, got ${typeof value}`);
        } else if (expectedType.includes('DATE') && typeof value !== 'string') {
          errors.push(`Column ${columnName} should be date string, got ${typeof value}`);
        } else if (expectedType.includes('[]') && !Array.isArray(value)) {
          errors.push(`Column ${columnName} should be array, got ${typeof value}`);
        } else if (expectedType.includes('JSONB') && typeof value !== 'object') {
          errors.push(`Column ${columnName} should be object, got ${typeof value}`);
        }
      }
    }

    return errors;
  }

  // Validate data integrity after transformation
  validateDataIntegrity(transformedData) {
    console.log('\n🔍 Validating data integrity...');

    let integrityErrors = 0;

    // Check that all foreign key references exist
    for (const workout of transformedData.program_workouts) {
      if (!transformedData.programs.find(p => p.id === workout.program_id)) {
        this.errors.push({
          collection: 'program_workouts',
          documentId: workout.id,
          error: `Invalid program_id reference: ${workout.program_id}`,
          timestamp: new Date().toISOString(),
          type: 'integrity'
        });
        integrityErrors++;
      }
    }

    for (const exercise of transformedData.program_exercises) {
      if (!transformedData.program_workouts.find(w => w.id === exercise.workout_id)) {
        this.errors.push({
          collection: 'program_exercises',
          documentId: exercise.id,
          error: `Invalid workout_id reference: ${exercise.workout_id}`,
          timestamp: new Date().toISOString(),
          type: 'integrity'
        });
        integrityErrors++;
      }

      if (!transformedData.exercises.find(e => e.id === exercise.exercise_id)) {
        this.errors.push({
          collection: 'program_exercises',
          documentId: exercise.id,
          error: `Invalid exercise_id reference: ${exercise.exercise_id}`,
          timestamp: new Date().toISOString(),
          type: 'integrity'
        });
        integrityErrors++;
      }
    }

    for (const workoutLog of transformedData.workout_logs) {
      if (workoutLog.program_id && !transformedData.programs.find(p => p.id === workoutLog.program_id)) {
        this.errors.push({
          collection: 'workout_logs',
          documentId: workoutLog.id,
          error: `Invalid program_id reference: ${workoutLog.program_id}`,
          timestamp: new Date().toISOString(),
          type: 'integrity'
        });
        integrityErrors++;
      }
    }

    for (const exercise of transformedData.workout_log_exercises) {
      if (!transformedData.workout_logs.find(w => w.id === exercise.workout_log_id)) {
        this.errors.push({
          collection: 'workout_log_exercises',
          documentId: exercise.id,
          error: `Invalid workout_log_id reference: ${exercise.workout_log_id}`,
          timestamp: new Date().toISOString(),
          type: 'integrity'
        });
        integrityErrors++;
      }

      if (!transformedData.exercises.find(e => e.id === exercise.exercise_id)) {
        this.errors.push({
          collection: 'workout_log_exercises',
          documentId: exercise.id,
          error: `Invalid exercise_id reference: ${exercise.exercise_id}`,
          timestamp: new Date().toISOString(),
          type: 'integrity'
        });
        integrityErrors++;
      }
    }

    if (integrityErrors > 0) {
      console.log(`   ❌ ${integrityErrors} data integrity errors found`);
      this.stats.validationErrors += integrityErrors;
    } else {
      console.log('   ✅ Data integrity validation passed');
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input-dir':
        options.inputDir = args[++i];
        break;
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i]);
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--no-validation':
        options.validateOutput = false;
        break;
      case '--no-cleaning':
        options.cleanData = false;
        break;
      case '--user-mapping':
        options.userMappingFile = args[++i];
        break;
      case '--help':
        console.log(`
Data Transformation Tool

Usage: node data-transformer.js [options]

Options:
  --input-dir <path>     Input directory with extracted Firestore data
  --output-dir <path>    Output directory for transformed data
  --user-mapping <path>  Path to user mapping JSON file (default: <input-dir>/user_mapping.json)
  --batch-size <number>  Batch size for processing
  --verbose              Enable verbose logging
  --no-validation        Skip output validation
  --no-cleaning          Skip data cleaning
  --help                 Show this help message
`);
        process.exit(0);
        break;
    }
  }

  try {
    const transformer = new DataTransformer(options);
    await transformer.transform();

    if (transformer.errors.length > 0) {
      console.log('\n⚠️ Transformation completed with errors. Check transformation-report.json for details.');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Transformation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { DataTransformer, POSTGRES_SCHEMAS };