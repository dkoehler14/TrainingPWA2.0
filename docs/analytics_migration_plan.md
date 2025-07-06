# Analytics Migration Script Plan

## Objective

Create a Python script that reads all completed workout logs (`isWorkoutFinished: true`) from the `workoutLogs` collection and generates the corresponding aggregated data in the `userAnalytics` collection, mirroring the logic of the `processWorkout` Cloud Function.

## Execution Plan

The script will be designed for efficiency to handle a large number of logs without being excessively slow or expensive.

1.  **Initialization:**
    *   The script will start by importing the necessary Python libraries (`firebase_admin`).
    *   It will initialize the Firebase Admin SDK by looking for a `serviceAccountKey.json` file in the same directory.

2.  **Data Fetching:** The script will query the `workoutLogs` collection group to get all documents where `isWorkoutFinished` is `true`.

3.  **User-Centric Data Aggregation (In-Memory):**
    *   The script will create a main Python dictionary, let's call it `all_users_analytics`.
    *   As it iterates through each `workoutLog`, it will first read the `userId` from the log.
    *   The `userId` will be used as the **primary key** in the `all_users_analytics` dictionary. All calculations for a given log will be stored under that user's entry.
    *   If the script encounters a log for a new user, it will create a new entry for them in the dictionary. If it's for a user it has already seen, it will update their existing data.

4.  **Batch Write to Firestore (Per User):**
    *   After processing all logs, the script will iterate through the `all_users_analytics` dictionary.
    *   For each `userId` in the dictionary, it will create a new Firestore document inside the `userAnalytics` collection. The **document ID will be the `userId`**.
    *   This ensures a structure like `userAnalytics/{userId}`, which is exactly how the original Cloud Function operates.

5.  **Logging & Output:**
    *   The script will print progress messages to the console, indicating which user is being processed and when the final data is being written to the database.

## Process Flow Diagram

```mermaid
graph TD
    subgraph Initialization
        A[Start Script] --> B[Initialize Firebase Admin SDK];
    end

    subgraph Data Processing
        B --> C{Fetch ALL workoutLogs where isWorkoutFinished == true};
        C --> D[Create empty dictionary `all_users_analytics`];
        D --> E{For each workoutLog};
        E --> F[Get `userId` from the log];
        F --> G{For each exercise in the log};
        G --> H[Calculate metrics: E1RM, Volume, etc.];
        H --> I[Update data for `all_users_analytics[userId]`];
        I --> G;
        G -- all exercises done --> E;
        E -- all logs done --> J[All logs processed];
    end

    subgraph Firestore Write
        J --> K{For each `userId`, `data` in `all_users_analytics`};
        K --> L[Create a Firestore Batch Write];
        L --> M[Add aggregated exercise & monthly data to `userAnalytics/{userId}`];
        M --> N[Commit the batch to Firestore];
        N --> K;
        K -- all users done --> O[End Script];
    end