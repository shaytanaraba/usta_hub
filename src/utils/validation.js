/**
 * Validation Configuration
 * Centralized validation rules and parameters
 */

export const VALIDATION_RULES = {
    // Email validation
    email: {
        allowedDomains: ['gmail.com'],
        regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },

    // Phone validation
    phone: {
        // Accepts: 0XXXXXXXXX or +996XXXXXXXXX
        regex: /^(0\d{9}|\+996\d{9})$/,
        countryCode: '+996',
    },

    // Password validation
    password: {
        minLength: 6,
        maxLength: 50,
    },

    // Name validation
    name: {
        minLength: 2,
        maxLength: 100,
    },

    // Plumber specific
    plumber: {
        // License is now optional
        licenseRequired: false,
        minExperience: 0,
        maxExperience: 50,
    },
};

/**
 * Validate email
 */
export const validateEmail = (email) => {
    if (!email || !email.trim()) {
        return { isValid: false, message: 'Email is required' };
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!VALIDATION_RULES.email.regex.test(trimmedEmail)) {
        return { isValid: false, message: 'Invalid email format' };
    }

    const domain = trimmedEmail.split('@')[1];
    if (!VALIDATION_RULES.email.allowedDomains.includes(domain)) {
        return {
            isValid: false,
            message: `Only ${VALIDATION_RULES.email.allowedDomains.join(', ')} emails are allowed`,
        };
    }

    return { isValid: true, email: trimmedEmail };
};

/**
 * Normalize and validate phone number
 * Converts 0XXXXXXXXX to +996XXXXXXXXX
 */
export const validateAndNormalizePhone = (phone) => {
    if (!phone || !phone.trim()) {
        return { isValid: false, message: 'Phone number is required' };
    }

    const cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');

    if (!VALIDATION_RULES.phone.regex.test(cleaned)) {
        return {
            isValid: false,
            message: 'Phone must be in format: 0XXXXXXXXX or +996XXXXXXXXX',
        };
    }

    // Normalize: Convert 0XXXXXXXXX to +996XXXXXXXXX
    let normalized = cleaned;
    if (cleaned.startsWith('0')) {
        normalized = VALIDATION_RULES.phone.countryCode + cleaned.substring(1);
    }

    return { isValid: true, phone: normalized };
};

/**
 * Validate password
 */
export const validatePassword = (password) => {
    if (!password) {
        return { isValid: false, message: 'Password is required' };
    }

    if (password.length < VALIDATION_RULES.password.minLength) {
        return {
            isValid: false,
            message: `Password must be at least ${VALIDATION_RULES.password.minLength} characters`,
        };
    }

    if (password.length > VALIDATION_RULES.password.maxLength) {
        return {
            isValid: false,
            message: `Password must be less than ${VALIDATION_RULES.password.maxLength} characters`,
        };
    }

    return { isValid: true };
};

/**
 * Validate name
 */
export const validateName = (name) => {
    if (!name || !name.trim()) {
        return { isValid: false, message: 'Name is required' };
    }

    const trimmedName = name.trim();

    if (trimmedName.length < VALIDATION_RULES.name.minLength) {
        return {
            isValid: false,
            message: `Name must be at least ${VALIDATION_RULES.name.minLength} characters`,
        };
    }

    if (trimmedName.length > VALIDATION_RULES.name.maxLength) {
        return {
            isValid: false,
            message: `Name must be less than ${VALIDATION_RULES.name.maxLength} characters`,
        };
    }

    return { isValid: true, name: trimmedName };
};

/**
 * Validate plumber experience
 */
export const validateExperience = (experience) => {
    if (!experience || !experience.trim()) {
        return { isValid: false, message: 'Experience is required' };
    }

    const years = parseInt(experience);

    if (isNaN(years)) {
        return { isValid: false, message: 'Experience must be a number' };
    }

    if (years < VALIDATION_RULES.plumber.minExperience) {
        return { isValid: false, message: 'Experience cannot be negative' };
    }

    if (years > VALIDATION_RULES.plumber.maxExperience) {
        return {
            isValid: false,
            message: `Experience cannot exceed ${VALIDATION_RULES.plumber.maxExperience} years`,
        };
    }

    return { isValid: true, experience: years.toString() };
};
