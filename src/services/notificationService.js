import { supabase } from '../config/supabase'
import { handleSupabaseError, executeSupabaseOperation } from '../utils/supabaseErrorHandler'

/**
 * Notification Service for managing in-app notifications
 * Handles CRUD operations for user notifications
 */

/**
 * Get notifications for the current user
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of notifications
 */
export const getUserNotifications = async (options = {}) => {
  return executeSupabaseOperation(async () => {
    let query = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })

    // Filter options
    if (options.unreadOnly) {
      query = query.eq('is_read', false)
    }

    if (options.type) {
      query = query.eq('type', options.type)
    }

    if (options.limit) {
      query = query.limit(options.limit)
    }

    // Exclude expired notifications
    query = query.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())

    const { data, error } = await query

    if (error) {
      throw handleSupabaseError(error, 'getUserNotifications')
    }

    return data || []
  })
}

/**
 * Get unread notification count for current user
 * @returns {Promise<number>} Count of unread notifications
 */
export const getUnreadNotificationCount = async () => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .rpc('get_unread_notification_count')

    if (error) {
      throw handleSupabaseError(error, 'getUnreadNotificationCount')
    }

    return data || 0
  })
}

/**
 * Mark notification as read
 * @param {string} notificationId - Notification ID
 * @returns {Promise<void>}
 */
export const markNotificationAsRead = async (notificationId) => {
  return executeSupabaseOperation(async () => {
    const { error } = await supabase
      .rpc('mark_notification_read', { notification_id: notificationId })

    if (error) {
      throw handleSupabaseError(error, 'markNotificationAsRead')
    }
  })
}

/**
 * Mark all notifications as read for current user
 * @returns {Promise<void>}
 */
export const markAllNotificationsAsRead = async () => {
  return executeSupabaseOperation(async () => {
    const { error } = await supabase
      .from('notifications')
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('is_read', false)

    if (error) {
      throw handleSupabaseError(error, 'markAllNotificationsAsRead')
    }
  })
}

/**
 * Delete notification
 * @param {string} notificationId - Notification ID
 * @returns {Promise<void>}
 */
export const deleteNotification = async (notificationId) => {
  return executeSupabaseOperation(async () => {
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)

    if (error) {
      throw handleSupabaseError(error, 'deleteNotification')
    }
  })
}

/**
 * Delete all read notifications for current user
 * @returns {Promise<number>} Number of deleted notifications
 */
export const deleteReadNotifications = async () => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .eq('is_read', true)
      .select('id')

    if (error) {
      throw handleSupabaseError(error, 'deleteReadNotifications')
    }

    return data ? data.length : 0
  })
}

/**
 * Create a notification (system use)
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Object>} Created notification
 */
export const createNotification = async (notificationData) => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: notificationData.userId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        related_id: notificationData.relatedId || null,
        related_type: notificationData.relatedType || null,
        action_url: notificationData.actionUrl || null,
        action_text: notificationData.actionText || null,
        priority: notificationData.priority || 'normal',
        expires_at: notificationData.expiresAt || null
      })
      .select()
      .single()

    if (error) {
      throw handleSupabaseError(error, 'createNotification')
    }

    return data
  })
}

/**
 * Subscribe to real-time notification updates
 * @param {Function} callback - Callback function for updates
 * @returns {Object} Subscription object
 */
export const subscribeToNotifications = (callback) => {
  return supabase
    .channel('user-notifications')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${supabase.auth.getUser()?.data?.user?.id}`
      },
      callback
    )
    .subscribe()
}

/**
 * Clean up expired notifications (admin function)
 * @returns {Promise<number>} Number of cleaned up notifications
 */
export const cleanupExpiredNotifications = async () => {
  return executeSupabaseOperation(async () => {
    const { data, error } = await supabase
      .rpc('cleanup_expired_notifications')

    if (error) {
      throw handleSupabaseError(error, 'cleanupExpiredNotifications')
    }

    return data || 0
  })
}