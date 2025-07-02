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

Once the installation is complete, you can start the development server:

```bash
npm start
```

This will run the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in your browser. The page will automatically reload if you make edits.

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
