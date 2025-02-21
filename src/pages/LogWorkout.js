import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Form, Button, ListGroup } from 'react-bootstrap';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import '../styles/LogWorkout.css';

function LogWorkout() {
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const [exercisesList, setExercisesList] = useState([]);
  const [logData, setLogData] = useState([]);
  const user = auth.currentUser;

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        const programsQuery = query(collection(db, "programs"), where("userId", "==", user.uid));
        const programsSnapshot = await getDocs(programsQuery);
        setPrograms(programsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

        const exercisesSnapshot = await getDocs(collection(db, "exercises"));
        setExercisesList(exercisesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    };
    fetchData();
  }, [user]);

  const selectProgram = (program) => {
    setSelectedProgram(program);
    setSelectedWeek(0);
    setSelectedDay(0);
    const dayExercises = program.weeklyConfigs[0][0].exercises.map(ex => ({
      ...ex,
      weights: Array(ex.sets).fill('')
    }));
    setLogData(dayExercises);
  };

  const handleWeekChange = (weekIndex) => {
    setSelectedWeek(weekIndex);
    const dayExercises = selectedProgram.weeklyConfigs[weekIndex][selectedDay].exercises.map(ex => ({
      ...ex,
      weights: Array(ex.sets).fill('')
    }));
    setLogData(dayExercises);
  };

  const handleDayChange = (dayIndex) => {
    setSelectedDay(dayIndex);
    const dayExercises = selectedProgram.weeklyConfigs[selectedWeek][dayIndex].exercises.map(ex => ({
      ...ex,
      weights: Array(ex.sets).fill('')
    }));
    setLogData(dayExercises);
  };

  const handleWeightChange = (exerciseIndex, setIndex, value) => {
    const newLogData = [...logData];
    newLogData[exerciseIndex].weights[setIndex] = Number(value);
    setLogData(newLogData);
  };

  const saveLog = async () => {
    if (!user || !selectedProgram || logData.length === 0) return;
    try {
      await addDoc(collection(db, "workoutLogs"), {
        userId: user.uid,
        programId: selectedProgram.id,
        weekIndex: selectedWeek,
        dayIndex: selectedDay,
        exercises: logData,
        date: new Date()
      });
      alert('Workout logged successfully!');
      setLogData([]);
      setSelectedProgram(null);
      setSelectedWeek(0);
      setSelectedDay(0);
    } catch (error) {
      console.error("Error saving workout log: ", error);
    }
  };

  return (
    <Container fluid className="soft-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card shadow border-0">
            <h1 className="soft-title text-center">Log Workout</h1>
            <Form.Group className="mb-3">
              <Form.Label className="soft-label">Select Program</Form.Label>
              <Form.Control
                as="select"
                value={selectedProgram?.id || ''}
                onChange={e => selectProgram(programs.find(p => p.id === e.target.value))}
                className="soft-input"
              >
                <option value="">Select a program</option>
                {programs.map(program => (
                  <option key={program.id} value={program.id}>{program.name}</option>
                ))}
              </Form.Control>
            </Form.Group>

            {selectedProgram && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label className="soft-label">Select Week</Form.Label>
                  <Form.Control
                    as="select"
                    value={selectedWeek}
                    onChange={e => handleWeekChange(Number(e.target.value))}
                    className="soft-input"
                  >
                    {Array.from({ length: selectedProgram.duration }).map((_, index) => (
                      <option key={index} value={index}>Week {index + 1}</option>
                    ))}
                  </Form.Control>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label className="soft-label">Select Day</Form.Label>
                  <Form.Control
                    as="select"
                    value={selectedDay}
                    onChange={e => handleDayChange(Number(e.target.value))}
                    className="soft-input"
                  >
                    {Array.from({ length: selectedProgram.daysPerWeek }).map((_, index) => (
                      <option key={index} value={index}>Day {index + 1}</option>
                    ))}
                  </Form.Control>
                </Form.Group>

                {logData.map((ex, exIndex) => (
                  <div key={exIndex} className="mb-3">
                    <h5 className="soft-label">{exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Loading...'}</h5>
                    <p className="soft-text">{ex.sets} sets x {ex.reps} reps</p>
                    {Array.from({ length: ex.sets }).map((_, setIndex) => (
                      <Form.Group key={setIndex} className="mb-2">
                        <Form.Label className="soft-label">Set {setIndex + 1} Weight (lbs)</Form.Label>
                        <Form.Control
                          type="number"
                          value={ex.weights[setIndex] || ''}
                          onChange={e => handleWeightChange(exIndex, setIndex, e.target.value)}
                          placeholder={`Weight for Set ${setIndex + 1}`}
                          className="soft-input"
                        />
                      </Form.Group>
                    ))}
                  </div>
                ))}
                <Button onClick={saveLog} className="soft-button gradient">Save Workout Log</Button>
              </>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
}

export default LogWorkout;