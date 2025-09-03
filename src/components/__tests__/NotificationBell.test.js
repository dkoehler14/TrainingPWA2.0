import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NotificationBell from '../NotificationBell';
import { useAuth } from '../../hooks/useAuth';
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  subscribeToNotifications
} from '../../services/notificationService';

// Mock dependencies
jest.mock('../../hooks/useAuth');
jest.mock('../../services/notificationService');
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => children,
  useNavigate: () => mockNavigate
}));

const mockUseAuth = useAuth;
const mockGetUserNotifications = getUserNotifications;
const mockGetUnreadNotificationCount = getUnreadNotificationCount;
const mockMarkNotificationAsRead = markNotificationAsRead;
const mockMarkAllNotificationsAsRead = markAllNotificationsAsRead;
const mockDeleteNotification = deleteNotification;
const mockSubscribeToNotifications = subscribeToNotifications;

// Wrapper component for router
const RouterWrapper = ({ children }) => <div>{children}</div>;

describe('NotificationBell', () => {
  const mockUser = {
    id: 'user-123',
    email: 'user@example.com'
  };

  const mockNotifications = [
    {
      id: 'notification-1',
      type: 'coaching_invitation',
      title: '🏋️ Coaching Invitation from John Coach',
      message: 'John Coach has invited you to be their client',
      is_read: false,
      created_at: '2024-01-01T12:00:00Z',
      action_url: '/invitation/abc123',
      action_text: 'View Invitation'
    },
    {
      id: 'notification-2',
      type: 'program_assigned',
      title: 'New Program Assigned',
      message: 'Your coach assigned you a new program',
      is_read: true,
      created_at: '2024-01-01T11:00:00Z',
      action_url: '/programs/123',
      action_text: 'View Program'
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: mockUser });
    mockGetUserNotifications.mockResolvedValue(mockNotifications);
    mockGetUnreadNotificationCount.mockResolvedValue(1);
    mockSubscribeToNotifications.mockReturnValue({
      unsubscribe: jest.fn()
    });
  });

  it('should render notification bell with unread count', async () => {
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('🔔')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument(); // Unread count badge
    });
  });

  it('should not render when user is not authenticated', () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { container } = render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    expect(container.firstChild).toBeNull();
  });

  it('should load notifications on mount', async () => {
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    await waitFor(() => {
      expect(mockGetUserNotifications).toHaveBeenCalledWith({ limit: 10 });
      expect(mockGetUnreadNotificationCount).toHaveBeenCalled();
    });
  });

  it('should show notifications dropdown when clicked', async () => {
    const user = userEvent.setup();
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      expect(screen.getByText('🏋️ Coaching Invitation from John Coach')).toBeInTheDocument();
      expect(screen.getByText('New Program Assigned')).toBeInTheDocument();
    });
  });

  it('should show "Mark all read" button when there are unread notifications', async () => {
    const user = userEvent.setup();
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeInTheDocument();
    });
  });

  it('should mark all notifications as read when button clicked', async () => {
    const user = userEvent.setup();
    mockMarkAllNotificationsAsRead.mockResolvedValue();

    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    const markAllButton = screen.getByText('Mark all read');
    await user.click(markAllButton);

    await waitFor(() => {
      expect(mockMarkAllNotificationsAsRead).toHaveBeenCalled();
    });
  });

  it('should mark notification as read when clicked', async () => {
    const user = userEvent.setup();
    mockMarkNotificationAsRead.mockResolvedValue();

    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(() => {
      const notification = screen.getByText('🏋️ Coaching Invitation from John Coach');
      user.click(notification);
    });

    await waitFor(() => {
      expect(mockMarkNotificationAsRead).toHaveBeenCalledWith('notification-1');
    });
  });

  it('should delete notification when delete button clicked', async () => {
    const user = userEvent.setup();
    mockDeleteNotification.mockResolvedValue();

    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(async () => {
      const deleteButtons = screen.getAllByText('×');
      await user.click(deleteButtons[0]);
    });

    await waitFor(() => {
      expect(mockDeleteNotification).toHaveBeenCalledWith('notification-1');
    });
  });

  it('should show empty state when no notifications', async () => {
    mockGetUserNotifications.mockResolvedValue([]);
    mockGetUnreadNotificationCount.mockResolvedValue(0);

    const user = userEvent.setup();
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('should show loading state while fetching notifications', async () => {
    // Mock a slow response
    mockGetUserNotifications.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

    const user = userEvent.setup();
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    expect(screen.getByText('Loading notifications...')).toBeInTheDocument();
  });

  it('should format notification time correctly', async () => {
    const recentNotification = {
      ...mockNotifications[0],
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString() // 5 minutes ago
    };

    mockGetUserNotifications.mockResolvedValue([recentNotification]);

    const user = userEvent.setup();
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getByText('5m ago')).toBeInTheDocument();
    });
  });

  it('should show correct notification icons based on type', async () => {
    const user = userEvent.setup();
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(() => {
      // Check for coaching invitation icon
      expect(screen.getByText('🏋️')).toBeInTheDocument();
      // Check for program assigned icon
      expect(screen.getByText('📋')).toBeInTheDocument();
    });
  });

  it('should truncate long notification messages', async () => {
    const longMessageNotification = {
      ...mockNotifications[0],
      message: 'This is a very long notification message that should be truncated because it exceeds the maximum length that we want to display in the notification dropdown to keep the UI clean and readable'
    };

    mockGetUserNotifications.mockResolvedValue([longMessageNotification]);

    const user = userEvent.setup();
    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getByText(/This is a very long notification message.*\.\.\./)).toBeInTheDocument();
    });
  });

  it('should handle real-time notification updates', async () => {
    const mockSubscription = {
      unsubscribe: jest.fn()
    };

    let subscriptionCallback;
    mockSubscribeToNotifications.mockImplementation((callback) => {
      subscriptionCallback = callback;
      return mockSubscription;
    });

    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    // Simulate new notification
    const newNotification = {
      id: 'notification-3',
      type: 'system_message',
      title: 'System Update',
      message: 'System maintenance scheduled',
      is_read: false,
      created_at: new Date().toISOString()
    };

    subscriptionCallback({
      eventType: 'INSERT',
      new: newNotification
    });

    const user = userEvent.setup();
    const bellButton = screen.getByText('🔔');
    await user.click(bellButton);

    await waitFor(() => {
      expect(screen.getByText('System Update')).toBeInTheDocument();
    });
  });

  it('should handle notification update events', async () => {
    const mockSubscription = {
      unsubscribe: jest.fn()
    };

    let subscriptionCallback;
    mockSubscribeToNotifications.mockImplementation((callback) => {
      subscriptionCallback = callback;
      return mockSubscription;
    });

    render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    // Simulate notification read update
    subscriptionCallback({
      eventType: 'UPDATE',
      old: { ...mockNotifications[0], is_read: false },
      new: { ...mockNotifications[0], is_read: true }
    });

    // The unread count should decrease
    await waitFor(() => {
      expect(screen.queryByText('1')).not.toBeInTheDocument();
    });
  });

  it('should unsubscribe from real-time updates on unmount', () => {
    const mockUnsubscribe = jest.fn();
    mockSubscribeToNotifications.mockReturnValue({
      unsubscribe: mockUnsubscribe
    });

    const { unmount } = render(
      <RouterWrapper>
        <NotificationBell />
      </RouterWrapper>
    );

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});