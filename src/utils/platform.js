import { Platform, Dimensions } from 'react-native';

/**
 * Platform detection utilities
 * Helps determine device type and screen size for adaptive layouts
 */

export const isWeb = Platform.OS === 'web';
export const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

export const getScreenSize = () => {
    const { width } = Dimensions.get('window');

    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
};

export const isTablet = () => {
    const { width } = Dimensions.get('window');
    return width >= 768 && width < 1024;
};

export const isDesktop = () => {
    const { width } = Dimensions.get('window');
    return isWeb && width >= 1024;
};

export const isMobileDevice = () => {
    const { width } = Dimensions.get('window');
    return width < 768;
};

// Responsive breakpoints
export const BREAKPOINTS = {
    mobile: 0,
    tablet: 768,
    desktop: 1024,
    wide: 1440,
};

export const getBreakpoint = () => {
    const { width } = Dimensions.get('window');

    if (width >= BREAKPOINTS.wide) return 'wide';
    if (width >= BREAKPOINTS.desktop) return 'desktop';
    if (width >= BREAKPOINTS.tablet) return 'tablet';
    return 'mobile';
};
