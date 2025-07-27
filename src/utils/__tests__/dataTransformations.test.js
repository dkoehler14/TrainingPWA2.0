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
    it('should transform Supabase program structure to weeklyConfigs format', () => {
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
                notes: 'Test notes'
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
                notes: ''
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

      expect(result).toHaveLength(2); // 2 weeks
      expect(result[0]).toHaveLength(2); // 2 days per week
      
      // Check first week, first day
      expect(result[0][0]).toEqual({
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
      expect(result[0][1]).toEqual({
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
      expect(result[1][0]).toEqual({
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

      expect(result).toEqual([]);
    });

    it('should handle programs with no exercises', () => {
      const programWithoutExercises = {
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

      expect(result[0][0]).toEqual({
        name: 'Empty Day',
        exercises: []
      });
    });

    it('should handle out-of-bounds week/day numbers', () => {
      const programWithInvalidIndices = {
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

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].name).toBe('Valid Day');
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
          isWorkoutFinished: true
        },
        '0_1': {
          exercises: [
            {
              exerciseId: 'exercise-2',
              sets: 2,
              reps: [0, 0], // Filled with defaults
              weights: ['', ''], // Filled with defaults
              completed: [false, false], // Filled with defaults
              notes: '',
              bodyweight: 180,
              isAdded: true,
              addedType: 'permanent',
              originalIndex: 0
            }
          ],
          isWorkoutFinished: false
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