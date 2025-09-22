import React, { useState, useEffect, useContext } from 'react';
import { Container, Row, Col, Card, Nav, Button, Form, Spinner, ButtonGroup } from 'react-bootstrap';
import { AuthContext } from '../context/AuthContext';
import Select, { components, ValueContainerProps } from 'react-select';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { ChevronLeft, ChevronRight } from 'react-bootstrap-icons';
import '../styles/Progress3.css';
import { getCollectionCached, getAllExercisesMetadata, getDocCached, warmUserCache } from '../api/supabaseCacheMigration';
import workoutLogService from '../services/workoutLogService';
const COLORS = ['#1E88E5', '#D32F2F', '#7B1FA2', '#388E3C', '#FBC02D', '#F57C00', '#00ACC1', '#C2185B', '#00796B', '#F06292', '#616161'];

const CustomOption = (props) => {
    return (
        <components.Option {...props}>
            <input
                type="checkbox"
                checked={props.isSelected}
                onChange={() => null} // The click is handled by the Option component
                style={{ marginRight: '8px' }}
            />
            {props.label}
        </components.Option>
    );
};

const CustomValueContainer = (props) => {
    const { children, getValue } = props;
    const selectedCount = getValue().length;

    // Find the input component among the children
    const childArray = React.Children.toArray(children);
    const input = childArray.find(child => React.isValidElement(child) && (child.type.name === 'Input' || child.type.name === 'DummyInput'));

    if (selectedCount > 0) {
        const label = `${selectedCount} selected`;
        // Render the custom label and the input field
        return <components.ValueContainer {...props}>{label}{input}</components.ValueContainer>;
    }

    // When no options are selected, render the default children (placeholder and input)
    return <components.ValueContainer {...props}>{children}</components.ValueContainer>;
};

const checkboxSelectStyles = {
    option: (provided, state) => ({
        ...provided,
        // Override background color for selected options
        backgroundColor: state.isSelected 
            ? (state.isFocused ? '#f8f9fa' : 'white') // Use hover color if focused, otherwise white
            : (state.isFocused ? '#f8f9fa' : 'white'), // Standard hover color
        color: '#212529', // Standard text color
        ':active': {
            ...provided[':active'],
            backgroundColor: '#e9ecef', // Slightly darker for click feedback
        },
    }),
};

