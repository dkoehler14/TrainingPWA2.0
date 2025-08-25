#!/usr/bin/env node

/**
 * Test script to verify service role access to users table
 */

const { createClient } = require('@supabase/supabase-js');

async function testServiceRoleAccess() {
  console.log('🧪 Testing service role access to users table...');
  
  // Parse command line arguments
  const args = process.argv.slice(2);
  let envFile = '.env';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env-file') {
      envFile = args[++i];
    } else if (args[i] === '--help') {
      console.log(`
Usage: node test-service-role-access.js [options]

Options:
  --env-file <path>    Path to .env file (default: .env)
  --help               Show this help message

Examples:
  node test-service-role-access.js
  node test-service-role-access.js --env-file .env.production
`);
      process.exit(0);
    }
  }
  
  // Load environment variables from specified file
  require('dotenv').config({ path: envFile });
  console.log(`📁 Using environment file: ${envFile}`);
  
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    process.exit(1);
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  
  // Test 1: Try to read from users table
  console.log('📖 Testing read access to users table...');
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email')
      .limit(5);
    
    if (error) {
      console.error('❌ Read test failed:', error.message);
    } else {
      console.log(`✅ Read test passed: Found ${data.length} users`);
      if (data.length > 0) {
        console.log('   Sample user:', data[0]);
      }
    }
  } catch (error) {
    console.error('❌ Read test exception:', error.message);
  }
  
  // Test 2: Try to insert a test user
  console.log('\n📝 Testing insert access to users table...');
  const testUser = {
    id: 'fe3175f1-acb5-4cc6-9232-88485a0e89ff', // Use one from our data
    email: 'test-migration@example.com',
    name: 'Test Migration User',
    roles: ['user']
  };
  
  try {
    const { data, error } = await supabase
      .from('users')
      .insert(testUser)
      .select()
      .single();
    
    if (error) {
      console.error('❌ Insert test failed:', error.message);
      console.error('   Error code:', error.code);
      console.error('   Error details:', error.details);
    } else {
      console.log('✅ Insert test passed:', data);
      
      // Clean up: delete the test user
      await supabase
        .from('users')
        .delete()
        .eq('id', testUser.id);
      console.log('🗑️ Test user cleaned up');
    }
  } catch (error) {
    console.error('❌ Insert test exception:', error.message);
  }
  
  // Test 3: Check RLS status
  console.log('\n🔒 Checking RLS status...');
  try {
    const { data, error } = await supabase
      .rpc('validate_rls_setup');
    
    if (error) {
      console.error('❌ RLS check failed:', error.message);
    } else {
      console.log('✅ RLS status:');
      data.forEach(table => {
        console.log(`   ${table.table_name}: RLS ${table.rls_enabled ? 'enabled' : 'disabled'}, ${table.policy_count} policies`);
      });
    }
  } catch (error) {
    console.error('❌ RLS check exception:', error.message);
  }
}

if (require.main === module) {
  testServiceRoleAccess().catch(error => {
    console.error('💥 Test failed:', error.message);
    process.exit(1);
  });
}

module.exports = { testServiceRoleAccess };