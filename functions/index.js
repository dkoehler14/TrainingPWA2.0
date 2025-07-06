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

/**
 * Cloud Function to process completed workouts and update user analytics.
 *
 * Triggered when a document in the `workoutLogs` collection is updated
 * and `isWorkoutFinished` is set to true.
 *
 * Enhanced with Phase 2 features:
 * - PR tracking for different rep ranges
 * - Effective reps calculation (RPE 7+ equivalent)
 * - Intensity tracking as percentage of e1RM
 * - Compound lift identification and specialized tracking
 * - Exercise variation tracking and staleness detection
 */
// exports.processWorkout = functions.firestore
//   .document('workoutLogs/{logId}')
//   .onUpdate(async (change, context) => {
//     const newData = change.after.data();
//     const oldData = change.before.data();

//     // --- Trigger Condition Check ---
//     // Only run if isWorkoutFinished just became true
//     if (newData.isWorkoutFinished !== true || oldData.isWorkoutFinished === true) {
//       functions.logger.info(`Skipping workout processing for log ${context.params.logId}. isWorkoutFinished is not newly true.`);
//       return null;
//     }

//     const { logId } = context.params;
//     const userId = newData.userId;
//     const exercises = newData.exercises;
//     const completedDate = newData.completedDate || newData.date || admin.firestore.Timestamp.now();

//     if (!userId || !exercises || exercises.length === 0) {
//       functions.logger.error(`Missing userId or exercises in workout log ${logId}.`);
//       return null;
//     }

//     functions.logger.info(`Processing workout for user ${userId}, log ${logId}.`);

//     // --- Cache for metadata and user data ---
//     const userBodyweightCache = new Map();
//     const exerciseMetadataCache = new Map();

//     // --- Constants for Enhanced Analytics ---
//     const COMPOUND_LIFTS = new Set([
//       'squat', 'bench press', 'deadlift', 'overhead press', 'military press',
//       'front squat', 'incline bench press', 'sumo deadlift', 'rdl'
//     ]);

//     const REP_RANGES = {
//       '1RM': { min: 1, max: 1 },
//       '3RM': { min: 2, max: 3 },
//       '5RM': { min: 4, max: 5 },
//       '8RM': { min: 6, max: 8 },
//       '12RM': { min: 9, max: 12 },
//       '15RM': { min: 13, max: 20 }
//     };

//     // RPE to percentage of 1RM mapping (approximate)
//     const RPE_TO_PERCENTAGE = {
//       10: 1.00, 9.5: 0.98, 9: 0.96, 8.5: 0.94, 8: 0.92,
//       7.5: 0.90, 7: 0.88, 6.5: 0.86, 6: 0.84, 5: 0.82
//     };

//     // --- Helper Functions ---
//     async function getUserBodyweight(userId) {
//       if (userBodyweightCache.has(userId)) {
//         return userBodyweightCache.get(userId);
//       }
      
//       try {
//         const userDoc = await db.collection('users').doc(userId).get();
//         if (userDoc.exists) {
//           const userData = userDoc.data();
//           const bodyweight = userData.weightLbs || 0;
//           userBodyweightCache.set(userId, bodyweight);
//           return bodyweight;
//         } else {
//           userBodyweightCache.set(userId, 0);
//           return 0;
//         }
//       } catch (error) {
//         functions.logger.error(`Error fetching user profile for ${userId}:`, error);
//         userBodyweightCache.set(userId, 0);
//         return 0;
//       }
//     }

//     async function getExerciseMetadata(exerciseId) {
//       if (exerciseMetadataCache.has(exerciseId)) {
//         return exerciseMetadataCache.get(exerciseId);
//       }
      
//       try {
//         const doc = await db.collection('exercises').doc(exerciseId).get();
//         if (doc.exists) {
//           const data = doc.data();
//           const exerciseName = data.name || 'Unknown';
//           const metadata = {
//             name: exerciseName,
//             muscleGroup: data.primaryMuscleGroup || 'Unknown',
//             exerciseType: data.exerciseType || 'Unknown',
//             isCompoundLift: COMPOUND_LIFTS.has(exerciseName.toLowerCase()),
//             movementPattern: data.movementPattern || 'Unknown',
//             equipment: data.equipment || 'Unknown'
//           };
//           exerciseMetadataCache.set(exerciseId, metadata);
//           return metadata;
//         } else {
//           const defaultMetadata = {
//             name: 'Unknown',
//             muscleGroup: 'Unknown',
//             exerciseType: 'Unknown',
//             isCompoundLift: false,
//             movementPattern: 'Unknown',
//             equipment: 'Unknown'
//           };
//           exerciseMetadataCache.set(exerciseId, defaultMetadata);
//           return defaultMetadata;
//         }
//       } catch (error) {
//         functions.logger.error(`Error fetching exercise metadata for ${exerciseId}:`, error);
//         const defaultMetadata = {
//           name: 'Unknown',
//           muscleGroup: 'Unknown',
//           exerciseType: 'Unknown',
//           isCompoundLift: false,
//           movementPattern: 'Unknown',
//           equipment: 'Unknown'
//         };
//         exerciseMetadataCache.set(exerciseId, defaultMetadata);
//         return defaultMetadata;
//       }
//     }

//     // --- Enhanced Analytics Helper Functions ---
    
//     /**
//      * Calculate effective RPE based on percentage of e1RM and rep count
//      */
//     function calculateEffectiveRPE(weight, reps, e1RM) {
//       if (e1RM === 0) return 5; // Default low RPE if no e1RM available
      
//       const percentage = weight / e1RM;
      
//       // Adjust for rep count - higher reps at same percentage = higher RPE
//       const repAdjustment = Math.max(0, (reps - 5) * 0.02);
//       const adjustedPercentage = percentage + repAdjustment;
      
//       // Find closest RPE
//       let closestRPE = 5;
//       let minDiff = Infinity;
      
//       for (const [rpe, pct] of Object.entries(RPE_TO_PERCENTAGE)) {
//         const diff = Math.abs(adjustedPercentage - pct);
//         if (diff < minDiff) {
//           minDiff = diff;
//           closestRPE = parseFloat(rpe);
//         }
//       }
      
//       return closestRPE;
//     }

//     /**
//      * Calculate effective reps (reps performed at RPE 7+ equivalent)
//      */
//     function calculateEffectiveReps(sets, e1RM) {
//       let effectiveReps = 0;
      
//       for (const set of sets) {
//         const weight = set.weight || 0;
//         const reps = set.reps || 0;
        
//         if (reps > 0 && weight > 0) {
//           const rpe = calculateEffectiveRPE(weight, reps, e1RM);
//           if (rpe >= 7) {
//             // Scale reps based on how much above RPE 7 they are
//             const rpeMultiplier = Math.min(2.0, (rpe - 6) / 4); // Max 2x multiplier at RPE 10
//             effectiveReps += reps * rpeMultiplier;
//           }
//         }
//       }
      
//       return Math.round(effectiveReps);
//     }

//     /**
//      * Determine rep range category for PR tracking
//      */
//     function getRepRangeCategory(reps) {
//       for (const [category, range] of Object.entries(REP_RANGES)) {
//         if (reps >= range.min && reps <= range.max) {
//           return category;
//         }
//       }
//       return '15RM'; // Default for high rep work
//     }

//     /**
//      * Calculate exercise staleness score (days since last variation)
//      */
//     async function calculateStalenessScore(exerciseId, userId, currentDate) {
//       try {
//         // Look for recent workouts with this exercise
//         const recentWorkouts = await db.collectionGroup('workoutLogs')
//           .where('userId', '==', userId)
//           .where('isWorkoutFinished', '==', true)
//           .orderBy('completedDate', 'desc')
//           .limit(20)
//           .get();

//         let daysSinceVariation = 0;
//         let foundVariation = false;
        
//         for (const doc of recentWorkouts.docs) {
//           const workoutData = doc.data();
//           const workoutDate = workoutData.completedDate || workoutData.date;
          
//           if (workoutDate) {
//             const daysDiff = Math.floor((currentDate.toMillis() - workoutDate.toMillis()) / (1000 * 60 * 60 * 24));
            
//             // Check if this workout contains the same exercise
//             const hasExercise = workoutData.exercises?.some(ex => ex.exerciseId === exerciseId);
            
//             if (hasExercise) {
//               daysSinceVariation = daysDiff;
//             } else {
//               // Check for similar exercises (same movement pattern)
//               const metadata = await getExerciseMetadata(exerciseId);
//               const hasSimilarExercise = workoutData.exercises?.some(async ex => {
//                 const exMetadata = await getExerciseMetadata(ex.exerciseId);
//                 return exMetadata.movementPattern === metadata.movementPattern;
//               });
              
