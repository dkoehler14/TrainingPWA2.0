import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getCollectionCached, getSubcollectionCached, warmUserCache } from '../api/enhancedFirestoreCache';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import EnhancedAICoach from '../components/EnhancedAICoach';
import CompoundLiftTracker from '../components/CompoundLiftTracker';
import HypertrophyHub from '../components/HypertrophyHub';
import PRTracker from '../components/PRTracker';
import '../styles/ProgressCoach.css';

// Helper to calculate e1RM
const calculateE1RM = (weight, reps) => {
    if (reps === 0) return 0;
    return weight * (1 + (reps / 30));
};

// Helper to calculate training block summary
const calculateTrainingBlockSummary = (logs, daysBack = 30) => {
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const recentLogs = logs.filter(log => log.completedDate >= cutoffDate);
    
    let totalVolume = 0;
    let totalSets = 0;
    let totalWorkouts = recentLogs.length;
    
    recentLogs.forEach(log => {
        log.exercises.forEach(ex => {
            const numSets = ex.sets || 0;
            const reps = ex.reps || [];
            const weights = ex.weights || [];
            const completed = ex.completed || [];
            
            for (let i = 0; i < numSets - 1; i++) {
                if (completed[i]) {
                    totalVolume += (weights[i] || 0) * (reps[i] || 0);
                    totalSets++;
                }
            }
        });
    });
    
    return {
        totalWorkouts,
        totalVolume,
        totalSets,
        avgVolumePerWorkout: totalWorkouts > 0 ? totalVolume / totalWorkouts : 0,
        avgSetsPerWorkout: totalWorkouts > 0 ? totalSets / totalWorkouts : 0
    };
};

// Helper to find PRs
const findRecentPRs = (analytics, logs, daysBack = 30) => {
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
    const prs = [];
    
    // Find exercises with recent improvements in e1RM
    analytics.forEach(exercise => {
        if (exercise.lastUpdated?.toDate() >= cutoffDate) {
            // Check if this is a significant improvement (>2.5%)
            const recentLogs = logs.filter(log => 
                log.completedDate >= cutoffDate &&
                log.exercises.some(ex => ex.exerciseId === exercise.exerciseId)
            );
            
            if (recentLogs.length > 0) {
                prs.push({
                    exerciseName: exercise.exerciseName,
                    e1RM: exercise.e1RM,
                    date: exercise.lastUpdated.toDate()
                });
            }
        }
    });
    
    return prs.slice(0, 3); // Return top 3 recent PRs
};

