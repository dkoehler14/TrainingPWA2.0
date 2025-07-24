#!/usr/bin/env node

/**
 * Batch Processor Utility
 * 
 * This utility provides batch processing capabilities for large dataset operations
 * with progress tracking, error recovery, and memory management.
 * 
 * Features:
 * - Configurable batch sizes
 * - Progress tracking with ETA
 * - Error recovery and retry logic
 * - Memory usage monitoring
 * - Parallel processing support
 * - Resume from checkpoint support
 */

const fs = require('fs').promises;
const path = require('path');
const { performance } = require('perf_hooks');

class BatchProcessor {
  constructor(options = {}) {
    this.options = {
      batchSize: options.batchSize || 100,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      parallelBatches: options.parallelBatches || 1,
      memoryThreshold: options.memoryThreshold || 500 * 1024 * 1024, // 500MB
      checkpointInterval: options.checkpointInterval || 10, // Every 10 batches
      checkpointFile: options.checkpointFile || './batch-checkpoint.json',
      verbose: options.verbose || false,
      ...options
    };
    
    this.stats = {
      startTime: Date.now(),
      totalItems: 0,
      processedItems: 0,
      successfulItems: 0,
      failedItems: 0,
      batchesProcessed: 0,
      batchesFailed: 0,
      retries: 0,
      averageProcessingTime: 0,
      memoryUsage: [],
      errors: []
    };
    
    this.checkpoint = {
      lastProcessedIndex: -1,
      processedBatches: 0,
      timestamp: null
    };
  }

  async processInBatches(items, processorFn, options = {}) {
    this.stats.totalItems = items.length;
    this.stats.startTime = Date.now();
    
    console.log(`🚀 Starting batch processing of ${items.length} items`);
    console.log(`   Batch size: ${this.options.batchSize}`);
    console.log(`   Parallel batches: ${this.options.parallelBatches}`);
    console.log(`   Max retries: ${this.options.maxRetries}`);
    
    // Load checkpoint if exists
    await this.loadCheckpoint();
    
    const startIndex = this.checkpoint.lastProcessedIndex + 1;
    const batches = this.createBatches(items.slice(startIndex));
    
    if (startIndex > 0) {
      console.log(`📍 Resuming from checkpoint at index ${startIndex}`);
    }
    
    try {
      if (this.options.parallelBatches > 1) {
        await this.processParallel(batches, processorFn, startIndex);
      } else {
        await this.processSequential(batches, processorFn, startIndex);
      }
      
      // Clean up checkpoint on successful completion
      await this.clearCheckpoint();
      
      console.log('\n✅ Batch processing completed successfully!');
      this.printSummary();
      
    } catch (error) {
      console.error('\n❌ Batch processing failed:', error.message);
      await this.saveCheckpoint();
      throw error;
    }
    
    return this.stats;
  }

  createBatches(items) {
    const batches = [];
    for (let i = 0; i < items.length; i += this.options.batchSize) {
      batches.push(items.slice(i, i + this.options.batchSize));
    }
    return batches;
  }

