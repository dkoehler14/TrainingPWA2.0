# Migration Verification and Rollback Tools

This directory contains comprehensive tools for verifying data migration integrity and managing rollback procedures for the Firestore to Supabase migration.

## Overview

The migration verification and rollback system consists of several integrated tools:

1. **Migration Verifier** - Validates data integrity between Firestore and PostgreSQL
2. **Rollback Manager** - Handles safe rollback procedures for failed migrations
3. **Status Tracker** - Tracks migration progress and generates detailed reports
4. **Verification Suite** - Orchestrates the complete verification process

## Tools

### 1. Migration Verifier (`migration-verifier.js`)

Comprehensive data integrity verification tool that compares Firestore and PostgreSQL data.

**Features:**
- Data count verification
- Sample data comparison
- Relationship integrity checks
- Performance benchmarking
- Detailed reporting

**Usage:**
```bash
# Basic verification
node scripts/migration/migration-verifier.js

# Verification with performance testing
node scripts/migration/migration-verifier.js --performance-test --sample-size 200

# Verbose verification with custom output
node scripts/migration/migration-verifier.js --verbose --output-dir ./my-verification-results
```

**Options:**
- `--supabase-url <url>` - Supabase project URL
- `--supabase-key <key>` - Supabase service role key
- `--firebase-service-account <path>` - Path to Firebase service account JSON
- `--output-dir <path>` - Output directory for reports
- `--sample-size <number>` - Number of records to sample for comparison
- `--performance-test` - Run performance tests
- `--verbose` - Enable verbose logging

### 2. Rollback Manager (`rollback-manager.js`)

Safe rollback procedures for failed migrations with multiple rollback strategies.

**Features:**
- Full, partial, schema-only, and data-only rollback modes
- Pre-rollback backup creation
- Rollback verification
- Emergency recovery procedures

**Usage:**
```bash
# Full rollback with confirmation and backup
node scripts/migration/rollback-manager.js --rollback-type full

# Dry run to see what would be rolled back
node scripts/migration/rollback-manager.js --dry-run --verbose

# Partial rollback without confirmation
node scripts/migration/rollback-manager.js --rollback-type partial --no-confirm

# Emergency recovery (use with extreme caution)
node scripts/migration/rollback-manager.js --emergency --no-confirm
```

**Options:**
- `--rollback-type <type>` - Type of rollback: full, partial, schema-only, data-only
- `--no-confirm` - Skip confirmation prompt
- `--no-backup` - Skip pre-rollback backup
- `--dry-run` - Show what would be done without executing
- `--emergency` - Emergency recovery mode

### 3. Migration Status Tracker (`migration-status-tracker.js`)

Comprehensive status tracking and reporting for migration operations.

**Features:**
- Real-time progress tracking
- Status persistence and recovery
- Detailed operation logging
- Integration with verification and rollback tools
- Comprehensive reporting

**Usage:**
```bash
# Print current migration status
node scripts/migration/migration-status-tracker.js --print-status

# Generate final report
node scripts/migration/migration-status-tracker.js --generate-report

# Start with verbose logging
node scripts/migration/migration-status-tracker.js --verbose
```

**Options:**
- `--status-file <path>` - Path to status file
- `--log-file <path>` - Path to log file
- `--backup-dir <path>` - Directory for backups and reports
- `--print-status` - Print current status and exit
- `--generate-report` - Generate final report and exit
- `--verbose` - Enable verbose logging

### 4. Migration Verification Suite (`migration-verification-suite.js`)

Orchestrates the complete migration verification process with integrated rollback capabilities.

**Features:**
- Comprehensive migration verification
- Automated rollback on verification failure
- Real-time status tracking
- Configurable verification levels
- Emergency recovery procedures

**Usage:**
```bash
# Standard verification with auto-rollback
node scripts/migration/migration-verification-suite.js --verification-level standard

# Comprehensive verification without auto-rollback
node scripts/migration/migration-verification-suite.js --verification-level comprehensive --no-auto-rollback

# Emergency verification (minimal checks)
node scripts/migration/migration-verification-suite.js --emergency-verification

# Dry run to see what would be verified
node scripts/migration/migration-verification-suite.js --dry-run --verbose
```

**Options:**
- `--verification-level <level>` - Verification level: basic, standard, comprehensive
- `--no-auto-rollback` - Disable automatic rollback on verification failure
- `--performance-test` - Include performance testing
- `--emergency-verification` - Run emergency verification (minimal checks)
- `--emergency-rollback` - Run emergency rollback (immediate cleanup)

