import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useResponsive } from '../../utils/responsive';

/**
 * Adaptive Card Component
 * Adjusts padding and layout based on screen size
 */
export default function Card({
    title,
    subtitle,
    children,
    style,
    headerStyle,
    bodyStyle,
    footer
}) {
    const { isDesktop, isMobile } = useResponsive();

    return (
        <View style={[
            styles.card,
            isDesktop && styles.desktopCard,
            isMobile && styles.mobileCard,
            style
        ]}>
            {(title || subtitle) && (
                <View style={[styles.header, headerStyle]}>
                    {title && <Text style={styles.title}>{title}</Text>}
                    {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
                </View>
            )}

            <View style={[styles.body, bodyStyle]}>
                {children}
            </View>

            {footer && (
                <View style={styles.footer}>
                    {footer}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 16,
        ...Platform.select({
            web: {
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            },
            default: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.1,
                shadowRadius: 8,
                elevation: 3,
            },
        }),
    },
    desktopCard: {
        padding: 24,
    },
    mobileCard: {
        padding: 16,
    },
    header: {
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e9ecef',
        paddingBottom: 12,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#212529',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#6c757d',
    },
    body: {
        // Content goes here
    },
    footer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e9ecef',
    },
});
