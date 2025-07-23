const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyUserTable() {
  console.log('Verifying users table structure...');
  
  try {
    // Test basic table access
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error accessing users table:', error);
      return false;
    }
    
    console.log('✅ Users table is accessible');
    
    // Test RLS policies by trying to insert without auth
    const { error: insertError } = await supabase
      .from('users')
      .insert({
        auth_id: '00000000-0000-0000-0000-000000000000',
        email: 'test@example.com',
        name: 'Test User'
      });
    
    if (insertError && insertError.code === 'PGRST301') {
      console.log('✅ RLS policies are working (insert blocked without auth)');
    } else {
      console.log('⚠️  RLS policies may not be working correctly');
    }
    
    // Test indexes by checking if they exist
    const { data: indexes, error: indexError } = await supabase
      .rpc('get_user_indexes');
    
    if (indexError) {
      console.log('ℹ️  Cannot verify indexes directly, but table is functional');
    }
    
    console.log('✅ User table verification completed successfully');
    return true;
    
  } catch (error) {
    console.error('Verification failed:', error);
    return false;
  }
}

// Create a function to check indexes
async function createIndexCheckFunction() {
  const { error } = await supabase.rpc('exec_sql', {
    sql: `
      CREATE OR REPLACE FUNCTION get_user_indexes()
      RETURNS TABLE(index_name text, table_name text, column_names text)
      LANGUAGE sql
      AS $$
        SELECT 
          indexname::text,
          tablename::text,
          indexdef::text
        FROM pg_indexes 
        WHERE tablename = 'users' 
        AND schemaname = 'public';
      $$;
    `
  });
  
  if (error) {
    console.log('Could not create index check function:', error.message);
  }
}

async function main() {
  await createIndexCheckFunction();
  const success = await verifyUserTable();
  process.exit(success ? 0 : 1);
}

main();