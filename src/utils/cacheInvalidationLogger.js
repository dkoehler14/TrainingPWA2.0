/**
 * Cache Invalidation Logger Utility
 * Provides logging functionality for cache invalidation operations.
 * Stores logs in memory with optional persistence to localStorage.
 * Configurable log levels: 'debug', 'info', 'warn', 'error'.
 */

class CacheInvalidationLogger {
  constructor(options = {}) {
    this.logs = [];
    this.logLevel = options.logLevel || 'info'; // Default log level
    this.persistenceEnabled = options.persistenceEnabled || false;
    this.persistenceKey = options.persistenceKey || 'cacheInvalidationLogs';

    // Load persisted logs if enabled
    if (this.persistenceEnabled) {
      this.loadPersistedLogs();
    }
  }

  /**
   * Logs a cache invalidation operation.
   * @param {string} operation - The type of operation (e.g., 'invalidate', 'clear').
   * @param {object} details - Details of the invalidation.
   * @param {string} details.userId - ID of the user performing the operation.
   * @param {Array<string>} details.patternsInvalidated - Patterns that were invalidated.
   * @param {number} details.entriesRemoved - Number of entries removed.
   * @param {string} details.reason - Reason for the invalidation.
   * @param {string} [details.level='info'] - Log level ('debug', 'info', 'warn', 'error').
   */
  logInvalidation(operation, details) {
    const level = details.level || 'info';
    if (!this.shouldLog(level)) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      userId: details.userId,
      patternsInvalidated: details.patternsInvalidated || [],
      entriesRemoved: details.entriesRemoved || 0,
      reason: details.reason || '',
      level
    };

    this.logs.push(logEntry);

    // Persist if enabled
    if (this.persistenceEnabled) {
      this.persistLogs();
    }
  }

  /**
   * Retrieves the history of invalidation logs.
   * @param {object} [filters] - Optional filters.
   * @param {string} [filters.level] - Filter by log level.
   * @param {string} [filters.userId] - Filter by user ID.
   * @param {number} [filters.limit] - Limit the number of results.
   * @returns {Array} Array of log entries matching the filters.
   */
  getInvalidationHistory(filters = {}) {
    let filteredLogs = [...this.logs];

    if (filters.level) {
      filteredLogs = filteredLogs.filter(log => log.level === filters.level);
    }

    if (filters.userId) {
      filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
    }

    if (filters.limit) {
      filteredLogs = filteredLogs.slice(-filters.limit);
    }

    return filteredLogs;
  }

  /**
   * Clears all logs from memory and persistence.
   */
  clearLogs() {
    this.logs = [];
    if (this.persistenceEnabled) {
      localStorage.removeItem(this.persistenceKey);
    }
  }

  /**
   * Checks if a log entry should be logged based on the current log level.
   * @param {string} level - The level of the log entry.
   * @returns {boolean} True if the entry should be logged.
   */
  shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentIndex = levels.indexOf(this.logLevel);
    const entryIndex = levels.indexOf(level);
    return entryIndex >= currentIndex;
  }

  /**
   * Persists logs to localStorage.
   */
  persistLogs() {
    try {
      localStorage.setItem(this.persistenceKey, JSON.stringify(this.logs));
    } catch (error) {
      console.warn('Failed to persist cache invalidation logs:', error);
    }
  }

  /**
   * Loads persisted logs from localStorage.
   */
  loadPersistedLogs() {
    try {
      const persisted = localStorage.getItem(this.persistenceKey);
      if (persisted) {
        this.logs = JSON.parse(persisted);
      }
    } catch (error) {
      console.warn('Failed to load persisted cache invalidation logs:', error);
    }
  }

  /**
   * Sets the log level.
   * @param {string} level - New log level ('debug', 'info', 'warn', 'error').
   */
  setLogLevel(level) {
    if (['debug', 'info', 'warn', 'error'].includes(level)) {
      this.logLevel = level;
    } else {
      throw new Error(`Invalid log level: ${level}`);
    }
  }

  /**
   * Enables or disables persistence.
   * @param {boolean} enabled - Whether to enable persistence.
   */
  setPersistence(enabled) {
    this.persistenceEnabled = enabled;
    if (enabled) {
      this.persistLogs();
    } else {
      localStorage.removeItem(this.persistenceKey);
    }
  }
}

// Export as default
export default CacheInvalidationLogger;