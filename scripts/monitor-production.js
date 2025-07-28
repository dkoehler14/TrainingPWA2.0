#!/usr/bin/env node

/**
 * Production Monitoring Script
 * 
 * This script monitors the production Supabase environment and sends alerts
 * when issues are detected. It can be run as a cron job or continuous service.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const MONITORING_CONFIG = {
  // Health check intervals (in milliseconds)
  healthCheckInterval: 5 * 60 * 1000, // 5 minutes
  
  // Alert thresholds
  thresholds: {
    responseTime: 5000, // 5 seconds
    errorRate: 0.05, // 5%
    memoryUsage: 0.8, // 80%
    connectionCount: 80 // 80% of max connections
  },
  
  // Notification settings
  notifications: {
    email: process.env.ALERT_EMAIL,
    webhook: process.env.ALERT_WEBHOOK_URL,
    slack: process.env.SLACK_WEBHOOK_URL
  },
  
  // Logging
  logFile: 'logs/production-monitoring.log',
  retentionDays: 30
};

class ProductionMonitor {
  constructor() {
    this.isRunning = false;
    this.healthHistory = [];
    this.alertHistory = [];
    this.setupLogging();
  }

  setupLogging() {
    const logDir = path.dirname(MONITORING_CONFIG.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
    
    console.log(logEntry.trim());
    
    try {
      fs.appendFileSync(MONITORING_CONFIG.logFile, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  async checkHealth() {
    try {
      // Import production health check
      const { checkProductionHealth } = require('../src/config/production.js');
      
      const startTime = Date.now();
      const health = await checkProductionHealth();
      const responseTime = Date.now() - startTime;
      
      // Add response time to health data
      health.responseTime = responseTime;
      health.timestamp = new Date().toISOString();
      
      // Store health history (keep last 100 entries)
      this.healthHistory.push(health);
      if (this.healthHistory.length > 100) {
        this.healthHistory.shift();
      }
      
      return health;
    } catch (error) {
      this.log(`Health check failed: ${error.message}`, 'error');
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
        responseTime: null
      };
    }
  }

  analyzeHealth(health) {
    const issues = [];
    const warnings = [];
    
    // Check overall status
    if (health.status !== 'healthy') {
      issues.push({
        type: 'service_down',
        message: `Service is ${health.status}`,
        severity: 'critical',
        details: health.error
      });
    }
    
    // Check response time
    if (health.responseTime && health.responseTime > MONITORING_CONFIG.thresholds.responseTime) {
      issues.push({
        type: 'slow_response',
        message: `Slow response time: ${health.responseTime}ms`,
        severity: 'warning',
        details: { responseTime: health.responseTime, threshold: MONITORING_CONFIG.thresholds.responseTime }
      });
    }
    
    // Check individual services
    if (health.services) {
      if (health.services.database && health.services.database.status !== 'healthy') {
        issues.push({
          type: 'database_issue',
          message: `Database is ${health.services.database.status}`,
          severity: 'high',
          details: health.services.database.error
        });
      }
      
      if (health.services.auth && health.services.auth.status !== 'healthy') {
        issues.push({
          type: 'auth_issue',
          message: `Authentication service is ${health.services.auth.status}`,
          severity: 'high',
          details: health.services.auth.error
        });
      }
    }
    
    // Check performance trends
    if (this.healthHistory.length >= 5) {
      const recentChecks = this.healthHistory.slice(-5);
      const avgResponseTime = recentChecks
        .filter(h => h.responseTime)
        .reduce((sum, h) => sum + h.responseTime, 0) / recentChecks.length;
      
      if (avgResponseTime > MONITORING_CONFIG.thresholds.responseTime * 0.8) {
        warnings.push({
          type: 'performance_degradation',
          message: `Average response time trending high: ${avgResponseTime.toFixed(0)}ms`,
          severity: 'warning',
          details: { avgResponseTime, threshold: MONITORING_CONFIG.thresholds.responseTime }
        });
      }
    }
    
    return { issues, warnings };
  }

  async sendAlert(alert) {
    const alertId = `${alert.type}_${Date.now()}`;
    
    // Check if we've already sent this type of alert recently (avoid spam)
    const recentAlerts = this.alertHistory.filter(
      a => a.type === alert.type && Date.now() - a.timestamp < 30 * 60 * 1000 // 30 minutes
    );
    
    if (recentAlerts.length > 0 && alert.severity !== 'critical') {
      this.log(`Suppressing duplicate alert: ${alert.type}`, 'debug');
      return;
    }
    
    // Store alert in history
    this.alertHistory.push({
      ...alert,
      id: alertId,
      timestamp: Date.now()
    });
    
    // Keep alert history manageable
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-500);
    }
    
    this.log(`Sending alert: ${alert.message}`, 'warn');
    
    // Send notifications
    await this.sendNotifications(alert);
  }

  async sendNotifications(alert) {
    const message = this.formatAlertMessage(alert);
    
    // Console notification (always)
    console.error(`🚨 ALERT: ${message}`);
    
    // Webhook notification
    if (MONITORING_CONFIG.notifications.webhook) {
      try {
        const response = await fetch(MONITORING_CONFIG.notifications.webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            severity: alert.severity,
            timestamp: new Date().toISOString(),
            details: alert.details
          })
        });
        
        if (response.ok) {
          this.log('Webhook notification sent successfully', 'debug');
        } else {
          this.log(`Webhook notification failed: ${response.status}`, 'error');
        }
      } catch (error) {
        this.log(`Webhook notification error: ${error.message}`, 'error');
      }
    }
    
    // Slack notification
    if (MONITORING_CONFIG.notifications.slack) {
      try {
        const slackMessage = {
          text: `🚨 Production Alert`,
          attachments: [{
            color: this.getSeverityColor(alert.severity),
            fields: [
              { title: 'Message', value: alert.message, short: false },
              { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
              { title: 'Type', value: alert.type, short: true },
              { title: 'Time', value: new Date().toISOString(), short: true }
            ]
          }]
        };
        
        const response = await fetch(MONITORING_CONFIG.notifications.slack, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackMessage)
        });
        
        if (response.ok) {
          this.log('Slack notification sent successfully', 'debug');
        } else {
          this.log(`Slack notification failed: ${response.status}`, 'error');
        }
      } catch (error) {
        this.log(`Slack notification error: ${error.message}`, 'error');
      }
    }
  }

  formatAlertMessage(alert) {
    return `${alert.message} (Severity: ${alert.severity})`;
  }

  getSeverityColor(severity) {
    const colors = {
      critical: 'danger',
      high: 'warning',
      warning: 'warning',
      low: 'good'
    };
    return colors[severity] || 'good';
  }

  async runHealthCheck() {
    this.log('Running health check...', 'debug');
    
    const health = await this.checkHealth();
    const analysis = this.analyzeHealth(health);
    
    // Log health status
    if (health.status === 'healthy') {
      this.log(`Health check passed (${health.responseTime}ms)`, 'info');
    } else {
      this.log(`Health check failed: ${health.error}`, 'error');
    }
    
    // Process issues
    for (const issue of analysis.issues) {
      await this.sendAlert(issue);
    }
    
    // Process warnings
    for (const warning of analysis.warnings) {
      await this.sendAlert(warning);
    }
    
    return { health, analysis };
  }

  async start() {
    if (this.isRunning) {
      this.log('Monitor is already running', 'warn');
      return;
    }
    
    this.isRunning = true;
    this.log('Starting production monitoring...', 'info');
    
    // Initial health check
    await this.runHealthCheck();
    
    // Set up periodic health checks
    this.healthCheckTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.runHealthCheck();
      }
    }, MONITORING_CONFIG.healthCheckInterval);
    
    // Set up log cleanup
    this.logCleanupTimer = setInterval(() => {
      this.cleanupLogs();
    }, 24 * 60 * 60 * 1000); // Daily
    
    this.log(`Monitoring started with ${MONITORING_CONFIG.healthCheckInterval / 1000}s interval`, 'info');
  }

  stop() {
    if (!this.isRunning) {
      this.log('Monitor is not running', 'warn');
      return;
    }
    
    this.isRunning = false;
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    
    if (this.logCleanupTimer) {
      clearInterval(this.logCleanupTimer);
    }
    
    this.log('Production monitoring stopped', 'info');
  }

  cleanupLogs() {
    try {
      const logFile = MONITORING_CONFIG.logFile;
      if (!fs.existsSync(logFile)) return;
      
      const stats = fs.statSync(logFile);
      const ageInDays = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
      
      if (ageInDays > MONITORING_CONFIG.retentionDays) {
        // Archive old log
        const archiveName = `${logFile}.${new Date().toISOString().split('T')[0]}`;
        fs.renameSync(logFile, archiveName);
        this.log(`Archived old log file: ${archiveName}`, 'info');
      }
    } catch (error) {
      this.log(`Log cleanup failed: ${error.message}`, 'error');
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      healthHistoryCount: this.healthHistory.length,
      alertHistoryCount: this.alertHistory.length,
      lastHealthCheck: this.healthHistory.length > 0 ? this.healthHistory[this.healthHistory.length - 1] : null,
      recentAlerts: this.alertHistory.slice(-10)
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'start';
  
  const monitor = new ProductionMonitor();
  
  switch (command) {
    case 'start':
      await monitor.start();
      
      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log('\nReceived SIGINT, shutting down gracefully...');
        monitor.stop();
        process.exit(0);
      });
      
      process.on('SIGTERM', () => {
        console.log('\nReceived SIGTERM, shutting down gracefully...');
        monitor.stop();
        process.exit(0);
      });
      
      // Keep the process running
      process.stdin.resume();
      break;
      
    case 'check':
      const result = await monitor.runHealthCheck();
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.health.status === 'healthy' ? 0 : 1);
      break;
      
    case 'status':
      const status = monitor.getStatus();
      console.log(JSON.stringify(status, null, 2));
      break;
      
    default:
      console.log(`
Usage: node scripts/monitor-production.js [command]

Commands:
  start   - Start continuous monitoring (default)
  check   - Run a single health check
  status  - Show monitor status

Environment Variables:
  ALERT_EMAIL         - Email address for alerts
  ALERT_WEBHOOK_URL   - Webhook URL for alerts
  SLACK_WEBHOOK_URL   - Slack webhook URL for alerts
      `);
      break;
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Monitor failed:', error);
    process.exit(1);
  });
}

module.exports = ProductionMonitor;