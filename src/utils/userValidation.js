/**
 * User Data Validation Utilities
 * Provides comprehensive validation for user profile data
 */

/**
 * Email validation regex
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Password validation rules
 */
const PASSWORD_RULES = {
  minLength: 6,
  maxLength: 128,
  requireUppercase: false,
  requireLowercase: false,
  requireNumbers: false,
  requireSpecialChars: false
}

/**
 * Validate email format
 */
export const validateEmail = (email) => {
  if (!email) {
    return { isValid: false, error: 'Email is required' }
  }

  if (typeof email !== 'string') {
    return { isValid: false, error: 'Email must be a string' }
  }

  if (email.length > 255) {
    return { isValid: false, error: 'Email must be less than 255 characters' }
  }

  if (!EMAIL_REGEX.test(email)) {
    return { isValid: false, error: 'Please enter a valid email address' }
  }

  return { isValid: true }
}

/**
 * Validate password strength
 */
export const validatePassword = (password) => {
  if (!password) {
    return { isValid: false, error: 'Password is required' }
  }

  if (typeof password !== 'string') {
    return { isValid: false, error: 'Password must be a string' }
  }

  if (password.length < PASSWORD_RULES.minLength) {
    return { 
      isValid: false, 
      error: `Password must be at least ${PASSWORD_RULES.minLength} characters long` 
    }
  }

  if (password.length > PASSWORD_RULES.maxLength) {
    return { 
      isValid: false, 
      error: `Password must be less than ${PASSWORD_RULES.maxLength} characters long` 
    }
  }

  // Additional password strength checks (optional)
  const checks = []
  
  if (PASSWORD_RULES.requireUppercase && !/[A-Z]/.test(password)) {
    checks.push('uppercase letter')
  }
  
  if (PASSWORD_RULES.requireLowercase && !/[a-z]/.test(password)) {
    checks.push('lowercase letter')
  }
  
  if (PASSWORD_RULES.requireNumbers && !/\d/.test(password)) {
    checks.push('number')
  }
  
  if (PASSWORD_RULES.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    checks.push('special character')
  }

  if (checks.length > 0) {
    return {
      isValid: false,
      error: `Password must contain at least one ${checks.join(', ')}`
    }
  }

  return { isValid: true }
}

/**
 * Validate user name
 */
