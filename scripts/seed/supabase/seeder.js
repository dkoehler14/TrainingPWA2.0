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

async function seedSupabaseAll(options = {}) {
  const { scenarios = 'basic', verbose = false, includeHistoricalData = true } = options;
  const startTime = Date.now();
  const supabase = getSupabaseClient();
  
  try {
    if (verbose) {
      console.log('🌱 Starting Supabase database seeding...');
    }
    
    console.log('DEBUG: About to create test user...');
    
    // Create a test user
    const testUser = {
      id: '550e8400-e29b-41d4-a716-446655440100',
      auth_id: '550e8400-e29b-41d4-a716-446655440100',
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
      preferences: {},
      settings: {}
    };
    
    console.log('DEBUG: Inserting user into database...');
    
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert(testUser)
      .select()
      .single();
    
    if (userError) {
      console.error('DEBUG: User creation error:', userError);
      throw new Error(`Failed to create test user: ${userError.message}`);
    }
    
    console.log('DEBUG: User created successfully:', user.email);
    
    if (verbose) {
      console.log('    ✅ Created test user');
    }
    
    // Create a basic program
    const testProgram = {
      id: '550e8400-e29b-41d4-a716-446655440200',
      user_id: user.id,
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
        users: 1,
        programs: 1,
        exercises: 0,
        historicalData: includeHistoricalData,
        duration
      },
      users: [{ ...user, password: 'testpass123' }],
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
      rl.question('⚠️  This will delete ALL test data. Continue? (y/N): ', resolve);
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
        .neq('id', 'impossible-id');
      
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