## Verification Levels

### Basic Verification
- Count comparisons between Firestore and PostgreSQL
- Minimal sample data verification (10 records)
- No performance testing
- Fast execution for quick checks

### Standard Verification
- Count comparisons and sample data verification (100 records)
- Basic relationship integrity checks
- Standard error tolerance
- Balanced speed and thoroughness

### Comprehensive Verification
- Extensive sample data verification (200+ records)
- Full relationship integrity checks
- Performance benchmarking
- Strict error tolerance
- Recommended for production migrations

## Rollback Strategies

### Full Rollback
- Removes all migrated data from PostgreSQL
- Keeps database schema intact
- Creates backup before rollback
- Recommended for complete migration failures

### Partial Rollback
- Rolls back specific tables or data sets
- Configurable scope
- Useful for targeted failures

### Schema-Only Rollback
- Drops database tables and schema
- Requires manual intervention for DDL operations
- Use for complete schema failures

### Data-Only Rollback
- Removes data but keeps schema
- Fastest rollback option
- Good for data integrity issues

## Integration

The tools are designed to work together seamlessly:

1. **Status Tracker** monitors all operations
2. **Verifier** reports results to Status Tracker
3. **Rollback Manager** integrates with Status Tracker
4. **Verification Suite** orchestrates all tools

### Programmatic Usage

```javascript
const { MigrationVerificationSuite } = require('./migration-verification-suite');

const suite = new MigrationVerificationSuite({
  verificationLevel: 'comprehensive',
  autoRollbackOnFailure: true,
  verbose: true
});

await suite.initialize();
const results = await suite.runVerificationSuite();

if (results.overallStatus === 'passed') {
  console.log('Migration verification passed!');
} else {
  console.log('Migration verification failed or was rolled back');
}
```

## Environment Variables

All tools support these environment variables:

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Firebase service account JSON

## Output Files

The tools generate various output files:

### Verification Reports
- `migration-verification-report.json` - Detailed verification results
- `verification-summary.md` - Human-readable summary
- `comprehensive-verification-report.json` - Complete suite results
- `verification-executive-summary.md` - Executive summary

### Status Tracking
- `migration-status.json` - Current migration status
- `migration-log.json` - Detailed operation log
- `migration-report-{id}.json` - Final migration report
- `migration-report-{id}.md` - Markdown migration report

### Rollback Reports
- `rollback-report.json` - Rollback operation results
- `rollback-summary.md` - Rollback summary
- `pre-rollback-{timestamp}/` - Pre-rollback backups

## Best Practices

### Before Migration
1. Test all tools in development environment
2. Ensure proper backups are in place
3. Configure appropriate verification level
4. Set up monitoring and alerting

### During Migration
1. Use comprehensive verification for production
2. Enable auto-rollback for safety
3. Monitor status in real-time
4. Keep detailed logs

### After Migration
1. Review all verification reports
2. Address any warnings
3. Clean up temporary files
4. Document lessons learned

## Troubleshooting

### Common Issues

**Connection Errors**
- Verify Supabase URL and service role key
- Check Firebase service account permissions
- Ensure network connectivity

**Verification Failures**
- Review detailed error messages
- Check data transformation logic
- Verify foreign key relationships
- Consider data type mismatches

**Rollback Issues**
- Ensure sufficient permissions
- Check for active connections
- Verify backup integrity
- Consider manual intervention

### Emergency Procedures

**Emergency Verification**
```bash
node scripts/migration/migration-verification-suite.js --emergency-verification
```

**Emergency Rollback**
```bash
node scripts/migration/rollback-manager.js --emergency --no-confirm
```

**Status Recovery**
```bash
node scripts/migration/migration-status-tracker.js --print-status
```

## Security Considerations

- Service role keys have elevated permissions
- Backup files may contain sensitive data
- Use secure storage for credentials
- Implement proper access controls
- Audit all operations

## Performance Considerations

- Large datasets may require extended timeouts
- Sample sizes affect verification time
- Network latency impacts performance
- Consider running during off-peak hours
- Monitor resource usage

## Support

For issues or questions:

1. Check the detailed logs and reports
2. Review the troubleshooting section
3. Consult the migration documentation
4. Contact the database team for assistance

## Contributing

When modifying these tools:

1. Maintain backward compatibility
2. Add comprehensive error handling
3. Update documentation
4. Test thoroughly in development
5. Follow existing code patterns

---

⚠️ **WARNING**: These tools can modify or delete data. Always ensure proper backups and test thoroughly before using in production environments.