import React, { useState, useEffect, useMemo, useContext } from 'react';
import { Container, Row, Col, Form, Card, Button, Modal, Spinner } from 'react-bootstrap';
import { Line, Bar } from 'react-chartjs-2';
import { AuthContext } from '../context/AuthContext';
import Select from 'react-select';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import '../styles/ProgressTracker.css'; // Ensure this CSS file exists
import { getCollectionCached, getAllExercisesMetadata, getDocCached, warmUserCache } from '../api/supabaseCacheMigration';
import workoutLogService from '../services/workoutLogService';
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

function ProgressTracker2() {
	const { user, isAuthenticated } = useContext(AuthContext);
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
	const [exerciseTypes, setExerciseTypes] = useState(['All Types']);
	const [selectedType, setSelectedType] = useState('All Types');

	// Fetch and group exercises
	useEffect(() => {
		const fetchExercises = async () => {
			setIsExercisesLoading(true);
			try {
				console.log('ProgressTracker2: Fetching exercises');

				// Enhanced cache warming before data fetching
				if (user?.id) {
					await warmUserCache(user.id, 'normal')
						.then(() => {
							console.log('ProgressTracker2: Cache warming completed');
						})
						.catch((error) => {
							console.warn('ProgressTracker2: Cache warming failed, proceeding with data fetch:', error);
						});
				}

				// Fetch exercises from new Supabase exercises table
				let exercisesData = [];
				exercisesData = await getCollectionCached('exercises', {}, 60 * 60 * 1000);
				console.log('ProgressTracker2: Raw exercises data:', exercisesData?.length || 0, 'exercises');

				const fetchedExercises = exercisesData.map(doc => ({
					value: doc.id,
					label: doc.name,
					primaryMuscleGroup: doc.primary_muscle_group || 'Other',
					exerciseType: doc.exercise_type || 'Unknown'
				}));
				console.log('ProgressTracker2: Processed exercises:', fetchedExercises?.length || 0, 'exercises');
				if (fetchedExercises && fetchedExercises.length > 0) {
					console.log('ProgressTracker2: Sample exercise:', fetchedExercises[0]);
				}
				setExercises(fetchedExercises);
				const groups = fetchedExercises.reduce((acc, ex) => {
					const group = ex.primaryMuscleGroup || 'Other';
					if (!acc[group]) acc[group] = [];
					acc[group].push(ex);
					return acc;
				}, {});
				console.log('ProgressTracker2: Created muscle groups:', Object.keys(groups).length, 'groups');
				setMuscleGroups(groups);
				const types = new Set(fetchedExercises.map(ex => ex.exerciseType || 'Unknown'));
				setExerciseTypes(['All Types', ...Array.from(types)]);
			} catch (error) {
				console.error("ProgressTracker2: Error fetching exercises:", error);
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
				console.log('ProgressTracker2: Fetching logs for user:', user?.id);

				// Convert dates to UTC ISO strings to avoid timezone parsing issues
				const startDateISO = startDate.toISOString();
				const endDateISO = endDate.toISOString();
				console.log('ProgressTracker2: Date range:', startDateISO, 'to', endDateISO);

				// Use the service method for consistent data fetching and caching
				const logsData = await workoutLogService.getWorkoutLogsForProgress(user.id, {
					startDate: startDateISO,
					endDate: endDateISO,
					limit: 1000,
					includeDrafts: false
				});
				console.log('ProgressTracker2: Fetched logs data:', logsData?.length || 0, 'logs');

				const fetchedLogs = logsData.map(doc => ({
					id: doc.id,
					...doc,
					date: doc.date.toDate ? doc.date.toDate() : new Date(doc.date)
				}));
				console.log('ProgressTracker2: Processed logs:', fetchedLogs?.length || 0, 'logs');
				if (fetchedLogs && fetchedLogs.length > 0) {
					console.log('ProgressTracker2: Sample log:', fetchedLogs[0]);
				}
				setAllLogs(fetchedLogs);
			} catch (error) {
				console.error("ProgressTracker2: Error fetching logs:", error);
			} finally {
				setIsLoading(false);
			}
		};

		if (user?.id) {
			fetchLogs();
		} else {
			console.log('ProgressTracker2: No user ID available');
			setIsLoading(false);
		}
	}, [startDate, endDate, user?.id]);

	// Overview metrics
	const overviewMetrics = useMemo(() => {
		if (selectedGroup !== 'All Muscle Groups' || allLogs.length === 0 || Object.keys(muscleGroups).length === 0) return null;

		console.log('ProgressTracker2: Calculating overview metrics');
		console.log('ProgressTracker2: Available muscle groups:', Object.keys(muscleGroups));
		console.log('ProgressTracker2: Total logs:', allLogs.length);

		// Debug: Check data structure
		if (allLogs.length > 0) {
			console.log('ProgressTracker2: Sample log structure:', {
				id: allLogs[0].id,
				date: allLogs[0].date,
				exercisesCount: allLogs[0].exercises?.length || 0,
				sampleExercise: allLogs[0].exercises?.[0] ? {
					exerciseId: allLogs[0].exercises[0].exerciseId,
					sets: allLogs[0].exercises[0].sets,
					weights: allLogs[0].exercises[0].weights,
					reps: allLogs[0].exercises[0].reps,
					completed: allLogs[0].exercises[0].completed
				} : null
			});
		}

		// Debug: Check muscle groups structure
		Object.keys(muscleGroups).forEach(group => {
			console.log(`ProgressTracker2: Muscle group ${group}:`, muscleGroups[group].map(e => ({ id: e.value, name: e.label })));
		});

		const totalVolume = allLogs.reduce((sum, log) => {
			if (!log.exercises || !Array.isArray(log.exercises)) return sum;
			return sum + log.exercises.reduce((logSum, ex) => {
				if (!ex.weights || !Array.isArray(ex.weights) || !ex.reps || !Array.isArray(ex.reps) || !ex.completed || !Array.isArray(ex.completed)) return logSum;
				return logSum + ex.weights.reduce((exSum, weight, idx) => {
					if (ex.completed[idx]) return exSum + (weight * ex.reps[idx]);
					return exSum;
				}, 0);
			}, 0);
		}, 0);

		console.log('ProgressTracker2: Total volume calculated:', totalVolume);

		const volumeByGroup = Object.keys(muscleGroups).reduce((acc, group) => {
			acc[group] = allLogs.reduce((sum, log) => {
				if (!log.exercises || !Array.isArray(log.exercises)) return sum;
				return sum + log.exercises.reduce((logSum, ex) => {
					// Check if this exercise belongs to the current muscle group
					// The service method uses 'exercise_id' from the database, but we need to check both
					const exerciseId = ex.exerciseId || ex.exercise_id;
					const exerciseInGroup = muscleGroups[group].some(e => e.value === exerciseId);
					console.log(`ProgressTracker2: Exercise ${exerciseId} (from ${ex.exerciseId ? 'exerciseId' : 'exercise_id'}) in group ${group}:`, exerciseInGroup);

					if (exerciseInGroup) {
						if (!ex.weights || !Array.isArray(ex.weights) || !ex.reps || !Array.isArray(ex.reps) || !ex.completed || !Array.isArray(ex.completed)) return logSum;
						const exerciseVolume = ex.weights.reduce((exSum, weight, idx) => {
							if (ex.completed[idx]) return exSum + (weight * ex.reps[idx]);
							return exSum;
						}, 0);
						console.log(`ProgressTracker2: Exercise ${exerciseId} volume:`, exerciseVolume);
						return logSum + exerciseVolume;
					}
					return logSum;
				}, 0);
			}, 0);
			console.log(`ProgressTracker2: Group ${group} total volume:`, acc[group]);
			return acc;
		}, {});

		console.log('ProgressTracker2: Volume by group:', volumeByGroup);
		return { totalVolume, volumeByGroup };
	}, [allLogs, selectedGroup, muscleGroups]);

	// Muscle group metrics
	const groupMetrics = useMemo(() => {
		if (selectedGroup === 'All Muscle Groups' || allLogs.length === 0) return null;
		const groupExercises = muscleGroups[selectedGroup] || [];
		const exerciseIds = groupExercises
			.filter(ex => selectedType === 'All Types' || ex.exerciseType === selectedType)
			.map(ex => ex.value);
		const filteredLogs = allLogs.filter(log => log.exercises && Array.isArray(log.exercises) && log.exercises.some(ex => exerciseIds.includes(ex.exerciseId || ex.exercise_id)));
		const totalVolume = filteredLogs.reduce((sum, log) => {
			if (!log.exercises || !Array.isArray(log.exercises)) return sum;
			return sum + log.exercises.reduce((logSum, ex) => {
				if (exerciseIds.includes(ex.exerciseId || ex.exercise_id)) {
					if (!ex.weights || !Array.isArray(ex.weights) || !ex.reps || !Array.isArray(ex.reps) || !ex.completed || !Array.isArray(ex.completed)) return logSum;
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
	}, [allLogs, selectedGroup, muscleGroups, selectedType]);

	// Exercise metrics
	const calculateExerciseMetrics = (exerciseId) => {
		const exerciseLogs = allLogs.filter(log => log.exercises && Array.isArray(log.exercises) && log.exercises.some(ex => (ex.exerciseId || ex.exercise_id) === exerciseId));
		let pr = { weight: 0, date: null };
		let lastWeight = { weight: 0, date: null };

		// Calculate PR (highest weight ever from a completed set)
		exerciseLogs.forEach(log => {
			if (!log.exercises || !Array.isArray(log.exercises)) return;
			const exercise = log.exercises.find(ex => (ex.exerciseId || ex.exercise_id) === exerciseId);
			if (exercise && exercise.weights && Array.isArray(exercise.weights) && exercise.completed && Array.isArray(exercise.completed)) {
				exercise.weights.forEach((weight, idx) => {
					if (exercise.completed[idx] && weight > pr.weight) {
						pr = { weight, date: log.date };
					}
				});
			}
		});

		// Calculate lastWeight (most recent completed set's max weight)
		// Since exerciseLogs is in descending order (most recent first), start from index 0
		for (let i = 0; i < exerciseLogs.length; i++) {
			const log = exerciseLogs[i];
			if (!log.exercises || !Array.isArray(log.exercises)) continue;
			const exercise = log.exercises.find(ex => (ex.exerciseId || ex.exercise_id) === exerciseId);
			if (exercise && exercise.weights && Array.isArray(exercise.weights) && exercise.completed && Array.isArray(exercise.completed)) {
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
			if (!log.exercises || !Array.isArray(log.exercises)) return;
			log.exercises.forEach(ex => {
				if (!ex.completed || !Array.isArray(ex.completed)) return;
				const exerciseId = ex.exerciseId || ex.exercise_id;
				const exercise = exercises.find(e => e.value === exerciseId);
				if (ex.completed.some(c => c) &&
					(selectedType === 'All Types' || exercise?.exerciseType === selectedType)) {
					set.add(exerciseId);
				}
			});
		});
		return set;
	}, [allLogs, selectedType, exercises]);

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
		const exerciseLogs = allLogs
			.filter(log => log.exercises && Array.isArray(log.exercises) && log.exercises.some(ex => (ex.exerciseId || ex.exercise_id) === exercise.value))
			.sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort by date ascending (oldest first)
		const chartData = {
			labels: exerciseLogs.map(log => new Date(log.date).toLocaleDateString()),
			datasets: [{
				label: 'Max Weight (lbs)',
				data: exerciseLogs.map(log => {
					if (!log.exercises || !Array.isArray(log.exercises)) return 0;
					const ex = log.exercises.find(e => (e.exerciseId || e.exercise_id) === exercise.value);
					if (!ex || !ex.weights || !Array.isArray(ex.weights) || !ex.completed || !Array.isArray(ex.completed)) return 0;
					return Math.max(...ex.weights.filter((_, idx) => ex.completed[idx])) || 0;
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
						<Form.Label>Exercise Type</Form.Label>
						{isExercisesLoading ? (
							<Spinner animation="border" size="sm" />
						) : (
							<Select
								options={exerciseTypes.map(type => ({ value: type, label: type }))}
								value={{ value: selectedType, label: selectedType }}
								onChange={(selected) => setSelectedType(selected.value)}
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
												{Object.keys(overviewMetrics.volumeByGroup).length > 0 && Object.values(overviewMetrics.volumeByGroup).some(v => v > 0) ? (
													<>
														{console.log('ProgressTracker2: Rendering bar chart with data:', {
															labels: Object.keys(overviewMetrics.volumeByGroup),
															data: Object.values(overviewMetrics.volumeByGroup)
														})}
														<Bar
															data={{
																labels: Object.keys(overviewMetrics.volumeByGroup),
																datasets: [{
																	label: 'Volume by Muscle Group (lbs)',
																	data: Object.values(overviewMetrics.volumeByGroup),
																	backgroundColor: 'rgba(75, 192, 192, 0.6)',
																	borderColor: 'rgba(75, 192, 192, 1)',
																	borderWidth: 1
																}]
															}}
															options={{
																responsive: true,
																plugins: {
																	legend: { position: 'top' },
																	tooltip: {
																		callbacks: {
																			label: function(context) {
																				return `${context.label}: ${context.parsed.y.toLocaleString()} lbs`;
																			}
																		}
																	}
																},
																scales: {
																	y: {
																		beginAtZero: true,
																		ticks: {
																			callback: function(value) {
																				return value.toLocaleString() + ' lbs';
																			}
																		}
																	}
																}
															}}
														/>
													</>
												) : (
													<p>No volume data available for muscle groups in the selected date range.</p>
												)}
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
																<p><strong>PR:</strong> {metrics.pr.weight} lbs on {metrics.pr.date ? new Date(metrics.pr.date).toLocaleDateString() : 'N/A'}</p>
																<p><strong>Last Weight:</strong> {metrics.lastWeight.weight} lbs on {metrics.lastWeight.date ? new Date(metrics.lastWeight.date).toLocaleDateString() : 'N/A'}</p>
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