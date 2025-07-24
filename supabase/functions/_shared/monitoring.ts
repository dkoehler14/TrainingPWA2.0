import { createSupabaseClient } from './database.ts'

export interface PerformanceMetric {
  function_name: string
  execution_time_ms: number
  memory_usage_mb?: number
  success: boolean
  error_message?: string
  user_id?: string
  timestamp: string
}

export class PerformanceMonitor {
  private functionName: string
  private startTime: number
  private startMemory?: number

  constructor(functionName: string) {
    this.functionName = functionName
    this.startTime = performance.now()
    
    // Memory usage tracking (if available in Deno)
    if ('memoryUsage' in Deno) {
      this.startMemory = (Deno as any).memoryUsage().rss
    }
  }

  async recordMetric(success: boolean, userId?: string, errorMessage?: string) {
    const executionTime = performance.now() - this.startTime
    let memoryUsage: number | undefined

    if (this.startMemory && 'memoryUsage' in Deno) {
      const currentMemory = (Deno as any).memoryUsage().rss
      memoryUsage = (currentMemory - this.startMemory) / 1024 / 1024 // Convert to MB
    }

    const metric: PerformanceMetric = {
      function_name: this.functionName,
      execution_time_ms: Math.round(executionTime),
      memory_usage_mb: memoryUsage,
      success,
      error_message: errorMessage,
      user_id: userId,
      timestamp: new Date().toISOString()
    }

    // Log the metric
    console.log(`Performance: ${this.functionName} - ${executionTime.toFixed(2)}ms`, {
      success,
      memoryUsage: memoryUsage ? `${memoryUsage.toFixed(2)}MB` : 'N/A',
      userId
    })

    // Store metric in database (optional)
    try {
      const supabaseClient = createSupabaseClient()
      await supabaseClient
        .from('function_performance_metrics')
        .insert(metric)
    } catch (error) {
      console.warn('Failed to store performance metric:', error)
    }

    return metric
  }
}

export function createPerformanceMonitor(functionName: string): PerformanceMonitor {
  return new PerformanceMonitor(functionName)
}

export async function healthCheck(): Promise<{ status: string; timestamp: string; version?: string }> {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: Deno.env.get('FUNCTION_VERSION') || '1.0.0'
  }
}