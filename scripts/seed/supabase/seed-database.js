#!/usr/bin/env node

/**
 * Supabase Database Seeding Script
 * 
 * This script provides comprehensive database seeding for PostgreSQL
 * with realistic test data for development and testing.
 */

const { getSupabaseClient } = require('../utils/supabase-helpers');
const { logProgress, logSection } = require('../utils/logger');

/**
 * Comprehensive database seeding with realistic data
 */
async function seedDatabase(options = {}) {
  const {
    verbose = false,
    includeHistoricalData = true,
    scenario = 'basic',
    scenarios = null,
    generateProgressiveData = true
  } = options;

  const supabase = getSupabaseClient(true); // Use service role for seeding
  const startTime = Date.now();

  if (verbose) {
    logSection('Comprehensive Database Seeding');
    logProgress(`Seeding scenario: ${scenarios ? scenarios.join(', ') : scenario}`, 'info');
  }

  try {
    // Step 1: Ensure global exercises exist
    await seedGlobalExercises(supabase, { verbose });

    // Step 2: Create test users with varied profiles based on scenarios
    const users = await seedTestUsers(supabase, { verbose, scenario, scenarios });

    // Step 3: Create programs for each user
    const programs = await seedUserPrograms(supabase, users, { verbose });

    // Step 4: Create program workouts and exercises
    const workouts = await seedProgramWorkouts(supabase, programs, { verbose });

    // Step 5: Create historical workout data if requested
    let workoutLogs = [];
    // Step 4: Create relationships and invitations
    await seedRelationshipsAndInvitations(supabase, users, { verbose });

    if (includeHistoricalData) {
      workoutLogs = await seedHistoricalWorkouts(supabase, users, programs, {
        verbose,
        generateProgressiveData
      });
    }

    // Step 6: Generate user analytics based on workout history
    await generateUserAnalytics(supabase, users, workoutLogs, { verbose });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    if (verbose) {
      logProgress('✅ Database seeding completed successfully', 'success');
    }

    return {
      success: true,
      summary: {
        users: users.length,
        programs: programs.length,
        workouts: workouts.length,
        workoutLogs: workoutLogs.length,
        historicalData: includeHistoricalData,
        duration
      },
      users,
      programs,
      workouts,
      workoutLogs
    };
  } catch (error) {
    console.error('Error seeding database:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Seed global exercises if they don't exist
 */
async function seedGlobalExercises(supabase, options = {}) {
  const { verbose = false } = options;

  if (verbose) {
    logProgress('Checking global exercises...', 'info');
  }

  // Check if exercises already exist
  const { data: existingExercises, error } = await supabase
    .from('exercises')
    .select('id')
    .eq('is_global', true)
    .limit(1);

  if (error) {
    throw new Error(`Failed to check existing exercises: ${error.message}`);
  }

  if (existingExercises && existingExercises.length > 0) {
    if (verbose) {
      logProgress('Global exercises already exist, skipping...', 'info');
    }
    return;
  }

  if (verbose) {
    logProgress('Seeding global exercises...', 'info');
  }

  // This would typically be handled by the SQL seed file
  // For now, we'll assume it's already been run
  logProgress('Global exercises should be seeded via supabase/seed.sql', 'warning');
}

/**
 * Create test users with varied profiles based on scenarios
 */
async function seedTestUsers(supabase, options = {}) {
  const { verbose = false, scenario = 'basic', scenarios = null } = options;

  if (verbose) {
    logProgress('Creating test users...', 'info');
  }

  // Define user templates for different scenarios
  const userTemplates = {
    basic: [
      {
        id: '550e8400-e29b-41d4-a716-446655440100',
        email: 'test@example.com',
        name: 'Test User',
        experience_level: 'beginner',
        preferred_units: 'LB',
        age: 25,
        weight: 150.0,
        height: 70.0,
        goals: ['Build Muscle', 'Get Stronger'],
        available_equipment: ['Dumbbells', 'Barbell', 'Bench'],
        injuries: [],
        preferences: { theme: 'light', notifications: true },
        settings: { autoSave: true, showTips: true }
      }
    ],
    beginner: [
      {
        id: '550e8400-e29b-41d4-a716-446655440101',
        email: 'beginner@example.com',
        name: 'Beginner User',
        experience_level: 'beginner',
        preferred_units: 'LB',
        age: 22,
        weight: 140.0,
        height: 68.0,
        goals: ['Lose Weight', 'Build Muscle'],
        available_equipment: ['Dumbbells', 'Resistance Bands'],
        injuries: [],
        preferences: { theme: 'dark', notifications: false },
        settings: { autoSave: false, showTips: true }
      }
    ],
    intermediate: [
      {
        id: '550e8400-e29b-41d4-a716-446655440102',
        email: 'intermediate@example.com',
        name: 'Intermediate User',
        experience_level: 'intermediate',
        preferred_units: 'KG',
        age: 28,
        weight: 75.0,
        height: 183.0,
        goals: ['Build Muscle', 'Improve Endurance'],
        available_equipment: ['Dumbbells', 'Barbell', 'Bench', 'Pull-up Bar'],
        injuries: ['Lower Back'],
        preferences: { theme: 'light', notifications: true },
        settings: { autoSave: true, showTips: false }
      }
    ],
    advanced: [
      {
        id: '550e8400-e29b-41d4-a716-446655440103',
        email: 'advanced@example.com',
        name: 'Advanced User',
        experience_level: 'advanced',
        preferred_units: 'LB',
        age: 32,
        weight: 180.0,
        height: 74.0,
        goals: ['Get Stronger', 'Build Muscle', 'Improve Performance'],
        available_equipment: ['Dumbbells', 'Barbell', 'Bench', 'Pull-up Bar', 'Squat Rack'],
        injuries: [],
        preferences: { theme: 'dark', notifications: true },
        settings: { autoSave: true, showTips: false }
      }
    ],
    comprehensive: [
      // Include all user types for comprehensive testing
      {
        id: '550e8400-e29b-41d4-a716-446655440104',
        email: 'powerlifter@example.com',
        name: 'Powerlifter Pro',
        experience_level: 'advanced',
        preferred_units: 'LB',
        age: 35,
        weight: 220.0,
        height: 76.0,
        goals: ['Get Stronger', 'Compete'],
        available_equipment: ['Dumbbells', 'Barbell', 'Bench', 'Squat Rack', 'Deadlift Platform'],
        injuries: ['Knee'],
        preferences: { theme: 'dark', notifications: true },
        settings: { autoSave: true, showTips: false },
        scenarioName: 'Powerlifter'
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440105',
        email: 'bodybuilder@example.com',
        name: 'Bodybuilder Betty',
        experience_level: 'advanced',
        preferred_units: 'LB',
        age: 29,
        weight: 135.0,
        height: 66.0,
        goals: ['Build Muscle', 'Cut Fat', 'Compete'],
        available_equipment: ['Dumbbells', 'Barbell', 'Bench', 'Cable Machine', 'Leg Press'],
        injuries: [],
        preferences: { theme: 'light', notifications: true },
        settings: { autoSave: true, showTips: false },
        scenarioName: 'Bodybuilder'
      }
    ]
  };

  // Determine which users to create based on scenario/scenarios
  let usersToCreate = [];
  if (scenarios && Array.isArray(scenarios)) {
    for (const s of scenarios) {
      if (userTemplates[s]) {
        usersToCreate.push(...userTemplates[s]);
      }
    }
  } else if (userTemplates[scenario]) {
    usersToCreate = userTemplates[scenario];
  } else {
    // Default to basic if scenario not found
    usersToCreate = userTemplates.basic;
  }

  // Add all basic users for comprehensive scenario
  if (scenario === 'comprehensive' || (scenarios && scenarios.includes('comprehensive'))) {
    usersToCreate.push(...userTemplates.basic, ...userTemplates.beginner,
      ...userTemplates.intermediate, ...userTemplates.advanced);
  }

  const createdUsers = [];

  for (const userData of usersToCreate) {
    try {
      const { data: user, error } = await supabase
        .from('users')
        .upsert(userData)
        .select()
        .single();

      if (error) {
        console.warn(`Warning: Could not create user ${userData.email}: ${error.message}`);
        continue;
      }

      createdUsers.push({
        ...user,
        password: 'testpass123',
        scenarioName: userData.scenarioName
      });

      if (verbose) {
        logProgress(`  ✅ Created user: ${user.name} (${user.email}) - ${userData.scenarioName}`, 'info');
      }
    } catch (error) {
      console.warn(`Warning: Error creating user ${userData.email}:`, error.message);
    }
  }

  return createdUsers;
}

/**
 * Create programs for each user
 */
async function seedUserPrograms(supabase, users, options = {}) {
  const { verbose = false } = options;

  if (verbose) {
    logProgress('Creating user programs...', 'info');
  }

  const programs = [];

  for (const user of users) {
    const userPrograms = await createProgramsForUser(supabase, user, { verbose });
    programs.push(...userPrograms);
  }

  return programs;
}

/**
 * Create programs for a specific user based on their experience level
 */
async function createProgramsForUser(supabase, user, options = {}) {
  const { verbose = false } = options;

  const programTemplates = getProgramTemplatesForUser(user);
  const createdPrograms = [];

  for (const template of programTemplates) {
    try {
      const { data: program, error } = await supabase
        .from('programs')
        .upsert(template)
        .select()
        .single();

      if (error) {
        console.warn(`Warning: Could not create program ${template.name}: ${error.message}`);
        continue;
      }

      createdPrograms.push(program);

      if (verbose) {
        logProgress(`    ✅ Created program: ${program.name}`, 'info');
      }
    } catch (error) {
      console.warn(`Warning: Error creating program ${template.name}:`, error.message);
    }
  }

  return createdPrograms;
}

/**
 * Get program templates based on user experience level
 */
function getProgramTemplatesForUser(user) {
  const baseProgram = {
    user_id: user.id,
    weight_unit: user.preferred_units,
    equipment: user.available_equipment,
    goals: user.goals,
    is_template: false,
    is_active: true,
    start_date: new Date().toISOString().split('T')[0],
    completed_weeks: 0
  };

  switch (user.experience_level) {
    case 'beginner':
      return [
        {
          ...baseProgram,
          id: `${user.id.slice(0, -3)}200`,
          name: 'Beginner Full Body',
          description: 'A simple full body routine for beginners',
          duration: 8,
          days_per_week: 3,
          difficulty: 'beginner',
          is_current: true
        }
      ];

    case 'intermediate':
      return [
        {
          ...baseProgram,
          id: `${user.id.slice(0, -3)}201`,
          name: 'Push Pull Legs',
          description: 'Intermediate push/pull/legs split',
          duration: 12,
          days_per_week: 6,
          difficulty: 'intermediate',
          is_current: true
        }
      ];

    case 'advanced':
      return [
        {
          ...baseProgram,
          id: `${user.id.slice(0, -3)}202`,
          name: 'Advanced Powerlifting',
          description: 'Advanced powerlifting program',
          duration: 16,
          days_per_week: 4,
          difficulty: 'advanced',
          is_current: true,
          completed_weeks: 2
        }
      ];

    default:
      return [
        {
          ...baseProgram,
          id: `${user.id.slice(0, -3)}203`,
          name: 'Basic Strength Program',
          description: 'A basic strength training program',
          duration: 8,
          days_per_week: 3,
          difficulty: 'beginner',
          is_current: true
        }
      ];
  }
}

/**
 * Create program workouts and exercises for each program
 */
async function seedProgramWorkouts(supabase, programs, options = {}) {
  const { verbose = false } = options;

  if (verbose) {
    logProgress('Creating program workouts...', 'info');
  }

  const allWorkouts = [];

  for (const program of programs) {
    const workouts = await createWorkoutsForProgram(supabase, program, { verbose });
    allWorkouts.push(...workouts);
  }

  return allWorkouts;
}

/**
 * Create workouts for a specific program based on its structure
 */
async function createWorkoutsForProgram(supabase, program, options = {}) {
  const { verbose = false } = options;

  const workoutTemplates = getWorkoutTemplatesForProgram(program);
  const createdWorkouts = [];

  for (const workoutTemplate of workoutTemplates) {
    try {
      // Create the workout
      const { data: workout, error: workoutError } = await supabase
        .from('program_workouts')
        .upsert(workoutTemplate.workout)
        .select()
        .single();

      if (workoutError) {
        console.warn(`Warning: Could not create workout ${workoutTemplate.workout.name}: ${workoutError.message}`);
        continue;
      }

      // Create exercises for this workout
      const exercises = [];
      for (const exerciseTemplate of workoutTemplate.exercises) {
        const exerciseData = {
          ...exerciseTemplate,
          workout_id: workout.id
        };

        const { data: exercise, error: exerciseError } = await supabase
          .from('program_exercises')
          .upsert(exerciseData)
          .select()
          .single();

        if (exerciseError) {
          console.warn(`Warning: Could not create exercise: ${exerciseError.message}`);
          continue;
        }

        exercises.push(exercise);
      }

      createdWorkouts.push({ ...workout, exercises });

      if (verbose) {
        logProgress(`    ✅ Created workout: ${workout.name} (${exercises.length} exercises)`, 'info');
      }
    } catch (error) {
      console.warn(`Warning: Error creating workout:`, error.message);
    }
  }

  return createdWorkouts;
}

/**
 * Get workout templates for a program based on its type and user level
 */
function getWorkoutTemplatesForProgram(program) {
  const baseId = program.id.slice(0, -3);

  switch (program.difficulty) {
    case 'beginner':
      return [
        {
          workout: {
            id: `${baseId}300`,
            program_id: program.id,
            week_number: 1,
            day_number: 1,
            name: 'Full Body A'
          },
          exercises: [
            {
              id: `${baseId}400`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440009', // Squat
              sets: 3,
              reps: 12,
              rest_minutes: 2,
              notes: 'Focus on form',
              order_index: 1
            },
            {
              id: `${baseId}401`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440001', // Bench Press
              sets: 3,
              reps: 10,
              rest_minutes: 2,
              notes: 'Control the weight',
              order_index: 2
            },
            {
              id: `${baseId}402`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440006', // Bent-over Row
              sets: 3,
              reps: 10,
              rest_minutes: 2,
              notes: 'Squeeze shoulder blades',
              order_index: 3
            }
          ]
        },
        {
          workout: {
            id: `${baseId}301`,
            program_id: program.id,
            week_number: 1,
            day_number: 2,
            name: 'Full Body B'
          },
          exercises: [
            {
              id: `${baseId}403`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440008', // Deadlift
              sets: 3,
              reps: 8,
              rest_minutes: 3,
              notes: 'Keep back straight',
              order_index: 1
            },
            {
              id: `${baseId}404`,
              exercise_id: '550e8400-e29b-41d4-a716-44665544000d', // Overhead Press
              sets: 3,
              reps: 10,
              rest_minutes: 2,
              notes: 'Press straight up',
              order_index: 2
            },
            {
              id: `${baseId}405`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440005', // Pull-ups
              sets: 3,
              reps: 8,
              rest_minutes: 2,
              notes: 'Full range of motion',
              order_index: 3
            }
          ]
        }
      ];

    case 'intermediate':
      return [
        {
          workout: {
            id: `${baseId}302`,
            program_id: program.id,
            week_number: 1,
            day_number: 1,
            name: 'Push Day'
          },
          exercises: [
            {
              id: `${baseId}406`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440001', // Bench Press
              sets: 4,
              reps: 8,
              rest_minutes: 3,
              notes: 'Heavy compound movement',
              order_index: 1
            },
            {
              id: `${baseId}407`,
              exercise_id: '550e8400-e29b-41d4-a716-44665544000d', // Overhead Press
              sets: 3,
              reps: 10,
              rest_minutes: 2,
              notes: 'Strict form',
              order_index: 2
            },
            {
              id: `${baseId}408`,
              exercise_id: '550e8400-e29b-41d4-a716-44665544000e', // Lateral Raises
              sets: 3,
              reps: 12,
              rest_minutes: 1,
              notes: 'Control the weight',
              order_index: 3
            }
          ]
        },
        {
          workout: {
            id: `${baseId}303`,
            program_id: program.id,
            week_number: 1,
            day_number: 2,
            name: 'Pull Day'
          },
          exercises: [
            {
              id: `${baseId}409`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440008', // Deadlift
              sets: 4,
              reps: 6,
              rest_minutes: 3,
              notes: 'Focus on hip hinge',
              order_index: 1
            },
            {
              id: `${baseId}40a`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440005', // Pull-ups
              sets: 4,
              reps: 8,
              rest_minutes: 2,
              notes: 'Add weight if needed',
              order_index: 2
            },
            {
              id: `${baseId}40b`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440011', // Bicep Curls
              sets: 3,
              reps: 12,
              rest_minutes: 1,
              notes: 'Slow and controlled',
              order_index: 3
            }
          ]
        }
      ];

    case 'advanced':
      return [
        {
          workout: {
            id: `${baseId}304`,
            program_id: program.id,
            week_number: 1,
            day_number: 1,
            name: 'Heavy Squat Day'
          },
          exercises: [
            {
              id: `${baseId}40c`,
              exercise_id: '550e8400-e29b-41d4-a716-446655440009', // Squat
              sets: 5,
              reps: 5,
              rest_minutes: 4,
              notes: 'Work up to heavy 5RM',
              order_index: 1
            },
            {
              id: `${baseId}40d`,
              exercise_id: '550e8400-e29b-41d4-a716-44665544000b', // Lunges
              sets: 3,
              reps: 10,
              rest_minutes: 2,
              notes: 'Each leg',
              order_index: 2
            },
            {
              id: `${baseId}40e`,
              exercise_id: '550e8400-e29b-41d4-a716-44665544000c', // Leg Curl
              sets: 3,
              reps: 12,
              rest_minutes: 2,
              notes: 'Hamstring focus',
              order_index: 3
            }
          ]
        }
      ];

    default:
      return [];
  }
}

/**
 * Seed coach-client relationships and invitations
 */
async function seedRelationshipsAndInvitations(supabase, users, options = {}) {
  const { verbose = false } = options;

  if (verbose) {
    logProgress('Creating coach-client relationships and invitations...', 'info');
  }

  const relationshipsToInsert = [];
  const invitationsToInsert = [];

  const coaches = users.filter(u => u.scenarioName === 'Advanced User'); // Assuming advanced user is the coach

  for (const coach of coaches) {
    const clients = users.filter(u => u.scenarioName !== 'Advanced User');

    for (let i = 0; i < clients.length; i++) {
      const client = clients[i];

      // Create an active relationship for the first client
      if (i === 0) {
        relationshipsToInsert.push({
          coach_id: coach.id,
          client_id: client.id,
          status: 'active',
          accepted_at: new Date().toISOString(),
          invitation_method: 'email',
          client_goals: client.goals
        });
        if (verbose) {
          logProgress(`  ✅ Creating active relationship: ${coach.name} -> ${client.name}`, 'info');
        }
      }
      // Create a pending invitation for the second client
      else if (i === 1) {
        invitationsToInsert.push({
          coach_id: coach.id,
          coach_email: coach.email,
          coach_name: coach.name,
          target_email: client.email,
          status: 'pending',
          invitation_code: `test-code-${client.id.substring(0, 8)}`,
          message: `Hi ${client.name}, I'd like to invite you to be my client!`
        });
        if (verbose) {
          logProgress(`  ✅ Creating pending invitation: ${coach.name} -> ${client.name}`, 'info');
        }
      }
    }
  }

  // Insert relationships
  if (relationshipsToInsert.length > 0) {
    const { error: relError } = await supabase.from('coach_client_relationships').upsert(relationshipsToInsert);
    if (relError) {
      console.warn(`Warning: Could not create relationships: ${relError.message}`);
    } else if (verbose) {
      logProgress(`    Successfully created ${relationshipsToInsert.length} relationships`, 'success');
    }
  }

  // Insert invitations
  if (invitationsToInsert.length > 0) {
    const { error: invError } = await supabase.from('client_invitations').upsert(invitationsToInsert);
    if (invError) {
      console.warn(`Warning: Could not create invitations: ${invError.message}`);
    } else if (verbose) {
      logProgress(`    Successfully created ${invitationsToInsert.length} invitations`, 'success');
    }
  }
}

/**
 * Seed historical workout data with progressive overload
 */
async function seedHistoricalWorkouts(supabase, users, programs, options = {}) {
  const { verbose = false, generateProgressiveData = true } = options;

  if (verbose) {
    logProgress('Creating historical workout data...', 'info');
  }

  const allWorkoutLogs = [];

  for (const user of users) {
    const userPrograms = programs.filter(p => p.user_id === user.id);

    for (const program of userPrograms) {
      const workoutLogs = await createProgressiveWorkoutLogs(supabase, user, program, {
        verbose,
        generateProgressiveData
      });
      allWorkoutLogs.push(...workoutLogs);
    }
  }

  return allWorkoutLogs;
}

/**
 * Create progressive workout logs with realistic progression
 */
async function createProgressiveWorkoutLogs(supabase, user, program, options = {}) {
  const { verbose = false, generateProgressiveData = true } = options;

  const workoutLogs = [];
  const weeksToGenerate = Math.min(program.completed_weeks + 1, 4); // Generate up to 4 weeks
  const baseId = user.id.slice(0, -3);

  // Get program workouts to base logs on
  const { data: programWorkouts, error: workoutsError } = await supabase
    .from('program_workouts')
    .select(`
      *,
      program_exercises (
        *,
        exercises (*)
      )
    `)
    .eq('program_id', program.id)
    .order('week_number')
    .order('day_number');

  if (workoutsError || !programWorkouts) {
    console.warn(`Warning: Could not fetch program workouts: ${workoutsError?.message}`);
    return workoutLogs;
  }

  let logCounter = 500;

  for (let week = 1; week <= weeksToGenerate; week++) {
    const weekWorkouts = programWorkouts.filter(w => w.week_number === week);

    for (const programWorkout of weekWorkouts) {
      const daysAgo = (weeksToGenerate - week) * 7 + (3 - programWorkout.day_number);
      const workoutDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

      const workoutLogData = {
        id: `${baseId}${logCounter.toString(16)}`,
        user_id: user.id,
        program_id: program.id,
        week_index: week,
        day_index: programWorkout.day_number,
        name: programWorkout.name,
        type: 'program_workout',
        date: workoutDate.toISOString().split('T')[0],
        completed_date: workoutDate.toISOString(),
        is_finished: true,
        is_draft: false,
        weight_unit: user.preferred_units,
        duration: 45 + Math.floor(Math.random() * 30), // 45-75 minutes
        notes: generateWorkoutNotes(week, programWorkout.name)
      };

      try {
        const { data: workoutLog, error: logError } = await supabase
          .from('workout_logs')
          .upsert(workoutLogData)
          .select()
          .single();

        if (logError) {
          console.warn(`Warning: Could not create workout log: ${logError.message}`);
          continue;
        }

        // Create workout log exercises with progression
        const logExercises = await createWorkoutLogExercises(
          supabase,
          workoutLog,
          programWorkout.program_exercises || [],
          week,
          user,
          { generateProgressiveData }
        );

        workoutLogs.push({ ...workoutLog, exercises: logExercises });

        if (verbose) {
          logProgress(`      ✅ Created workout log: ${workoutLog.name} (Week ${week}, ${logExercises.length} exercises)`, 'info');
        }

        logCounter++;
      } catch (error) {
        console.warn(`Warning: Error creating workout log:`, error.message);
      }
    }
  }

  return workoutLogs;
}

/**
 * Create workout log exercises with progressive weights
 */
async function createWorkoutLogExercises(supabase, workoutLog, programExercises, week, user, options = {}) {
  const { generateProgressiveData = true } = options;
  const logExercises = [];
  const baseId = workoutLog.id.slice(0, -3);

  let exerciseCounter = 600;

  for (const programExercise of programExercises) {
    const baseWeight = getBaseWeightForExercise(programExercise.exercises.name, user);
    const progressiveWeight = generateProgressiveData ?
      baseWeight + (week - 1) * getProgressionIncrement(programExercise.exercises.name, user) :
      baseWeight;

    const sets = programExercise.sets;
    const targetReps = programExercise.reps || 10;

    // Generate realistic rep and weight arrays
    const reps = [];
    const weights = [];
    const completed = [];

    for (let set = 0; set < sets; set++) {
      // Simulate fatigue - later sets might have fewer reps
      const actualReps = set === 0 ? targetReps :
        set === 1 ? targetReps :
          Math.max(targetReps - Math.floor(Math.random() * 3), targetReps - 2);

      reps.push(actualReps);
      weights.push(progressiveWeight);
      completed.push(true);
    }

    const exerciseLogData = {
      id: `${baseId}${exerciseCounter.toString(16)}`,
      workout_log_id: workoutLog.id,
      exercise_id: programExercise.exercise_id,
      sets: sets,
      reps: reps,
      weights: weights,
      completed: completed,
      bodyweight: programExercise.exercises.exercise_type === 'Bodyweight' ? user.weight : null,
      notes: generateExerciseNotes(programExercise.exercises.name, week),
      is_added: false,
      added_type: null,
      original_index: programExercise.order_index,
      order_index: programExercise.order_index
    };

    try {
      const { data: logExercise, error } = await supabase
        .from('workout_log_exercises')
        .upsert(exerciseLogData)
        .select()
        .single();

      if (error) {
        console.warn(`Warning: Could not create workout log exercise: ${error.message}`);
        continue;
      }

      logExercises.push(logExercise);
      exerciseCounter++;
    } catch (error) {
      console.warn(`Warning: Error creating workout log exercise:`, error.message);
    }
  }

  return logExercises;
}

/**
 * Get base weight for an exercise based on user experience
 */
function getBaseWeightForExercise(exerciseName, user) {
  const experienceMultipliers = {
    beginner: 0.6,
    intermediate: 0.8,
    advanced: 1.0
  };

  const baseWeights = {
    'Bench Press': user.preferred_units === 'LB' ? 135 : 60,
    'Squat': user.preferred_units === 'LB' ? 155 : 70,
    'Deadlift': user.preferred_units === 'LB' ? 185 : 85,
    'Overhead Press': user.preferred_units === 'LB' ? 95 : 45,
    'Bent-over Row': user.preferred_units === 'LB' ? 115 : 50,
    'Pull-ups': 0, // Bodyweight
    'Push-ups': 0, // Bodyweight
    'Bicep Curls': user.preferred_units === 'LB' ? 25 : 12,
    'Lateral Raises': user.preferred_units === 'LB' ? 15 : 7
  };

  const baseWeight = baseWeights[exerciseName] || (user.preferred_units === 'LB' ? 45 : 20);
  const multiplier = experienceMultipliers[user.experience_level] || 0.8;

  return Math.round(baseWeight * multiplier);
}

/**
 * Get progression increment for an exercise
 */
function getProgressionIncrement(exerciseName, user) {
  const increment = user.preferred_units === 'LB' ? 5 : 2.5;

  // Smaller increments for isolation exercises
  const smallIncrementExercises = ['Bicep Curls', 'Lateral Raises', 'Tricep Extensions'];
  if (smallIncrementExercises.includes(exerciseName)) {
    return user.preferred_units === 'LB' ? 2.5 : 1.25;
  }

  return increment;
}

/**
 * Generate realistic workout notes
 */
function generateWorkoutNotes(week, workoutName) {
  const notes = [
    'Good workout session',
    'Felt strong today',
    'Challenging but manageable',
    'Great pump',
    'Focused on form',
    'Personal record on main lift',
    'Felt tired but pushed through',
    'Excellent mind-muscle connection'
  ];

  if (week === 1) {
    return 'First week - focusing on form and getting used to the routine';
  }

  return notes[Math.floor(Math.random() * notes.length)];
}

/**
 * Generate exercise-specific notes
 */
function generateExerciseNotes(exerciseName, week) {
  const exerciseNotes = {
    'Bench Press': ['Good form', 'Felt strong', 'Controlled descent', 'Full range of motion'],
    'Squat': ['Deep squats', 'Good depth', 'Felt powerful', 'Knees tracking well'],
    'Deadlift': ['Perfect form', 'Strong pull', 'Good hip hinge', 'Felt explosive'],
    'Pull-ups': ['Full range', 'Good control', 'Strong pull', 'Felt the lats working']
  };

  const notes = exerciseNotes[exerciseName] || ['Good set', 'Felt good', 'Solid reps'];
  return notes[Math.floor(Math.random() * notes.length)];
}

/**
 * Generate user analytics based on workout history
 */
async function generateUserAnalytics(supabase, users, workoutLogs, options = {}) {
  const { verbose = false } = options;

  if (verbose) {
    logProgress('Generating user analytics...', 'info');
  }

  for (const user of users) {
    if (verbose) {
      logProgress(`  Generating analytics for ${user.name}...`, 'info');
    }

    // Get all workout log exercises for this user
    const userWorkoutLogs = workoutLogs.filter(log => log.user_id === user.id);
    const exerciseStats = new Map();

    // Calculate stats from workout logs
    for (const workoutLog of userWorkoutLogs) {
      if (workoutLog.exercises) {
        for (const exercise of workoutLog.exercises) {
          const exerciseId = exercise.exercise_id;

          if (!exerciseStats.has(exerciseId)) {
            exerciseStats.set(exerciseId, {
              totalVolume: 0,
              maxWeight: 0,
              totalReps: 0,
              totalSets: 0,
              lastWorkoutDate: null,
              prDate: null
            });
          }

          const stats = exerciseStats.get(exerciseId);

          // Calculate volume (weight * reps for each set)
          for (let i = 0; i < exercise.sets; i++) {
            const weight = exercise.weights[i] || 0;
            const reps = exercise.reps[i] || 0;
            stats.totalVolume += weight * reps;
            stats.totalReps += reps;

            // Track max weight
            if (weight > stats.maxWeight) {
              stats.maxWeight = weight;
              stats.prDate = workoutLog.date;
            }
          }

          stats.totalSets += exercise.sets;
          stats.lastWorkoutDate = workoutLog.date;
        }
      }
    }

    // Create analytics records
    const analyticsData = [];
    let analyticsCounter = 700;
    const baseId = user.id.slice(0, -3);

    for (const [exerciseId, stats] of exerciseStats) {
      analyticsData.push({
        id: `${baseId}${analyticsCounter.toString(16)}`,
        user_id: user.id,
        exercise_id: exerciseId,
        total_volume: stats.totalVolume,
        max_weight: stats.maxWeight,
        total_reps: stats.totalReps,
        total_sets: stats.totalSets,
        last_workout_date: stats.lastWorkoutDate,
        pr_date: stats.prDate
      });
      analyticsCounter++;
    }

    // Insert analytics data
    if (analyticsData.length > 0) {
      try {
        const { error } = await supabase
          .from('user_analytics')
          .upsert(analyticsData);

        if (error) {
          console.warn(`Warning: Could not create analytics for ${user.name}: ${error.message}`);
        } else if (verbose) {
          logProgress(`    ✅ Created ${analyticsData.length} analytics records`, 'info');
        }
      } catch (error) {
        console.warn(`Warning: Error creating analytics for ${user.name}:`, error.message);
      }
    }
  }
}

// Export for use in other modules
module.exports = {
  seedDatabase
};

// Allow running directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const includeHistoricalData = !args.includes('--no-history');

  seedDatabase({ verbose, includeHistoricalData })
    .then(result => {
      if (result.success) {
        console.log('✅ Database seeding completed successfully');
      } else {
        console.error('❌ Database seeding failed:', result.error);
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Database seeding failed:', error.message);
      process.exit(1);
    });
}