const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

exports.addExercise = functions.https.onCall((data, context) => {
  return db.collection('exercises').add({
    name: data.name,
    primaryMuscleGroups: data.primaryMuscleGroups,
    secondaryMuscleGroups: data.secondaryMuscleGroups,
    date: admin.firestore.FieldValue.serverTimestamp()
  });
});

exports.getExercises = functions.https.onCall((data, context) => {
  return db.collection('exercises').get().then(snapshot => {
    let exercises = [];
    snapshot.forEach(doc => {
      exercises.push({ id: doc.id, ...doc.data() });
    });
    return exercises;
  });
});