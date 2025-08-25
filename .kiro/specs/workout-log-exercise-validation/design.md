# Design Document

## Overview

This design enhances the existing DataTransformer class in `scripts/migration/data-transformer.js` with comprehensive validation for workout_log_exercises data. The enhancement adds validation methods that ensure data integrity for reps, weights, and array consistency while providing detailed reporting and configurable validation behavior.

## Architecture

### Validation Flow
The validation will be integrated into the existing `transformWorkoutLogExercise` method, adding a validation step before the final transformation object is returned. The validation will follow this flow:

1. **Pre-validation**: Check if exercise has required fields (exerciseId, sets)
2. **Array Validation**: Validate and normalize reps, weights, and completed arrays
3. **Data Type Validation**: Ensure all values are of correct types and within valid ranges
4. **Length Consistency**: Ensure all arrays match the sets count
5. **Post-validation**: Generate warnings/errors and update statistics

### Integration Points
- **DataTransformer.transformWorkoutLogExercise()**: Main integration point for validation
- **DataTransformer.stats**: Extended to include validation statistics
- **DataTransformer.warnings**: Enhanced to include validation-specific warnings
- **DataTransformer.errors**: Enhanced to include validation-specific errors

## Components and Interfaces

### New Validation Methods

#### `validateWorkoutLogExercise(exercise, originalData)`
Main validation orchestrator that coordinates all validation checks.

**Parameters:**
- `exercise`: Transformed exercise object
- `originalData`: Original Firestore exercise data for reference

**Returns:**
- `{ isValid: boolean, correctedExercise: object, issues: array }`

#### `validateRepsArray(reps, sets)`
Validates and normalizes the reps array.

**Parameters:**
- `reps`: Array of rep values
- `sets`: Number of sets

**Returns:**
- `{ correctedReps: array, issues: array }`

**Validation Rules:**
- Each rep must be a positive integer or null
- Array length must equal sets count
- Invalid values converted to null with warnings

#### `validateWeightsArray(weights, sets)`
Validates and normalizes the weights array.

**Parameters:**
- `weights`: Array of weight values
- `sets`: Number of sets

**Returns:**
- `{ correctedWeights: array, issues: array }`

**Validation Rules:**
- Each weight must be a positive number or 0
- Array length must equal sets count
- Invalid values converted to 0 with warnings

#### `validateCompletedArray(completed, sets)`
Validates and normalizes the completed array.

**Parameters:**
- `completed`: Array of boolean completion status
- `sets`: Number of sets

**Returns:**
- `{ correctedCompleted: array, issues: array }`

**Validation Rules:**
- Each value must be boolean or convertible to boolean
- Array length must equal sets count
- Missing values default to false

#### `normalizeArrayLength(array, targetLength, defaultValue)`
Utility method to ensure array matches target length.

**Parameters:**
- `array`: Array to normalize
- `targetLength`: Target length (sets count)
- `defaultValue`: Value to use for padding

**Returns:**
- Normalized array of correct length

### Enhanced Statistics Tracking

```javascript
this.stats = {
  // ... existing stats
  validationStats: {
    exercisesValidated: 0,
    repsValidationIssues: 0,
    weightsValidationIssues: 0,
    arrayLengthCorrections: 0,
    invalidExercisesSkipped: 0,
    totalValidationWarnings: 0
  }
}
```

### Configuration Options

New options added to DataTransformer constructor:

```javascript
this.options = {
  // ... existing options
  validationMode: 'lenient', // 'strict' | 'lenient'
  skipInvalidExercises: false, // Skip exercises that fail validation
  logValidationDetails: true // Include detailed validation logs
}
```

## Data Models

### Validation Issue Object
```javascript
{
  type: 'reps' | 'weights' | 'completed' | 'array_length' | 'data_type',
  field: string,
  originalValue: any,
  correctedValue: any,
  message: string,
  severity: 'warning' | 'error'
}
```

### Enhanced Exercise Validation Result
```javascript
{
  isValid: boolean,
  correctedExercise: {
    // ... standard exercise fields with validated data
  },
  issues: ValidationIssue[],
  statistics: {
    repsIssues: number,
    weightsIssues: number,
    arrayLengthIssues: number
  }
}
```

## Error Handling

### Validation Error Categories

1. **Critical Errors**: Missing required fields (exerciseId, sets)
   - Action: Skip exercise and log error
   - Impact: Exercise not included in migration

2. **Data Type Errors**: Invalid data types for reps/weights
   - Action: Convert to null and log warning
   - Impact: Data corrected, migration continues

3. **Array Length Errors**: Mismatched array lengths
   - Action: Pad or truncate arrays and log warning
   - Impact: Data normalized, migration continues

4. **Range Errors**: Negative or zero values
   - Action: Convert to null and log warning
   - Impact: Data corrected, migration continues

### Error Recovery Strategies

- **Lenient Mode**: Attempt to correct all issues, log warnings
- **Strict Mode**: Reject exercises with any validation issues
- **Array Normalization**: Pad short arrays with null, truncate long arrays
- **Type Coercion**: Attempt to convert invalid types before rejecting

## Testing Strategy

### Unit Tests
- Test each validation method with various input scenarios
- Test array normalization with different length mismatches
- Test error handling for invalid data types
- Test statistics tracking accuracy

### Integration Tests
- Test validation integration with existing transformation flow
- Test validation with real Firestore data samples
- Test performance impact of validation on large datasets
- Test validation reporting in transformation reports

### Test Data Scenarios
1. **Valid Data**: Perfect arrays with correct types and lengths
2. **Invalid Reps**: Zero, negative, and non-numeric rep values
3. **Invalid Weights**: Zero, negative, and non-numeric weight values
4. **Array Length Mismatches**: Short and long arrays compared to sets
5. **Mixed Issues**: Exercises with multiple validation problems
6. **Edge Cases**: Empty arrays, null values, undefined fields

### Performance Considerations
- Validation should add minimal overhead to transformation process
- Batch validation statistics to avoid frequent object updates
- Use efficient array operations for length normalization
- Cache validation results for repeated patterns

### Validation Reporting
- Include validation statistics in existing transformation report
- Provide detailed breakdown of validation issues by type
- Include before/after data samples for major corrections
- Generate validation summary with recommendations for data quality improvement