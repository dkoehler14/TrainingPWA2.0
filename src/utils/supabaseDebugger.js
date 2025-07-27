/**
 * Supabase Development Debugging Utilities
 * 
 * Provides debugging capabilities specifically for Supabase operations,
 * including connection monitoring, query logging, and error tracking.
 */

import { supabase } from '../config/supabase';

// Debug levels
export const DEBUG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

// Current debug level based on environment
const currentDebugLevel = process.env.NODE_ENV === 'development' ? 
  (process.env.REACT_APP_SUPABASE_DEBUG === 'trace' ? DEBUG_LEVELS.TRACE :
   process.env.REACT_APP_SUPABASE_DEBUG === 'debug' ? DEBUG_LEVELS.DEBUG :
   process.env.REACT_APP_SUPABASE_DEBUG === 'info' ? DEBUG_LEVELS.INFO :
   DEBUG_LEVELS.WARN) : DEBUG_LEVELS.ERROR;

// Supabase service status tracking
const supabaseStatus = {
  connection: { status: 'unknown', lastCheck: null, error: null },
  auth: { status: 'unknown', user: null, session: null },
  realtime: { status: 'unknown', channels: [], subscriptions: 0 },
  queries: { total: 0, successful: 0, failed: 0, avgResponseTime: 0 }
};

/**
 * Supabase Logger for development debugging
 */
export class SupabaseLogger {
  constructor(context = 'Supabase') {
    this.context = context;
    this.startTime = Date.now();
    this.queryHistory = [];
  }

  /**
   * Log Supabase operations with enhanced debugging information
   */
  log(level, message, data = null, options = {}) {
    const levelNum = DEBUG_LEVELS[level.toUpperCase()] || DEBUG_LEVELS.INFO;
    
    if (levelNum > currentDebugLevel) return;

    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    
    const logEntry = {
      timestamp,
      elapsed,
      level: level.toUpperCase(),
      context: this.context,
      message,
      data,
      supabaseStatus: { ...supabaseStatus }
    };

    this.outputToConsole(logEntry, options);
  }

  outputToConsole(logEntry, options = {}) {
    const { timestamp, elapsed, level, context, message, data } = logEntry;
    
    const colors = {
      ERROR: 'color: #ff4444; font-weight: bold;',
      WARN: 'color: #ffaa00; font-weight: bold;',
      INFO: 'color: #00aa44;',
      DEBUG: 'color: #4444ff;',
      TRACE: 'color: #888888;'
    };

    const style = colors[level] || colors.INFO;
    const timeStyle = 'color: #666666; font-size: 0.9em;';
    const contextStyle = 'color: #00aa44; font-weight: bold;';

    console.log(`%c[${level}] %c${context} %c(+${elapsed}ms) %c${message}`, 
      style, contextStyle, timeStyle, 'color: inherit;');

    if (data !== null && data !== undefined) {
      console.log('Data:', data);
    }
  }

  // Convenience methods
  error(message, data, options) { this.log('error', message, data, options); }
  warn(message, data, options) { this.log('warn', message, data, options); }
  info(message, data, options) { this.log('info', message, data, options); }
  debug(message, data, options) { this.log('debug', message, data, options); }
  trace(message, data, options) { this.log('trace', message, data, options); }
}

/**
 * Monitor Supabase connection status
 */
export async function checkSupabaseConnection() {
  const logger = new SupabaseLogger('ConnectionCheck');
  
  try {
    logger.debug('Checking Supabase connection...');
    
    const startTime = Date.now();
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1);
    
    const responseTime = Date.now() - startTime;
    
    if (error) {
      supabaseStatus.connection = {
        status: 'error',
        lastCheck: new Date().toISOString(),
        error: error.message,
        responseTime
      };
      
      logger.error('Supabase connection failed', { error: error.message, responseTime });
      return false;
    }
    
    supabaseStatus.connection = {
      status: 'connected',
      lastCheck: new Date().toISOString(),
      error: null,
      responseTime
    };
    
    logger.info('Supabase connection successful', { responseTime });
    return true;
  } catch (error) {
    supabaseStatus.connection = {
      status: 'error',
      lastCheck: new Date().toISOString(),
      error: error.message
    };
    
    logger.error('Supabase connection check failed', { error: error.message });
    return false;
  }
}

