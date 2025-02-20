import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import Exercises from './pages/Exercises'; // New import
import CreateWorkout from './pages/CreateWorkout';
import CreateProgram from './pages/CreateProgram';
import Programs from './pages/Programs';
import Auth from './pages/Auth';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

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
        <Route path="/create-workout" element={user ? <CreateWorkout /> : <Navigate to="/auth" />} />
        <Route path="/create-program" element={user ? <CreateProgram /> : <Navigate to="/auth" />} />
        <Route path="/programs" element={user ? <Programs /> : <Navigate to="/auth" />} />
        <Route path="/auth" element={!user ? <Auth /> : <Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

export default App;