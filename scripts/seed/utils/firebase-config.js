/**
 * Firebase configuration for seeding operations
 * 
 * This module initializes Firebase Admin SDK for use with emulators during seeding.
 */

const admin = require('firebase-admin');

let isInitialized = false;

/**
 * Initialize Firebase Admin SDK for emulator use
 * @returns {Object} Firebase Admin instance
 */
function initializeFirebase() {
  if (isInitialized) {
    return admin;
  }

  // Initialize Firebase Admin SDK for emulator use
  admin.initializeApp({
    projectId: 'sample-firebase-ai-app-d056c', // Use same project ID as the main app
  });

  // Configure to use emulators
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

  isInitialized = true;
  return admin;
}

/**
 * Get Firestore instance configured for emulator
 * @returns {Object} Firestore instance
 */
function getFirestore() {
  const firebase = initializeFirebase();
  return firebase.firestore();
}

/**
 * Get Auth instance configured for emulator
 * @returns {Object} Auth instance
 */
function getAuth() {
  const firebase = initializeFirebase();
  return firebase.auth();
}

module.exports = {
  initializeFirebase,
  getFirestore,
  getAuth
};