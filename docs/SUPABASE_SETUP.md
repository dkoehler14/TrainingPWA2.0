# Supabase Development Environment Setup

This document outlines how to set up the Supabase development environment for the exercise tracker application migration.

## Prerequisites

1. **Docker Desktop** - Required for running Supabase locally
   - Download from: https://www.docker.com/products/docker-desktop/
   - Make sure Docker Desktop is running before starting Supabase

2. **Node.js and npm** - Already installed (required for the React app)

3. **Supabase CLI** - Already installed as a dev dependency
   - Available via `npx supabase`

## Quick Start

1. **Start Docker Desktop**
   - Make sure Docker Desktop is running on your system

2. **Initialize and start Supabase**
   ```bash
   npm run supabase:setup
   ```

3. **Check status**
   ```bash
   npm run supabase:status
   ```

## Available Scripts

### Development Scripts
- `npm run dev` - Start both React app and Supabase (replaces Firebase)
- `npm run dev:supabase` - Start only Supabase services
- `npm run supabase:setup` - Complete setup and start Supabase

### Supabase Management Scripts
- `npm run supabase:start` - Start Supabase services
- `npm run supabase:stop` - Stop Supabase services
- `npm run supabase:status` - Check service status
- `npm run supabase:reset` - Reset database with fresh migrations
- `npm run supabase:studio` - Open Supabase Studio (database UI)
- `npm run supabase:types` - Generate TypeScript types from schema

### Helper Scripts
- `node scripts/supabase-dev-setup.js` - Interactive setup helper

## Service URLs (Local Development)

When Supabase is running locally, you can access:

- **Supabase Studio (Database UI)**: http://localhost:54323
- **API Gateway**: http://localhost:54321
- **Email Testing (Inbucket)**: http://localhost:54324
- **Database**: postgresql://postgres:postgres@localhost:54322/postgres

## Environment Variables

The following environment variables are configured for local development:

```env
# Local Supabase Configuration
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0
```

## Database Schema

The database schema includes the following tables:
- `users` - User profiles linked to Supabase Auth
- `exercises` - Exercise definitions (global and user-specific)
- `programs` - Workout programs
- `program_workouts` - Individual workouts within programs
- `program_exercises` - Exercises within workouts
- `workout_logs` - Completed workout sessions
- `workout_log_exercises` - Exercise data from completed workouts
- `user_analytics` - Aggregated user performance data

## Row Level Security (RLS)

All tables have Row Level Security enabled to ensure users can only access their own data. Global exercises are visible to all users.

## Authentication

Supabase Auth is configured with:
- Email/password authentication
- Automatic user profile creation via database triggers
- Session management and token refresh

## Troubleshooting

### Docker Issues
- Make sure Docker Desktop is running
- On Windows, you may need to run Docker Desktop as administrator
- Check Docker is accessible: `docker ps`

### Supabase Issues
- Check service status: `npm run supabase:status`
- Reset if needed: `npm run supabase:reset`
- View logs: `npx supabase logs`

### Port Conflicts
If you have port conflicts, you can modify the ports in `supabase/config.toml`:
- API: port 54321
- Database: port 54322
- Studio: port 54323
- Email: port 54324

## Migration from Firebase

This setup prepares the environment for migrating from Firebase to Supabase:

1. **Database**: PostgreSQL replaces Firestore
2. **Authentication**: Supabase Auth replaces Firebase Auth
3. **Functions**: Edge Functions will replace Firebase Functions
4. **Real-time**: Supabase Realtime replaces Firestore real-time listeners

The existing Firebase configuration is preserved during the migration process and will be removed once the migration is complete.