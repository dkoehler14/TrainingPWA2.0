import React, { useState, useEffect } from 'react'
import { Badge, Button } from 'react-bootstrap'

/**
 * Development component for quickly toggling realtime subscriptions
 * Only shows in development mode
 */
export const RealtimeToggle = () => {
  const [isDisabled, setIsDisabled] = useState(false)

  useEffect(() => {
    // Check current state from localStorage
    const stored = localStorage.getItem('disable_realtime')
    setIsDisabled(stored === 'true')
  }, [])

  const toggleRealtime = () => {
    const newState = !isDisabled
    setIsDisabled(newState)
    localStorage.setItem('disable_realtime', newState.toString())
    
    // Show notification
    console.log(`🔄 Realtime subscriptions ${newState ? 'DISABLED' : 'ENABLED'}`)
    
    // Reload page to apply changes
    if (window.confirm('Page will reload to apply realtime changes. Continue?')) {
      window.location.reload()
    }
  }

  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  return (
    <div className="position-fixed" style={{ top: '10px', right: '10px', zIndex: 9999 }}>
      <Badge 
        bg={isDisabled ? 'danger' : 'success'} 
        className="me-2 d-flex align-items-center"
        style={{ fontSize: '0.8rem' }}
      >
        📡 Realtime: {isDisabled ? 'OFF' : 'ON'}
      </Badge>
      <Button 
        size="sm" 
        variant={isDisabled ? 'success' : 'warning'}
        onClick={toggleRealtime}
        style={{ fontSize: '0.7rem' }}
      >
        {isDisabled ? 'Enable' : 'Disable'}
      </Button>
    </div>
  )
}

export default RealtimeToggle