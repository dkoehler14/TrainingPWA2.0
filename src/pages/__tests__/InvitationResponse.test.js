import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InvitationResponse from '../InvitationResponse';
import { useAuth } from '../../hooks/useAuth';
import { acceptInvitation, declineInvitation } from '../../services/coachService';
import { supabase } from '../../config/supabase';

// Mock dependencies
jest.mock('../../hooks/useAuth');
jest.mock('../../services/coachService');
jest.mock('../../config/supabase', () => ({
  supabase: {
    from: jest.fn()
  }
}));

const mockUseAuth = useAuth;
const mockAcceptInvitation = acceptInvitation;
const mockDeclineInvitation = declineInvitation;

// Mock navigate and params
const mockNavigate = jest.fn();
const mockUseParams = jest.fn();

jest.mock('react-router-dom', () => ({
  BrowserRouter: ({ children }) => children,
  MemoryRouter: ({ children }) => children,
  useParams: () => mockUseParams(),
  useNavigate: () => mockNavigate
}));

describe('InvitationResponse', () => {
  const mockInvitation = {
    id: 'invitation-123',
    coach_id: 'coach-123',
    coach_name: 'John Coach',
    coach_email: 'coach@example.com',
    target_email: 'client@example.com',
    invitation_code: 'abc123def456',
    message: 'Welcome to my coaching program!',
    status: 'pending',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days from now
    created_at: '2024-01-01T12:00:00Z'
  };

  const mockUser = {
    id: 'user-123',
    email: 'client@example.com'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false
    });

    // Set default invitation code
    mockUseParams.mockReturnValue({ invitationCode: 'abc123def456' });

    // Mock successful invitation fetch
    supabase.from.mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: mockInvitation,
            error: null
          })
        })
      }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null })
      })
    });
  });

  const renderWithRouter = (invitationCode = 'abc123def456') => {
    // Mock useParams to return the invitation code
    mockUseParams.mockReturnValue({ invitationCode });
    return render(<InvitationResponse />);
  };

  describe('Loading States', () => {
    it('should show loading state while fetching invitation', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser,
        loading: true
      });

      renderWithRouter();

      expect(screen.getByText('Loading invitation...')).toBeInTheDocument();
    });

    it('should show loading state while invitation data is being fetched', async () => {
      // Mock slow invitation fetch
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)))
          })
        })
      });

      renderWithRouter();

      expect(screen.getByText('Loading invitation...')).toBeInTheDocument();
    });
  });

  describe('Invalid Invitation Handling', () => {
    it('should show error for invalid invitation code', async () => {
      renderWithRouter('invalid-code');

      await waitFor(() => {
        expect(screen.getByText('Invalid Invitation')).toBeInTheDocument();
        expect(screen.getByText('Invalid invitation link')).toBeInTheDocument();
      });
    });

    it('should show error for non-existent invitation', async () => {
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }
            })
          })
        })
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Invalid Invitation')).toBeInTheDocument();
        expect(screen.getByText('Invitation not found or invalid')).toBeInTheDocument();
      });
    });

    it('should show error for already accepted invitation', async () => {
      const acceptedInvitation = {
        ...mockInvitation,
        status: 'accepted'
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: acceptedInvitation,
              error: null
            })
          })
        })
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('This invitation has already been accepted')).toBeInTheDocument();
      });
    });

    it('should show error for expired invitation', async () => {
      const expiredInvitation = {
        ...mockInvitation,
        expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1 day ago
      };

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: expiredInvitation,
              error: null
            })
          })
        })
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('This invitation has expired')).toBeInTheDocument();
      });
    });
  });

  describe('Valid Invitation Display', () => {
    it('should display invitation details correctly', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('John Coach has invited you to be their client!')).toBeInTheDocument();
        expect(screen.getByText('Welcome to my coaching program!')).toBeInTheDocument();
        expect(screen.getByText('Personalized Programs:')).toBeInTheDocument();
        expect(screen.getByText('Progress Tracking:')).toBeInTheDocument();
        expect(screen.getByText('Expert Insights:')).toBeInTheDocument();
        expect(screen.getByText('Goal Achievement:')).toBeInTheDocument();
      });
    });

    it('should show time remaining correctly', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText(/\d+ day[s]? remaining/)).toBeInTheDocument();
      });
    });

    it('should display coach information', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Coach: John Coach')).toBeInTheDocument();
      });
    });
  });

  describe('Invitation Acceptance', () => {
    it('should accept invitation successfully when user is authenticated', async () => {
      mockAcceptInvitation.mockResolvedValue('relationship-123');

      renderWithRouter();

      await waitFor(() => {
        const acceptButton = screen.getByText('✅ Accept Invitation');
        userEvent.click(acceptButton);
      });

      await waitFor(() => {
        expect(mockAcceptInvitation).toHaveBeenCalledWith('invitation-123');
        expect(screen.getByText('Invitation accepted successfully!')).toBeInTheDocument();
      });

      // Should redirect after success
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/my-coach');
      }, { timeout: 3000 });
    });

    it('should redirect to auth when user is not authenticated', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: false
      });

      renderWithRouter();

      await waitFor(() => {
        const acceptButton = screen.getByText('✅ Accept Invitation');
        userEvent.click(acceptButton);
      });

      expect(mockNavigate).toHaveBeenCalledWith('/auth?returnTo=%2Finvitation%2Fabc123def456');
    });

    it('should handle acceptance errors', async () => {
      mockAcceptInvitation.mockRejectedValue(new Error('Already connected with this coach'));

      renderWithRouter();

      await waitFor(() => {
        const acceptButton = screen.getByText('✅ Accept Invitation');
        userEvent.click(acceptButton);
      });

      await waitFor(() => {
        expect(screen.getByText('You are already connected with this coach or have a pending invitation.')).toBeInTheDocument();
      });
    });

    it('should show loading state during acceptance', async () => {
      mockAcceptInvitation.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      renderWithRouter();

      await waitFor(() => {
        const acceptButton = screen.getByText('✅ Accept Invitation');
        userEvent.click(acceptButton);
      });

      expect(screen.getByText('Accepting...')).toBeInTheDocument();
      expect(screen.getByText('Accepting...')).toBeDisabled();
    });
  });

  describe('Invitation Decline', () => {
    it('should decline invitation successfully', async () => {
      const declinedInvitation = {
        ...mockInvitation,
        status: 'declined',
        responded_at: new Date().toISOString()
      };

      mockDeclineInvitation.mockResolvedValue(declinedInvitation);

      renderWithRouter();

      await waitFor(() => {
        const declineButton = screen.getByText('Decline');
        userEvent.click(declineButton);
      });

      await waitFor(() => {
        expect(mockDeclineInvitation).toHaveBeenCalledWith('invitation-123');
        expect(screen.getByText('Invitation declined. The coach has been notified.')).toBeInTheDocument();
      });

      // Should redirect after success
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      }, { timeout: 3000 });
    });

    it('should handle decline errors', async () => {
      mockDeclineInvitation.mockRejectedValue(new Error('Failed to decline invitation'));

      renderWithRouter();

      await waitFor(() => {
        const declineButton = screen.getByText('Decline');
        userEvent.click(declineButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to decline invitation. Please try again.')).toBeInTheDocument();
      });
    });

    it('should show loading state during decline', async () => {
      mockDeclineInvitation.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

      renderWithRouter();

      await waitFor(() => {
        const declineButton = screen.getByText('Decline');
        userEvent.click(declineButton);
      });

      expect(screen.getByText('Declining...')).toBeInTheDocument();
      expect(screen.getByText('Declining...')).toBeDisabled();
    });
  });

  describe('Unauthenticated User Experience', () => {
    it('should show sign-in notice for unauthenticated users', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: false
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText("You'll need to sign in or create an account to accept this invitation.")).toBeInTheDocument();
      });
    });

    it('should show different button text for unauthenticated users', async () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: false
      });

      renderWithRouter();

      await waitFor(() => {
        const acceptButton = screen.getByText('✅ Accept Invitation');
        userEvent.click(acceptButton);
      });

      expect(screen.getByText('Redirecting to Sign In...')).toBeInTheDocument();
    });
  });

  describe('Invitation Viewing Tracking', () => {
    it('should mark invitation as viewed when loaded', async () => {
      const mockUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null })
      });

      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockInvitation,
              error: null
            })
          })
        }),
        update: mockUpdate
      });

      renderWithRouter();

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith({
          viewed_at: expect.any(String),
          updated_at: expect.any(String)
        });
      });
    });
  });
});