//               if (hasSimilarExercise) {
//                 foundVariation = true;
//                 break;
//               }
//             }
//           }
//         }
        
//         // Return staleness score (0-100, higher = more stale)
//         if (foundVariation) {
//           return Math.min(100, daysSinceVariation * 2); // 2 points per day
//         } else {
//           return Math.min(100, daysSinceVariation * 3); // 3 points per day if no variation
//         }
        
//       } catch (error) {
//         functions.logger.error(`Error calculating staleness for exercise ${exerciseId}:`, error);
//         return 0;
//       }
//     }

//     // --- Advanced Analytics Functions ---
    
//     /**
//      * Detect plateau in exercise progress
//      */
//     async function detectPlateau(exerciseId, userId) {
//       try {
//         const recentWorkouts = await db.collectionGroup('workoutLogs')
//           .where('userId', '==', userId)
//           .where('isWorkoutFinished', '==', true)
//           .orderBy('completedDate', 'desc')
//           .limit(10)
//           .get();

//         const e1RMHistory = [];
        
//         for (const doc of recentWorkouts.docs) {
//           const workoutData = doc.data();
//           const exercise = workoutData.exercises?.find(ex => ex.exerciseId === exerciseId);
          
//           if (exercise) {
//             let maxE1RM = 0;
//             const metadata = await getExerciseMetadata(exerciseId);
            
//             if (exercise.sets && Array.isArray(exercise.sets)) {
//               // Current data structure with sets array
//               for (const set of exercise.sets) {
//                 const weight = set.weight || 0;
//                 const reps = set.reps || 0;
//                 if (reps > 0) {
//                   let effectiveWeight = weight;
//                   if (metadata.exerciseType === 'Bodyweight') {
//                     effectiveWeight = await getUserBodyweight(userId);
//                   } else if (metadata.exerciseType === 'Bodyweight Loadable') {
//                     effectiveWeight = await getUserBodyweight(userId) + weight;
//                   }
//                   const setE1RM = effectiveWeight * (1 + (reps / 30));
//                   maxE1RM = Math.max(maxE1RM, setE1RM);
//                 }
//               }
//             } else {
//               // Historical data structure with separate arrays
//               const repsList = exercise.reps || [];
//               const weightList = exercise.weights || [];
//               const completedList = exercise.completed || [];
//               const numSets = Math.min(repsList.length, weightList.length, completedList.length);

//               for (let i = 0; i < numSets; i++) {
//                 if (completedList[i]) {
//                   const reps = parseInt(repsList[i]) || 0;
//                   const weight = parseInt(weightList[i]) || 0;
                  
//                   if (reps > 0) {
//                     let effectiveWeight = weight;
//                     if (metadata.exerciseType === 'Bodyweight') {
//                       effectiveWeight = await getUserBodyweight(userId);
//                     } else if (metadata.exerciseType === 'Bodyweight Loadable') {
//                       effectiveWeight = await getUserBodyweight(userId) + weight;
//                     }
//                     const setE1RM = effectiveWeight * (1 + (reps / 30));
//                     maxE1RM = Math.max(maxE1RM, setE1RM);
//                   }
//                 }
//               }
//             }
            
//             if (maxE1RM > 0) {
//               e1RMHistory.push({
//                 date: workoutData.completedDate || workoutData.date,
//                 e1RM: maxE1RM
//               });
//             }
//           }
//         }

//         if (e1RMHistory.length < 4) {
//           return { isPlateaued: false, plateauDays: 0, trend: 'insufficient_data' };
//         }

//         // Sort by date (oldest first)
//         e1RMHistory.sort((a, b) => a.date.toMillis() - b.date.toMillis());
        
//         // Check for plateau (no improvement in last 4 workouts)
//         const recent4 = e1RMHistory.slice(-4);
//         const maxRecent = Math.max(...recent4.map(h => h.e1RM));
//         const isPlateaued = recent4.every(h => h.e1RM <= maxRecent * 1.02); // Allow 2% variance
        
//         // Calculate trend
//         const first2Avg = (recent4[0].e1RM + recent4[1].e1RM) / 2;
//         const last2Avg = (recent4[2].e1RM + recent4[3].e1RM) / 2;
//         const trendPercent = ((last2Avg - first2Avg) / first2Avg) * 100;
        
//         let trend = 'stable';
//         if (trendPercent > 2) trend = 'improving';
//         else if (trendPercent < -2) trend = 'declining';
        
//         const plateauDays = isPlateaued ?
//           Math.floor((recent4[3].date.toMillis() - recent4[0].date.toMillis()) / (1000 * 60 * 60 * 24)) : 0;

//         return { isPlateaued, plateauDays, trend, trendPercent };
        
//       } catch (error) {
//         functions.logger.error(`Error detecting plateau for exercise ${exerciseId}:`, error);
//         return { isPlateaued: false, plateauDays: 0, trend: 'error' };
//       }
//     }

//     /**
//      * Calculate muscle balance ratios
//      */
//     async function calculateMuscleBalance(userId) {
//       try {
//         const exerciseAnalytics = await db.collection('userAnalytics')
//           .doc(userId)
//           .collection('exerciseAnalytics')
//           .get();

//         const muscleGroupStrength = {};
        
//         exerciseAnalytics.docs.forEach(doc => {
//           const data = doc.data();
//           const muscleGroup = data.muscleGroup;
//           const e1RM = data.e1RM || 0;
          
//           if (!muscleGroupStrength[muscleGroup]) {
//             muscleGroupStrength[muscleGroup] = [];
//           }
//           muscleGroupStrength[muscleGroup].push(e1RM);
//         });

//         // Calculate average strength per muscle group
//         const avgStrength = {};
//         for (const [muscle, strengths] of Object.entries(muscleGroupStrength)) {
//           avgStrength[muscle] = strengths.reduce((sum, s) => sum + s, 0) / strengths.length;
//         }

//         // Calculate key ratios
//         const ratios = {};
        
//         // Push/Pull ratio
//         const pushMuscles = ['Chest', 'Shoulders', 'Triceps'];
//         const pullMuscles = ['Back', 'Biceps'];
        
//         const pushStrength = pushMuscles.reduce((sum, muscle) => sum + (avgStrength[muscle] || 0), 0);
//         const pullStrength = pullMuscles.reduce((sum, muscle) => sum + (avgStrength[muscle] || 0), 0);
        
//         if (pullStrength > 0) {
//           ratios.pushPullRatio = pushStrength / pullStrength;
//         }

//         // Quad/Hamstring ratio
//         if (avgStrength['Quadriceps'] && avgStrength['Hamstrings']) {
//           ratios.quadHamstringRatio = avgStrength['Quadriceps'] / avgStrength['Hamstrings'];
//         }

//         return { muscleGroupStrength: avgStrength, ratios };
        
//       } catch (error) {
//         functions.logger.error(`Error calculating muscle balance for user ${userId}:`, error);
//         return { muscleGroupStrength: {}, ratios: {} };
//       }
//     }

//     try {
//       const userAnalyticsRef = db.collection('userAnalytics').doc(userId);
//       const monthStr = new Date().toISOString().slice(0, 7); // YYYY-MM format
//       const monthlyAnalyticsRef = userAnalyticsRef.collection('monthlyAnalytics').doc(monthStr);

//       // --- Process Each Exercise in the Workout ---
//       for (const exercise of exercises) {
//         const exerciseId = exercise.exerciseId;
//         if (!exerciseId) {
//           functions.logger.warn(`Skipping exercise due to missing exerciseId: ${JSON.stringify(exercise)}`);
//           continue;
//         }

//         // Get exercise metadata
//         const metadata = await getExerciseMetadata(exerciseId);
//         functions.logger.info(`Processing exercise: ${exercise.exerciseName || exerciseId} (Type: ${metadata.exerciseType}, Compound: ${metadata.isCompoundLift})`);

//         let workoutE1RM = 0;
//         let workoutVolume = 0;
//         let workoutTotalReps = 0;
//         let workoutTotalSets = 0;
//         let workoutEffectiveReps = 0;
//         let intensityDistribution = {};
//         let prsByRepRange = {};
//         let averageIntensityPercent = 0;
//         let totalIntensitySum = 0;
//         let validSetsForIntensity = 0;

