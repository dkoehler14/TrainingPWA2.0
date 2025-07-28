#!/bin/bash
# Automated Supabase Backup Script
# This script should be run via cron job for regular backups

set -e

# Configuration
PROJECT_REF="your-project-ref"
BACKUP_DIR="/backups/supabase"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Export database schema
echo "Exporting database schema..."
supabase db dump --project-ref "$PROJECT_REF" --schema-only > "$BACKUP_DIR/schema_$DATE.sql"

# Export database data
echo "Exporting database data..."
supabase db dump --project-ref "$PROJECT_REF" --data-only > "$BACKUP_DIR/data_$DATE.sql"

# Compress backups
echo "Compressing backups..."
gzip "$BACKUP_DIR/schema_$DATE.sql"
gzip "$BACKUP_DIR/data_$DATE.sql"

# Clean up old backups
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed successfully: $DATE"
