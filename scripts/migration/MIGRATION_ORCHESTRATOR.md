# Migration Orchestrator

The Migration Orchestrator is the main entry point for the complete Firestore to Supabase migration process. It coordinates all migration tools and provides a unified workflow with comprehensive error handling, monitoring, and recovery capabilities.

## Overview

The Migration Orchestrator serves as the central coordination system that:

- **Orchestrates the entire migration pipeline** from start to finish
- **Integrates all migration tools** into a unified workflow
- **Provides comprehensive error handling** and recovery procedures
- **Offers real-time monitoring** and progress tracking
- **Enables flexible execution** with various modes and options
- **Ensures data integrity** through automated verification and rollback

## Migration Pipeline

The orchestrator executes the migration in six distinct phases:

### 1. Pre-validation Phase
- Validates database connections (Firestore and Supabase)
- Checks migration prerequisites and system requirements
- Validates configuration and required parameters
- Ensures sufficient disk space and permissions

### 2. Extraction Phase
- Extracts all data from Firestore collections
- Handles large datasets with batching and progress tracking
- Implements data validation during extraction
- Creates extraction reports and statistics

### 3. Transformation Phase
- Transforms Firestore documents to PostgreSQL-compatible format
- Handles data type conversions and relationship mapping
- Performs data cleaning and normalization
- Resolves foreign key relationships

### 4. Import Phase
- Imports transformed data into PostgreSQL/Supabase
- Uses batch processing with transaction management
- Establishes foreign key relationships
- Provides progress tracking and error recovery

### 5. Verification Phase
- Runs comprehensive data integrity verification
- Compares Firestore and PostgreSQL data
- Validates relationships and constraints
- Performs optional performance testing

### 6. Post-migration Phase
- Cleans up temporary files
- Generates comprehensive migration reports
- Updates application configuration (if needed)
- Provides final status and next steps

## Key Features

### 🚀 Complete Migration Pipeline
- **Unified workflow** - Single command executes entire migration
- **Phase coordination** - Proper sequencing with dependency management
- **Progress tracking** - Real-time updates on migration status
- **Comprehensive logging** - Detailed logs for all operations

### 🔧 Error Handling & Recovery
- **Automatic rollback** - Rolls back on verification failures
- **Phase-specific recovery** - Tailored error handling for each phase
- **Emergency procedures** - Emergency stop and rollback capabilities
- **Resume capability** - Continue from last successful checkpoint

### 📊 Monitoring & Reporting
- **Real-time status** - Live progress updates and phase tracking
- **Comprehensive reports** - Detailed JSON and markdown reports
- **Executive summaries** - High-level status for stakeholders
- **Statistics tracking** - Records processed, errors, warnings, performance metrics

### ⚙️ Flexibility & Configuration
- **Multiple migration modes** - Full, incremental, and test modes
- **Configurable verification** - Basic, standard, or comprehensive verification
- **Skip phases** - Skip specific phases for debugging or testing
- **Dry-run mode** - Test the entire process without making changes

### 🛡️ Safety Features
- **Pre-migration validation** - Comprehensive checks before starting
- **Checkpoint system** - Save state at each phase completion
- **Automatic backups** - Create backups before destructive operations
- **Rollback verification** - Verify rollback operations completed successfully

## Usage

### Basic Usage

```bash
# Full migration with comprehensive verification
node scripts/migration/migration-orchestrator.js --migration-mode full --verification-level comprehensive
```

### Common Options

```bash
# Test migration with dry run
node scripts/migration/migration-orchestrator.js \
  --migration-mode test \
  --dry-run \
  --verbose

# Resume from checkpoint
node scripts/migration/migration-orchestrator.js \
  --resume \
  --checkpoint-file ./my-checkpoint.json

# Skip verification phase (for debugging)
node scripts/migration/migration-orchestrator.js \
  --skip-phases verification \
  --no-auto-verification

# Custom batch size and working directory
node scripts/migration/migration-orchestrator.js \
  --batch-size 50 \
  --working-dir ./custom-migration-workspace
```