//         // Get current e1RM for intensity calculations
//         const exerciseAnalyticsDocRef = userAnalyticsRef.collection('exerciseAnalytics').doc(exerciseId);
//         const currentAnalytics = await exerciseAnalyticsDocRef.get();
//         const currentE1RM = currentAnalytics.exists ? (currentAnalytics.data().e1RM || 0) : 0;

//         // --- Handle both historical and current data structures ---
//         if (exercise.sets && Array.isArray(exercise.sets)) {
//           // Current data structure with sets array
//           workoutTotalSets = exercise.sets.length;
          
//           for (const set of exercise.sets) {
//             const weight = set.weight || 0;
//             const reps = set.reps || 0;
            
//             if (reps > 0) {
//               // Handle bodyweight exercises
//               let effectiveWeight = weight;
//               if (metadata.exerciseType === 'Bodyweight') {
//                 effectiveWeight = await getUserBodyweight(userId);
//               } else if (metadata.exerciseType === 'Bodyweight Loadable') {
//                 effectiveWeight = await getUserBodyweight(userId) + weight;
//               }

//               const setE1RM = effectiveWeight * (1 + (reps / 30));
//               if (setE1RM > workoutE1RM) {
//                 workoutE1RM = setE1RM;
//               }
//               workoutVolume += effectiveWeight * reps;
//               workoutTotalReps += reps;

//               // --- Enhanced Analytics Calculations ---
              
//               // Calculate intensity percentage
//               if (currentE1RM > 0) {
//                 const intensityPercent = Math.round((effectiveWeight / currentE1RM) * 100);
//                 totalIntensitySum += intensityPercent;
//                 validSetsForIntensity++;
                
//                 // Track intensity distribution
//                 const intensityBucket = Math.floor(intensityPercent / 10) * 10; // Round to nearest 10%
//                 intensityDistribution[intensityBucket] = (intensityDistribution[intensityBucket] || 0) + 1;
//               }

//               // Track PRs by rep range
//               const repRange = getRepRangeCategory(reps);
//               if (!prsByRepRange[repRange] || setE1RM > prsByRepRange[repRange].e1RM) {
//                 prsByRepRange[repRange] = {
//                   e1RM: setE1RM,
//                   weight: effectiveWeight,
//                   reps: reps,
//                   date: completedDate
//                 };
//               }
//             }
//           }

//           // Calculate effective reps for this exercise
//           workoutEffectiveReps = calculateEffectiveReps(exercise.sets.map(set => ({
//             weight: set.weight || 0,
//             reps: set.reps || 0
//           })), currentE1RM);
//         } else {
//           // Historical data structure with separate arrays
//           const repsList = exercise.reps || [];
//           const weightList = exercise.weights || [];
//           const completedList = exercise.completed || [];
//           const numSets = Math.min(repsList.length, weightList.length, completedList.length);

//           if (numSets === 0) {
//             functions.logger.warn(`Skipping exercise '${exercise.exerciseName || exerciseId}' due to empty set data.`);
//             continue;
//           }

//           const completedSets = [];
//           for (let i = 0; i < numSets; i++) {
//             // Only process completed sets
//             if (completedList[i]) {
//               const reps = parseInt(repsList[i]) || 0;
//               const weight = parseInt(weightList[i]) || 0;
              
//               if (reps > 0) {
//                 // Handle bodyweight exercises
//                 let effectiveWeight = weight;
//                 if (metadata.exerciseType === 'Bodyweight') {
//                   effectiveWeight = await getUserBodyweight(userId);
//                 } else if (metadata.exerciseType === 'Bodyweight Loadable') {
//                   effectiveWeight = await getUserBodyweight(userId) + weight;
//                 }

//                 const setE1RM = effectiveWeight * (1 + (reps / 30));
//                 if (setE1RM > workoutE1RM) {
//                   workoutE1RM = setE1RM;
//                 }
//                 workoutVolume += effectiveWeight * reps;
//                 workoutTotalReps += reps;
//                 workoutTotalSets += 1; // Only count completed sets

//                 // --- Enhanced Analytics Calculations ---
                
//                 // Calculate intensity percentage
//                 if (currentE1RM > 0) {
//                   const intensityPercent = Math.round((effectiveWeight / currentE1RM) * 100);
//                   totalIntensitySum += intensityPercent;
//                   validSetsForIntensity++;
                  
//                   // Track intensity distribution
//                   const intensityBucket = Math.floor(intensityPercent / 10) * 10; // Round to nearest 10%
//                   intensityDistribution[intensityBucket] = (intensityDistribution[intensityBucket] || 0) + 1;
//                 }

//                 // Track PRs by rep range
//                 const repRange = getRepRangeCategory(reps);
//                 if (!prsByRepRange[repRange] || setE1RM > prsByRepRange[repRange].e1RM) {
//                   prsByRepRange[repRange] = {
//                     e1RM: setE1RM,
//                     weight: effectiveWeight,
//                     reps: reps,
//                     date: completedDate
//                   };
//                 }

//                 // Store for effective reps calculation
//                 completedSets.push({ weight: effectiveWeight, reps: reps });
//               }
//             }
//           }

//           // Calculate effective reps for this exercise
//           workoutEffectiveReps = calculateEffectiveReps(completedSets, currentE1RM);
//         }

//         // Calculate average intensity percentage
//         if (validSetsForIntensity > 0) {
//           averageIntensityPercent = Math.round(totalIntensitySum / validSetsForIntensity);
//         }

//         // Calculate staleness score
//         const stalenessScore = await calculateStalenessScore(exerciseId, userId, completedDate);

//         // Detect plateau for this exercise
//         const plateauData = await detectPlateau(exerciseId, userId);

//         const exerciseAnalyticsRef = userAnalyticsRef.collection('exerciseAnalytics').doc(exerciseId);

//         // --- Firestore Transaction for Atomic Updates ---
//         await db.runTransaction(async (transaction) => {
//           const exerciseDoc = await transaction.get(exerciseAnalyticsRef);

//           // Prepare enhanced analytics data
//           const enhancedData = {
//             exerciseName: metadata.name,
//             muscleGroup: metadata.muscleGroup,
//             exerciseType: metadata.exerciseType,
//             isCompoundLift: metadata.isCompoundLift,
//             movementPattern: metadata.movementPattern,
//             equipment: metadata.equipment,
//             e1RM: workoutE1RM,
//             totalVolume: workoutVolume,
//             totalSets: workoutTotalSets,
//             totalReps: workoutTotalReps,
//             totalEffectiveReps: workoutEffectiveReps,
//             averageIntensity: workoutTotalReps > 0 ? workoutVolume / workoutTotalReps : 0,
//             averageIntensityPercent: averageIntensityPercent,
//             intensityDistribution: intensityDistribution,
//             stalenessScore: stalenessScore,
//             plateauData: plateauData,
//             lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
//           };

//           if (!exerciseDoc.exists) {
//             // Document doesn't exist, create it
//             transaction.set(exerciseAnalyticsRef, enhancedData);
//           } else {
//             // Document exists, update it
//             const existingData = exerciseDoc.data();
//             const newTotalVolume = (existingData.totalVolume || 0) + workoutVolume;
//             const newTotalReps = (existingData.totalReps || 0) + workoutTotalReps;
//             const newTotalEffectiveReps = (existingData.totalEffectiveReps || 0) + workoutEffectiveReps;

//             // Merge intensity distributions
//             const mergedIntensityDistribution = { ...(existingData.intensityDistribution || {}) };
//             for (const [bucket, count] of Object.entries(intensityDistribution)) {
//               mergedIntensityDistribution[bucket] = (mergedIntensityDistribution[bucket] || 0) + count;
//             }

//             transaction.update(exerciseAnalyticsRef, {
//               ...enhancedData,
//               e1RM: workoutE1RM > (existingData.e1RM || 0) ? workoutE1RM : existingData.e1RM,
//               totalVolume: newTotalVolume,
//               totalSets: (existingData.totalSets || 0) + workoutTotalSets,
//               totalReps: newTotalReps,
//               totalEffectiveReps: newTotalEffectiveReps,
//               averageIntensity: newTotalReps > 0 ? newTotalVolume / newTotalReps : 0,
//               intensityDistribution: mergedIntensityDistribution,
//             });
//           }
//         });

//         // --- Store PR History in Subcollection ---
//         for (const [repRange, prData] of Object.entries(prsByRepRange)) {
//           const prHistoryRef = exerciseAnalyticsRef.collection('prHistory').doc(repRange);
          
