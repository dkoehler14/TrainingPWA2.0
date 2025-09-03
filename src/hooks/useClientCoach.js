/**
 * Client Coach Hook
 * 
 * Hook to manage client-coach relationship data and operations
 * for clients to interact with their assigned coach.
 */

import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { supabase } from '../config/supabase';
import { handleSupabaseError } from '../utils/supabaseErrorHandler';

/**
 * Hook to get client's active coach relationship and related data
 */
export function useClientCoach() {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [coachRelationship, setCoachRelationship] = useState(null);
  const [coachProfile, setCoachProfile] = useState(null);
  const [assignedPrograms, setAssignedPrograms] = useState([]);
  const [coachInsights, setCoachInsights] = useState([]);
  const [hasActiveCoach, setHasActiveCoach] = useState(false);

  // Load coach relationship and related data
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }

    loadCoachData();
  }, [user, isAuthenticated]);

  const loadCoachData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get active coach relationship
      console.log('🔍 DEBUG: Loading coach relationship data');
      console.log('🔍 DEBUG: User ID for relationship query:', user.id);

      const relationshipQuery = supabase
        .from('coach_client_relationships')
        .select(`
          *,
          coach:users!coach_id(
            id,
            name,
            email
          ),
          coach_profile:coach_profiles!coach_id(
            specializations,
            certifications,
            bio,
            phone,
            website
          )
        `)
        .eq('client_id', user.id)
        .eq('status', 'active')
        .single();

      console.log('🔍 DEBUG: Relationship query URL:', relationshipQuery.url);

      const { data: relationship, error: relationshipError } = await relationshipQuery;

      console.log('🔍 DEBUG: Relationship query response:', { data: relationship, error: relationshipError });

      if (relationshipError) {
        console.error('❌ DEBUG: Relationship query error:', relationshipError);
        console.error('❌ DEBUG: Error code:', relationshipError.code);
        console.error('❌ DEBUG: Error message:', relationshipError.message);

        if (relationshipError.code === '406' || relationshipError.message?.includes('406')) {
          console.error('🚨 DEBUG: 406 Not Acceptable error in relationship query!');
          console.error('🚨 DEBUG: This may be caused by:');
          console.error('🚨 DEBUG: 1. Missing or incorrect authentication');
          console.error('🚨 DEBUG: 2. Content-Type header issues');
          console.error('🚨 DEBUG: 3. Accept header mismatch');
          console.error('🚨 DEBUG: 4. RLS policy blocking access');
        }

        if (relationshipError.code !== 'PGRST116') {
          throw handleSupabaseError(relationshipError, 'loadCoachData');
        }
      } else {
        console.log('✅ DEBUG: Successfully loaded relationship data');
      }

      if (relationship) {
        setCoachRelationship(relationship);
        setCoachProfile(relationship.coach_profile);
        setHasActiveCoach(true);

        // Load assigned programs
        await loadAssignedPrograms(relationship.coach_id);

        // Load coaching insights
        await loadCoachInsights(relationship.coach_id);
      } else {
        setHasActiveCoach(false);
        setCoachRelationship(null);
        setCoachProfile(null);
        setAssignedPrograms([]);
        setCoachInsights([]);
      }

    } catch (err) {
      console.error('Failed to load coach data:', err);
      setError('Failed to load coach information. Please try again.');
      setHasActiveCoach(false);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignedPrograms = async (coachId) => {
    try {
      const { data, error } = await supabase
        .from('programs')
        .select(`
          *,
          program_workouts(
            id,
            day_of_week,
            workout_name
          )
        `)
        .eq('assigned_to_client', user.id)
        .eq('user_id', coachId)
        .eq('coach_assigned', true)
        .order('assigned_at', { ascending: false });

      if (error) {
        throw handleSupabaseError(error, 'loadAssignedPrograms');
      }

      setAssignedPrograms(data || []);
    } catch (err) {
      console.error('Failed to load assigned programs:', err);
      // Don't fail the entire load if programs fail
      setAssignedPrograms([]);
    }
  };

  const loadCoachInsights = async (coachId) => {
    try {
      const { data, error } = await supabase
        .from('coaching_insights')
        .select('*')
        .eq('client_id', user.id)
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(10); // Get latest 10 insights

      if (error) {
        throw handleSupabaseError(error, 'loadCoachInsights');
      }

      setCoachInsights(data || []);
    } catch (err) {
      console.error('Failed to load coach insights:', err);
      // Don't fail the entire load if insights fail
      setCoachInsights([]);
    }
  };

  // Mark insight as viewed
  const markInsightAsViewed = async (insightId) => {
    try {
      const { error } = await supabase
        .from('coaching_insights')
        .update({
          client_viewed: true,
          client_viewed_at: new Date().toISOString()
        })
        .eq('id', insightId)
        .eq('client_id', user.id);

      if (error) {
        throw handleSupabaseError(error, 'markInsightAsViewed');
      }

      // Update local state
      setCoachInsights(prev => 
        prev.map(insight => 
          insight.id === insightId 
            ? { ...insight, client_viewed: true, client_viewed_at: new Date().toISOString() }
            : insight
        )
      );

      return true;
    } catch (err) {
      console.error('Failed to mark insight as viewed:', err);
      return false;
    }
  };

  // Add response to insight
  const addInsightResponse = async (insightId, response) => {
    try {
      const { error } = await supabase
        .from('coaching_insights')
        .update({
          client_response: response,
          updated_at: new Date().toISOString()
        })
        .eq('id', insightId)
        .eq('client_id', user.id);

      if (error) {
        throw handleSupabaseError(error, 'addInsightResponse');
      }

      // Update local state
      setCoachInsights(prev => 
        prev.map(insight => 
          insight.id === insightId 
            ? { ...insight, client_response: response, updated_at: new Date().toISOString() }
            : insight
        )
      );

      return true;
    } catch (err) {
      console.error('Failed to add insight response:', err);
      return false;
    }
  };

  // Terminate coaching relationship
  const terminateCoachingRelationship = async () => {
    if (!coachRelationship) return false;

    try {
      const { error } = await supabase
        .from('coach_client_relationships')
        .update({
          status: 'terminated',
          terminated_at: new Date().toISOString()
        })
        .eq('id', coachRelationship.id)
        .eq('client_id', user.id);

      if (error) {
        throw handleSupabaseError(error, 'terminateCoachingRelationship');
      }

      // Reload data to reflect changes
      await loadCoachData();
      return true;
    } catch (err) {
      console.error('Failed to terminate coaching relationship:', err);
      setError('Failed to terminate coaching relationship. Please try again.');
      return false;
    }
  };

  // Get unread insights count
  const unreadInsightsCount = coachInsights.filter(insight => !insight.client_viewed).length;

  return {
    loading,
    error,
    hasActiveCoach,
    coachRelationship,
    coachProfile,
    assignedPrograms,
    coachInsights,
    unreadInsightsCount,
    markInsightAsViewed,
    addInsightResponse,
    terminateCoachingRelationship,
    refreshCoachData: loadCoachData
  };
}

