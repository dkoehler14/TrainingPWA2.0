# Technology Stack

## Frontend Framework
- **React 19.0.0** with functional components and hooks
- **React Router DOM 7.2.0** for client-side routing
- **React Bootstrap 2.10.9** with Bootstrap 5.3.3 for UI components
- **React Scripts 5.0.1** for build tooling (Create React App)

## Backend & Database
- **Supabase** (primary) - PostgreSQL with real-time subscriptions, auth, and edge functions
- **Firebase** (legacy) - Firestore, Auth, Functions (being migrated from)
- **Supabase Edge Functions** written in TypeScript/Deno

## Key Libraries
- **@supabase/supabase-js 2.52.0** - Supabase client
- **firebase 11.3.1** - Firebase SDK (legacy)
- **lodash 4.17.21** - Utility functions
- **react-chartjs-2 5.3.0** & **recharts 2.15.3** - Data visualization
- **react-datepicker 8.1.0** - Date selection components

## Development Tools
- **Supabase CLI** for local development and migrations
- **Firebase CLI** for emulator support (legacy)
- **Jest** with React Testing Library for testing
- **concurrently** for running multiple dev processes

## Common Commands

### Development Environment
```bash
# Start complete development environment (React + Supabase)
npm run dev

# Start only React with emulator config
npm run dev:react

# Start only Supabase local services
npm run dev:supabase

# Enhanced debugging with verbose logging
npm run dev:debug
```

### Database Management
```bash
# Start Supabase local instance
npm run supabase:start

# Reset local database with migrations
npm run supabase:reset

# Apply migrations to local database
npm run supabase:migrate

# Open Supabase Studio (database UI)
npm run supabase:studio
```

### Test Data Seeding
```bash
# Seed basic test data (3 users with different experience levels)
npm run seed:dev

# Reset all test data
npm run seed:reset

# Seed comprehensive test scenarios
npm run seed:scenarios:comprehensive
```

### Testing
```bash
# Run unit tests
npm run test:unit

# Run Supabase-specific tests
npm run test:supabase

# Run integration tests
npm run test:integration

# Run user acceptance tests
npm run test:user-acceptance
```

### Production
```bash
# Build for production
npm run prod:build

# Deploy edge functions
npm run edge-functions:deploy:production

# Monitor production health
npm run prod:monitor
```

## Environment Configuration

### Development
- Uses Supabase local instance (localhost:54321)
- Automatic emulator detection via `REACT_APP_USE_EMULATORS=true`
- Hot reloading and enhanced debugging enabled

### Production
- Connects to hosted Supabase instance
- Environment variables for Supabase URL and keys
- Optimized builds with source maps disabled

## Architecture Patterns

### Database Migration Strategy
- Dual Firebase/Supabase support during transition
- Environment-based client switching
- Comprehensive migration scripts in `scripts/migration/`

### Error Handling
- Custom error classes for different error types
- Retry logic with exponential backoff
- User-friendly error message mapping

### Caching Strategy
- Supabase cache warming service
- Smart cache initialization based on user context
- Progressive cache warming for heavy pages

### Real-time Features
- Supabase real-time subscriptions for live updates
- Channel management for workout progress tracking
- Graceful degradation when real-time unavailable