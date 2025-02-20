import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import NavBar from './components/NavBar';
import Home from './pages/Home';
import CreateWorkout from './pages/CreateWorkout';

function App() {
  return (
    <Router>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create-workout" element={<CreateWorkout />} />
      </Routes>
    </Router>
  );
}

export default App;