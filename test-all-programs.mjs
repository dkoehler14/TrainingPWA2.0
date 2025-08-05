import { createClient } from '@supabase/supabase-js';

// Create Supabase client
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'http://127.0.0.1:54321';
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllPrograms() {
  try {
    console.log('🔍 Checking all programs in database...');
    
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
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

checkAllPrograms();