  async processSequential(batches, processorFn, startIndex) {
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchIndex = i;
      const globalIndex = startIndex + (i * this.options.batchSize);
      
      await this.processBatch(batch, processorFn, batchIndex, globalIndex);
      
      // Memory check
      await this.checkMemoryUsage();
      
      // Checkpoint save
      if ((i + 1) % this.options.checkpointInterval === 0) {
        this.checkpoint.lastProcessedIndex = globalIndex + batch.length - 1;
        this.checkpoint.processedBatches = this.stats.batchesProcessed;
        await this.saveCheckpoint();
      }
      
      // Progress update
      this.updateProgress(i + 1, batches.length);
    }
  }

  async processParallel(batches, processorFn, startIndex) {
    const semaphore = new Semaphore(this.options.parallelBatches);
    const promises = [];
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const batchIndex = i;
      const globalIndex = startIndex + (i * this.options.batchSize);
      
      const promise = semaphore.acquire().then(async (release) => {
        try {
          await this.processBatch(batch, processorFn, batchIndex, globalIndex);
        } finally {
          release();
        }
      });
      
      promises.push(promise);
      
      // Process in chunks to avoid overwhelming memory
      if (promises.length >= this.options.parallelBatches * 2) {
        await Promise.all(promises.splice(0, this.options.parallelBatches));
        
        // Memory check
        await this.checkMemoryUsage();
        
        // Update progress
        this.updateProgress(i + 1 - promises.length, batches.length);
      }
    }
    
    // Process remaining promises
    if (promises.length > 0) {
      await Promise.all(promises);
    }
  }

  async processBatch(batch, processorFn, batchIndex, globalIndex) {
    const batchStartTime = performance.now();
    let retryCount = 0;
    
    while (retryCount <= this.options.maxRetries) {
      try {
        if (this.options.verbose) {
          console.log(`   Processing batch ${batchIndex + 1} (items ${globalIndex + 1}-${globalIndex + batch.length})`);
        }
        
        const results = await processorFn(batch, batchIndex, globalIndex);
        
        // Update stats
        this.stats.batchesProcessed++;
        this.stats.processedItems += batch.length;
        
        if (results && Array.isArray(results)) {
          this.stats.successfulItems += results.filter(r => r.success).length;
          this.stats.failedItems += results.filter(r => !r.success).length;
        } else {
          this.stats.successfulItems += batch.length;
        }
        
        const batchTime = performance.now() - batchStartTime;
        this.updateAverageProcessingTime(batchTime);
        
        return results;
        
      } catch (error) {
        retryCount++;
        this.stats.retries++;
        
        if (retryCount > this.options.maxRetries) {
          this.stats.batchesFailed++;
          this.stats.failedItems += batch.length;
          this.stats.errors.push({
            batchIndex,
            globalIndex,
            error: error.message,
            timestamp: new Date().toISOString()
          });
          
          console.error(`❌ Batch ${batchIndex + 1} failed after ${this.options.maxRetries} retries: ${error.message}`);
          throw error;
        } else {
          console.warn(`⚠️ Batch ${batchIndex + 1} failed, retrying (${retryCount}/${this.options.maxRetries}): ${error.message}`);
          await this.delay(this.options.retryDelay * retryCount);
        }
      }
    }
  }

  updateAverageProcessingTime(batchTime) {
    const alpha = 0.1; // Exponential moving average factor
    if (this.stats.averageProcessingTime === 0) {
      this.stats.averageProcessingTime = batchTime;
    } else {
      this.stats.averageProcessingTime = 
        (alpha * batchTime) + ((1 - alpha) * this.stats.averageProcessingTime);
    }
  }

  updateProgress(completedBatches, totalBatches) {
    const percentage = ((completedBatches / totalBatches) * 100).toFixed(1);
    const elapsed = Date.now() - this.stats.startTime;
    const eta = completedBatches > 0 ? 
      ((elapsed / completedBatches) * (totalBatches - completedBatches)) : 0;
    
    const etaFormatted = this.formatDuration(eta);
    const elapsedFormatted = this.formatDuration(elapsed);
    
    process.stdout.write(`\r📊 Progress: ${percentage}% (${completedBatches}/${totalBatches} batches) | Elapsed: ${elapsedFormatted} | ETA: ${etaFormatted}`);
    
    if (completedBatches === totalBatches) {
      console.log(); // New line after completion
    }
  }

  async checkMemoryUsage() {
    const memUsage = process.memoryUsage();
    this.stats.memoryUsage.push({
      timestamp: Date.now(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    });
    
    // Keep only last 100 memory readings
    if (this.stats.memoryUsage.length > 100) {
      this.stats.memoryUsage = this.stats.memoryUsage.slice(-100);
    }
    
    if (memUsage.heapUsed > this.options.memoryThreshold) {
      console.warn(`⚠️ High memory usage detected: ${this.formatBytes(memUsage.heapUsed)}`);
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        console.log('🗑️ Forced garbage collection');
      }
    }
  }

  async loadCheckpoint() {
    try {
      const checkpointData = await fs.readFile(this.options.checkpointFile, 'utf8');
      this.checkpoint = JSON.parse(checkpointData);
      console.log(`📍 Loaded checkpoint: ${this.checkpoint.processedBatches} batches processed`);
    } catch (error) {
      // No checkpoint file exists, start from beginning
      this.checkpoint = {
        lastProcessedIndex: -1,
        processedBatches: 0,
        timestamp: null
      };
    }
  }

  async saveCheckpoint() {
    this.checkpoint.timestamp = new Date().toISOString();
    const checkpointData = JSON.stringify(this.checkpoint, null, 2);
    
    try {
      await fs.writeFile(this.options.checkpointFile, checkpointData, 'utf8');
      if (this.options.verbose) {
        console.log(`💾 Checkpoint saved: ${this.checkpoint.processedBatches} batches`);
      }
    } catch (error) {
      console.warn(`⚠️ Failed to save checkpoint: ${error.message}`);
    }
  }

  async clearCheckpoint() {
    try {
      await fs.unlink(this.options.checkpointFile);
      if (this.options.verbose) {
        console.log('🗑️ Checkpoint file cleared');
      }
    } catch (error) {
      // File doesn't exist, ignore
    }
  }

  printSummary() {
    const duration = Date.now() - this.stats.startTime;
    const itemsPerSecond = duration > 0 ? 
      ((this.stats.processedItems / (duration / 1000)).toFixed(2)) : 0;
    
    console.log('\n📋 Batch Processing Summary:');
    console.log('='.repeat(50));
    console.log(`Total Duration: ${this.formatDuration(duration)}`);
    console.log(`Total Items: ${this.stats.totalItems}`);
    console.log(`Processed Items: ${this.stats.processedItems}`);
    console.log(`Successful Items: ${this.stats.successfulItems}`);
    console.log(`Failed Items: ${this.stats.failedItems}`);
    console.log(`Batches Processed: ${this.stats.batchesProcessed}`);
    console.log(`Batches Failed: ${this.stats.batchesFailed}`);
    console.log(`Total Retries: ${this.stats.retries}`);
    console.log(`Average Processing Time: ${this.stats.averageProcessingTime.toFixed(2)}ms per batch`);
    console.log(`Processing Rate: ${itemsPerSecond} items/second`);
    
    if (this.stats.memoryUsage.length > 0) {
      const maxMemory = Math.max(...this.stats.memoryUsage.map(m => m.heapUsed));
      console.log(`Peak Memory Usage: ${this.formatBytes(maxMemory)}`);
    }
    
    if (this.stats.errors.length > 0) {
      console.log(`\n❌ Errors (${this.stats.errors.length}):`);
      this.stats.errors.slice(0, 5).forEach(error => {
        console.log(`   Batch ${error.batchIndex + 1}: ${error.error}`);
      });
      
      if (this.stats.errors.length > 5) {
        console.log(`   ... and ${this.stats.errors.length - 5} more errors`);
      }
    }
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Semaphore for controlling parallel execution
class Semaphore {
  constructor(maxConcurrency) {
    this.maxConcurrency = maxConcurrency;
    this.currentConcurrency = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.currentConcurrency < this.maxConcurrency) {
        this.currentConcurrency++;
        resolve(() => this.release());
      } else {
        this.queue.push(() => {
          this.currentConcurrency++;
          resolve(() => this.release());
        });
      }
    });
  }

  release() {
    this.currentConcurrency--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
    }
  }
}

