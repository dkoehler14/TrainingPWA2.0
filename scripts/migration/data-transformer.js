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
      batchSize: options.batchSize || 100,
      validateOutput: options.validateOutput || true,
      cleanData: options.cleanData || true,
      verbose: options.verbose || false,
      ...options
    };
    
    this.stats = {
      totalDocuments: 0,
      transformedDocuments: 0,
      failedTransformations: 0,
      cleaningOperations: 0,
      validationErrors: 0,
      relationshipsMapped: 0,
      programsTransformed: 0,
      workoutsTransformed: 0,
      exercisesTransformed: 0,
      workoutLogsTransformed: 0,
      workoutLogExercisesTransformed: 0
    };
    
    this.idMappings = {
      users: new Map(),
      exercises: new Map(),
      programs: new Map(),
      program_workouts: new Map()
    };
    
    this.duplicateWorkoutTracker = new Map();
    this.errors = [];
    this.warnings = [];
  }

  async transform() {
    console.log('🔄 Starting data transformation...');
    
    // Create output directory
    await fs.mkdir(this.options.outputDir, { recursive: true });
    
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
    const transformed = {
      id: user.id,
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
    
    // Store ID mapping for foreign key resolution
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
        exercises.push(transformedExercise);
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
    
    return {
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
    const mappedId = this.idMappings.users.get(userId);
    if (!mappedId) {
      this.warnings.push(`User reference not found: ${userId}`);
      return null;
    }
    this.stats.relationshipsMapped++;
    return mappedId;
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
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
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

  printSummary() {
    console.log('\n📋 Transformation Summary:');
    console.log('='.repeat(50));
    console.log(`Total Documents: ${this.stats.totalDocuments}`);
    console.log(`Transformed Documents: ${this.stats.transformedDocuments}`);
    console.log(`Failed Transformations: ${this.stats.failedTransformations}`);
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
      case '--help':
        console.log(`
Data Transformation Tool

Usage: node data-transformer.js [options]

Options:
  --input-dir <path>     Input directory with extracted Firestore data
  --output-dir <path>    Output directory for transformed data
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