/**
 * Monitor Supabase authentication status
 */
export function monitorSupabaseAuth() {
  const logger = new SupabaseLogger('AuthMonitor');
  
  supabase.auth.onAuthStateChange((event, session) => {
    supabaseStatus.auth = {
      status: session ? 'authenticated' : 'unauthenticated',
      user: session?.user || null,
      session: session ? {
        access_token: session.access_token ? '***' : null,
        refresh_token: session.refresh_token ? '***' : null,
        expires_at: session.expires_at
      } : null
    };
    
    logger.info(`Auth state changed: ${event}`, {
      event,
      userId: session?.user?.id,
      email: session?.user?.email,
      expiresAt: session?.expires_at
    });
  });
}

/**
 * Log Supabase query operations
 */
export function logSupabaseQuery(operation, table, query, result, error = null) {
  const logger = new SupabaseLogger('QueryLogger');
  
  supabaseStatus.queries.total++;
  
  if (error) {
    supabaseStatus.queries.failed++;
    logger.error(`Query failed: ${operation} on ${table}`, {
      operation,
      table,
      query,
      error: error.message
    });
  } else {
    supabaseStatus.queries.successful++;
    logger.debug(`Query successful: ${operation} on ${table}`, {
      operation,
      table,
      query,
      resultCount: Array.isArray(result) ? result.length : result ? 1 : 0
    });
  }
}

/**
 * Monitor Supabase real-time subscriptions
 */
export function monitorRealtimeSubscriptions() {
  const logger = new SupabaseLogger('RealtimeMonitor');
  
  // Override the channel method to track subscriptions
  const originalChannel = supabase.channel.bind(supabase);
  supabase.channel = function(name, options) {
    const channel = originalChannel(name, options);
    
    // Track channel creation
    if (!supabaseStatus.realtime.channels.includes(name)) {
      supabaseStatus.realtime.channels.push(name);
      logger.info(`Real-time channel created: ${name}`, { options });
    }
    
    // Override subscribe to track subscriptions
    const originalSubscribe = channel.subscribe.bind(channel);
    channel.subscribe = function(callback) {
      supabaseStatus.realtime.subscriptions++;
      logger.info(`Subscribed to channel: ${name}`, {
        totalSubscriptions: supabaseStatus.realtime.subscriptions
      });
      
      return originalSubscribe((status) => {
        logger.debug(`Channel ${name} status: ${status}`);
        if (callback) callback(status);
      });
    };
    
    return channel;
  };
}

/**
 * Get current Supabase status summary
 */
export function getSupabaseStatus() {
  return {
    ...supabaseStatus,
    timestamp: new Date().toISOString(),
    environment: {
      supabaseUrl: process.env.REACT_APP_SUPABASE_URL ? '***' : null,
      supabaseAnonKey: process.env.REACT_APP_SUPABASE_ANON_KEY ? '***' : null,
      debugLevel: currentDebugLevel
    }
  };
}

/**
 * Initialize Supabase debugging
 */
export function initializeSupabaseDebugging() {
  if (process.env.NODE_ENV !== 'development') return;
  
  const logger = new SupabaseLogger('Initializer');
  
  logger.info('Initializing Supabase debugging...', {
    debugLevel: currentDebugLevel,
    supabaseUrl: process.env.REACT_APP_SUPABASE_URL ? 'configured' : 'missing',
    supabaseAnonKey: process.env.REACT_APP_SUPABASE_ANON_KEY ? 'configured' : 'missing'
  });
  
  // Start monitoring
  monitorSupabaseAuth();
  monitorRealtimeSubscriptions();
  
  // Initial connection check
  setTimeout(checkSupabaseConnection, 1000);
  
  // Periodic connection checks
  setInterval(checkSupabaseConnection, 30000); // Every 30 seconds
  
  logger.info('✅ Supabase debugging initialized');
}

// Global logger instance
export const supabaseLogger = new SupabaseLogger('Global');