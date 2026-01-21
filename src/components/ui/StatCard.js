/**
 * Stat Card Component for Admin Dashboard V5
 * Clickable card showing key metrics in the Overview tab
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const StatCard = ({ value, label, color, onPress, isDark = true }) => {
    return (
        <TouchableOpacity
            style={[styles.card, !isDark && styles.cardLight]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View style={styles.content}>
                <Text style={[styles.value, !isDark && styles.textDark]}>{value}</Text>
                <Text style={[styles.label, { color: color }]}>{label}</Text>
            </View>

            {/* Bottom Accent Bar */}
            <View style={[styles.accentBar, { backgroundColor: color, shadowColor: color }]} />
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        minHeight: 140,
        minWidth: 200, // Ensure cards wrap on smaller screens
        justifyContent: 'space-between',
        flex: 1,
        // Remove margin: 8 and let gap handle spacing in grid
        borderWidth: 1,
        borderColor: '#334155',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    cardLight: {
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    content: {
        flex: 1,
    },
    value: {
        fontSize: 32, // Slightly smaller for better fit
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    textDark: {
        color: '#0f172a',
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    accentBar: {
        height: 4,
        borderRadius: 2,
        marginTop: 16,
        width: '100%', // Full width accent
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 3,
        opacity: 0.8,
    },
});
