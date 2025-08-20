#!/usr/bin/env node

/**
 * Test script for Supabase Edge Functions
 * Tests edge functions running locally during development
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Local Supabase configuration
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

class EdgeFunctionTester {
  constructor() {
    this.baseUrl = `${SUPABASE_URL}/functions/v1`;
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  async testWorkoutTriggers() {
    console.log('\n🧪 Testing workout-triggers edge function...');

    try {
      // Test workout completion trigger
      const workoutCompletionPayload = {
        type: 'UPDATE',
        table: 'workout_logs',
        schema: 'public',
        record: {
          id: 'test-workout-123',
          user_id: 'test-user-456',
          is_finished: true,
          completed_date: new Date().toISOString(),
          date: new Date().toISOString()
        },
        old_record: {
          id: 'test-workout-123',
          user_id: 'test-user-456',
          is_finished: false
        }
      };

      const response = await fetch(`${this.baseUrl}/workout-triggers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(workoutCompletionPayload)
      });

      const result = await response.json();

      if (response.ok) {
        console.log('✅ Workout completion trigger test passed');
        console.log('   Response:', result);
      } else {
        console.log('❌ Workout completion trigger test failed');
        console.log('   Error:', result);
      }

      // Test PR detection trigger
      const prDetectionPayload = {
        type: 'UPDATE',
        table: 'user_analytics',
        schema: 'public',
        record: {
          user_id: 'test-user-456',
          exercise_id: 'test-exercise-789',
          e1rm: 225,
          pr_date: new Date().toISOString()
        },
        old_record: {
          user_id: 'test-user-456',
          exercise_id: 'test-exercise-789',
          e1rm: 200,
          pr_date: null
        }
      };

      const prResponse = await fetch(`${this.baseUrl}/workout-triggers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(prDetectionPayload)
      });

      const prResult = await prResponse.json();

      if (prResponse.ok) {
        console.log('✅ PR detection trigger test passed');
        console.log('   Response:', prResult);
      } else {
        console.log('❌ PR detection trigger test failed');
        console.log('   Error:', prResult);
      }

    } catch (error) {
      console.log('❌ Edge function test failed with error:', error.message);
    }
  }

  async testFunctionHealth() {
    console.log('\n🏥 Testing edge function health...');

    try {
      // Simple health check payload
      const healthPayload = {
        type: 'INSERT',
        table: 'health_check',
        schema: 'public',
        record: { test: true }
      };

      const response = await fetch(`${this.baseUrl}/workout-triggers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(healthPayload)
      });

      if (response.ok) {
        console.log('✅ Edge function is healthy and responding');
      } else {
        console.log('⚠️  Edge function responded with status:', response.status);
      }

    } catch (error) {
      console.log('❌ Health check failed:', error.message);
      console.log('   Make sure Supabase is running locally with: npm run supabase:start');
    }
  }

  async checkSupabaseStatus() {
    console.log('\n📊 Checking Supabase local status...');

    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY
        }
      });

      if (response.ok) {
        console.log('✅ Supabase local instance is running');
        console.log(`   API URL: ${SUPABASE_URL}`);
        console.log(`   Studio: http://127.0.0.1:54323`);
      } else {
        console.log('❌ Supabase local instance not responding');
      }

    } catch (error) {
      console.log('❌ Cannot connect to Supabase:', error.message);
      console.log('   Run: npm run supabase:start');
    }
  }

  async runAllTests() {
    console.log('🚀 Starting Edge Function Tests');
    console.log('================================');

    await this.checkSupabaseStatus();
    await this.testFunctionHealth();
    await this.testWorkoutTriggers();

    console.log('\n✨ Edge function testing complete!');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const tester = new EdgeFunctionTester();

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Edge Function Tester

Usage:
  node scripts/test-edge-functions.js [options]

Options:
  --health          Test function health only
  --workout         Test workout triggers only
  --status          Check Supabase status only
  --help, -h        Show this help message

Examples:
  npm run test:edge-functions
  node scripts/test-edge-functions.js --health
  node scripts/test-edge-functions.js --workout
    `);
    return;
  }

  if (args.includes('--health')) {
    await tester.testFunctionHealth();
  } else if (args.includes('--workout')) {
    await tester.testWorkoutTriggers();
  } else if (args.includes('--status')) {
    await tester.checkSupabaseStatus();
  } else {
    await tester.runAllTests();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { EdgeFunctionTester };