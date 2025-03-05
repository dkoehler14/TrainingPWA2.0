import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Button, Modal } from 'react-bootstrap';
import { useNavigate } from'react-router-dom';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { Trash, Star, Copy, FileText, Clock, Check, PlusCircle } from 'react-bootstrap-icons';
import '../styles/Programs.css';

function Programs() {
  const [userPrograms, setUserPrograms] = useState([]);
  const [predefinedPrograms, setPredefinedPrograms] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [showProgramDetails, setShowProgramDetails] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [workoutLogs, setWorkoutLogs] = useState({});
  const user = auth.currentUser;
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        try {
          // Fetch user programs
          const userProgramsQuery = query(
            collection(db, "programs"), 
            where("userId", "==", user.uid),
            where("isPredefined", "==", false)
          );
          const userProgramsSnapshot = await getDocs(userProgramsQuery);
          const userProgramsData = userProgramsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            weeklyConfigs: parseWeeklyConfigs(doc.data().weeklyConfigs, doc.data().duration, doc.data().daysPerWeek)
          }));
          setUserPrograms(userProgramsData);

          // Fetch predefined programs
          const predefProgramsQuery = query(
            collection(db, "programs"), 
            where("isPredefined", "==", true)
          );
          const predefProgramsSnapshot = await getDocs(predefProgramsQuery);
          const predefinedProgramsData = predefProgramsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            weeklyConfigs: parseWeeklyConfigs(doc.data().weeklyConfigs, doc.data().duration, doc.data().daysPerWeek)
          }));
          setPredefinedPrograms(predefinedProgramsData);

          // Fetch exercises
          const exercisesSnapshot = await getDocs(collection(db, "exercises"));
          setExercises(exercisesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (error) {
          console.error("Error fetching data: ", error);
        }
      }
    };
    fetchData();
  }, [user]);

  const parseWeeklyConfigs = (flattenedConfigs, duration, daysPerWeek) => {
    const weeklyConfigs = Array.from({ length: duration }, () =>
      Array.from({ length: daysPerWeek }, () => ({ exercises: [] }))
    );

    for (let key in flattenedConfigs) {
      if (flattenedConfigs.hasOwnProperty(key)) {
        const match = key.match(/week(\d+)_day(\d+)_exercises/);
        if (match) {
          const weekIndex = parseInt(match[1], 10) - 1;
          const dayIndex = parseInt(match[2], 10) - 1;
          weeklyConfigs[weekIndex][dayIndex].exercises = flattenedConfigs[key];
        }
      }
    }

    return weeklyConfigs;
  };

  const getExerciseName = (exerciseId) => {
    return exercises.find(ex => ex.id === exerciseId)?.name || 'Unknown';
  };

  const adoptProgram = async (program) => {
    if (!user) return;
    try {
      await addDoc(collection(db, "programs"), {
        userId: user.uid,
        isPredefined: false,
        name: `${program.name} (Adopted)`,
        duration: program.duration,
        daysPerWeek: program.daysPerWeek,
        weightUnit: program.weightUnit || 'LB',
        weeklyConfigs: program.weeklyConfigs,
        createdAt: new Date(),
        isCurrent: false
      });
      alert('Program adopted successfully!');
    } catch (error) {
      console.error("Error adopting program: ", error);
    }
  };

  const deleteProgram = async (programId) => {
    if (!window.confirm('Are you sure you want to delete this program?')) return;
    
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, "programs", programId));
      setUserPrograms(userPrograms.filter(p => p.id !== programId));
      alert('Program deleted successfully!');
    } catch (error) {
      console.error("Error deleting program: ", error);
      alert('Failed to delete program');
    } finally {
      setIsDeleting(false);
    }
  };

  const setCurrentProgram = async (programId) => {
    if (!user) return;
    
    try {
      // First, set all user's programs to not current
      const userProgramsQuery = query(
        collection(db, "programs"), 
        where("userId", "==", user.uid),
        where("isPredefined", "==", false)
      );
      const userProgramsSnapshot = await getDocs(userProgramsQuery);
      
      // Batch update to set all programs to not current
      const batch = [];
      userProgramsSnapshot.docs.forEach(programDoc => {
        const updatePromise = updateDoc(doc(db, "programs", programDoc.id), {
          isCurrent: false
        });
        batch.push(updatePromise);
      });
      
      // Wait for all updates to complete
      await Promise.all(batch);
      
      // Set the selected program as current
      await updateDoc(doc(db, "programs", programId), {
        isCurrent: true
      });
      
      // Update local state
      setUserPrograms(userPrograms.map(program => ({
        ...program,
        isCurrent: program.id === programId
      })));
      
      alert('Current program updated successfully!');
    } catch (error) {
      console.error("Error setting current program: ", error);
      alert('Failed to update current program');
    }
  };

  const fetchWorkoutLogs = async (program) => {
    if (!user) return {};

    try {
      const logsQuery = query(
        collection(db, "workoutLogs"),
        where("userId", "==", user.uid),
        where("programId", "==", program.id)
      );

      const logsSnapshot = await getDocs(logsQuery);
      
      const logs = {};
      logsSnapshot.docs.forEach(logDoc => {
        const log = logDoc.data();
        const key = `week${log.weekIndex + 1}_day${log.dayIndex + 1}`;
        
        if (!logs[key]) {
          logs[key] = {
            exercises: {},
            isWorkoutFinished: log.isWorkoutFinished || false
          };
        }

        log.exercises.forEach(ex => {
          logs[key].exercises[ex.exerciseId] = ex;
        });
      });

      return logs;
    } catch (error) {
      console.error("Error fetching workout logs: ", error);
      return {};
    }
  };

  const viewProgramDetails = async (program) => {
    setSelectedProgram(program);

    // Fetch workout logs when viewing program details
    const logs = await fetchWorkoutLogs(program);
    setWorkoutLogs(logs);

    setShowProgramDetails(true);
  };

  const renderExerciseWorkoutDetails = (exercise, weekKey) => {
    const log = workoutLogs[weekKey]?.exercises?.[exercise.exerciseId];
    
    if (!log) {
      return <div className="text-muted">No workout logged</div>;
    }

    return (
      <div className="workout-log-details">
        {log.sets && log.reps && (
          <div>
            {log.weights && log.weights.map((weight, index) => (
              <div key={index} className="mb-1 p-2 bg-light rounded d-flex justify-content-between align-items-center">
                <span>
                  <strong>Set {index + 1}:</strong> {log.reps[index]} reps @ {weight || 'N/A'} lbs
                </span>
                {log.completed?.[index] && <Check className="text-success" />}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderProgramCard = (program, isPredefined = false) => {
    return (
      <Card key={program.id} className="mb-3 program-card">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <Card.Title>{program.name}</Card.Title>
              <Card.Subtitle className="text-muted mb-2">
                {program.duration} weeks | {program.daysPerWeek} days/week
              </Card.Subtitle>
            </div>
            {program.isCurrent && !isPredefined && (
              <Star className="text-warning" size={24} />
            )}
          </div>
          
          <div className="d-flex justify-content-between align-items-center mt-3">
            <div className="d-flex gap-2">
              <Button 
                variant="outline-primary" 
                size="sm" 
                onClick={() => viewProgramDetails(program)}
              >
                <FileText className="me-1" /> Details
              </Button>
              
              {!isPredefined ? (
                <>
                  {!program.isCurrent && (
                    <Button 
                      variant="outline-success" 
                      size="sm"
                      onClick={() => setCurrentProgram(program.id)}
                    >
                      <Clock className="me-1" /> Set Current
                    </Button>
                  )}
                  <Button 
                    variant="outline-danger" 
                    size="sm"
                    onClick={() => deleteProgram(program.id)}
                    disabled={isDeleting}
                  >
                    <Trash className="me-1" /> Delete
                  </Button>
                </>
              ) : (
                <Button 
                  variant="outline-secondary" 
                  size="sm"
                  onClick={() => adoptProgram(program)}
                >
                  <Copy className="me-1" /> Adopt
                </Button>
              )}
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  };

  const renderProgramDetailsModal = () => {
    if (!selectedProgram) return null;

    return (
      <Modal 
        show={showProgramDetails} 
        onHide={() => setShowProgramDetails(false)}
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>{selectedProgram.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3">
            <strong>Duration:</strong> {selectedProgram.duration} weeks
            <br />
            <strong>Days per Week:</strong> {selectedProgram.daysPerWeek}
            <br />
            <strong>Weight Unit:</strong> {selectedProgram.weightUnit || 'LB'}
          </div>
          
          {selectedProgram.weeklyConfigs.map((week, weekIndex) => (
            <div key={weekIndex} className="mb-4">
              <h5>Week {weekIndex + 1}</h5>
              {week.map((day, dayIndex) => {
                const weekKey = `week${weekIndex + 1}_day${dayIndex + 1}`;
                const isWorkoutFinished = workoutLogs[weekKey]?.isWorkoutFinished;
                
                return (
                  <div key={dayIndex} className="mb-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <h6>Day {dayIndex + 1}</h6>
                      {isWorkoutFinished && (
                        <span className="badge bg-success">Completed</span>
                      )}
                    </div>
                    {day.exercises.map((ex, exIndex) => (
                      <div key={exIndex} className="mb-2 program-exercise-details">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <strong>{getExerciseName(ex.exerciseId)}</strong>
                            {' '}
                            <span className="text-muted">
                              {ex.sets} sets x {ex.reps} reps
                            </span>
                          </div>
                        </div>
                        <div className="mt-1">
                          {renderExerciseWorkoutDetails(ex, weekKey)}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </Modal.Body>
      </Modal>
    );
  };

  return (
    <Container fluid className="soft-container programs-container">
      <Row className="justify-content-center">
        <Col md={10}>
          <div className="soft-card programs-card shadow border-0">
            <h1 className="soft-title programs-title text-center mb-4">My Programs</h1>

            {userPrograms.length === 0 ? (
              <div className="text-center p-4">
                <p className="text-muted mb-3">
                You haven't created any programs yet. 
                Get started by creating a new workout program!
                </p>
                <Button 
                  variant="primary" 
                  size="lg" 
                  onClick={() => navigate('/create-program')}
                >
                  <PlusCircle className="me-2" /> Create First Program
                </Button>
              </div>
            ) : (
              userPrograms.map(program => renderProgramCard(program))
            )}

            <h2 className="soft-subtitle section-title mt-5 mb-3">Predefined Programs</h2>
            {predefinedPrograms.map(program => renderProgramCard(program, true))}
          </div>
        </Col>
      </Row>

      {renderProgramDetailsModal()}
    </Container>
  );
}

export default Programs;