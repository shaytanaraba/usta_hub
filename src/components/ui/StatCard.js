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
        backgroundColor: '#1e293b', // Lighter navy card
        borderRadius: 16,
        padding: 24,
        minHeight: 140,
        justifyContent: 'space-between',
        flex: 1,
        margin: 8,
        // Subtle border
        borderWidth: 1,
        borderColor: '#334155',
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
        fontSize: 36,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
        letterSpacing: -1,
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
        width: '40%', // As seen in screenshot
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
        elevation: 3,
    },
});
