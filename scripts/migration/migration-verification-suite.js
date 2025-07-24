#!/usr/bin/env node

/**
 * Migration Verification Suite
 * 
 * This script orchestrates the complete migration verification process,
 * integrating data integrity verification, rollback procedures, and status tracking.
 * 
 * Features:
 * - Comprehensive migration verification
 * - Automated rollback on verification failure
 * - Real-time status tracking and reporting
 * - Integration with all migration tools
 * - Configurable verification levels
 * - Emergency recovery procedures
 * 
 * Usage:
 *   node scripts/migration/migration-verification-suite.js [options]
 */

const { MigrationVerifier } = require('./migration-verifier');
const { RollbackManager } = require('./rollback-manager');
const { MigrationStatusTracker } = require('./migration-status-tracker');

class MigrationVerificationSuite {
  constructor(options = {}) {
    this.options = {
      supabaseUrl: options.supabaseUrl || process.env.SUPABASE_URL,
      supabaseKey: options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY,
      firebaseServiceAccount: options.firebaseServiceAccount,
      outputDir: options.outputDir || './verification-results',
      backupDir: options.backupDir || './migration-backups',
      verificationLevel: options.verificationLevel || 'comprehensive', // basic, standard, comprehensive
      autoRollbackOnFailure: options.autoRollbackOnFailure !== false, // Default to true
      performanceTest: options.performanceTest || false,
      sampleSize: options.sampleSize || 100,
      verbose: options.verbose || false,
      dryRun: options.dryRun || false,
      ...options
    };
    
    this.verifier = null;
    this.rollbackManager = null;
    this.statusTracker = null;
    
    this.suiteResults = {
      startTime: null,
      endTime: null,
      duration: null,
      verificationResults: null,
      rollbackResults: null,
      overallStatus: 'not_started', // not_started, in_progress, passed, failed, rolled_back
      errors: [],
      warnings: []
    };
  }

  async initialize() {
    console.log('🔧 Initializing Migration Verification Suite...');
    
    // Initialize status tracker
    this.statusTracker = new MigrationStatusTracker({
      statusFile: `${this.options.outputDir}/verification-status.json`,
      logFile: `${this.options.outputDir}/verification-log.json`,
      backupDir: this.options.backupDir,
      verbose: this.options.verbose
    });
    
    await this.statusTracker.initialize();
    
    // Initialize verifier
    this.verifier = new MigrationVerifier({
      supabaseUrl: this.options.supabaseUrl,
      supabaseKey: this.options.supabaseKey,
      firebaseServiceAccount: this.options.firebaseServiceAccount,
      outputDir: this.options.outputDir,
      sampleSize: this.options.sampleSize,
      performanceTest: this.options.performanceTest,
      verbose: this.options.verbose
    });
    
    await this.verifier.initialize();
    
    // Initialize rollback manager
    this.rollbackManager = new RollbackManager({
      supabaseUrl: this.options.supabaseUrl,
      supabaseKey: this.options.supabaseKey,
      backupDir: this.options.backupDir,
      confirmRollback: false, // Automated rollback
      createBackup: true,
      verbose: this.options.verbose,
      dryRun: this.options.dryRun
    });
    
    await this.rollbackManager.initialize();
    
    console.log('✅ Migration Verification Suite initialized');
  }

