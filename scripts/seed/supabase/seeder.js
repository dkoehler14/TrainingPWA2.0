const { createClient } = require('@supabase/supabase-js');
const { getSampleProgramData } = require('./sampleWorkoutData');

function getSupabaseClient() {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'http://127.0.0.1:54321';
  // Use service role key for seeding to bypass RLS policies
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function createTestUser(supabase, userConfig, verbose = false) {
  const { email, password, profile, role } = userConfig;

  try {
    // Check if user already exists and clean up if needed
    const { data: existingUsers } = await supabase
      .from('users')
      .select('id')
      .eq('email', email);

    if (existingUsers && existingUsers.length > 0) {
      if (verbose) {
        console.log(`  Cleaning up existing user: ${email}`);
      }

      // Delete existing auth users
      for (const existingUser of existingUsers) {
        try {
          await supabase.auth.admin.deleteUser(existingUser.id);
        } catch (authError) {
          // Continue even if auth deletion fails
          if (verbose) {
            console.log(`    Warning: Could not delete auth user: ${authError.message}`);
          }
        }
      }

      // Delete existing database records
      await supabase.from('users').delete().eq('email', email);

      // Wait a moment for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // First, create the auth user with email and password
    const authUserData = {
      email,
      password,
      email_confirm: true // Auto-confirm for local development
    };

    if (verbose) {
      console.log(`  Creating auth user: ${email}`);
    }

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser(authUserData);

    if (authError) {
      throw new Error(`Failed to create auth user ${email}: ${authError.message}`);
    }

    if (verbose) {
      console.log(`    Auth user created with ID: ${authUser.user.id}`);
    }

    // Now create the user profile in the database
    const userProfile = {
      id: authUser.user.id, // Use the auth user's ID directly as primary key
      email,
      roles: role,
      ...profile
    };

    // Check if a profile with this id already exists
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('id', authUser.user.id);

    if (existingProfile && existingProfile.length > 0) {
      if (verbose) {
        console.log(`    Warning: Profile with id ${authUser.user.id} already exists, deleting...`);
      }
      await supabase.from('users').delete().eq('id', authUser.user.id);
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .insert(userProfile) // Use insert instead of upsert to catch duplicates
      .select()
      .single();

    if (userError) {
      throw new Error(`Failed to create user profile ${email}: ${userError.message}`);
    }

    if (verbose) {
      console.log(`    ✅ Created user: ${email} (password: ${password})`);
    }

    return { ...user, password };
  } catch (error) {
    console.error(`Error creating user ${email}:`, error.message);
    throw error;
  }
}

async function seedCoachClientData(supabase, users, verbose = false) {
  if (verbose) {
    console.log('  Creating coach-client relationships and invitations...');
  }

  const coach = users.find(u => u.email === 'coach@example.com');
  const beginner = users.find(u => u.email === 'beginner@example.com');
  const intermediate = users.find(u => u.email === 'intermediate@example.com');

  if (!coach || !beginner || !intermediate) {
    console.warn('Warning: Could not find coach or client users to create relationships.');
    return { relationships: 0, invitations: 0 };
  }

  const relationshipsToInsert = [];
  const invitationsToInsert = [];

  // Create an active relationship for the beginner user
  relationshipsToInsert.push({
    coach_id: coach.id,
    client_id: beginner.id,
    status: 'active',
    accepted_at: new Date().toISOString(),
    invitation_method: 'email',
    client_goals: beginner.goals
  });

  // Create a pending invitation for the intermediate user
  invitationsToInsert.push({
    coach_id: coach.id,
    coach_email: coach.email,
    coach_name: coach.name,
    target_email: intermediate.email,
    status: 'pending',
    invitation_code: `test-code-${intermediate.id.substring(0, 8)}`,
    message: `Hi ${intermediate.name}, I'd like to invite you to be my client!`
  });

  // Insert relationships
  if (relationshipsToInsert.length > 0) {
    const { error: relError } = await supabase.from('coach_client_relationships').upsert(relationshipsToInsert);
    if (relError) {
      console.warn(`Warning: Could not create relationships: ${relError.message}`);
    } else if (verbose) {
      console.log(`    ✅ Created ${relationshipsToInsert.length} coach-client relationships`);
    }
  }

  // Insert invitations
  if (invitationsToInsert.length > 0) {
    const { error: invError } = await supabase.from('client_invitations').upsert(invitationsToInsert);
    if (invError) {
      console.warn(`Warning: Could not create invitations: ${invError.message}`);
    } else if (verbose) {
      console.log(`    ✅ Created ${invitationsToInsert.length} client invitations`);
    }
  }
}

/**
 * Parses a rep value which can be a number or a string like '8-10' or '12+'.
 * @param {string|number} repValue - The rep value to parse.
 * @returns {number} A specific integer rep count.
 */
function parseReps(repValue) {
  if (typeof repValue === 'number') {
    return repValue;
  }
  if (typeof repValue !== 'string') {
    return 8; // Default fallback for unexpected types
  }

  // Handle '12+' format
  if (repValue.includes('+')) {
    return parseInt(repValue.replace('+', ''), 10) || 12;
  }

  // Handle '8-10' format
  if (repValue.includes('-')) {
    const [min, max] = repValue.split('-').map(n => parseInt(n.trim(), 10));
    if (!isNaN(min) && !isNaN(max)) {
      // Return a random number in the range
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
  }

  // Handle simple number string '8' or fallback
  return parseInt(repValue, 10) || 8;
}

/**
 * Seeds historical workout data for each user based on their program.
 * Simulates progressive overload for realism.
 */
async function seedHistoricalWorkouts(supabase, users, programs, exercises, options = {}) {
  const { verbose = false, weeksBack = 8 } = options;
  if (verbose) {
    console.log(`  Generating historical workout data for the past ${weeksBack} weeks...`);
  }

  const allWorkoutLogs = [];
  const allWorkoutLogExercises = [];

  for (const user of users) {
    const userProgram = programs.find(p => p.program.user_id === user.id);
    if (!userProgram) continue;
 
    const sampleData = getSampleProgramData(user.experience_level);
    const programDuration = sampleData.program.duration || 4; // Default to 4 weeks if not specified
    const progression = {}; // Track weight progression for each exercise
 
    for (let week = 0; week < weeksBack; week++) {
      const historicalWeekIndex = week + 1;
      // Cycle through the program's weeks to get the right template
      const templateWeekNumber = (week % programDuration) + 1;
      const workoutsForThisWeek = sampleData.workouts.filter(w => w.week_number === templateWeekNumber);
 
      const daysAgo = (weeksBack - week - 1) * 7;

      for (const workoutTemplate of workoutsForThisWeek) {
        // Skip some workouts to make history more realistic
        if (Math.random() > 0.9) continue;

        const workoutDate = new Date();
        workoutDate.setDate(workoutDate.getDate() - daysAgo - (7 - workoutTemplate.day_number));

        // Use a temporary ID to link exercises to logs before insertion
        const tempLogId = `temp-log-${user.id}-${historicalWeekIndex}-${workoutTemplate.day_number}`;

        const workoutLog = {
          user_id: user.id,
          program_id: userProgram.program.id,
          week_index: historicalWeekIndex, // Use the historical week, not template week
          day_index: workoutTemplate.day_number,
          name: workoutTemplate.name,
          type: 'program_workout',
          date: workoutDate.toISOString().split('T')[0],
          completed_date: workoutDate.toISOString(),
          is_finished: true,
          is_draft: false,
          weight_unit: user.preferred_units || 'LB',
          duration: 45 + Math.floor(Math.random() * 30) // 45-75 mins
        };
        allWorkoutLogs.push({ ...workoutLog, temp_id: tempLogId }); // Add temp_id for mapping

        for (const [index, exerciseTemplate] of workoutTemplate.exercises.entries()) {
          const exerciseId = exerciseTemplate.exercise_id;

          // Initialize or get current weight for the exercise
          if (!progression[exerciseId]) {
            progression[exerciseId] = 135; // Default starting weight
          }

          const currentWeight = progression[exerciseId] - (weeksBack - week - 1) * 5; // Decrease weight for past workouts

          const sets = exerciseTemplate.sets;
          const reps = [];
          const weights = [];
          const completed = [];

          for (let i = 0; i < sets; i++) {
            reps.push(parseReps(exerciseTemplate.reps));
            weights.push(currentWeight);
            completed.push(true);
          }

          allWorkoutLogExercises.push({
            workout_log_id: tempLogId, // Link using temporary ID
            exercise_id: exerciseId,
            sets: sets,
            reps: reps,
            weights: weights,
            completed: completed,
            order_index: index
          });
        }
      }
    }
  }

  // Insert workout logs
  const { data: insertedLogs, error: logsError } = await supabase
    .from('workout_logs')
    .insert(allWorkoutLogs.map(({ temp_id, ...log }) => log)) // Remove temp_id before insert
    .select('id, user_id, program_id, week_index, day_index');

  if (logsError) throw new Error(`Failed to insert workout logs: ${logsError.message}`);

  // Create a map from the unique key to the new database ID
  const logIdMap = new Map();
  insertedLogs.forEach(log => {
    const key = `${log.user_id}-${log.program_id}-${log.week_index}-${log.day_index}`;
    logIdMap.set(key, log.id);
  });

  // Map workout log IDs to exercises
  const exercisesWithLogIds = allWorkoutLogExercises.map(ex => {
    // Recreate the unique key from the original log data to find the new ID
    const originalLog = allWorkoutLogs.find(l => l.temp_id === ex.workout_log_id);
    if (!originalLog) return null;
    const key = `${originalLog.user_id}-${originalLog.program_id}-${originalLog.week_index}-${originalLog.day_index}`;
    const realLogId = logIdMap.get(key);
    if (!realLogId) return null;
    const { workout_log_id, ...restOfEx } = ex;
    return { ...restOfEx, workout_log_id: realLogId };
  }).filter(ex => ex);

  // Insert workout log exercises
  const { error: exercisesError } = await supabase
    .from('workout_log_exercises')
    .insert(exercisesWithLogIds);

  if (exercisesError) throw new Error(`Failed to insert workout log exercises: ${exercisesError.message}`);

  if (verbose) console.log(`    ✅ Created ${insertedLogs.length} workout logs and ${exercisesWithLogIds.length} log exercises.`);
}

async function seedSupabaseAll(options = {}) {
  const { scenarios = 'basic', verbose = false, includeHistoricalData = true } = options;
  const startTime = Date.now();
  const supabase = getSupabaseClient();

  try {
    if (verbose) {
      console.log('🌱 Starting Supabase database seeding...');
    }

    // First, seed global exercises that all users can access
    if (verbose) {
      console.log('  Creating global exercises...');
    }

    const globalExercises = [
      // Chest exercises
      { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Barbell Bench Press', primary_muscle_group: 'Chest', exercise_type: 'Barbell', instructions: 'Lie on bench, lower bar to chest, press up', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Push-ups', primary_muscle_group: 'Chest', exercise_type: 'Bodyweight Loadable', instructions: 'Start in plank position, lower chest to ground, push up', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440003', name: 'Incline Dumbbell Press', primary_muscle_group: 'Chest', exercise_type: 'Dumbbell', instructions: 'On incline bench, press dumbbells up and together', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440004', name: 'Dumbbell Flyes', primary_muscle_group: 'Chest', exercise_type: 'Isolation', instructions: 'Lie on bench, arc dumbbells out and back together', is_global: true },

      // Back exercises
      { id: '550e8400-e29b-41d4-a716-446655440005', name: 'Pull-ups', primary_muscle_group: 'Back', exercise_type: 'Bodyweight Loadable', instructions: 'Hang from bar, pull body up until chin over bar', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440006', name: 'Bent-over Row', primary_muscle_group: 'Back', exercise_type: 'Barberll', instructions: 'Bend at hips, pull weight to lower chest', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440007', name: 'Lat Pulldown', primary_muscle_group: 'Back', exercise_type: 'Cable', instructions: 'Pull bar down to upper chest, squeeze shoulder blades', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440008', name: 'Trap Bar Deadlift', primary_muscle_group: 'Back', exercise_type: 'Trap Bar', instructions: 'Lift weight from ground by extending hips and knees', is_global: true },

      // Legs exercises
      { id: '550e8400-e29b-41d4-a716-446655440009', name: 'SSB Squat', primary_muscle_group: 'Quads', exercise_type: 'Safety Squat Bar', instructions: 'Lower body by bending knees and hips, return to standing', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000a', name: 'Leg Press', primary_muscle_group: 'Quads', exercise_type: 'Machine', instructions: 'Push weight away using legs while seated', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000b', name: 'DB Lunges', primary_muscle_group: 'Quads', exercise_type: 'Dumbbell', instructions: 'Step forward, lower back knee toward ground', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000c', name: '2 Leg Seated Leg Curl', primary_muscle_group: 'Hamstrings', exercise_type: 'Machine', instructions: 'Curl heels toward glutes against resistance', is_global: true },

      // Shoulders exercises
      { id: '550e8400-e29b-41d4-a716-44665544000d', name: 'Overhead Press', primary_muscle_group: 'Shoulders', exercise_type: 'Barbell', instructions: 'Press weight overhead from shoulder level', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000e', name: 'Lateral Raises', primary_muscle_group: 'Shoulders', exercise_type: 'Dumbbell', instructions: 'Raise arms out to sides to shoulder height', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000f', name: 'Front Raises', primary_muscle_group: 'Shoulders', exercise_type: 'Dumbbell', instructions: 'Raise arms forward to shoulder height', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440010', name: 'Cable Rear Delt Flyes', primary_muscle_group: 'Shoulders', exercise_type: 'Cable', instructions: 'Bend forward, raise arms out to sides', is_global: true },

      // Arms exercises
      { id: '550e8400-e29b-41d4-a716-446655440011', name: 'Cable Bicep Curls', primary_muscle_group: 'Biceps', exercise_type: 'Cable', instructions: 'Curl weight up by flexing biceps', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440012', name: 'Tricep Dips', primary_muscle_group: 'Triceps', exercise_type: 'Bodyweight Loadable', instructions: 'Lower body by bending arms, push back up', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440013', name: 'Hammer Curls', primary_muscle_group: 'Biceps', exercise_type: 'Dumbbell', instructions: 'Curl with neutral grip, thumbs up', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440014', name: 'Tricep Extensions', primary_muscle_group: 'Triceps', exercise_type: 'Dumbbell', instructions: 'Extend arms overhead, lower weight behind head', is_global: true },

      // Core exercises
      { id: '550e8400-e29b-41d4-a716-446655440015', name: 'Plank', primary_muscle_group: 'Abs', exercise_type: 'Bodyweight', instructions: 'Hold body straight in push-up position', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440016', name: 'Crunches', primary_muscle_group: 'Abs', exercise_type: 'Bodyweight', instructions: 'Lift shoulders off ground by contracting abs', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440017', name: 'Russian Twists', primary_muscle_group: 'Abs', exercise_type: 'Medicine Ball', instructions: 'Rotate torso side to side while seated', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440018', name: 'Mountain Climbers', primary_muscle_group: 'Abs', exercise_type: 'Bodyweight', instructions: 'Alternate bringing knees to chest in plank position', is_global: true }
    ];

    // Insert global exercises
    const { data: exercises, error: exerciseError } = await supabase
      .from('exercises')
      .upsert(globalExercises)
      .select();

    if (exerciseError) {
      console.error('DEBUG: Exercise creation error:', exerciseError);
      throw new Error(`Failed to create exercises: ${exerciseError.message}`);
    }

    if (verbose) {
      console.log(`    ✅ Created ${exercises.length} global exercises`);
    }

    // Define test users with different scenarios
    // Add timestamp to make emails unique and avoid conflicts
    const timestamp = Date.now();
    const testUsers = [
      {
        email: `test-${timestamp}@example.com`,
        password: 'testpass123',
        role: ['user'],
        profile: {
          name: 'Test User',
          experience_level: 'beginner',
          preferred_units: 'LB',
          age: 25,
          weight_lbs: 150.0,
          height_feet: 5,
          height_inches: 10,
          goals: ['Build Muscle', 'Get Stronger'],
          available_equipment: ['Dumbbells', 'Barbell', 'Bench'],
          injuries: [],
          preferences: {},
          settings: {}
        }
      },
      {
        email: 'beginner@example.com',
        password: 'beginner123',
        role: ['user'],
        profile: {
          name: 'Beginner User',
          experience_level: 'beginner',
          preferred_units: 'LB',
          age: 22,
          weight_lbs: 140.0,
          height_feet: 5,
          height_inches: 8,
          goals: ['Build Muscle', 'Lose Weight'],
          available_equipment: ['Dumbbells', 'Resistance Bands'],
          injuries: [],
          preferences: {},
          settings: {}
        }
      },
      {
        email: 'intermediate@example.com',
        password: 'intermediate123',
        role: ['user'],
        profile: {
          name: 'Intermediate User',
          experience_level: 'intermediate',
          preferred_units: 'LB',
          age: 28,
          weight_lbs: 170.0,
          height_feet: 6,
          height_inches: 0,
          goals: ['Get Stronger', 'Build Muscle'],
          available_equipment: ['Dumbbells', 'Barbell', 'Bench', 'Pull-up Bar'],
          injuries: [],
          preferences: {},
          settings: {}
        }
      },
      {
        email: 'coach@example.com',
        password: 'coach123',
        role: ['coach', 'user'],
        profile: {
          name: 'Coach User',
          experience_level: 'advanced',
          preferred_units: 'LB',
          age: 35,
          weight_lbs: 190.0,
          height_feet: 6,
          height_inches: 1,
          goals: ['Coaching', 'Strength Maintenance'],
          available_equipment: ['Full Gym Access'],
          injuries: [],
          preferences: {},
          settings: {}
        }
      },
      {
        email: 'admin@example.com',
        password: 'admin123',
        role: ['admin', 'coach'],
        profile: {
          name: 'Admin User',
          experience_level: 'intermediate',
          preferred_units: 'LB',
          age: 29,
          weight_lbs: 200.0,
          height_feet: 6,
          height_inches: 3,
          goals: ['Get Stronger', 'Build Muscle'],
          available_equipment: ['Dumbbells', 'Barbell', 'Bench', 'Pull-up Bar'],
          injuries: [],
          preferences: {},
          settings: {}
        }
      }
    ];

    console.log('DEBUG: Creating test users...');

    const createdUsers = [];

    // Create each test user
    for (const userConfig of testUsers) {
      try {
        const user = await createTestUser(supabase, userConfig, verbose);
        createdUsers.push(user);

        // If the user is a coach, create a coach_profile
        if (userConfig.role && userConfig.role.includes('coach')) {
          const coachProfileData = {
            user_id: user.id,
            is_active: true,
            specializations: ['Strength Training', 'Powerlifting'],
            bio: `Experienced ${user.experience_level} coach specializing in strength and performance.`,
            client_limit: 10
          };
          const { error: coachProfileError } = await supabase
            .from('coach_profiles')
            .upsert(coachProfileData);

          if (coachProfileError) {
            console.warn(`Warning: Could not create coach profile for ${user.name}: ${coachProfileError.message}`);
          } else if (verbose) {
            console.log(`    ✅ Created coach profile for ${user.name}`);
          }
        }
      } catch (error) {
        console.error(`Failed to create user ${userConfig.email}:`, error.message);
        // Continue with other users even if one fails
      }
    }

    if (verbose) {
      console.log(`    ✅ Created ${createdUsers.length} test users`);
    }

    // Create programs for all users using their experience levels
    console.log('DEBUG: Creating programs for all users...');

    const createdPrograms = [];

    for (const user of createdUsers) {
      try {
        if (verbose) {
          console.log(`  Creating program for ${user.name} (${user.experience_level})...`);
        }

        // Get appropriate sample program data based on user's experience level
        const sampleData = getSampleProgramData(user.experience_level);

        // Create program data with user-specific information
        const programData = {
          ...sampleData.program,
          user_id: user.id, // Use the user's ID directly (which is auth.uid())
          start_date: new Date().toISOString().split('T')[0],
          completed_weeks: 0
        };

        // Use createCompleteProgram approach to create program with workouts and exercises
        const { data: program, error: programError } = await supabase
          .from('programs')
          .insert([programData])
          .select()
          .single();

        if (programError) {
          console.error(`DEBUG: Program creation error for ${user.name}:`, programError);
          throw new Error(`Failed to create program for ${user.name}: ${programError.message}`);
        }

        // Create workouts for the program
        const workoutsToInsert = sampleData.workouts.map(workout => ({
          program_id: program.id,
          week_number: workout.week_number,
          day_number: workout.day_number,
          name: workout.name
        }));

        const { data: workouts, error: workoutsError } = await supabase
          .from('program_workouts')
          .insert(workoutsToInsert)
          .select();

        if (workoutsError) {
          console.error(`DEBUG: Workouts creation error for ${user.name}:`, workoutsError);
          // Cleanup: delete the program if workout creation fails
          await supabase.from('programs').delete().eq('id', program.id);
          throw new Error(`Failed to create workouts for ${user.name}: ${workoutsError.message}`);
        }

        // Create exercises for each workout
        const allExercises = [];
        for (const workout of workouts) {
          const workoutData = sampleData.workouts.find(w =>
            w.week_number === workout.week_number && w.day_number === workout.day_number
          );

          if (workoutData && workoutData.exercises && workoutData.exercises.length > 0) {
            const exercisesToInsert = workoutData.exercises.map((exercise, index) => ({
              workout_id: workout.id,
              exercise_id: exercise.exercise_id,
              sets: exercise.sets,
              reps: exercise.reps,
              rest_minutes: exercise.rest_minutes || null,
              notes: exercise.notes || '',
              order_index: index
            }));

            const { data: exercises, error: exercisesError } = await supabase
              .from('program_exercises')
              .insert(exercisesToInsert)
              .select();

            if (exercisesError) {
              console.error(`DEBUG: Exercises creation error for ${user.name}:`, exercisesError);
              // Cleanup: delete program and workouts if exercise creation fails
              await supabase.from('programs').delete().eq('id', program.id);
              throw new Error(`Failed to create exercises for ${user.name}: ${exercisesError.message}`);
            }

            allExercises.push(...exercises);
          }
        }

        createdPrograms.push({
          program,
          workouts,
          exercises: allExercises
        });

        if (verbose) {
          console.log(`    ✅ Created program "${program.name}" for ${user.name} with ${workouts.length} workouts and ${allExercises.length} exercises`);
        }

      } catch (error) {
        console.error(`Failed to create program for user ${user.name}:`, error.message);
        // Continue with other users even if one fails
      }
    }

    console.log(`DEBUG: Successfully created ${createdPrograms.length} programs`);

    if (verbose) {
      console.log(`    ✅ Created ${createdPrograms.length} complete programs`);
    }

    // Seed coach-client relationships and invitations
    await seedCoachClientData(supabase, createdUsers, verbose);

    // Seed historical workout data if requested
    if (includeHistoricalData) {
      await seedHistoricalWorkouts(supabase, createdUsers, createdPrograms, exercises, { verbose });
    }

    if (createdUsers.length === 0) {
      throw new Error('No users were created successfully');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('DEBUG: Seeding completed, returning result...');

    return {
      success: true,
      summary: {
        users: createdUsers.length,
        programs: createdPrograms.length,
        workouts: createdPrograms.reduce((total, p) => total + p.workouts.length, 0),
        exercises: exercises.length,
        programExercises: createdPrograms.reduce((total, p) => total + p.exercises.length, 0),
        historicalData: includeHistoricalData,
        duration
      },
      users: createdUsers,
      programs: createdPrograms.map(p => p.program),
      exercises: exercises
    };
  } catch (error) {
    console.error('Error seeding Supabase data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function resetSupabaseAll(options = {}) {
  const { verbose = false, force = false } = options;

  if (verbose) {
    console.log('🧹 Starting Supabase database reset...');
  }

  const supabase = getSupabaseClient();

  if (!force) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const answer = await new Promise(resolve => {
      rl.question('⚠️  This will delete ALL test data including auth users. Continue? (y/N): ', resolve);
    });

    rl.close();

    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      return {
        success: true,
        cancelled: true,
        message: 'Reset cancelled by user'
      };
    }
  }

  try {
    // First, get all users to delete their auth accounts
    if (verbose) {
      console.log('  Getting users for auth cleanup...');
    }

    const { data: users, error: getUsersError } = await supabase
      .from('users')
      .select('id, email');

    if (!getUsersError && users && users.length > 0) {
      if (verbose) {
        console.log(`  Deleting ${users.length} auth users...`);
      }

      // Delete auth users
      for (const user of users) {
        try {
          await supabase.auth.admin.deleteUser(user.id);
          if (verbose) {
            console.log(`    ✅ Deleted auth user: ${user.email}`);
          }
        } catch (authError) {
          console.warn(`Warning: Could not delete auth user ${user.email}: ${authError.message}`);
        }
      }
    }

    // Now clear database tables
    const operations = [
      { table: 'user_analytics', description: 'user analytics' },
      { table: 'workout_log_exercises', description: 'workout log exercises' },
      { table: 'workout_logs', description: 'workout logs' },
      { table: 'program_exercises', description: 'program exercises' },
      { table: 'program_workouts', description: 'program workouts' },
      { table: 'programs', description: 'programs' },
      { table: 'exercises', description: 'exercises' },
      { table: 'users', description: 'users' }
    ];

    const results = {};

    for (const { table, description } of operations) {
      if (verbose) {
        console.log(`  Clearing ${description}...`);
      }

      const { error, count } = await supabase
        .from(table)
        .delete()
        .gte('created_at', '1900-01-01'); // Delete all

      if (error) {
        console.warn(`Warning: Could not clear ${description}: ${error.message}`);
        results[table] = 0;
      } else {
        results[table] = count || 0;
        if (verbose) {
          console.log(`    ✅ Cleared ${count || 0} ${description}`);
        }
      }
    }

    return {
      success: true,
      statistics: results
    };
  } catch (error) {
    console.error('Error resetting Supabase data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  seedSupabaseAll,
  resetSupabaseAll
};