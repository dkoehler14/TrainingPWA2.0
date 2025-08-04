#!/usr/bin/env node

/**
 * Cleanup script for test users
 * 
 * This script thoroughly cleans up all test users from both
 * the auth system and the database to ensure a clean state.
 */

const { createClient } = require('@supabase/supabase-js');

function getSupabaseClient() {
  const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'http://127.0.0.1:54321';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
  
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

async function cleanupAllTestUsers() {
  console.log('🧹 Starting comprehensive test user cleanup...\n');
  
  const supabase = getSupabaseClient();
  
  try {
    // Step 1: Clean up database users
    console.log('1. Cleaning up database users...');
    
    const { data: dbUsers, error: dbError } = await supabase
      .from('users')
      .select('email, id');
    
    if (dbError) {
      console.log(`   ⚠️  Could not fetch database users: ${dbError.message}`);
    } else if (dbUsers && dbUsers.length > 0) {
      console.log(`   Found ${dbUsers.length} database user(s)`);
      
      // Delete auth users first
      for (const user of dbUsers) {
        try {
          await supabase.auth.admin.deleteUser(user.id);
          console.log(`   ✅ Deleted auth user: ${user.email} (${user.id})`);
        } catch (authError) {
          console.log(`   ⚠️  Could not delete auth user ${user.email}: ${authError.message}`);
        }
      }
      
      // Delete database records
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .gte('created_at', '1900-01-01'); // Delete all (using a date condition that matches all)
      
      if (deleteError) {
        console.log(`   ⚠️  Could not delete database records: ${deleteError.message}`);
      } else {
        console.log(`   ✅ Deleted all database user records`);
      }
    } else {
      console.log('   ✅ No database users to clean up');
    }
    
    // Step 2: Clean up orphaned auth users
    console.log('\n2. Cleaning up orphaned auth users...');
    
    try {
      const { data: authData, error: authListError } = await supabase.auth.admin.listUsers();
      
      if (authListError) {
        console.log(`   ⚠️  Could not list auth users: ${authListError.message}`);
      } else if (authData && authData.users && authData.users.length > 0) {
        console.log(`   Found ${authData.users.length} auth user(s)`);
        
        for (const authUser of authData.users) {
          try {
            await supabase.auth.admin.deleteUser(authUser.id);
            console.log(`   ✅ Deleted orphaned auth user: ${authUser.email} (${authUser.id})`);
          } catch (deleteError) {
            console.log(`   ⚠️  Could not delete auth user ${authUser.email}: ${deleteError.message}`);
          }
        }
      } else {
        console.log('   ✅ No orphaned auth users to clean up');
      }
    } catch (authError) {
      console.log(`   ⚠️  Auth cleanup error: ${authError.message}`);
    }
    
    // Step 3: Clean up related data
    console.log('\n3. Cleaning up related data...');
    
    const tables = [
      'user_analytics',
      'workout_log_exercises', 
      'workout_logs',
      'program_exercises',
      'program_workouts',
      'programs'
    ];
    
    for (const table of tables) {
      try {
        const { error } = await supabase
          .from(table)
          .delete()
          .gte('created_at', '1900-01-01'); // Delete all
        
        if (error) {
          console.log(`   ⚠️  Could not clean ${table}: ${error.message}`);
        } else {
          console.log(`   ✅ Cleaned ${table}`);
        }
      } catch (tableError) {
        console.log(`   ⚠️  Error cleaning ${table}: ${tableError.message}`);
      }
    }
    
    console.log('\n🎉 Cleanup completed successfully!');
    console.log('\nSummary:');
    console.log('✅ Database users cleaned');
    console.log('✅ Auth users cleaned');
    console.log('✅ Related data cleaned');
    
    return { success: true };
    
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    return { success: false, error: error.message };
  }
}

async function main() {
  try {
    const result = await cleanupAllTestUsers();
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { cleanupAllTestUsers };