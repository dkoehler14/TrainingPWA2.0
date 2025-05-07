import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Container, Row, Col, Form, Button, Table, Spinner, Modal, Dropdown } from 'react-bootstrap';
import { Pencil, ThreeDotsVertical, BarChart, Plus, ArrowLeftRight } from 'react-bootstrap-icons'
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, documentId, orderBy, limit, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { useNumberInput } from '../hooks/useNumberInput.js'; // Adjust path as needed
import '../styles/LogWorkout.css';
import { debounce } from 'lodash';

function LogWorkout() {
  const [programs, setPrograms] = useState([]);
  const [selectedProgram, setSelectedProgram] = useState(null);
  const [programLogs, setProgramLogs] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const [exercisesList, setExercisesList] = useState([]);
  const [logData, setLogData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [alternativeExercises, setAlternativeExercises] = useState([]);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [exerciseToReplace, setExerciseToReplace] = useState(null);
  const [isLoadingAlternatives, setIsLoadingAlternatives] = useState(false); // For adding a spinner while fetching alternatives
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(null);
  const [exerciseNotes, setExerciseNotes] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 767);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedExerciseHistory, setSelectedExerciseHistory] = useState(null);
  const [exerciseHistoryData, setExerciseHistoryData] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isWorkoutFinished, setIsWorkoutFinished] = useState(false);
  const [showGridModal, setShowGridModal] = useState(false);
  const user = auth.currentUser;

  // Refs for number inputs
  const repsInputRef = useRef(null);
  const weightInputRef = useRef(null);

  // Use the hook for double-click selection
  useNumberInput(repsInputRef);
  useNumberInput(weightInputRef);

  // Check window size on resize
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 767);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
              sets: Number(ex.sets),
              reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
              weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
              completed: ex.completed,
              notes: ex.notes || '' // Include the notes field
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
              completed: ex.completed,
              notes: ex.notes || '' // Include the notes field
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

  // Fetch workout logs when program changes
  useEffect(() => {
    const fetchProgramLogs = async () => {
      if (!user || !selectedProgram) return;
      setIsLoading(true);
      try {
        const logsQuery = query(
          collection(db, "workoutLogs"),
          where("userId", "==", user.uid),
          where("programId", "==", selectedProgram.id)
        );
        const logsSnapshot = await getDocs(logsQuery);
        const logsMap = {};
        logsSnapshot.forEach(doc => {
          const log = doc.data();
          const key = `${log.weekIndex}_${log.dayIndex}`;
          logsMap[key] = {
            exercises: log.exercises.map(ex => ({
              ...ex,
              reps: ex.reps || Array(ex.sets).fill(ex.reps || 0),
              weights: ex.weights || Array(ex.sets).fill(''),
              completed: ex.completed || Array(ex.sets).fill(false),
              notes: ex.notes || ''
            })),
            isWorkoutFinished: log.isWorkoutFinished || false
          };
        });
        setProgramLogs(logsMap);
        console.log('Program logs fetched:', logsMap);
      } catch (error) {
        console.error("Error fetching program logs: ", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProgramLogs();
  }, [user, selectedProgram]);

  // Fetch existing workout log when program, week, or day changes
  useEffect(() => {
    if (!user || !selectedProgram || selectedWeek === null || selectedDay === null) return;
    setIsLoading(true);
    const  key = `${selectedWeek}_${selectedDay}`;
    if (programLogs[key]) {
      setLogData(programLogs[key].exercises);
      setIsWorkoutFinished(programLogs[key].isWorkoutFinished);
    } else {
      setIsWorkoutFinished(false);
      const dayExercises = selectedProgram.weeklyConfigs[selectedWeek][selectedDay].exercises.map(ex => ({
        ...ex,
        reps: Array(ex.sets).fill(ex.reps),
        weights: Array(ex.sets).fill(''),
        completed: Array(ex.sets).fill(false),
        notes: ex.notes || ''
      }));
      setLogData(dayExercises);
      // Optionally pre-populate programLogs with initialized data
      setProgramLogs(prev => ({ ...prev, [key]: { exercises: dayExercises, isWorkoutFinished: false } }));
    }
    setIsLoading(false);
  }, [user, selectedProgram, selectedWeek, selectedDay, programLogs]);

  // Add this new function to fetch exercise history
  const fetchExerciseHistory = async (exerciseId) => {
    if (!user || !exerciseId) return;

    setIsLoadingHistory(true);
    try {
      // Query for all workout logs that contain this exercise
      const logsQuery = query(
        collection(db, "workoutLogs"),
        where("userId", "==", user.uid),
        where("isWorkoutFinished", "==", true),
        orderBy("date", "desc"),
        limit(10) // Limit to recent 10 entries
      );

      const logsSnapshot = await getDocs(logsQuery);
      console.log(`Found ${logsSnapshot.docs.length} workout logs`);

      const historyData = [];

      logsSnapshot.forEach(doc => {
        const log = doc.data();
        console.log(`Processing log from date: ${log.date.toDate().toLocaleDateString()}`);

        // Find the exercise in this log
        const exerciseInLog = log.exercises.find(ex => ex.exerciseId === exerciseId);

        if (exerciseInLog) {
          console.log(`Found exercise in log. Sets: ${exerciseInLog.sets}, Weights array length: ${exerciseInLog.weights.length}, Reps array length: ${exerciseInLog.reps.length}`);

          // For each set, create a history entry
          if (exerciseInLog.sets && Array.isArray(exerciseInLog.weights) && Array.isArray(exerciseInLog.reps)) {
            for (let setIndex = 0; setIndex < exerciseInLog.weights.length; setIndex++) {
              const weight = exerciseInLog.weights[setIndex];
              const reps = exerciseInLog.reps[setIndex];

              // Explicitly convert to numbers and validate
              const weightValue = weight === '' || weight === null ? 0 : Number(weight);
              const repsValue = reps === '' || reps === null ? 0 : Number(reps);

              // Skip entries with no weight or reps
              if (weightValue === 0 && repsValue === 0) continue;

              // Only add valid entries
              if (!isNaN(weightValue) && !isNaN(repsValue)) {
                historyData.push({
                  date: log.date.toDate(),
                  week: log.weekIndex + 1,
                  day: log.dayIndex + 1,
                  set: setIndex + 1,
                  weight: weightValue,
                  reps: repsValue,
                  completed: exerciseInLog.completed && exerciseInLog.completed[setIndex] ? true : false
                });
              }
            }
          }
        }
      });

      // Sort by date (most recent first)
      historyData.sort((a, b) => b.date - a.date);
      console.log("Final history data:", historyData);

      // Calculate stats for debugging
      if (historyData.length > 0) {
        const allReps = historyData.map(e => e.reps);
        console.log("All reps values:", allReps);
        console.log("Max reps:", Math.max(...allReps));
        console.log("Min reps:", Math.min(...allReps));

        const repSum = historyData.reduce((sum, e) => {
          console.log(`Adding ${e.reps} to current sum ${sum}`);
          return sum + e.reps;
        }, 0);

        console.log(`Total reps sum: ${repSum}, Count: ${historyData.length}, Average: ${repSum / historyData.length}`);
      }

      setExerciseHistoryData(historyData);
    } catch (error) {
      console.error("Error fetching exercise history:", error);
      setExerciseHistoryData([]);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const openHistoryModal = (exercise) => {
    setSelectedExerciseHistory(exercise);
    setShowHistoryModal(true);
    fetchExerciseHistory(exercise.exerciseId);
  };

  const openNotesModal = (exerciseIndex) => {
    setCurrentExerciseIndex(exerciseIndex);
    setExerciseNotes(logData[exerciseIndex].notes || '');
    setShowNotesModal(true);
  };

  const saveNote = () => {
    if (currentExerciseIndex === null) return;

    const newLogData = [...logData];
    newLogData[currentExerciseIndex].notes = exerciseNotes;
    setLogData(newLogData);

    // Trigger auto-save
    if (user && selectedProgram) {
      debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
    }

    setShowNotesModal(false);
  };

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

  const replaceExercise = async (alternativeExercise) => {
    if (!exerciseToReplace || !selectedProgram) return;
    console.log("Replacing exercise:", exerciseToReplace, "with:", alternativeExercise);

    try {
      // Update local state first
      const newLogData = logData.map(ex =>
        ex.exerciseId === exerciseToReplace.exerciseId
          ? {
            ...ex,
            exerciseId: alternativeExercise.id,
          }
          : ex
      );
      setLogData(newLogData);

      // Now update the program's weeklyConfigs in Firestore
      const programRef = doc(db, "programs", selectedProgram.id);

      // Create a copy of the program's weeklyConfigs
      const updatedWeeklyConfigs = { ...selectedProgram.weeklyConfigs };

      // Create the key in the format the program uses
      const configKey = `week${selectedWeek + 1}_day${selectedDay + 1}_exercises`;

      // Get the current exercises for this week/day
      const currentExercises = selectedProgram.weeklyConfigs[selectedWeek][selectedDay].exercises;

      // Create an updated exercises array with the replacement
      const updatedExercises = currentExercises.map(ex =>
        ex.exerciseId === exerciseToReplace.exerciseId
          ? { ...ex, exerciseId: alternativeExercise.id }
          : ex
      );

      // Update the weekly configs with the new exercise list
      await updateDoc(programRef, {
        [`weeklyConfigs.${configKey}`]: updatedExercises
      });

      console.log(`Updated program config for ${configKey}`);

      // Update the local program state to reflect the changes
      const updatedProgram = { ...selectedProgram };
      updatedProgram.weeklyConfigs[selectedWeek][selectedDay].exercises = updatedExercises;
      setSelectedProgram(updatedProgram);

      setShowReplaceModal(false);
      setExerciseToReplace(null);
      setAlternativeExercises([]);
    } catch (error) {
      console.error("Error replacing exercise: ", error);
      alert("Failed to update program with replaced exercise.");
    }
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
    if (isWorkoutFinished) return; // Don't allow changes if workout is finished

    const newLogData = [...logData];
    if (field === 'reps') {
      newLogData[exerciseIndex].reps[setIndex] = value;
    } else if (field === 'weights') {
      newLogData[exerciseIndex].weights[setIndex] = value;
    } else if (field === 'completed') {
      //console.log(`Before toggle - Exercise ${exerciseIndex}, Set ${setIndex}: completed = ${newLogData[exerciseIndex].completed[setIndex]}`);
      newLogData[exerciseIndex].completed[setIndex] = !newLogData[exerciseIndex].completed[setIndex];
      //console.log(`After toggle - Exercise ${exerciseIndex}, Set ${setIndex}: completed = ${newLogData[exerciseIndex].completed[setIndex]}`);
    }
    setLogData(newLogData);
    const key = `${selectedWeek}_${selectedDay}`;
    //console.log(`Updating programLogs for key ${key}:`, newLogData);
    setProgramLogs(prev => ({
      ...prev,
      [key]: { exercises: newLogData, isWorkoutFinished: prev[key]?.isWorkoutFinished || false }
    }));
    debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
  };

  // Helper function to check if a set can be marked as complete
  const canMarkSetComplete = (exercise, setIndex) => {
    const weightValue = exercise.weights[setIndex];
    const repsValue = exercise.reps[setIndex];
    return (weightValue !== '' && weightValue !== 0 && repsValue !== '' && repsValue !== 0);
  };

  const handleAddSet = (exerciseIndex) => {
    if (isWorkoutFinished) return; // Don't allow adding sets if workout is finished

    const newLogData = [...logData];
    newLogData[exerciseIndex].sets += 1;
    newLogData[exerciseIndex].reps.push(newLogData[exerciseIndex].reps[0]);
    newLogData[exerciseIndex].weights.push('');
    newLogData[exerciseIndex].completed.push(false);
    setLogData(newLogData);
    debouncedSaveLog(user, selectedProgram, selectedWeek, selectedDay, newLogData);
  };

  const saveLog = async () => {
    if (isWorkoutFinished) return; // Don't allow saving if workout is finished

    if (!user || !selectedProgram) return;
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
        const logDoc = logsSnapshot.docs[0];
        await updateDoc(doc(db, "workoutLogs", logDoc.id), {
          exercises: logData.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: Number(ex.sets),
            reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
            weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
            completed: ex.completed,
            notes: ex.notes || ''
          })),
          date: Timestamp.fromDate(new Date()),
          isWorkoutFinished: false
        });
      } else {
        await addDoc(collection(db, "workoutLogs"), {
          userId: user.uid,
          programId: selectedProgram.id,
          weekIndex: selectedWeek,
          dayIndex: selectedDay,
          exercises: logData.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: Number(ex.sets),
            reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
            weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
            completed: ex.completed,
            notes: ex.notes || ''
          })),
          date: Timestamp.fromDate(new Date()),
          isWorkoutFinished: false
        });
      }
      alert('Workout saved successfully!');
    } catch (error) {
      console.error("Error saving workout log: ", error);
      alert('Error saving workout. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const finishWorkout = async () => {
    if (isWorkoutFinished) return; // Don't allow finishing if already finished

    if (!user || !selectedProgram) return;
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
        const logDoc = logsSnapshot.docs[0];
        await updateDoc(doc(db, "workoutLogs", logDoc.id), {
          exercises: logData.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: Number(ex.sets),
            reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
            weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
            completed: ex.completed,
            notes: ex.notes || ''
          })),
          date: Timestamp.fromDate(new Date()),
          isWorkoutFinished: true
        });
      } else {
        await addDoc(collection(db, "workoutLogs"), {
          userId: user.uid,
          programId: selectedProgram.id,
          weekIndex: selectedWeek,
          dayIndex: selectedDay,
          exercises: logData.map(ex => ({
            exerciseId: ex.exerciseId,
            sets: Number(ex.sets),
            reps: ex.reps.map(rep => rep === '' ? 0 : Number(rep)),
            weights: ex.weights.map(weight => weight === '' ? 0 : Number(weight)),
            completed: ex.completed,
            notes: ex.notes || ''
          })),
          date: Timestamp.fromDate(new Date()),
          isWorkoutFinished: true
        });
      }
      setIsWorkoutFinished(true);
      alert('Workout finished successfully!');
    } catch (error) {
      console.error("Error finishing workout: ", error);
      alert('Error finishing workout. Please try again.');
    } finally {
      setIsLoading(false);
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
                    <div className="mb-3">
                      <h5 className="soft-text" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        Week {selectedWeek + 1}, Day {selectedDay + 1}
                        <Button onClick={() => setShowGridModal(true)} className="soft-button">
                          Change Week/Day
                        </Button>
                      </h5>
                      
                    </div>

                    {/* Modal containing the week and day grid */}
                    <Modal show={showGridModal} onHide={() => setShowGridModal(false)} size="lg">
                      <Modal.Header closeButton>
                        <Modal.Title className="modal-title">Select Week and Day</Modal.Title>
                      </Modal.Header>
                      <Modal.Body>
                        <div className="week-day-grid">
                          {Array.from({ length: selectedProgram.duration }).map((_, weekIndex) => (
                            <div key={weekIndex} className="week-row">
                              <h5 className="modal-title">Week {weekIndex + 1}</h5>
                              <div className="day-buttons">
                                {Array.from({ length: selectedProgram.daysPerWeek }).map((_, dayIndex) => {
                                  const key = `${weekIndex}_${dayIndex}`;
                                  const isCompleted = programLogs[key]?.isWorkoutFinished || false;
                                  return (
                                    <Button
                                      key={dayIndex}
                                      variant={
                                        selectedWeek === weekIndex && selectedDay === dayIndex
                                          ? "primary"
                                          : "outline-primary"
                                      }
                                      onClick={() => {
                                        setSelectedWeek(weekIndex);
                                        setSelectedDay(dayIndex);
                                        setShowGridModal(false);
                                      }}
                                      className={isCompleted ? "completed-day" : ""}
                                    >
                                      Day {dayIndex + 1} {isCompleted && <span>✓</span>}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </Modal.Body>
                    </Modal>
                    {/* <div className="d-flex flex-wrap gap-3 mb-3">
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
                    </div> */}

                    {logData.map((ex, exIndex) => (
                      <div key={exIndex} className="mb-4">
                        <div className="d-flex justify-content-between align-items-center">
                          {/* Replace buttons with a dropdown in mobile view */}
                          {isMobile ? (
                            <div className="d-flex align-items-center">
                              <Dropdown>
                                <Dropdown.Toggle
                                  variant="light"
                                  id={`dropdown-${exIndex}`}
                                  className="border-0 bg-transparent three-dots-vert"
                                  style={{ padding: '0.25rem' }}
                                >
                                  <ThreeDotsVertical size={20} className="three-dots-vert" />
                                </Dropdown.Toggle>

                                <Dropdown.Menu>
                                  <Dropdown.Item
                                    onClick={() => openNotesModal(exIndex)}
                                    className="d-flex align-items-center"
                                  >
                                    <Pencil />
                                    {ex.notes ? 'Edit Notes' : 'Add Notes'}
                                    {ex.notes && <span className="ms-1 badge bg-primary rounded-circle" style={{ width: '8px', height: '8px', padding: '0' }}>&nbsp;</span>}
                                  </Dropdown.Item>
                                  <Dropdown.Item
                                    onClick={() => openReplaceExerciseModal(ex)}
                                    className="d-flex align-items-center"
                                  >
                                    <ArrowLeftRight />
                                    Replace Exercise
                                  </Dropdown.Item>
                                  <Dropdown.Item
                                    onClick={() => handleAddSet(exIndex)}
                                    className="d-flex align-items-center"
                                  >
                                    <Plus />
                                    Add Set
                                  </Dropdown.Item>
                                  <Dropdown.Item
                                    onClick={() => openHistoryModal(ex)}
                                    className="d-flex align-items-center"
                                  >
                                    <BarChart className="me-2" />
                                    View History
                                  </Dropdown.Item>
                                </Dropdown.Menu>
                              </Dropdown>
                              <h5 className="soft-label mb-0">
                                {exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Loading...'}
                                {exercisesList.find(e => e.id === ex.exerciseId)?.exerciseType && (
                                  <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                    {exercisesList.find(e => e.id === ex.exerciseId)?.exerciseType}
                                  </span>
                                )}
                              </h5>
                            </div>
                          ) : (
                            <>
                              <h5 className="soft-label">
                                {exercisesList.find(e => e.id === ex.exerciseId)?.name || 'Loading...'}
                                {exercisesList.find(e => e.id === ex.exerciseId)?.exerciseType && (
                                  <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                    {exercisesList.find(e => e.id === ex.exerciseId)?.exerciseType}
                                  </span>
                                )}
                              </h5>
                              <div>
                                <Button
                                  variant="outline-info"
                                  size="sm"
                                  onClick={() => openNotesModal(exIndex)}
                                  className="me-2"
                                >
                                  {ex.notes ? 'View/Edit Notes' : 'Add Notes'}
                                </Button>
                                <Button
                                  variant="outline-secondary"
                                  size="sm"
                                  onClick={() => openReplaceExerciseModal(ex)}
                                  className="me-2"
                                >
                                  Replace Exercise
                                </Button>
                                <Button
                                  variant="outline-success"
                                  size="sm"
                                  onClick={() => handleAddSet(exIndex)}
                                  className="me-2"
                                >
                                  Add Set
                                </Button>
                                <Button
                                  variant="outline-primary"
                                  size="sm"
                                  onClick={() => openHistoryModal(ex)}
                                >
                                  View History
                                </Button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Display notes preview if there is a note */}
                        {ex.notes && (
                          <div className={`note-preview ${isMobile ? 'mt-2' : ''} mb-2 p-1 bg-light border rounded`}>
                            <small className="text-muted">
                              <strong>Note:</strong> {ex.notes.length > 50 ? `${ex.notes.substring(0, 50)}...` : ex.notes}
                            </small>
                          </div>
                        )}

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
                                    style={{ width: '50px', display: 'inline-block', backgroundColor: ex.completed[setIndex] ? '#f8f9fa' : '' }}
                                    ref={repsInputRef} // Attach ref for double-click
                                    disabled={ex.completed[setIndex] || isWorkoutFinished} // Disable when set is complete or workout is finished
                                  />
                                </td>
                                <td className="text-center">
                                  <Form.Control
                                    type="number"
                                    value={ex.weights[setIndex] || ''}
                                    onChange={e => handleChange(exIndex, setIndex, e.target.value, 'weights')}
                                    className="soft-input center-input"
                                    style={{ width: '80px', display: 'inline-block', backgroundColor: ex.completed[setIndex] ? '#f8f9fa' : '' }}
                                    ref={weightInputRef} // Attach ref for double-click
                                    disabled={ex.completed[setIndex] || isWorkoutFinished} // Disable when set is complete or workout is finished
                                  />
                                </td>
                                <td className="text-center">
                                  <Form.Check
                                    type="checkbox"
                                    checked={ex.completed[setIndex]}
                                    onChange={() => handleChange(exIndex, setIndex, null, 'completed')}
                                    className={`completed-checkbox ${canMarkSetComplete(ex, setIndex) ? 'checkbox-enabled' : ''}`}
                                    style={{ transform: 'scale(1.5)' }} // Larger checkbox for better touch interaction
                                    disabled={!canMarkSetComplete(ex, setIndex) || isWorkoutFinished} // Disable if conditions not met or workout is finished
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </div>
                    ))}

                    {/* Modal for replacing exercises */}
                    <Modal show={showReplaceModal} onHide={() => setShowReplaceModal(false)} centered>
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
                                {alt.exerciseType && (
                                  <span className="ms-2 badge bg-info text-dark" style={{ fontSize: '0.75em', padding: '0.25em 0.5em' }}>
                                    {alt.exerciseType}
                                  </span>
                                )}
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

                    {/* Modal for exercise notes */}
                    <Modal show={showNotesModal} onHide={() => setShowNotesModal(false)} centered>
                      <Modal.Header closeButton>
                        <Modal.Title>
                          {currentExerciseIndex !== null && exercisesList.find(
                            e => e.id === logData[currentExerciseIndex]?.exerciseId
                          )?.name || 'Exercise'} Notes
                        </Modal.Title>
                      </Modal.Header>
                      <Modal.Body>
                        <Form.Group>
                          <Form.Label>Notes for this exercise:</Form.Label>
                          <Form.Control
                            as="textarea"
                            rows={4}
                            value={exerciseNotes}
                            onChange={(e) => setExerciseNotes(e.target.value)}
                            placeholder="Enter form cues, reminders, or personal notes about this exercise..."
                            className="soft-input notes-input"
                          />
                        </Form.Group>
                      </Modal.Body>
                      <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowNotesModal(false)}>
                          Cancel
                        </Button>
                        <Button variant="primary" onClick={saveNote}>
                          Save Notes
                        </Button>
                      </Modal.Footer>
                    </Modal>

                    <Modal
                      show={showHistoryModal}
                      onHide={() => setShowHistoryModal(false)}
                      size="lg"
                      centered
                    >
                      <Modal.Header closeButton>
                        <Modal.Title>
                          {selectedExerciseHistory && exercisesList.find(
                            e => e.id === selectedExerciseHistory?.exerciseId
                          )?.name || 'Exercise'} History
                        </Modal.Title>
                      </Modal.Header>
                      <Modal.Body>
                        {isLoadingHistory ? (
                          <div className="text-center py-3">
                            <Spinner animation="border" className="spinner-blue" />
                            <p className="mt-2">Loading history...</p>
                          </div>
                        ) : exerciseHistoryData.length > 0 ? (
                          <Table responsive className="history-table">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Week/Day</th>
                                <th>Set</th>
                                <th>Weight</th>
                                <th>Reps</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {exerciseHistoryData.map((entry, index) => (
                                <tr key={index}>
                                  <td>{entry.date.toLocaleDateString()}</td>
                                  <td>W{entry.week} D{entry.day}</td>
                                  <td>{entry.set}</td>
                                  <td>{entry.weight}</td>
                                  <td>{entry.reps}</td>
                                  <td>
                                    <span className={`badge ${entry.completed ? 'bg-success' : 'bg-secondary'}`}>
                                      {entry.completed ? 'Completed' : 'Incomplete'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        ) : (
                          <p className="text-center">No history found for this exercise.</p>
                        )}

                        {exerciseHistoryData.length > 0 && (
                          <div className="mt-3">
                            <h6>Recent Performance Summary:</h6>
                            <ul>
                              <li>
                                <strong>Highest Weight:</strong> {Math.max(...exerciseHistoryData.map(e => e.weight))}
                              </li>
                              <li>
                                <strong>Highest Reps:</strong> {Math.max(...exerciseHistoryData.map(e => e.reps))}
                              </li>
                              <li>
                                <strong>Average Weight:</strong> {(exerciseHistoryData.reduce((sum, e) => sum + e.weight, 0) / exerciseHistoryData.length).toFixed(1)}
                              </li>
                              <li>
                                <strong>Average Reps:</strong> {(exerciseHistoryData.reduce((sum, e) => sum + e.reps, 0) / exerciseHistoryData.length).toFixed(1)}
                              </li>
                              <li>
                                <strong>Completion Rate:</strong> {((exerciseHistoryData.filter(e => e.completed).length / exerciseHistoryData.length) * 100).toFixed(0)}%
                              </li>
                            </ul>
                          </div>
                        )}
                      </Modal.Body>
                      <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowHistoryModal(false)}>
                          Close
                        </Button>
                      </Modal.Footer>
                    </Modal>

                    {/* <Button onClick={saveLog} className="soft-button gradient mb-2">Save Workout Log</Button> */}
                    <div className="text-center mt-3">
                      {!isWorkoutFinished ? (
                        <Button onClick={finishWorkout} className="soft-button gradient">Finish Workout</Button>
                      ) : (
                        <Button variant="secondary" disabled>Workout Completed</Button>
                      )}
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