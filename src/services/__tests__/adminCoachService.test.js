// Mock Supabase first
const mockSupabase = {
  from: jest.fn(() => mockSupabase),
  select: jest.fn(() => mockSupabase),
  eq: jest.fn(() => mockSupabase),
  contains: jest.fn(() => mockSupabase),
  lt: jest.fn(() => mockSupabase),
  match: jest.fn(() => mockSupabase),
  order: jest.fn(() => mockSupabase),
  limit: jest.fn(() => mockSupabase),
  update: jest.fn(() => mockSupabase),
  insert: jest.fn(() => mockSupabase),
  single: jest.fn(() => mockSupabase),
  auth: {
    getUser: jest.fn()
  },
  rpc: jest.fn()
};

jest.mock('../../config/supabase', () => ({
  supabase: mockSupabase
}));

jest.mock('../../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn((error) => error),
  executeSupabaseOperation: jest.fn((fn) => fn())
}));

// Import after mocking
import {
  getCoachSystemStatistics,
  getCoachActivityData,
  getCoachClientRelationshipOversight,
  getSystemAlerts,
  getCoachPerformanceMetrics,
  toggleCoachSuspension,
  cleanupExpiredInvitations
} from '../adminCoachService';

describe('adminCoachService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock responses
    mockSupabase.select.mockReturnValue(mockSupabase);
    mockSupabase.eq.mockReturnValue(mockSupabase);
    mockSupabase.contains.mockReturnValue(mockSupabase);
    mockSupabase.lt.mockReturnValue(mockSupabase);
    mockSupabase.match.mockReturnValue(mockSupabase);
    mockSupabase.order.mockReturnValue(mockSupabase);
    mockSupabase.limit.mockReturnValue(mockSupabase);
    mockSupabase.update.mockReturnValue(mockSupabase);
    mockSupabase.insert.mockReturnValue(mockSupabase);
    mockSupabase.single.mockReturnValue(mockSupabase);
  });

  describe('getCoachSystemStatistics', () => {
    test('fetches and returns system statistics', async () => {
      // Mock responses for each query
      mockSupabase.from
        .mockReturnValueOnce({ // totalCoaches
          select: jest.fn().mockReturnValue({
            contains: jest.fn().mockResolvedValue({
              data: [{ id: '1' }, { id: '2' }],
              error: null
            })
          })
        })
        .mockReturnValueOnce({ // activeCoaches
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ id: '1' }],
              error: null
            })
          })
        })
        .mockReturnValueOnce({ // totalRelationships
          select: jest.fn().mockResolvedValue({
            data: [{ id: '1' }, { id: '2' }, { id: '3' }],
            error: null
          })
        })
        .mockReturnValueOnce({ // activeRelationships
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ id: '1' }, { id: '2' }],
              error: null
            })
          })
        })
        .mockReturnValueOnce({ // pendingInvitations
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ id: '1' }],
              error: null
            })
          })
        })
        .mockReturnValueOnce({ // totalInsights
          select: jest.fn().mockResolvedValue({
            data: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }],
            error: null
          })
        })
        .mockReturnValueOnce({ // coachPrograms
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [{ id: '1' }, { id: '2' }],
              error: null
            })
          })
        });

      const result = await getCoachSystemStatistics();

      expect(result).toEqual({
        totalCoaches: 2,
        activeCoaches: 1,
        totalRelationships: 3,
        activeRelationships: 2,
        pendingInvitations: 1,
        totalInsights: 4,
        coachPrograms: 2
      });
    });

    test('handles database errors', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          contains: jest.fn().mockResolvedValue({
            data: null,
            error: { message: 'Database error' }
          })
        })
      });

      await expect(getCoachSystemStatistics()).rejects.toThrow();
    });
  });

  describe('getCoachActivityData', () => {
    test('fetches and processes coach activity data', async () => {
      const mockCoachData = [
        {
          id: 'coach-1',
          name: 'John Coach',
          email: 'john@coach.com',
          created_at: '2024-01-01T00:00:00Z',
          last_login_at: '2024-01-15T10:00:00Z',
          coach_profiles: [{
            is_active: true,
            specializations: ['Strength Training']
          }],
          coach_relationships: [
            { id: '1', status: 'active', created_at: '2024-01-01T00:00:00Z' },
            { id: '2', status: 'active', created_at: '2024-01-02T00:00:00Z' },
            { id: '3', status: 'terminated', created_at: '2024-01-03T00:00:00Z' }
          ],
          sent_invitations: [
            { id: '1', status: 'pending', created_at: '2024-01-01T00:00:00Z' }
          ],
          coaching_insights: [
            { id: '1', type: 'recommendation', created_at: '2024-01-10T00:00:00Z' },
            { id: '2', type: 'observation', created_at: '2024-01-12T00:00:00Z' }
          ],
          assigned_programs: [
            { id: '1', coach_assigned: true, created_at: '2024-01-05T00:00:00Z' }
          ]
        }
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          contains: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: mockCoachData,
                error: null
              })
            })
          })
        })
      });

      const result = await getCoachActivityData(50);

      expect(result).toHaveLength(1);
      expect(result[0].statistics).toEqual({
        activeClients: 2,
        totalClients: 3,
        pendingInvitations: 1,
        totalInsights: 2,
        assignedPrograms: 1,
        recentInsights: 2, // Both insights are within 30 days
        recentPrograms: 1, // Program is within 30 days
        activityScore: 9 // (2*2) + (1*3) + (2*1) = 9
      });
    });

    test('handles empty coach data', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          contains: jest.fn().mockReturnValue({
            order: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });

      const result = await getCoachActivityData();
      expect(result).toEqual([]);
    });
  });

  describe('getCoachClientRelationshipOversight', () => {
    test('fetches and processes relationship data with metrics', async () => {
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
          coaching_insights: [
            { id: '1', type: 'recommendation', created_at: '2024-01-05T00:00:00Z' },
            { id: '2', type: 'observation', created_at: '2024-01-10T00:00:00Z' }
          ],
          assigned_programs: [
            { id: '1', name: 'Program 1', created_at: '2024-01-03T00:00:00Z' }
          ]
        }
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({
            data: mockRelationshipData,
            error: null
          })
        })
      });

      const result = await getCoachClientRelationshipOversight();

      expect(result).toHaveLength(1);
      expect(result[0].metrics).toEqual({
        insightCount: 2,
        programCount: 1,
        daysSinceStart: expect.any(Number),
        healthScore: expect.any(Number),
        expectedInsights: expect.any(Number),
        expectedPrograms: expect.any(Number)
      });
    });

    test('applies filters correctly', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });

      await getCoachClientRelationshipOversight({
        status: 'active',
        coachId: 'coach-1',
        limit: 10
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('coach_client_relationships');
    });
  });

  describe('getSystemAlerts', () => {
    test('generates alerts for inactive coaches with active clients', async () => {
      const mockInactiveCoaches = [
        {
          user_id: 'coach-1',
          users: {
            name: 'Jane Coach',
            email: 'jane@coach.com',
            last_login_at: '2024-01-01T00:00:00Z'
          },
          coach_relationships: [
            { id: '1', status: 'active' },
            { id: '2', status: 'active' }
          ]
        }
      ];

      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: mockInactiveCoaches,
              error: null
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            contains: jest.fn().mockReturnValue({
              lt: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              lt: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        });

      const result = await getSystemAlerts();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'warning',
        category: 'inactive_coach',
        title: 'Inactive Coach with Active Clients',
        message: 'Coach Jane Coach is inactive but has 2 active client(s)',
        coachId: 'coach-1',
        severity: 'high',
        actionRequired: true
      });
    });

    test('sorts alerts by severity', async () => {
      // Mock multiple alert types
      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            contains: jest.fn().mockReturnValue({
              lt: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              lt: jest.fn().mockResolvedValue({
                data: [
                  {
                    id: 'inv-1',
                    coach_id: 'coach-1',
                    coach_name: 'John Coach',
                    target_email: 'client@test.com',
                    expires_at: '2024-01-01T00:00:00Z'
                  }
                ],
                error: null
              })
            })
          })
        });

      const result = await getSystemAlerts();

      expect(result).toHaveLength(1);
      expect(result[0].severity).toBe('low');
    });
  });

  describe('toggleCoachSuspension', () => {
    test('suspends a coach successfully', async () => {
      const mockProfile = {
        id: 'profile-1',
        user_id: 'coach-1',
        is_active: false
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-1' } }
      });

      mockSupabase.from
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockProfile,
                  error: null
                })
              })
            })
          })
        })
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                error: null
              })
            })
          })
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockResolvedValue({
            error: null
          })
        });

      const result = await toggleCoachSuspension('coach-1', true, 'Policy violation');

      expect(result).toEqual(mockProfile);
      expect(mockSupabase.from).toHaveBeenCalledWith('coach_profiles');
      expect(mockSupabase.from).toHaveBeenCalledWith('coach_client_relationships');
      expect(mockSupabase.from).toHaveBeenCalledWith('admin_actions');
    });

    test('reactivates a coach successfully', async () => {
      const mockProfile = {
        id: 'profile-1',
        user_id: 'coach-1',
        is_active: true
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-1' } }
      });

      mockSupabase.from
        .mockReturnValueOnce({
          update: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              select: jest.fn().mockReturnValue({
                single: jest.fn().mockResolvedValue({
                  data: mockProfile,
                  error: null
                })
              })
            })
          })
        })
        .mockReturnValueOnce({
          insert: jest.fn().mockResolvedValue({
            error: null
          })
        });

      const result = await toggleCoachSuspension('coach-1', false, 'Appeal approved');

      expect(result).toEqual(mockProfile);
    });
  });

  describe('cleanupExpiredInvitations', () => {
    test('cleans up expired invitations', async () => {
      const mockExpiredInvitations = [
        { id: 'inv-1' },
        { id: 'inv-2' },
        { id: 'inv-3' }
      ];

      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            lt: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: mockExpiredInvitations,
                error: null
              })
            })
          })
        })
      });

      const result = await cleanupExpiredInvitations();

      expect(result).toBe(3);
      expect(mockSupabase.from).toHaveBeenCalledWith('client_invitations');
    });

    test('returns 0 when no expired invitations', async () => {
      mockSupabase.from.mockReturnValue({
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            lt: jest.fn().mockReturnValue({
              select: jest.fn().mockResolvedValue({
                data: [],
                error: null
              })
            })
          })
        })
      });

      const result = await cleanupExpiredInvitations();
      expect(result).toBe(0);
    });
  });

  describe('getCoachPerformanceMetrics', () => {
    test('calculates performance metrics correctly', async () => {
      const mockInvitations = [
        { coach_id: 'coach-1', status: 'accepted' },
        { coach_id: 'coach-1', status: 'declined' },
        { coach_id: 'coach-1', status: 'pending' }
      ];

      const mockRelationships = [
        { coach_id: 'coach-1', status: 'active', created_at: '2024-01-01T00:00:00Z' },
        { coach_id: 'coach-1', status: 'terminated', created_at: '2024-01-02T00:00:00Z' }
      ];

      const mockInsights = [
        { coach_id: 'coach-1', client_viewed: true, created_at: '2024-01-01T00:00:00Z' },
        { coach_id: 'coach-1', client_viewed: false, created_at: '2024-01-02T00:00:00Z' }
      ];

      mockSupabase.from
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            match: jest.fn().mockResolvedValue({
              data: mockInvitations,
              error: null
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            match: jest.fn().mockResolvedValue({
              data: mockRelationships,
              error: null
            })
          })
        })
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            match: jest.fn().mockResolvedValue({
              data: mockInsights,
              error: null
            })
          })
        });

      const result = await getCoachPerformanceMetrics();

      expect(result.invitationStats['coach-1']).toEqual({
        sent: 3,
        accepted: 1,
        declined: 1,
        expired: 0,
        pending: 1
      });

      expect(result.relationshipStats['coach-1']).toEqual({
        total: 2,
        active: 1,
        terminated: 1,
        avgDuration: 0
      });

      expect(result.insightStats['coach-1']).toEqual({
        total: 2,
        viewed: 1,
        viewRate: 50
      });
    });
  });
});