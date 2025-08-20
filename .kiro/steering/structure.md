# Project Structure

## Root Level Organization

```
├── src/                    # React application source code
├── supabase/              # Supabase configuration and migrations
├── scripts/               # Development and deployment scripts
├── docs/                  # Project documentation
├── functions/             # Firebase Cloud Functions (legacy)
├── public/                # Static assets
├── build/                 # Production build output
└── migration-backups/     # Database migration backups
```

## Source Code Structure (`src/`)

### Core Application
- `App.js` - Main application component with routing and auth
- `index.js` - Application entry point
- `firebase.js` - Firebase configuration (legacy)

### Feature Organization
```
├── components/            # Reusable UI components
├── pages/                # Route-level page components
├── services/             # Business logic and API calls
├── hooks/                # Custom React hooks
├── utils/                # Utility functions and helpers
├── config/               # Configuration files
├── context/              # React context providers
├── styles/               # CSS files organized by component
├── constants/            # Application constants
└── types/                # Type definitions
```

### Component Patterns
- **Pages**: Route-level components (e.g., `LogWorkout.js`, `Exercises.js`)
- **Components**: Reusable UI elements with corresponding CSS files
- **Error Boundaries**: Specialized error handling components (`*ErrorBoundary.js`)
- **Modals**: Dialog components (`*Modal.js`)

### Service Layer Architecture
- **Service Files**: Business logic separated by domain (`exerciseService.js`, `workoutLogService.js`)
- **Error Handling**: Centralized error handling with custom error classes
- **Caching**: Cache warming and management services
- **Real-time**: WebSocket and subscription management

## Database Structure (`supabase/`)

### Migrations
- Sequential numbered migrations (`20240101000000_*.sql`)
- Schema definitions, indexes, RLS policies, and triggers
- Migration files are immutable once applied

### Edge Functions
```
├── functions/
│   ├── _shared/          # Shared utilities and types
│   ├── coaching-insights/ # AI coaching functionality
│   ├── data-validation/  # Data integrity checks
│   ├── process-workout/  # Workout processing logic
│   └── workout-triggers/ # Database triggers
```

### Configuration
- `config.toml` - Local development configuration
- `config.production.toml` - Production environment settings
- `seed.sql` - Initial data seeding

## Scripts Organization (`scripts/`)

### Development Scripts
- `seed/` - Comprehensive test data seeding system
- `test-*.js` - Environment validation and testing
- `validate-*.js` - System validation scripts

### Migration Scripts
```
├── migration/
│   ├── firestore-extractor.js    # Extract data from Firestore
│   ├── postgres-importer.js      # Import to PostgreSQL
│   ├── data-transformer.js       # Transform data formats
│   ├── migration-orchestrator.js # Coordinate migration process
│   └── rollback-manager.js       # Handle rollbacks
```

### Deployment Scripts
- `deploy-edge-functions.js` - Edge function deployment
- `production-*.js` - Production deployment and monitoring
- `backup-production.sh` - Database backup automation

## Testing Structure

### Test Organization
```
├── src/__tests__/         # Integration and comprehensive tests
├── src/**/__tests__/      # Unit tests co-located with source
├── scripts/seed/**/__tests__/ # Seeding system tests
└── test-verification-results/ # Test execution reports
```

### Test Categories
- **Unit Tests**: Component and service-level tests
- **Integration Tests**: Cross-service functionality tests
- **User Acceptance Tests**: End-to-end workflow validation
- **Performance Tests**: Load and stress testing

## Configuration Files

### Environment Configuration
- `.env.example` - Template for environment variables
- `.env.development` - Local development settings
- `.env.production` - Production environment settings
- `env.test` - Test environment configuration

### Build Configuration
- `package.json` - Dependencies and npm scripts
- `firebase.json` - Firebase project configuration (legacy)
- `firestore.rules` - Firestore security rules (legacy)

## Documentation Structure (`docs/`)

### Technical Documentation
- Implementation guides and migration plans
- Performance optimization summaries
- Testing and deployment guides
- Architecture decision records

### User Documentation
- Setup and installation guides
- Feature usage examples
- Troubleshooting guides

## Naming Conventions

### Files and Directories
- **Components**: PascalCase (`ExerciseGrid.js`)
- **Services**: camelCase with suffix (`exerciseService.js`)
- **Utilities**: camelCase with suffix (`supabaseErrorHandler.js`)
- **Hooks**: camelCase with `use` prefix (`useAuth.js`)
- **Constants**: camelCase (`exercise.js`)

### Database Objects
- **Tables**: snake_case (`workout_logs`, `program_exercises`)
- **Columns**: snake_case (`created_at`, `is_global`)
- **Functions**: snake_case (`update_updated_at_column`)

### Code Organization Principles
- **Co-location**: Tests and styles near related components
- **Domain Separation**: Services organized by business domain
- **Shared Utilities**: Common functionality in dedicated utils
- **Configuration Centralization**: Environment-specific configs in dedicated files