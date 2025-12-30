/**
 * Plumber Verification Requirements
 * Centralized configuration for what fields are required for plumber verification
 */

export const VERIFICATION_REQUIREMENTS = {
    // Required fields for plumber verification
    requiredFields: [
        'service_area',
        'experience',
        'specializations',
    ],

    // Field labels for display
    fieldLabels: {
        service_area: 'Service Area',
        experience: 'Years of Experience',
        specializations: 'Specializations',
        license_number: 'License Number',
    },

    // Validation rules
    rules: {
        service_area: {
            required: true,
            minLength: 2,
        },
        experience: {
            required: true,
            min: 0,
            max: 50,
        },
        specializations: {
            required: true,
            minItems: 1,
        },
        license_number: {
            required: false, // Optional
        },
    },
};

/**
 * Check if plumber meets all verification requirements
 */
export const checkVerificationRequirements = (plumber) => {
    const missing = [];
    const warnings = [];

    // Check required fields
    VERIFICATION_REQUIREMENTS.requiredFields.forEach(field => {
        const value = plumber[field];
        const rule = VERIFICATION_REQUIREMENTS.rules[field];

        if (rule.required) {
            if (!value || (Array.isArray(value) && value.length === 0)) {
                missing.push(VERIFICATION_REQUIREMENTS.fieldLabels[field]);
            } else if (Array.isArray(value) && rule.minItems && value.length < rule.minItems) {
                missing.push(`${VERIFICATION_REQUIREMENTS.fieldLabels[field]} (at least ${rule.minItems})`);
            } else if (typeof value === 'string' && rule.minLength && value.trim().length < rule.minLength) {
                missing.push(`${VERIFICATION_REQUIREMENTS.fieldLabels[field]} (at least ${rule.minLength} characters)`);
            }
        }
    });

    // Check optional but recommended fields
    if (!plumber.license_number) {
        warnings.push('License Number is not provided (recommended)');
    }

    return {
        canVerify: missing.length === 0,
        missing,
        warnings,
    };
};

/**
 * Get verification status message
 */
export const getVerificationStatusMessage = (plumber) => {
    const check = checkVerificationRequirements(plumber);

    if (check.canVerify) {
        return {
            status: 'ready',
            message: 'Plumber meets all verification requirements',
            warnings: check.warnings,
        };
    } else {
        return {
            status: 'incomplete',
            message: `Missing required fields: ${check.missing.join(', ')}`,
            missing: check.missing,
        };
    }
};
