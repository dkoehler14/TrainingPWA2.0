import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';

// Mock all dependencies before importing the component
jest.mock('../hooks/useAuth');
jest.mock('../services/adminCoachService');
jest.mock('../services/userService');
jest.mock('../services/coachService');
jest.mock('../utils/roleValidation');
jest.mock('../config/supabase', () => ({
  supabase: {
    from: jest.fn(),
    auth: {
      getUser: jest.fn()
    }
  }
}));

// Import after mocking
import Admin from '../pages/Admin';
import { useAuth } from '../hooks/useAuth';
import * as adminCoachService from '../services/adminCoachService';
import * as userService from '../services/userService';

const mockUser = {
  id: 'admin-user-id',
  email: 'admin@test.com',
  roles: ['admin']
};

const mockSystemStats = {
  totalCoaches: 10,
  activeCoaches: 8,
  totalRelationships: 25,
  activeRelationships: 20,
  pendingInvitations: 5,
  totalInsights: 150,
  coachPrograms: 30
};

const mockCoachActivityData = [
  {
    id: 'coach-1',
    name: 'John Coach',
    email: 'john@coach.com',
    created_at: '2024-01-01T00:00:00Z',
    last_login_at: '2024-01-15T10:00:00Z',
    coach_profiles: [{
      is_active: true,
      specializations: ['Strength Training'],
      bio: 'Experienced coach'
    }],
    statistics: {
      activeClients: 5,
      totalClients: 7,
      pendingInvitations: 2,
      totalInsights: 25,
      assignedPrograms: 8,
      recentInsights: 3,
      recentPrograms: 2,
      activityScore: 12
    }
  },
  {
    id: 'coach-2',
    name: 'Jane Coach',
    email: 'jane@coach.com',
    created_at: '2024-01-02T00:00:00Z',
    last_login_at: '2024-01-10T15:00:00Z',
    coach_profiles: [{
      is_active: false,
      specializations: ['Weight Loss'],
      bio: 'Suspended coach'
    }],
    statistics: {
      activeClients: 0,
      totalClients: 3,
      pendingInvitations: 0,
      totalInsights: 10,
      assignedPrograms: 3,
      recentInsights: 0,
      recentPrograms: 0,
      activityScore: 2
    }
  }
];

const mockRelationshipData = [
  {
    id: 'rel-1',
    coach_id: 'coach-1',
    client_id: 'client-1',
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    coach: {
      id: 'coach-1',
      name: 'John Coach',
      email: 'john@coach.com'
    },
    client: {
      id: 'client-1',
      name: 'Client One',
      email: 'client1@test.com'
    },
    metrics: {
      insightCount: 5,
      programCount: 2,
      daysSinceStart: 30,
      healthScore: 85
    }
  }
];

const mockSystemAlerts = [
  {
    type: 'warning',
    category: 'inactive_coach',
    title: 'Inactive Coach with Active Clients',
    message: 'Coach Jane Coach is inactive but has 2 active client(s)',
    coachId: 'coach-2',
    severity: 'high',
    actionRequired: true
  },
  {
    type: 'info',
    category: 'stale_coach',
    title: 'Coach with No Recent Activity',
    message: 'Coach John Coach hasn\'t logged in or created insights in 30 days',
    coachId: 'coach-1',
    severity: 'medium',
    actionRequired: false
  }
];

const renderAdminPage = () => {
  return render(
    <BrowserRouter>
      <Admin />
    </BrowserRouter>
  );
};

