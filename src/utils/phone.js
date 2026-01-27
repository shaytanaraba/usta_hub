export const normalizeKyrgyzPhone = (phone) => {
    if (!phone) return null;

    // Remove all non-digit characters except leading +
    const cleaned = phone.replace(/[^\d+]/g, '');

    if (cleaned.startsWith('+996')) {
        const digits = cleaned.slice(4);
        if (digits.length === 9) return `+996${digits}`;
        return null;
    }

    if (cleaned.startsWith('996')) {
        const digits = cleaned.slice(3);
        if (digits.length === 9) return `+996${digits}`;
        return null;
    }

    if (cleaned.startsWith('0')) {
        const digits = cleaned.slice(1);
        if (digits.length === 9) return `+996${digits}`;
        return null;
    }

    if (cleaned.length === 9 && /^\d{9}$/.test(cleaned)) {
        return `+996${cleaned}`;
    }

    return null;
};

export const isValidKyrgyzPhone = (phone) => Boolean(normalizeKyrgyzPhone(phone));

export const validateKyrgyzPhone = (phone) => {
    const normalized = normalizeKyrgyzPhone(phone);
    if (normalized) {
        return { valid: true, normalized, error: null };
    }
    return {
        valid: false,
        normalized: null,
        error: 'Invalid format. Use +996XXXXXXXXX, 0XXXXXXXXX, or XXXXXXXXX'
    };
};