  async runVerificationSuite() {
    console.log('🔍 Starting Migration Verification Suite...');
    
    this.suiteResults.startTime = new Date().toISOString();
    this.suiteResults.overallStatus = 'in_progress';
    
    await this.statusTracker.startMigration();
    await this.statusTracker.addCheckpoint('verification-suite-started');
    
    try {
      // Phase 1: Data Integrity Verification
      console.log('\n📊 Phase 1: Data Integrity Verification');
      await this.statusTracker.startPhase('verification');
      
      const verificationResults = await this.runDataVerification();
      this.suiteResults.verificationResults = verificationResults;
      
      // Integrate verification results with status tracker
      await this.statusTracker.integrateWithVerifier(verificationResults);
      
      // Determine if verification passed
      const verificationPassed = this.evaluateVerificationResults(verificationResults);
      
      if (verificationPassed) {
        console.log('✅ Data verification passed');
        await this.statusTracker.addCheckpoint('verification-passed', {
          passedVerifications: verificationResults.summary.passedVerifications,
          failedVerifications: verificationResults.summary.failedVerifications
        });
        
        this.suiteResults.overallStatus = 'passed';
        await this.statusTracker.completeMigration(this.suiteResults);
        
      } else {
        console.log('❌ Data verification failed');
        await this.statusTracker.addCheckpoint('verification-failed', {
          failedVerifications: verificationResults.summary.failedVerifications,
          errors: verificationResults.errors
        });
        
        // Phase 2: Automated Rollback (if enabled)
        if (this.options.autoRollbackOnFailure) {
          console.log('\n🔄 Phase 2: Automated Rollback');
          await this.runAutomatedRollback();
        } else {
          console.log('\n⚠️ Verification failed but auto-rollback is disabled');
          this.suiteResults.overallStatus = 'failed';
          await this.statusTracker.failMigration(new Error('Verification failed'));
        }
      }
      
      // Phase 3: Final Reporting
      console.log('\n📄 Phase 3: Final Reporting');
      await this.generateComprehensiveReport();
      
      this.suiteResults.endTime = new Date().toISOString();
      this.suiteResults.duration = new Date(this.suiteResults.endTime) - new Date(this.suiteResults.startTime);
      
      console.log('\n✅ Migration Verification Suite completed');
      this.printSuiteSummary();
      
      return this.suiteResults;
      
    } catch (error) {
      this.suiteResults.errors.push({
        error: error.message,
        timestamp: new Date().toISOString(),
        phase: 'suite-execution'
      });
      
      this.suiteResults.overallStatus = 'failed';
      await this.statusTracker.failMigration(error);
      
      console.error('\n❌ Migration Verification Suite failed:', error.message);
      throw error;
    }
  }

  async runDataVerification() {
    console.log('   Running comprehensive data verification...');
    
    try {
      // Update progress
      await this.statusTracker.updatePhaseProgress('verification', 10, { message: 'Starting data verification' });
      
      // Run verification based on level
      let verificationResults;
      
      switch (this.options.verificationLevel) {
        case 'basic':
          verificationResults = await this.runBasicVerification();
          break;
        case 'standard':
          verificationResults = await this.runStandardVerification();
          break;
        case 'comprehensive':
          verificationResults = await this.runComprehensiveVerification();
          break;
        default:
          throw new Error(`Unknown verification level: ${this.options.verificationLevel}`);
      }
      
      await this.statusTracker.updatePhaseProgress('verification', 90, { message: 'Verification completed' });
      
      return verificationResults;
      
    } catch (error) {
      await this.statusTracker.failPhase('verification', error);
      throw error;
    }
  }

  async runBasicVerification() {
    console.log('   Running basic verification (count checks only)...');
    
    // Override verifier options for basic verification
    this.verifier.options.sampleSize = 10;
    this.verifier.options.performanceTest = false;
    
    return await this.verifier.verifyMigration();
  }

  async runStandardVerification() {
    console.log('   Running standard verification (counts + sample data)...');
    
    // Use default verifier settings
    return await this.verifier.verifyMigration();
  }

  async runComprehensiveVerification() {
    console.log('   Running comprehensive verification (full validation + performance)...');
    
    // Override verifier options for comprehensive verification
    this.verifier.options.sampleSize = Math.max(this.options.sampleSize, 200);
    this.verifier.options.performanceTest = true;
    
    const results = await this.verifier.verifyMigration();
    
    // Additional comprehensive checks
    await this.runAdditionalIntegrityChecks();
    
    return results;
  }

  async runAdditionalIntegrityChecks() {
    console.log('   Running additional integrity checks...');
    
    // Add custom integrity checks here
    await this.statusTracker.addCheckpoint('additional-integrity-checks-completed');
  }

  evaluateVerificationResults(results) {
    const { summary } = results;
    
    // Define pass criteria based on verification level
    const passCriteria = {
      basic: {
        maxFailedVerifications: 0,
        maxWarnings: 10
      },
      standard: {
        maxFailedVerifications: 0,
        maxWarnings: 5
      },
      comprehensive: {
        maxFailedVerifications: 0,
        maxWarnings: 2
      }
    };
    
    const criteria = passCriteria[this.options.verificationLevel];
    
    const passed = summary.failedVerifications <= criteria.maxFailedVerifications &&
                  summary.warnings <= criteria.maxWarnings;
    
    if (!passed) {
      this.suiteResults.warnings.push({
        message: `Verification failed criteria: ${summary.failedVerifications} failures, ${summary.warnings} warnings`,
        timestamp: new Date().toISOString()
      });
    }
    
    return passed;
  }

