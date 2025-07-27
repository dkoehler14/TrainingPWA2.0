/**
 * Workout Real-time Indicator Component
 * 
 * Displays real-time connection status and live progress updates
 * during workout logging sessions.
 */

import React, { useState, useEffect } from 'react'
import { Badge, Spinner, Alert, Tooltip, OverlayTrigger } from 'react-bootstrap'
import { 
  WifiOff, 
  Wifi, 
  Activity, 
  People, 
  Clock,
  ExclamationTriangle
} from 'react-bootstrap-icons'

const WorkoutRealtimeIndicator = ({ 
  realtimeHook, 
  showProgress = true, 
  showPresence = true,
  className = '' 
}) => {
  const [lastUpdateTime, setLastUpdateTime] = useState(null)
  const [progressAnimation, setProgressAnimation] = useState(false)

  const {
    isConnected,
    connectionError,
    lastUpdate,
    getPresence,
    reconnect,
    channelName,
    reconnectAttempts
  } = realtimeHook || {}

  // Update last update time when new updates arrive
  useEffect(() => {
    if (lastUpdate) {
      setLastUpdateTime(new Date())
      
      // Trigger progress animation
      setProgressAnimation(true)
      const timer = setTimeout(() => setProgressAnimation(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [lastUpdate])

  // Get presence information
  const presence = getPresence ? getPresence() : {}
  const activeUsers = Object.keys(presence).length

  if (!realtimeHook) {
    return null
  }

  const getConnectionStatus = () => {
    if (connectionError) {
      const errorType = connectionError.type || 'UNKNOWN'
      const errorMessages = {
        'NETWORK_ERROR': 'Network connection lost',
        'AUTH_ERROR': 'Authentication failed',
        'SERVER_ERROR': 'Server unavailable',
        'RATE_LIMIT_ERROR': 'Rate limit exceeded',
        'SUBSCRIPTION_ERROR': 'Subscription failed',
        'TIMEOUT_ERROR': 'Connection timeout',
        'UNKNOWN': 'Connection error'
      }
      
      return {
        variant: 'danger',
        icon: <ExclamationTriangle size={12} />,
        text: errorMessages[errorType] || 'Connection Error',
        tooltip: `${errorMessages[errorType]}: ${connectionError.message}${reconnectAttempts > 0 ? ` (Attempt ${reconnectAttempts}/5)` : ''}`
      }
    }
    
    if (!isConnected) {
      return {
        variant: 'warning',
        icon: <WifiOff size={12} />,
        text: reconnectAttempts > 0 ? 'Reconnecting...' : 'Disconnected',
        tooltip: reconnectAttempts > 0 
          ? `Reconnection attempt ${reconnectAttempts}/5`
          : 'Real-time updates are not available'
      }
    }
    
    return {
      variant: 'success',
      icon: <Wifi size={12} />,
      text: 'Connected',
      tooltip: `Real-time updates active on channel: ${channelName || 'unknown'}`
    }
  }

  const status = getConnectionStatus()

  const formatLastUpdateTime = () => {
    if (!lastUpdateTime) return 'No updates'
    
    const now = new Date()
    const diff = Math.floor((now - lastUpdateTime) / 1000)
    
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return `${Math.floor(diff / 3600)}h ago`
  }

  const getUpdateTypeDisplay = () => {
    if (!lastUpdate) return null
    
    switch (lastUpdate.type) {
      case 'INSERT':
        return { icon: <Activity size={12} />, text: 'New data', color: 'success' }
      case 'UPDATE':
        return { icon: <Activity size={12} />, text: 'Updated', color: 'info' }
      case 'DELETE':
        return { icon: <Activity size={12} />, text: 'Deleted', color: 'warning' }
      case 'BROADCAST':
        return { icon: <Activity size={12} />, text: 'Live update', color: 'primary' }
      default:
        return { icon: <Activity size={12} />, text: 'Activity', color: 'secondary' }
    }
  }

  const updateDisplay = getUpdateTypeDisplay()

  return (
    <div className={`d-flex align-items-center gap-2 ${className}`}>
      {/* Connection Status */}
      <OverlayTrigger
        placement="top"
        overlay={<Tooltip>{status.tooltip}</Tooltip>}
      >
        <Badge 
          bg={status.variant} 
          className="d-flex align-items-center gap-1"
          style={{ cursor: connectionError ? 'pointer' : 'default' }}
          onClick={connectionError ? reconnect : undefined}
        >
          {!isConnected && reconnectAttempts > 0 ? (
            <Spinner size="sm" animation="border" style={{ width: '12px', height: '12px' }} />
          ) : (
            status.icon
          )}
          <span style={{ fontSize: '0.75rem' }}>{status.text}</span>
        </Badge>
      </OverlayTrigger>

      {/* Progress Updates */}
      {showProgress && lastUpdate && (
        <OverlayTrigger
          placement="top"
          overlay={<Tooltip>Last update: {formatLastUpdateTime()}</Tooltip>}
        >
          <Badge 
            bg={updateDisplay.color}
            className={`d-flex align-items-center gap-1 ${progressAnimation ? 'animate-pulse' : ''}`}
          >
            {updateDisplay.icon}
            <span style={{ fontSize: '0.75rem' }}>{updateDisplay.text}</span>
          </Badge>
        </OverlayTrigger>
      )}

      {/* Active Users Presence */}
      {showPresence && activeUsers > 1 && (
        <OverlayTrigger
          placement="top"
          overlay={<Tooltip>{activeUsers} users active on this workout</Tooltip>}
        >
          <Badge bg="info" className="d-flex align-items-center gap-1">
            <People size={12} />
            <span style={{ fontSize: '0.75rem' }}>{activeUsers}</span>
          </Badge>
        </OverlayTrigger>
      )}

      {/* Connection Error Alert */}
      {connectionError && (
        <Alert 
          variant="danger" 
          className="py-1 px-2 mb-0 small"
          dismissible
          onClose={() => window.location.reload()}
        >
          <div className="d-flex align-items-center gap-2">
            <ExclamationTriangle size={14} />
            <span>Real-time connection lost</span>
            <button 
              className="btn btn-sm btn-outline-danger"
              onClick={reconnect}
            >
              Retry
            </button>
          </div>
        </Alert>
      )}
    </div>
  )
}

/**
 * Compact version for mobile or space-constrained layouts
 */
export const CompactWorkoutRealtimeIndicator = ({ realtimeHook }) => {
  const { isConnected, connectionError, reconnect } = realtimeHook || {}

  if (!realtimeHook) return null

  const getStatusColor = () => {
    if (connectionError) return 'danger'
    if (!isConnected) return 'warning'
    return 'success'
  }

  const getStatusIcon = () => {
    if (connectionError) return <ExclamationTriangle size={14} />
    if (!isConnected) return <WifiOff size={14} />
    return <Wifi size={14} />
  }

  return (
    <OverlayTrigger
      placement="top"
      overlay={
        <Tooltip>
          {connectionError 
            ? `Connection error: ${connectionError.message}` 
            : isConnected 
              ? 'Real-time updates active'
              : 'Real-time updates disconnected'
          }
        </Tooltip>
      }
    >
      <div 
        className={`text-${getStatusColor()} cursor-pointer`}
        onClick={connectionError ? reconnect : undefined}
        style={{ cursor: connectionError ? 'pointer' : 'default' }}
      >
        {getStatusIcon()}
      </div>
    </OverlayTrigger>
  )
}

// CSS for animations (add to your CSS file)
const styles = `
.animate-pulse {
  animation: pulse 1s ease-in-out;
}

@keyframes pulse {
  0% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.05); }
  100% { opacity: 1; transform: scale(1); }
}
`

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('workout-realtime-styles')) {
  const styleSheet = document.createElement('style')
  styleSheet.id = 'workout-realtime-styles'
  styleSheet.textContent = styles
  document.head.appendChild(styleSheet)
}

export default WorkoutRealtimeIndicator