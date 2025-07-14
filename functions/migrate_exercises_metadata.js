const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  // Update the path to your service account key if needed
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'sample-firebase-ai-app-d056c-firebase-adminsdk-fbsvc-f79a9e3560.json');
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath)),
  });
}

const db = admin.firestore();

async function migrateExercisesMetadata() {
  try {
    const exercisesSnapshot = await db.collection('exercises').get();
    const exercisesMap = {};

    exercisesSnapshot.forEach(doc => {
      exercisesMap[doc.id] = doc.data();
    });

    await db.collection('exercises_metadata').doc('all_exercises').set({
      exercises: exercisesMap,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Successfully migrated ${exercisesSnapshot.size} exercises to exercises_metadata/all_exercises.`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateExercisesMetadata(); 