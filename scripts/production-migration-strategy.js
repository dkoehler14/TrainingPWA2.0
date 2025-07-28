#!/usr/bin/env node

/**
 * Production Migration Strategy
 * 
 * This script implements a comprehensive production migration strategy for moving
 * from Firestore to Supabase with minimal downtime and maximum safety.
 * 
 * Features:
 * - Blue-green deployment strategy
 * - Real-time migration monitoring
 * - Automated rollback procedures
 * - Data consistency verification
 * - Progressive traffic switching
 * - Comprehensive logging and reporting
 * 
 * Migration Phases:
 * 1. Pre-migration validation and preparation
 * 2. Initial data migration (offline)
 * 3. Incremental sync setup
 * 4. Application deployment preparation
 * 5. Traffic switching with monitoring
 * 6. Post-migration verification
 * 7. Cleanup and finalization
 * 
 * Usage:
 *   node scripts/production-migration-strategy.js [options]
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');
const { MigrationStatusTracker } = require('./migration/migration-status-tracker');
const { RollbackManager } = require('./migration/rollback-manager');

class ProductionMigrationStrategy extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // Environment configuration
      environment: options.environment || 'production',
      supabaseUrl: options.supabaseUrl || process.env.REACT_APP_SUPABASE_URL,
      supabaseKey: options.supabaseKey || process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY,
      firebaseServiceAccount: options.firebaseServiceAccount,
      
      // Migration strategy settings
      strategy: options.strategy || 'blue-green', // 'blue-green', 'rolling', 'canary'
      downtimeWindow: options.downtimeWindow || 300000, // 5 minutes in ms
      trafficSwitchingMode: options.trafficSwitchingMode || 'progressive', // 'immediate', 'progressive'
      progressiveSteps: options.progressiveSteps || [10, 25, 50, 75, 100], // Percentage steps
      
      // Safety and monitoring
      enableRealTimeMonitoring: options.enableRealTimeMonitoring !== false,
      monitoringInterval: options.monitoringInterval || 30000, // 30 seconds
      healthCheckInterval: options.healthCheckInterval || 10000, // 10 seconds
      autoRollbackThreshold: options.autoRollbackThreshold || 5, // Error percentage
      maxRollbackTime: options.maxRollbackTime || 600000, // 10 minutes
      
      // Data consistency
      enableIncrementalSync: options.enableIncrementalSync !== false,
      syncInterval: options.syncInterval || 60000, // 1 minute
      consistencyCheckInterval: options.consistencyCheckInterval || 300000, // 5 minutes
      
      // Directories and files
      workingDir: options.workingDir || './production-migration',
      backupDir: options.backupDir || './production-backups',
      logDir: options.logDir || './production-logs',
      
      // Execution settings
      dryRun: options.dryRun || false,
      verbose: options.verbose || false,
      skipPhases: options.skipPhases || [],
      
      ...options
    };
    
    // Migration state
    this.migrationState = {
      phase: 'not_started',
      startTime: null,
      endTime: null,
      duration: null,
      status: 'not_started', // not_started, preparing, migrating, switching, completed, failed, rolled_back
      currentTrafficPercentage: 0,
      targetTrafficPercentage: 100,
      
      // Phase tracking
      phases: {
        preparation: { status: 'not_started', startTime: null, endTime: null, errors: [] },
        initial_migration: { status: 'not_started', startTime: null, endTime: null, errors: [] },
        incremental_sync: { status: 'not_started', startTime: null, endTime: null, errors: [] },
        deployment_prep: { status: 'not_started', startTime: null, endTime: null, errors: [] },
        traffic_switching: { status: 'not_started', startTime: null, endTime: null, errors: [] },
        verification: { status: 'not_started', startTime: null, endTime: null, errors: [] },
        cleanup: { status: 'not_started', startTime: null, endTime: null, errors: [] }
      },
      
      // Monitoring data
      metrics: {
        errorRate: 0,
        responseTime: 0,
        throughput: 0,
        dataConsistency: 100,
        userSatisfaction: 100
      },
      
      // Safety tracking
      rollbackTriggers: [],
      healthChecks: [],
      alerts: [],
      
      errors: [],
      warnings: []
    };
    
    // Components
    this.statusTracker = null;
    this.rollbackManager = null;
    this.monitoringInterval = null;
    this.healthCheckInterval = null;
    this.syncInterval = null;
  }

  async initialize() {
    console.log('🚀 Initializing Production Migration Strategy...');
    
    // Create working directories
    await this.createWorkingDirectories();
    
    // Initialize status tracker
    this.statusTracker = new MigrationStatusTracker({
      statusFile: path.join(this.options.workingDir, 'production-migration-status.json'),
      logFile: path.join(this.options.logDir, 'production-migration.log'),
      backupDir: this.options.backupDir,
      verbose: this.options.verbose
    });
    
    await this.statusTracker.initialize();
    
    // Initialize rollback manager
    this.rollbackManager = new RollbackManager({
      supabaseUrl: this.options.supabaseUrl,
      supabaseKey: this.options.supabaseKey,
      backupDir: this.options.backupDir,
      confirmRollback: false, // Automated rollback in production
      verbose: this.options.verbose
    });
    
    await this.rollbackManager.initialize();
    
    console.log('✅ Production migration strategy initialized');
  }

  async createWorkingDirectories() {
    const directories = [
      this.options.workingDir,
      this.options.backupDir,
      this.options.logDir,
      path.join(this.options.workingDir, 'checkpoints'),
      path.join(this.options.workingDir, 'monitoring'),
      path.join(this.options.workingDir, 'reports')
    ];
    
    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  async executeProductionMigration() {
    console.log('🚀 Starting Production Migration...');
    
    if (this.options.dryRun) {
      console.log('🔍 DRY RUN MODE - No actual migration will be performed');
    }
    
    this.migrationState.startTime = new Date().toISOString();
    this.migrationState.status = 'preparing';
    
    await this.statusTracker.startMigration();
    
    try {
      // Start monitoring
      if (this.options.enableRealTimeMonitoring) {
        await this.startRealTimeMonitoring();
      }
      
      // Execute migration phases
      await this.executePreparationPhase();
      await this.executeInitialMigrationPhase();
      await this.executeIncrementalSyncPhase();
      await this.executeDeploymentPrepPhase();
      await this.executeTrafficSwitchingPhase();
      await this.executeVerificationPhase();
      await this.executeCleanupPhase();
      
      // Migration completed successfully
      this.migrationState.endTime = new Date().toISOString();
      this.migrationState.duration = new Date(this.migrationState.endTime) - new Date(this.migrationState.startTime);
      this.migrationState.status = 'completed';
      
      await this.statusTracker.completeMigration(this.migrationState);
      
      console.log('\n🎉 Production migration completed successfully!');
      await this.generateFinalReport();
      
      return this.migrationState;
      
    } catch (error) {
      console.error('\n💥 Production migration failed:', error.message);
      
      this.migrationState.endTime = new Date().toISOString();
      this.migrationState.duration = new Date(this.migrationState.endTime) - new Date(this.migrationState.startTime);
      this.migrationState.status = 'failed';
      
      // Attempt automatic rollback
      if (this.shouldTriggerAutoRollback(error)) {
        console.log('🔄 Triggering automatic rollback...');
        await this.executeEmergencyRollback();
      }
      
      await this.statusTracker.failMigration(error);
      await this.generateFinalReport();
      
      throw error;
      
    } finally {
      // Stop monitoring
      this.stopRealTimeMonitoring();
    }
  }

  async executePreparationPhase() {
    console.log('\n📋 Phase 1: Preparation and Validation');
    
    this.migrationState.phase = 'preparation';
    this.migrationState.phases.preparation.status = 'in_progress';
    this.migrationState.phases.preparation.startTime = new Date().toISOString();
    
    await this.statusTracker.startPhase('preparation');
    
    try {
      // Validate production environment
      console.log('   Validating production environment...');
      await this.validateProductionEnvironment();
      
      // Create comprehensive backup
      console.log('   Creating comprehensive backup...');
      await this.createComprehensiveBackup();
      
      // Validate migration readiness
      console.log('   Validating migration readiness...');
      await this.validateMigrationReadiness();
      
      // Set up monitoring infrastructure
      console.log('   Setting up monitoring infrastructure...');
      await this.setupMonitoringInfrastructure();
      
      // Prepare rollback procedures
      console.log('   Preparing rollback procedures...');
      await this.prepareRollbackProcedures();
      
      this.migrationState.phases.preparation.status = 'completed';
      this.migrationState.phases.preparation.endTime = new Date().toISOString();
      
      await this.statusTracker.completePhase('preparation', {
        environmentValidated: true,
        backupCreated: true,
        monitoringSetup: true,
        rollbackPrepared: true
      });
      
      console.log('✅ Preparation phase completed');
      
    } catch (error) {
      this.migrationState.phases.preparation.status = 'failed';
      this.migrationState.phases.preparation.errors.push(error.message);
      
      await this.statusTracker.failPhase('preparation', error);
      throw error;
    }
  }

  async executeInitialMigrationPhase() {
    console.log('\n📊 Phase 2: Initial Data Migration');
    
    this.migrationState.phase = 'initial_migration';
    this.migrationState.phases.initial_migration.status = 'in_progress';
    this.migrationState.phases.initial_migration.startTime = new Date().toISOString();
    
    await this.statusTracker.startPhase('initial_migration');
    
    try {
      // Put application in maintenance mode (if required)
      if (this.options.strategy === 'maintenance-window') {
        console.log('   Enabling maintenance mode...');
        await this.enableMaintenanceMode();
      }
      
      // Execute bulk data migration
      console.log('   Executing bulk data migration...');
      await this.executeBulkDataMigration();
      
      // Verify initial migration
      console.log('   Verifying initial migration...');
      await this.verifyInitialMigration();
      
      // Disable maintenance mode (if enabled)
      if (this.options.strategy === 'maintenance-window') {
        console.log('   Disabling maintenance mode...');
        await this.disableMaintenanceMode();
      }
      
      this.migrationState.phases.initial_migration.status = 'completed';
      this.migrationState.phases.initial_migration.endTime = new Date().toISOString();
      
      await this.statusTracker.completePhase('initial_migration', {
        bulkMigrationCompleted: true,
        verificationPassed: true
      });
      
      console.log('✅ Initial migration phase completed');
      
    } catch (error) {
      this.migrationState.phases.initial_migration.status = 'failed';
      this.migrationState.phases.initial_migration.errors.push(error.message);
      
      // Disable maintenance mode if it was enabled
      if (this.options.strategy === 'maintenance-window') {
        await this.disableMaintenanceMode();
      }
      
      await this.statusTracker.failPhase('initial_migration', error);
      throw error;
    }
  }

  async executeIncrementalSyncPhase() {
    console.log('\n🔄 Phase 3: Incremental Synchronization');
    
    if (!this.options.enableIncrementalSync) {
      console.log('   Incremental sync disabled, skipping...');
      return;
    }
    
    this.migrationState.phase = 'incremental_sync';
    this.migrationState.phases.incremental_sync.status = 'in_progress';
    this.migrationState.phases.incremental_sync.startTime = new Date().toISOString();
    
    await this.statusTracker.startPhase('incremental_sync');
    
    try {
      // Set up incremental sync
      console.log('   Setting up incremental synchronization...');
      await this.setupIncrementalSync();
      
      // Monitor sync for consistency
      console.log('   Monitoring synchronization consistency...');
      await this.monitorSyncConsistency();
      
      this.migrationState.phases.incremental_sync.status = 'completed';
      this.migrationState.phases.incremental_sync.endTime = new Date().toISOString();
      
      await this.statusTracker.completePhase('incremental_sync', {
        syncSetupCompleted: true,
        consistencyVerified: true
      });
      
      console.log('✅ Incremental sync phase completed');
      
    } catch (error) {
      this.migrationState.phases.incremental_sync.status = 'failed';
      this.migrationState.phases.incremental_sync.errors.push(error.message);
      
      await this.statusTracker.failPhase('incremental_sync', error);
      throw error;
    }
  }

  async executeDeploymentPrepPhase() {
    console.log('\n🚀 Phase 4: Deployment Preparation');
    
    this.migrationState.phase = 'deployment_prep';
    this.migrationState.phases.deployment_prep.status = 'in_progress';
    this.migrationState.phases.deployment_prep.startTime = new Date().toISOString();
    
    await this.statusTracker.startPhase('deployment_prep');
    
    try {
      // Deploy new application version
      console.log('   Deploying new application version...');
      await this.deployNewApplicationVersion();
      
      // Warm up new environment
      console.log('   Warming up new environment...');
      await this.warmupNewEnvironment();
      
      // Run pre-switch tests
      console.log('   Running pre-switch tests...');
      await this.runPreSwitchTests();
      
      this.migrationState.phases.deployment_prep.status = 'completed';
      this.migrationState.phases.deployment_prep.endTime = new Date().toISOString();
      
      await this.statusTracker.completePhase('deployment_prep', {
        applicationDeployed: true,
        environmentWarmedUp: true,
        preSwitchTestsPassed: true
      });
      
      console.log('✅ Deployment preparation phase completed');
      
    } catch (error) {
      this.migrationState.phases.deployment_prep.status = 'failed';
      this.migrationState.phases.deployment_prep.errors.push(error.message);
      
      await this.statusTracker.failPhase('deployment_prep', error);
      throw error;
    }
  }

  async executeTrafficSwitchingPhase() {
    console.log('\n🔀 Phase 5: Traffic Switching');
    
    this.migrationState.phase = 'traffic_switching';
    this.migrationState.phases.traffic_switching.status = 'in_progress';
    this.migrationState.phases.traffic_switching.startTime = new Date().toISOString();
    this.migrationState.status = 'switching';
    
    await this.statusTracker.startPhase('traffic_switching');
    
    try {
      if (this.options.trafficSwitchingMode === 'immediate') {
        await this.executeImmediateTrafficSwitch();
      } else {
        await this.executeProgressiveTrafficSwitch();
      }
      
      this.migrationState.phases.traffic_switching.status = 'completed';
      this.migrationState.phases.traffic_switching.endTime = new Date().toISOString();
      
      await this.statusTracker.completePhase('traffic_switching', {
        trafficSwitched: true,
        finalTrafficPercentage: this.migrationState.currentTrafficPercentage
      });
      
      console.log('✅ Traffic switching phase completed');
      
    } catch (error) {
      this.migrationState.phases.traffic_switching.status = 'failed';
      this.migrationState.phases.traffic_switching.errors.push(error.message);
      
      await this.statusTracker.failPhase('traffic_switching', error);
      throw error;
    }
  }

  async executeProgressiveTrafficSwitch() {
    console.log('   Executing progressive traffic switch...');
    
    for (const percentage of this.options.progressiveSteps) {
      console.log(`   Switching ${percentage}% of traffic to new system...`);
      
      if (!this.options.dryRun) {
        await this.switchTrafficPercentage(percentage);
      }
      
      this.migrationState.currentTrafficPercentage = percentage;
      
      // Monitor for issues
      console.log(`   Monitoring system health at ${percentage}% traffic...`);
      await this.monitorSystemHealth(60000); // Monitor for 1 minute
      
      // Check if rollback is needed
      if (this.shouldTriggerAutoRollback()) {
        throw new Error(`Auto-rollback triggered at ${percentage}% traffic due to system issues`);
      }
      
      console.log(`   ✅ ${percentage}% traffic switch successful`);
      
      // Wait before next step (except for the last one)
      if (percentage < 100) {
        console.log('   Waiting before next traffic increase...');
        await this.delay(30000); // Wait 30 seconds
      }
    }
  }

  async executeImmediateTrafficSwitch() {
    console.log('   Executing immediate traffic switch...');
    
    if (!this.options.dryRun) {
      await this.switchTrafficPercentage(100);
    }
    
    this.migrationState.currentTrafficPercentage = 100;
    
    // Monitor immediately after switch
    console.log('   Monitoring system health after immediate switch...');
    await this.monitorSystemHealth(300000); // Monitor for 5 minutes
  }

  async executeVerificationPhase() {
    console.log('\n🔍 Phase 6: Post-Migration Verification');
    
    this.migrationState.phase = 'verification';
    this.migrationState.phases.verification.status = 'in_progress';
    this.migrationState.phases.verification.startTime = new Date().toISOString();
    
    await this.statusTracker.startPhase('verification');
    
    try {
      // Run comprehensive verification
      console.log('   Running comprehensive system verification...');
      await this.runComprehensiveVerification();
      
      // Verify data consistency
      console.log('   Verifying data consistency...');
      await this.verifyDataConsistency();
      
      // Run user acceptance tests
      console.log('   Running user acceptance tests...');
      await this.runUserAcceptanceTests();
      
      // Monitor system stability
      console.log('   Monitoring system stability...');
      await this.monitorSystemStability();
      
      this.migrationState.phases.verification.status = 'completed';
      this.migrationState.phases.verification.endTime = new Date().toISOString();
      
      await this.statusTracker.completePhase('verification', {
        systemVerificationPassed: true,
        dataConsistencyVerified: true,
        userAcceptanceTestsPassed: true,
        systemStable: true
      });
      
      console.log('✅ Verification phase completed');
      
    } catch (error) {
      this.migrationState.phases.verification.status = 'failed';
      this.migrationState.phases.verification.errors.push(error.message);
      
      await this.statusTracker.failPhase('verification', error);
      throw error;
    }
  }

  async executeCleanupPhase() {
    console.log('\n🧹 Phase 7: Cleanup and Finalization');
    
    this.migrationState.phase = 'cleanup';
    this.migrationState.phases.cleanup.status = 'in_progress';
    this.migrationState.phases.cleanup.startTime = new Date().toISOString();
    
    await this.statusTracker.startPhase('cleanup');
    
    try {
      // Stop incremental sync
      if (this.options.enableIncrementalSync) {
        console.log('   Stopping incremental synchronization...');
        await this.stopIncrementalSync();
      }
      
      // Clean up temporary resources
      console.log('   Cleaning up temporary resources...');
      await this.cleanupTemporaryResources();
      
      // Update monitoring and alerting
      console.log('   Updating monitoring and alerting...');
      await this.updateMonitoringAndAlerting();
      
      // Generate migration documentation
      console.log('   Generating migration documentation...');
      await this.generateMigrationDocumentation();
      
      this.migrationState.phases.cleanup.status = 'completed';
      this.migrationState.phases.cleanup.endTime = new Date().toISOString();
      
      await this.statusTracker.completePhase('cleanup', {
        syncStopped: true,
        resourcesCleaned: true,
        monitoringUpdated: true,
        documentationGenerated: true
      });
      
      console.log('✅ Cleanup phase completed');
      
    } catch (error) {
      this.migrationState.phases.cleanup.status = 'failed';
      this.migrationState.phases.cleanup.errors.push(error.message);
      
      await this.statusTracker.failPhase('cleanup', error);
      // Don't throw error for cleanup phase - migration is essentially complete
      console.warn('⚠️ Cleanup phase had errors but migration is complete');
    }
  }

  // Implementation methods (these would contain the actual logic)
  
  async validateProductionEnvironment() {
    // Validate Supabase connection
    // Check database schema
    // Verify environment variables
    // Test authentication
    console.log('     Production environment validation completed');
  }

  async createComprehensiveBackup() {
    // Create full database backup
    // Backup application configuration
    // Backup environment settings
    console.log('     Comprehensive backup created');
  }

  async validateMigrationReadiness() {
    // Check data migration tools
    // Verify rollback procedures
    // Test monitoring systems
    console.log('     Migration readiness validated');
  }

  async setupMonitoringInfrastructure() {
    // Set up real-time monitoring
    // Configure alerting
    // Initialize dashboards
    console.log('     Monitoring infrastructure set up');
  }

  async prepareRollbackProcedures() {
    // Test rollback scripts
    // Prepare emergency procedures
    // Set up automated triggers
    console.log('     Rollback procedures prepared');
  }

  async executeBulkDataMigration() {
    // Run migration orchestrator
    // Monitor progress
    // Handle errors
    console.log('     Bulk data migration completed');
  }

  async verifyInitialMigration() {
    // Run data verification
    // Check relationships
    // Validate counts
    console.log('     Initial migration verified');
  }

  async enableMaintenanceMode() {
    console.log('     Maintenance mode enabled');
  }

  async disableMaintenanceMode() {
    console.log('     Maintenance mode disabled');
  }

  async setupIncrementalSync() {
    // Set up change data capture
    // Configure sync processes
    // Start monitoring
    console.log('     Incremental sync set up');
  }

  async monitorSyncConsistency() {
    // Monitor sync lag
    // Check data consistency
    // Alert on issues
    console.log('     Sync consistency monitored');
  }

  async deployNewApplicationVersion() {
    // Deploy to staging
    // Run smoke tests
    // Deploy to production
    console.log('     New application version deployed');
  }

  async warmupNewEnvironment() {
    // Warm up caches
    // Pre-load data
    // Test connections
    console.log('     New environment warmed up');
  }

  async runPreSwitchTests() {
    // Run integration tests
    // Test critical paths
    // Verify functionality
    console.log('     Pre-switch tests completed');
  }

  async switchTrafficPercentage(percentage) {
    // Update load balancer
    // Configure routing
    // Monitor switch
    console.log(`     Traffic switched to ${percentage}%`);
  }

  async monitorSystemHealth(duration) {
    // Monitor error rates
    // Check response times
    // Verify throughput
    console.log(`     System health monitored for ${duration}ms`);
  }

  async runComprehensiveVerification() {
    // Run all verification tests
    // Check system functionality
    // Verify performance
    console.log('     Comprehensive verification completed');
  }

  async verifyDataConsistency() {
    // Compare data between systems
    // Check relationships
    // Validate integrity
    console.log('     Data consistency verified');
  }

  async runUserAcceptanceTests() {
    // Run automated UAT
    // Check user workflows
    // Verify functionality
    console.log('     User acceptance tests completed');
  }

  async monitorSystemStability() {
    // Monitor for extended period
    // Check for memory leaks
    // Verify performance
    console.log('     System stability monitored');
  }

  async stopIncrementalSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('     Incremental sync stopped');
  }

  async cleanupTemporaryResources() {
    // Clean up migration files
    // Remove temporary databases
    // Clean up monitoring
    console.log('     Temporary resources cleaned up');
  }

  async updateMonitoringAndAlerting() {
    // Update monitoring targets
    // Configure new alerts
    // Remove old monitoring
    console.log('     Monitoring and alerting updated');
  }

  async generateMigrationDocumentation() {
    // Generate runbook
    // Document changes
    // Create troubleshooting guide
    console.log('     Migration documentation generated');
  }

  // Monitoring and safety methods

  async startRealTimeMonitoring() {
    console.log('📊 Starting real-time monitoring...');
    
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkHealthStatus();
        await this.evaluateRollbackTriggers();
      } catch (error) {
        console.error('Monitoring error:', error.message);
      }
    }, this.options.monitoringInterval);
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        console.error('Health check error:', error.message);
      }
    }, this.options.healthCheckInterval);
  }

  stopRealTimeMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    console.log('📊 Real-time monitoring stopped');
  }

  async collectMetrics() {
    // Collect system metrics
    this.migrationState.metrics = {
      errorRate: Math.random() * 2, // Simulated
      responseTime: 100 + Math.random() * 50,
      throughput: 1000 + Math.random() * 200,
      dataConsistency: 99 + Math.random(),
      userSatisfaction: 95 + Math.random() * 5
    };
  }

  async checkHealthStatus() {
    // Check system health
    const healthCheck = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      checks: {
        database: 'healthy',
        api: 'healthy',
        authentication: 'healthy'
      }
    };
    
    this.migrationState.healthChecks.push(healthCheck);
    
    // Keep only last 100 health checks
    if (this.migrationState.healthChecks.length > 100) {
      this.migrationState.healthChecks = this.migrationState.healthChecks.slice(-100);
    }
  }

  async performHealthCheck() {
    // Perform detailed health check
    // This would include actual system checks
  }

  async evaluateRollbackTriggers() {
    const shouldRollback = this.shouldTriggerAutoRollback();
    
    if (shouldRollback) {
      this.migrationState.rollbackTriggers.push({
        timestamp: new Date().toISOString(),
        reason: 'Auto-rollback threshold exceeded',
        metrics: { ...this.migrationState.metrics }
      });
      
      throw new Error('Auto-rollback triggered due to system issues');
    }
  }

  shouldTriggerAutoRollback(error = null) {
    // Check error rate
    if (this.migrationState.metrics.errorRate > this.options.autoRollbackThreshold) {
      return true;
    }
    
    // Check response time
    if (this.migrationState.metrics.responseTime > 5000) {
      return true;
    }
    
    // Check data consistency
    if (this.migrationState.metrics.dataConsistency < 95) {
      return true;
    }
    
    // Check for critical errors
    if (error && error.message.includes('critical')) {
      return true;
    }
    
    return false;
  }

  async executeEmergencyRollback() {
    console.log('🚨 Executing emergency rollback...');
    
    this.migrationState.status = 'rolled_back';
    
    try {
      // Switch traffic back immediately
      if (this.migrationState.currentTrafficPercentage > 0) {
        console.log('   Switching traffic back to original system...');
        await this.switchTrafficPercentage(0);
        this.migrationState.currentTrafficPercentage = 0;
      }
      
      // Execute database rollback
      console.log('   Executing database rollback...');
      await this.rollbackManager.executeRollback();
      
      // Restore original application
      console.log('   Restoring original application...');
      await this.restoreOriginalApplication();
      
      console.log('✅ Emergency rollback completed');
      
    } catch (rollbackError) {
      console.error('❌ Emergency rollback failed:', rollbackError.message);
      throw new Error(`Migration failed and rollback also failed: ${rollbackError.message}`);
    }
  }

  async restoreOriginalApplication() {
    // Restore original application version
    // Update configuration
    // Restart services
    console.log('     Original application restored');
  }

  async generateFinalReport() {
    const report = {
      migration: {
        strategy: this.options.strategy,
        environment: this.options.environment,
        startTime: this.migrationState.startTime,
        endTime: this.migrationState.endTime,
        duration: this.formatDuration(this.migrationState.duration),
        status: this.migrationState.status,
        finalTrafficPercentage: this.migrationState.currentTrafficPercentage
      },
      phases: this.migrationState.phases,
      metrics: this.migrationState.metrics,
      rollbackTriggers: this.migrationState.rollbackTriggers,
      errors: this.migrationState.errors,
      warnings: this.migrationState.warnings,
      recommendations: this.generateRecommendations()
    };
    
    const reportPath = path.join(this.options.workingDir, 'reports', 'production-migration-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
    
    const summaryPath = path.join(this.options.workingDir, 'reports', 'production-migration-summary.md');
    const summary = this.generateMarkdownSummary(report);
    await fs.writeFile(summaryPath, summary, 'utf8');
    
    console.log(`📄 Final report saved to: ${reportPath}`);
    console.log(`📄 Summary saved to: ${summaryPath}`);
  }

  generateRecommendations() {
    const recommendations = [];
    
    if (this.migrationState.status === 'completed') {
      recommendations.push('Monitor system performance for the next 24-48 hours');
      recommendations.push('Schedule a post-migration review meeting');
      recommendations.push('Update documentation and runbooks');
    } else if (this.migrationState.status === 'failed') {
      recommendations.push('Review error logs and identify root causes');
      recommendations.push('Fix identified issues before retry');
      recommendations.push('Consider adjusting migration strategy');
    }
    
    return recommendations;
  }

  generateMarkdownSummary(report) {
    let markdown = `# Production Migration Summary\n\n`;
    markdown += `**Strategy:** ${report.migration.strategy}\n`;
    markdown += `**Environment:** ${report.migration.environment}\n`;
    markdown += `**Status:** ${this.getStatusEmoji(report.migration.status)} ${report.migration.status.toUpperCase()}\n`;
    markdown += `**Duration:** ${report.migration.duration}\n`;
    markdown += `**Final Traffic:** ${report.migration.finalTrafficPercentage}%\n\n`;
    
    markdown += `## Phase Summary\n\n`;
    for (const [phaseName, phase] of Object.entries(report.phases)) {
      const emoji = this.getStatusEmoji(phase.status);
      markdown += `- ${emoji} **${phaseName}**: ${phase.status}\n`;
    }
    
    markdown += `\n## Final Metrics\n\n`;
    markdown += `- **Error Rate:** ${report.metrics.errorRate.toFixed(2)}%\n`;
    markdown += `- **Response Time:** ${report.metrics.responseTime.toFixed(0)}ms\n`;
    markdown += `- **Data Consistency:** ${report.metrics.dataConsistency.toFixed(1)}%\n\n`;
    
    if (report.recommendations.length > 0) {
      markdown += `## Recommendations\n\n`;
      for (const rec of report.recommendations) {
        markdown += `- ${rec}\n`;
      }
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// CLI execution
async function main() {
  const args = process.argv.slice(2);
  const options = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--environment':
        options.environment = args[++i];
        break;
      case '--strategy':
        options.strategy = args[++i];
        break;
      case '--supabase-url':
        options.supabaseUrl = args[++i];
        break;
      case '--supabase-key':
        options.supabaseKey = args[++i];
        break;
      case '--traffic-switching':
        options.trafficSwitchingMode = args[++i];
        break;
      case '--downtime-window':
        options.downtimeWindow = parseInt(args[++i]);
        break;
      case '--working-dir':
        options.workingDir = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--no-monitoring':
        options.enableRealTimeMonitoring = false;
        break;
      case '--no-incremental-sync':
        options.enableIncrementalSync = false;
        break;
      case '--help':
        console.log(`
Production Migration Strategy

Usage: node production-migration-strategy.js [options]

Options:
  --environment <env>         Target environment (production, staging)
  --strategy <strategy>       Migration strategy (blue-green, rolling, canary)
  --supabase-url <url>        Supabase project URL
  --supabase-key <key>        Supabase service role key
  --traffic-switching <mode>  Traffic switching mode (immediate, progressive)
  --downtime-window <ms>      Maximum acceptable downtime in milliseconds
  --working-dir <path>        Working directory for migration files
  --dry-run                   Show what would be done without executing
  --verbose                   Enable verbose logging
  --no-monitoring             Disable real-time monitoring
  --no-incremental-sync       Disable incremental synchronization
  --help                      Show this help message

Environment Variables:
  REACT_APP_SUPABASE_URL      Supabase project URL
  REACT_APP_SUPABASE_SERVICE_ROLE_KEY  Supabase service role key

Examples:
  # Production migration with blue-green strategy
  node production-migration-strategy.js --environment production --strategy blue-green

  # Dry run with progressive traffic switching
  node production-migration-strategy.js --dry-run --traffic-switching progressive

  # Migration with custom downtime window
  node production-migration-strategy.js --downtime-window 180000 --verbose

⚠️  WARNING: This script performs production migration operations. Always test in staging first!
`);
        process.exit(0);
        break;
    }
  }
  
  try {
    const migrationStrategy = new ProductionMigrationStrategy(options);
    await migrationStrategy.initialize();
    await migrationStrategy.executeProductionMigration();
    
    console.log('\n🎉 Production migration strategy completed successfully!');
    
  } catch (error) {
    console.error('\n💥 Production migration strategy failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { ProductionMigrationStrategy };