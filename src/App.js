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
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ThemeProvider, useTheme } from './context/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { darkMode, toggleDarkMode } = useTheme();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <Router>
      <NavBar user={user} />
      <Routes>
        <Route path="/" element={user ? <Home /> : <Navigate to="/auth" />} />
        <Route path="/exercises" element={user ? <Exercises /> : <Navigate to="/auth" />} />
        <Route path="/create-program" element={user ? <CreateProgram /> : <Navigate to="/auth" />} />
        <Route path="/programs" element={user ? <Programs /> : <Navigate to="/auth" />} />
        <Route path="/profile" element={user ? <UserProfile /> : <Navigate to="/auth" />} />
        <Route path="/log-workout" element={user ? <LogWorkout /> : <Navigate to="/auth" />} />
        <Route path="/progress-tracker" element={user ? <ProgressTracker /> : <Navigate to="/" />} />
        <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/" />} />
        <Route path="/progress-tracker-2" element={user ? <ProgressTracker2 /> : <Navigate to="/auth" />} />
        <Route path="/analytics" element={user ? <Analytics /> : <Navigate to="/auth" />} />
        <Route path="/progress-tracker-4" element={user ? <Progress4 /> : <Navigate to="/auth" />} />
        <Route path="/edit-program/:programId" element={<CreateProgram mode="edit" />} />
      </Routes>
    </Router>
  );
}

export default App;