//           await db.runTransaction(async (transaction) => {
//             const prDoc = await transaction.get(prHistoryRef);
            
//             if (!prDoc.exists || prData.e1RM > (prDoc.data().e1RM || 0)) {
//               transaction.set(prHistoryRef, {
//                 repRange: repRange,
//                 e1RM: prData.e1RM,
//                 weight: prData.weight,
//                 reps: prData.reps,
//                 achievedDate: prData.date,
//                 exerciseName: metadata.name,
//                 lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
//               });
//             }
//           });
//         }
//       }

//       // --- Update Monthly Aggregates with Enhanced Analytics ---
//       await db.runTransaction(async (transaction) => {
//         const monthlyDoc = await transaction.get(monthlyAnalyticsRef);
        
//         // Calculate total workout volume and muscle group distribution
//         let totalWorkoutVolume = 0;
//         let totalEffectiveReps = 0;
//         const muscleGroupVolume = {};
//         const compoundLiftVolume = {};
        
//         for (const exercise of exercises) {
//           const metadata = await getExerciseMetadata(exercise.exerciseId);
//           let exerciseVolume = 0;
//           let exerciseEffectiveReps = 0;
          
//           if (exercise.sets && Array.isArray(exercise.sets)) {
//             // Current data structure
//             for (const set of exercise.sets) {
//               const weight = set.weight || 0;
//               const reps = set.reps || 0;
//               if (reps > 0) {
//                 let effectiveWeight = weight;
//                 if (metadata.exerciseType === 'Bodyweight') {
//                   effectiveWeight = await getUserBodyweight(userId);
//                 } else if (metadata.exerciseType === 'Bodyweight Loadable') {
//                   effectiveWeight = await getUserBodyweight(userId) + weight;
//                 }
//                 exerciseVolume += effectiveWeight * reps;
//               }
//             }
//             exerciseEffectiveReps = calculateEffectiveReps(exercise.sets.map(set => ({
//               weight: set.weight || 0,
//               reps: set.reps || 0
//             })), 0); // Use 0 for e1RM since we don't have it here
//           } else {
//             // Historical data structure
//             const repsList = exercise.reps || [];
//             const weightList = exercise.weights || [];
//             const completedList = exercise.completed || [];
//             const numSets = Math.min(repsList.length, weightList.length, completedList.length);
//             const completedSets = [];
            
//             for (let i = 0; i < numSets; i++) {
//               if (completedList[i]) {
//                 const reps = parseInt(repsList[i]) || 0;
//                 const weight = parseInt(weightList[i]) || 0;
//                 if (reps > 0) {
//                   let effectiveWeight = weight;
//                   if (metadata.exerciseType === 'Bodyweight') {
//                     effectiveWeight = await getUserBodyweight(userId);
//                   } else if (metadata.exerciseType === 'Bodyweight Loadable') {
//                     effectiveWeight = await getUserBodyweight(userId) + weight;
//                   }
//                   exerciseVolume += effectiveWeight * reps;
//                   completedSets.push({ weight: effectiveWeight, reps: reps });
//                 }
//               }
//             }
//             exerciseEffectiveReps = calculateEffectiveReps(completedSets, 0);
//           }
          
//           totalWorkoutVolume += exerciseVolume;
//           totalEffectiveReps += exerciseEffectiveReps;
          
//           // Track muscle group volume
//           const muscleGroup = metadata.muscleGroup;
//           muscleGroupVolume[muscleGroup] = (muscleGroupVolume[muscleGroup] || 0) + exerciseVolume;
          
//           // Track compound lift volume
//           if (metadata.isCompoundLift) {
//             compoundLiftVolume[metadata.name] = (compoundLiftVolume[metadata.name] || 0) + exerciseVolume;
//           }
//         }

//         // Calculate muscle balance ratios
//         const muscleBalance = await calculateMuscleBalance(userId);

//         const monthlyData = {
//           totalVolume: totalWorkoutVolume,
//           totalWorkouts: 1,
//           totalEffectiveReps: totalEffectiveReps,
//           muscleGroupVolume: muscleGroupVolume,
//           compoundLiftVolume: compoundLiftVolume,
//           muscleBalance: muscleBalance,
//           lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
//         };

//         if (!monthlyDoc.exists) {
//           transaction.set(monthlyAnalyticsRef, monthlyData);
//         } else {
//           const existingData = monthlyDoc.data();
          
//           // Merge muscle group volumes
//           const mergedMuscleGroupVolume = { ...(existingData.muscleGroupVolume || {}) };
//           for (const [muscle, volume] of Object.entries(muscleGroupVolume)) {
//             mergedMuscleGroupVolume[muscle] = (mergedMuscleGroupVolume[muscle] || 0) + volume;
//           }
          
//           // Merge compound lift volumes
//           const mergedCompoundLiftVolume = { ...(existingData.compoundLiftVolume || {}) };
//           for (const [lift, volume] of Object.entries(compoundLiftVolume)) {
//             mergedCompoundLiftVolume[lift] = (mergedCompoundLiftVolume[lift] || 0) + volume;
//           }

//           transaction.update(monthlyAnalyticsRef, {
//             totalVolume: admin.firestore.FieldValue.increment(totalWorkoutVolume),
//             totalWorkouts: admin.firestore.FieldValue.increment(1),
//             totalEffectiveReps: admin.firestore.FieldValue.increment(totalEffectiveReps),
//             muscleGroupVolume: mergedMuscleGroupVolume,
//             compoundLiftVolume: mergedCompoundLiftVolume,
//             muscleBalance: muscleBalance, // Update with latest calculation
//             lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
//           });
//         }
//       });

//       functions.logger.info(`Successfully processed workout ${logId} for user ${userId}.`);
//       return null;

//     } catch (error) {
//       functions.logger.error(`Error processing workout ${logId} for user ${userId}:`, error);
//       throw new functions.https.HttpsError('internal', 'Failed to process workout.', error.message);
//     }
//   } catch (error) {
//     functions.logger.error(`Error in processWorkoutManually:`, error);
//     throw new functions.https.HttpsError('internal', 'Failed to process workout.', error.message);
//   }
// });

/**
 * Cloud Function to generate AI coaching insights based on user analytics
 * Called on-demand to provide personalized training recommendations
 */
