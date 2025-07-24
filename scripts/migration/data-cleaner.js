#!/usr/bin/env node

/**
 * Data Cleaning and Normalization Utility
 * 
 * This utility provides advanced data cleaning and normalization functions
 * for preparing Firestore data for PostgreSQL migration.
 * 
 * Features:
 * - Data type validation and conversion
 * - String normalization and sanitization
 * - Duplicate detection and removal
 * - Data consistency checks
 * - Missing value handling
 * - Outlier detection and handling
 */

const fs = require('fs').promises;
const path = require('path');

class DataCleaner {
  constructor(options = {}) {
    this.options = {
      removeOutliers: options.removeOutliers || false,
      outlierThreshold: options.outlierThreshold || 3, // Standard deviations
      handleMissingValues: options.handleMissingValues || 'keep', // 'keep', 'remove', 'default'
      normalizeStrings: options.normalizeStrings || true,
      removeDuplicates: options.removeDuplicates || true,
      validateTypes: options.validateTypes || true,
      verbose: options.verbose || false,
      ...options
    };
    
    this.stats = {
      totalRecords: 0,
      cleanedRecords: 0,
      removedRecords: 0,
      normalizedFields: 0,
      removedDuplicates: 0,
      handledMissingValues: 0,
      removedOutliers: 0,
      typeConversions: 0
    };
    
    this.issues = {
      duplicates: [],
      outliers: [],
      missingValues: [],
      typeErrors: [],
      validationErrors: []
    };
  }

  async cleanData(data, schema) {
    console.log(`🧹 Starting data cleaning for ${Object.keys(data).length} collections...`);
    
    const cleanedData = {};
    
    for (const [collection, records] of Object.entries(data)) {
      if (records && records.length > 0) {
        console.log(`\n📋 Cleaning ${collection} (${records.length} records)...`);
        cleanedData[collection] = await this.cleanCollection(collection, records, schema[collection]);
      }
    }
    
    this.printSummary();
    return cleanedData;
  }

  async cleanCollection(collectionName, records, schema) {
    this.stats.totalRecords += records.length;
    
    let cleanedRecords = [...records];
    
    // Step 1: Remove duplicates
    if (this.options.removeDuplicates) {
      cleanedRecords = this.removeDuplicates(collectionName, cleanedRecords);
    }
    
    // Step 2: Clean individual records
    cleanedRecords = cleanedRecords.map((record, index) => {
      try {
        return this.cleanRecord(collectionName, record, schema, index);
      } catch (error) {
        this.issues.validationErrors.push({
          collection: collectionName,
          recordId: record.id,
          error: error.message
        });
        return null;
      }
    }).filter(record => record !== null);
    
    // Step 3: Remove outliers
    if (this.options.removeOutliers && schema) {
      cleanedRecords = this.removeOutliers(collectionName, cleanedRecords, schema);
    }
    
    // Step 4: Handle missing values
    if (this.options.handleMissingValues !== 'keep') {
      cleanedRecords = this.handleMissingValues(collectionName, cleanedRecords, schema);
    }
    
    this.stats.cleanedRecords += cleanedRecords.length;
    this.stats.removedRecords += (records.length - cleanedRecords.length);
    
    console.log(`   Cleaned: ${cleanedRecords.length}/${records.length} records`);
    
    return cleanedRecords;
  }

  cleanRecord(collectionName, record, schema, index) {
    const cleanedRecord = { ...record };
    
    if (!schema || !schema.columns) {
      return cleanedRecord;
    }
    
    for (const [fieldName, fieldSchema] of Object.entries(schema.columns)) {
      const value = cleanedRecord[fieldName];
      
      try {
        // Skip system fields that are auto-generated
        if (fieldSchema.default && (value === undefined || value === null)) {
          continue;
        }
        
        // Clean based on field type
        const cleanedValue = this.cleanField(value, fieldSchema, fieldName, collectionName);
        
        if (cleanedValue !== value) {
          cleanedRecord[fieldName] = cleanedValue;
          this.stats.normalizedFields++;
        }
        
        // Validate required fields
        if (fieldSchema.required && (cleanedValue === null || cleanedValue === undefined)) {
          throw new Error(`Required field ${fieldName} is missing or null`);
        }
        
      } catch (error) {
        this.issues.validationErrors.push({
          collection: collectionName,
          recordId: record.id,
          field: fieldName,
          value: value,
          error: error.message
        });
        
        // Handle based on field requirement
        if (fieldSchema.required) {
          throw error; // This will cause the record to be filtered out
        } else {
          cleanedRecord[fieldName] = null;
        }
      }
    }
    
    return cleanedRecord;
  }

