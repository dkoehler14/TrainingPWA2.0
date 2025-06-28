// For JavaScript, ensure you have firebase-functions and firebase-admin installed:
// npm install firebase-functions firebase-admin

const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK if it hasn't been initialized already.
// When deployed as a Cloud Function, admin.initializeApp() will automatically
// pick up the project configuration. For local testing, you might need to
// set up service account credentials.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Cloud Function to migrate workoutLogs by adding a 'completedDate' field
 * with the value from the existing 'date' field.
 * This function is designed to be called manually (e.g., via HTTP request or a simple script).
 */
exports.migrateWorkoutLogsCompletedDate = functions.https.onCall(async (data, context) => {
  // --- IMPORTANT: Security Check ---
  // For a one-off migration, you might trigger this from a trusted environment.
  // If you plan to expose this, add strong authentication and authorization checks here.
  // For example, only allow authenticated admins to trigger it:
  // if (!context.auth || context.auth.token.role !== 'admin') {
  //     throw new functions.https.HttpsError('permission-denied', 'You are not authorized to perform this operation.');
  // }

  const collectionGroupRef = db.collectionGroup('workoutLogs');
  const BATCH_SIZE = 400; // Keep it below Firestore's 500 limit for safety
  let documentsProcessed = 0;
  let lastDocSnapshot = null; // No type annotation needed for JavaScript
  let continueProcessing = true;

  functions.logger.info('Starting migration of workoutLogs to add completedDate...');

  try {
    while (continueProcessing) {
      let query = collectionGroupRef
        .orderBy(admin.firestore.FieldPath.documentId()) // Order by document ID for consistent pagination across all subcollections
        .limit(BATCH_SIZE);

      if (lastDocSnapshot) {
        query = query.startAfter(lastDocSnapshot);
      }

      const snapshot = await query.get();

      if (snapshot.empty) {
        continueProcessing = false;
        functions.logger.info('No more documents found.');
        break;
      }

      const batch = db.batch();
      let updatesInBatch = 0;

      snapshot.docs.forEach(doc => {
        const docData = doc.data();
        // Only update if 'date' exists AND 'completedDate' does NOT exist
        // This makes the script "idempotent" – running it multiple times won't cause issues
        if (docData.date && !docData.completedDate) {
          // Assuming 'date' is a Firestore Timestamp.
          // If 'date' is a string, you might need to parse it:
          // const dateToSet = new Date(docData.date); // Or new admin.firestore.Timestamp(dateToSet.getTime() / 1000, 0);
          batch.update(doc.ref, { completedDate: docData.date });
          updatesInBatch++;
        }
      });

      if (updatesInBatch > 0) {
        await batch.commit();
        functions.logger.info(`Committed batch of ${updatesInBatch} updates.`);
      } else {
        functions.logger.info('No documents needing update in this batch.');
      }

      documentsProcessed += snapshot.docs.length;
      lastDocSnapshot = snapshot.docs[snapshot.docs.length - 1];

      // If the number of documents in the snapshot is less than BATCH_SIZE,
      // it means we've processed the last page.
      if (snapshot.docs.length < BATCH_SIZE) {
        continueProcessing = false;
      }
    }

    functions.logger.info(`Migration complete! Processed ${documentsProcessed} total documents.`);
    return { success: true, documentsProcessed, message: 'Migration completed successfully.' };

  } catch (error) { // Removed ': any'
    functions.logger.error('Error during workoutLogs migration:', error);
    throw new functions.https.HttpsError('internal', 'Migration failed', error.message);
  }
});
