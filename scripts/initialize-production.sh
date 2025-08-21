#!/bin/bash

# Production Supabase Database Initialization Script
# Run this script to set up the production database from scratch

set -e

echo "🚀 Initializing Production Supabase Database..."

# Check if required environment variables are set
if [ -z "$REACT_APP_SUPABASE_URL" ] || [ -z "$REACT_APP_SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ Missing required environment variables"
    echo "Please set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_SERVICE_ROLE_KEY"
    exit 1
fi

# Link to production project
echo "🔗 Linking to production project..."
supabase link --project-ref lgfxzuvkvjmlpzliohpd

# Apply migrations
echo "📊 Applying database migrations..."
supabase db push

# Deploy edge functions
echo "⚡ Deploying edge functions..."
supabase functions deploy

# Seed initial data (global exercises only)
echo "🌱 Seeding initial data..."
psql "$REACT_APP_SUPABASE_URL" -c "\i supabase/seed.sql"

# Run verification tests
echo "🔍 Running verification tests..."
npm run test:supabase

echo "✅ Production database initialization complete!"
echo "🔗 Database URL: $REACT_APP_SUPABASE_URL"
echo "📊 Studio URL: https://supabase.com/dashboard/project/lgfxzuvkvjmlpzliohpd"