  cleanField(value, fieldSchema, fieldName, collectionName) {
    if (value === null || value === undefined) {
      return null;
    }
    
    const fieldType = fieldSchema.type.toUpperCase();
    
    try {
      switch (true) {
        case fieldType.includes('VARCHAR'):
        case fieldType.includes('TEXT'):
          return this.cleanString(value, fieldSchema);
          
        case fieldType.includes('INTEGER'):
          return this.cleanInteger(value);
          
        case fieldType.includes('DECIMAL'):
        case fieldType.includes('NUMERIC'):
          return this.cleanDecimal(value);
          
        case fieldType.includes('BOOLEAN'):
          return this.cleanBoolean(value);
          
        case fieldType.includes('DATE'):
          return this.cleanDate(value);
          
        case fieldType.includes('TIMESTAMP'):
          return this.cleanTimestamp(value);
          
        case fieldType.includes('UUID'):
          return this.cleanUUID(value);
          
        case fieldType.includes('JSONB'):
        case fieldType.includes('JSON'):
          return this.cleanJSON(value);
          
        case fieldType.includes('[]'): // Array types
          return this.cleanArray(value, fieldType);
          
        default:
          return value;
      }
    } catch (error) {
      throw new Error(`Failed to clean ${fieldName}: ${error.message}`);
    }
  }

  cleanString(value, fieldSchema) {
    if (typeof value !== 'string') {
      if (value === null || value === undefined) return null;
      value = String(value);
      this.stats.typeConversions++;
    }
    
    if (!this.options.normalizeStrings) {
      return value;
    }
    
    // Normalize string
    let cleaned = value.trim();
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ');
    
    // Handle empty strings
    if (cleaned === '') {
      return null;
    }
    
    // Check length constraints
    if (fieldSchema.type.includes('VARCHAR')) {
      const match = fieldSchema.type.match(/VARCHAR\((\d+)\)/);
      if (match) {
        const maxLength = parseInt(match[1]);
        if (cleaned.length > maxLength) {
          cleaned = cleaned.substring(0, maxLength);
          this.issues.validationErrors.push({
            type: 'truncation',
            field: fieldSchema,
            originalLength: value.length,
            truncatedLength: maxLength
          });
        }
      }
    }
    
    return cleaned;
  }

