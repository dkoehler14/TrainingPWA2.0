import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { getSubcollectionCached, warmUserCache } from '../api/enhancedFirestoreCache';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import '../styles/HypertrophyHub.css';

const HypertrophyHub = () => {
    const [hypertrophyData, setHypertrophyData] = useState({
        muscleGroupVolume: [],
        effectiveRepsData: [],
        exerciseVariations: [],
        bodyHeatMap: {},
        qualityMetrics: {}
    });
    const [loading, setLoading] = useState(true);
    const [selectedTimeRange, setSelectedTimeRange] = useState('4weeks');
    const [userId, setUserId] = useState(null);

    // Muscle group mapping for body heat map
    const MUSCLE_GROUPS = {
        'Chest': { color: '#e74c3c', position: 'chest' },
        'Back': { color: '#3498db', position: 'back' },
        'Shoulders': { color: '#f39c12', position: 'shoulders' },
        //'Arms': { color: '#9b59b6', position: 'arms' },
        'Biceps': { color: '#9b59b6', position: 'arms' },
        'Triceps': { color: '#9b59b6', position: 'arms' },
        //'Legs': { color: '#27ae60', position: 'legs' },
        'Quads': { color: '#27ae60', position: 'legs' },
        'Hamstrings': { color: '#2ecc71', position: 'legs' },
        'Glutes': { color: '#16a085', position: 'glutes' },
        'Calves': { color: '#1abc9c', position: 'calves' },
        //'Core': { color: '#e67e22', position: 'core' },
        'Abs': { color: '#e67e22', position: 'core' }
    };

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

        // Warm cache before fetching data for better performance
        warmUserCache(userId, 'normal').then(() => {
            fetchHypertrophyData();
        }).catch(() => {
            // If cache warming fails, still fetch data
            fetchHypertrophyData();
        });
    }, [userId, selectedTimeRange]);

    const fetchHypertrophyData = async () => {
        setLoading(true);
        
        try {
            // Fetch exercise analytics
            const exerciseAnalytics = await getSubcollectionCached(
                `userAnalytics/${userId}`, 
                'exerciseAnalytics', 
                {}, 
                15 * 60 * 1000
            );

            // Fetch monthly analytics for muscle group data
            const currentMonth = new Date().toISOString().slice(0, 7);
            let monthlyData = null;
            try {
                const monthlyAnalytics = await getSubcollectionCached(
                    `userAnalytics/${userId}`, 
                    'monthlyAnalytics', 
                    {}, 
                    15 * 60 * 1000
                );
                monthlyData = monthlyAnalytics.find(month => month.id === currentMonth);
            } catch (error) {
                console.log('No monthly analytics found');
            }

            // Process hypertrophy data
            const processedData = processHypertrophyData(exerciseAnalytics, monthlyData);
            setHypertrophyData(processedData);

        } catch (error) {
            console.error('Error fetching hypertrophy data:', error);
            setHypertrophyData({
                muscleGroupVolume: [],
                effectiveRepsData: [],
                exerciseVariations: [],
                bodyHeatMap: {},
                qualityMetrics: {}
            });
        } finally {
            setLoading(false);
        }
    };

    const processHypertrophyData = (exerciseAnalytics, monthlyData) => {
        // Process muscle group volume
        const muscleGroupVolume = [];
        const muscleGroupEffectiveReps = [];
        const bodyHeatMap = {};
        
        // Group exercises by muscle group
        const muscleGroups = {};
        exerciseAnalytics.forEach(exercise => {
            const muscleGroup = exercise.muscleGroup || 'Unknown';
            if (!muscleGroups[muscleGroup]) {
                muscleGroups[muscleGroup] = {
                    totalVolume: 0,
                    totalEffectiveReps: 0,
                    exercises: [],
                    avgIntensity: 0
                };
            }
            
            muscleGroups[muscleGroup].totalVolume += exercise.totalVolume || 0;
            muscleGroups[muscleGroup].totalEffectiveReps += exercise.totalEffectiveReps || 0;
            muscleGroups[muscleGroup].exercises.push(exercise);
            muscleGroups[muscleGroup].avgIntensity += exercise.averageIntensityPercent || 0;
        });

        // Process muscle group data
        Object.entries(muscleGroups).forEach(([muscleGroup, data]) => {
            const avgIntensity = data.exercises.length > 0 ? 
                data.avgIntensity / data.exercises.length : 0;

            muscleGroupVolume.push({
                muscleGroup,
                volume: Math.round(data.totalVolume),
                exercises: data.exercises.length,
                avgIntensity: Math.round(avgIntensity)
            });

            muscleGroupEffectiveReps.push({
                muscleGroup,
                effectiveReps: data.totalEffectiveReps,
                totalReps: data.exercises.reduce((sum, ex) => sum + (ex.totalReps || 0), 0),
                quality: data.totalEffectiveReps > 0 ? 
                    (data.totalEffectiveReps / data.exercises.reduce((sum, ex) => sum + (ex.totalReps || 0), 0)) * 100 : 0
            });

            // Body heat map data
            if (MUSCLE_GROUPS[muscleGroup]) {
                bodyHeatMap[muscleGroup] = {
                    intensity: Math.min(100, (data.totalVolume / 10000) * 100), // Scale volume to 0-100
                    color: MUSCLE_GROUPS[muscleGroup].color,
                    position: MUSCLE_GROUPS[muscleGroup].position
                };
            }
        });

        // Sort by volume
        muscleGroupVolume.sort((a, b) => b.volume - a.volume);
        muscleGroupEffectiveReps.sort((a, b) => b.effectiveReps - a.effectiveReps);

        // Process exercise variations and staleness
        const exerciseVariations = exerciseAnalytics.map(exercise => ({
            exerciseName: exercise.exerciseName,
            muscleGroup: exercise.muscleGroup,
            stalenessScore: exercise.stalenessScore || 0,
            totalVolume: exercise.totalVolume || 0,
            effectiveReps: exercise.totalEffectiveReps || 0,
            lastUpdated: exercise.lastUpdated
        })).sort((a, b) => b.stalenessScore - a.stalenessScore);

        // Calculate quality metrics
        const totalVolume = exerciseAnalytics.reduce((sum, ex) => sum + (ex.totalVolume || 0), 0);
        const totalEffectiveReps = exerciseAnalytics.reduce((sum, ex) => sum + (ex.totalEffectiveReps || 0), 0);
        const totalReps = exerciseAnalytics.reduce((sum, ex) => sum + (ex.totalReps || 0), 0);
        
        const qualityMetrics = {
            totalVolume: Math.round(totalVolume),
            totalEffectiveReps,
            totalReps,
            qualityRatio: totalReps > 0 ? (totalEffectiveReps / totalReps) * 100 : 0,
            avgIntensity: exerciseAnalytics.length > 0 ? 
                exerciseAnalytics.reduce((sum, ex) => sum + (ex.averageIntensityPercent || 0), 0) / exerciseAnalytics.length : 0,
            muscleGroupBalance: calculateMuscleGroupBalance(muscleGroups)
        };

        return {
            muscleGroupVolume,
            effectiveRepsData: muscleGroupEffectiveReps,
            exerciseVariations,
            bodyHeatMap,
            qualityMetrics
        };
    };

    const calculateMuscleGroupBalance = (muscleGroups) => {
        const volumes = Object.values(muscleGroups).map(group => group.totalVolume);
        if (volumes.length === 0) return 0;
        
        const max = Math.max(...volumes);
        const min = Math.min(...volumes);
        
        // Balance score: higher is more balanced (0-100)
        return max > 0 ? Math.round((min / max) * 100) : 0;
    };

    const getStalenessColor = (score) => {
        if (score >= 80) return '#e74c3c'; // High staleness - red
        if (score >= 60) return '#f39c12'; // Medium staleness - orange
        if (score >= 40) return '#f1c40f'; // Low-medium staleness - yellow
        return '#27ae60'; // Fresh - green
    };

    const getStalenessLabel = (score) => {
        if (score >= 80) return 'Very Stale';
        if (score >= 60) return 'Stale';
        if (score >= 40) return 'Getting Stale';
        return 'Fresh';
    };

    const getQualityColor = (quality) => {
        if (quality >= 80) return '#27ae60'; // Excellent
        if (quality >= 60) return '#f39c12'; // Good
        if (quality >= 40) return '#e67e22'; // Fair
        return '#e74c3c'; // Poor
    };

    if (loading) {
        return (
            <div className="hypertrophy-hub loading">
                <div className="loading-spinner"></div>
                <p>Analyzing muscle growth data...</p>
            </div>
        );
    }

    if (!userId) {
        return (
            <div className="hypertrophy-hub auth-required">
                <h3>💪 Hypertrophy Hub</h3>
                <p>Please log in to access your muscle growth analysis.</p>
            </div>
        );
    }

    if (hypertrophyData.muscleGroupVolume.length === 0) {
        return (
            <div className="hypertrophy-hub empty">
                <h3>💪 Hypertrophy Hub</h3>
                <p>No training data found. Complete some workouts to unlock your muscle growth insights!</p>
            </div>
        );
    }

    const { muscleGroupVolume, effectiveRepsData, exerciseVariations, bodyHeatMap, qualityMetrics } = hypertrophyData;

    return (
        <div className="hypertrophy-hub">
            <div className="hub-header">
                <h3>💪 Hypertrophy Hub</h3>
                <p className="hub-subtitle">Optimize your muscle growth with volume distribution and quality analysis</p>
            </div>

            {/* Time Range Control */}
            <div className="time-range-control">
                <label htmlFor="time-range">Analysis Period:</label>
                <select 
                    id="time-range"
                    value={selectedTimeRange} 
                    onChange={(e) => setSelectedTimeRange(e.target.value)}
                >
                    <option value="2weeks">Last 2 Weeks</option>
                    <option value="4weeks">Last 4 Weeks</option>
                    <option value="8weeks">Last 8 Weeks</option>
                    <option value="12weeks">Last 12 Weeks</option>
                </select>
            </div>

            {/* Quality Metrics Overview */}
            <div className="quality-metrics-overview">
                <h4>📊 Training Quality Overview</h4>
                <div className="metrics-grid">
                    <div className="metric-card">
                        <div className="metric-value">{Math.round(qualityMetrics.qualityRatio)}%</div>
                        <div className="metric-label">Quality Ratio</div>
                        <div className="metric-sublabel">Effective vs Total Reps</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-value">{Math.round(qualityMetrics.avgIntensity)}%</div>
                        <div className="metric-label">Avg Intensity</div>
                        <div className="metric-sublabel">% of e1RM</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-value">{qualityMetrics.muscleGroupBalance}</div>
                        <div className="metric-label">Balance Score</div>
                        <div className="metric-sublabel">Muscle Group Balance</div>
                    </div>
                    <div className="metric-card">
                        <div className="metric-value">{Math.round(qualityMetrics.totalVolume / 1000)}K</div>
                        <div className="metric-label">Total Volume</div>
                        <div className="metric-sublabel">lbs lifted</div>
                    </div>
                </div>
            </div>

            {/* Body Heat Map */}
            <div className="body-heatmap-section">
                <h4>🔥 Muscle Group Heat Map</h4>
                <div className="heatmap-container">
                    <div className="body-diagram">
                        {Object.entries(bodyHeatMap).map(([muscleGroup, data]) => (
                            <div 
                                key={muscleGroup}
                                className={`muscle-zone ${data.position}`}
                                style={{ 
                                    backgroundColor: data.color,
                                    opacity: Math.max(0.3, data.intensity / 100)
                                }}
                                title={`${muscleGroup}: ${Math.round(data.intensity)}% intensity`}
                            >
                                {muscleGroup}
                            </div>
                        ))}
                    </div>
                    <div className="heatmap-legend">
                        <div className="legend-title">Volume Intensity</div>
                        <div className="legend-scale">
                            <div className="scale-item">
                                <div className="scale-color low"></div>
                                <span>Low</span>
                            </div>
                            <div className="scale-item">
                                <div className="scale-color medium"></div>
                                <span>Medium</span>
                            </div>
                            <div className="scale-item">
                                <div className="scale-color high"></div>
                                <span>High</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="charts-section">
                {/* Muscle Group Volume Chart */}
                <div className="chart-container">
                    <h4>📈 Volume Distribution by Muscle Group</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={muscleGroupVolume}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="muscleGroup" />
                            <YAxis />
                            <Tooltip 
                                formatter={(value, name) => [
                                    name === 'volume' ? `${value} lbs` : value,
                                    name === 'volume' ? 'Volume' : 
                                    name === 'exercises' ? 'Exercises' : 'Avg Intensity'
                                ]}
                            />
                            <Legend />
                            <Bar dataKey="volume" fill="#3498db" name="Volume (lbs)" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Effective Reps Quality Chart */}
                <div className="chart-container">
                    <h4>⚡ Training Quality by Muscle Group</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={effectiveRepsData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="muscleGroup" />
                            <YAxis />
                            <Tooltip 
                                formatter={(value, name) => [
                                    name === 'quality' ? `${Math.round(value)}%` : value,
                                    name === 'quality' ? 'Quality %' : 
                                    name === 'effectiveReps' ? 'Effective Reps' : 'Total Reps'
                                ]}
                            />
                            <Legend />
                            <Bar dataKey="quality" fill="#e74c3c" name="Quality %" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Exercise Staleness Analysis */}
            <div className="staleness-section">
                <h4>🔄 Exercise Variation Analysis</h4>
                <div className="staleness-grid">
                    {exerciseVariations.slice(0, 8).map((exercise, index) => (
                        <div key={index} className="staleness-card">
                            <div className="exercise-header">
                                <div className="exercise-name">{exercise.exerciseName}</div>
                                <div 
                                    className="staleness-badge"
                                    style={{ backgroundColor: getStalenessColor(exercise.stalenessScore) }}
                                >
                                    {getStalenessLabel(exercise.stalenessScore)}
                                </div>
                            </div>
                            <div className="exercise-stats">
                                <div className="stat">
                                    <span className="stat-label">Staleness:</span>
                                    <span className="stat-value">{exercise.stalenessScore}/100</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Volume:</span>
                                    <span className="stat-value">{Math.round(exercise.totalVolume / 1000)}K lbs</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-label">Effective Reps:</span>
                                    <span className="stat-value">{exercise.effectiveReps}</span>
                                </div>
                            </div>
                            <div className="staleness-bar">
                                <div 
                                    className="staleness-fill"
                                    style={{ 
                                        width: `${exercise.stalenessScore}%`,
                                        backgroundColor: getStalenessColor(exercise.stalenessScore)
                                    }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Recommendations */}
            <div className="recommendations-section">
                <h4>💡 Hypertrophy Recommendations</h4>
                <div className="recommendations-list">
                    {qualityMetrics.qualityRatio < 30 && (
                        <div className="recommendation-item warning">
                            <span className="rec-icon">⚠️</span>
                            <div className="rec-content">
                                <div className="rec-title">Low Training Quality</div>
                                <div className="rec-description">
                                    Only {Math.round(qualityMetrics.qualityRatio)}% of your reps are at challenging intensity. 
                                    Consider training closer to failure or increasing weight.
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {qualityMetrics.muscleGroupBalance < 50 && (
                        <div className="recommendation-item warning">
                            <span className="rec-icon">⚖️</span>
                            <div className="rec-content">
                                <div className="rec-title">Muscle Group Imbalance</div>
                                <div className="rec-description">
                                    Your training shows significant imbalance between muscle groups. 
                                    Consider increasing volume for underdeveloped areas.
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {exerciseVariations.filter(ex => ex.stalenessScore > 70).length > 0 && (
                        <div className="recommendation-item info">
                            <span className="rec-icon">🔄</span>
                            <div className="rec-content">
                                <div className="rec-title">Exercise Variation Needed</div>
                                <div className="rec-description">
                                    {exerciseVariations.filter(ex => ex.stalenessScore > 70).length} exercises 
                                    are getting stale. Consider switching to variations to maintain progress.
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {qualityMetrics.qualityRatio >= 50 && qualityMetrics.muscleGroupBalance >= 70 && (
                        <div className="recommendation-item success">
                            <span className="rec-icon">✅</span>
                            <div className="rec-content">
                                <div className="rec-title">Excellent Training Quality</div>
                                <div className="rec-description">
                                    Your training shows great quality and balance. Keep up the consistent work!
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default HypertrophyHub;