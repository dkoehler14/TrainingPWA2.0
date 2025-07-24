export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class EdgeFunctionLogger {
  private context: string
  private startTime: number

  constructor(context: string) {
    this.context = context
    this.startTime = Date.now()
  }

  private log(level: LogLevel, message: string, data?: any) {
    const timestamp = new Date().toISOString()
    const elapsed = Date.now() - this.startTime
    
    const logEntry = {
      timestamp,
      elapsed,
      level: LogLevel[level],
      context: this.context,
      message,
      data
    }

    // In Deno, console methods are available
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`[DEBUG] ${this.context} (+${elapsed}ms): ${message}`, data || '')
        break
      case LogLevel.INFO:
        console.info(`[INFO] ${this.context} (+${elapsed}ms): ${message}`, data || '')
        break
      case LogLevel.WARN:
        console.warn(`[WARN] ${this.context} (+${elapsed}ms): ${message}`, data || '')
        break
      case LogLevel.ERROR:
        console.error(`[ERROR] ${this.context} (+${elapsed}ms): ${message}`, data || '')
        break
    }

    // In production, you might want to send logs to an external service
    if (Deno.env.get('ENVIRONMENT') === 'production') {
      // Send to logging service
      this.sendToLoggingService(logEntry)
    }
  }

  debug(message: string, data?: any) {
    this.log(LogLevel.DEBUG, message, data)
  }

  info(message: string, data?: any) {
    this.log(LogLevel.INFO, message, data)
  }

  warn(message: string, data?: any) {
    this.log(LogLevel.WARN, message, data)
  }

  error(message: string, data?: any) {
    this.log(LogLevel.ERROR, message, data)
  }

  private async sendToLoggingService(logEntry: any) {
    // Implement external logging service integration
    // For example, send to Supabase logs table or external service
    try {
      // Example: Send to Supabase logs table
      // await supabaseClient.from('function_logs').insert(logEntry)
    } catch (error) {
      console.error('Failed to send log to external service:', error)
    }
  }
}

export function createLogger(context: string): EdgeFunctionLogger {
  return new EdgeFunctionLogger(context)
}