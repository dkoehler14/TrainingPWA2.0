import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import '../styles/EnhancedAICoach.css';

const EnhancedAICoach = () => {
    const [coachingData, setCoachingData] = useState({
        insights: [],
        recommendations: [],
        muscleBalance: null,
        message: ''
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [userId, setUserId] = useState(null);

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

        fetchCoachingInsights();
    }, [userId]);

    const fetchCoachingInsights = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const generateInsights = httpsCallable(functions, 'generateCoachingInsights');
            const result = await generateInsights();
            
            setCoachingData({
                insights: result.data.insights || [],
                recommendations: result.data.recommendations || [],
                muscleBalance: result.data.muscleBalance || null,
                message: result.data.message || ''
            });
        } catch (error) {
            console.error('Error fetching coaching insights:', error);
            setError('Failed to load coaching insights. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const getSeverityIcon = (severity) => {
        switch (severity) {
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
            case 'medium': return '🔍';
            default: return '💡';
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'high': return '#ff4757';
            case 'medium': return '#ffa502';
            case 'low': return '#2ed573';
            default: return '#747d8c';
        }
    };

    const getInsightTypeLabel = (type) => {
        const labels = {
            'plateau': 'Plateau Alert',
            'staleness': 'Exercise Staleness',
            'low_intensity': 'Intensity Analysis',
            'low_effective_reps': 'Training Quality',
            'muscle_imbalance': 'Muscle Balance'
        };
        return labels[type] || 'Insight';
    };

    const getRecommendationTypeLabel = (type) => {
        const labels = {
            'plateau_break': 'Break Plateau',
            'exercise_variation': 'Add Variation',
            'intensity_increase': 'Increase Intensity',
            'intensity_focus': 'Focus Quality',
            'balance_correction': 'Fix Imbalance'
        };
        return labels[type] || 'Recommendation';
    };

    if (loading) {
        return (
            <div className="enhanced-ai-coach loading">
                <div className="loading-spinner"></div>
                <p>Analyzing your training data...</p>
            </div>
        );
    }

    if (!userId) {
        return (
            <div className="enhanced-ai-coach auth-required">
                <h3>🤖 Enhanced AI Coach</h3>
                <p>Please log in to receive personalized coaching insights.</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="enhanced-ai-coach error">
                <h3>🤖 Enhanced AI Coach</h3>
                <div className="error-message">
                    <p>{error}</p>
                    <button onClick={fetchCoachingInsights} className="retry-button">
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    const { insights, recommendations, muscleBalance, message } = coachingData;

    return (
        <div className="enhanced-ai-coach">
            <div className="coach-header">
                <h3>🤖 Enhanced AI Coach</h3>
                <p className="coach-message">{message}</p>
                <button onClick={fetchCoachingInsights} className="refresh-button">
                    🔄 Refresh Analysis
                </button>
            </div>

            {/* Insights Section */}
            <div className="insights-section">
                <h4>📊 Training Insights</h4>
                {insights.length > 0 ? (
                    <div className="insights-grid">
                        {insights.map((insight, index) => (
                            <div key={index} className={`insight-card ${insight.severity}`}>
                                <div className="insight-header">
                                    <span className="insight-icon">{getSeverityIcon(insight.severity)}</span>
                                    <span className="insight-type">{getInsightTypeLabel(insight.type)}</span>
                                </div>
                                <div className="insight-content">
                                    {insight.exercise && (
                                        <div className="insight-exercise">{insight.exercise}</div>
                                    )}
                                    <div className="insight-message">{insight.message}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="no-insights">
                        <p>✅ No issues detected - your training looks great!</p>
                    </div>
                )}
            </div>

            {/* Recommendations Section */}
            <div className="recommendations-section">
                <h4>🎯 Personalized Recommendations</h4>
                {recommendations.length > 0 ? (
                    <div className="recommendations-list">
                        {recommendations.map((rec, index) => (
                            <div key={index} className="recommendation-card">
                                <div className="recommendation-header">
                                    <div className="recommendation-type">
                                        {getRecommendationTypeLabel(rec.type)}
                                    </div>
                                    <div 
                                        className="recommendation-priority"
                                        style={{ backgroundColor: getPriorityColor(rec.priority) }}
                                    >
                                        {rec.priority?.toUpperCase()}
                                    </div>
                                </div>
                                <div className="recommendation-content">
                                    {rec.exercise && (
                                        <div className="recommendation-exercise">
                                            <strong>Exercise:</strong> {rec.exercise}
                                        </div>
                                    )}
                                    <div className="recommendation-suggestion">
                                        {rec.suggestion}
                                    </div>
                                    {rec.details && (
                                        <div className="recommendation-details">
                                            {Object.entries(rec.details).map(([key, value]) => (
                                                <div key={key} className="detail-item">
                                                    <span className="detail-key">{key}:</span>
                                                    <span className="detail-value">{value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="no-recommendations">
                        <p>🎉 No specific recommendations right now - keep up the excellent work!</p>
                    </div>
                )}
            </div>

            {/* Muscle Balance Section */}
            {muscleBalance && muscleBalance.ratios && Object.keys(muscleBalance.ratios).length > 0 && (
                <div className="muscle-balance-section">
                    <h4>⚖️ Muscle Balance Analysis</h4>
                    <div className="balance-ratios">
                        {muscleBalance.ratios.pushPullRatio && (
                            <div className="balance-ratio">
                                <div className="ratio-label">Push/Pull Ratio</div>
                                <div className="ratio-value">
                                    {muscleBalance.ratios.pushPullRatio.toFixed(2)}:1
                                </div>
                                <div className="ratio-status">
                                    {muscleBalance.ratios.pushPullRatio >= 0.8 && muscleBalance.ratios.pushPullRatio <= 1.2 
                                        ? '✅ Balanced' 
                                        : '⚠️ Imbalanced'}
                                </div>
                            </div>
                        )}
                        {muscleBalance.ratios.quadHamstringRatio && (
                            <div className="balance-ratio">
                                <div className="ratio-label">Quad/Hamstring Ratio</div>
                                <div className="ratio-value">
                                    {muscleBalance.ratios.quadHamstringRatio.toFixed(2)}:1
                                </div>
                                <div className="ratio-status">
                                    {muscleBalance.ratios.quadHamstringRatio >= 1.0 && muscleBalance.ratios.quadHamstringRatio <= 1.3 
                                        ? '✅ Balanced' 
                                        : '⚠️ Imbalanced'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="coach-footer">
                <p className="disclaimer">
                    💡 AI recommendations are based on your training data. Always consult with a qualified trainer for personalized advice.
                </p>
            </div>
        </div>
    );
};

export default EnhancedAICoach;