function Progress3() {
    const [workoutLogs, setWorkoutLogs] = useState([]);
    const [exercises, setExercises] = useState([]);
    const [muscleGroups, setMuscleGroups] = useState({});
    const [selectedExercise, setSelectedExercise] = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [dateRange, setDateRange] = useState('1month');
    const [startDate, setStartDate] = useState(new Date(new Date().setMonth(new Date().getMonth() - 1)));
    const [endDate, setEndDate] = useState(new Date());
    const [muscleGroupData, setMuscleGroupData] = useState([]);
    const [strengthMetrics, setStrengthMetrics] = useState([]);
    const [completionRate, setCompletionRate] = useState(0);
    const [volumeData, setVolumeData] = useState([]);
    const [personalRecords, setPersonalRecords] = useState([]);
    const [bodyPartFocus, setBodyPartFocus] = useState({});
    const [summaryStats, setSummaryStats] = useState({});
    const { user, isAuthenticated } = useContext(AuthContext);
    const [selectedRadarGroups, setSelectedRadarGroups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [volumeMetric, setVolumeMetric] = useState('sets'); // 'sets' or 'totalVolume'

    const getWeekStartDate = (date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
        d.setDate(diff);
        d.setHours(0, 0, 0, 0); // Reset time to midnight
        return {
            dateObj: new Date(d),
            dateStr: d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
        };
    };

    useEffect(() => {
        const now = new Date();
        let newStartDate, newEndDate;

        switch (dateRange) {
            case '1month':
                newStartDate = new Date(now.setMonth(now.getMonth() - 1));
                newEndDate = new Date();
                break;
            case '3months':
                newStartDate = new Date(now.setMonth(now.getMonth() - 3));
                newEndDate = new Date();
                break;
            case '1year':
                newStartDate = new Date(now.setFullYear(now.getFullYear() - 1));
                newEndDate = new Date();
                break;
            case 'alltime':
                newStartDate = new Date(0); // Very early date for all time
                newEndDate = new Date();
                break;
            default:
                newStartDate = new Date(now.setMonth(now.getMonth() - 1));
                newEndDate = new Date();
        }

        setStartDate(newStartDate);
        setEndDate(newEndDate);
    }, [dateRange]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                console.log('Progress3: Fetching data for user:', user?.id);

                // Convert dates to ISO strings for API
                const startDateISO = startDate.toISOString();
                const endDateISO = endDate.toISOString();
                console.log('Progress3: Date range:', startDateISO, 'to', endDateISO);

                // Use the new service method with date filtering
                const logsData = await workoutLogService.getWorkoutLogsForProgress(user.id, {
                    startDate: startDateISO,
                    endDate: endDateISO,
                    limit: 1000,
                    includeDrafts: false
                });
                console.log('Progress3: Fetched workout logs:', logsData?.length || 0, 'logs');
                if (logsData && logsData.length > 0) {
                    console.log('Progress3: Sample log:', logsData[0]);
                }
                setWorkoutLogs(logsData);

                // Fetch exercises
                const exercisesData = await getCollectionCached('exercises', {});
                console.log('Progress3: Fetched exercises:', exercisesData?.length || 0, 'exercises');
                setExercises(exercisesData);

                // Group exercises by muscle group
                const groups = exercisesData.reduce((acc, ex) => {
                    const group = ex.primary_muscle_group || ex.primaryMuscleGroup || 'Other';
                    if (!acc[group]) acc[group] = [];
                    acc[group].push(ex);
                    return acc;
                }, {});
                console.log('Progress3: Created muscle groups:', Object.keys(groups).length, 'groups');
                setMuscleGroups(groups);
            } catch (error) {
                console.error("Progress3: Error fetching data: ", error);
            } finally {
                setIsLoading(false);
            }
        };

        if (user?.id) {
            fetchData();
        } else {
            console.log('Progress3: No user ID available');
            setIsLoading(false);
        }
    }, [user?.id, startDate, endDate]);

    useEffect(() => {
        if (workoutLogs.length > 0 && exercises.length > 0 && Object.keys(muscleGroups).length > 0) {
            processAnalyticsData();
        }
    }, [workoutLogs, exercises, muscleGroups, startDate, endDate, selectedExercise, volumeMetric]);

    useEffect(() => {
        if (Object.keys(bodyPartFocus).length > 0) {
            const allGroups = Object.keys(bodyPartFocus).map(group => ({ value: group, label: group }));
            setSelectedRadarGroups(allGroups);
        }
    }, [bodyPartFocus]);

    const processAnalyticsData = () => {
        const filteredLogs = filterLogsByDateRange(workoutLogs);
        calculateVolumeByMuscleGroup(filteredLogs);
        calculateStrengthMetrics(filteredLogs);
        calculateWorkoutCompletionRate(filteredLogs);
        calculateVolumeProgression(filteredLogs);
        calculatePersonalRecords(workoutLogs);
        calculateBodyPartFocus(filteredLogs);
        calculateSummaryStats(filteredLogs);
    };

    const filterLogsByDateRange = (logs) => {
        // Use the actual date range states instead of predefined ranges
        return logs.filter(log => {
            const logDate = new Date(log.date);
            return logDate >= startDate && logDate <= endDate;
        });
    };

    const calculateVolumeByMuscleGroup = (logs) => {
        const volumeByMuscle = {};

        Object.keys(muscleGroups).forEach(group => {
            volumeByMuscle[group] = 0;
        });

        logs.forEach(log => {
            if (!log.exercises || !Array.isArray(log.exercises)) return;

            log.exercises.forEach(exercise => {
                if (!exercise || (!exercise.exerciseId && !exercise.exercise_id)) return;

                const exerciseId = exercise.exerciseId || exercise.exercise_id;
                const exerciseData = exercises.find(e => e.id === exerciseId);
                if (!exerciseData) return;

                const primaryMuscleGroup = exerciseData.primary_muscle_group || exerciseData.primaryMuscleGroup;

                if (primaryMuscleGroup) {
                    let volume = calculateExerciseVolume(exercise);
                    volumeByMuscle[primaryMuscleGroup] = (volumeByMuscle[primaryMuscleGroup] || 0) + volume;

                    const secondaryGroups = exerciseData.secondary_muscle_groups || exerciseData.secondaryMuscleGroups;
                    if (secondaryGroups && Array.isArray(secondaryGroups) && secondaryGroups.length > 0) {
                        const secondaryVolume = volume * 0.4 / secondaryGroups.length;

                        secondaryGroups.forEach(secondaryGroup => {
                            volumeByMuscle[secondaryGroup] = (volumeByMuscle[secondaryGroup] || 0) + secondaryVolume;
                        });
                    }
                }
            });
        });

        const muscleData = Object.entries(volumeByMuscle)
            .filter(([_, value]) => value > 0)
            .map(([name, value]) => ({
                name: name,
                value
            }));

        setMuscleGroupData(muscleData);
    };

    const calculateExerciseVolume = (exercise) => {
        let volume = 0;
        if (exercise && exercise.sets && exercise.reps && Array.isArray(exercise.reps) && exercise.weights && Array.isArray(exercise.weights)) {
            for (let i = 0; i < exercise.sets; i++) {
                volume += (exercise.reps[i] || 0) * (exercise.weights[i] || 0);
            }
        }
        return volume;
    };

    const calculateExerciseVolumeForCompleted = (exercise) => {
        let volume = 0;
        if (exercise && exercise.reps && Array.isArray(exercise.reps) && exercise.weights && Array.isArray(exercise.weights) && exercise.completed && Array.isArray(exercise.completed)) {
            for (let i = 0; i < exercise.completed.length; i++) {
                if (exercise.completed[i]) {
                    volume += (exercise.reps[i] || 0) * (exercise.weights[i] || 0);
                }
            }
        }
        return volume;
    };

    const calculateCompletedSets = (exercise) => {
        let completedSets = 0;
        if (exercise && exercise.completed && Array.isArray(exercise.completed)) {
            completedSets = exercise.completed.filter(c => c === true).length;
        }
        return completedSets;
    };

    const calculateStrengthMetrics = (logs) => {
        if (!selectedExercise) return;

        const strengthData = [];
        const dateMap = new Map();

        logs.forEach(log => {
            if (!log.exercises || !Array.isArray(log.exercises)) return;

            const date = new Date(log.date).toLocaleDateString();
            log.exercises.forEach(exercise => {
                if (exercise && (exercise.exerciseId || exercise.exercise_id) === selectedExercise) {
                    if (exercise.weights && Array.isArray(exercise.weights) && exercise.weights.length > 0 &&
                        exercise.reps && Array.isArray(exercise.reps) && exercise.reps.length > 0) {
                        const maxWeight = Math.max(...exercise.weights);
                        const weightIndex = exercise.weights.indexOf(maxWeight);
                        const matchingReps = exercise.reps[weightIndex];

                        if (matchingReps && matchingReps <= 10) {
                            const estimatedOneRM = Math.round(maxWeight * (36 / (37 - matchingReps)));

                            if (!dateMap.has(date) || dateMap.get(date).estimatedOneRM < estimatedOneRM) {
                                dateMap.set(date, {
                                    date,
                                    maxWeight,
                                    estimatedOneRM
                                });
                            }
                        }
                    }
                }
            });
        });

        Array.from(dateMap.values()).forEach(entry => {
            strengthData.push(entry);
        });

        strengthData.sort((a, b) => new Date(a.date) - new Date(b.date));
        setStrengthMetrics(strengthData);
    };

    const calculateWorkoutCompletionRate = (logs) => {
        const totalPlannedWorkouts = logs.length;
        const completedWorkouts = logs.filter(log => log.is_finished).length;

        const completionPercentage = totalPlannedWorkouts > 0
            ? Math.round((completedWorkouts / totalPlannedWorkouts) * 100)
            : 0;

        setCompletionRate(completionPercentage);
    };

    const calculateVolumeProgression = (logs) => {
        const volumeByWeek = new Map();

        logs.forEach(log => {
            if (!log.exercises || !Array.isArray(log.exercises)) return;

            const { dateObj, dateStr } = getWeekStartDate(log.date);
            const weekKey = dateStr;

            let weeklyVolume = volumeByWeek.get(weekKey) || 0;

            log.exercises.forEach(exercise => {
                if (exercise) { 
                    if (volumeMetric === 'sets') {
                        weeklyVolume += calculateCompletedSets(exercise);
                    } else { // 'totalVolume'
                        weeklyVolume += calculateExerciseVolumeForCompleted(exercise);
                    }
                }
            });
            volumeByWeek.set(weekKey, weeklyVolume);
        });

        const volumeProgressionData = Array.from(volumeByWeek.entries()).map(([date, volume]) => ({
            date,
            volume
        }));

        volumeProgressionData.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateA - dateB;
        });

        setVolumeData(volumeProgressionData);
    };

    const calculatePersonalRecords = (logs) => {
        const prs = new Map();

        logs.forEach(log => {
            if (!log.exercises || !Array.isArray(log.exercises)) return;
log.exercises.forEach(exercise => {
    if (!exercise || (!exercise.exerciseId && !exercise.exercise_id)) return;

    const exerciseId = exercise.exerciseId || exercise.exercise_id;
    const exerciseData = exercises.find(e => e.id === exerciseId);
                if (!exerciseData) return;

                if (exercise.weights && Array.isArray(exercise.weights) && exercise.weights.length > 0) {
                    const maxWeight = Math.max(...exercise.weights);
                    const currentPR = prs.get(exercise.exerciseId) || { weight: 0, date: null };

                    if (maxWeight > currentPR.weight) {
                        prs.set(exerciseId, {
                            exerciseId: exerciseId,
                            exerciseName: exerciseData.name,
                            weight: maxWeight,
                            date: new Date(log.date).toLocaleDateString()
                        });
                    }
                }
            });
        });

        setPersonalRecords(Array.from(prs.values()));
    };
    
    const calculateBodyPartFocus = (logs) => {
        const bodyPartCount = {};
        logs.forEach(log => {
            if (!log.exercises || !Array.isArray(log.exercises)) return;
            log.exercises.forEach(exercise => {
                if (!exercise || (!exercise.exerciseId && !exercise.exercise_id)) return;
                const exerciseId = exercise.exerciseId || exercise.exercise_id;
                const exerciseData = exercises.find(e => e.id === exerciseId);
                if (!exerciseData) return;
                const primaryMuscleGroup = exerciseData.primary_muscle_group || exerciseData.primaryMuscleGroup || 'Other';
                if (primaryMuscleGroup) {
                    const completed = exercise.completed || [];
                    // Count the actual number of completed sets instead of just exercises
                    const completedSets = completed.filter(c => c === true).length;
                    if (completedSets > 0) {
                        bodyPartCount[primaryMuscleGroup] = (bodyPartCount[primaryMuscleGroup] || 0) + completedSets;
                    }
                }
            });
        });
        setBodyPartFocus(bodyPartCount);
    };
    
    const calculateSummaryStats = async (allLogs) => {
        const stats = {};
        exercises.forEach(exercise => {
            const exerciseLogs = allLogs.filter(log => {
                const logExercises = log.exercises || [];
                const ex = logExercises.find(e => (e.exerciseId || e.exercise_id) === exercise.id);
                return ex && (ex.completed || []).some(c => c === true);
            });
            if (exerciseLogs.length > 0) {
                const allCompletedWeights = exerciseLogs.flatMap(log => {
                    const logExercises = log.exercises || [];
                    const ex = logExercises.find(e => (e.exerciseId || e.exercise_id) === exercise.id);
                    return ex ? (ex.weights || []).filter((_, index) => (ex.completed || [])[index]) : [];
                });
                const maxWeight = allCompletedWeights.length > 0 ? Math.max(...allCompletedWeights) : 0;
                let volumeTrend = 'stable';
                if (exerciseLogs.length >= 2) {
                    const sortedLogs = [...exerciseLogs].sort((a, b) => {
                        const dateA = new Date(a.date);
                        const dateB = new Date(b.date);
                        return dateA - dateB;
                    });
                    const volumeData = sortedLogs.map(log => {
                        const logExercises = log.exercises || [];
                        const ex = logExercises.find(e => (e.exerciseId || e.exercise_id) === exercise.id);
                        const logDate = new Date(log.date);
                        return {
                            date: logDate.getTime(),
                            volume: ex ? (ex.weights || []).reduce((sum, weight, index) => {
                                if ((ex.completed || [])[index]) {
                                    return sum + weight * ((ex.reps || [])[index] || 0);
                                }
                                return sum;
                            }, 0) : 0
                        };
                    });
                    if (volumeData.length >= 2) {
                        const n = volumeData.length;
                        const sumX = volumeData.reduce((sum, p) => sum + p.date, 0);
                        const sumY = volumeData.reduce((sum, p) => sum + p.volume, 0);
                        const sumXY = volumeData.reduce((sum, p) => sum + (p.date * p.volume), 0);
                        const sumXX = volumeData.reduce((sum, p) => sum + (p.date * p.date), 0);
                        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
                        const avgVolume = sumY / n;
                        const significanceThreshold = avgVolume * 0.001;
                        if (slope > significanceThreshold) {
                            volumeTrend = 'increasing';
                        } else if (slope < -significanceThreshold) {
                            volumeTrend = 'decreasing';
                        }
                        const rSquared = calculateRSquared(volumeData.map(d => ({ x: d.date, y: d.volume })), slope, (sumY - slope * sumX) / n);
                        stats[exercise.name] = {
                            maxWeight,
                            frequency: exerciseLogs.length,
                            bodyPart: exercise.primary_muscle_group || exercise.primaryMuscleGroup,
                            exerciseType: exercise.exercise_type || exercise.exerciseType,
                            volumeTrend,
                            trendConfidence: Math.round(rSquared * 100)
                        };
                    } else {
                        stats[exercise.name] = {
                            maxWeight,
                            frequency: exerciseLogs.length,
                            bodyPart: exercise.primary_muscle_group || exercise.primaryMuscleGroup,
                            exerciseType: exercise.exercise_type || exercise.exerciseType,
                            volumeTrend: 'insufficient data',
                            trendConfidence: 0
                        };
                    }
                } else {
                    stats[exercise.name] = {
                        maxWeight,
                        frequency: exerciseLogs.length,
                        bodyPart: exercise.primary_muscle_group || exercise.primaryMuscleGroup,
                        exerciseType: exercise.exercise_type || exercise.exerciseType,
                        volumeTrend: 'insufficient data',
                        trendConfidence: 0
                    };
                }
            }
        });
        setSummaryStats(stats);
    };
    
    const calculateRSquared = (points, slope, intercept) => {
        if (points.length < 2) return 0;
        const yMean = points.reduce((sum, p) => sum + p.y, 0) / points.length;
        let ssTotal = 0;
        let ssResidual = 0;
        points.forEach(point => {
            const yPredicted = slope * point.x + intercept;
            ssTotal += Math.pow(point.y - yMean, 2);
            ssResidual += Math.pow(point.y - yPredicted, 2);
        });
        return ssTotal === 0 ? 0 : 1 - (ssResidual / ssTotal);
    };

    const estimateOneRepMax = (weight, reps) => {
        if (reps >= 36) return weight;
        return Math.round(weight * (36 / (37 - reps)));
    };

    const renderOverviewTab = () => {
        return (
            <div className="analytics-overview">
                <Row>
                    {/* <Col md={6} className="mb-4">
                        <Card className="shadow-sm h-100">
                            <Card.Header>
                                <h5 className="mb-0">Workout Completion Rate</h5>
                            </Card.Header>
                            <Card.Body className="d-flex flex-column align-items-center justify-content-center">
                                <div className="progress-circle" style={{ width: '150px', height: '150px' }}>
                                    <svg viewBox="0 0 36 36" className="circular-chart">
                                        <path
                                            className="circle-bg"
                                            d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                                        />
                                        <path
                                            className="circle"
                                            strokeDasharray={`${completionRate}, 100`}
                                            d="M18 2.0845
                        a 15.9155 15.9155 0 0 1 0 31.831
                        a 15.9155 15.9155 0 0 1 0 -31.831"
                                        />
                                    </svg>
                                    <div className="progress-text">{completionRate}%</div>
                                </div>
                                <div className="text-center mt-3">
                                    Completion rate {dateRange === 'alltime' ? 'for all time' : `from ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`}
                                </div>
                            </Card.Body>
                        </Card>
                    </Col> */}

                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm h-100">
                            <Card.Header>
                                <h5 className="mb-0">Volume by Muscle Group</h5>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={250}>
                                    <PieChart>
                                        <Pie
                                            data={muscleGroupData}
                                            cx="50%"
                                            cy="50%"
                                            labelLine={false}
                                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                                            outerRadius={80}
                                            fill="#8884d8"
                                            dataKey="value"
                                        >
                                            {muscleGroupData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value) => `${value.toLocaleString()} lb`} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header> 
                                <div className="d-flex justify-content-between align-items-center">
                                    <h5 className="mb-0">Weekly Volume Progression</h5>
                                    <ButtonGroup size="sm">
                                        <Button variant={volumeMetric === 'sets' ? 'primary' : 'outline-primary'} onClick={() => setVolumeMetric('sets')}>Sets</Button>
                                        <Button variant={volumeMetric === 'totalVolume' ? 'primary' : 'outline-primary'} onClick={() => setVolumeMetric('totalVolume')}>Volume</Button>
                                    </ButtonGroup>
                                </div>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart
                                        data={volumeData}
                                        margin={{ top: 5, right: 30, left: 30, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="date"
                                            tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        />
                                        <YAxis label={{ value: volumeMetric === 'sets' ? 'Sets' : 'Volume (lbs)', position: 'insideLeft', angle: -90, dy: 0, dx: -10, style: { textAnchor: 'middle' } }} />
                                        <Tooltip formatter={(value) => `${value.toLocaleString()} ${volumeMetric === 'sets' ? 'sets' : 'lbs'}`} />
                                        <Legend />
                                        <Line type="monotone" dataKey="volume" stroke="#8884d8" activeDot={{ r: 8 }} name={volumeMetric === 'sets' ? 'Total Sets' : 'Total Volume'} >
                                            <LabelList 
                                                dataKey="name"
                                                position="bottom"
                                                fontSize={12}
                                                fill="#333"
                                            />
                                        </Line>
                                    </LineChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <h5 className="mb-0">Personal Records</h5>
                            </Card.Header>
                            <Card.Body>
                                <div className="table-responsive">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Exercise</th>
                                                <th>Maximum Weight</th>
                                                <th>Date Achieved</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {personalRecords.length > 0 ? (
                                                personalRecords.map((pr, index) => (
                                                    <tr key={index}>
                                                        <td>{pr.exerciseName}</td>
                                                        <td>{pr.weight} lb</td>
                                                        <td>{pr.date}</td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan="3" className="text-center">No personal records found</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

            </div>
        );
    };

    const renderStrengthTab = () => {
        return (
            <div className="strength-analytics">
                <Row className="mb-4">
                    <Col>
                        <Card className="shadow-sm">
                            <Card.Header>
                                <div className="d-flex justify-content-between align-items-center">
                                    <h5 className="mb-0">Strength Progression</h5>
                                    <Form.Select
                                        className="w-auto"
                                        value={selectedExercise || ''}
                                        onChange={(e) => setSelectedExercise(e.target.value)}
                                    >
                                        {exercises.map(ex => (
                                            <option key={ex.id} value={ex.id}>{ex.name}</option>
                                        ))}
                                    </Form.Select>
                                </div>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={300}>
                                    <LineChart
                                        data={strengthMetrics}
                                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis />
                                        <Tooltip />
                                        <Legend />
                                        <Line type="monotone" dataKey="maxWeight" stroke="#82ca9d" name="Max Weight" />
                                        <Line type="monotone" dataKey="estimatedOneRM" stroke="#8884d8" name="Estimated 1RM" />
                                    </LineChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                {selectedExercise && strengthMetrics.length > 0 && (
                    <Row>
                        <Col md={12} className="mb-4">
                            <Card className="shadow-sm">
                                <Card.Header>
                                    <h5 className="mb-0">Strength Metrics for {exercises.find(e => e.id === selectedExercise)?.name}</h5>
                                </Card.Header>
                                <Card.Body>
                                    <div className="table-responsive">
                                        <table className="table">
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Max Weight</th>
                                                    <th>Estimated 1RM</th>
                                                    <th>Progress</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {strengthMetrics.map((metric, index) => {
                                                    const prevMetric = index > 0 ? strengthMetrics[index - 1] : null;
                                                    const change = prevMetric ? metric.estimatedOneRM - prevMetric.estimatedOneRM : 0;
                                                    return (
                                                        <tr key={index}>
                                                            <td>{metric.date}</td>
                                                            <td>{metric.maxWeight} lb</td>
                                                            <td>{metric.estimatedOneRM} lb</td>
                                                            <td>
                                                                {index > 0 ? (
                                                                    <span className={change > 0 ? 'text-success' : change < 0 ? 'text-danger' : 'text-muted'}>
                                                                        {change > 0 ? '+' : ''}{change} lb
                                                                    </span>
                                                                ) : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card.Body>
                            </Card>
                        </Col>
                    </Row>
                )}
            </div>
        );
    };

    const renderVolumeTab = () => {
        const muscleVolumeTrends = {};
        Object.keys(muscleGroups).forEach(group => {
            muscleVolumeTrends[group] = [];
        });

        const logsByWeek = {};
        workoutLogs.forEach(log => {
            const { dateStr } = getWeekStartDate(log.date);
            const weekLabel = dateStr;

            if (!logsByWeek[weekLabel]) {
                logsByWeek[weekLabel] = [];
            }
            logsByWeek[weekLabel].push(log);
        });

        Object.entries(logsByWeek).forEach(([week, logs]) => {
            const weeklyVolume = {};
            Object.keys(muscleGroups).forEach(group => {
                weeklyVolume[group] = 0;
            });

            logs.forEach(log => {
                if (!log.exercises || !Array.isArray(log.exercises)) return;

                log.exercises.forEach(exercise => {
                    if (!exercise || (!exercise.exerciseId && !exercise.exercise_id)) return;
                    const exerciseId = exercise.exerciseId || exercise.exercise_id;
                    const exerciseData = exercises.find(e => e.id === exerciseId); 
                    
                    let volume;
                    if (volumeMetric === 'sets') {
                        volume = calculateCompletedSets(exercise);
                    } else {
                        volume = calculateExerciseVolumeForCompleted(exercise);
                    }

                    if (!exerciseData) return;

                    const primaryGroup = exerciseData.primaryMuscleGroup || exerciseData.primary_muscle_group;
                    if (primaryGroup) {
                        weeklyVolume[primaryGroup] = (weeklyVolume[primaryGroup] || 0) + volume;
                    }
                });
            });

            Object.entries(weeklyVolume).forEach(([group, volume]) => {
                if (volume > 0) {
                    muscleVolumeTrends[group].push({
                        date: week,
                        volume
                    });
                }
            });
        });

        Object.keys(muscleVolumeTrends).forEach(group => {
            muscleVolumeTrends[group].sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateA - dateB;
            });
        });

        const stackedData = [];
        const weeks = [...new Set(Object.values(muscleVolumeTrends)
            .flatMap(data => data.map(item => item.date)))].sort((a, b) => {
                const dateA = new Date(a);
                const dateB = new Date(b);
                return dateA - dateB;
            });

        weeks.forEach(week => {
            const weekData = { date: week };
            Object.entries(muscleVolumeTrends).forEach(([group, data]) => {
                const weekItem = data.find(item => item.date === week);
                weekData[group] = weekItem ? weekItem.volume : 0;
            });
            stackedData.push(weekData);
        });

        const activeGroups = Object.keys(muscleVolumeTrends).filter(group =>
            muscleVolumeTrends[group].some(data => data.volume > 0)
        );

        return (
            <div className="volume-analytics">
                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <div className="d-flex justify-content-between align-items-center">
                                    <h5 className="mb-0">Volume Distribution by Muscle Group</h5>
                                    <ButtonGroup size="sm">
                                        <Button variant={volumeMetric === 'sets' ? 'primary' : 'outline-primary'} onClick={() => setVolumeMetric('sets')}>Sets</Button>
                                        <Button variant={volumeMetric === 'totalVolume' ? 'primary' : 'outline-primary'} onClick={() => setVolumeMetric('totalVolume')}>Volume</Button>
                                    </ButtonGroup>
                                </div>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={400}>
                                    <BarChart
                                        data={stackedData}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                        barCategoryGap="20%"
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis label={{ value: volumeMetric === 'sets' ? 'Sets' : 'Volume (lbs)', position: 'insideLeft', angle: -90, dy: 0, dx: -10, style: { textAnchor: 'middle' } }} />
                                        <Tooltip formatter={(value) => `${value.toLocaleString()} ${volumeMetric === 'sets' ? 'sets' : 'lbs'}`} />
                                        <Legend />
                                        {activeGroups.map((group, index) => (
                                            <Bar
                                                key={group}
                                                dataKey={group}
                                                stackId="a"
                                                fill={COLORS[index % COLORS.length]}
                                                name={group}
                                            />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>

                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <div className="d-flex justify-content-between align-items-center">
                                    <h5 className="mb-0">Volume Trends by Muscle Group</h5>
                                    <ButtonGroup size="sm">
                                        <Button variant={volumeMetric === 'sets' ? 'primary' : 'outline-primary'} onClick={() => setVolumeMetric('sets')}>Sets</Button>
                                        <Button variant={volumeMetric === 'totalVolume' ? 'primary' : 'outline-primary'} onClick={() => setVolumeMetric('totalVolume')}>Volume</Button>
                                    </ButtonGroup>
                                </div>
                            </Card.Header>
                            <Card.Body>
                                <ResponsiveContainer width="100%" height={400}>
                                    <LineChart
                                        data={stackedData}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="date"
                                            allowDuplicatedCategory={false}
                                            type="category"
                                            allowDecimals={false}
                                        />
                                        <YAxis label={{ value: volumeMetric === 'sets' ? 'Sets' : 'Volume (lbs)', position: 'insideLeft', angle: -90, dy: 0, dx: -10, style: { textAnchor: 'middle' } }} />
                                        <Tooltip formatter={(value) => `${value.toLocaleString()} ${volumeMetric === 'sets' ? 'sets' : 'lbs'}`} />
                                        <Legend />
                                        {activeGroups.map((group, index) => (
                                            <Line
                                                key={group}
                                                type="monotone"
                                                dataKey={group}
                                                name={group}
                                                stroke={COLORS[index % COLORS.length]}
                                                activeDot={{ r: 8 }}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    };

    const renderBalanceTab = () => {
        // Calculate previous period data
        let previousBodyPartFocus = {};
        if (dateRange !== 'alltime') {
            let prevStartDate, prevEndDate;
            switch (dateRange) {
                case '1month':
                    prevStartDate = new Date(startDate);
                    prevStartDate.setMonth(prevStartDate.getMonth() - 1);
                    prevEndDate = new Date(startDate);
                    break;
                case '3months':
                    prevStartDate = new Date(startDate);
                    prevStartDate.setMonth(prevStartDate.getMonth() - 3);
                    prevEndDate = new Date(startDate);
                    break;
                case '1year':
                    prevStartDate = new Date(startDate);
                    prevStartDate.setFullYear(prevStartDate.getFullYear() - 1);
                    prevEndDate = new Date(startDate);
                    break;
                default:
                    prevStartDate = new Date(startDate);
                    prevEndDate = new Date(endDate);
            }

            // Filter logs for previous period
            const prevLogs = workoutLogs.filter(log => {
                const logDate = new Date(log.date);
                return logDate >= prevStartDate && logDate <= prevEndDate;
            });

            // Calculate bodyPartFocus for previous period
            prevLogs.forEach(log => {
                if (!log.exercises || !Array.isArray(log.exercises)) return;
                log.exercises.forEach(exercise => {
                    if (!exercise || (!exercise.exerciseId && !exercise.exercise_id)) return;
                    const exerciseId = exercise.exerciseId || exercise.exercise_id;
                    const exerciseData = exercises.find(e => e.id === exerciseId);
                    if (!exerciseData) return;
                    const primaryMuscleGroup = exerciseData.primary_muscle_group || exerciseData.primaryMuscleGroup || 'Other';
                    if (primaryMuscleGroup) {
                        const completed = exercise.completed || [];
                        const completedSets = completed.filter(c => c === true).length;
                        if (completedSets > 0) {
                            previousBodyPartFocus[primaryMuscleGroup] = (previousBodyPartFocus[primaryMuscleGroup] || 0) + completedSets;
                        }
                    }
                });
            });
        }

        // Prepare data for radar chart
        const currentData = Object.entries(bodyPartFocus).map(([key, value]) => ({ subject: key, current: value }));
        const previousData = Object.entries(previousBodyPartFocus).map(([key, value]) => ({ subject: key, previous: value }));

        // Combine data
        const allSubjects = new Set([...currentData.map(d => d.subject), ...previousData.map(d => d.subject)]);
        const radarData = Array.from(allSubjects).map(subject => {
            const curr = currentData.find(d => d.subject === subject)?.current || 0;
            const prev = previousData.find(d => d.subject === subject)?.previous || 0;
            return { subject, current: curr, previous: prev };
        });

        const radarGroupOptions = Object.keys(bodyPartFocus).map(group => ({ value: group, label: group }));
        const selectedGroupsSet = new Set(selectedRadarGroups.map(g => g.value));
        const filteredRadarData = radarData.filter(d => selectedGroupsSet.has(d.subject));

        return (
            <div className="balance-analytics">
                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <h5 className="mb-0">Muscle Group Balance Radar</h5>
                            </Card.Header>
                            <Card.Body>
                                <div className="muscle-group-select-container mb-3">
                                    <Select
                                        isMulti
                                        options={radarGroupOptions}
                                        value={selectedRadarGroups}
                                        onChange={setSelectedRadarGroups}
                                        className="mb-3"
                                        closeMenuOnSelect={false}
                                        hideSelectedOptions={false}
                                        components={{ Option: CustomOption, ValueContainer: CustomValueContainer }}
                                        styles={checkboxSelectStyles}
                                        classNamePrefix="select"
                                        isSearchable={false}
                                    />
                                </div>
                                <ResponsiveContainer width="100%" height={350}>
                                    <RadarChart data={filteredRadarData}>
                                        <PolarGrid />
                                        <PolarAngleAxis dataKey="subject" />
                                        <PolarRadiusAxis />
                                        <Radar dataKey="current" stroke="#3057c0ff" fill="#3057c0ff" fillOpacity={0.6} name="Current" />
                                        {dateRange !== 'alltime' && <Radar dataKey="previous" stroke="#388e3c" fill="#388e3c" fillOpacity={0.6} name="Previous" />}
                                        <Legend />
                                    </RadarChart>
                                </ResponsiveContainer>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
                <Row>
                    <Col md={12} className="mb-4">
                        <Card className="shadow-sm">
                            <Card.Header>
                                <h5 className="mb-0">Exercise Progress Trends</h5>
                            </Card.Header>
                            <Card.Body>
                                <div className="table-responsive">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Exercise</th>
                                                <th>Max Weight</th>
                                                <th>Volume Trend</th>
                                                <th>Muscle Group</th>
                                                <th>Exercise Type</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(summaryStats).map(([exercise, stats]) => (
                                                <tr key={exercise}>
                                                    <td>{exercise}</td>
                                                    <td>{stats.maxWeight} lbs</td>
                                                    <td>
                                                        <span className={
                                                            stats.volumeTrend === 'increasing' ? 'text-success' :
                                                            stats.volumeTrend === 'decreasing' ? 'text-danger' : ''
                                                        }>
                                                            {stats.volumeTrend === 'increasing' ? '↑' :
                                                            stats.volumeTrend === 'decreasing' ? '↓' : '→'} {stats.volumeTrend}
                                                        </span>
                                                    </td>
                                                    <td>{stats.bodyPart}</td>
                                                    <td>{stats.exerciseType}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card.Body>
                        </Card>
                    </Col>
                </Row>
            </div>
        );
    };

    return (
        <Container fluid className="soft-container analytics-container">
            <Row className="justify-content-center">
                <Col md={10}>
                    {isLoading ? (
                        <div className="text-center py-4">
                            <Spinner animation="border" className="spinner-blue" />
                            <p className="soft-text mt-2">Loading...</p>
                        </div>
                    ) : (
                        <div className="soft-card analytics-card shadow border-0">
                            <div className="d-flex justify-content-between align-items-center mb-4">
                                <h1 className="soft-title analytics-title">Workout Analytics</h1>
                                <div className="d-flex align-items-center gap-2">
                                    <Form.Label className="me-2">Time Period:</Form.Label>
                                    <Form.Select
                                        value={dateRange}
                                        onChange={(e) => setDateRange(e.target.value)}
                                        className="form-control form-control-sm"
                                    >
                                        <option value="1month">1 Month</option>
                                        <option value="3months">3 Months</option>
                                        <option value="1year">1 Year</option>
                                        <option value="alltime">All Time</option>
                                    </Form.Select>
                                </div>
                            </div>

                            <Nav tabs className="analytics-tabs mb-4">
                                <Nav.Item>
                                    <Nav.Link
                                        className={activeTab === 'overview' ? 'active' : ''}
                                        onClick={() => setActiveTab('overview')}
                                    >
                                        Overview
                                    </Nav.Link>
                                </Nav.Item>
                                <Nav.Item>
                                    <Nav.Link
                                        className={activeTab === 'volume'}
                                        onClick={() => setActiveTab('volume')}
                                    >
                                        Volume Analysis
                                    </Nav.Link>
                                </Nav.Item>
                                <Nav.Item>
                                    <Nav.Link
                                        className={activeTab === 'strength'}
                                        onClick={() => setActiveTab('strength')}
                                    >
                                        Strength Analysis
                                    </Nav.Link>
                                </Nav.Item>
                                <Nav.Item>
                                    <Nav.Link
                                        className={activeTab === 'balance'}
                                        onClick={() => setActiveTab('balance')}
                                    >
                                        Training Balance
                                    </Nav.Link>
                                </Nav.Item>
                            </Nav>

                            {activeTab === 'overview' && renderOverviewTab()}
                            {activeTab === 'strength' && renderStrengthTab()}
                            {activeTab === 'volume' && renderVolumeTab()}
                            {activeTab === 'balance' && renderBalanceTab()}
                        </div>
                    )}
                </Col>
            </Row>
        </Container>
    );
}

export default Progress3;