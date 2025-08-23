/**
 * Batch Processing Utility
 * 
 * Provides utilities for processing large datasets in batches with progress tracking.
 */

class BatchProcessor {
  constructor(options = {}) {
    this.options = {
      batchSize: options.batchSize || 100,
      verbose: options.verbose || false,
      ...options
    };
  }

  async processInBatches(items, processorFn) {
    const totalItems = items.length;
    const batchSize = this.options.batchSize;
    let processedCount = 0;

    if (this.options.verbose) {
      console.log(`   Processing ${totalItems} items in batches of ${batchSize}`);
    }

    for (let i = 0; i < totalItems; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      try {
        await processorFn(batch);
        processedCount += batch.length;
        
        if (this.options.verbose && totalItems > batchSize) {
          const percentage = ((processedCount / totalItems) * 100).toFixed(1);
          console.log(`   Processed ${processedCount}/${totalItems} items (${percentage}%)`);
        }
      } catch (error) {
        console.error(`   ❌ Batch processing error at items ${i}-${i + batch.length - 1}:`, error.message);
        throw error;
      }
    }

    return processedCount;
  }
}

module.exports = { BatchProcessor };