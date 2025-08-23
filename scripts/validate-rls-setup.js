#!/usr/bin/env node

/**
 * Validate Row Level Security Setup
 * 
 * This script validates that RLS is properly configured on all tables
 * Run after database initialization to ensure security policies are in place
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const REQUIRED_TABLES = [
  'users',
  'exercises', 
  'programs',
  'workout_logs',
  'user_analytics'
];

async function validateRLSSetup() {
  console.log('🔒 Validating Row Level Security setup...\n');

  // Use service role for admin operations
  const supabase = createClient(
    process.env.REACT_APP_SUPABASE_URL,
    process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Call the validation function we created in the migration
    const { data, error } = await supabase.rpc('validate_rls_setup');
    
    if (error) {
      console.error('❌ Error validating RLS setup:', error.message);
      process.exit(1);
    }

    console.log('📊 RLS Status Report:');
    console.log('┌─────────────────┬─────────────┬──────────────┐');
    console.log('│ Table           │ RLS Enabled │ Policy Count │');
    console.log('├─────────────────┼─────────────┼──────────────┤');
    
    let allTablesSecure = true;
    
    for (const table of REQUIRED_TABLES) {
      const tableData = data.find(row => row.table_name === table);
      
      if (!tableData) {
        console.log(`│ ${table.padEnd(15)} │ ❌ MISSING  │      N/A     │`);
        allTablesSecure = false;
      } else {
        const rlsStatus = tableData.rls_enabled ? '✅ YES' : '❌ NO';
        const policyCount = tableData.policy_count.toString().padStart(6);
        console.log(`│ ${table.padEnd(15)} │ ${rlsStatus.padEnd(11)} │ ${policyCount.padEnd(12)} │`);
        
        if (!tableData.rls_enabled || tableData.policy_count === 0) {
          allTablesSecure = false;
        }
      }
    }
    
    console.log('└─────────────────┴─────────────┴──────────────┘\n');

    if (allTablesSecure) {
      console.log('✅ All tables have RLS enabled with policies configured');
      console.log('🔒 Database security validation passed');
    } else {
      console.log('❌ Some tables are missing RLS or policies');
      console.log('⚠️  Database security validation failed');
      console.log('\n🔧 To fix this, ensure all migrations have been applied:');
      console.log('   supabase db push');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

// Check required environment variables
if (!process.env.REACT_APP_SUPABASE_URL || !process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   REACT_APP_SUPABASE_URL');
  console.error('   REACT_APP_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

validateRLSSetup().catch(console.error);