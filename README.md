# Exercise Tracker

*Your intelligent partner for strength and hypertrophy training.*

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React Version](https://img.shields.io/badge/react-^19.0.0-blue)](https://reactjs.org/)
[![Firebase Version](https://img.shields.io/badge/firebase-^11.3.1-orange)](https://firebase.google.com/)

## Overview

Exercise Tracker (also known as FitTrack Pro) is an intelligent workout tracking app designed for strength and hypertrophy training enthusiasts, particularly home gym owners. It combines comprehensive workout logging with powerful analytics to help you optimize your training, track meaningful progress, and even share effective workout programs with a community of like-minded users. This app aims to provide a simple, user-friendly interface for fitness enthusiasts to manage their training data and achieve their goals.

## Key Features

*   **Workout Logging:** A comprehensive database of exercises, allowing you to track sets, reps, weight, and rest times with minimal friction.
*   **Progress Analytics:** Visualize your strength progression and volume trends over time with intuitive charts and graphs.
*   **Program Library:** Browse, save, and use workout programs shared by the community.
*   **Custom Program Creation:** Build and save your own personalized workout routines.
*   **(Coming Soon) AI Workout Builder:** Get custom program generation based on your goals, available equipment, and experience level.

## Getting Started

Follow these instructions to get the project up and running on your local machine for development and testing purposes.

### Prerequisites

Before you begin, ensure you have the following software installed on your system:

*   [Node.js](https://nodejs.org/) (which includes npm)
*   [Git](https://git-scm.com/)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd exercise-tracker
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Firebase:**
    *   Create a new project in the [Firebase Console](https://console.firebase.google.com/).
    *   In your project's settings, add a new Web App.
    *   You will be given a `firebaseConfig` object. Copy these credentials.
    *   Create a `.env` file in the root of the project by copying the example file:
        ```bash
        cp .env.example .env
        ```
    *   Paste your Firebase configuration into the `.env` file. It should look like this:
        ```
        REACT_APP_FIREBASE_API_KEY="your-api-key"
        REACT_APP_FIREBASE_AUTH_DOMAIN="your-auth-domain"
        REACT_APP_FIREBASE_PROJECT_ID="your-project-id"
        REACT_APP_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
        REACT_APP_FIREBASE_MESSAGING_SENDER_ID="your-messaging-sender-id"
        REACT_APP_FIREBASE_APP_ID="your-app-id"
        ```

### Running the Application

#### Production Mode

To run the app in production mode (connects to live Firebase services):

```bash
npm start
```

This will run the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

#### Local Development Mode (Recommended)

For local development with Firebase emulators and hot-reloading:

```bash
npm run dev
```

This command starts both the React development server and Firebase emulators concurrently. The app will automatically connect to local Firebase services instead of production.

## Development Workflow

### Quick Start for New Developers

1. **Complete the installation steps above**
2. **Install Firebase CLI globally:**
   ```bash
   npm install -g firebase-tools
   ```
3. **Start the complete development environment:**
   ```bash
   npm run dev
   ```
4. **Access your local development environment:**
   - React App: [http://localhost:3000](http://localhost:3000)
   - Firebase Emulator UI: [http://localhost:4000](http://localhost:4000)
   - Functions: [http://localhost:5001](http://localhost:5001)
   - Firestore: [http://localhost:8080](http://localhost:8080)
   - Auth: [http://localhost:9099](http://localhost:9099)

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start complete development environment (React + all Firebase emulators) |
| `npm run dev:react` | Start only React development server with emulator configuration |
| `npm run dev:firebase` | Start only Firebase emulators |
| `npm run dev:functions` | Start only Firebase Functions emulator |
| `npm run dev:debug` | Start React with enhanced debugging and verbose logging |
| `npm run dev:trace` | Start React with trace-level logging for detailed debugging |
| `npm run test:dev-env` | Test development environment connectivity and services |
| `npm run validate:dev-env` | Validate development environment configuration |
| `npm run test:integration` | Run integration tests against local emulators |

### Development Environment Features

- **Hot Reloading**: Changes to React components automatically refresh the browser
- **Local Firebase Services**: All Firebase services run locally without affecting production data
- **Automatic Service Detection**: App automatically connects to local emulators in development mode
- **Enhanced Error Reporting**: Detailed error messages and stack traces in development
- **Source Maps**: Full debugging support for both frontend and backend code
- **Emulator UI**: Visual interface for inspecting Firestore data, Auth users, and Functions logs

### Environment Configuration

The app automatically detects the environment and configures Firebase connections:

- **Development Mode**: Uses local Firebase emulators (when `REACT_APP_USE_EMULATORS=true`)
- **Production Mode**: Connects to live Firebase services

Environment variables are managed through:
- `.env.development` - Local development configuration
- `.env` - Production Firebase configuration

### Troubleshooting

#### Common Issues and Solutions

**Port Already in Use**
```
Error: Port 3000 is already in use
```
*Solution:* Kill the process using the port or use a different port:
```bash
# Kill process on port 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or start on different port
set PORT=3001 && npm run dev:react
```

**Firebase Emulators Won't Start**
```
Error: Could not start emulators
```
*Solutions:*
1. Ensure Firebase CLI is installed: `npm install -g firebase-tools`
2. Login to Firebase: `firebase login`
3. Check if ports are available (4000, 5001, 8080, 9099)
4. Clear emulator data: Delete `.firebase` folder and restart

**React App Can't Connect to Emulators**
```
Error: Firebase connection failed
```
*Solutions:*
1. Verify emulators are running: Check [http://localhost:4000](http://localhost:4000)
2. Check environment variables: Ensure `REACT_APP_USE_EMULATORS=true` is set
3. Restart development environment: Stop all processes and run `npm run dev`

**Hot Reloading Not Working**
*Solutions:*
1. Check if you're using `npm run dev:react` or `npm run dev`
2. Clear browser cache and refresh
3. Restart the React development server
4. Check for JavaScript errors in browser console

**Functions Not Updating**
```
Functions code changes not reflected
```
*Solutions:*
1. Ensure you're modifying files in the `functions/` directory
2. Check Functions emulator logs for errors
3. Restart Firebase emulators: `npm run dev:firebase`

**Database Changes Not Persisting**
*Solution:* Emulator data is reset on restart. For persistent data during development:
1. Use the Emulator UI to export/import data
2. Create seed data scripts for consistent testing

#### Debug Mode

For enhanced debugging, use the debug commands:

```bash
# Enhanced debugging with verbose logging
npm run dev:debug

# Trace-level logging for detailed debugging
npm run dev:trace
```

These modes provide:
- Detailed console logging
- Service status information
- Connection state monitoring
- Enhanced error reporting

#### Validation Commands

Test your development environment setup:

```bash
# Validate environment configuration
npm run validate:dev-env

# Test service connectivity
npm run test:dev-env

# Run integration tests
npm run test:integration
```

#### Getting Help

If you encounter issues not covered here:

1. Check the Firebase Emulator UI at [http://localhost:4000](http://localhost:4000) for service status
2. Review console logs for detailed error messages
3. Ensure all prerequisites are installed and up to date
4. Try restarting the entire development environment

### Development Best Practices

- Always use `npm run dev` for local development to avoid affecting production data
- Use the Firebase Emulator UI to inspect and manage local data
- Run `npm run test:dev-env` after setup to verify everything is working
- Keep emulators running during development for faster iteration
- Use debug modes when troubleshooting complex issues

## Usage

*   **Logging a Workout:** Navigate to the "Log Workout" page, select your exercises, and enter your sets, reps, and weight.
*   **Creating a Program:** Go to the "Create Program" page to build a new workout routine from scratch.
*   **Tracking Progress:** Visit the "Progress" section to see charts and data visualizations of your performance over time.

## Running Tests

To launch the test runner in interactive watch mode, run:

```bash
npm test
```

## Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.
