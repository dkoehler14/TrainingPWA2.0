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
  const { email, password, profile } = userConfig;

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
      { id: '550e8400-e29b-41d4-a716-446655440001', name: 'Bench Press', primary_muscle_group: 'Chest', exercise_type: 'Compound', instructions: 'Lie on bench, lower bar to chest, press up', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440002', name: 'Push-ups', primary_muscle_group: 'Chest', exercise_type: 'Bodyweight', instructions: 'Start in plank position, lower chest to ground, push up', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440003', name: 'Incline Dumbbell Press', primary_muscle_group: 'Chest', exercise_type: 'Compound', instructions: 'On incline bench, press dumbbells up and together', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440004', name: 'Dumbbell Flyes', primary_muscle_group: 'Chest', exercise_type: 'Isolation', instructions: 'Lie on bench, arc dumbbells out and back together', is_global: true },

      // Back exercises
      { id: '550e8400-e29b-41d4-a716-446655440005', name: 'Pull-ups', primary_muscle_group: 'Back', exercise_type: 'Compound', instructions: 'Hang from bar, pull body up until chin over bar', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440006', name: 'Bent-over Row', primary_muscle_group: 'Back', exercise_type: 'Compound', instructions: 'Bend at hips, pull weight to lower chest', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440007', name: 'Lat Pulldown', primary_muscle_group: 'Back', exercise_type: 'Compound', instructions: 'Pull bar down to upper chest, squeeze shoulder blades', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440008', name: 'Deadlift', primary_muscle_group: 'Back', exercise_type: 'Compound', instructions: 'Lift weight from ground by extending hips and knees', is_global: true },

      // Legs exercises
      { id: '550e8400-e29b-41d4-a716-446655440009', name: 'Squat', primary_muscle_group: 'Legs', exercise_type: 'Compound', instructions: 'Lower body by bending knees and hips, return to standing', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000a', name: 'Leg Press', primary_muscle_group: 'Legs', exercise_type: 'Compound', instructions: 'Push weight away using legs while seated', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000b', name: 'Lunges', primary_muscle_group: 'Legs', exercise_type: 'Compound', instructions: 'Step forward, lower back knee toward ground', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000c', name: 'Leg Curl', primary_muscle_group: 'Legs', exercise_type: 'Isolation', instructions: 'Curl heels toward glutes against resistance', is_global: true },

      // Shoulders exercises
      { id: '550e8400-e29b-41d4-a716-44665544000d', name: 'Overhead Press', primary_muscle_group: 'Shoulders', exercise_type: 'Compound', instructions: 'Press weight overhead from shoulder level', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000e', name: 'Lateral Raises', primary_muscle_group: 'Shoulders', exercise_type: 'Isolation', instructions: 'Raise arms out to sides to shoulder height', is_global: true },
      { id: '550e8400-e29b-41d4-a716-44665544000f', name: 'Front Raises', primary_muscle_group: 'Shoulders', exercise_type: 'Isolation', instructions: 'Raise arms forward to shoulder height', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440010', name: 'Rear Delt Flyes', primary_muscle_group: 'Shoulders', exercise_type: 'Isolation', instructions: 'Bend forward, raise arms out to sides', is_global: true },

      // Arms exercises
      { id: '550e8400-e29b-41d4-a716-446655440011', name: 'Bicep Curls', primary_muscle_group: 'Arms', exercise_type: 'Isolation', instructions: 'Curl weight up by flexing biceps', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440012', name: 'Tricep Dips', primary_muscle_group: 'Arms', exercise_type: 'Compound', instructions: 'Lower body by bending arms, push back up', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440013', name: 'Hammer Curls', primary_muscle_group: 'Arms', exercise_type: 'Isolation', instructions: 'Curl with neutral grip, thumbs up', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440014', name: 'Tricep Extensions', primary_muscle_group: 'Arms', exercise_type: 'Isolation', instructions: 'Extend arms overhead, lower weight behind head', is_global: true },

      // Core exercises
      { id: '550e8400-e29b-41d4-a716-446655440015', name: 'Plank', primary_muscle_group: 'Core', exercise_type: 'Isometric', instructions: 'Hold body straight in push-up position', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440016', name: 'Crunches', primary_muscle_group: 'Core', exercise_type: 'Isolation', instructions: 'Lift shoulders off ground by contracting abs', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440017', name: 'Russian Twists', primary_muscle_group: 'Core', exercise_type: 'Isolation', instructions: 'Rotate torso side to side while seated', is_global: true },
      { id: '550e8400-e29b-41d4-a716-446655440018', name: 'Mountain Climbers', primary_muscle_group: 'Core', exercise_type: 'Cardio', instructions: 'Alternate bringing knees to chest in plank position', is_global: true }
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
        profile: {
          name: 'Test User',
          experience_level: 'beginner',
          preferred_units: 'LB',
          age: 25,
          weight: 150.0,
          height: 70.0,
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
        profile: {
          name: 'Beginner User',
          experience_level: 'beginner',
          preferred_units: 'LB',
          age: 22,
          weight: 140.0,
          height: 68.0,
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
        profile: {
          name: 'Intermediate User',
          experience_level: 'intermediate',
          preferred_units: 'LB',
          age: 28,
          weight: 170.0,
          height: 72.0,
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
      } catch (error) {
        console.error(`Failed to create user ${userConfig.email}:`, error.message);
        // Continue with other users even if one fails
      }
    }

    if (createdUsers.length === 0) {
      throw new Error('No users were created successfully');
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