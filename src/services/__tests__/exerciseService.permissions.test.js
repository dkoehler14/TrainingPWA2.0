/**
 * Tests for exercise service permission checking utilities
 */

// Mock the Supabase dependencies to avoid configuration issues
jest.mock('../../config/supabase', () => ({
  supabase: {}
}))

jest.mock('../../utils/supabaseErrorHandler', () => ({
  handleSupabaseError: jest.fn(),
  executeSupabaseOperation: jest.fn()
}))

jest.mock('../../api/supabaseCache', () => ({
  supabaseCache: {}
}))

import {
  canEditGlobalExercise,
  exercisePermissions,
  validateExercisePermission,
  canUserPerformExerciseOperation
} from '../exerciseService'

describe('Exercise Service Permission Utilities', () => {
  // Mock exercise data
  const globalExercise = {
    id: '1',
    name: 'Push-up',
    is_global: true,
    created_by: 'admin-user-id'
  }

  const customExercise = {
    id: '2',
    name: 'Custom Exercise',
    is_global: false,
    created_by: 'user-123'
  }

  describe('canEditGlobalExercise', () => {
    test('should allow admin to edit global exercise', () => {
      expect(canEditGlobalExercise('admin', globalExercise)).toBe(true)
    })

    test('should not allow regular user to edit global exercise', () => {
      expect(canEditGlobalExercise('user', globalExercise)).toBe(false)
    })

    test('should allow anyone to edit custom exercise', () => {
      expect(canEditGlobalExercise('user', customExercise)).toBe(true)
      expect(canEditGlobalExercise('admin', customExercise)).toBe(true)
    })
  })

  describe('exercisePermissions.canEdit', () => {
    test('should allow admin to edit global exercise', () => {
      expect(exercisePermissions.canEdit(globalExercise, 'admin')).toBe(true)
    })

    test('should not allow regular user to edit global exercise', () => {
      expect(exercisePermissions.canEdit(globalExercise, 'user')).toBe(false)
    })

    test('should allow anyone to edit custom exercise', () => {
      expect(exercisePermissions.canEdit(customExercise, 'user')).toBe(true)
      expect(exercisePermissions.canEdit(customExercise, 'admin')).toBe(true)
    })
  })

  describe('exercisePermissions.canDelete', () => {
    test('should allow admin to delete global exercise', () => {
      expect(exercisePermissions.canDelete(globalExercise, 'admin', 'any-user-id')).toBe(true)
    })

    test('should not allow regular user to delete global exercise', () => {
      expect(exercisePermissions.canDelete(globalExercise, 'user', 'user-123')).toBe(false)
    })

    test('should allow user to delete their own custom exercise', () => {
      expect(exercisePermissions.canDelete(customExercise, 'user', 'user-123')).toBe(true)
    })

    test('should not allow user to delete someone else\'s custom exercise', () => {
      expect(exercisePermissions.canDelete(customExercise, 'user', 'different-user')).toBe(false)
    })
  })

  describe('validateExercisePermission', () => {
    test('should not throw error for admin editing global exercise', () => {
      expect(() => {
        validateExercisePermission(globalExercise, 'admin', 'edit')
      }).not.toThrow()
    })

    test('should throw error for regular user editing global exercise', () => {
      expect(() => {
        validateExercisePermission(globalExercise, 'user', 'edit')
      }).toThrow('You don\'t have permission to edit global exercises')
    })

    test('should not throw error for anyone editing custom exercise', () => {
      expect(() => {
        validateExercisePermission(customExercise, 'user', 'edit')
      }).not.toThrow()
    })

    test('should throw error for regular user deleting global exercise', () => {
      expect(() => {
        validateExercisePermission(globalExercise, 'user', 'delete', 'user-123')
      }).toThrow('You don\'t have permission to delete global exercises')
    })
  })

  describe('canUserPerformExerciseOperation', () => {
    test('should return true for admin editing global exercise', () => {
      expect(canUserPerformExerciseOperation(globalExercise, 'admin', 'admin-id', 'edit')).toBe(true)
    })

    test('should return false for regular user editing global exercise', () => {
      expect(canUserPerformExerciseOperation(globalExercise, 'user', 'user-id', 'edit')).toBe(false)
    })

    test('should return true for user editing their own custom exercise', () => {
      expect(canUserPerformExerciseOperation(customExercise, 'user', 'user-123', 'edit')).toBe(true)
    })

    test('should return true for user deleting their own custom exercise', () => {
      expect(canUserPerformExerciseOperation(customExercise, 'user', 'user-123', 'delete')).toBe(true)
    })

    test('should return false for user deleting someone else\'s custom exercise', () => {
      expect(canUserPerformExerciseOperation(customExercise, 'user', 'different-user', 'delete')).toBe(false)
    })
  })
})