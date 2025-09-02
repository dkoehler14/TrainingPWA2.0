#!/usr/bin/env node

/**
 * Deployment script for workout_log_exercises unique constraint
 * Handles safe deployment with rollback capabilities
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.development') });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseServiceKey = process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase service role key. Required for schema changes.');
  process.exit(1);
}

// Use service role for schema changes
const supabase = createClient(supabaseUrl, supabaseServiceKey);

class ConstraintDeployer {
  constructor() {
    this.deploymentLog = {
      startTime: new Date().toISOString(),
      steps: [],
      rollbackSteps: [],
      success: false,
      error: null
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;

    console.log(logEntry);
    this.deploymentLog.steps.push({
      timestamp,
      type,
      message
    });
  }

  async executeStep(stepName, stepFunction) {
    this.log(`Starting: ${stepName}`, 'info');

    try {
      const result = await stepFunction();
      this.log(`Completed: ${stepName}`, 'success');
      return result;
    } catch (error) {
      this.log(`Failed: ${stepName} - ${error.message}`, 'error');
      throw error;
    }
  }

  async checkExistingConstraints() {
    return this.executeStep('Check existing constraints', async () => {
      const { data: constraints, error } = await supabase
        .from('information_schema.table_constraints')
        .select('constraint_name, table_name, constraint_type')
        .eq('table_name', 'workout_log_exercises')
        .eq('constraint_type', 'UNIQUE');

      if (error) throw error;

      const existingConstraint = constraints.find(c =>
        c.constraint_name === 'unique_workout_log_exercise'
      );

      if (existingConstraint) {
        this.log('Unique constraint already exists, skipping creation', 'warning');
        return { exists: true, constraint: existingConstraint };
      }

      return { exists: false };
    });
  }

  async analyzeExistingData() {
    return this.executeStep('Analyze existing data for duplicates', async () => {
      // Check for existing duplicates
      const { data: duplicates, error } = await supabase
        .rpc('analyze_workout_log_duplicates');

      if (error && error.message.includes('function') && error.message.includes('does not exist')) {
        // Fallback to direct query
        const { data: directData, error: directError } = await supabase
          .from('workout_log_exercises')
          .select('workout_log_id, exercise_id, COUNT(*) as count')
          .groupBy('workout_log_id, exercise_id')
          .having('COUNT(*)', '>', 1);

        if (directError) throw directError;

        if (directData && directData.length > 0) {
          throw new Error(`Found ${directData.length} duplicate exercise entries. Clean up required before adding constraint.`);
        }

        return { duplicatesFound: false, count: 0 };
      }

      if (error) throw error;

      if (duplicates && duplicates.length > 0) {
        throw new Error(`Found ${duplicates.length} duplicate exercise entries. Clean up required before adding constraint.`);
      }

      return { duplicatesFound: false, count: 0 };
    });
  }

  async createConstraint() {
    return this.executeStep('Create unique constraint', async () => {
      const { error } = await supabase.rpc('exec_sql', {
        sql: `
          ALTER TABLE workout_log_exercises
          ADD CONSTRAINT unique_workout_log_exercise
          UNIQUE (workout_log_id, exercise_id);
        `
      });

      if (error) throw error;

      // Add index for performance
      const { error: indexError } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE INDEX IF NOT EXISTS idx_workout_log_exercises_unique_lookup
          ON workout_log_exercises (workout_log_id, exercise_id);
        `
      });

      if (indexError) {
        this.log('Index creation failed, but constraint was added', 'warning');
      }

      return { constraintAdded: true };
    });
  }

  async createUpsertFunction() {
    return this.executeStep('Create upsert function', async () => {
      const { error } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE OR REPLACE FUNCTION handle_duplicate_workout_exercise_upsert(
            p_workout_log_id UUID,
            p_exercise_id UUID,
            p_sets INTEGER,
            p_reps INTEGER[],
            p_weights DECIMAL(6,2)[],
            p_completed BOOLEAN[],
            p_bodyweight DECIMAL(5,2),
            p_notes TEXT,
            p_order_index INTEGER
          ) RETURNS UUID AS $$
          DECLARE
            existing_id UUID;
            new_id UUID;
          BEGIN
            SELECT id INTO existing_id
            FROM workout_log_exercises
            WHERE workout_log_id = p_workout_log_id
            AND exercise_id = p_exercise_id;

            IF existing_id IS NOT NULL THEN
              UPDATE workout_log_exercises
              SET
                sets = p_sets,
                reps = p_reps,
                weights = p_weights,
                completed = p_completed,
                bodyweight = p_bodyweight,
                notes = p_notes,
                order_index = p_order_index,
                updated_at = NOW()
              WHERE id = existing_id;

              RETURN existing_id;
            ELSE
              INSERT INTO workout_log_exercises (
                workout_log_id,
                exercise_id,
                sets,
                reps,
                weights,
                completed,
                bodyweight,
                notes,
                order_index
              ) VALUES (
                p_workout_log_id,
                p_exercise_id,
                p_sets,
                p_reps,
                p_weights,
                p_completed,
                p_bodyweight,
                p_notes,
                p_order_index
              ) RETURNING id INTO new_id;

              RETURN new_id;
            END IF;
          END;
          $$ LANGUAGE plpgsql;
        `
      });

      if (error) throw error;

      return { functionCreated: true };
    });
  }

  async testConstraint() {
    return this.executeStep('Test constraint functionality', async () => {
      // Create a test workout log
      const { data: testWorkout, error: workoutError } = await supabase
        .from('workout_logs')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          name: 'Constraint Test Workout',
          type: 'quick_workout',
          date: new Date().toISOString().split('T')[0],
          is_draft: true,
          weight_unit: 'LB'
        })
        .select()
        .single();

      if (workoutError) throw workoutError;

      const workoutId = testWorkout.id;

      try {
        // Insert first exercise
        const { error: firstError } = await supabase
          .from('workout_log_exercises')
          .insert({
            workout_log_id: workoutId,
            exercise_id: '00000000-0000-0000-0000-000000000001',
            sets: 3,
            reps: [10, 10, 10],
            weights: [100, 100, 100],
            completed: [true, true, true],
            order_index: 0
          });

        if (firstError) throw firstError;

        // Try to insert duplicate (should fail)
        const { error: duplicateError } = await supabase
          .from('workout_log_exercises')
          .insert({
            workout_log_id: workoutId,
            exercise_id: '00000000-0000-0000-0000-000000000001',
            sets: 3,
            reps: [8, 8, 8],
            weights: [110, 110, 110],
            completed: [true, true, true],
            order_index: 1
          });

        if (!duplicateError || duplicateError.code !== '23505') {
          throw new Error('Constraint did not prevent duplicate insertion');
        }

        this.log('Constraint correctly prevented duplicate exercise', 'success');

        // Test different exercise (should succeed)
        const { error: differentError } = await supabase
          .from('workout_log_exercises')
          .insert({
            workout_log_id: workoutId,
            exercise_id: '00000000-0000-0000-0000-000000000002',
            sets: 3,
            reps: [12, 12, 12],
            weights: [80, 80, 80],
            completed: [true, true, true],
            order_index: 1
          });

        if (differentError) throw differentError;

        this.log('Constraint correctly allowed different exercise', 'success');

        return { testPassed: true };

      } finally {
        // Clean up test data
        await supabase.from('workout_logs').delete().eq('id', workoutId);
      }
    });
  }

  async createRollbackScript() {
    return this.executeStep('Create rollback script', async () => {
      const rollbackScript = `
-- Rollback script for workout_log_exercises unique constraint
-- Generated: ${new Date().toISOString()}

-- Remove the unique constraint
ALTER TABLE workout_log_exercises
DROP CONSTRAINT IF EXISTS unique_workout_log_exercise;

-- Remove the performance index
DROP INDEX IF EXISTS idx_workout_log_exercises_unique_lookup;

-- Remove the upsert function
DROP FUNCTION IF EXISTS handle_duplicate_workout_exercise_upsert(
  UUID, UUID, INTEGER, INTEGER[], DECIMAL(6,2)[], BOOLEAN[], DECIMAL(5,2), TEXT, INTEGER
);

-- Log rollback completion
DO $$
BEGIN
  RAISE NOTICE 'Rollback completed: workout_log_exercises unique constraint removed';
END $$;
`;

      const rollbackPath = path.join(__dirname, 'rollback-workout-log-exercises-constraint.sql');
      fs.writeFileSync(rollbackPath, rollbackScript);

      this.log(`Rollback script created: ${rollbackPath}`, 'info');

      return { rollbackScript: rollbackPath };
    });
  }

  async deploy() {
    try {
      this.log('🚀 Starting deployment of workout_log_exercises unique constraint', 'info');

      // Step 1: Check if constraint already exists
      const constraintCheck = await this.checkExistingConstraints();
      if (constraintCheck.exists) {
        this.log('✅ Deployment skipped: Constraint already exists', 'success');
        this.deploymentLog.success = true;
        return;
      }

      // Step 2: Analyze existing data
      await this.analyzeExistingData();

      // Step 3: Create the constraint
      await this.createConstraint();

      // Step 4: Create upsert function
      await this.createUpsertFunction();

      // Step 5: Test the constraint
      await this.testConstraint();

      // Step 6: Create rollback script
      await this.createRollbackScript();

      this.deploymentLog.success = true;
      this.log('✅ Deployment completed successfully!', 'success');

    } catch (error) {
      this.deploymentLog.success = false;
      this.deploymentLog.error = error.message;
      this.log(`❌ Deployment failed: ${error.message}`, 'error');
      throw error;
    } finally {
      // Save deployment log
      const logPath = path.join(__dirname, 'workout-log-exercises-constraint-deployment-log.json');
      fs.writeFileSync(logPath, JSON.stringify(this.deploymentLog, null, 2));
      this.log(`📄 Deployment log saved: ${logPath}`, 'info');
    }
  }
}

// Main deployment execution
async function main() {
  const deployer = new ConstraintDeployer();

  try {
    await deployer.deploy();
    console.log('\n🎉 Deployment successful!');
    console.log('📋 Next steps:');
    console.log('   1. Run the test script: node scripts/test-workout-log-exercises-constraint.js');
    console.log('   2. Monitor application logs for constraint violations');
    console.log('   3. Update frontend if needed based on test results');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Deployment failed!');
    console.error('📋 Rollback steps:');
    console.error('   1. Run: node scripts/rollback-workout-log-exercises-constraint.sql');
    console.error('   2. Check deployment log for details');
    console.error('   3. Fix issues and retry deployment');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = ConstraintDeployer;