### Emergency Procedures

```bash
# Emergency stop current migration
node scripts/migration/migration-orchestrator.js --emergency-stop

# Emergency rollback
node scripts/migration/migration-orchestrator.js --emergency-rollback
```

## Command Line Options

### Database Configuration
- `--supabase-url <url>` - Supabase project URL
- `--supabase-key <key>` - Supabase service role key
- `--firebase-service-account <path>` - Path to Firebase service account JSON

### Migration Settings
- `--migration-mode <mode>` - Migration mode: `full`, `incremental`, `test`
- `--batch-size <number>` - Batch size for processing (default: 100)
- `--working-dir <path>` - Working directory for migration files

### Verification Settings
- `--verification-level <level>` - Verification level: `basic`, `standard`, `comprehensive`
- `--no-auto-verification` - Disable automatic verification
- `--no-auto-rollback` - Disable automatic rollback on failure

### Execution Control
- `--resume` - Resume from last checkpoint
- `--checkpoint-file <path>` - Path to checkpoint file
- `--skip-phases <phases>` - Comma-separated list of phases to skip
- `--dry-run` - Show what would be done without executing
- `--verbose` - Enable verbose logging

### Emergency Options
- `--emergency-stop` - Emergency stop current migration
- `--emergency-rollback` - Emergency rollback current migration

## Migration Modes

### Full Migration
- **Purpose**: Complete migration of all data from Firestore to Supabase
- **Use case**: Initial migration or complete data refresh
- **Features**: Migrates all collections, establishes all relationships
- **Duration**: Longest execution time, most comprehensive

```bash
node scripts/migration/migration-orchestrator.js --migration-mode full
```

### Incremental Migration
- **Purpose**: Migrate only new or changed data since last migration
- **Use case**: Regular updates or sync operations
- **Features**: Delta detection, faster execution
- **Duration**: Shorter execution time, focused on changes

```bash
node scripts/migration/migration-orchestrator.js --migration-mode incremental
```

### Test Migration
- **Purpose**: Test migration process with sample data
- **Use case**: Development, testing, validation
- **Features**: Limited data set, safe for testing
- **Duration**: Fastest execution, minimal data

```bash
node scripts/migration/migration-orchestrator.js --migration-mode test
```

## Verification Levels

### Basic Verification
- **Scope**: Count comparisons and basic data validation
- **Sample size**: 10 records per collection
- **Performance testing**: Disabled
- **Use case**: Quick validation, development testing
- **Duration**: Fastest verification

### Standard Verification
- **Scope**: Count comparisons, sample data verification, relationship checks
- **Sample size**: 100 records per collection
- **Performance testing**: Basic performance checks
- **Use case**: Regular migrations, balanced thoroughness
- **Duration**: Moderate verification time

### Comprehensive Verification
- **Scope**: Full data validation, extensive relationship checks, performance testing
- **Sample size**: 200+ records per collection
- **Performance testing**: Full performance benchmarking
- **Use case**: Production migrations, critical data
- **Duration**: Longest verification time, most thorough

## Integration with Migration Tools

The orchestrator integrates with all existing migration tools:

### MigrationStatusTracker
- **Purpose**: Real-time progress tracking and status persistence
- **Integration**: Automatic status updates throughout migration
- **Features**: Phase tracking, checkpoint management, comprehensive logging

### MigrationVerificationSuite
- **Purpose**: Post-migration verification and rollback management
- **Integration**: Automatic verification after import phase
- **Features**: Data integrity checks, automated rollback, detailed reporting

### FirestoreExtractor
- **Purpose**: Data extraction from Firestore collections
- **Integration**: Extraction phase execution
- **Features**: Batch processing, progress tracking, data validation

