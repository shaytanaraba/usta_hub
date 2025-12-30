import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { useResponsive } from '../utils/responsive';

/**
 * Adaptive Layout Component
 * Automatically adjusts layout based on screen size
 */
export default function AdaptiveLayout({
    children,
    mobileLayout,
    desktopLayout,
    style
}) {
    const { isDesktop } = useResponsive();

    // If specific layouts are provided, use them
    if (isDesktop && desktopLayout) {
        return desktopLayout;
    }

    if (!isDesktop && mobileLayout) {
        return mobileLayout;
    }

    // Otherwise, use default responsive container
    return (
        <View style={[
            styles.container,
            isDesktop && styles.desktopContainer,
            style
        ]}>
            {children}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    desktopContainer: {
        flexDirection: 'row',
        maxWidth: 1440,
        alignSelf: 'center',
        width: '100%',
    },
});