  cleanInteger(value) {
    if (typeof value === 'number' && Number.isInteger(value)) {
      return value;
    }
    
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) {
        this.stats.typeConversions++;
        return parsed;
      }
    }
    
    if (value === null || value === undefined) {
      return null;
    }
    
    throw new Error(`Cannot convert to integer: ${value}`);
  }

  cleanDecimal(value) {
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        this.stats.typeConversions++;
        return parsed;
      }
    }
    
    if (value === null || value === undefined) {
      return null;
    }
    
    throw new Error(`Cannot convert to decimal: ${value}`);
  }

  cleanBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    
    if (typeof value === 'string') {
      const lower = value.toLowerCase().trim();
      if (['true', '1', 'yes', 'on'].includes(lower)) {
        this.stats.typeConversions++;
        return true;
      }
      if (['false', '0', 'no', 'off'].includes(lower)) {
        this.stats.typeConversions++;
        return false;
      }
    }
    
    if (typeof value === 'number') {
      this.stats.typeConversions++;
      return Boolean(value);
    }
    
    if (value === null || value === undefined) {
      return null;
    }
    
    throw new Error(`Cannot convert to boolean: ${value}`);
  }

  cleanDate(value) {
    if (value === null || value === undefined) {
      return null;
    }
    
    // Handle Firestore Timestamp
    if (value && typeof value === 'object' && value.seconds) {
      const date = new Date(value.seconds * 1000);
      return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
    
    // Handle Date object
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new Error('Invalid date object');
      }
      return value.toISOString().split('T')[0];
    }
    
    // Handle string
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date string: ${value}`);
      }
      this.stats.typeConversions++;
      return date.toISOString().split('T')[0];
    }
    
    throw new Error(`Cannot convert to date: ${value}`);
  }

  cleanTimestamp(value) {
    if (value === null || value === undefined) {
      return null;
    }
    
    // Handle Firestore Timestamp
    if (value && typeof value === 'object' && value.seconds) {
      const date = new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1000000);
      return date.toISOString();
    }
    
    // Handle Date object
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        throw new Error('Invalid date object');
      }
      return value.toISOString();
    }
    
    // Handle string
    if (typeof value === 'string') {
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid timestamp string: ${value}`);
      }
      this.stats.typeConversions++;
      return date.toISOString();
    }
    
    throw new Error(`Cannot convert to timestamp: ${value}`);
  }

  cleanUUID(value) {
    if (typeof value !== 'string') {
      if (value === null || value === undefined) return null;
      throw new Error(`UUID must be a string: ${value}`);
    }
    
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(value)) {
      throw new Error(`Invalid UUID format: ${value}`);
    }
    
    return value.toLowerCase();
  }

  cleanJSON(value) {
    if (value === null || value === undefined) {
      return null;
    }
    
    if (typeof value === 'object') {
      return value;
    }
    
    if (typeof value === 'string') {
      try {
        this.stats.typeConversions++;
        return JSON.parse(value);
      } catch (error) {
        throw new Error(`Invalid JSON string: ${value}`);
      }
    }
    
    throw new Error(`Cannot convert to JSON: ${value}`);
  }

  cleanArray(value, fieldType) {
    if (value === null || value === undefined) {
      return null;
    }
    
    if (!Array.isArray(value)) {
      throw new Error(`Expected array, got: ${typeof value}`);
    }
    
    // Determine array element type
    const elementType = fieldType.replace('[]', '').trim();
    
    const cleanedArray = value.map(item => {
      switch (elementType.toUpperCase()) {
        case 'TEXT':
        case 'VARCHAR':
          return this.cleanString(item, { type: elementType });
        case 'INTEGER':
          return this.cleanInteger(item);
        case 'DECIMAL':
          return this.cleanDecimal(item);
        case 'BOOLEAN':
          return this.cleanBoolean(item);
        default:
          return item;
      }
    }).filter(item => item !== null && item !== undefined);
    
    return cleanedArray.length > 0 ? cleanedArray : null;
  }

  removeDuplicates(collectionName, records) {
    const seen = new Set();
    const duplicates = [];
    
    const uniqueRecords = records.filter(record => {
      // Create a key based on important fields (excluding timestamps and IDs)
      const key = this.createDuplicateKey(record, collectionName);
      
      if (seen.has(key)) {
        duplicates.push(record);
        return false;
      }
      
      seen.add(key);
      return true;
    });
    
    if (duplicates.length > 0) {
      this.stats.removedDuplicates += duplicates.length;
      this.issues.duplicates.push({
        collection: collectionName,
        count: duplicates.length,
        examples: duplicates.slice(0, 3).map(d => d.id)
      });
      
      if (this.options.verbose) {
        console.log(`   Removed ${duplicates.length} duplicate records`);
      }
    }
    
    return uniqueRecords;
  }

  createDuplicateKey(record, collectionName) {
    // Define key fields for each collection type
    const keyFields = {
      users: ['email'],
      exercises: ['name', 'primary_muscle_group', 'exercise_type'],
      programs: ['user_id', 'name'],
      workout_logs: ['user_id', 'date', 'name'],
      user_analytics: ['user_id', 'exercise_id']
    };
    
    const fields = keyFields[collectionName] || ['id'];
    
    return fields.map(field => {
      const value = record[field];
      return value ? String(value).toLowerCase().trim() : '';
    }).join('|');
  }

  removeOutliers(collectionName, records, schema) {
    if (!schema || !schema.columns) {
      return records;
    }
    
    const numericFields = Object.entries(schema.columns)
      .filter(([_, fieldSchema]) => 
        fieldSchema.type.includes('INTEGER') || 
        fieldSchema.type.includes('DECIMAL') ||
        fieldSchema.type.includes('NUMERIC')
      )
      .map(([fieldName]) => fieldName);
    
    if (numericFields.length === 0) {
      return records;
    }
    
    const outliers = [];
    
    for (const field of numericFields) {
      const values = records
        .map(r => r[field])
        .filter(v => v !== null && v !== undefined && typeof v === 'number');
      
      if (values.length < 10) continue; // Need sufficient data for outlier detection
      
      const { mean, stdDev } = this.calculateStats(values);
      const threshold = this.options.outlierThreshold * stdDev;
      
      records.forEach(record => {
        const value = record[field];
        if (typeof value === 'number' && Math.abs(value - mean) > threshold) {
          outliers.push({
            collection: collectionName,
            recordId: record.id,
            field,
            value,
            mean,
            stdDev,
            threshold
          });
        }
      });
    }
    
    if (outliers.length > 0) {
      this.issues.outliers.push(...outliers);
      
      // Remove records with outliers
      const outlierRecordIds = new Set(outliers.map(o => o.recordId));
      const filteredRecords = records.filter(r => !outlierRecordIds.has(r.id));
      
      this.stats.removedOutliers += outliers.length;
      
      if (this.options.verbose) {
        console.log(`   Removed ${outliers.length} outlier values`);
      }
      
      return filteredRecords;
    }
    
    return records;
  }

  calculateStats(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return { mean, stdDev, variance };
  }

  handleMissingValues(collectionName, records, schema) {
    if (this.options.handleMissingValues === 'keep') {
      return records;
    }
    
    if (this.options.handleMissingValues === 'remove') {
      // Remove records with missing required fields
      return records.filter(record => {
        if (!schema || !schema.columns) return true;
        
        for (const [fieldName, fieldSchema] of Object.entries(schema.columns)) {
          if (fieldSchema.required && (record[fieldName] === null || record[fieldName] === undefined)) {
            this.stats.handledMissingValues++;
            return false;
          }
        }
        return true;
      });
    }
    
    if (this.options.handleMissingValues === 'default') {
      // Fill missing values with defaults
      return records.map(record => {
        if (!schema || !schema.columns) return record;
        
        const updatedRecord = { ...record };
        
        for (const [fieldName, fieldSchema] of Object.entries(schema.columns)) {
          if ((record[fieldName] === null || record[fieldName] === undefined) && fieldSchema.default) {
            updatedRecord[fieldName] = this.getDefaultValue(fieldSchema);
            this.stats.handledMissingValues++;
          }
        }
        
        return updatedRecord;
      });
    }
    
    return records;
  }

  getDefaultValue(fieldSchema) {
    const defaultValue = fieldSchema.default;
    
    if (defaultValue === 'NOW()') {
      return new Date().toISOString();
    }
    
    if (defaultValue === 'gen_random_uuid()') {
      return this.generateUUID();
    }
    
    if (defaultValue === '{}') {
      return {};
    }
    
    if (defaultValue === 'false') {
      return false;
    }
    
    if (defaultValue === 'true') {
      return true;
    }
    
    if (defaultValue === '0') {
      return 0;
    }
    
    return defaultValue;
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  printSummary() {
    console.log('\n🧹 Data Cleaning Summary:');
    console.log('='.repeat(50));
    console.log(`Total Records: ${this.stats.totalRecords}`);
    console.log(`Cleaned Records: ${this.stats.cleanedRecords}`);
    console.log(`Removed Records: ${this.stats.removedRecords}`);
    console.log(`Normalized Fields: ${this.stats.normalizedFields}`);
    console.log(`Removed Duplicates: ${this.stats.removedDuplicates}`);
    console.log(`Handled Missing Values: ${this.stats.handledMissingValues}`);
    console.log(`Removed Outliers: ${this.stats.removedOutliers}`);
    console.log(`Type Conversions: ${this.stats.typeConversions}`);
    
    if (this.issues.validationErrors.length > 0) {
      console.log(`\n⚠️ Validation Errors: ${this.issues.validationErrors.length}`);
    }
    
    if (this.issues.duplicates.length > 0) {
      console.log(`📋 Duplicate Issues: ${this.issues.duplicates.length} collections affected`);
    }
    
    if (this.issues.outliers.length > 0) {
      console.log(`📊 Outliers Detected: ${this.issues.outliers.length}`);
    }
  }

  getCleaningReport() {
    return {
      stats: this.stats,
      issues: this.issues,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { DataCleaner };