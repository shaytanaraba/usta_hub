import { useState, useEffect } from 'react';
import { Dimensions } from 'react-native';
import { getScreenSize, getBreakpoint, isDesktop, isMobileDevice } from './platform';

/**
 * Custom hooks for responsive design
 */

export const useResponsive = () => {
    const [dimensions, setDimensions] = useState(Dimensions.get('window'));

    useEffect(() => {
        const subscription = Dimensions.addEventListener('change', ({ window }) => {
            setDimensions(window);
        });

        return () => subscription?.remove();
    }, []);

    return {
        width: dimensions.width,
        height: dimensions.height,
        screenSize: getScreenSize(),
        breakpoint: getBreakpoint(),
        isDesktop: isDesktop(),
        isMobile: isMobileDevice(),
    };
};

export const useBreakpoint = () => {
    const [breakpoint, setBreakpoint] = useState(getBreakpoint());

    useEffect(() => {
        const subscription = Dimensions.addEventListener('change', () => {
            setBreakpoint(getBreakpoint());
        });

        return () => subscription?.remove();
    }, []);

    return breakpoint;
};

export const useIsDesktop = () => {
    const [desktop, setDesktop] = useState(isDesktop());

    useEffect(() => {
        const subscription = Dimensions.addEventListener('change', () => {
            setDesktop(isDesktop());
        });

        return () => subscription?.remove();
    }, []);

    return desktop;
};
