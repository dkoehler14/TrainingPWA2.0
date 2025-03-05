import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Table, Spinner, Modal } from 'react-bootstrap';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, documentId, orderBy, limit, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { useNumberInput } from '../hooks/useNumberInput.js'; // Adjust path as needed
import '../styles/LogWorkout.css';
import { debounce } from 'lodash';

function LogWorkout() {
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const [exercisesList, setExercisesList] = useState([]);
  const [logData, setLogData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [alternativeExercises, setAlternativeExercises] = useState([]);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [exerciseToReplace, setExerciseToReplace] = useState(null);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false); // For adding a spinner while fetching alternatives
  const user = auth.currentUser;

  // Refs for number inputs
  const repsInputRef = useRef(null);
  const weightInputRef = useRef(null);

  // Use the hook for double-click selection
  useNumberInput(repsInputRef);
  useNumberInput(weightInputRef);

  // Create a debounced save function
  const debouncedSaveLog = useCallback(
    debounce(async (userData, programData, weekIndex, dayIndex, exerciseData) => {
      if (!userData || !programData || exerciseData.length === 0) return;
      try {
        const currentDate = new Date();
        const logsQuery = query(
          collection(db, "workoutLogs"),
          where("userId", "==", userData.uid),
          where("programId", "==", programData.id),
          where("weekIndex", "==", weekIndex),
          where("dayIndex", "==", dayIndex)
        );
        const logsSnapshot = await getDocs(logsQuery);

        if (!logsSnapshot.empty) {
          // Update existing log
          const logDoc = logsSnapshot.docs[0];
          await updateDoc(doc(db, "workoutLogs", logDoc.id), {
            exercises: exerciseData.map(ex => ({
              exerciseId: ex.exerciseId,
              sets: ex.sets,
              reps: ex.reps,
              weights: ex.weights,
              completed: ex.completed
            })),
            date: Timestamp.fromDate(new Date()),
            isWorkoutFinished: logsSnapshot.docs[0].data().isWorkoutFinished || false
          });
        } else {
          // Create new log if none exists
          await addDoc(collection(db, "workoutLogs"), {
            userId: userData.uid,
            programId: programData.id,
            weekIndex: weekIndex,
            dayIndex: dayIndex,
            exercises: exerciseData.map(ex => ({
              exerciseId: ex.exerciseId,
              sets: ex.sets,
              reps: ex.reps,
              weights: ex.weights,
              completed: ex.completed
            })),
            date: Timestamp.fromDate(new Date()),
            isWorkoutFinished: false
          });
        }
        console.log('Workout log auto-saved');
      } catch (error) {
        console.error("Error auto-saving workout log: ", error);
      }
    }, 1000), // 1 second debounce
    [] // Empty dependency array ensures this is only created once
  );

  useEffect(() => {
    const fetchData = async () => {
      if (user) {
        try {
          // Fetch all user programs, ordered by createdAt (most recent first)
          const programsQuery = query(
            collection(db, "programs"),
            where("userId", "==", user.uid),
            orderBy("createdAt", "desc")
          );
          const programsSnapshot = await getDocs(programsQuery);
          const programsData = programsSnapshot.docs.map(doc => {
            const data = { id: doc.id, ...doc.data() };
            data.weeklyConfigs = parseWeeklyConfigs(data.weeklyConfigs, data.duration, data.daysPerWeek);
            return data;
          });
          setPrograms(programsData);

          // Fetch exercises
          const exercisesSnapshot = await getDocs(collection(db, "exercises"));
          setExercisesList(exercisesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));

          // Check for a current program first, then fall back to most recent if none is marked current
          const currentProgram = programsData.find(program => program.isCurrent === true);
          const programToSelect = currentProgram || (programsData.length > 0 ? programsData[0] : null);

          // Autopopulate the most recent program
          if (programToSelect) {
            setSelectedProgram(programToSelect);
            const uncompletedDay = await findEarliestUncompletedDay(programToSelect);
            if (uncompletedDay) {
              setSelectedWeek(uncompletedDay.week);
              setSelectedDay(uncompletedDay.day);
            } else {
              // If no uncompleted days, default to Week 0, Day 0
              setSelectedWeek(0);
              setSelectedDay(0);
            }
          }
        } catch (error) {
          console.error("Error fetching data: ", error);
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchData();
  }, [user]);

  // Fetch existing workout log when program, week, or day changes
  useEffect(() => {
    const fetchWorkoutLog = async () => {
      if (user && selectedProgram && selectedWeek !== null && selectedDay !== null) {
        setIsLoading(true);
        try {
          const logsQuery = query(
            collection(db, "workoutLogs"),
            where("userId", "==", user.uid),
            where("programId", "==", selectedProgram.id),
            where("weekIndex", "==", selectedWeek),
            where("dayIndex", "==", selectedDay)
          );
          const logsSnapshot = await getDocs(logsQuery);

          if (!logsSnapshot.empty) {
            const log = logsSnapshot.docs[0].data();
            const dayExercises = selectedProgram.weeklyConfigs[selectedWeek][selectedDay].exercises.map(ex => ({
              ...ex,
              reps: log.exercises.find(e => e.exerciseId === ex.exerciseId)?.reps || Array(ex.sets).fill(ex.reps),
              weights: log.exercises.find(e => e.exerciseId === ex.exerciseId)?.weights || Array(ex.sets).fill(''),
              completed: log.exercises.find(e => e.exerciseId === ex.exerciseId)?.completed || Array(ex.sets).fill(false)
            }));
            setLogData(dayExercises);
          } else {
            // If no log exists, initialize with program data
            const dayExercises = selectedProgram.weeklyConfigs[selectedWeek][selectedDay].exercises.map(ex => ({
              ...ex,
              reps: Array(ex.sets).fill(ex.reps), // Initialize editable reps per set
              weights: Array(ex.sets).fill(''),
              completed: Array(ex.sets).fill(false) // Initialize completion status per set
            }));
            setLogData(dayExercises);
          }
        } catch (error) {
          console.error("Error fetching workout log: ", error);
        } finally {
          setIsLoading(false);
        }
      }
    };
    fetchWorkoutLog();
  }, [user, selectedProgram, selectedWeek, selectedDay]);

  const openReplaceExerciseModal = async (exercise) => {
    setExerciseToReplace(exercise);
    setIsLoadingAlternatives(true);
    setShowReplaceModal(true);

    try {
      // Find the original exercise to get its primary muscle groups
      const originalExercise = exercisesList.find(ex => ex.id === exercise.exerciseId);
      
      if (originalExercise && originalExercise.primaryMuscleGroup) {
        const exercisesQuery = query(
          collection(db, "exercises"),
          where("primaryMuscleGroup", "==", originalExercise.primaryMuscleGroup),
          where(documentId(), "!=", exercise.exerciseId)
        );
        
        const alternativesSnapshot = await getDocs(exercisesQuery);
        const alternatives = alternativesSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          // Remove duplicates
          .filter((ex, index, self) => 
            self.findIndex(t => t.id === ex.id) === index
          );
        
        setAlternativeExercises(alternatives);
      }
    }
    catch (error) {
      console.error("Error fetching alternative exercises: ", error);
      setAlternativeExercises([]);
    } finally {
      setIsLoadingAlternatives(false);
    }
  };

  const replaceExercise = (alternativeExercise) => {
    if (!exerciseToReplace) return;
    console.log("Replacing exercise:", exerciseToReplace, "with:", alternativeExercise);

    const newLogData = logData.map(ex =>
      ex.exerciseId === exerciseToReplace.exerciseId
        ? {
          ...ex,
          exerciseId: alternativeExercise.id,
        }
        : ex
    );

    setLogData(newLogData);
    setShowReplaceModal(false);
    setExerciseToReplace(null);
    setAlternativeExercises([]);
  };

  const parseWeeklyConfigs = (flattenedConfigs, duration, daysPerWeek) => {
    const weeklyConfigs = Array.from({ length: duration }, () =>
      Array.from({ length: daysPerWeek }, () => ({ exercises: [] }))
    );

    for (let key in flattenedConfigs) {
      if (flattenedConfigs.hasOwnProperty(key)) {
        const match = key.match(/week(\d+)_day(\d+)_exercises/);
        if (match) {
          const weekIndex = parseInt(match[1], 10) - 1; // Convert to 0-based index
          const dayIndex = parseInt(match[2], 10) - 1; // Convert to 0-based index
          weeklyConfigs[weekIndex][dayIndex].exercises = flattenedConfigs[key];
        }
      }
    }

    return weeklyConfigs;
  };

  const findEarliestUncompletedDay = async (program) => {
    if (!user || !program) return null;

    try {
      const logsQuery = query(
        collection(db, "workoutLogs"),
        where("userId", "==", user.uid),
        where("programId", "==", program.id)
      );
      const logsSnapshot = await getDocs(logsQuery);
      const completedDays = new Set();

      logsSnapshot.forEach(doc => {
        const log = doc.data();
        if (log.isWorkoutFinished) {
          completedDays.add(`${log.weekIndex}_${log.dayIndex}`);
        }
      });

      for (let week = 0; week < program.duration; week++) {
        for (let day = 0; day < program.daysPerWeek; day++) {
          const dayKey = `${week}_${day}`;
          if (!completedDays.has(dayKey)) {
            return { week, day }; // Day is uncompleted if not marked as finished
          }
        }
      }

      return null; // No uncompleted days found
    } catch (error) {
      console.error("Error finding uncompleted day: ", error);
      return null;
    }
  };

  const selectProgram = (program) => {
    setSelectedProgram(program);
    setSelectedWeek(0);
    setSelectedDay(0);
    // The useEffect will handle loading or initializing logData
  };

  const handleWeekChange = (weekIndex) => {
    setSelectedWeek(weekIndex);
    // The useEffect will handle loading or initializing logData
  };

  const handleDayChange = (dayIndex) => {
    setSelectedDay(dayIndex);
    // The useEffect will handle loading or initializing logData
  };

  const handleChange = (exerciseIndex, setIndex, value, field) => {
    const newLogData = [...logData];
    if (field === 'weight') {
      newLogData[exerciseIndex].weights[setIndex] = Number(value) || '';
    } else if (field === 'reps') {
      newLogData[exerciseIndex].reps[setIndex] = Number(value) || ''; // Update reps for the specific set
    } else if (field === 'completed') {
      newLogData[exerciseIndex].completed[setIndex] = !newLogData[exerciseIndex].completed[setIndex]; // Toggle completion
    }
    setLogData(newLogData);

    // Trigger auto-save
    if (user && selectedProgram) {
      debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
    }
  };

  const saveLog = async () => {
    if (!user || !selectedProgram || logData.length === 0) return;
    try {
      const currentDate = new Date();
      const logsQuery = query(
        collection(db, "workoutLogs"),
        where("userId", "==", user.uid),
        where("programId", "==", selectedProgram.id),
        where("weekIndex", "==", selectedWeek),
        where("dayIndex", "==", selectedDay)
        //where("date", ">=", Timestamp.fromDate(new Date(currentDate.setHours(0, 0, 0, 0)))),
        //where("date", "<", Timestamp.fromDate(new Date(currentDate.setHours(23, 59, 59, 999))))
      );
      const logsSnapshot = await getDocs(logsQuery);

      if (!logsSnapshot.empty) {
        // Update existing log
        const logDoc = logsSnapshot.docs[0];
        await updateDoc(doc(db, "workoutLogs", logDoc.id), {
          exercises: logData.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets,
            reps: ex.reps, // Save the edited reps per set
            weights: ex.weights,
            completed: ex.completed // Save completion status as is
          })),
          date: Timestamp.fromDate(new Date()),
          isWorkoutFinished: logsSnapshot.docs[0].data().isWorkoutFinished || false // Preserve existing finish status
        });
      } else {
        // Create new log if none exists
        await addDoc(collection(db, "workoutLogs"), {
          userId: user.uid,
          programId: selectedProgram.id,
          weekIndex: selectedWeek,
          dayIndex: selectedDay,
          exercises: logData.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets,
            reps: ex.reps, // Save the edited reps per set
            weights: ex.weights,
            completed: ex.completed // Save completion status as is
          })),
          date: Timestamp.fromDate(new Date()),
          isWorkoutFinished: false // Default to unfinished
        });
      }
      alert('Workout logged successfully!');
      setLogData([]);
      setSelectedProgram(null);
      setSelectedWeek(0);
      setSelectedDay(0);
    } catch (error) {
      console.error("Error saving workout log: ", error);
    }
  };

  const finishWorkout = async () => {
    if (!user || !selectedProgram || logData.length === 0) return;

    // Check if all sets are completed
    const allSetsCompleted = logData.every(ex =>
      ex.completed.every(c => c === true)
    );

    if (!allSetsCompleted) {
      // Show confirmation dialog if not all sets are completed
      const confirmFinish = window.confirm("Not all sets are completed! Finish Anyway?");
      if (!confirmFinish) return; // Exit if user cancels
    }

    try {
      const currentDate = new Date();
      const logsQuery = query(
        collection(db, "workoutLogs"),
        where("userId", "==", user.uid),
        where("programId", "==", selectedProgram.id),
        where("weekIndex", "==", selectedWeek),
        where("dayIndex", "==", selectedDay),
      );
      const logsSnapshot = await getDocs(logsQuery);

      if (!logsSnapshot.empty) {
        // Update existing log with isWorkoutFinished: true, preserving completed statuses
        const logDoc = logsSnapshot.docs[0];
        await updateDoc(doc(db, "workoutLogs", logDoc.id), {
          exercises: logData.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets,
            reps: ex.reps, // Save the edited reps per set
            weights: ex.weights,
            completed: ex.completed // Preserve user-selected completion status
          })),
          date: Timestamp.fromDate(new Date()),
          isWorkoutFinished: true // Mark the workout as finished
        });
      } else {
        // Create new log if none exists, marking it as finished
        await addDoc(collection(db, "workoutLogs"), {
          userId: user.uid,
          programId: selectedProgram.id,
          weekIndex: selectedWeek,
          dayIndex: selectedDay,
          exercises: logData.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: ex.sets,
            reps: ex.reps, // Save the edited reps per set
            weights: ex.weights,
            completed: ex.completed // Preserve user-selected completion status
          })),
          date: Timestamp.fromDate(new Date()),
          isWorkoutFinished: true // Mark the workout as finished
        });
      }
      alert('Workout finished successfully!');
      setLogData([]);
      setSelectedProgram(null);
      setSelectedWeek(0);
      setSelectedDay(0);
    } catch (error) {
      console.error("Error finishing workout log: ", error);
    }
  };

  return (
    <Container fluid className="soft-container">
      <Row className="justify-content-center">
        <Col md={8}>
          <div className="soft-card shadow border-0">
            <h1 className="soft-title text-center">Log Workout</h1>
            {isLoading ? (
              <div className="text-center py-4">
                <Spinner animation="border" className="spinner-blue" />
                <p className="soft-text mt-2">Loading...</p>
              </div>
            ) : (
              <Form>
                <Form.Group className="mb-3">
                  <Form.Label className="soft-label">Selected Program</Form.Label>
                  <Form.Control
                    as="select"
                    value={selectedProgram?.id || ''}
                    onChange={e => selectProgram(programs.find(p => p.id === e.target.value))}
                    className="soft-input"
                  >
                    <option value="">Select a program</option>
                    {programs.map(program => (
                      <option key={program.id} value={program.id}>
                        {program.name} {program.isCurrent ? "(Current)" : ""}
                      </option>
                    ))}
                  </Form.Control>
                </Form.Group>

                {selectedProgram && (
                  <>
                    <div className="d-flex flex-wrap gap-3 mb-3">
                      <Form.Group className="flex-grow-1">
                        <Form.Label className="soft-label">Selected Week</Form.Label>
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

                      <Form.Group className="flex-grow-1">
                        <Form.Label className="soft-label">Selected Day</Form.Label>
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
                    </div>

                    {logData.map((ex, exIndex) => (
                      <div key={exIndex} className="mb-4">
                        <div className="d-flex justify-content-between align-items-center">
                          <h5 className="soft-label">{exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Loading...'}</h5>
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            onClick={() => openReplaceExerciseModal(ex)}
                          >
                            Replace Exercise
                          </Button>
                        </div>
                        <Table responsive className="workout-log-table">
                          <thead>
                            <tr>
                              <th>Set</th>
                              <th>Reps</th>
                              <th>Weight</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: ex.sets }).map((_, setIndex) => (
                              <tr key={setIndex}>
                                <td className="text-center">{setIndex + 1}</td>
                                <td className="text-center">
                                  <Form.Control
                                    type="number"
                                    value={ex.reps[setIndex] || ''}
                                    onChange={e => handleChange(exIndex, setIndex, e.target.value, 'reps')}
                                    className="soft-input center-input"
                                    style={{ width: '50px', display: 'inline-block' }}
                                    ref={repsInputRef} // Attach ref for double-click
                                  />
                                </td>
                                <td className="text-center">
                                  <Form.Control
                                    type="number"
                                    value={ex.weights[setIndex] || ''}
                                    onChange={e => handleChange(exIndex, setIndex, e.target.value, 'weight')}
                                    className="soft-input center-input"
                                    style={{ width: '80px', display: 'inline-block' }}
                                    ref={weightInputRef} // Attach ref for double-click
                                  />
                                </td>
                                <td className="text-center">
                                  <Form.Check
                                    type="checkbox"
                                    checked={ex.completed[setIndex]}
                                    onChange={() => handleChange(exIndex, setIndex, null, 'completed')}
                                    className="completed-checkbox"
                                    style={{ transform: 'scale(1.5)' }} // Larger checkbox for better touch interaction
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    ))}

                    {/* Modal for replacing exercises */}
                    <Modal show={showReplaceModal} onHide={() => setShowReplaceModal(false)}>
                      <Modal.Header closeButton>
                        <Modal.Title>Replace Exercise</Modal.Title>
                      </Modal.Header>
                      <Modal.Body>
                        <h6>Select an Alternative Exercise:</h6>
                        {alternativeExercises.length > 0 ? (
                          <div className="d-grid gap-2">
                            {alternativeExercises.map(alt => (
                              <Button
                                key={alt.id}
                                variant="outline-primary"
                                onClick={() => replaceExercise(alt)}
                              >
                                {alt.name}
                                <small className="text-muted d-block">
                                  {(alt.primaryMuscleGroups || []).join(', ')}
                                </small>
                              </Button>
                            ))}
                          </div>
                        ) : (
                          <p>No alternative exercises found.</p>
                        )}
                      </Modal.Body>
                    </Modal>

                    {/* <Button onClick={saveLog} className="soft-button gradient mb-2">Save Workout Log</Button> */}
                    <div className="text-center mt-3">
                      <Button onClick={finishWorkout} className="soft-button gradient">Finish Workout</Button>
                    </div>
                  </>
                )}
              </Form>
            )}
          </div>
        </Col>
      </Row>
    </Container>
  );
}

export default LogWorkout;