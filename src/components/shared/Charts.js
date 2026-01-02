/**
 * Simple Chart Components
 * Lightweight charts using basic React Native components
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Pie Chart Component
 * Shows proportional segments in a circle
 */
export const PieChart = ({ data, colors, size = 150 }) => {
    const total = Object.values(data).reduce((sum, val) => sum + val, 0);

    if (total === 0) {
        return (
            <View style={[styles.emptyChart, { width: size, height: size }]}>
                <Text style={styles.emptyText}>No data</Text>
            </View>
        );
    }

    return (
        <View style={styles.pie}>
            <View style={styles.legendContainer}>
                {Object.entries(data).map(([key, value], index) => {
                    const percentage = ((value / total) * 100).toFixed(1);
                    const color = colors[index % colors.length];

                    return (
                        <View key={key} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: color }]} />
                            <Text style={styles.legendText}>
                                {key}: {percentage}% ({value})
                            </Text>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

/**
 * Bar Chart Component
 * Shows horizontal bars for comparison
 */
export const BarChart = ({ data, maxValue, height = 200 }) => {
    const max = maxValue || Math.max(...Object.values(data));

    if (max === 0) {
        return (
            <View style={styles.emptyChart}>
                <Text style={styles.emptyText}>No data</Text>
            </View>
        );
    }

    return (
        <View style={styles.barChart}>
            {Object.entries(data).map(([label, value]) => {
                const barHeight = (value / max) * height;

                return (
                    <View key={label} style={styles.barColumn}>
                        <View style={styles.barWrapper}>
                            <View style={[styles.bar, { height: barHeight }]}>
                                <Text style={styles.barValue}>{value}</Text>
                            </View>
                        </View>
                        <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
                    </View>
                );
            })}
        </View>
    );
};

/**
 * Stat Card Component with trend
 */
export const StatCard = ({ title, value, subtitle, color, icon, onPress }) => {
    return (
        <View style={[styles.statCardContainer, { borderLeftColor: color }]}>
            {icon && <View style={styles.iconContainer}>{icon}</View>}
            <View style={styles.statContent}>
                <Text style={styles.statTitle}>{title}</Text>
                <Text style={[styles.statValue, { color }]}>{value}</Text>
                {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    // Pie Chart
    pie: {
        alignItems: 'center',
    },
    legendContainer: {
        marginTop: 15,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    legendText: {
        fontSize: 13,
        color: '#475569',
        fontWeight: '500',
    },

    // Bar Chart
    barChart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-around',
        paddingHorizontal: 10,
    },
    barColumn: {
        alignItems: 'center',
        flex: 1,
        marginHorizontal: 5,
    },
    barWrapper: {
        height: 200,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    bar: {
        backgroundColor: '#4338ca',
        width: 40,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 5,
        minHeight: 20,
    },
    barValue: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    barLabel: {
        fontSize: 11,
        color: '#64748b',
        marginTop: 8,
        textAlign: 'center',
        fontWeight: '600',
    },

    // Empty state
    emptyChart: {
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    emptyText: {
        color: '#94a3b8',
        fontStyle: 'italic',
    },

    // Stat Card
    statCardContainer: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    iconContainer: {
        marginBottom: 8,
    },
    statContent: {},
    statTitle: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    statValue: {
        fontSize: 24,
        fontWeight: '800',
        marginBottom: 4,
    },
    statSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
    },
});