### DataTransformer
- **Purpose**: Data transformation for PostgreSQL compatibility
- **Integration**: Transformation phase execution
- **Features**: Schema mapping, data type conversion, relationship resolution

### PostgresImporter
- **Purpose**: Data import into PostgreSQL/Supabase
- **Integration**: Import phase execution
- **Features**: Batch import, transaction management, foreign key resolution

## Output Files and Reports

### Working Directory Structure
```
migration-workspace/
├── migration-status.json          # Real-time migration status
├── migration-log.json             # Detailed operation log
├── migration-checkpoint.json      # Checkpoint for resume capability
├── final-migration-report.json    # Comprehensive migration report
├── migration-executive-summary.md # Executive summary
└── verification-results/          # Verification reports and data
```

### Report Types

#### Final Migration Report (`final-migration-report.json`)
- Complete migration details and statistics
- Phase-by-phase results and timing
- Error and warning details
- Configuration and settings used

#### Executive Summary (`migration-executive-summary.md`)
- High-level migration status and results
- Key metrics and statistics
- Status-specific recommendations
- Next steps and action items

#### Status File (`migration-status.json`)
- Real-time migration progress
- Current phase and completion percentage
- Live error and warning tracking
- Statistics and performance metrics

#### Log File (`migration-log.json`)
- Detailed operation logging
- Timestamped entries for all activities
- Error details and stack traces
- Performance and timing information

## Error Handling and Recovery

### Phase-Specific Error Handling

#### Pre-validation Errors
- **Common issues**: Connection failures, missing credentials, insufficient permissions
- **Recovery**: Fix configuration and retry
- **Impact**: No data changes, safe to retry immediately

#### Extraction Errors
- **Common issues**: Firestore connection issues, permission problems, data corruption
- **Recovery**: Fix Firestore connection, check permissions, retry extraction
- **Impact**: No data changes in target database

#### Transformation Errors
- **Common issues**: Data format issues, schema mismatches, transformation logic errors
- **Recovery**: Fix transformation rules, clean data, retry transformation
- **Impact**: No data changes in target database

#### Import Errors
- **Common issues**: PostgreSQL connection issues, constraint violations, transaction failures
- **Recovery**: Automatic rollback initiated, fix issues and retry
- **Impact**: Potential partial data in target database, rollback recommended

#### Verification Errors
- **Common issues**: Data integrity failures, count mismatches, relationship violations
- **Recovery**: Automatic rollback may be initiated based on configuration
- **Impact**: Data imported but verification failed, rollback available

### Checkpoint and Resume System

The orchestrator saves checkpoints after each successful phase:

```json
{
  "migrationId": "migration-2024-01-15T10-30-00-123Z-abc123",
  "lastCompletedPhase": "transformation",
  "timestamp": "2024-01-15T10:35:00.000Z",
  "migrationState": {
    "currentPhase": "transformation",
    "overallStatus": "in_progress",
    "results": {
      "pre_validation": { "connectionsValid": true },
      "extraction": { "totalRecords": 1000 },
      "transformation": { "transformedRecords": 995 }
    }
  }
}
```

To resume from a checkpoint:
```bash
node scripts/migration/migration-orchestrator.js --resume --checkpoint-file ./migration-checkpoint.json
```

### Emergency Procedures

#### Emergency Stop
Safely stops the current migration and saves state:
```bash
node scripts/migration/migration-orchestrator.js --emergency-stop
```

#### Emergency Rollback
Immediately initiates rollback procedures:
```bash
node scripts/migration/migration-orchestrator.js --emergency-rollback
```

## Best Practices

### Before Migration
1. **Test thoroughly** - Run test migrations in development environment
2. **Validate configuration** - Ensure all credentials and settings are correct
3. **Create backups** - Backup both Firestore and PostgreSQL data
4. **Plan downtime** - Schedule migration during low-usage periods
5. **Monitor resources** - Ensure sufficient disk space and memory

