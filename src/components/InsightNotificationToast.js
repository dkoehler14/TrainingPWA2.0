/**
 * Insight Notification Toast Component
 * 
 * Displays real-time toast notifications for new coaching insights
 * Provides quick actions to view or dismiss insights
 * 
 * Requirements: 7.2, 6.1
 */

import React, { useState, useEffect } from 'react'
import { Toast, ToastContainer, Button, Badge } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { useRealtimeInsights } from '../hooks/useRealtimeInsights'
import '../styles/InsightNotifications.css'

function InsightNotificationToast() {
  const navigate = useNavigate()
  const [toasts, setToasts] = useState([])
  const [showToasts, setShowToasts] = useState(true)

  const { insights, isConnected } = useRealtimeInsights({
    enableNotifications: true,
    onNewInsight: (insight) => {
      // Create toast for new insight
      const toast = {
        id: `insight-${insight.id}-${Date.now()}`,
        insightId: insight.id,
        type: insight.type,
        title: insight.title,
        priority: insight.priority,
        coachName: insight.coach?.name || 'Your Coach',
        timestamp: new Date(),
        show: true
      }
      
      setToasts(current => [toast, ...current.slice(0, 4)]) // Keep max 5 toasts
      
      // Auto-hide low priority toasts after 8 seconds
      if (insight.priority === 'low') {
        setTimeout(() => {
          setToasts(current => 
            current.map(t => 
              t.id === toast.id ? { ...t, show: false } : t
            )
          )
        }, 8000)
      }
    }
  })

  // Clean up old toasts
  useEffect(() => {
    const cleanup = setInterval(() => {
      setToasts(current => 
        current.filter(toast => {
          const age = Date.now() - toast.timestamp.getTime()
          return age < 30000 // Remove toasts older than 30 seconds
        })
      )
    }, 5000)

    return () => clearInterval(cleanup)
  }, [])

  // Handle toast actions
  const handleViewInsight = (insightId) => {
    navigate('/my-coach?tab=insights')
    // Remove the toast
    setToasts(current => 
      current.map(toast => 
        toast.insightId === insightId ? { ...toast, show: false } : toast
      )
    )
  }

  const handleDismissToast = (toastId) => {
    setToasts(current => 
      current.map(toast => 
        toast.id === toastId ? { ...toast, show: false } : toast
      )
    )
  }

  const handleDismissAll = () => {
    setToasts(current => 
      current.map(toast => ({ ...toast, show: false }))
    )
  }

  // Get toast variant based on priority
  const getToastVariant = (priority) => {
    switch (priority) {
      case 'high': return 'danger'
      case 'medium': return 'warning'
      case 'low': return 'info'
      default: return 'primary'
    }
  }

  // Get insight type icon
  const getInsightIcon = (type) => {
    switch (type) {
      case 'recommendation': return '💡'
      case 'observation': return '👁️'
      case 'goal_update': return '🎯'
      case 'program_adjustment': return '📋'
      default: return '💬'
    }
  }

  // Get insight type label
  const getInsightTypeLabel = (type) => {
    return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  if (!showToasts || !isConnected) {
    return null
  }

  return (
    <ToastContainer 
      position="top-end" 
      className="p-3"
      style={{ zIndex: 9999 }}
    >
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          show={toast.show}
          onClose={() => handleDismissToast(toast.id)}
          className={`insight-notification-toast border-${getToastVariant(toast.priority)}`}
          style={{ minWidth: '350px' }}
        >
          <Toast.Header className="d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center">
              <span className="me-2 fs-5">{getInsightIcon(toast.type)}</span>
              <strong className="me-auto">New Coaching Insight</strong>
              <Badge 
                bg={getToastVariant(toast.priority)} 
                className="ms-2"
              >
                {toast.priority.toUpperCase()}
              </Badge>
            </div>
          </Toast.Header>
          <Toast.Body>
            <div className="mb-2">
              <div className="d-flex justify-content-between align-items-start mb-1">
                <Badge bg="secondary" className="mb-1">
                  {getInsightTypeLabel(toast.type)}
                </Badge>
                <small className="text-muted">
                  from {toast.coachName}
                </small>
              </div>
              <h6 className="mb-2 fw-semibold">{toast.title}</h6>
            </div>
            
            <div className="d-flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleViewInsight(toast.insightId)}
                className="flex-grow-1"
              >
                View Insight
              </Button>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => handleDismissToast(toast.id)}
              >
                Dismiss
              </Button>
            </div>
          </Toast.Body>
        </Toast>
      ))}
      
      {/* Dismiss All Button (when multiple toasts) */}
      {toasts.filter(t => t.show).length > 1 && (
        <Toast show={true} className="mt-2 bg-light">
          <Toast.Body className="text-center py-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handleDismissAll}
            >
              Dismiss All Notifications
            </Button>
          </Toast.Body>
        </Toast>
      )}
    </ToastContainer>
  )
}

export default InsightNotificationToast