exports.generateCoachingInsights = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const userId = context.auth.uid;
  functions.logger.info(`Generating coaching insights for user ${userId}`);

  try {
    // Fetch user analytics
    const userAnalyticsRef = db.collection('userAnalytics').doc(userId);
    const exerciseAnalytics = await userAnalyticsRef.collection('exerciseAnalytics').get();
    
    if (exerciseAnalytics.empty) {
      return {
        insights: [],
        recommendations: [],
        message: 'Complete more workouts to receive personalized insights.'
      };
    }

    const insights = [];
    const recommendations = [];
    
    // Analyze each exercise for insights
    for (const doc of exerciseAnalytics.docs) {
      const exerciseData = doc.data();
      const exerciseId = doc.id;
      
      // Plateau Detection Insights
      if (exerciseData.plateauData?.isPlateaued) {
        insights.push({
          type: 'plateau',
          severity: 'warning',
          exercise: exerciseData.exerciseName,
          message: `${exerciseData.exerciseName} has plateaued for ${exerciseData.plateauData.plateauDays} days`,
          data: exerciseData.plateauData
        });
        
        recommendations.push({
          type: 'plateau_break',
          exercise: exerciseData.exerciseName,
          priority: 'high',
          suggestion: 'Try deload week, change rep ranges, or switch to a variation',
          details: {
            currentE1RM: exerciseData.e1RM,
            stalenessScore: exerciseData.stalenessScore
          }
        });
      }
      
      // Staleness Detection
      if (exerciseData.stalenessScore > 70) {
        insights.push({
          type: 'staleness',
          severity: 'medium',
          exercise: exerciseData.exerciseName,
          message: `${exerciseData.exerciseName} may benefit from variation (staleness: ${exerciseData.stalenessScore}/100)`,
          data: { stalenessScore: exerciseData.stalenessScore }
        });
        
        recommendations.push({
          type: 'exercise_variation',
          exercise: exerciseData.exerciseName,
          priority: 'medium',
          suggestion: `Consider switching to a ${exerciseData.movementPattern} variation`,
          details: {
            movementPattern: exerciseData.movementPattern,
            equipment: exerciseData.equipment
          }
        });
      }
      
      // Intensity Analysis
      if (exerciseData.averageIntensityPercent < 70 && exerciseData.isCompoundLift) {
        insights.push({
          type: 'low_intensity',
          severity: 'info',
          exercise: exerciseData.exerciseName,
          message: `${exerciseData.exerciseName} average intensity is ${exerciseData.averageIntensityPercent}% - consider heavier loads`,
          data: { averageIntensityPercent: exerciseData.averageIntensityPercent }
        });
        
        recommendations.push({
          type: 'intensity_increase',
          exercise: exerciseData.exerciseName,
          priority: 'medium',
          suggestion: 'Increase weight and reduce reps for strength gains',
          details: {
            currentIntensity: exerciseData.averageIntensityPercent,
            targetIntensity: '80-90%'
          }
        });
      }
      
      // Effective Reps Analysis
      const effectiveRepsRatio = exerciseData.totalReps > 0 ?
        (exerciseData.totalEffectiveReps / exerciseData.totalReps) : 0;
      
      if (effectiveRepsRatio < 0.3 && exerciseData.totalReps > 50) {
        insights.push({
          type: 'low_effective_reps',
          severity: 'info',
          exercise: exerciseData.exerciseName,
          message: `Only ${Math.round(effectiveRepsRatio * 100)}% of reps are at challenging intensity`,
          data: { effectiveRepsRatio: effectiveRepsRatio }
        });
        
        recommendations.push({
          type: 'intensity_focus',
          exercise: exerciseData.exerciseName,
          priority: 'low',
          suggestion: 'Focus on quality over quantity - train closer to failure',
          details: {
            effectiveRepsRatio: effectiveRepsRatio,
            totalReps: exerciseData.totalReps,
            effectiveReps: exerciseData.totalEffectiveReps
          }
        });
      }
    }
    
    // Get muscle balance insights
    const muscleBalance = await calculateMuscleBalance(userId);
    
    // Push/Pull Balance
    if (muscleBalance.ratios.pushPullRatio) {
      if (muscleBalance.ratios.pushPullRatio > 1.3) {
        insights.push({
          type: 'muscle_imbalance',
          severity: 'warning',
          message: `Push muscles significantly stronger than pull (ratio: ${muscleBalance.ratios.pushPullRatio.toFixed(2)}:1)`,
          data: muscleBalance.ratios
        });
        
        recommendations.push({
          type: 'balance_correction',
          priority: 'high',
          suggestion: 'Increase pulling exercises (rows, pull-ups, face pulls)',
          details: { imbalanceType: 'push_dominant', ratio: muscleBalance.ratios.pushPullRatio }
        });
      } else if (muscleBalance.ratios.pushPullRatio < 0.7) {
        insights.push({
          type: 'muscle_imbalance',
          severity: 'warning',
          message: `Pull muscles significantly stronger than push (ratio: ${muscleBalance.ratios.pushPullRatio.toFixed(2)}:1)`,
          data: muscleBalance.ratios
        });
        
        recommendations.push({
          type: 'balance_correction',
          priority: 'high',
          suggestion: 'Increase pushing exercises (bench press, overhead press, dips)',
          details: { imbalanceType: 'pull_dominant', ratio: muscleBalance.ratios.pushPullRatio }
        });
      }
    }
    
    // Quad/Hamstring Balance
    if (muscleBalance.ratios.quadHamstringRatio) {
      if (muscleBalance.ratios.quadHamstringRatio > 1.5) {
        insights.push({
          type: 'muscle_imbalance',
          severity: 'warning',
          message: `Quadriceps significantly stronger than hamstrings (ratio: ${muscleBalance.ratios.quadHamstringRatio.toFixed(2)}:1)`,
          data: muscleBalance.ratios
        });
        
        recommendations.push({
          type: 'balance_correction',
          priority: 'high',
          suggestion: 'Increase hamstring exercises (Romanian deadlifts, leg curls)',
          details: { imbalanceType: 'quad_dominant', ratio: muscleBalance.ratios.quadHamstringRatio }
        });
      }
    }
    
    // Sort recommendations by priority
    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    recommendations.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
    
    // Limit to top 10 recommendations
    const topRecommendations = recommendations.slice(0, 10);
    
    functions.logger.info(`Generated ${insights.length} insights and ${topRecommendations.length} recommendations for user ${userId}`);
    
    return {
      insights: insights,
      recommendations: topRecommendations,
      muscleBalance: muscleBalance,
      generatedAt: admin.firestore.FieldValue.serverTimestamp(),
      message: insights.length > 0 ? 'Analysis complete - check your insights!' : 'Great work! Keep up the consistent training.'
    };
    
  } catch (error) {
    functions.logger.error(`Error generating coaching insights for user ${userId}:`, error);
    throw new functions.https.HttpsError('internal', 'Failed to generate insights.', error.message);
  }
});

/**
 * Callable Cloud Function to process completed workouts
 * Triggered manually when user clicks "Finish Workout"
 */
