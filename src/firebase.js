import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCIz-gHBiEO5DHBlE9WP78zLhDbSQNvLjM",
  authDomain: "sample-firebase-ai-app-d056c.firebaseapp.com",
  projectId: "sample-firebase-ai-app-d056c",
  storageBucket: "sample-firebase-ai-app-d056c.firebasestorage.app",
  messagingSenderId: "289790483858",
  appId: "1:289790483858:web:ec6bc9f54892a3cf55f54b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