/**
 * Simple hook to check if user has an active coach (for navigation)
 */
export function useHasActiveCoach() {
  const { user, isAuthenticated } = useAuth();
  const [hasCoach, setHasCoach] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setHasCoach(false);
      setIsChecking(false);
      return;
    }

    const checkForCoach = async () => {
      try {
        console.log('🔍 DEBUG: Checking for active coach relationship');
        console.log('🔍 DEBUG: User ID:', user.id);
        console.log('🔍 DEBUG: User authenticated:', !!user);

        // Log the exact query being made
        const query = supabase
          .from('coach_client_relationships')
          .select('id')
          .eq('client_id', user.id)
          .eq('status', 'active')
          .single();

        console.log('🔍 DEBUG: Supabase query URL:', query.url);
        console.log('🔍 DEBUG: Supabase headers:', query.headers);

        const { data, error } = await query;

        console.log('🔍 DEBUG: Query response data:', data);
        console.log('🔍 DEBUG: Query response error:', error);

        if (error) {
          console.error('❌ DEBUG: Error checking for coach:', error);
          console.error('❌ DEBUG: Error code:', error.code);
          console.error('❌ DEBUG: Error message:', error.message);
          console.error('❌ DEBUG: Error details:', error.details);
          console.error('❌ DEBUG: Error hint:', error.hint);

          // Log additional context for 406 errors
          if (error.code === '406' || error.message?.includes('406')) {
            console.error('🚨 DEBUG: 406 Not Acceptable error detected!');
            console.error('🚨 DEBUG: This usually indicates:');
            console.error('🚨 DEBUG: 1. Content-Type header mismatch');
            console.error('🚨 DEBUG: 2. Accept header issues');
            console.error('🚨 DEBUG: 3. Authentication problems');
            console.error('🚨 DEBUG: 4. Query parameter format issues');
          }
        } else {
          console.log('✅ DEBUG: Successfully checked for coach, result:', !!data);
        }

        setHasCoach(!!data);
      } catch (err) {
        console.error('💥 DEBUG: Exception in checkForCoach:', err);
        console.error('💥 DEBUG: Exception stack:', err.stack);
        setHasCoach(false);
      } finally {
        setIsChecking(false);
      }
    };

    checkForCoach();
  }, [user, isAuthenticated]);

  return { hasCoach, isChecking };
}

export default useClientCoach;