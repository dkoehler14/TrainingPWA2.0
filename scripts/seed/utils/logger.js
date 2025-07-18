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
    warning: '⚠️',
    start: '🚀',
    complete: '🎉'
  };

  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warning: '\x1b[33m', // Yellow
    start: '\x1b[35m',   // Magenta
    complete: '\x1b[32m', // Green
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

/**
 * Create a progress bar for long-running operations
 * @param {number} current - Current progress value
 * @param {number} total - Total progress value
 * @param {string} label - Label for the progress bar
 * @param {number} width - Width of the progress bar (default: 30)
 */
function logProgressBar(current, total, label = '', width = 30) {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const empty = width - filled;
  
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const progress = `[${bar}] ${percentage}% (${current}/${total})`;
  
  if (label) {
    process.stdout.write(`\r🔄 ${label}: ${progress}`);
  } else {
    process.stdout.write(`\r${progress}`);
  }
  
  if (current === total) {
    console.log(''); // New line when complete
  }
}

/**
 * Log a step in a multi-step process
 * @param {number} step - Current step number
 * @param {number} totalSteps - Total number of steps
 * @param {string} description - Description of the current step
 */
function logStep(step, totalSteps, description) {
  const stepIndicator = `[${step}/${totalSteps}]`;
  logProgress(`${stepIndicator} ${description}`, 'info');
}

/**
 * Log a summary table
 * @param {string} title - Title of the summary
 * @param {Object} data - Key-value pairs to display
 */
function logSummary(title, data) {
  console.log(`\n📊 ${title}`);
  console.log('─'.repeat(50));
  
  Object.entries(data).forEach(([key, value]) => {
    const formattedKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
    console.log(`  ${formattedKey}: ${value}`);
  });
}

/**
 * Log user credentials in a formatted table
 * @param {Array} users - Array of user objects with email and scenario info
 */
function logUserCredentials(users) {
  console.log('\n📧 Test User Credentials:');
  console.log('─'.repeat(70));
  console.log('  Email                    | Scenario      | Password');
  console.log('─'.repeat(70));
  
  users.forEach(user => {
    const email = user.email.padEnd(24);
    const scenario = (user.scenarioName || user.scenario || 'Unknown').padEnd(13);
    console.log(`  ${email} | ${scenario} | test123`);
  });
  
  console.log('─'.repeat(70));
}

/**
 * Log operation timing information
 * @param {string} operation - Name of the operation
 * @param {number} startTime - Start time in milliseconds
 * @param {number} endTime - End time in milliseconds (optional, defaults to now)
 */
function logTiming(operation, startTime, endTime = Date.now()) {
  const duration = ((endTime - startTime) / 1000).toFixed(2);
  logProgress(`${operation} completed in ${duration}s`, 'success');
}

/**
 * Log error with helpful context
 * @param {Error} error - The error object
 * @param {string} context - Additional context about where the error occurred
 * @param {boolean} verbose - Whether to show full stack trace
 */
function logError(error, context = '', verbose = false) {
  if (context) {
    logProgress(`Error in ${context}: ${error.message}`, 'error');
  } else {
    logProgress(`Error: ${error.message}`, 'error');
  }
  
  if (verbose && error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }
}

module.exports = {
  logProgress,
  logSection,
  logProgressBar,
  logStep,
  logSummary,
  logUserCredentials,
  logTiming,
  logError
};