// Example usage and testing
async function exampleUsage() {
  const processor = new BatchProcessor({
    batchSize: 10,
    maxRetries: 2,
    parallelBatches: 2,
    verbose: true
  });
  
  // Example data
  const items = Array.from({ length: 100 }, (_, i) => ({ id: i, value: `item-${i}` }));
  
  // Example processor function
  const processorFn = async (batch, batchIndex, globalIndex) => {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
    
    // Simulate occasional failures
    if (Math.random() < 0.1) {
      throw new Error(`Random failure in batch ${batchIndex}`);
    }
    
    return batch.map(item => ({
      id: item.id,
      success: true,
      processed: true
    }));
  };
  
  try {
    const stats = await processor.processInBatches(items, processorFn);
    console.log('Processing completed:', stats);
  } catch (error) {
    console.error('Processing failed:', error.message);
  }
}

// Run example if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'example') {
    exampleUsage();
  } else {
    console.log(`
Batch Processor Utility

Usage:
  node batch-processor.js example    # Run example usage

This utility provides batch processing capabilities for large datasets.
Import and use the BatchProcessor class in your migration scripts.

Example:
  const { BatchProcessor } = require('./batch-processor');
  
  const processor = new BatchProcessor({
    batchSize: 100,
    maxRetries: 3,
    parallelBatches: 2
  });
  
  await processor.processInBatches(items, processorFunction);
`);
  }
}

module.exports = { BatchProcessor, Semaphore };