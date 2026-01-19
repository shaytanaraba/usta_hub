import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { BarChart, ProgressChart } from 'react-native-chart-kit';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ============================================
// STATUS CHART (Bar Chart)
// ============================================
export const StatusChart = ({ data, isDark = true }) => {
    // data: [{status: 'placed', count: 10}, ...]

    // Convert array to map
    const dataMap = {};
    if (Array.isArray(data)) {
        data.forEach(d => dataMap[d.status] = d.count);
    } else {
        Object.assign(dataMap, data || {});
    }

    const statuses = ['placed', 'claimed', 'started', 'completed', 'confirmed', 'canceled'];
    const chartLabels = ['New', 'Clm', 'WIP', 'Done', 'Paid', 'Can'];
    const chartValues = statuses.map(s => dataMap[s] || 0);

    return (
        <View style={[styles.card, !isDark && styles.cardLight]}>
            <Text style={[styles.title, !isDark && styles.textDark]}>Order Status</Text>
            <BarChart
                data={{
                    labels: chartLabels,
                    datasets: [{ data: chartValues }]
                }}
                width={Platform.OS === 'web' ? 400 : SCREEN_WIDTH - 60}
                height={220}
                yAxisLabel=""
                chartConfig={{
                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                    backgroundGradientFrom: isDark ? '#1e293b' : '#ffffff',
                    backgroundGradientTo: isDark ? '#1e293b' : '#ffffff',
                    color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`, // Indigo
                    labelColor: () => isDark ? '#94a3b8' : '#64748b',
                    barPercentage: 0.7,
                    decimalPlaces: 0,
                    propsForBackgroundLines: {
                        stroke: isDark ? '#334155' : '#f1f5f9',
                        strokeDasharray: '3',
                        strokeWidth: 0.5
                    }
                }}
                style={{
                    marginVertical: 8,
                    borderRadius: 16,
                    paddingRight: 0,
                }}
                showValuesOnTopOfBars={false}
                fromZero
            />
        </View>
    );
};

// ============================================
// COMMISSION WIDGET (Donut)
// ============================================
export const CommissionWidget = ({ collected, outstanding, isDark = true }) => {
    const total = (collected + outstanding) || 1;
    const percentage = collected / total;

    const data = {
        labels: ["Collected"], // optional
        data: [percentage]
    };

    return (
        <View style={[styles.card, !isDark && styles.cardLight]}>
            <View style={styles.headerRow}>
                <Text style={[styles.title, !isDark && styles.textDark]}>Commission Collection</Text>
                <View style={[styles.badge, !isDark && styles.badgeLight]}>
                    <Text style={[styles.badgeText, !isDark && styles.badgeTextLight]}>All Time</Text>
                </View>
            </View>

            <View style={styles.rowContent}>
                <ProgressChart
                    data={data}
                    width={140}
                    height={140}
                    strokeWidth={16}
                    radius={55}
                    chartConfig={{
                        backgroundGradientFrom: isDark ? "#1e293b" : "#ffffff",
                        backgroundGradientTo: isDark ? "#1e293b" : "#ffffff",
                        color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`, // Green
                        labelColor: () => isDark ? '#fff' : '#0f172a',
                    }}
                    hideLegend={true}
                />

                <View style={styles.statsCol}>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>COLLECTED</Text>
                        <Text style={[styles.statValue, { color: '#22c55e' }]}>
                            {collected.toLocaleString()}
                        </Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statLabel}>OUTSTANDING</Text>
                        <Text style={[styles.statValue, { color: '#f59e0b' }]}>
                            {outstanding.toLocaleString()}
                        </Text>
                    </View>
                    <View style={styles.percentageAbsolute}>
                        <Text style={[styles.bigPercentage, !isDark && styles.textDark]}>{(percentage * 100).toFixed(0)}%</Text>
                        <Text style={styles.percentageLabel}>Collected</Text>
                    </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 16,
        flex: 1,
        minHeight: 300,
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
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 16,
    },
    textDark: {
        color: '#0f172a',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    badge: {
        backgroundColor: '#334155',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
    },
    badgeLight: {
        backgroundColor: '#f1f5f9',
    },
    badgeText: {
        color: '#94a3b8',
        fontSize: 12,
    },
    badgeTextLight: {
        color: '#64748b',
    },
    rowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
    },
    statsCol: {
        flex: 1,
        paddingLeft: 20,
        gap: 16,
    },
    statItem: {},
    statLabel: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '600',
        marginBottom: 4,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
    },
    // Overlay percentage inside donut (CSS hack for layout)
    percentageAbsolute: {
        position: 'absolute',
        left: 35, // Approx center of donut
        top: 45,
        alignItems: 'center',
    },
    bigPercentage: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
    },
    textDark: {
        color: '#0f172a',
    },
    percentageLabel: {
        fontSize: 10,
        color: '#94a3b8',
    }
});

import { Platform } from 'react-native';
