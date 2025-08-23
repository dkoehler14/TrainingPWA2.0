#!/bin/bash

# Supabase Database Initialization Script
# Run this script to set up a Supabase database from scratch
# Usage: ./scripts/initialize-production.sh --env <env-file>
# Example: ./scripts/initialize-production.sh --env .env.production

set -e

# Function to show usage
show_usage() {
    echo "Usage: $0 --env <env-file>"
    echo ""
    echo "Options:"
    echo "  --env <env-file>    Specify the environment file to load (e.g., .env.production, .env.test)"
    echo ""
    echo "Examples:"
    echo "  $0 --env .env.production"
    echo "  $0 --env .env.test"
    echo ""
    exit 1
}

# Parse command line arguments
ENV_FILE=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV_FILE="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            ;;
        *)
            echo "❌ Unknown option: $1"
            show_usage
            ;;
    esac
done

# Check if env file argument was provided
if [ -z "$ENV_FILE" ]; then
    echo "❌ Missing required --env argument"
    show_usage
fi

# Check if env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ Environment file not found: $ENV_FILE"
    echo "Available .env files:"
    ls -la .env* 2>/dev/null || echo "No .env files found"
    exit 1
fi

# Load environment variables from specified file
echo "📁 Loading environment variables from: $ENV_FILE"
set -a  # automatically export all variables
source "$ENV_FILE"
set +a  # stop automatically exporting

echo "🚀 Initializing Supabase Database with environment: $ENV_FILE"

# Check if required environment variables are set
if [ -z "$REACT_APP_SUPABASE_URL" ] || [ -z "$REACT_APP_SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Missing required environment variables in $ENV_FILE"
    echo "Required variables:"
    echo "  - REACT_APP_SUPABASE_URL"
    echo "  - REACT_APP_SUPABASE_SERVICE_ROLE_KEY"
    exit 1
fi

# Extract project reference from URL for linking
PROJECT_REF=$(echo "$REACT_APP_SUPABASE_URL" | sed -n 's/.*\/\/\([^.]*\)\.supabase\.co.*/\1/p')
if [ -z "$PROJECT_REF" ]; then
    echo "❌ Could not extract project reference from REACT_APP_SUPABASE_URL"
    echo "URL format should be: https://[project-ref].supabase.co"
    exit 1
fi

echo "🔗 Project Reference: $PROJECT_REF"

# Link to project
echo "🔗 Linking to Supabase project..."
supabase link --project-ref "$PROJECT_REF"

# Apply migrations
echo "📊 Applying database migrations..."
supabase db push

# Deploy edge functions
echo "⚡ Deploying edge functions..."
supabase functions deploy

# Validate RLS setup
echo "🔒 Validating Row Level Security setup..."
node scripts/validate-rls-setup.js

echo "✅ Database initialization complete!"
echo "🔗 Database URL: $REACT_APP_SUPABASE_URL"
echo "📊 Studio URL: https://supabase.com/dashboard/project/$PROJECT_REF"
echo "🌍 Environment: $ENV_FILE"