exports.processWorkoutManually = functions.https.onCall(async (data, context) => {
  // Authentication check
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const { workoutLogId } = data;
  const userId = context.auth.uid;

  if (!workoutLogId) {
    throw new functions.https.HttpsError('invalid-argument', 'workoutLogId is required.');
  }

  try {
    // Get the workout log
    const workoutLogRef = db.collection('workoutLogs').doc(workoutLogId);
    const workoutLogDoc = await workoutLogRef.get();

    if (!workoutLogDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Workout log not found.');
    }

    const workoutData = workoutLogDoc.data();

    // Verify the user owns this workout
    if (workoutData.userId !== userId) {
      throw new functions.https.HttpsError('permission-denied', 'You can only process your own workouts.');
    }

    // Verify the workout is finished
    if (!workoutData.isWorkoutFinished) {
      throw new functions.https.HttpsError('failed-precondition', 'Workout must be finished before processing.');
    }

    const logId = workoutLogId;
    const exercises = workoutData.exercises;
    const completedDate = workoutData.completedDate || workoutData.date || admin.firestore.Timestamp.now();

    if (!exercises || exercises.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'No exercises found in workout log.');
    }

    functions.logger.info(`Processing workout for user ${userId}, log ${logId}.`);

    // --- Cache for metadata and user data ---
    const userBodyweightCache = new Map();
    const exerciseMetadataCache = new Map();

    // --- Constants for Enhanced Analytics ---
    const COMPOUND_LIFTS = new Set([
      'squat', 'bench press', 'deadlift', 'overhead press', 'military press',
      'front squat', 'incline bench press', 'sumo deadlift', 'rdl'
    ]);

    const REP_RANGES = {
      '1RM': { min: 1, max: 1 },
      '3RM': { min: 2, max: 3 },
      '5RM': { min: 4, max: 5 },
      '8RM': { min: 6, max: 8 },
      '12RM': { min: 9, max: 12 },
      '15RM': { min: 13, max: 20 }
    };

    // RPE to percentage of 1RM mapping (approximate)
    const RPE_TO_PERCENTAGE = {
      10: 1.00, 9.5: 0.98, 9: 0.96, 8.5: 0.94, 8: 0.92,
      7.5: 0.90, 7: 0.88, 6.5: 0.86, 6: 0.84, 5: 0.82
    };

    // --- Helper Functions ---
    async function getUserBodyweight(userId) {
      if (userBodyweightCache.has(userId)) {
        return userBodyweightCache.get(userId);
      }
      
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          const bodyweight = userData.weightLbs || 0;
          userBodyweightCache.set(userId, bodyweight);
          return bodyweight;
        } else {
          userBodyweightCache.set(userId, 0);
          return 0;
        }
      } catch (error) {
        functions.logger.error(`Error fetching user profile for ${userId}:`, error);
        userBodyweightCache.set(userId, 0);
        return 0;
      }
    }

    async function getExerciseMetadata(exerciseId) {
      if (exerciseMetadataCache.has(exerciseId)) {
        return exerciseMetadataCache.get(exerciseId);
      }
      
      try {
        const doc = await db.collection('exercises').doc(exerciseId).get();
        if (doc.exists) {
          const data = doc.data();
          const exerciseName = data.name || 'Unknown';
          const metadata = {
            name: exerciseName,
            muscleGroup: data.primaryMuscleGroup || 'Unknown',
            exerciseType: data.exerciseType || 'Unknown',
            isCompoundLift: COMPOUND_LIFTS.has(exerciseName.toLowerCase()),
            movementPattern: data.movementPattern || 'Unknown',
            equipment: data.equipment || 'Unknown'
          };
          exerciseMetadataCache.set(exerciseId, metadata);
          return metadata;
        } else {
          const defaultMetadata = {
            name: 'Unknown',
            muscleGroup: 'Unknown',
            exerciseType: 'Unknown',
            isCompoundLift: false,
            movementPattern: 'Unknown',
            equipment: 'Unknown'
          };
          exerciseMetadataCache.set(exerciseId, defaultMetadata);
          return defaultMetadata;
        }
      } catch (error) {
        functions.logger.error(`Error fetching exercise metadata for ${exerciseId}:`, error);
        const defaultMetadata = {
          name: 'Unknown',
          muscleGroup: 'Unknown',
          exerciseType: 'Unknown',
          isCompoundLift: false,
          movementPattern: 'Unknown',
          equipment: 'Unknown'
        };
        exerciseMetadataCache.set(exerciseId, defaultMetadata);
        return defaultMetadata;
      }
    }

    // --- Enhanced Analytics Helper Functions ---
    
    /**
     * Calculate effective RPE based on percentage of e1RM and rep count
     */
    function calculateEffectiveRPE(weight, reps, e1RM) {
      if (e1RM === 0) return 5; // Default low RPE if no e1RM available
      
      const percentage = weight / e1RM;
      
      // Adjust for rep count - higher reps at same percentage = higher RPE
      const repAdjustment = Math.max(0, (reps - 5) * 0.02);
      const adjustedPercentage = percentage + repAdjustment;
      
      // Find closest RPE
      let closestRPE = 5;
      let minDiff = Infinity;
      
      for (const [rpe, pct] of Object.entries(RPE_TO_PERCENTAGE)) {
        const diff = Math.abs(adjustedPercentage - pct);
        if (diff < minDiff) {
          minDiff = diff;
          closestRPE = parseFloat(rpe);
        }
      }
      
      return closestRPE;
    }

    /**
     * Calculate effective reps (reps performed at RPE 7+ equivalent)
     */
    function calculateEffectiveReps(sets, e1RM) {
      let effectiveReps = 0;
      
      for (const set of sets) {
        const weight = set.weight || 0;
        const reps = set.reps || 0;
        
        if (reps > 0 && weight > 0) {
          const rpe = calculateEffectiveRPE(weight, reps, e1RM);
          if (rpe >= 7) {
            // Scale reps based on how much above RPE 7 they are
            const rpeMultiplier = Math.min(2.0, (rpe - 6) / 4); // Max 2x multiplier at RPE 10
            effectiveReps += reps * rpeMultiplier;
          }
        }
      }
      
      return Math.round(effectiveReps);
    }

    /**
     * Determine rep range category for PR tracking
     */
    function getRepRangeCategory(reps) {
      for (const [category, range] of Object.entries(REP_RANGES)) {
        if (reps >= range.min && reps <= range.max) {
          return category;
        }
      }
      return '15RM'; // Default for high rep work
    }

    /**
     * Calculate exercise staleness score (days since last variation)
     */
    async function calculateStalenessScore(exerciseId, userId, currentDate) {
      try {
        // Look for recent workouts with this exercise
        const recentWorkouts = await db.collectionGroup('workoutLogs')
          .where('userId', '==', userId)
          .where('isWorkoutFinished', '==', true)
          .orderBy('completedDate', 'desc')
          .limit(20)
          .get();

        let daysSinceVariation = 0;
        let foundVariation = false;
        
        for (const doc of recentWorkouts.docs) {
          const workoutData = doc.data();
          const workoutDate = workoutData.completedDate || workoutData.date;
          
          if (workoutDate) {
            const daysDiff = Math.floor((currentDate.toMillis() - workoutDate.toMillis()) / (1000 * 60 * 60 * 24));
            
            // Check if this workout contains the same exercise
            const hasExercise = workoutData.exercises?.some(ex => ex.exerciseId === exerciseId);
            
            if (hasExercise) {
              daysSinceVariation = daysDiff;
            } else {
              // Check for similar exercises (same movement pattern)
              const metadata = await getExerciseMetadata(exerciseId);
              const hasSimilarExercise = workoutData.exercises?.some(async ex => {
                const exMetadata = await getExerciseMetadata(ex.exerciseId);
                return exMetadata.movementPattern === metadata.movementPattern;
              });
              
              if (hasSimilarExercise) {
                foundVariation = true;
                break;
              }
            }
          }
        }
        
        // Return staleness score (0-100, higher = more stale)
        if (foundVariation) {
          return Math.min(100, daysSinceVariation * 2); // 2 points per day
        } else {
          return Math.min(100, daysSinceVariation * 3); // 3 points per day if no variation
        }
        
      } catch (error) {
        functions.logger.error(`Error calculating staleness for exercise ${exerciseId}:`, error);
        return 0;
      }
    }

    // --- Advanced Analytics Functions ---
    
    /**
     * Detect plateau in exercise progress
     */
    async function detectPlateau(exerciseId, userId) {
      try {
        const recentWorkouts = await db.collectionGroup('workoutLogs')
          .where('userId', '==', userId)
          .where('isWorkoutFinished', '==', true)
          .orderBy('completedDate', 'desc')
          .limit(10)
          .get();

        const e1RMHistory = [];
        
        for (const doc of recentWorkouts.docs) {
          const workoutData = doc.data();
          const exercise = workoutData.exercises?.find(ex => ex.exerciseId === exerciseId);
          
          if (exercise) {
            let maxE1RM = 0;
            const metadata = await getExerciseMetadata(exerciseId);
            
            if (exercise.sets && Array.isArray(exercise.sets)) {
              // Current data structure with sets array
              for (const set of exercise.sets) {
                const weight = set.weight || 0;
                const reps = set.reps || 0;
                if (reps > 0) {
                  let effectiveWeight = weight;
                  if (metadata.exerciseType === 'Bodyweight') {
                    effectiveWeight = await getUserBodyweight(userId);
                  } else if (metadata.exerciseType === 'Bodyweight Loadable') {
                    effectiveWeight = await getUserBodyweight(userId) + weight;
                  }
                  const setE1RM = effectiveWeight * (1 + (reps / 30));
                  maxE1RM = Math.max(maxE1RM, setE1RM);
                }
              }
            } else {
              // Historical data structure with separate arrays
              const repsList = exercise.reps || [];
              const weightList = exercise.weights || [];
              const completedList = exercise.completed || [];
              const numSets = Math.min(repsList.length, weightList.length, completedList.length);

              for (let i = 0; i < numSets; i++) {
                if (completedList[i]) {
                  const reps = parseInt(repsList[i]) || 0;
                  const weight = parseInt(weightList[i]) || 0;
                  
                  if (reps > 0) {
                    let effectiveWeight = weight;
                    if (metadata.exerciseType === 'Bodyweight') {
                      effectiveWeight = await getUserBodyweight(userId);
                    } else if (metadata.exerciseType === 'Bodyweight Loadable') {
                      effectiveWeight = await getUserBodyweight(userId) + weight;
                    }
                    const setE1RM = effectiveWeight * (1 + (reps / 30));
                    maxE1RM = Math.max(maxE1RM, setE1RM);
                  }
                }
              }
            }
            
            if (maxE1RM > 0) {
              e1RMHistory.push({
                date: workoutData.completedDate || workoutData.date,
                e1RM: maxE1RM
              });
            }
          }
        }

        if (e1RMHistory.length < 4) {
          return { isPlateaued: false, plateauDays: 0, trend: 'insufficient_data' };
        }

        // Sort by date (oldest first)
        e1RMHistory.sort((a, b) => a.date.toMillis() - b.date.toMillis());
        
        // Check for plateau (no improvement in last 4 workouts)
        const recent4 = e1RMHistory.slice(-4);
        const maxRecent = Math.max(...recent4.map(h => h.e1RM));
        const isPlateaued = recent4.every(h => h.e1RM <= maxRecent * 1.02); // Allow 2% variance
        
        // Calculate trend
        const first2Avg = (recent4[0].e1RM + recent4[1].e1RM) / 2;
        const last2Avg = (recent4[2].e1RM + recent4[3].e1RM) / 2;
        const trendPercent = ((last2Avg - first2Avg) / first2Avg) * 100;
        
        let trend = 'stable';
        if (trendPercent > 2) trend = 'improving';
        else if (trendPercent < -2) trend = 'declining';
        
        const plateauDays = isPlateaued ?
          Math.floor((recent4[3].date.toMillis() - recent4[0].date.toMillis()) / (1000 * 60 * 60 * 24)) : 0;

        return { isPlateaued, plateauDays, trend, trendPercent };
        
      } catch (error) {
        functions.logger.error(`Error detecting plateau for exercise ${exerciseId}:`, error);
        return { isPlateaued: false, plateauDays: 0, trend: 'error' };
      }
    }

    /**
     * Calculate muscle balance ratios
     */
    async function calculateMuscleBalance(userId) {
      try {
        const exerciseAnalytics = await db.collection('userAnalytics')
          .doc(userId)
          .collection('exerciseAnalytics')
          .get();

        const muscleGroupStrength = {};
        
        exerciseAnalytics.docs.forEach(doc => {
          const data = doc.data();
          const muscleGroup = data.muscleGroup;
          const e1RM = data.e1RM || 0;
          
          if (!muscleGroupStrength[muscleGroup]) {
            muscleGroupStrength[muscleGroup] = [];
          }
          muscleGroupStrength[muscleGroup].push(e1RM);
        });

        // Calculate average strength per muscle group
        const avgStrength = {};
        for (const [muscle, strengths] of Object.entries(muscleGroupStrength)) {
          avgStrength[muscle] = strengths.reduce((sum, s) => sum + s, 0) / strengths.length;
        }

        // Calculate key ratios
        const ratios = {};
        
        // Push/Pull ratio
        const pushMuscles = ['Chest', 'Shoulders', 'Triceps'];
        const pullMuscles = ['Back', 'Biceps'];
        
        const pushStrength = pushMuscles.reduce((sum, muscle) => sum + (avgStrength[muscle] || 0), 0);
        const pullStrength = pullMuscles.reduce((sum, muscle) => sum + (avgStrength[muscle] || 0), 0);
        
        if (pullStrength > 0) {
          ratios.pushPullRatio = pushStrength / pullStrength;
        }

        // Quad/Hamstring ratio
        if (avgStrength['Quadriceps'] && avgStrength['Hamstrings']) {
          ratios.quadHamstringRatio = avgStrength['Quadriceps'] / avgStrength['Hamstrings'];
        }

        return { muscleGroupStrength: avgStrength, ratios };
        
      } catch (error) {
        functions.logger.error(`Error calculating muscle balance for user ${userId}:`, error);
        return { muscleGroupStrength: {}, ratios: {} };
      }
    }

    try {
      const userAnalyticsRef = db.collection('userAnalytics').doc(userId);
      const monthStr = new Date().toISOString().slice(0, 7); // YYYY-MM format
      const monthlyAnalyticsRef = userAnalyticsRef.collection('monthlyAnalytics').doc(monthStr);

      // --- Process Each Exercise in the Workout ---
      for (const exercise of exercises) {
        const exerciseId = exercise.exerciseId;
        if (!exerciseId) {
          functions.logger.warn(`Skipping exercise due to missing exerciseId: ${JSON.stringify(exercise)}`);
          continue;
        }

        // Get exercise metadata
        const metadata = await getExerciseMetadata(exerciseId);
        functions.logger.info(`Processing exercise: ${exercise.exerciseName || exerciseId} (Type: ${metadata.exerciseType}, Compound: ${metadata.isCompoundLift})`);

        let workoutE1RM = 0;
        let workoutVolume = 0;
        let workoutTotalReps = 0;
        let workoutTotalSets = 0;
        let workoutEffectiveReps = 0;
        let intensityDistribution = {};
        let prsByRepRange = {};
        let averageIntensityPercent = 0;
        let totalIntensitySum = 0;
        let validSetsForIntensity = 0;

        // Get current e1RM for intensity calculations
        const exerciseAnalyticsDocRef = userAnalyticsRef.collection('exerciseAnalytics').doc(exerciseId);
        const currentAnalytics = await exerciseAnalyticsDocRef.get();
        const currentE1RM = currentAnalytics.exists ? (currentAnalytics.data().e1RM || 0) : 0;

        // --- Handle both historical and current data structures ---
        if (exercise.sets && Array.isArray(exercise.sets)) {
          // Current data structure with sets array
          workoutTotalSets = exercise.sets.length;
          
          for (const set of exercise.sets) {
            const weight = set.weight || 0;
            const reps = set.reps || 0;
            
            if (reps > 0) {
              // Handle bodyweight exercises
              let effectiveWeight = weight;
              if (metadata.exerciseType === 'Bodyweight') {
                effectiveWeight = await getUserBodyweight(userId);
              } else if (metadata.exerciseType === 'Bodyweight Loadable') {
                effectiveWeight = await getUserBodyweight(userId) + weight;
              }

              const setE1RM = effectiveWeight * (1 + (reps / 30));
              if (setE1RM > workoutE1RM) {
                workoutE1RM = setE1RM;
              }
              workoutVolume += effectiveWeight * reps;
              workoutTotalReps += reps;

              // --- Enhanced Analytics Calculations ---
              
              // Calculate intensity percentage
              if (currentE1RM > 0) {
                const intensityPercent = Math.round((effectiveWeight / currentE1RM) * 100);
                totalIntensitySum += intensityPercent;
                validSetsForIntensity++;
                
                // Track intensity distribution
                const intensityBucket = Math.floor(intensityPercent / 10) * 10; // Round to nearest 10%
                intensityDistribution[intensityBucket] = (intensityDistribution[intensityBucket] || 0) + 1;
              }

              // Track PRs by rep range
              const repRange = getRepRangeCategory(reps);
              if (!prsByRepRange[repRange] || setE1RM > prsByRepRange[repRange].e1RM) {
                prsByRepRange[repRange] = {
                  e1RM: setE1RM,
                  weight: effectiveWeight,
                  reps: reps,
                  date: completedDate
                };
              }
            }
          }

          // Calculate effective reps for this exercise
          workoutEffectiveReps = calculateEffectiveReps(exercise.sets.map(set => ({
            weight: set.weight || 0,
            reps: set.reps || 0
          })), currentE1RM);
        } else {
          // Historical data structure with separate arrays
          const repsList = exercise.reps || [];
          const weightList = exercise.weights || [];
          const completedList = exercise.completed || [];
          const numSets = Math.min(repsList.length, weightList.length, completedList.length);

          if (numSets === 0) {
            functions.logger.warn(`Skipping exercise '${exercise.exerciseName || exerciseId}' due to empty set data.`);
            continue;
          }

          const completedSets = [];
          for (let i = 0; i < numSets; i++) {
            // Only process completed sets
            if (completedList[i]) {
              const reps = parseInt(repsList[i]) || 0;
              const weight = parseInt(weightList[i]) || 0;
              
              if (reps > 0) {
                // Handle bodyweight exercises
                let effectiveWeight = weight;
                if (metadata.exerciseType === 'Bodyweight') {
                  effectiveWeight = await getUserBodyweight(userId);
                } else if (metadata.exerciseType === 'Bodyweight Loadable') {
                  effectiveWeight = await getUserBodyweight(userId) + weight;
                }

                const setE1RM = effectiveWeight * (1 + (reps / 30));
                if (setE1RM > workoutE1RM) {
                  workoutE1RM = setE1RM;
                }
                workoutVolume += effectiveWeight * reps;
                workoutTotalReps += reps;
                workoutTotalSets += 1; // Only count completed sets

                // --- Enhanced Analytics Calculations ---
                
                // Calculate intensity percentage
                if (currentE1RM > 0) {
                  const intensityPercent = Math.round((effectiveWeight / currentE1RM) * 100);
                  totalIntensitySum += intensityPercent;
                  validSetsForIntensity++;
                  
                  // Track intensity distribution
                  const intensityBucket = Math.floor(intensityPercent / 10) * 10; // Round to nearest 10%
                  intensityDistribution[intensityBucket] = (intensityDistribution[intensityBucket] || 0) + 1;
                }

                // Track PRs by rep range
                const repRange = getRepRangeCategory(reps);
                if (!prsByRepRange[repRange] || setE1RM > prsByRepRange[repRange].e1RM) {
                  prsByRepRange[repRange] = {
                    e1RM: setE1RM,
                    weight: effectiveWeight,
                    reps: reps,
                    date: completedDate
                  };
                }

                // Store for effective reps calculation
                completedSets.push({ weight: effectiveWeight, reps: reps });
              }
            }
          }

          // Calculate effective reps for this exercise
          workoutEffectiveReps = calculateEffectiveReps(completedSets, currentE1RM);
        }

        // Calculate average intensity percentage
        if (validSetsForIntensity > 0) {
          averageIntensityPercent = Math.round(totalIntensitySum / validSetsForIntensity);
        }

        // Calculate staleness score
        const stalenessScore = await calculateStalenessScore(exerciseId, userId, completedDate);

        // Detect plateau for this exercise
        const plateauData = await detectPlateau(exerciseId, userId);

        const exerciseAnalyticsRef = userAnalyticsRef.collection('exerciseAnalytics').doc(exerciseId);

        // --- Firestore Transaction for Atomic Updates ---
        await db.runTransaction(async (transaction) => {
          const exerciseDoc = await transaction.get(exerciseAnalyticsRef);

          // Prepare enhanced analytics data
          const enhancedData = {
            exerciseName: metadata.name,
            muscleGroup: metadata.muscleGroup,
            exerciseType: metadata.exerciseType,
            isCompoundLift: metadata.isCompoundLift,
            movementPattern: metadata.movementPattern,
            equipment: metadata.equipment,
            e1RM: workoutE1RM,
            totalVolume: workoutVolume,
            totalSets: workoutTotalSets,
            totalReps: workoutTotalReps,
            totalEffectiveReps: workoutEffectiveReps,
            averageIntensity: workoutTotalReps > 0 ? workoutVolume / workoutTotalReps : 0,
            averageIntensityPercent: averageIntensityPercent,
            intensityDistribution: intensityDistribution,
            stalenessScore: stalenessScore,
            plateauData: plateauData,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          };

          if (!exerciseDoc.exists) {
            // Document doesn't exist, create it
            transaction.set(exerciseAnalyticsRef, enhancedData);
          } else {
            // Document exists, update it
            const existingData = exerciseDoc.data();
            const newTotalVolume = (existingData.totalVolume || 0) + workoutVolume;
            const newTotalReps = (existingData.totalReps || 0) + workoutTotalReps;
            const newTotalEffectiveReps = (existingData.totalEffectiveReps || 0) + workoutEffectiveReps;

            // Merge intensity distributions
            const mergedIntensityDistribution = { ...(existingData.intensityDistribution || {}) };
            for (const [bucket, count] of Object.entries(intensityDistribution)) {
              mergedIntensityDistribution[bucket] = (mergedIntensityDistribution[bucket] || 0) + count;
            }

            transaction.update(exerciseAnalyticsRef, {
              ...enhancedData,
              e1RM: workoutE1RM > (existingData.e1RM || 0) ? workoutE1RM : existingData.e1RM,
              totalVolume: newTotalVolume,
              totalSets: (existingData.totalSets || 0) + workoutTotalSets,
              totalReps: newTotalReps,
              totalEffectiveReps: newTotalEffectiveReps,
              averageIntensity: newTotalReps > 0 ? newTotalVolume / newTotalReps : 0,
              intensityDistribution: mergedIntensityDistribution,
            });
          }
        });

        // --- Store PR History in Subcollection ---
        for (const [repRange, prData] of Object.entries(prsByRepRange)) {
          const prHistoryRef = exerciseAnalyticsRef.collection('prHistory').doc(repRange);
          
          await db.runTransaction(async (transaction) => {
            const prDoc = await transaction.get(prHistoryRef);
            
            if (!prDoc.exists || prData.e1RM > (prDoc.data().e1RM || 0)) {
              transaction.set(prHistoryRef, {
                repRange: repRange,
                e1RM: prData.e1RM,
                weight: prData.weight,
                reps: prData.reps,
                achievedDate: prData.date,
                exerciseName: metadata.name,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          });
        }
      }

      // --- Update Monthly Aggregates with Enhanced Analytics ---
      await db.runTransaction(async (transaction) => {
        const monthlyDoc = await transaction.get(monthlyAnalyticsRef);
        
        // Calculate total workout volume and muscle group distribution
        let totalWorkoutVolume = 0;
        let totalEffectiveReps = 0;
        const muscleGroupVolume = {};
        const compoundLiftVolume = {};
        
        for (const exercise of exercises) {
          const metadata = await getExerciseMetadata(exercise.exerciseId);
          let exerciseVolume = 0;
          let exerciseEffectiveReps = 0;
          
          if (exercise.sets && Array.isArray(exercise.sets)) {
            // Current data structure
            for (const set of exercise.sets) {
              const weight = set.weight || 0;
              const reps = set.reps || 0;
              if (reps > 0) {
                let effectiveWeight = weight;
                if (metadata.exerciseType === 'Bodyweight') {
                  effectiveWeight = await getUserBodyweight(userId);
                } else if (metadata.exerciseType === 'Bodyweight Loadable') {
                  effectiveWeight = await getUserBodyweight(userId) + weight;
                }
                exerciseVolume += effectiveWeight * reps;
              }
            }
            exerciseEffectiveReps = calculateEffectiveReps(exercise.sets.map(set => ({
              weight: set.weight || 0,
              reps: set.reps || 0
            })), 0); // Use 0 for e1RM since we don't have it here
          } else {
            // Historical data structure
            const repsList = exercise.reps || [];
            const weightList = exercise.weights || [];
            const completedList = exercise.completed || [];
            const numSets = Math.min(repsList.length, weightList.length, completedList.length);
            const completedSets = [];
            
            for (let i = 0; i < numSets; i++) {
              if (completedList[i]) {
                const reps = parseInt(repsList[i]) || 0;
                const weight = parseInt(weightList[i]) || 0;
                if (reps > 0) {
                  let effectiveWeight = weight;
                  if (metadata.exerciseType === 'Bodyweight') {
                    effectiveWeight = await getUserBodyweight(userId);
                  } else if (metadata.exerciseType === 'Bodyweight Loadable') {
                    effectiveWeight = await getUserBodyweight(userId) + weight;
                  }
                  exerciseVolume += effectiveWeight * reps;
                  completedSets.push({ weight: effectiveWeight, reps: reps });
                }
              }
            }
            exerciseEffectiveReps = calculateEffectiveReps(completedSets, 0);
          }
          
          totalWorkoutVolume += exerciseVolume;
          totalEffectiveReps += exerciseEffectiveReps;
          
          // Track muscle group volume
          const muscleGroup = metadata.muscleGroup;
          muscleGroupVolume[muscleGroup] = (muscleGroupVolume[muscleGroup] || 0) + exerciseVolume;
          
          // Track compound lift volume
          if (metadata.isCompoundLift) {
            compoundLiftVolume[metadata.name] = (compoundLiftVolume[metadata.name] || 0) + exerciseVolume;
          }
        }

        // Calculate muscle balance ratios
        const muscleBalance = await calculateMuscleBalance(userId);

        const monthlyData = {
          totalVolume: totalWorkoutVolume,
          totalWorkouts: 1,
          totalEffectiveReps: totalEffectiveReps,
          muscleGroupVolume: muscleGroupVolume,
          compoundLiftVolume: compoundLiftVolume,
          muscleBalance: muscleBalance,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (!monthlyDoc.exists) {
          transaction.set(monthlyAnalyticsRef, monthlyData);
        } else {
          const existingData = monthlyDoc.data();
          
          // Merge muscle group volumes
          const mergedMuscleGroupVolume = { ...(existingData.muscleGroupVolume || {}) };
          for (const [muscle, volume] of Object.entries(muscleGroupVolume)) {
            mergedMuscleGroupVolume[muscle] = (mergedMuscleGroupVolume[muscle] || 0) + volume;
          }
          
          // Merge compound lift volumes
          const mergedCompoundLiftVolume = { ...(existingData.compoundLiftVolume || {}) };
          for (const [lift, volume] of Object.entries(compoundLiftVolume)) {
            mergedCompoundLiftVolume[lift] = (mergedCompoundLiftVolume[lift] || 0) + volume;
          }

          transaction.update(monthlyAnalyticsRef, {
            totalVolume: admin.firestore.FieldValue.increment(totalWorkoutVolume),
            totalWorkouts: admin.firestore.FieldValue.increment(1),
            totalEffectiveReps: admin.firestore.FieldValue.increment(totalEffectiveReps),
            muscleGroupVolume: mergedMuscleGroupVolume,
            compoundLiftVolume: mergedCompoundLiftVolume,
            muscleBalance: muscleBalance, // Update with latest calculation
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      functions.logger.info(`Successfully processed workout ${logId} for user ${userId}.`);
      return { success: true, message: 'Workout processed successfully.' };

    } catch (error) {
      functions.logger.error(`Error processing workout ${logId} for user ${userId}:`, error);
      throw new functions.https.HttpsError('internal', 'Failed to process workout.', error.message);
    }
  } catch (error) {
    functions.logger.error(`Error in processWorkoutManually:`, error);
    throw new functions.https.HttpsError('internal', 'Failed to process workout.', error.message);
  }
});
