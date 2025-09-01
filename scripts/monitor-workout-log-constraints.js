#!/usr/bin/env node

/**
 * Monitoring script for workout log constraints
 * Checks for constraint violations and performance metrics
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

class ConstraintMonitor {
  constructor() {
    this.monitoringLog = {
      timestamp: new Date().toISOString(),
      checks: [],
      alerts: [],
      metrics: {}
    };
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${type.toUpperCase()}: ${message}`);
  }

  async checkConstraintExists() {
    this.log('Checking if unique constraint exists...', 'info');

    try {
      const { data: constraints, error } = await supabase
        .from('information_schema.table_constraints')
        .select('constraint_name, table_name, constraint_type')
        .eq('table_name', 'workout_log_exercises')
        .eq('constraint_type', 'UNIQUE');

      if (error) throw error;

      const uniqueConstraint = constraints.find(c =>
        c.constraint_name === 'unique_workout_log_exercise'
      );

      if (uniqueConstraint) {
        this.monitoringLog.checks.push({
          name: 'constraint_exists',
          status: 'pass',
          details: `Constraint found: ${uniqueConstraint.constraint_name}`
        });
        this.log('✅ Unique constraint exists', 'success');
        return true;
      } else {
        this.monitoringLog.checks.push({
          name: 'constraint_exists',
          status: 'fail',
          details: 'Unique constraint not found'
        });
        this.monitoringLog.alerts.push({
          level: 'critical',
          message: 'Unique constraint missing from workout_log_exercises table'
        });
        this.log('❌ Unique constraint missing', 'error');
        return false;
      }
    } catch (error) {
      this.monitoringLog.checks.push({
        name: 'constraint_exists',
        status: 'error',
        details: error.message
      });
      this.log(`❌ Error checking constraint: ${error.message}`, 'error');
      return false;
    }
  }

  async checkForDuplicates() {
    this.log('Checking for duplicate exercises in workout logs...', 'info');

    try {
      const { data: duplicates, error } = await supabase
        .from('workout_log_exercises')
        .select('workout_log_id, exercise_id, COUNT(*) as count')
        .groupBy('workout_log_id, exercise_id')
        .having('COUNT(*)', '>', 1);

      if (error) throw error;

      if (duplicates && duplicates.length > 0) {
        this.monitoringLog.checks.push({
          name: 'duplicate_check',
          status: 'fail',
          details: `Found ${duplicates.length} duplicate entries`
        });
        this.monitoringLog.alerts.push({
          level: 'critical',
          message: `Found ${duplicates.length} duplicate exercise entries in workout logs`,
          details: duplicates
        });
        this.log(`❌ Found ${duplicates.length} duplicate entries`, 'error');
        return false;
      } else {
        this.monitoringLog.checks.push({
          name: 'duplicate_check',
          status: 'pass',
          details: 'No duplicate entries found'
        });
        this.log('✅ No duplicate entries found', 'success');
        return true;
      }
    } catch (error) {
      this.monitoringLog.checks.push({
        name: 'duplicate_check',
        status: 'error',
        details: error.message
      });
      this.log(`❌ Error checking duplicates: ${error.message}`, 'error');
      return false;
    }
  }

  async checkIndexPerformance() {
    this.log('Checking index performance...', 'info');

    try {
      // Check if performance index exists
      const { data: indexes, error } = await supabase
        .from('pg_indexes')
        .select('indexname, tablename')
        .eq('tablename', 'workout_log_exercises')
        .like('indexname', '%unique%');

      if (error) throw error;

      const uniqueIndex = indexes.find(idx =>
        idx.indexname.includes('unique')
      );

      if (uniqueIndex) {
        this.monitoringLog.checks.push({
          name: 'index_performance',
          status: 'pass',
          details: `Performance index found: ${uniqueIndex.indexname}`
        });
        this.log('✅ Performance index exists', 'success');
        return true;
      } else {
        this.monitoringLog.checks.push({
          name: 'index_performance',
          status: 'warning',
          details: 'Performance index not found - queries may be slower'
        });
        this.monitoringLog.alerts.push({
          level: 'warning',
          message: 'Performance index missing for unique constraint'
        });
        this.log('⚠️ Performance index missing', 'warning');
        return false;
      }
    } catch (error) {
      this.monitoringLog.checks.push({
        name: 'index_performance',
        status: 'error',
        details: error.message
      });
      this.log(`❌ Error checking index: ${error.message}`, 'error');
      return false;
    }
  }

  async gatherMetrics() {
    this.log('Gathering constraint metrics...', 'info');

    try {
      // Get total workout logs
      const { data: workoutLogs, error: wlError } = await supabase
        .from('workout_logs')
        .select('id', { count: 'exact' });

      if (wlError) throw wlError;

      // Get total workout log exercises
      const { data: exercises, error: exError } = await supabase
        .from('workout_log_exercises')
        .select('id', { count: 'exact' });

      if (exError) throw exError;

      // Get unique exercise-workout combinations
      const { data: uniqueCombinations, error: ucError } = await supabase
        .from('workout_log_exercises')
        .select('workout_log_id, exercise_id')
        .groupBy('workout_log_id, exercise_id');

      if (ucError) throw ucError;

      const metrics = {
        total_workout_logs: workoutLogs?.length || 0,
        total_exercises: exercises?.length || 0,
        unique_combinations: uniqueCombinations?.length || 0,
        average_exercises_per_workout: exercises?.length && workoutLogs?.length
          ? (exercises.length / workoutLogs.length).toFixed(2)
          : 0
      };

      this.monitoringLog.metrics = metrics;

      this.log(`📊 Metrics: ${metrics.total_workout_logs} workouts, ${metrics.total_exercises} exercises`, 'info');
      this.log(`📊 Average exercises per workout: ${metrics.average_exercises_per_workout}`, 'info');

      return metrics;
    } catch (error) {
      this.log(`❌ Error gathering metrics: ${error.message}`, 'error');
      return {};
    }
  }

  async checkRecentConstraintViolations() {
    this.log('Checking for recent constraint violations in logs...', 'info');

    // This would typically check application logs or a constraint violation log table
    // For now, we'll just note that this should be monitored
    this.monitoringLog.checks.push({
      name: 'recent_violations',
      status: 'info',
      details: 'Manual log review recommended for constraint violations'
    });

    this.log('ℹ️ Manual log review recommended for constraint violations', 'info');
  }

  generateReport() {
    const report = {
      summary: {
        timestamp: this.monitoringLog.timestamp,
        total_checks: this.monitoringLog.checks.length,
        passed_checks: this.monitoringLog.checks.filter(c => c.status === 'pass').length,
        failed_checks: this.monitoringLog.checks.filter(c => c.status === 'fail').length,
        error_checks: this.monitoringLog.checks.filter(c => c.status === 'error').length,
        warning_checks: this.monitoringLog.checks.filter(c => c.status === 'warning').length,
        alerts_count: this.monitoringLog.alerts.length
      },
      checks: this.monitoringLog.checks,
      alerts: this.monitoringLog.alerts,
      metrics: this.monitoringLog.metrics
    };

    return report;
  }

  async runMonitoring() {
    this.log('🚀 Starting constraint monitoring...', 'info');

    try {
      // Run all checks
      await this.checkConstraintExists();
      await this.checkForDuplicates();
      await this.checkIndexPerformance();
      await this.gatherMetrics();
      await this.checkRecentConstraintViolations();

      // Generate and save report
      const report = this.generateReport();

      const reportPath = path.join(__dirname, 'workout-log-constraints-monitoring-report.json');
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

      this.log(`📄 Monitoring report saved: ${reportPath}`, 'info');

      // Display summary
      console.log('\n' + '='.repeat(50));
      console.log('📊 MONITORING SUMMARY');
      console.log('='.repeat(50));
      console.log(`Total Checks: ${report.summary.total_checks}`);
      console.log(`Passed: ${report.summary.passed_checks}`);
      console.log(`Failed: ${report.summary.failed_checks}`);
      console.log(`Errors: ${report.summary.error_checks}`);
      console.log(`Warnings: ${report.summary.warning_checks}`);
      console.log(`Alerts: ${report.summary.alerts_count}`);

      if (report.alerts.length > 0) {
        console.log('\n🚨 ALERTS:');
        report.alerts.forEach((alert, index) => {
          console.log(`${index + 1}. [${alert.level.toUpperCase()}] ${alert.message}`);
        });
      }

      // Determine exit code based on critical alerts
      const criticalAlerts = report.alerts.filter(a => a.level === 'critical');
      if (criticalAlerts.length > 0) {
        console.log('\n❌ Critical issues found - manual intervention required');
        process.exit(1);
      } else if (report.summary.failed_checks > 0) {
        console.log('\n⚠️ Some checks failed - review report for details');
        process.exit(1);
      } else {
        console.log('\n✅ All checks passed - constraint implementation healthy');
        process.exit(0);
      }

    } catch (error) {
      this.log(`💥 Monitoring failed: ${error.message}`, 'error');
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const monitor = new ConstraintMonitor();
  await monitor.runMonitoring();
}

if (require.main === module) {
  main();
}

module.exports = ConstraintMonitor;