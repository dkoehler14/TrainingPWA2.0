# Supabase User Creation Guide

This guide explains how test users are created in the Supabase local development environment and how to verify they're working properly.

## Overview

The Supabase seeding system creates test users with both:
1. **Authentication credentials** - Users can actually log in with email/password
2. **Database profile records** - User data is stored in the `users` table

## How It Works

### User Creation Process

1. **Create Auth User**: Uses `supabase.auth.admin.createUser()` to create a user in Supabase Auth
2. **Create Profile**: Inserts a corresponding record in the `users` database table
3. **Link Records**: Uses the auth user's ID as the primary key for the profile

### Test Users Created

The seeding system creates these test users by default:

| Email | Password | Experience Level | Description |
|-------|----------|------------------|-------------|
| `test@example.com` | `testpass123` | beginner | Basic test user |
| `beginner@example.com` | `beginner123` | beginner | Beginner user scenario |
| `intermediate@example.com` | `intermediate123` | intermediate | Intermediate user scenario |

## Usage

### Running the Seeder

```bash
# Seed with default users
npm run supabase:seed

# Reset and seed fresh
npm run supabase:seed:reset
npm run supabase:seed

# Test user creation specifically
npm run supabase:test:users
```

### Manual Seeding

```bash
# Using the seeding system directly
node scripts/seed/supabase/seeding-system.js seed basic --verbose

# Using the seeder directly
node scripts/seed/supabase/seeder.js
```

## Verification

### Test User Creation

Run the test script to verify users are created properly:

```bash
npm run supabase:test:users
```

This test will:
1. ✅ Create an auth user
2. ✅ Create a database profile
3. ✅ Test login with email/password
4. ✅ Test profile access
5. ✅ Clean up test data

### Manual Verification

1. **Check Auth Users** (via Supabase Studio):
   - Go to `http://localhost:54323`
   - Navigate to Authentication > Users
   - Verify test users are listed

2. **Check Database Records**:
   ```sql
   SELECT id, email, name, experience_level FROM users;
   ```

3. **Test Login** (in your app):
   - Use any of the test user credentials
   - Verify successful authentication

## Troubleshooting

### Common Issues

#### "Auth user creation failed"
- **Cause**: Supabase local instance not running
- **Solution**: Run `supabase start` first

#### "Profile creation failed"
- **Cause**: Database schema issues or RLS policies
- **Solution**: Check migrations and RLS policies

#### "Login test failed"
- **Cause**: User not properly created or email not confirmed
- **Solution**: Ensure `email_confirm: true` is set during creation

### Reset Everything

If you encounter issues, reset everything:

```bash
# Stop Supabase
supabase stop

# Start fresh
supabase start

# Reset and seed
npm run supabase:seed:reset
npm run supabase:seed
```

## Code Examples

### Creating a Test User

```javascript
const { createClient } = require('@supabase/supabase-js');

async function createTestUser(email, password, profile) {
  const supabase = getSupabaseClient(); // Service role client
  
  // 1. Create auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true // Auto-confirm for local dev
  });
  
  if (authError) throw authError;
  
  // 2. Create profile
  const userProfile = {
    id: authUser.user.id,
    auth_id: authUser.user.id,
    email,
    ...profile
  };
  
  const { data: user, error: profileError } = await supabase
    .from('users')
    .insert(userProfile)
    .select()
    .single();
  
  if (profileError) throw profileError;
  
  return { ...user, password };
}
```

### Testing Login

```javascript
async function testLogin(email, password) {
  const anonClient = getAnonClient(); // Anonymous client
  
  const { data, error } = await anonClient.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) throw error;
  
  console.log('Login successful:', data.user.email);
  return data;
}
```

## Environment Variables

Make sure these are set for local development:

```bash
# .env.local or .env.development
REACT_APP_SUPABASE_URL=http://127.0.0.1:54321
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Security Notes

- **Service Role Key**: Only used for seeding operations, never in client code
- **Auto-confirm**: Only enabled for local development (`email_confirm: true`)
- **Test Passwords**: Simple passwords are fine for local testing
- **Production**: Never use these test users or simple passwords in production

## Integration with App

Once users are created, they can be used throughout your app:

1. **Login Page**: Use test credentials to log in
2. **Protected Routes**: Test authentication flows
3. **User Profile**: Verify profile data is accessible
4. **Workout Logging**: Test user-specific data

## Next Steps

After verifying user creation works:

1. Test the full authentication flow in your app
2. Verify user-specific data access (workouts, programs, etc.)
3. Test role-based access if applicable
4. Consider adding more user scenarios for testing

## Related Files

- `scripts/seed/supabase/seeder.js` - Main seeding logic
- `scripts/test-supabase-user-creation.js` - User creation test
- `src/config/supabaseAuth.js` - Auth configuration
- `supabase/migrations/` - Database schema