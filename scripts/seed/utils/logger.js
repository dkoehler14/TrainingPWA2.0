/**
 * Logging utilities for seeding operations
 * 
 * This module provides consistent logging functionality for the seeding process.
 */

/**
 * Log progress messages with consistent formatting
 * @param {string} message - The message to log
 * @param {string} type - The type of message (info, success, error, warning)
 */
function logProgress(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const icons = {
    info: '🔄',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  };

  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    reset: '\x1b[0m'     // Reset
  };

  const icon = icons[type] || icons.info;
  const color = colors[type] || colors.info;
  
  console.log(`${color}${icon} [${timestamp}] ${message}${colors.reset}`);
}

/**
 * Log a section header
 * @param {string} title - The section title
 */
function logSection(title) {
  console.log('\n' + '='.repeat(50));
  console.log(`🌱 ${title}`);
  console.log('='.repeat(50));
}

module.exports = {
  logProgress,
  logSection
};