export const validateName = (name) => {
  if (!name) {
    return { isValid: false, error: 'Name is required' }
  }

  if (typeof name !== 'string') {
    return { isValid: false, error: 'Name must be a string' }
  }

  const trimmedName = name.trim()
  
  if (trimmedName.length === 0) {
    return { isValid: false, error: 'Name cannot be empty' }
  }

  if (trimmedName.length > 255) {
    return { isValid: false, error: 'Name must be less than 255 characters' }
  }

  // Check for valid characters (letters, spaces, hyphens, apostrophes)
  if (!/^[a-zA-Z\s\-']+$/.test(trimmedName)) {
    return { 
      isValid: false, 
      error: 'Name can only contain letters, spaces, hyphens, and apostrophes' 
    }
  }

  return { isValid: true, value: trimmedName }
}

/**
 * Validate age
 */
export const validateAge = (age) => {
  if (age === null || age === undefined || age === '') {
    return { isValid: true, value: null } // Age is optional
  }

  const numAge = Number(age)
  
  if (isNaN(numAge)) {
    return { isValid: false, error: 'Age must be a number' }
  }

  if (!Number.isInteger(numAge)) {
    return { isValid: false, error: 'Age must be a whole number' }
  }

  if (numAge < 13) {
    return { isValid: false, error: 'You must be at least 13 years old' }
  }

  if (numAge > 120) {
    return { isValid: false, error: 'Please enter a valid age' }
  }

  return { isValid: true, value: numAge }
}

/**
 * Validate weight
 */
export const validateWeight = (weight, unit = 'LB') => {
  if (weight === null || weight === undefined || weight === '') {
    return { isValid: true, value: null } // Weight is optional
  }

  const numWeight = Number(weight)
  
  if (isNaN(numWeight)) {
    return { isValid: false, error: 'Weight must be a number' }
  }

  if (numWeight <= 0) {
    return { isValid: false, error: 'Weight must be greater than 0' }
  }

  // Set reasonable limits based on unit
  const limits = unit === 'KG' 
    ? { min: 20, max: 500 } // 20-500 kg
    : { min: 50, max: 1000 } // 50-1000 lbs

  if (numWeight < limits.min) {
    return { 
      isValid: false, 
      error: `Weight must be at least ${limits.min} ${unit}` 
    }
  }

  if (numWeight > limits.max) {
    return { 
      isValid: false, 
      error: `Weight must be less than ${limits.max} ${unit}` 
    }
  }

  return { isValid: true, value: numWeight }
}

/**
 * Validate height (in centimeters or inches)
 */
export const validateHeight = (height, unit = 'CM') => {
  if (height === null || height === undefined || height === '') {
    return { isValid: true, value: null } // Height is optional
  }

  const numHeight = Number(height)
  
  if (isNaN(numHeight)) {
    return { isValid: false, error: 'Height must be a number' }
  }

  if (numHeight <= 0) {
    return { isValid: false, error: 'Height must be greater than 0' }
  }

  // Set reasonable limits based on unit
  const limits = unit === 'CM' 
    ? { min: 100, max: 250 } // 100-250 cm
    : { min: 36, max: 96 } // 36-96 inches (3-8 feet)

  if (numHeight < limits.min) {
    return { 
      isValid: false, 
      error: `Height must be at least ${limits.min} ${unit}` 
    }
  }

  if (numHeight > limits.max) {
    return { 
      isValid: false, 
      error: `Height must be less than ${limits.max} ${unit}` 
    }
  }

  return { isValid: true, value: numHeight }
}

/**
 * Validate height in feet and inches format
 */
export const validateHeightFeetInches = (feet, inches) => {
  const feetNum = Number(feet)
  const inchesNum = Number(inches)

  if (isNaN(feetNum) || isNaN(inchesNum)) {
    return { isValid: false, error: 'Height must be valid numbers' }
  }

  if (feetNum < 0 || feetNum > 8) {
    return { isValid: false, error: 'Feet must be between 0 and 8' }
  }

  if (inchesNum < 0 || inchesNum >= 12) {
    return { isValid: false, error: 'Inches must be between 0 and 11' }
  }

  // Convert to total inches for validation
  const totalInches = (feetNum * 12) + inchesNum
  
  if (totalInches < 36) {
    return { isValid: false, error: 'Height must be at least 3 feet' }
  }

  if (totalInches > 96) {
    return { isValid: false, error: 'Height must be less than 8 feet' }
  }

  return { 
    isValid: true, 
    value: { feet: feetNum, inches: inchesNum, totalInches } 
  }
}

/**
 * Validate experience level
 */
export const validateExperienceLevel = (level) => {
  const validLevels = ['beginner', 'intermediate', 'advanced']
  
  if (!level) {
    return { isValid: true, value: 'beginner' } // Default to beginner
  }

  if (!validLevels.includes(level)) {
    return { 
      isValid: false, 
      error: 'Experience level must be beginner, intermediate, or advanced' 
    }
  }

  return { isValid: true, value: level }
}

/**
 * Validate preferred units
 */
export const validatePreferredUnits = (units) => {
  const validUnits = ['LB', 'KG']
  
  if (!units) {
    return { isValid: true, value: 'LB' } // Default to LB
  }

  if (!validUnits.includes(units)) {
    return { 
      isValid: false, 
      error: 'Preferred units must be LB or KG' 
    }
  }

  return { isValid: true, value: units }
}

/**
 * Validate array fields (goals, equipment, injuries)
 */
export const validateArrayField = (array, fieldName, maxItems = 20, maxLength = 100) => {
  if (!array) {
    return { isValid: true, value: [] }
  }

  if (!Array.isArray(array)) {
    return { isValid: false, error: `${fieldName} must be an array` }
  }

  if (array.length > maxItems) {
    return { 
      isValid: false, 
      error: `${fieldName} cannot have more than ${maxItems} items` 
    }
  }

  // Validate each item in the array
  for (let i = 0; i < array.length; i++) {
    const item = array[i]
    
    if (typeof item !== 'string') {
      return { 
        isValid: false, 
        error: `${fieldName} items must be strings` 
      }
    }

    if (item.length > maxLength) {
      return { 
        isValid: false, 
        error: `${fieldName} items must be less than ${maxLength} characters` 
      }
    }
  }

  // Remove duplicates and empty strings
  const cleanedArray = [...new Set(array.filter(item => item.trim().length > 0))]

  return { isValid: true, value: cleanedArray }
}

/**
 * Comprehensive user profile validation
 */
export const validateUserProfile = (profileData) => {
  const errors = {}
  const validatedData = {}

  // Validate email
  if (profileData.email !== undefined) {
    const emailValidation = validateEmail(profileData.email)
    if (!emailValidation.isValid) {
      errors.email = emailValidation.error
    } else {
      validatedData.email = profileData.email
    }
  }

  // Validate name
  if (profileData.name !== undefined) {
    const nameValidation = validateName(profileData.name)
    if (!nameValidation.isValid) {
      errors.name = nameValidation.error
    } else {
      validatedData.name = nameValidation.value
    }
  }

  // Validate age
  if (profileData.age !== undefined) {
    const ageValidation = validateAge(profileData.age)
    if (!ageValidation.isValid) {
      errors.age = ageValidation.error
    } else {
      validatedData.age = ageValidation.value
    }
  }

  // Validate weight
  if (profileData.weight !== undefined) {
    const weightValidation = validateWeight(profileData.weight, profileData.preferredUnits)
    if (!weightValidation.isValid) {
      errors.weight = weightValidation.error
    } else {
      validatedData.weight = weightValidation.value
    }
  }

  // Validate height
  if (profileData.height !== undefined) {
    const heightValidation = validateHeight(profileData.height)
    if (!heightValidation.isValid) {
      errors.height = heightValidation.error
    } else {
      validatedData.height = heightValidation.value
    }
  }

  // Validate experience level
  if (profileData.experienceLevel !== undefined) {
    const levelValidation = validateExperienceLevel(profileData.experienceLevel)
    if (!levelValidation.isValid) {
      errors.experienceLevel = levelValidation.error
    } else {
      validatedData.experience_level = levelValidation.value
    }
  }

  // Validate preferred units
  if (profileData.preferredUnits !== undefined) {
    const unitsValidation = validatePreferredUnits(profileData.preferredUnits)
    if (!unitsValidation.isValid) {
      errors.preferredUnits = unitsValidation.error
    } else {
      validatedData.preferred_units = unitsValidation.value
    }
  }

  // Validate goals
  if (profileData.goals !== undefined) {
    const goalsValidation = validateArrayField(profileData.goals, 'Goals')
    if (!goalsValidation.isValid) {
      errors.goals = goalsValidation.error
    } else {
      validatedData.goals = goalsValidation.value
    }
  }

  // Validate available equipment
  if (profileData.availableEquipment !== undefined) {
    const equipmentValidation = validateArrayField(profileData.availableEquipment, 'Available equipment')
    if (!equipmentValidation.isValid) {
      errors.availableEquipment = equipmentValidation.error
    } else {
      validatedData.available_equipment = equipmentValidation.value
    }
  }

  // Validate injuries
  if (profileData.injuries !== undefined) {
    const injuriesValidation = validateArrayField(profileData.injuries, 'Injuries')
    if (!injuriesValidation.isValid) {
      errors.injuries = injuriesValidation.error
    } else {
      validatedData.injuries = injuriesValidation.value
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    validatedData
  }
}

/**
 * Validate sign up form data
 */
export const validateSignUpData = (formData) => {
  const errors = {}

  // Validate email
  const emailValidation = validateEmail(formData.email)
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error
  }

  // Validate password
  const passwordValidation = validatePassword(formData.password)
  if (!passwordValidation.isValid) {
    errors.password = passwordValidation.error
  }

  // Validate confirm password
  if (formData.confirmPassword !== formData.password) {
    errors.confirmPassword = 'Passwords do not match'
  }

  // Validate name if provided
  if (formData.name) {
    const nameValidation = validateName(formData.name)
    if (!nameValidation.isValid) {
      errors.name = nameValidation.error
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate sign in form data
 */
export const validateSignInData = (formData) => {
  const errors = {}

  // Validate email
  const emailValidation = validateEmail(formData.email)
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error
  }

  // Validate password (just check if it exists for sign in)
  if (!formData.password) {
    errors.password = 'Password is required'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate password reset form data
 */
export const validatePasswordResetData = (formData) => {
  const errors = {}

  // Validate email
  const emailValidation = validateEmail(formData.email)
  if (!emailValidation.isValid) {
    errors.email = emailValidation.error
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate password update form data
 */
export const validatePasswordUpdateData = (formData) => {
  const errors = {}

  // Validate new password
  const passwordValidation = validatePassword(formData.newPassword)
  if (!passwordValidation.isValid) {
    errors.newPassword = passwordValidation.error
  }

  // Validate confirm password
  if (formData.confirmPassword !== formData.newPassword) {
    errors.confirmPassword = 'Passwords do not match'
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * Validate profile completion data
 */
export const validateProfileCompletionData = (formData) => {
  const errors = {}

  // Name is required for profile completion
  const nameValidation = validateName(formData.name)
  if (!nameValidation.isValid) {
    errors.name = nameValidation.error
  }

  // Experience level is required
  const levelValidation = validateExperienceLevel(formData.experienceLevel)
  if (!levelValidation.isValid) {
    errors.experienceLevel = levelValidation.error
  }

  // Validate optional fields if provided
  if (formData.age !== undefined && formData.age !== null && formData.age !== '') {
    const ageValidation = validateAge(formData.age)
    if (!ageValidation.isValid) {
      errors.age = ageValidation.error
    }
  }

  if (formData.weight !== undefined && formData.weight !== null && formData.weight !== '') {
    const weightValidation = validateWeight(formData.weight, formData.preferredUnits)
    if (!weightValidation.isValid) {
      errors.weight = weightValidation.error
    }
  }

  if (formData.height !== undefined && formData.height !== null && formData.height !== '') {
    const heightValidation = validateHeight(formData.height)
    if (!heightValidation.isValid) {
      errors.height = heightValidation.error
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}