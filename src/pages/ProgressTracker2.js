import React, { useState, useEffect, useMemo } from 'react';
import { Container, Row, Col, Form, Card, Button, Modal, Spinner } from 'react-bootstrap';
import { Line, Bar } from 'react-chartjs-2';
import { db, auth } from '../firebase'; // Adjust path as needed
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import '../styles/ProgressTracker.css'; // Ensure this CSS file exists

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

// Simple cache for data
const dataCache = {
	logs: {},
	exercises: null,
	getLogsCacheKey(startDate, endDate) {
		return `${startDate.toISOString()}_${endDate.toISOString()}`;
	},
	storeExercises(exercises) {
		this.exercises = exercises;
	},
	getExercises() {
		return this.exercises;
	},
	storeLogs(startDate, endDate, logs) {
		const key = this.getLogsCacheKey(startDate, endDate);
		this.logs[key] = {
			data: logs,
			timestamp: Date.now(),
			expiry: Date.now() + (30 * 60 * 1000) // Cache for 30 minutes
		};
	},
	getLogs(startDate, endDate) {
		const key = this.getLogsCacheKey(startDate, endDate);
		const cached = this.logs[key];
		if (cached && cached.expiry > Date.now()) {
			return cached.data;
		}
		return null;
	},
	clearExpiredCache() {
		const now = Date.now();
		Object.keys(this.logs).forEach(key => {
			if (this.logs[key].expiry < now) {
				delete this.logs[key];
			}
		});
	}
};

