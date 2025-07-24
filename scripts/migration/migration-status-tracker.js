#!/usr/bin/env node

/**
 * Migration Status Tracker
 * 
 * This script tracks and reports the status of migration operations,
 * providing comprehensive monitoring and progress tracking capabilities.
 * 
 * Features:
 * - Migration progress tracking
 * - Status persistence and recovery
 * - Real-time status updates
 * - Detailed operation logging
 * - Status reporting and dashboards
 * - Integration with verification and rollback tools
 * 
 * Usage:
 *   node scripts/migration/migration-status-tracker.js [options]
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class MigrationStatusTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      statusFile: options.statusFile || './migration-status.json',
      logFile: options.logFile || './migration-log.json',
      backupDir: options.backupDir || './migration-backups',
      autoSave: options.autoSave !== false, // Default to true
      verbose: options.verbose || false,
      ...options
    };
    
    this.status = {
      migrationId: this.generateMigrationId(),
      startTime: null,
      endTime: null,
      duration: null,
      currentPhase: 'not_started',
      overallStatus: 'not_started', // not_started, in_progress, completed, failed, rolled_back
      phases: {
        extraction: { status: 'not_started', startTime: null, endTime: null, progress: 0, errors: [] },
        transformation: { status: 'not_started', startTime: null, endTime: null, progress: 0, errors: [] },
        import: { status: 'not_started', startTime: null, endTime: null, progress: 0, errors: [] },
        verification: { status: 'not_started', startTime: null, endTime: null, progress: 0, errors: [] },
        rollback: { status: 'not_started', startTime: null, endTime: null, progress: 0, errors: [] }
      },
      collections: {},
      statistics: {
        totalRecords: 0,
        processedRecords: 0,
        failedRecords: 0,
        tablesCreated: 0,
        relationshipsEstablished: 0
      },
      errors: [],
      warnings: [],
      checkpoints: []
    };
    
    this.logEntries = [];
  }

  async initialize() {
    console.log('🔧 Initializing migration status tracker...');
    
    // Create directories
    await fs.mkdir(path.dirname(this.options.statusFile), { recursive: true });
    await fs.mkdir(path.dirname(this.options.logFile), { recursive: true });
    await fs.mkdir(this.options.backupDir, { recursive: true });
    
    // Try to load existing status
    await this.loadStatus();
    
    console.log(`✅ Status tracker initialized (Migration ID: ${this.status.migrationId})`);
  }

  generateMigrationId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `migration-${timestamp}-${random}`;
  }

  async loadStatus() {
    try {
      const statusData = await fs.readFile(this.options.statusFile, 'utf8');
      const existingStatus = JSON.parse(statusData);
      
      // Merge with existing status if it's a valid ongoing migration
      if (existingStatus.overallStatus === 'in_progress') {
        this.status = { ...this.status, ...existingStatus };
        console.log(`📋 Loaded existing migration status: ${this.status.migrationId}`);
      }
    } catch (error) {
      // File doesn't exist or is invalid, start fresh
      if (this.options.verbose) {
        console.log('📋 Starting fresh migration status tracking');
      }
    }
  }

  async saveStatus() {
    if (!this.options.autoSave) return;
    
    try {
      await fs.writeFile(
        this.options.statusFile,
        JSON.stringify(this.status, null, 2),
        'utf8'
      );
      
      if (this.options.verbose) {
        console.log('💾 Status saved');
      }
    } catch (error) {
      console.error('❌ Failed to save status:', error.message);
    }
  }

  async saveLog() {
    try {
      await fs.writeFile(
        this.options.logFile,
        JSON.stringify(this.logEntries, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('❌ Failed to save log:', error.message);
    }
  }

  log(level, message, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      phase: this.status.currentPhase,
      migrationId: this.status.migrationId,
      ...data
    };
    
    this.logEntries.push(entry);
    
    if (this.options.verbose || level === 'error') {
      const emoji = {
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
        success: '✅'
      }[level] || 'ℹ️';
      
      console.log(`${emoji} [${level.toUpperCase()}] ${message}`);
    }
    
    // Emit event for real-time monitoring
    this.emit('log', entry);
    
    // Auto-save log periodically
    if (this.logEntries.length % 10 === 0) {
      this.saveLog();
    }
  }

  async startMigration() {
    this.status.startTime = new Date().toISOString();
    this.status.overallStatus = 'in_progress';
    this.status.currentPhase = 'extraction';
    
    this.log('info', 'Migration started', {
      migrationId: this.status.migrationId,
      startTime: this.status.startTime
    });
    
    await this.saveStatus();
    this.emit('migration-started', this.status);
  }

  async startPhase(phaseName) {
    if (!this.status.phases[phaseName]) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }
    
    this.status.currentPhase = phaseName;
    this.status.phases[phaseName].status = 'in_progress';
    this.status.phases[phaseName].startTime = new Date().toISOString();
    
    this.log('info', `Started phase: ${phaseName}`);
    
    await this.saveStatus();
    this.emit('phase-started', { phase: phaseName, status: this.status });
  }

  async completePhase(phaseName, results = {}) {
    if (!this.status.phases[phaseName]) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }
    
    this.status.phases[phaseName].status = 'completed';
    this.status.phases[phaseName].endTime = new Date().toISOString();
    this.status.phases[phaseName].progress = 100;
    this.status.phases[phaseName].results = results;
    
    this.log('success', `Completed phase: ${phaseName}`, results);
    
    await this.saveStatus();
    this.emit('phase-completed', { phase: phaseName, results, status: this.status });
  }

  async failPhase(phaseName, error) {
    if (!this.status.phases[phaseName]) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }
    
    this.status.phases[phaseName].status = 'failed';
    this.status.phases[phaseName].endTime = new Date().toISOString();
    this.status.phases[phaseName].errors.push({
      error: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack
    });
    
    this.status.errors.push({
      phase: phaseName,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    
    this.log('error', `Phase failed: ${phaseName}`, { error: error.message });
    
    await this.saveStatus();
    this.emit('phase-failed', { phase: phaseName, error, status: this.status });
  }

  async updatePhaseProgress(phaseName, progress, details = {}) {
    if (!this.status.phases[phaseName]) {
      throw new Error(`Unknown phase: ${phaseName}`);
    }
    
    this.status.phases[phaseName].progress = Math.min(100, Math.max(0, progress));
    
    if (this.options.verbose) {
      this.log('info', `Phase progress: ${phaseName} - ${progress}%`, details);
    }
    
    await this.saveStatus();
    this.emit('phase-progress', { phase: phaseName, progress, details, status: this.status });
  }

  async updateCollectionStatus(collectionName, status, details = {}) {
    if (!this.status.collections[collectionName]) {
      this.status.collections[collectionName] = {
        status: 'not_started',
        recordCount: 0,
        processedRecords: 0,
        errors: [],
        startTime: null,
        endTime: null
      };
    }
    
    this.status.collections[collectionName] = {
      ...this.status.collections[collectionName],
      status,
      ...details
    };
    
    if (status === 'in_progress' && !this.status.collections[collectionName].startTime) {
      this.status.collections[collectionName].startTime = new Date().toISOString();
    }
    
    if (status === 'completed' || status === 'failed') {
      this.status.collections[collectionName].endTime = new Date().toISOString();
    }
    
    this.log('info', `Collection ${collectionName}: ${status}`, details);
    
    await this.saveStatus();
    this.emit('collection-updated', { collection: collectionName, status, details });
  }

  async updateStatistics(updates) {
    this.status.statistics = { ...this.status.statistics, ...updates };
    
    if (this.options.verbose) {
      this.log('info', 'Statistics updated', updates);
    }
    
    await this.saveStatus();
    this.emit('statistics-updated', { statistics: this.status.statistics });
  }

  async addCheckpoint(name, data = {}) {
    const checkpoint = {
      name,
      timestamp: new Date().toISOString(),
      phase: this.status.currentPhase,
      data
    };
    
    this.status.checkpoints.push(checkpoint);
    
    this.log('info', `Checkpoint: ${name}`, data);
    
    await this.saveStatus();
    this.emit('checkpoint', checkpoint);
  }

  async completeMigration(results = {}) {
    this.status.endTime = new Date().toISOString();
    this.status.duration = new Date(this.status.endTime) - new Date(this.status.startTime);
    this.status.overallStatus = 'completed';
    this.status.currentPhase = 'completed';
    this.status.results = results;
    
    this.log('success', 'Migration completed successfully', results);
    
    await this.saveStatus();
    await this.saveLog();
    await this.generateFinalReport();
    
    this.emit('migration-completed', { status: this.status, results });
  }

  async failMigration(error) {
    this.status.endTime = new Date().toISOString();
    this.status.duration = new Date(this.status.endTime) - new Date(this.status.startTime);
    this.status.overallStatus = 'failed';
    this.status.finalError = {
      error: error.message,
      timestamp: new Date().toISOString(),
      stack: error.stack
    };
    
    this.log('error', 'Migration failed', { error: error.message });
    
    await this.saveStatus();
    await this.saveLog();
    await this.generateFinalReport();
    
    this.emit('migration-failed', { status: this.status, error });
  }

  async rollbackMigration(rollbackResults = {}) {
    this.status.overallStatus = 'rolled_back';
    this.status.currentPhase = 'rollback';
    this.status.rollbackResults = rollbackResults;
    
    this.log('info', 'Migration rolled back', rollbackResults);
    
    await this.saveStatus();
    await this.saveLog();
    await this.generateFinalReport();
    
    this.emit('migration-rolled-back', { status: this.status, rollbackResults });
  }

  async generateFinalReport() {
    const report = {
      summary: {
        migrationId: this.status.migrationId,
        status: this.status.overallStatus,
        startTime: this.status.startTime,
        endTime: this.status.endTime,
        duration: this.formatDuration(this.status.duration),
        totalErrors: this.status.errors.length,
        totalWarnings: this.status.warnings.length
      },
      phases: this.status.phases,
      collections: this.status.collections,
      statistics: this.status.statistics,
      checkpoints: this.status.checkpoints,
      errors: this.status.errors,
      warnings: this.status.warnings
    };
    
    // Save JSON report
    const reportPath = path.join(this.options.backupDir, `migration-report-${this.status.migrationId}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    // Generate markdown report
    const markdownReport = this.generateMarkdownReport(report);
    const markdownPath = path.join(this.options.backupDir, `migration-report-${this.status.migrationId}.md`);
    await fs.writeFile(markdownPath, markdownReport, 'utf8');
    
    console.log(`📄 Final report saved to: ${reportPath}`);
    console.log(`📄 Markdown report saved to: ${markdownPath}`);
    
    return report;
  }

  generateMarkdownReport(report) {
    let markdown = `# Migration Report\n\n`;
    markdown += `**Migration ID:** ${report.summary.migrationId}\n`;
    markdown += `**Status:** ${this.getStatusEmoji(report.summary.status)} ${report.summary.status.toUpperCase()}\n`;
    markdown += `**Start Time:** ${report.summary.startTime}\n`;
    markdown += `**End Time:** ${report.summary.endTime || 'N/A'}\n`;
    markdown += `**Duration:** ${report.summary.duration}\n`;
    markdown += `**Errors:** ${report.summary.totalErrors}\n`;
    markdown += `**Warnings:** ${report.summary.totalWarnings}\n\n`;
    
    // Phase Summary
    markdown += `## Phase Summary\n\n`;
    markdown += `| Phase | Status | Duration | Progress | Errors |\n`;
    markdown += `|-------|--------|----------|----------|--------|\n`;
    
    for (const [phaseName, phase] of Object.entries(report.phases)) {
      const duration = phase.startTime && phase.endTime 
        ? this.formatDuration(new Date(phase.endTime) - new Date(phase.startTime))
        : 'N/A';
      
      markdown += `| ${phaseName} | ${this.getStatusEmoji(phase.status)} ${phase.status} | ${duration} | ${phase.progress}% | ${phase.errors.length} |\n`;
    }
    
    markdown += `\n`;
    
    // Collection Summary
    if (Object.keys(report.collections).length > 0) {
      markdown += `## Collection Summary\n\n`;
      markdown += `| Collection | Status | Records | Processed | Errors |\n`;
      markdown += `|------------|--------|---------|-----------|--------|\n`;
      
      for (const [collectionName, collection] of Object.entries(report.collections)) {
        markdown += `| ${collectionName} | ${this.getStatusEmoji(collection.status)} ${collection.status} | ${collection.recordCount || 0} | ${collection.processedRecords || 0} | ${collection.errors.length} |\n`;
      }
      
      markdown += `\n`;
    }
    
    // Statistics
    markdown += `## Statistics\n\n`;
    markdown += `- **Total Records:** ${report.statistics.totalRecords}\n`;
    markdown += `- **Processed Records:** ${report.statistics.processedRecords}\n`;
    markdown += `- **Failed Records:** ${report.statistics.failedRecords}\n`;
    markdown += `- **Tables Created:** ${report.statistics.tablesCreated}\n`;
    markdown += `- **Relationships Established:** ${report.statistics.relationshipsEstablished}\n\n`;
    
    // Checkpoints
    if (report.checkpoints.length > 0) {
      markdown += `## Checkpoints\n\n`;
      for (const checkpoint of report.checkpoints) {
        markdown += `- **${checkpoint.name}** (${checkpoint.timestamp})\n`;
        if (checkpoint.data && Object.keys(checkpoint.data).length > 0) {
          markdown += `  ${JSON.stringify(checkpoint.data)}\n`;
        }
      }
      markdown += `\n`;
    }
    
    // Errors
    if (report.errors.length > 0) {
      markdown += `## Errors\n\n`;
      for (const error of report.errors) {
        markdown += `### ${error.phase} - ${error.timestamp}\n`;
        markdown += `\`\`\`\n${error.error}\n\`\`\`\n\n`;
      }
    }
    
    // Warnings
    if (report.warnings.length > 0) {
      markdown += `## Warnings\n\n`;
      for (const warning of report.warnings) {
        markdown += `- **${warning.phase || 'General'}:** ${warning.message} (${warning.timestamp})\n`;
      }
      markdown += `\n`;
    }
    
    return markdown;
  }

  getStatusEmoji(status) {
    const emojis = {
      not_started: '⏳',
      in_progress: '🔄',
      completed: '✅',
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

  getStatus() {
    return { ...this.status };
  }

  getPhaseStatus(phaseName) {
    return this.status.phases[phaseName] ? { ...this.status.phases[phaseName] } : null;
  }

  getCollectionStatus(collectionName) {
    return this.status.collections[collectionName] ? { ...this.status.collections[collectionName] } : null;
  }

  getStatistics() {
    return { ...this.status.statistics };
  }

  async printStatus() {
    console.log('\n📋 Migration Status:');
    console.log('='.repeat(60));
    console.log(`Migration ID: ${this.status.migrationId}`);
    console.log(`Overall Status: ${this.getStatusEmoji(this.status.overallStatus)} ${this.status.overallStatus.toUpperCase()}`);
    console.log(`Current Phase: ${this.status.currentPhase}`);
    console.log(`Start Time: ${this.status.startTime || 'N/A'}`);
    console.log(`Duration: ${this.formatDuration(this.status.duration)}`);
    console.log(`Errors: ${this.status.errors.length}`);
    console.log(`Warnings: ${this.status.warnings.length}`);
    
    console.log('\n📊 Phase Status:');
    for (const [phaseName, phase] of Object.entries(this.status.phases)) {
      const emoji = this.getStatusEmoji(phase.status);
      console.log(`  ${emoji} ${phaseName}: ${phase.status} (${phase.progress}%)`);
    }
    
    if (Object.keys(this.status.collections).length > 0) {
      console.log('\n📚 Collection Status:');
      for (const [collectionName, collection] of Object.entries(this.status.collections)) {
        const emoji = this.getStatusEmoji(collection.status);
        console.log(`  ${emoji} ${collectionName}: ${collection.status} (${collection.processedRecords}/${collection.recordCount})`);
      }
    }
    
    console.log('\n📈 Statistics:');
    console.log(`  Total Records: ${this.status.statistics.totalRecords}`);
    console.log(`  Processed: ${this.status.statistics.processedRecords}`);
    console.log(`  Failed: ${this.status.statistics.failedRecords}`);
    console.log(`  Tables Created: ${this.status.statistics.tablesCreated}`);
  }

  // Real-time monitoring methods
  startRealTimeMonitoring(intervalMs = 5000) {
    this.monitoringInterval = setInterval(() => {
      this.emit('status-update', this.getStatus());
    }, intervalMs);
  }

  stopRealTimeMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  // Integration methods for other migration tools
  async integrateWithVerifier(verifierResults) {
    await this.startPhase('verification');
    
    try {
      const { summary, collections } = verifierResults;
      
      // Update verification phase progress
      await this.updatePhaseProgress('verification', 50, { message: 'Processing verification results' });
      
      // Update collection statuses based on verification
      for (const [collectionName, result] of Object.entries(collections)) {
        await this.updateCollectionStatus(collectionName, result.passed ? 'verified' : 'verification_failed', {
          firestoreCount: result.firestoreCount,
          postgresCount: result.postgresCount,
          verificationErrors: result.errors
        });
      }
      
      // Update overall statistics
      await this.updateStatistics({
        verificationsPassed: summary.passedVerifications,
        verificationsFailed: summary.failedVerifications,
        verificationWarnings: summary.warnings
      });
      
      await this.updatePhaseProgress('verification', 100);
      
      if (summary.failedVerifications > 0) {
        await this.failPhase('verification', new Error(`${summary.failedVerifications} verifications failed`));
      } else {
        await this.completePhase('verification', { summary, collections });
      }
      
    } catch (error) {
      await this.failPhase('verification', error);
      throw error;
    }
  }

  async integrateWithRollback(rollbackResults) {
    await this.startPhase('rollback');
    
    try {
      const { rollbackStatus } = rollbackResults;
      
      await this.updatePhaseProgress('rollback', 50, { message: 'Processing rollback results' });
      
      // Update statistics
      await this.updateStatistics({
        tablesRolledBack: rollbackStatus.tablesProcessed,
        recordsRemoved: rollbackStatus.recordsRemoved,
        rollbackErrors: rollbackStatus.errors.length
      });
      
      await this.updatePhaseProgress('rollback', 100);
      
      if (rollbackStatus.completed) {
        await this.completePhase('rollback', rollbackResults);
        await this.rollbackMigration(rollbackResults);
      } else {
        await this.failPhase('rollback', new Error('Rollback did not complete successfully'));
      }
      
    } catch (error) {
      await this.failPhase('rollback', error);
      throw error;
    }
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--status-file':
        options.statusFile = args[++i];
        break;
      case '--log-file':
        options.logFile = args[++i];
        break;
      case '--backup-dir':
        options.backupDir = args[++i];
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--no-auto-save':
        options.autoSave = false;
        break;
      case '--print-status':
        options.printStatus = true;
        break;
      case '--generate-report':
        options.generateReport = true;
        break;
      case '--help':
        console.log(`
Migration Status Tracker

Usage: node migration-status-tracker.js [options]

Options:
  --status-file <path>      Path to status file
  --log-file <path>         Path to log file
  --backup-dir <path>       Directory for backups and reports
  --verbose                 Enable verbose logging
  --no-auto-save           Disable automatic status saving
  --print-status           Print current status and exit
  --generate-report        Generate final report and exit
  --help                   Show this help message

Examples:
  # Print current migration status
  node migration-status-tracker.js --print-status

  # Generate final report
  node migration-status-tracker.js --generate-report

  # Start with verbose logging
  node migration-status-tracker.js --verbose
`);
        process.exit(0);
        break;
    }
  }
  
  try {
    const tracker = new MigrationStatusTracker(options);
    await tracker.initialize();
    
    if (options.printStatus) {
      await tracker.printStatus();
    } else if (options.generateReport) {
      await tracker.generateFinalReport();
      console.log('✅ Report generated successfully');
    } else {
      console.log('✅ Migration status tracker initialized');
      console.log('Use --print-status to view current status or --generate-report to create a report');
    }
    
  } catch (error) {
    console.error('💥 Status tracker failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { MigrationStatusTracker };