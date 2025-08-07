/**
 * Unit Tests for Data Transformation Utilities
 * 
 * Tests the data transformation functions used in the Firebase to Supabase migration:
 * - Program structure transformations
 * - Exercise data transformations
 * - Workout log transformations
 * - Backward compatibility utilities
 */

import {
  transformSupabaseProgramToWeeklyConfigs,
  transformSupabaseExercises,
  transformExercisesToSupabaseFormat,
  transformSupabaseWorkoutLogs,
  createWorkoutDataForSupabase,
  validateExerciseData,
  ensureBackwardCompatibility
} from '../dataTransformations';

// Mock programUtils for testing
jest.mock('../programUtils', () => ({
  parseWeeklyConfigs: jest.fn((configString) => {
    try {
      return JSON.parse(configString)
    } catch {
      return []
    }
  })
}));

describe('Data Transformation Utilities', () => {
  describe('transformSupabaseProgramToWeeklyConfigs', () => {
    it('should transform Supabase program structure to weekly_configs format', () => {
      const supabaseProgram = {
        id: 'program-123',
        name: 'Test Program',
        duration: 2,
        days_per_week: 2,
        program_workouts: [
          {
            week_number: 1,
            day_number: 1,
            name: 'Day 1',
            program_exercises: [
              {
                exercise_id: 'exercise-1',
                sets: 3,
                reps: 10,
                notes: 'Test notes',
                order_index: 1
              }
            ]
          },
          {
            week_number: 1,
            day_number: 2,
            name: 'Day 2',
            program_exercises: [
              {
                exercise_id: 'exercise-2',
                sets: 4,
                reps: 8,
                notes: '',
                order_index: 1
              }
            ]
          },
          {
            week_number: 2,
            day_number: 1,
            name: 'Week 2 Day 1',
            program_exercises: []
          }
        ]
      };

      const result = transformSupabaseProgramToWeeklyConfigs(supabaseProgram);

      // Should return program object with weekly_configs property
      expect(result).toHaveProperty('id', 'program-123');
      expect(result).toHaveProperty('name', 'Test Program');
      expect(result).toHaveProperty('weekly_configs');
      
      // Check weekly_configs structure
      expect(result.weekly_configs).toHaveProperty('week1_day1');
      expect(result.weekly_configs).toHaveProperty('week1_day2');
      expect(result.weekly_configs).toHaveProperty('week2_day1');
      
      // Check first week, first day
      expect(result.weekly_configs.week1_day1).toEqual({
        name: 'Day 1',
        exercises: [
          {
            exerciseId: 'exercise-1',
            sets: 3,
            reps: 10,
            notes: 'Test notes'
          }
        ]
      });

      // Check first week, second day
      expect(result.weekly_configs.week1_day2).toEqual({
        name: 'Day 2',
        exercises: [
          {
            exerciseId: 'exercise-2',
            sets: 4,
            reps: 8,
            notes: ''
          }
        ]
      });

      // Check second week, first day
      expect(result.weekly_configs.week2_day1).toEqual({
        name: 'Week 2 Day 1',
        exercises: []
      });
    });

    it('should handle missing program_workouts', () => {
      const incompleteProgram = {
        id: 'program-123',
        name: 'Incomplete Program'
      };

      const result = transformSupabaseProgramToWeeklyConfigs(incompleteProgram);

      expect(result).toHaveProperty('id', 'program-123');
      expect(result).toHaveProperty('name', 'Incomplete Program');
      expect(result).toHaveProperty('weekly_configs', {});
    });

    it('should handle programs with no exercises', () => {
      const programWithoutExercises = {
        id: 'program-456',
        duration: 1,
        days_per_week: 1,
        program_workouts: [
          {
            week_number: 1,
            day_number: 1,
            name: 'Empty Day',
            program_exercises: null
          }
        ]
      };

      const result = transformSupabaseProgramToWeeklyConfigs(programWithoutExercises);

      expect(result.weekly_configs.week1_day1).toEqual({
        name: 'Empty Day',
        exercises: []
      });
    });

    it('should handle out-of-bounds week/day numbers', () => {
      const programWithInvalidIndices = {
        id: 'program-789',
        duration: 1,
        days_per_week: 1,
        program_workouts: [
          {
            week_number: 1,
            day_number: 1,
            name: 'Valid Day',
            program_exercises: []
          },
          {
            week_number: 5, // Out of bounds
            day_number: 1,
            name: 'Invalid Day',
            program_exercises: []
          }
        ]
      };

      const result = transformSupabaseProgramToWeeklyConfigs(programWithInvalidIndices);

      expect(result.weekly_configs).toHaveProperty('week1_day1');
      expect(result.weekly_configs).not.toHaveProperty('week5_day1');
      expect(result.weekly_configs.week1_day1.name).toBe('Valid Day');
    });

    it('should handle null or invalid program input', () => {
      const nullResult = transformSupabaseProgramToWeeklyConfigs(null);
      expect(nullResult).toHaveProperty('weekly_configs', {});

      const undefinedResult = transformSupabaseProgramToWeeklyConfigs(undefined);
      expect(undefinedResult).toHaveProperty('weekly_configs', {});
    });

    it('should sort exercises by order_index', () => {
      const programWithOrderedExercises = {
        id: 'program-ordered',
        duration: 1,
        days_per_week: 1,
        program_workouts: [
          {
            week_number: 1,
            day_number: 1,
            name: 'Ordered Day',
            program_exercises: [
              {
                exercise_id: 'exercise-2',
                sets: 3,
                reps: 8,
                order_index: 2
              },
              {
                exercise_id: 'exercise-1',
                sets: 3,
                reps: 10,
                order_index: 1
              }
            ]
          }
        ]
      };

      const result = transformSupabaseProgramToWeeklyConfigs(programWithOrderedExercises);

      expect(result.weekly_configs.week1_day1.exercises).toEqual([
        {
          exerciseId: 'exercise-1',
          sets: 3,
          reps: 10,
          notes: ''
        },
        {
          exerciseId: 'exercise-2',
          sets: 3,
          reps: 8,
          notes: ''
        }
      ]);
    });

    it('should handle invalid exercise objects gracefully', () => {
      const programWithInvalidExercises = {
        id: 'program-invalid-ex',
        duration: 1,
        days_per_week: 1,
        program_workouts: [
          {
            week_number: 1,
            day_number: 1,
            name: 'Mixed Exercises',
            program_exercises: [
              {
                exercise_id: 'valid-exercise',
                sets: 3,
                reps: 10,
                order_index: 1
              },
              null, // Invalid exercise
              {
                // Missing exercise_id
                sets: 3,
                reps: 8,
                order_index: 2
              },
              {
                exercise_id: 'another-valid',
                sets: 'invalid', // Invalid sets value
                reps: 'invalid', // Invalid reps value
                order_index: 3
              }
            ]
          }
        ]
      };

      const result = transformSupabaseProgramToWeeklyConfigs(programWithInvalidExercises);

      // Should only include valid exercises with proper defaults
      expect(result.weekly_configs.week1_day1.exercises).toEqual([
        {
          exerciseId: 'valid-exercise',
          sets: 3,
          reps: 10,
          notes: ''
        },
        {
          exerciseId: '',
          sets: 3,
          reps: 8,
          notes: ''
        },
        {
          exerciseId: 'another-valid',
          sets: 3, // Default value
          reps: 8, // Default value
          notes: ''
        }
      ]);
    });

    it('should handle invalid workout objects', () => {
      const programWithInvalidWorkouts = {
        id: 'program-invalid-workouts',
        duration: 2,
        days_per_week: 2,
        program_workouts: [
          {
            week_number: 1,
            day_number: 1,
            name: 'Valid Workout',
            program_exercises: []
          },
          null, // Invalid workout
          {
            // Missing week_number and day_number
            name: 'Invalid Workout',
            program_exercises: []
          },
          {
            week_number: 0, // Invalid week number (should be >= 1)
            day_number: 1,
            name: 'Zero Week',
            program_exercises: []
          },
          {
            week_number: 1,
            day_number: 2,
            name: 'Valid Workout 2',
            program_exercises: []
          }
        ]
      };

      const result = transformSupabaseProgramToWeeklyConfigs(programWithInvalidWorkouts);

      // Should only include valid workouts
      expect(result.weekly_configs).toHaveProperty('week1_day1');
      expect(result.weekly_configs).toHaveProperty('week1_day2');
      expect(Object.keys(result.weekly_configs)).toHaveLength(2);
      
      expect(result.weekly_configs.week1_day1.name).toBe('Valid Workout');
      expect(result.weekly_configs.week1_day2.name).toBe('Valid Workout 2');
    });

    it('should handle programs with invalid duration or days_per_week', () => {
      const invalidPrograms = [
        {
          id: 'program-no-duration',
          name: 'No Duration',
          days_per_week: 3,
          program_workouts: []
        },
        {
          id: 'program-zero-duration',
          name: 'Zero Duration',
          duration: 0,
          days_per_week: 3,
          program_workouts: []
        },
        {
          id: 'program-negative-days',
          name: 'Negative Days',
          duration: 2,
          days_per_week: -1,
          program_workouts: []
        }
      ];

      invalidPrograms.forEach(program => {
        const result = transformSupabaseProgramToWeeklyConfigs(program);
        expect(result).toHaveProperty('weekly_configs', {});
        expect(result.id).toBe(program.id);
      });
    });

    it('should preserve all original program properties', () => {
      const programWithExtraProps = {
        id: 'program-extra',
        name: 'Program with Extra Props',
        description: 'A test program',
        created_by: 'user-123',
        created_at: '2024-01-01T00:00:00Z',
        duration: 1,
        days_per_week: 1,
        custom_field: 'custom_value',
        program_workouts: [
          {
            week_number: 1,
            day_number: 1,
            name: 'Day 1',
            program_exercises: []
          }
        ]
      };

      const result = transformSupabaseProgramToWeeklyConfigs(programWithExtraProps);

      // Should preserve all original properties
      expect(result.id).toBe('program-extra');
      expect(result.name).toBe('Program with Extra Props');
      expect(result.description).toBe('A test program');
      expect(result.created_by).toBe('user-123');
      expect(result.created_at).toBe('2024-01-01T00:00:00Z');
      expect(result.custom_field).toBe('custom_value');
      
      // Should add weekly_configs
      expect(result).toHaveProperty('weekly_configs');
      expect(result.weekly_configs).toHaveProperty('week1_day1');
    });

    it('should handle exercises with missing order_index', () => {
      const programWithMissingOrderIndex = {
        id: 'program-no-order',
        duration: 1,
        days_per_week: 1,
        program_workouts: [
          {
            week_number: 1,
            day_number: 1,
            name: 'Unordered Day',
            program_exercises: [
              {
                exercise_id: 'exercise-1',
                sets: 3,
                reps: 10
                // Missing order_index
              },
              {
                exercise_id: 'exercise-2',
                sets: 3,
                reps: 8,
                order_index: 1
              }
            ]
          }
        ]
      };

      const result = transformSupabaseProgramToWeeklyConfigs(programWithMissingOrderIndex);

      // Should handle missing order_index gracefully (defaults to 0)
      expect(result.weekly_configs.week1_day1.exercises).toHaveLength(2);
      expect(result.weekly_configs.week1_day1.exercises[0].exerciseId).toBe('exercise-1'); // order_index 0 comes first
      expect(result.weekly_configs.week1_day1.exercises[1].exerciseId).toBe('exercise-2'); // order_index 1 comes second
    });
  });

  describe('transformSupabaseExercises', () => {
    it('should transform Supabase exercise data to component format', () => {
      const supabaseExercises = [
        {
          id: 'exercise-1',
          name: 'Bench Press',
          primary_muscle_group: 'Chest',
          exercise_type: 'Barbell',
          description: 'Chest exercise',
          instructions: 'Lie on bench...',
          is_global: true,
          created_by: 'admin',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'exercise-2',
          name: 'Push-ups',
          primary_muscle_group: 'Chest',
          exercise_type: 'Bodyweight',
          description: 'Bodyweight exercise',
          instructions: 'Start in plank...',
          is_global: false,
          created_by: 'user-123',
          created_at: '2024-01-02T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z'
        }
      ];

      const result = transformSupabaseExercises(supabaseExercises);

      expect(result).toHaveLength(2);
      
      expect(result[0]).toEqual({
        id: 'exercise-1',
        name: 'Bench Press',
        primaryMuscleGroup: 'Chest',
        exerciseType: 'Barbell',
        description: 'Chest exercise',
        instructions: 'Lie on bench...',
        isGlobal: true,
        source: 'global',
        createdBy: 'admin',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z'
      });

      expect(result[1]).toEqual({
        id: 'exercise-2',
        name: 'Push-ups',
        primaryMuscleGroup: 'Chest',
        exerciseType: 'Bodyweight',
        description: 'Bodyweight exercise',
        instructions: 'Start in plank...',
        isGlobal: false,
        source: 'custom',
        createdBy: 'user-123',
        created_at: '2024-01-02T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z'
      });
    });

    it('should handle empty exercise array', () => {
      const result = transformSupabaseExercises([]);
      expect(result).toEqual([]);
    });
  });

  describe('transformExercisesToSupabaseFormat', () => {
    it('should transform component exercise data to Supabase format', () => {
      const componentExercises = [
        {
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 8, 6],
          weights: [135, 140, 145],
          completed: [true, true, false],
          notes: 'Good form',
          bodyweight: null,
          isAdded: false,
          addedType: null,
          originalIndex: -1
        },
        {
          exerciseId: 'exercise-2',
          sets: 3,
          reps: ['12', '10', '8'],
          weights: ['', '', ''],
          completed: [true, true, true],
          notes: '',
          bodyweight: '180',
          isAdded: true,
          addedType: 'temporary',
          originalIndex: 0
        }
      ];

      const result = transformExercisesToSupabaseFormat(componentExercises);

      expect(result).toHaveLength(2);
      
      expect(result[0]).toEqual({
        exerciseId: 'exercise-1',
        sets: 3,
        reps: [10, 8, 6],
        weights: [135, 140, 145],
        completed: [true, true, false],
        notes: 'Good form',
        bodyweight: null,
        isAdded: false,
        addedType: null,
        originalIndex: -1
      });

      expect(result[1]).toEqual({
        exerciseId: 'exercise-2',
        sets: 3,
        reps: [12, 10, 8], // Converted to numbers
        weights: [0, 0, 0], // Empty strings converted to 0
        completed: [true, true, true],
        notes: '',
        bodyweight: 180, // Converted to number
        isAdded: true,
        addedType: 'temporary',
        originalIndex: 0
      });
    });

    it('should handle missing optional fields', () => {
      const minimalExercise = [
        {
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [100, 100, 100],
          completed: [true, true, true]
        }
      ];

      const result = transformExercisesToSupabaseFormat(minimalExercise);

      expect(result[0]).toEqual({
        exerciseId: 'exercise-1',
        sets: 3,
        reps: [10, 10, 10],
        weights: [100, 100, 100],
        completed: [true, true, true],
        notes: '',
        bodyweight: null,
        isAdded: false,
        addedType: null,
        originalIndex: -1
      });
    });
  });

  describe('transformSupabaseWorkoutLogs', () => {
    it('should transform Supabase workout logs to component format', () => {
      const supabaseLogs = [
        {
          id: 'log-1',
          week_index: 0,
          day_index: 0,
          is_finished: true,
          workout_log_exercises: [
            {
              exercise_id: 'exercise-1',
              sets: 3,
              reps: [10, 8, 6],
              weights: [135, 140, 145],
              completed: [true, true, false],
              notes: 'Good set',
              bodyweight: null,
              is_added: false,
              added_type: null,
              original_index: -1
            }
          ]
        },
        {
          id: 'log-2',
          week_index: 0,
          day_index: 1,
          is_finished: false,
          workout_log_exercises: [
            {
              exercise_id: 'exercise-2',
              sets: 2,
              reps: null, // Handle null reps
              weights: null, // Handle null weights
              completed: null, // Handle null completed
              notes: '',
              bodyweight: 180,
              is_added: true,
              added_type: 'permanent',
              original_index: 0
            }
          ]
        }
      ];

      const result = transformSupabaseWorkoutLogs(supabaseLogs);

      expect(result).toEqual({
        '0_0': {
          exercises: [
            {
              exerciseId: 'exercise-1',
              sets: 3,
              reps: [10, 8, 6],
              weights: [135, 140, 145],
              completed: [true, true, false],
              notes: 'Good set',
              bodyweight: '',
              isAdded: false,
              addedType: null,
              originalIndex: -1
            }
          ],
          isWorkoutFinished: true,
          workoutLogId: 'log-1'
        },
        '0_1': {
          exercises: [
            {
              exerciseId: 'exercise-2',
              sets: 2,
              reps: ['', ''], // Filled with defaults
              weights: ['', ''], // Filled with defaults
              completed: [false, false], // Filled with defaults
              notes: '',
              bodyweight: 180,
              isAdded: true,
              addedType: 'permanent',
              originalIndex: 0
            }
          ],
          isWorkoutFinished: false,
          workoutLogId: 'log-2'
        }
      });
    });

    it('should handle empty workout logs', () => {
      const result = transformSupabaseWorkoutLogs([]);
      expect(result).toEqual({});
    });
  });

  describe('createWorkoutDataForSupabase', () => {
    it('should create workout data object for Supabase service', () => {
      const program = {
        id: 'program-123',
        name: 'Test Program'
      };

      const exercises = [
        {
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [135, 135, 135],
          completed: [true, true, true]
        }
      ];

      const result = createWorkoutDataForSupabase({
        program,
        weekIndex: 0,
        dayIndex: 1,
        exercises,
        isFinished: false
      });

      expect(result).toEqual({
        programId: 'program-123',
        weekIndex: 0,
        dayIndex: 1,
        name: 'Test Program - Week 1, Day 2',
        type: 'program_workout',
        date: expect.any(String), // Current date
        isFinished: false,
        isDraft: false,
        weightUnit: 'LB',
        exercises
      });

      // Verify date format
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should include completed date when provided', () => {
      const program = { id: 'program-123', name: 'Test Program' };
      const exercises = [];
      const completedDate = new Date('2024-01-15T10:00:00Z');

      const result = createWorkoutDataForSupabase({
        program,
        weekIndex: 0,
        dayIndex: 0,
        exercises,
        isFinished: true,
        completedDate
      });

      expect(result.completedDate).toBe(completedDate);
      expect(result.isFinished).toBe(true);
    });
  });

  describe('validateExerciseData', () => {
    it('should validate correct exercise data', () => {
      const validData = [
        {
          exerciseId: 'exercise-1',
          sets: 3,
          reps: [10, 10, 10],
          weights: [135, 135, 135],
          completed: [true, true, true]
        }
      ];

      expect(validateExerciseData(validData)).toBe(true);
    });

    it('should reject invalid exercise data', () => {
      const invalidData = [
        {
          exerciseId: 'exercise-1',
          sets: '3', // Should be number
          reps: [10, 10, 10],
          weights: [135, 135, 135],
          completed: [true, true, true]
        }
      ];

      expect(validateExerciseData(invalidData)).toBe(false);
    });

    it('should reject non-array input', () => {
      expect(validateExerciseData(null)).toBe(false);
      expect(validateExerciseData({})).toBe(false);
      expect(validateExerciseData('invalid')).toBe(false);
    });

    it('should reject exercises missing required fields', () => {
      const incompleteData = [
        {
          exerciseId: 'exercise-1',
          // Missing sets, reps, weights, completed
        }
      ];

      expect(validateExerciseData(incompleteData)).toBe(false);
    });
  });

  describe('ensureBackwardCompatibility', () => {
    describe('program compatibility', () => {
      it('should convert Firebase weekly_configs to weeklyConfigs', () => {
        const firebaseProgram = {
          id: 'program-123',
          weekly_configs: JSON.stringify([
            [{ name: 'Day 1', exercises: [] }]
          ]),
          duration: 1,
          days_per_week: 1
        };

        // parseWeeklyConfigs is already mocked at the top of the file

        const result = ensureBackwardCompatibility(firebaseProgram, 'program');

        expect(result.weeklyConfigs).toEqual([
          [{ name: 'Day 1', exercises: [] }]
        ]);
      });

      it('should convert Supabase program_workouts to weeklyConfigs', () => {
        const supabaseProgram = {
          id: 'program-123',
          program_workouts: [
            {
              week_number: 1,
              day_number: 1,
              name: 'Day 1',
              program_exercises: []
            }
          ],
          duration: 1,
          days_per_week: 1
        };

        const result = ensureBackwardCompatibility(supabaseProgram, 'program');

        expect(result.weeklyConfigs).toBeDefined();
        expect(Array.isArray(result.weeklyConfigs)).toBe(true);
      });

      it('should not modify programs that already have weeklyConfigs', () => {
        const programWithConfigs = {
          id: 'program-123',
          weeklyConfigs: [
            [{ name: 'Existing Day', exercises: [] }]
          ]
        };

        const result = ensureBackwardCompatibility(programWithConfigs, 'program');

        expect(result.weeklyConfigs).toEqual([
          [{ name: 'Existing Day', exercises: [] }]
        ]);
      });
    });

    describe('exercise compatibility', () => {
      it('should convert snake_case to camelCase for exercises', () => {
        const supabaseExercise = {
          id: 'exercise-1',
          name: 'Bench Press',
          primary_muscle_group: 'Chest',
          exercise_type: 'Barbell',
          is_global: true
        };

        const result = ensureBackwardCompatibility(supabaseExercise, 'exercise');

        expect(result.primaryMuscleGroup).toBe('Chest');
        expect(result.exerciseType).toBe('Barbell');
        expect(result.isGlobal).toBe(true);
      });

      it('should not overwrite existing camelCase properties', () => {
        const exerciseWithCamelCase = {
          id: 'exercise-1',
          primary_muscle_group: 'Chest',
          primaryMuscleGroup: 'Shoulders' // This should be preserved
        };

        const result = ensureBackwardCompatibility(exerciseWithCamelCase, 'exercise');

        expect(result.primaryMuscleGroup).toBe('Shoulders');
      });
    });

    describe('workout log compatibility', () => {
      it('should convert snake_case to camelCase for workout logs', () => {
        const supabaseWorkoutLog = {
          id: 'log-1',
          is_finished: true,
          week_index: 0,
          day_index: 1
        };

        const result = ensureBackwardCompatibility(supabaseWorkoutLog, 'workoutLog');

        expect(result.isWorkoutFinished).toBe(true);
        expect(result.weekIndex).toBe(0);
        expect(result.dayIndex).toBe(1);
      });

      it('should not overwrite existing camelCase properties', () => {
        const logWithCamelCase = {
          id: 'log-1',
          is_finished: true,
          isWorkoutFinished: false // This should be preserved
        };

        const result = ensureBackwardCompatibility(logWithCamelCase, 'workoutLog');

        expect(result.isWorkoutFinished).toBe(false);
      });
    });

    it('should handle null/undefined data gracefully', () => {
      expect(ensureBackwardCompatibility(null, 'program')).toBeNull();
      expect(ensureBackwardCompatibility(undefined, 'exercise')).toBeUndefined();
    });

    it('should handle unknown types gracefully', () => {
      const data = { id: 'test' };
      const result = ensureBackwardCompatibility(data, 'unknown');
      expect(result).toEqual(data);
    });
  });
});