const ProgressCoach = () => {
    const [dashboardData, setDashboardData] = useState({
        trainingBlockSummary: {},
        powerKPIs: {},
        recentPRs: [],
        aiInsights: [],
        nextWorkoutPreview: null,
        plateauAlerts: []
    });
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState(null);
    const [exercisesList, setExercisesList] = useState([]);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(user => {
            setUserId(user ? user.uid : null);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                // Add cache warming before data fetching
                if (userId) {
                    try {
                        await warmUserCache(userId, 'normal');
                        console.log('Cache warming completed for ProgressCoach');
                    } catch (error) {
                        console.warn('Cache warming failed, proceeding with data fetch:', error);
                    }
                }

                // Fetch workout logs
                const workoutLogs = await getCollectionCached('workoutLogs', {
                    where: [['userId', '==', userId], ['isWorkoutFinished', '==', true]],
                    orderBy: [['completedDate', 'desc']]
                }, 10 * 60 * 1000);

                // Fetch exercises list
                const exercisesData = await getCollectionCached('exercises', {}, 30 * 60 * 1000);
                setExercisesList(exercisesData);

                // Convert Firestore timestamps
                const processedLogs = workoutLogs.map(log => ({
                    ...log,
                    completedDate: log.completedDate.toDate()
                }));

                // Fetch analytics data
                let exerciseAnalytics = [];
                try {
                    exerciseAnalytics = await getSubcollectionCached(`userAnalytics/${userId}`, 'exerciseAnalytics', {}, 15 * 60 * 1000);
                } catch (error) {
                    console.log("No analytics data found for user:", error.message);
                    exerciseAnalytics = [];
                }

                // Process dashboard data
                processDashboardData(processedLogs, exerciseAnalytics, exercisesData);

            } catch (error) {
                console.error("Error fetching progress coach data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [userId]);

    const processDashboardData = (logs, analytics, exercises) => {
        if (!logs || logs.length === 0) {
            setDashboardData({
                trainingBlockSummary: {},
                powerKPIs: {},
                recentPRs: [],
                aiInsights: [],
                nextWorkoutPreview: null,
                plateauAlerts: []
            });
            return;
        }

        // Calculate training block summary (last 30 days)
        const trainingBlockSummary = calculateTrainingBlockSummary(logs, 30);

        // Calculate Power KPIs
        const totalVolumeLoad = analytics.reduce((sum, ex) => sum + (ex.totalVolume || 0), 0);
        const maxE1RM = Math.max(...analytics.map(ex => ex.e1RM || 0));
        const maxE1RMExercise = analytics.find(ex => ex.e1RM === maxE1RM)?.exerciseName || 'N/A';
        
        // Calculate compound lift progress (focus on main lifts)
        const compoundLifts = ['Squat', 'Deadlift', 'Bench Press', 'Overhead Press'];
        const compoundProgress = analytics
            .filter(ex => compoundLifts.some(lift => ex.exerciseName?.includes(lift)))
            .map(ex => ({
                name: ex.exerciseName,
                e1RM: ex.e1RM,
                totalVolume: ex.totalVolume
            }));

        const powerKPIs = {
            totalVolumeLoad,
            maxE1RM,
            maxE1RMExercise,
            compoundProgress,
            workoutFrequency: trainingBlockSummary.totalWorkouts / 4.3 // per week
        };

        // Find recent PRs
        const recentPRs = findRecentPRs(analytics, logs, 30);

        // Generate AI insights
        const aiInsights = generateAIInsights(logs, analytics, trainingBlockSummary);

        // Generate next workout preview (placeholder)
        const nextWorkoutPreview = {
            programName: "Current Program",
            focusAreas: ["Upper Body", "Compound Movements"],
            estimatedDuration: "60-75 minutes",
            keyExercises: ["Bench Press", "Pull-ups", "Overhead Press"]
        };

        // Generate plateau alerts
        const plateauAlerts = generatePlateauAlerts(analytics);

        setDashboardData({
            trainingBlockSummary,
            powerKPIs,
            recentPRs,
            aiInsights,
            nextWorkoutPreview,
            plateauAlerts
        });
    };

    const generateAIInsights = (logs, analytics, summary) => {
        const insights = [];
        
        // Volume trend insight
        if (summary.avgVolumePerWorkout > 5000) {
            insights.push({
                type: 'positive',
                title: 'Strong Volume Consistency',
                message: `Your average workout volume of ${Math.round(summary.avgVolumePerWorkout)} lbs shows excellent training consistency.`
            });
        }

        // Frequency insight
        if (summary.totalWorkouts >= 12) {
            insights.push({
                type: 'positive',
                title: 'Excellent Training Frequency',
                message: `${summary.totalWorkouts} workouts this month demonstrates outstanding commitment to your goals.`
            });
        } else if (summary.totalWorkouts < 8) {
            insights.push({
                type: 'warning',
                title: 'Opportunity for More Consistency',
                message: `Consider increasing training frequency. Aim for 3-4 sessions per week for optimal progress.`
            });
        }

        // Strength progression insight
        const maxE1RM = Math.max(...analytics.map(ex => ex.e1RM || 0));
        if (maxE1RM > 200) {
            insights.push({
                type: 'achievement',
                title: 'Strength Milestone Achieved',
                message: `Your estimated 1RM of ${Math.round(maxE1RM)} lbs represents significant strength development.`
            });
        }

        return insights.slice(0, 3); // Return top 3 insights
    };

    const generatePlateauAlerts = (analytics) => {
        const alerts = [];
        
        // Check for exercises that haven't improved in 4+ weeks
        const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
        
        analytics.forEach(exercise => {
            if (exercise.lastUpdated?.toDate() < fourWeeksAgo && exercise.totalVolume > 1000) {
                alerts.push({
                    exerciseName: exercise.exerciseName,
                    lastImprovement: exercise.lastUpdated?.toDate(),
                    suggestion: "Consider deload week or exercise variation"
                });
            }
        });

        return alerts.slice(0, 2); // Return top 2 alerts
    };

    if (loading) {
        return <div className="progress-coach-loading">Loading Progress & AI Coach...</div>;
    }

    if (!userId) {
        return <div className="progress-coach-auth">Please log in to view your Progress & AI Coach.</div>;
    }

    if (!dashboardData.trainingBlockSummary.totalWorkouts) {
        return <div className="progress-coach-empty">Complete some workouts to unlock your Progress & AI Coach insights!</div>;
    }

    const { trainingBlockSummary, powerKPIs, recentPRs, aiInsights, nextWorkoutPreview, plateauAlerts } = dashboardData;

    return (
        <div className="progress-coach">
            <div className="progress-coach-header">
                <h1>Progress & AI Coach</h1>
                <p className="progress-coach-subtitle">Your intelligent training companion for optimized performance</p>
            </div>

            {/* Dynamic Dashboard Overview */}
            <div className="dashboard-overview">
                <h2>Dynamic Dashboard Overview</h2>
                
                {/* Training Block Summary */}
                <div className="training-block-summary">
                    <h3>30-Day Training Block Summary</h3>
                    <div className="summary-cards">
                        <div className="summary-card">
                            <div className="card-value">{trainingBlockSummary.totalWorkouts}</div>
                            <div className="card-label">Workouts Completed</div>
                        </div>
                        <div className="summary-card">
                            <div className="card-value">{Math.round(trainingBlockSummary.totalVolume / 1000)}K</div>
                            <div className="card-label">Total Volume (lbs)</div>
                        </div>
                        <div className="summary-card">
                            <div className="card-value">{trainingBlockSummary.totalSets}</div>
                            <div className="card-label">Sets Completed</div>
                        </div>
                        <div className="summary-card">
                            <div className="card-value">{Math.round(trainingBlockSummary.avgVolumePerWorkout)}</div>
                            <div className="card-label">Avg Volume/Workout</div>
                        </div>
                    </div>
                </div>

                {/* Power KPIs */}
                <div className="power-kpis">
                    <h3>Power KPIs</h3>
                    <div className="kpi-grid">
                        <div className="kpi-card primary">
                            <div className="kpi-title">Total Volume Load</div>
                            <div className="kpi-value">{Math.round(powerKPIs.totalVolumeLoad / 1000)}K lbs</div>
                            <div className="kpi-trend">↗ All-time total</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-title">Peak Strength</div>
                            <div className="kpi-value">{Math.round(powerKPIs.maxE1RM)} lbs</div>
                            <div className="kpi-subtitle">{powerKPIs.maxE1RMExercise}</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-title">Training Frequency</div>
                            <div className="kpi-value">{powerKPIs.workoutFrequency.toFixed(1)}/week</div>
                            <div className="kpi-subtitle">Last 30 days</div>
                        </div>
                        <div className="kpi-card">
                            <div className="kpi-title">PRs Hit</div>
                            <div className="kpi-value">{recentPRs.length}</div>
                            <div className="kpi-subtitle">This month</div>
                        </div>
                    </div>
                </div>

                {/* AI Coach Spotlight */}
                <div className="ai-coach-spotlight">
                    <h3>🤖 AI Coach Spotlight</h3>
                    <div className="insights-grid">
                        {aiInsights.map((insight, index) => (
                            <div key={index} className={`insight-card ${insight.type}`}>
                                <div className="insight-title">{insight.title}</div>
                                <div className="insight-message">{insight.message}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Action Cards */}
                <div className="quick-actions">
                    <h3>Quick Actions</h3>
                    <div className="action-cards">
                        {/* Next Workout Preview */}
                        <div className="action-card next-workout">
                            <div className="action-header">
                                <h4>📋 Next Workout Preview</h4>
                            </div>
                            <div className="action-content">
                                <div className="workout-info">
                                    <div><strong>Program:</strong> {nextWorkoutPreview.programName}</div>
                                    <div><strong>Focus:</strong> {nextWorkoutPreview.focusAreas.join(', ')}</div>
                                    <div><strong>Duration:</strong> {nextWorkoutPreview.estimatedDuration}</div>
                                </div>
                                <div className="key-exercises">
                                    <strong>Key Exercises:</strong>
                                    <ul>
                                        {nextWorkoutPreview.keyExercises.map((exercise, idx) => (
                                            <li key={idx}>{exercise}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* Plateau Alerts */}
                        <div className="action-card plateau-alerts">
                            <div className="action-header">
                                <h4>⚠️ Plateau Alerts</h4>
                            </div>
                            <div className="action-content">
                                {plateauAlerts.length > 0 ? (
                                    plateauAlerts.map((alert, index) => (
                                        <div key={index} className="alert-item">
                                            <div className="alert-exercise">{alert.exerciseName}</div>
                                            <div className="alert-suggestion">{alert.suggestion}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="no-alerts">No plateau alerts - keep up the great progress! 🎯</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Advanced Analytics Components */}
            <div className="advanced-components">
                {/* Enhanced AI Coach - Personalized coaching insights */}
                <EnhancedAICoach />

                {/* Compound Lift Tracker - Big 4 lifts progression */}
                <CompoundLiftTracker />

                {/* Hypertrophy Hub - Muscle group analysis */}
                <HypertrophyHub />

                {/* PR Tracker - Personal records and achievements */}
                {/* 07/14/2025 - Removed PR Tracker for now, need to reduce reads on database */}
                {/* <PRTracker /> */}
            </div>
        </div>
    );
};

export default ProgressCoach;