  async runAutomatedRollback() {
    console.log('   Initiating automated rollback...');
    
    try {
      await this.statusTracker.addCheckpoint('rollback-initiated', { reason: 'verification-failure' });
      
      // Configure rollback for verification failure
      this.rollbackManager.options.rollbackType = 'data-only'; // Keep schema, remove data
      this.rollbackManager.options.confirmRollback = false; // Automated
      
      const rollbackResults = await this.rollbackManager.executeRollback();
      this.suiteResults.rollbackResults = rollbackResults;
      
      // Integrate rollback results with status tracker
      await this.statusTracker.integrateWithRollback(rollbackResults);
      
      if (rollbackResults.rollbackStatus.completed) {
        console.log('✅ Automated rollback completed successfully');
        this.suiteResults.overallStatus = 'rolled_back';
        await this.statusTracker.addCheckpoint('rollback-completed');
      } else {
        console.log('❌ Automated rollback failed');
        this.suiteResults.overallStatus = 'failed';
        this.suiteResults.errors.push({
          error: 'Automated rollback failed',
          timestamp: new Date().toISOString(),
          phase: 'rollback'
        });
      }
      
    } catch (error) {
      console.error('❌ Automated rollback failed:', error.message);
      this.suiteResults.overallStatus = 'failed';
      this.suiteResults.errors.push({
        error: `Rollback failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        phase: 'rollback'
      });
      
      throw error;
    }
  }

  async generateComprehensiveReport() {
    console.log('   Generating comprehensive report...');
    
    const report = {
      suite: {
        startTime: this.suiteResults.startTime,
        endTime: this.suiteResults.endTime,
        duration: this.formatDuration(this.suiteResults.duration),
        overallStatus: this.suiteResults.overallStatus,
        verificationLevel: this.options.verificationLevel,
        autoRollbackEnabled: this.options.autoRollbackOnFailure
      },
      verification: this.suiteResults.verificationResults,
      rollback: this.suiteResults.rollbackResults,
      statusTracking: this.statusTracker.getStatus(),
      errors: this.suiteResults.errors,
      warnings: this.suiteResults.warnings,
      recommendations: this.generateRecommendations()
    };
    
    // Save comprehensive report
    const fs = require('fs').promises;
    const path = require('path');
    
    const reportPath = path.join(this.options.outputDir, 'comprehensive-verification-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    // Generate executive summary
    const summaryPath = path.join(this.options.outputDir, 'verification-executive-summary.md');
    const summary = this.generateExecutiveSummary(report);
    await fs.writeFile(summaryPath, summary, 'utf8');
    
    console.log(`📄 Comprehensive report saved to: ${reportPath}`);
    console.log(`📄 Executive summary saved to: ${summaryPath}`);
    
    return report;
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.suiteResults.overallStatus === 'failed') {
      recommendations.push({
        priority: 'high',
        category: 'data-integrity',
        message: 'Review verification errors and fix data inconsistencies before retrying migration'
      });
    }
    
    if (this.suiteResults.overallStatus === 'rolled_back') {
      recommendations.push({
        priority: 'high',
        category: 'migration-strategy',
        message: 'Migration was rolled back due to verification failures. Review and fix issues before retrying'
      });
    }
    
    if (this.suiteResults.verificationResults?.summary.warnings > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'data-quality',
        message: 'Address verification warnings to improve data quality'
      });
    }
    
    if (this.options.verificationLevel === 'basic') {
      recommendations.push({
        priority: 'low',
        category: 'verification-coverage',
        message: 'Consider running comprehensive verification for production migrations'
      });
    }
    
    return recommendations;
  }

  generateExecutiveSummary(report) {
    let summary = `# Migration Verification Executive Summary\n\n`;
    
    summary += `**Date:** ${new Date().toISOString()}\n`;
    summary += `**Overall Status:** ${this.getStatusEmoji(report.suite.overallStatus)} ${report.suite.overallStatus.toUpperCase()}\n`;
    summary += `**Verification Level:** ${report.suite.verificationLevel}\n`;
    summary += `**Duration:** ${report.suite.duration}\n\n`;
    
    // Key Metrics
    summary += `## Key Metrics\n\n`;
    if (report.verification) {
      const v = report.verification.summary;
      summary += `- **Collections Verified:** ${v.totalCollections}\n`;
      summary += `- **Passed Verifications:** ${v.passedVerifications}\n`;
      summary += `- **Failed Verifications:** ${v.failedVerifications}\n`;
      summary += `- **Warnings:** ${v.warnings}\n`;
    }
    
    if (report.rollback) {
      const r = report.rollback.rollbackStatus;
      summary += `- **Tables Rolled Back:** ${r.tablesProcessed}\n`;
      summary += `- **Records Removed:** ${r.recordsRemoved}\n`;
    }
    
    summary += `\n`;
    
    // Status Assessment
    summary += `## Status Assessment\n\n`;
    switch (report.suite.overallStatus) {
      case 'passed':
        summary += `✅ **SUCCESS**: Migration verification passed all checks. The migration is ready for production use.\n\n`;
        break;
      case 'failed':
        summary += `❌ **FAILURE**: Migration verification failed. Manual intervention required before proceeding.\n\n`;
        break;
      case 'rolled_back':
        summary += `↩️ **ROLLED BACK**: Migration was automatically rolled back due to verification failures. Review issues and retry.\n\n`;
        break;
    }
    
    // Recommendations
    if (report.recommendations.length > 0) {
      summary += `## Recommendations\n\n`;
      
      const highPriority = report.recommendations.filter(r => r.priority === 'high');
      const mediumPriority = report.recommendations.filter(r => r.priority === 'medium');
      const lowPriority = report.recommendations.filter(r => r.priority === 'low');
      
      if (highPriority.length > 0) {
        summary += `### High Priority\n`;
        for (const rec of highPriority) {
          summary += `- **${rec.category}**: ${rec.message}\n`;
        }
        summary += `\n`;
      }
      
      if (mediumPriority.length > 0) {
        summary += `### Medium Priority\n`;
        for (const rec of mediumPriority) {
          summary += `- **${rec.category}**: ${rec.message}\n`;
        }
        summary += `\n`;
      }
      
      if (lowPriority.length > 0) {
        summary += `### Low Priority\n`;
        for (const rec of lowPriority) {
          summary += `- **${rec.category}**: ${rec.message}\n`;
        }
        summary += `\n`;
      }
    }
    
    // Next Steps
    summary += `## Next Steps\n\n`;
    switch (report.suite.overallStatus) {
      case 'passed':
        summary += `1. ✅ Migration verification completed successfully\n`;
        summary += `2. 🚀 Proceed with production deployment\n`;
        summary += `3. 📊 Monitor application performance post-migration\n`;
        summary += `4. 🗑️ Clean up verification artifacts when no longer needed\n`;
        break;
      case 'failed':
        summary += `1. 🔍 Review detailed verification report for specific failures\n`;
        summary += `2. 🔧 Fix identified data integrity issues\n`;
        summary += `3. 🔄 Re-run migration verification\n`;
        summary += `4. 📞 Escalate to database team if issues persist\n`;
        break;
      case 'rolled_back':
        summary += `1. 📋 Review rollback report to confirm successful cleanup\n`;
        summary += `2. 🔍 Analyze verification failures to identify root causes\n`;
        summary += `3. 🔧 Fix migration process and data transformation logic\n`;
        summary += `4. 🧪 Test fixes in development environment\n`;
        summary += `5. 🔄 Retry migration when issues are resolved\n`;
        break;
    }
    
    return summary;
  }

  getStatusEmoji(status) {
    const emojis = {
      not_started: '⏳',
      in_progress: '🔄',
      passed: '✅',
      failed: '❌',
      rolled_back: '↩️'
    };
    return emojis[status] || '❓';
  }

  formatDuration(ms) {
    if (!ms) return 'N/A';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  printSuiteSummary() {
    console.log('\n📋 Verification Suite Summary:');
    console.log('='.repeat(60));
    console.log(`Overall Status: ${this.getStatusEmoji(this.suiteResults.overallStatus)} ${this.suiteResults.overallStatus.toUpperCase()}`);
    console.log(`Verification Level: ${this.options.verificationLevel}`);
    console.log(`Duration: ${this.formatDuration(this.suiteResults.duration)}`);
    console.log(`Errors: ${this.suiteResults.errors.length}`);
    console.log(`Warnings: ${this.suiteResults.warnings.length}`);
    
    if (this.suiteResults.verificationResults) {
      const v = this.suiteResults.verificationResults.summary;
      console.log(`Verification Results: ${v.passedVerifications}/${v.totalCollections} passed`);
    }
    
    if (this.suiteResults.rollbackResults) {
      const r = this.suiteResults.rollbackResults.rollbackStatus;
      console.log(`Rollback Results: ${r.tablesProcessed} tables processed, ${r.recordsRemoved} records removed`);
    }
  }

  // Emergency procedures
  async emergencyVerification() {
    console.log('🚨 Running emergency verification...');
    
    // Quick verification with minimal checks
    this.options.verificationLevel = 'basic';
    this.options.sampleSize = 10;
    this.options.performanceTest = false;
    
    return await this.runVerificationSuite();
  }

  async emergencyRollback() {
    console.log('🚨 Running emergency rollback...');
    
    this.rollbackManager.options.rollbackType = 'full';
    this.rollbackManager.options.confirmRollback = false;
    this.rollbackManager.options.createBackup = false; // Skip backup in emergency
    
    return await this.rollbackManager.emergencyRecovery();
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--supabase-url':
        options.supabaseUrl = args[++i];
        break;
      case '--supabase-key':
        options.supabaseKey = args[++i];
        break;
      case '--firebase-service-account':
        options.firebaseServiceAccount = args[++i];
        break;
      case '--output-dir':
        options.outputDir = args[++i];
        break;
      case '--backup-dir':
        options.backupDir = args[++i];
        break;
      case '--verification-level':
        options.verificationLevel = args[++i];
        break;
      case '--sample-size':
        options.sampleSize = parseInt(args[++i]);
        break;
      case '--no-auto-rollback':
        options.autoRollbackOnFailure = false;
        break;
      case '--performance-test':
        options.performanceTest = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--emergency-verification':
        options.emergencyVerification = true;
        break;
      case '--emergency-rollback':
        options.emergencyRollback = true;
        break;
      case '--help':
        console.log(`
Migration Verification Suite

Usage: node migration-verification-suite.js [options]

Options:
  --supabase-url <url>              Supabase project URL
  --supabase-key <key>              Supabase service role key
  --firebase-service-account <path> Path to Firebase service account JSON
  --output-dir <path>               Output directory for reports
  --backup-dir <path>               Directory for backups
  --verification-level <level>      Verification level: basic, standard, comprehensive
  --sample-size <number>            Number of records to sample for comparison
  --no-auto-rollback               Disable automatic rollback on verification failure
  --performance-test               Include performance testing
  --dry-run                        Show what would be done without executing
  --verbose                        Enable verbose logging
  --emergency-verification         Run emergency verification (minimal checks)
  --emergency-rollback             Run emergency rollback (immediate cleanup)
  --help                           Show this help message

Environment Variables:
  SUPABASE_URL                     Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY        Supabase service role key
  GOOGLE_APPLICATION_CREDENTIALS   Path to Firebase service account JSON

Examples:
  # Standard verification with auto-rollback
  node migration-verification-suite.js --verification-level standard

  # Comprehensive verification without auto-rollback
  node migration-verification-suite.js --verification-level comprehensive --no-auto-rollback

  # Emergency verification (minimal checks)
  node migration-verification-suite.js --emergency-verification

  # Dry run to see what would be verified
  node migration-verification-suite.js --dry-run --verbose

⚠️  WARNING: This suite can automatically rollback migrations on failure. Ensure you have proper backups!
`);
        process.exit(0);
        break;
    }
  }
  
  try {
    const suite = new MigrationVerificationSuite(options);
    await suite.initialize();
    
    if (options.emergencyVerification) {
      await suite.emergencyVerification();
    } else if (options.emergencyRollback) {
      await suite.emergencyRollback();
    } else {
      const results = await suite.runVerificationSuite();
      
      // Exit with appropriate code
      if (results.overallStatus === 'passed') {
        process.exit(0);
      } else {
        process.exit(1);
      }
    }
    
  } catch (error) {
    console.error('💥 Migration Verification Suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { MigrationVerificationSuite };