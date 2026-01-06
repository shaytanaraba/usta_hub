/**
 * Device Detection Utility
 * Provides responsive layout helpers for cross-platform compatibility
 */

import { Dimensions, Platform } from 'react-native';

const { width, height } = Dimensions.get('window');

// Breakpoints (following common standards)
const BREAKPOINTS = {
    mobile: 0,
    tablet: 768,
    desktop: 1024,
    largeDesktop: 1440,
};

/**
 * Get current device type based on screen width
 */
export const getDeviceType = () => {
    if (width >= BREAKPOINTS.largeDesktop) return 'largeDesktop';
    if (width >= BREAKPOINTS.desktop) return 'desktop';
    if (width >= BREAKPOINTS.tablet) return 'tablet';
    return 'mobile';
};

/**
 * Check if running on web platform
 */
export const isWeb = Platform.OS === 'web';

/**
 * Check if running on mobile (iOS or Android)
 */
export const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

/**
 * Get responsive value based on device type
 * @param {Object} values - { mobile, tablet, desktop, largeDesktop }
 */
export const responsive = (values) => {
    const device = getDeviceType();
    return values[device] ?? values.mobile ?? values.tablet ?? values.desktop;
};

/**
 * Get number of columns for grid layouts
 */
export const getGridColumns = () => {
    const device = getDeviceType();
    switch (device) {
        case 'largeDesktop': return 3;
        case 'desktop': return 3;
        case 'tablet': return 2;
        default: return 1;
    }
};

/**
 * Get card width percentage for grid layouts
 */
export const getCardWidth = () => {
    const columns = getGridColumns();
    const gap = 12; // Gap between cards
    if (columns === 1) return '100%';
    // Account for gaps in percentage calculation
    return `${(100 / columns) - 1}%`;
};

/**
 * Screen dimensions
 */
export const screenWidth = width;
export const screenHeight = height;

/**
 * Listen for dimension changes (for web resizing)
 */
export const addDimensionListener = (callback) => {
    const subscription = Dimensions.addEventListener('change', callback);
    return () => subscription?.remove();
};

export default {
    getDeviceType,
    isWeb,
    isMobile,
    responsive,
    getGridColumns,
    getCardWidth,
    screenWidth,
    screenHeight,
    addDimensionListener,
    BREAKPOINTS,
};
