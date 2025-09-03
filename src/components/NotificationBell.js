import React, { useState, useEffect } from 'react';
import { 
  Dropdown, 
  Badge, 
  ListGroup, 
  Button, 
  Spinner,
  Alert
} from 'react-bootstrap';
import { useAuth } from '../hooks/useAuth';
import { useRealtimeInsights } from '../hooks/useRealtimeInsights';
import { 
  getUserNotifications, 
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  subscribeToNotifications
} from '../services/notificationService';
import { useNavigate } from 'react-router-dom';

/**
 * NotificationBell Component
 * 
 * Displays a notification bell with dropdown showing recent notifications.
 * Supports real-time updates and notification management.
 */
function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Get real-time insight notifications
  const { 
    unreadCount: insightUnreadCount, 
    isConnected: insightConnected 
  } = useRealtimeInsights({
    enableNotifications: true
  });

  // Total unread count includes both notifications and insights
  const totalUnreadCount = unreadCount + insightUnreadCount;

  // Load notifications and unread count
  const loadNotifications = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      setError('');
      
      const [notificationsData, countData] = await Promise.all([
        getUserNotifications({ limit: 10 }),
        getUnreadNotificationCount()
      ]);
      
      setNotifications(notificationsData);
      setUnreadCount(countData);
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadNotifications();
  }, [user]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    const subscription = subscribeToNotifications((payload) => {
      console.log('Notification update:', payload);
      
      if (payload.eventType === 'INSERT') {
        // New notification
        setNotifications(prev => [payload.new, ...prev.slice(0, 9)]);
        setUnreadCount(prev => prev + 1);
      } else if (payload.eventType === 'UPDATE') {
        // Updated notification
        setNotifications(prev => 
          prev.map(n => n.id === payload.new.id ? payload.new : n)
        );
        
        // Update unread count if read status changed
        if (payload.old.is_read !== payload.new.is_read) {
          setUnreadCount(prev => payload.new.is_read ? prev - 1 : prev + 1);
        }
      } else if (payload.eventType === 'DELETE') {
        // Deleted notification
        setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
        if (!payload.old.is_read) {
          setUnreadCount(prev => prev - 1);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  // Handle notification click
  const handleNotificationClick = async (notification) => {
    try {
      // Mark as read if unread
      if (!notification.is_read) {
        await markNotificationAsRead(notification.id);
      }
      
      // Navigate to action URL if available
      if (notification.action_url) {
        navigate(notification.action_url);
      }
      
      setIsOpen(false);
    } catch (err) {
      console.error('Failed to handle notification click:', err);
    }
  };

  // Mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => 
        prev.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
      setError('Failed to mark notifications as read');
    }
  };

  // Delete notification
  const handleDeleteNotification = async (notificationId, event) => {
    event.stopPropagation();
    
    try {
      await deleteNotification(notificationId);
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      
      // Update unread count if it was unread
      const notification = notifications.find(n => n.id === notificationId);
      if (notification && !notification.is_read) {
        setUnreadCount(prev => prev - 1);
      }
    } catch (err) {
      console.error('Failed to delete notification:', err);
      setError('Failed to delete notification');
    }
  };

  // Format notification time
  const formatNotificationTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    switch (type) {
      case 'coaching_invitation': return '🏋️';
      case 'program_assigned': return '📋';
      case 'insight_received': return '💡';
      case 'system_message': return '📢';
      default: return '🔔';
    }
  };

  if (!user) return null;

  return (
    <Dropdown 
      show={isOpen} 
      onToggle={setIsOpen}
      align="end"
    >
      <Dropdown.Toggle 
        variant="link" 
        className="nav-link position-relative p-2"
        style={{ border: 'none', background: 'none' }}
      >
        🔔
        {totalUnreadCount > 0 && (
          <Badge 
            bg="danger" 
            pill 
            className="position-absolute top-0 start-100 translate-middle"
            style={{ fontSize: '0.7rem' }}
          >
            {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
          </Badge>
        )}
        {insightConnected && (
          <span 
            className="position-absolute bottom-0 end-0 bg-success rounded-circle"
            style={{ width: '8px', height: '8px' }}
            title="Real-time notifications active"
          />
        )}
      </Dropdown.Toggle>

      <Dropdown.Menu style={{ width: '350px', maxHeight: '500px', overflowY: 'auto' }}>
        <div className="px-3 py-2 border-bottom">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h6 className="mb-0">Notifications</h6>
              {insightUnreadCount > 0 && (
                <Badge bg="warning" className="mt-1">
                  {insightUnreadCount} new insight{insightUnreadCount > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {totalUnreadCount > 0 && (
              <Button 
                variant="link" 
                size="sm" 
                onClick={handleMarkAllAsRead}
                className="p-0 text-decoration-none"
              >
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {/* Insight notifications section */}
        {insightUnreadCount > 0 && (
          <>
            <ListGroup.Item
              action
              onClick={() => {
                navigate('/my-coach?tab=insights');
                setIsOpen(false);
              }}
              className="bg-light border-0"
              style={{ cursor: 'pointer' }}
            >
              <div className="d-flex align-items-center">
                <div className="me-2 fs-5">💡</div>
                <div className="flex-grow-1">
                  <div className="fw-bold text-primary">
                    {insightUnreadCount} New Coaching Insight{insightUnreadCount > 1 ? 's' : ''}
                  </div>
                  <small className="text-muted">
                    Click to view all insights from your coach
                  </small>
                </div>
                <small className="text-primary">View →</small>
              </div>
            </ListGroup.Item>
            <div className="border-bottom mx-3"></div>
          </>
        )}

        {error && (
          <Alert variant="danger" className="m-2 mb-0">
            {error}
          </Alert>
        )}

        {isLoading ? (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" />
            <div className="mt-2 text-muted">Loading notifications...</div>
          </div>
        ) : notifications.length === 0 && insightUnreadCount === 0 ? (
          <div className="text-center py-4 text-muted">
            <div>🔔</div>
            <div className="mt-2">No notifications</div>
          </div>
        ) : (
          <ListGroup variant="flush">
            {notifications.map((notification) => (
              <ListGroup.Item
                key={notification.id}
                action
                onClick={() => handleNotificationClick(notification)}
                className={`border-0 ${!notification.is_read ? 'bg-light' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <div className="d-flex align-items-start">
                  <div className="me-2 fs-5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-grow-1 min-width-0">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="flex-grow-1">
                        <div className={`fw-${!notification.is_read ? 'bold' : 'normal'} mb-1`}>
                          {notification.title}
                        </div>
                        <div className="text-muted small mb-1" style={{ fontSize: '0.85rem' }}>
                          {notification.message.length > 100 
                            ? `${notification.message.substring(0, 100)}...`
                            : notification.message
                          }
                        </div>
                        <div className="d-flex justify-content-between align-items-center">
                          <small className="text-muted">
                            {formatNotificationTime(notification.created_at)}
                          </small>
                          {notification.action_text && (
                            <small className="text-primary">
                              {notification.action_text} →
                            </small>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="link"
                        size="sm"
                        className="p-1 text-muted"
                        onClick={(e) => handleDeleteNotification(notification.id, e)}
                        title="Delete notification"
                      >
                        ×
                      </Button>
                    </div>
                    {!notification.is_read && (
                      <div 
                        className="position-absolute top-50 end-0 translate-middle-y me-3"
                        style={{ width: '8px', height: '8px', backgroundColor: '#007bff', borderRadius: '50%' }}
                      />
                    )}
                  </div>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}

        {(notifications.length > 0 || insightUnreadCount > 0) && (
          <div className="px-3 py-2 border-top text-center">
            <Button 
              variant="link" 
              size="sm" 
              onClick={() => {
                navigate('/notifications');
                setIsOpen(false);
              }}
              className="text-decoration-none"
            >
              View all notifications
            </Button>
          </div>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}

export default NotificationBell;