describe('Admin Coach Management', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({ user: mockUser });
    
    // Mock all service functions
    adminCoachService.getCoachSystemStatistics.mockResolvedValue(mockSystemStats);
    adminCoachService.getCoachActivityData.mockResolvedValue(mockCoachActivityData);
    adminCoachService.getCoachClientRelationshipOversight.mockResolvedValue(mockRelationshipData);
    adminCoachService.getSystemAlerts.mockResolvedValue(mockSystemAlerts);
    adminCoachService.getCoachPerformanceMetrics.mockResolvedValue({});
    adminCoachService.toggleCoachSuspension.mockResolvedValue({});
    adminCoachService.cleanupExpiredInvitations.mockResolvedValue(3);
    
    userService.getAllCoaches.mockResolvedValue([]);
    userService.searchUsers.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Overview Tab', () => {
    test('displays system statistics correctly', async () => {
      renderAdminPage();
      
      await waitFor(() => {
        expect(screen.getByText('8')).toBeInTheDocument(); // Active coaches
        expect(screen.getByText('of 10 total')).toBeInTheDocument();
        expect(screen.getByText('20')).toBeInTheDocument(); // Active relationships
        expect(screen.getByText('of 25 total')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument(); // Pending invitations
        expect(screen.getByText('150')).toBeInTheDocument(); // Total insights
      });
    });

    test('displays system alerts preview', async () => {
      renderAdminPage();
      
      await waitFor(() => {
        expect(screen.getByText('System Alerts')).toBeInTheDocument();
        expect(screen.getByText('View All (2)')).toBeInTheDocument();
        expect(screen.getByText('Inactive Coach with Active Clients')).toBeInTheDocument();
      });
    });

    test('displays recent activity', async () => {
      renderAdminPage();
      
      await waitFor(() => {
        expect(screen.getByText('Recent Activity')).toBeInTheDocument();
        expect(screen.getByText('John Coach')).toBeInTheDocument();
        expect(screen.getByText('5 clients, Activity Score: 12')).toBeInTheDocument();
      });
    });

    test('cleanup expired invitations button works', async () => {
      renderAdminPage();
      
      await waitFor(() => {
        const cleanupButton = screen.getByText('Cleanup Expired Invitations');
        fireEvent.click(cleanupButton);
      });

      await waitFor(() => {
        expect(adminCoachService.cleanupExpiredInvitations).toHaveBeenCalled();
        expect(screen.getByText('Cleaned up 3 expired invitations')).toBeInTheDocument();
      });
    });
  });

  describe('Coach Activity Tab', () => {
    test('displays coach activity data', async () => {
      renderAdminPage();
      
      // Switch to activity tab
      const activityTab = screen.getByText('Coach Activity');
      fireEvent.click(activityTab);
      
      await waitFor(() => {
        expect(screen.getByText('Coach Activity Monitoring')).toBeInTheDocument();
        expect(screen.getByText('John Coach')).toBeInTheDocument();
        expect(screen.getByText('jane@coach.com')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Suspended')).toBeInTheDocument();
      });
    });

    test('displays activity scores and progress bars', async () => {
      renderAdminPage();
      
      const activityTab = screen.getByText('Coach Activity');
      fireEvent.click(activityTab);
      
      await waitFor(() => {
        expect(screen.getByText('12')).toBeInTheDocument(); // Activity score for John
        expect(screen.getByText('2')).toBeInTheDocument(); // Activity score for Jane
      });
    });

    test('suspend coach functionality works', async () => {
      renderAdminPage();
      
      const activityTab = screen.getByText('Coach Activity');
      fireEvent.click(activityTab);
      
      await waitFor(() => {
        const suspendButton = screen.getByText('Suspend');
        fireEvent.click(suspendButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Suspend Coach')).toBeInTheDocument();
        expect(screen.getByText('Suspension Reason')).toBeInTheDocument();
      });

      // Fill in suspension reason and confirm
      const reasonTextarea = screen.getByPlaceholderText('Enter reason for suspension...');
      fireEvent.change(reasonTextarea, { target: { value: 'Policy violation' } });

      const confirmButton = screen.getByText('Suspend Coach');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(adminCoachService.toggleCoachSuspension).toHaveBeenCalledWith(
          'coach-1',
          true,
          'Policy violation'
        );
      });
    });

    test('reactivate coach functionality works', async () => {
      renderAdminPage();
      
      const activityTab = screen.getByText('Coach Activity');
      fireEvent.click(activityTab);
      
      await waitFor(() => {
        const reactivateButton = screen.getByText('Reactivate');
        fireEvent.click(reactivateButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Reactivate Coach')).toBeInTheDocument();
        expect(screen.getByText('Reactivation Reason')).toBeInTheDocument();
      });
    });
  });

  describe('Relationships Tab', () => {
    test('displays relationship oversight data', async () => {
      renderAdminPage();
      
      const relationshipsTab = screen.getByText('Relationships');
      fireEvent.click(relationshipsTab);
      
      await waitFor(() => {
        expect(screen.getByText('Coach-Client Relationship Oversight')).toBeInTheDocument();
        expect(screen.getByText('John Coach')).toBeInTheDocument();
        expect(screen.getByText('Client One')).toBeInTheDocument();
        expect(screen.getByText('active')).toBeInTheDocument();
        expect(screen.getByText('85%')).toBeInTheDocument(); // Health score
      });
    });

    test('displays engagement metrics', async () => {
      renderAdminPage();
      
      const relationshipsTab = screen.getByText('Relationships');
      fireEvent.click(relationshipsTab);
      
      await waitFor(() => {
        expect(screen.getByText('5 insights')).toBeInTheDocument();
        expect(screen.getByText('2 programs')).toBeInTheDocument();
        expect(screen.getByText('30 days')).toBeInTheDocument();
      });
    });
  });

  describe('Alerts Tab', () => {
    test('displays all system alerts', async () => {
      renderAdminPage();
      
      const alertsTab = screen.getByText(/Alerts \(2\)/);
      fireEvent.click(alertsTab);
      
      await waitFor(() => {
        expect(screen.getByText('System Alerts')).toBeInTheDocument();
        expect(screen.getByText('Inactive Coach with Active Clients')).toBeInTheDocument();
        expect(screen.getByText('Coach with No Recent Activity')).toBeInTheDocument();
        expect(screen.getByText('high')).toBeInTheDocument();
        expect(screen.getByText('medium')).toBeInTheDocument();
      });
    });

    test('shows empty state when no alerts', async () => {
      adminCoachService.getSystemAlerts.mockResolvedValue([]);
      
      renderAdminPage();
      
      const alertsTab = screen.getByText('Alerts');
      fireEvent.click(alertsTab);
      
      await waitFor(() => {
        expect(screen.getByText('All Clear!')).toBeInTheDocument();
        expect(screen.getByText('No system alerts at this time. The coaching system is running smoothly.')).toBeInTheDocument();
      });
    });
  });

  describe('Data Loading and Error Handling', () => {
    test('shows loading spinner while data loads', async () => {
      // Mock delayed response
      adminCoachService.getCoachSystemStatistics.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(mockSystemStats), 100))
      );
      
      renderAdminPage();
      
      expect(screen.getByRole('status')).toBeInTheDocument(); // Loading spinner
    });

    test('handles service errors gracefully', async () => {
      adminCoachService.getCoachSystemStatistics.mockRejectedValue(
        new Error('Service unavailable')
      );
      
      renderAdminPage();
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load system data')).toBeInTheDocument();
      });
    });

    test('refresh data button works', async () => {
      renderAdminPage();
      
      const activityTab = screen.getByText('Coach Activity');
      fireEvent.click(activityTab);
      
      await waitFor(() => {
        const refreshButton = screen.getByText('Refresh Data');
        fireEvent.click(refreshButton);
      });

      expect(adminCoachService.getCoachSystemStatistics).toHaveBeenCalledTimes(2);
      expect(adminCoachService.getCoachActivityData).toHaveBeenCalledTimes(2);
    });
  });

  describe('Activity Score Calculations', () => {
    test('calculates activity score colors correctly', async () => {
      renderAdminPage();
      
      const activityTab = screen.getByText('Coach Activity');
      fireEvent.click(activityTab);
      
      await waitFor(() => {
        // High activity score (12) should be success/green
        const highScoreBadge = screen.getByText('12').closest('.badge');
        expect(highScoreBadge).toHaveClass('bg-success');
        
        // Low activity score (2) should be danger/red
        const lowScoreBadge = screen.getByText('2').closest('.badge');
        expect(lowScoreBadge).toHaveClass('bg-danger');
      });
    });
  });

  describe('Health Score Display', () => {
    test('displays health scores with appropriate colors', async () => {
      renderAdminPage();
      
      const relationshipsTab = screen.getByText('Relationships');
      fireEvent.click(relationshipsTab);
      
      await waitFor(() => {
        // Health score of 85% should be success/green
        const healthScoreBadge = screen.getByText('85%').closest('.badge');
        expect(healthScoreBadge).toHaveClass('bg-success');
      });
    });
  });

  describe('Modal Interactions', () => {
    test('suspension modal can be cancelled', async () => {
      renderAdminPage();
      
      const activityTab = screen.getByText('Coach Activity');
      fireEvent.click(activityTab);
      
      await waitFor(() => {
        const suspendButton = screen.getByText('Suspend');
        fireEvent.click(suspendButton);
      });

      await waitFor(() => {
        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);
      });

      await waitFor(() => {
        expect(screen.queryByText('Suspend Coach')).not.toBeInTheDocument();
      });
    });

    test('suspension button is disabled without reason', async () => {
      renderAdminPage();
      
      const activityTab = screen.getByText('Coach Activity');
      fireEvent.click(activityTab);
      
      await waitFor(() => {
        const suspendButton = screen.getByText('Suspend');
        fireEvent.click(suspendButton);
      });

      await waitFor(() => {
        const confirmButton = screen.getByRole('button', { name: 'Suspend Coach' });
        expect(confirmButton).toBeDisabled();
      });
    });
  });

  describe('Tab Navigation', () => {
    test('can navigate between all tabs', async () => {
      renderAdminPage();
      
      // Test each tab
      const tabs = ['Coach Activity', 'Relationships', /Alerts/, 'Promote Users'];
      
      for (const tabName of tabs) {
        const tab = screen.getByText(tabName);
        fireEvent.click(tab);
        
        await waitFor(() => {
          expect(tab.closest('.nav-link')).toHaveClass('active');
        });
      }
    });
  });
});