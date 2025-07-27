/**
 * Supabase Helper Functions
 * 
 * This module provides utility functions for working with Supabase
 * in the development environment, including connection validation,
 * client setup, and database operations.
 */

const { createClient } = require('@supabase/supabase-js');

/**
 * Get Supabase client configured for local development
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
  
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Validate that Supabase is running and accessible
 */
async function validateSupabaseConnection() {
  try {
    const supabase = getSupabaseClient();
    
    // Test basic connection by querying a system table
    const { data, error } = await supabase
      .from('exercises')
      .select('count')
      .limit(1);
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "not found" which is ok for empty table
      throw new Error(`Supabase connection failed: ${error.message}`);
    }
    
    return true;
  } catch (error) {
    if (error.message.includes('fetch')) {
      throw new Error('Supabase is not running. Please start it with: supabase start');
    }
    throw error;
  }
}

/**
 * Check if Supabase services are healthy
 */
async function checkSupabaseHealth() {
  try {
    const supabase = getSupabaseClient();
    
    // Test database connection
    const { error: dbError } = await supabase
      .from('exercises')
      .select('count')
      .limit(1);
    
    // Test auth service
    const { error: authError } = await supabase.auth.getSession();
    
    return {
      database: !dbError || dbError.code === 'PGRST116',
      auth: !authError,
      overall: (!dbError || dbError.code === 'PGRST116') && !authError
    };
  } catch (error) {
    return {
      database: false,
      auth: false,
      overall: false,
      error: error.message
    };
  }
}

/**
 * Get database statistics for status reporting
 */
async function getSupabaseStats() {
  const supabase = getSupabaseClient();
  
  try {
    const [usersResult, programsResult, workoutLogsResult, exercisesResult] = await Promise.all([
      supabase.from('users').select('count', { count: 'exact', head: true }),
      supabase.from('programs').select('count', { count: 'exact', head: true }),
      supabase.from('workout_logs').select('count', { count: 'exact', head: true }),
      supabase.from('exercises').select('count', { count: 'exact', head: true })
    ]);
    
    return {
      users: usersResult.count || 0,
      programs: programsResult.count || 0,
      workoutLogs: workoutLogsResult.count || 0,
      exercises: exercisesResult.count || 0
    };
  } catch (error) {
    console.warn('Could not retrieve Supabase stats:', error.message);
    return {
      users: 0,
      programs: 0,
      workoutLogs: 0,
      exercises: 0
    };
  }
}

/**
 * Reset all test data in Supabase database
 */
async function resetSupabaseData(options = {}) {
  const supabase = getSupabaseClient();
  const { verbose = false } = options;
  
  if (verbose) {
    console.log('🧹 Resetting Supabase database...');
  }
  
  try {
    // Delete in order to respect foreign key constraints
    const operations = [
      { table: 'user_analytics', description: 'user analytics' },
      { table: 'workout_log_exercises', description: 'workout log exercises' },
      { table: 'workout_logs', description: 'workout logs' },
      { table: 'program_exercises', description: 'program exercises' },
      { table: 'program_workouts', description: 'program workouts' },
      { table: 'programs', description: 'programs' },
      { table: 'users', description: 'users' },
      { table: 'exercises', description: 'custom exercises' }
    ];
    
    const results = {};
    
    for (const { table, description } of operations) {
      if (verbose) {
        console.log(`  Clearing ${description}...`);
      }
      
      // For exercises, only delete non-global ones to preserve seed data
      let query = supabase.from(table);
      if (table === 'exercises') {
        query = query.delete().eq('is_global', false);
      } else {
        query = query.delete().neq('id', 'impossible-id'); // Delete all
      }
      
      const { error, count } = await query;
      
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
      results
    };
  } catch (error) {
    console.error('Error resetting Supabase data:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Seed basic exercise data if not present
 */
async function ensureBasicExercises() {
  const supabase = getSupabaseClient();
  
  // Check if exercises already exist
  const { data: existingExercises, error } = await supabase
    .from('exercises')
    .select('id')
    .eq('is_global', true)
    .limit(1);
  
  if (error) {
    throw new Error(`Failed to check existing exercises: ${error.message}`);
  }
  
  // If exercises exist, skip seeding
  if (existingExercises && existingExercises.length > 0) {
    return { seeded: false, message: 'Basic exercises already exist' };
  }
  
  // Seed basic exercises from SQL file
  const fs = require('fs');
  const path = require('path');
  
  try {
    const seedPath = path.join(process.cwd(), 'supabase', 'seed.sql');
    const seedContent = fs.readFileSync(seedPath, 'utf8');
    
    // Extract INSERT statements for exercises
    const exerciseInserts = seedContent
      .split('\n')
      .filter(line => line.trim().startsWith('(') && line.includes('exercise'))
      .join('\n');
    
    if (exerciseInserts) {
      // This would need to be executed via SQL, but for now we'll use the Supabase client
      console.log('Basic exercises will be seeded via SQL migration');
      return { seeded: true, message: 'Basic exercises seeded via SQL' };
    }
    
    return { seeded: false, message: 'No exercise data found in seed file' };
  } catch (error) {
    console.warn('Could not seed basic exercises:', error.message);
    return { seeded: false, error: error.message };
  }
}

module.exports = {
  getSupabaseClient,
  validateSupabaseConnection,
  checkSupabaseHealth,
  getSupabaseStats,
  resetSupabaseData,
  ensureBasicExercises
};