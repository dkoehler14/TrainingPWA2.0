import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Exercises from './pages/Exercises';
import CreateProgram from './pages/CreateProgram';
import Programs from './pages/Programs';
import UserProfile from './pages/UserProfile';
import LogWorkout from './pages/LogWorkout';
import ProgressTracker from './pages/ProgressTracker';
import Auth from './pages/Auth';
import ProgressTracker2 from './pages/ProgressTracker2';
import Analytics from './pages/Progress3';
import Progress4 from './pages/Progress4';
import Admin from './pages/Admin';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { Spinner } from 'react-bootstrap';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const { darkMode, toggleDarkMode } = useTheme();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Fetch user role from Firestore
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setUserRole(userDoc.data().role || 'user');
        } else {
          setUserRole('user');
        }
      } else {
        setUserRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <Spinner animation="border" className="spinner-blue" />
          <p className="soft-text mt-2">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <NavBar user={user} userRole={userRole} />
      <Routes>
        <Route path="/" element={user ? <Home user={user} /> : <Navigate to="/auth" />} />
        <Route path="/exercises" element={user ? <Exercises user={user} userRole={userRole} /> : <Navigate to="/auth" />} />
        <Route path="/create-program" element={user ? <CreateProgram userRole={userRole} /> : <Navigate to="/auth" />} />
        <Route path="/programs" element={user ? <Programs /> : <Navigate to="/auth" />} />
        <Route path="/profile" element={user ? <UserProfile /> : <Navigate to="/auth" />} />
        <Route path="/log-workout" element={user ? <LogWorkout /> : <Navigate to="/auth" />} />
        <Route path="/progress-tracker" element={user ? <ProgressTracker /> : <Navigate to="/" />} />
        <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/" />} />
        <Route path="/progress-tracker-2" element={user ? <ProgressTracker2 /> : <Navigate to="/auth" />} />
        <Route path="/analytics" element={user ? <Analytics /> : <Navigate to="/auth" />} />
        <Route path="/progress-tracker-4" element={user ? <Progress4 /> : <Navigate to="/auth" />} />
        <Route path="/edit-program/:programId" element={<CreateProgram mode="edit" userRole={userRole} />} />
        <Route path="/admin" element={user && userRole === 'admin' ? <Admin /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;