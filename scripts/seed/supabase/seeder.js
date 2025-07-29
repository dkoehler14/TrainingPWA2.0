const { createClient } = require('@supabase/supabase-js');

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
      .select('auth_id, id')
      .eq('email', email);

    if (existingUsers && existingUsers.length > 0) {
      if (verbose) {
        console.log(`  Cleaning up existing user: ${email}`);
      }
      
      // Delete existing auth users
      for (const existingUser of existingUsers) {
        try {
          await supabase.auth.admin.deleteUser(existingUser.auth_id);
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
      id: authUser.user.id, // Use the auth user's ID
      auth_id: authUser.user.id,
      email,
      ...profile
    };

    // Check if a profile with this auth_id already exists
    const { data: existingProfile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_id', authUser.user.id);

    if (existingProfile && existingProfile.length > 0) {
      if (verbose) {
        console.log(`    Warning: Profile with auth_id ${authUser.user.id} already exists, deleting...`);
      }
      await supabase.from('users').delete().eq('auth_id', authUser.user.id);
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

    // Create a basic program for the first user
    const testProgram = {
      id: '550e8400-e29b-41d4-a716-446655440200',
      user_id: createdUsers[0].id,
      name: 'Basic Strength Program',
      description: 'A simple 3-day strength training program',
      duration: 8,
      days_per_week: 3,
      weight_unit: 'LB',
      difficulty: 'beginner',
      goals: ['Build Muscle', 'Get Stronger'],
      equipment: ['Dumbbells', 'Barbell', 'Bench'],
      is_template: false,
      is_current: true,
      is_active: true,
      start_date: new Date().toISOString().split('T')[0],
      completed_weeks: 0
    };

    console.log('DEBUG: Inserting program into database...');

    const { data: program, error: programError } = await supabase
      .from('programs')
      .upsert(testProgram)
      .select()
      .single();

    if (programError) {
      console.error('DEBUG: Program creation error:', programError);
      throw new Error(`Failed to create test program: ${programError.message}`);
    }

    console.log('DEBUG: Program created successfully:', program.name);

    if (verbose) {
      console.log('    ✅ Created basic program');
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('DEBUG: Seeding completed, returning result...');

    return {
      success: true,
      summary: {
        users: createdUsers.length,
        programs: 1,
        exercises: 0,
        historicalData: includeHistoricalData,
        duration
      },
      users: createdUsers,
      programs: [program]
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
      .select('auth_id, email');

    if (!getUsersError && users && users.length > 0) {
      if (verbose) {
        console.log(`  Deleting ${users.length} auth users...`);
      }

      // Delete auth users
      for (const user of users) {
        try {
          await supabase.auth.admin.deleteUser(user.auth_id);
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