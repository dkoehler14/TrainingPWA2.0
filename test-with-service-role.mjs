import { createClient } from '@supabase/supabase-js';

// Create Supabase client with service role key to bypass RLS
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'http://127.0.0.1:54321';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkWithServiceRole() {
  try {
    console.log('🔍 Checking with service role key (bypassing RLS)...');
    
    // Get all programs
    const { data: programs, error: programsError } = await supabase
      .from('programs')
      .select('id, name, user_id, is_active, is_current')
      .order('created_at', { ascending: false });
    
    if (programsError) {
      console.error('❌ Programs query failed:', programsError);
      return;
    }
    
    console.log(`📈 Found ${programs?.length || 0} total programs in database`);
    
    if (programs && programs.length > 0) {
      programs.forEach((program, index) => {
        console.log(`  ${index + 1}. ${program.name} (User: ${program.user_id}, Active: ${program.is_active}, Current: ${program.is_current})`);
      });
    }
    
    // Get all users
    console.log('\n👥 Checking all users in database...');
    
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email')
      .order('created_at', { ascending: false });
    
    if (usersError) {
      console.error('❌ Users query failed:', usersError);
      return;
    }
    
    console.log(`👤 Found ${users?.length || 0} total users in database`);
    
    if (users && users.length > 0) {
      users.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.email} (ID: ${user.id})`);
      });
    }
    
    // Check program_workouts table
    console.log('\n🏋️ Checking program_workouts table...');
    
    const { data: workouts, error: workoutsError } = await supabase
      .from('program_workouts')
      .select('id, program_id, week_number, day_number, name')
      .limit(10);
    
    if (workoutsError) {
      console.error('❌ Program workouts query failed:', workoutsError);
      return;
    }
    
    console.log(`🏋️ Found ${workouts?.length || 0} program workouts in database`);
    
    if (workouts && workouts.length > 0) {
      workouts.forEach((workout, index) => {
        console.log(`  ${index + 1}. ${workout.name} (Program: ${workout.program_id}, Week: ${workout.week_number}, Day: ${workout.day_number})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

checkWithServiceRole();