### During Migration
1. **Monitor progress** - Watch real-time status updates
2. **Check logs** - Monitor log files for warnings or issues
3. **Avoid interruption** - Don't stop the process unless emergency
4. **Have rollback plan** - Be prepared to rollback if needed
5. **Monitor performance** - Watch system resource usage

### After Migration
1. **Review reports** - Thoroughly review all migration reports
2. **Verify data** - Manually spot-check critical data
3. **Test application** - Ensure application works with new database
4. **Monitor performance** - Watch application performance post-migration
5. **Clean up** - Remove temporary files when migration is confirmed successful

### Production Recommendations
- Use `comprehensive` verification level for production migrations
- Enable auto-rollback for safety (`--auto-rollback` is default)
- Use appropriate batch sizes based on system capacity
- Run during maintenance windows
- Have database administrator available during migration
- Test the complete process in staging environment first

## Troubleshooting

### Common Issues

#### Connection Errors
```
Error: Failed to connect to Supabase: Invalid API key
```
**Solution**: Verify Supabase URL and service role key are correct

#### Permission Errors
```
Error: Insufficient permissions to read Firestore collection
```
**Solution**: Ensure Firebase service account has proper read permissions

#### Memory Issues
```
Error: JavaScript heap out of memory
```
**Solution**: Reduce batch size or increase Node.js memory limit

#### Disk Space Issues
```
Error: ENOSPC: no space left on device
```
**Solution**: Free up disk space or use different working directory

### Debug Mode
Enable verbose logging for detailed troubleshooting:
```bash
node scripts/migration/migration-orchestrator.js --verbose --dry-run
```

### Log Analysis
Check specific log files for detailed error information:
- `migration-log.json` - Detailed operation logs
- `migration-status.json` - Current status and errors
- Individual tool logs in working directory

## Environment Variables

The orchestrator supports these environment variables:

```bash
# Required
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Optional
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/firebase-service-account.json"
export MIGRATION_WORKING_DIR="./custom-workspace"
export MIGRATION_BATCH_SIZE="50"
```

## Security Considerations

### Credentials Management
- Store service role keys securely
- Use environment variables for sensitive data
- Rotate keys after migration completion
- Limit service account permissions to minimum required

### Data Protection
- Backup files contain sensitive data
- Use secure storage for backup files
- Implement proper access controls
- Clean up temporary files after migration

### Network Security
- Use secure connections (HTTPS/TLS)
- Consider VPN for database connections
- Monitor network traffic during migration
- Implement proper firewall rules

## Performance Optimization

### Batch Size Tuning
- Start with default batch size (100)
- Increase for better performance with sufficient resources
- Decrease if experiencing memory issues
- Monitor system resources during migration

### Resource Requirements
- **Memory**: Minimum 4GB RAM, recommended 8GB+
- **Disk**: 2x source data size for temporary files
- **Network**: Stable, high-bandwidth connection
- **CPU**: Multi-core recommended for parallel processing

### Optimization Tips
- Run during off-peak hours
- Use SSD storage for working directory
- Ensure stable network connection
- Monitor and adjust batch sizes based on performance
- Consider running verification separately for large datasets

## Support and Maintenance

### Getting Help
1. Check the troubleshooting section
2. Review detailed logs and reports
3. Consult the migration documentation
4. Contact the database team for assistance

### Maintenance Tasks
- Regular testing of migration tools
- Updating credentials and configurations
- Monitoring system resources
- Cleaning up old migration files
- Updating documentation

---

⚠️ **WARNING**: The Migration Orchestrator performs database migrations that can modify or delete data. Always ensure proper backups and test thoroughly before using in production environments.

🔗 **Related Documentation**:
- [Migration Tools README](./README.md)
- [Migration Verification Suite](./migration-verification-suite.js)
- [Migration Status Tracker](./migration-status-tracker.js)
- [Rollback Manager](./rollback-manager.js)