function ProgressTracker2() {
	const [exercises, setExercises] = useState([]);
	const [muscleGroups, setMuscleGroups] = useState({});
	const [selectedGroup, setSelectedGroup] = useState('All Muscle Groups');
	const [allLogs, setAllLogs] = useState([]);
	const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 3)));
	const [endDate, setEndDate] = useState(new Date());
	const [isLoading, setIsLoading] = useState(false);
	const [isExercisesLoading, setIsExercisesLoading] = useState(false);
	const [showExerciseModal, setShowExerciseModal] = useState(false);
	const [selectedExercise, setSelectedExercise] = useState(null);

	// Clean up expired cache
	useEffect(() => {
		dataCache.clearExpiredCache();
		const interval = setInterval(() => dataCache.clearExpiredCache(), 5 * 60 * 1000);
		return () => clearInterval(interval);
	}, []);

	// Fetch and group exercises
	useEffect(() => {
		const fetchExercises = async () => {
			setIsExercisesLoading(true);
			try {
				const cachedExercises = dataCache.getExercises();
				if (cachedExercises) {
					setExercises(cachedExercises);
					const groups = cachedExercises.reduce((acc, ex) => {
						const group = ex.primaryMuscleGroup || 'Other';
						if (!acc[group]) acc[group] = [];
						acc[group].push(ex);
						return acc;
					}, {});
					setMuscleGroups(groups);
					setIsExercisesLoading(false);
					return;
				}
				const exercisesSnapshot = await getDocs(collection(db, "exercises"));
				const fetchedExercises = exercisesSnapshot.docs.map(doc => ({
					value: doc.id,
					label: doc.data().name,
					primaryMuscleGroup: doc.data().primaryMuscleGroup || 'Other'
				}));
				dataCache.storeExercises(fetchedExercises);
				setExercises(fetchedExercises);
				const groups = fetchedExercises.reduce((acc, ex) => {
					const group = ex.primaryMuscleGroup || 'Other';
					if (!acc[group]) acc[group] = [];
					acc[group].push(ex);
					return acc;
				}, {});
				setMuscleGroups(groups);
			} catch (error) {
				console.error("Error fetching exercises:", error);
			} finally {
				setIsExercisesLoading(false);
			}
		};
		fetchExercises();
	}, []);

	// Fetch all logs for the date range
	useEffect(() => {
		const fetchLogs = async () => {
			setIsLoading(true);
			try {
				const cachedLogs = dataCache.getLogs(startDate, endDate);
				if (cachedLogs) {
					setAllLogs(cachedLogs);
					setIsLoading(false);
					return;
				}
				const logsQuery = query(
					collection(db, "workoutLogs"),
					where("userId", "==", auth.currentUser.uid),
					where("date", ">=", startDate),
					where("date", "<=", endDate),
					where("isWorkoutFinished", "==", true),
					orderBy("date", "asc")
				);
				const logsSnapshot = await getDocs(logsQuery);
				const fetchedLogs = logsSnapshot.docs.map(doc => ({
					id: doc.id,
					...doc.data(),
					date: doc.data().date.toDate()
				}));
				dataCache.storeLogs(startDate, endDate, fetchedLogs);
				setAllLogs(fetchedLogs);
			} catch (error) {
				console.error("Error fetching logs:", error);
			} finally {
				setIsLoading(false);
			}
		};
		fetchLogs();
	}, [startDate, endDate]);

	// Overview metrics
	const overviewMetrics = useMemo(() => {
		if (selectedGroup !== 'All Muscle Groups' || allLogs.length === 0) return null;
		const totalVolume = allLogs.reduce((sum, log) => {
			return sum + log.exercises.reduce((logSum, ex) => {
				return logSum + ex.weights.reduce((exSum, weight, idx) => {
					if (ex.completed[idx]) return exSum + weight * ex.reps[idx];
					return exSum;
				}, 0);
			}, 0);
		}, 0);
		const volumeByGroup = Object.keys(muscleGroups).reduce((acc, group) => {
			acc[group] = allLogs.reduce((sum, log) => {
				return sum + log.exercises.reduce((logSum, ex) => {
					if (muscleGroups[group].some(e => e.value === ex.exerciseId)) {
						return logSum + ex.weights.reduce((exSum, weight, idx) => {
							if (ex.completed[idx]) return exSum + weight * ex.reps[idx];
							return exSum;
						}, 0);
					}
					return logSum;
				}, 0);
			}, 0);
			return acc;
		}, {});
		return { totalVolume, volumeByGroup };
	}, [allLogs, selectedGroup, muscleGroups]);

	// Muscle group metrics
	const groupMetrics = useMemo(() => {
		if (selectedGroup === 'All Muscle Groups' || allLogs.length === 0) return null;
		const groupExercises = muscleGroups[selectedGroup] || [];
		const exerciseIds = groupExercises.map(ex => ex.value);
		const filteredLogs = allLogs.filter(log => log.exercises.some(ex => exerciseIds.includes(ex.exerciseId)));
		const totalVolume = filteredLogs.reduce((sum, log) => {
			return sum + log.exercises.reduce((logSum, ex) => {
				if (exerciseIds.includes(ex.exerciseId)) {
					return logSum + ex.weights.reduce((exSum, weight, idx) => {
						if (ex.completed[idx]) return exSum + weight * ex.reps[idx];
						return exSum;
					}, 0);
				}
				return logSum;
			}, 0);
		}, 0);
		const numWorkouts = new Set(filteredLogs.map(log => log.id)).size;
		return { totalVolume, numWorkouts };
	}, [allLogs, selectedGroup, muscleGroups]);

	// Exercise metrics
	const calculateExerciseMetrics = (exerciseId) => {
		const exerciseLogs = allLogs.filter(log => log.exercises.some(ex => ex.exerciseId === exerciseId));
		let pr = { weight: 0, date: null };
		let lastWeight = { weight: 0, date: null };

		// Calculate PR (highest weight ever from a completed set)
		exerciseLogs.forEach(log => {
			const exercise = log.exercises.find(ex => ex.exerciseId === exerciseId);
			if (exercise) {
				exercise.weights.forEach((weight, idx) => {
					if (exercise.completed[idx] && weight > pr.weight) {
						pr = { weight, date: log.date };
					}
				});
			}
		});

		// Calculate lastWeight (most recent completed set's max weight)
		for (let i = exerciseLogs.length - 1; i >= 0; i--) {
			const log = exerciseLogs[i];
			const exercise = log.exercises.find(ex => ex.exerciseId === exerciseId);
			if (exercise) {
				const completedWeights = exercise.weights.filter(
					(weight, index) => exercise.completed[index]
				);
				if (completedWeights.length > 0) {
					const maxWeightInLog = Math.max(...completedWeights);
					lastWeight = { weight: maxWeightInLog, date: log.date };
					break; // Stop once we find the most recent log with completed sets
				}
			}
		}
		return { pr, lastWeight };
	};

	const exercisesWithData = useMemo(() => {
		const set = new Set();
		allLogs.forEach(log => {
			log.exercises.forEach(ex => {
				// Only include exercises with at least one completed set
				if (ex.completed.some(c => c)) {
					set.add(ex.exerciseId);
				}
			});
		});
		return set;
	}, [allLogs]);

	// Loading spinner
	const renderLoadingSpinner = () => (
		<div className="text-center my-5">
			<Spinner animation="border" variant="primary">
				<span className="visually-hidden">Loading...</span>
			</Spinner>
			<p>Loading data...</p>
		</div>
	);

	// Exercise details modal
	const ExerciseDetailsModal = ({ show, onHide, exercise }) => {
		const exerciseLogs = allLogs.filter(log => log.exercises.some(ex => ex.exerciseId === exercise.value));
		const chartData = {
			labels: exerciseLogs.map(log => log.date.toLocaleDateString()),
			datasets: [{
				label: 'Max Weight (lbs)',
				data: exerciseLogs.map(log => {
					const ex = log.exercises.find(e => e.exerciseId === exercise.value);
					return ex ? Math.max(...ex.weights.filter((_, idx) => ex.completed[idx])) : 0;
				}),
				fill: false,
				borderColor: 'rgb(75, 192, 192)',
				tension: 0.1
			}]
		};
		return (
			<Modal show={show} onHide={onHide} size="lg">
				<Modal.Header closeButton>
					<Modal.Title>{exercise.label} Progress</Modal.Title>
				</Modal.Header>
				<Modal.Body>
					<Line data={chartData} options={{ responsive: true, plugins: { legend: { position: 'top' } } }} />
				</Modal.Body>
				<Modal.Footer>
					<Button variant="secondary" onClick={onHide}>Close</Button>
				</Modal.Footer>
			</Modal>
		);
	};

	return (
		<Container className="progress-tracker">
			<h1>Progress Tracker v2.0</h1>
			<Row>
				<Col md={6}>
					<Form.Group>
						<Form.Label>Select Muscle Group</Form.Label>
						{isExercisesLoading ? (
							<Spinner animation="border" size="sm" />
						) : (
							<Select
								options={['All Muscle Groups', ...Object.keys(muscleGroups)].map(group => ({ value: group, label: group }))}
								value={{ value: selectedGroup, label: selectedGroup }}
								onChange={(selected) => setSelectedGroup(selected.value)}
							/>
						)}
					</Form.Group>
					<Form.Group className="mt-3">
						<Form.Label>Date Range</Form.Label>
						<div className="d-flex gap-2">
							<DatePicker
								selected={startDate}
								onChange={date => setStartDate(date)}
								selectsStart
								startDate={startDate}
								endDate={endDate}
								className="form-control"
							/>
							<DatePicker
								selected={endDate}
								onChange={date => setEndDate(date)}
								selectsEnd
								startDate={startDate}
								endDate={endDate}
								minDate={startDate}
								className="form-control"
							/>
						</div>
					</Form.Group>
				</Col>
			</Row>

			{isLoading ? renderLoadingSpinner() : (
				<>
					{selectedGroup === 'All Muscle Groups' ? (
						<Row className="mt-4">
							<Col>
								<Card>
									<Card.Body>
										<Card.Title>Overview</Card.Title>
										{overviewMetrics ? (
											<>
												<p><strong>Total Volume:</strong> {overviewMetrics.totalVolume.toFixed(0)} lbs</p>
												<Bar
													data={{
														labels: Object.keys(overviewMetrics.volumeByGroup),
														datasets: [{
															label: 'Volume by Muscle Group',
															data: Object.values(overviewMetrics.volumeByGroup),
															backgroundColor: 'rgba(75, 192, 192, 0.6)'
														}]
													}}
													options={{ responsive: true, plugins: { legend: { position: 'top' } } }}
												/>
											</>
										) : (
											<p>No data available for the selected date range.</p>
										)}
									</Card.Body>
								</Card>
							</Col>
						</Row>
					) : (
						<Row className="mt-4">
							<Col>
								<Card>
									<Card.Body>
										<Card.Title>{selectedGroup} Metrics</Card.Title>
										{groupMetrics ? (
											<>
												<p><strong>Total Volume:</strong> {groupMetrics.totalVolume.toFixed(0)} lbs</p>
												<p><strong>Number of Workouts:</strong> {groupMetrics.numWorkouts}</p>
											</>
										) : (
											<p>No data available for this muscle group in the selected date range.</p>
										)}
									</Card.Body>
								</Card>
								<h3 className="mt-4">Exercises</h3>
								{muscleGroups[selectedGroup]?.filter(exercise => exercisesWithData.has(exercise.value)).length > 0 ? (
									<Row>
										{muscleGroups[selectedGroup]
											.filter(exercise => exercisesWithData.has(exercise.value))
											.map(exercise => {
												const metrics = calculateExerciseMetrics(exercise.value);
												return (
													<Col md={4} key={exercise.value} className="mb-3">
														<Card>
															<Card.Body>
																<Card.Title>{exercise.label}</Card.Title>
																<p><strong>PR:</strong> {metrics.pr.weight} lbs on {metrics.pr.date?.toLocaleDateString() || 'N/A'}</p>
																<p><strong>Last Weight:</strong> {metrics.lastWeight.weight} lbs on {metrics.lastWeight.date.toLocaleDateString()}</p>
																<Button
																	variant="primary"
																	onClick={() => {
																		setSelectedExercise(exercise);
																		setShowExerciseModal(true);
																	}}
																>
																	View Details
																</Button>
															</Card.Body>
														</Card>
													</Col>
												);
											})}
									</Row>
								) : (
									<p>No exercises with data for this muscle group in the selected date range.</p>
								)}
							</Col>
						</Row>
					)}
				</>
			)}

			{selectedExercise && (
				<ExerciseDetailsModal
					show={showExerciseModal}
					onHide={() => setShowExerciseModal(false)}
					exercise={selectedExercise}
				/>
			)}
		</Container>
	);
}

export default ProgressTracker2;