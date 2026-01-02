/**
 * Dashboard Tab - Interactive Statistics
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PieChart, BarChart } from '../shared/Charts';
import { formatCurrency } from '../../utils/helpers';

export default function DashboardTab({ stats, orderDistribution, onStatClick, refreshing, onRefresh }) {
    const openDisputes = stats.openDisputes || 0;
    const resolvedDisputes = stats.resolvedDisputes || 0;

    return (
        <ScrollView
            style={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
            <Text style={styles.sectionTitle}>Platform Statistics</Text>

            {/* Clickable Stats Grid */}
            <View style={styles.statsGrid}>
                <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#4338ca' }]}
                    onPress={() => onStatClick('total_orders')}
                    activeOpacity={0.7}
                >
                    <Ionicons name="list" size={24} color="#4338ca" style={{ marginBottom: 10 }} />
                    <Text style={styles.statValue}>{stats.totalOrders || 0}</Text>
                    <Text style={styles.statLabel}>Total Orders</Text>
                    <Text style={styles.tapHint}>Tap to view</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#10b981' }]}
                    onPress={() => onStatClick('active_jobs')}
                    activeOpacity={0.7}
                >
                    <Ionicons name="hammer" size={24} color="#10b981" style={{ marginBottom: 10 }} />
                    <Text style={styles.statValue}>{stats.activeJobs || 0}</Text>
                    <Text style={styles.statLabel}>Active Jobs</Text>
                    <Text style={styles.tapHint}>Tap to view</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#3b82f6' }]}
                    onPress={() => onStatClick('revenue')}
                    activeOpacity={0.7}
                >
                    <Ionicons name="cash" size={24} color="#3b82f6" style={{ marginBottom: 10 }} />
                    <Text style={styles.statValue}>{formatCurrency(stats.totalRevenue || 0)}</Text>
                    <Text style={styles.statLabel}>Revenue</Text>
                    <Text style={styles.tapHint}>Tap for breakdown</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#f59e0b' }]}
                    onPress={() => onStatClick('commission')}
                    activeOpacity={0.7}
                >
                    <Ionicons name="briefcase" size={24} color="#f59e0b" style={{ marginBottom: 10 }} />
                    <Text style={styles.statValue}>{formatCurrency(stats.totalCommission || 0)}</Text>
                    <Text style={styles.statLabel}>Commission</Text>
                    <Text style={styles.tapHint}>Tap for filters</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#ef4444' }]}
                    onPress={() => onStatClick('open_disputes')}
                    activeOpacity={0.7}
                >
                    <Ionicons name="warning" size={24} color="#ef4444" style={{ marginBottom: 10 }} />
                    <Text style={styles.statValue}>{openDisputes}</Text>
                    <Text style={styles.statLabel}>Open Disputes</Text>
                    <Text style={styles.tapHint}>Tap to review</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.statCard, { borderLeftColor: '#10b981' }]}
                    onPress={() => onStatClick('resolved_disputes')}
                    activeOpacity={0.7}
                >
                    <Ionicons name="checkmark-circle" size={24} color="#10b981" style={{ marginBottom: 10 }} />
                    <Text style={styles.statValue}>{resolvedDisputes}</Text>
                    <Text style={styles.statLabel}>Resolved</Text>
                    <Text style={styles.tapHint}>Tap to view</Text>
                </TouchableOpacity>
            </View>

            {/* Charts Section */}
            {Object.keys(orderDistribution).length > 0 && (
                <View style={styles.chartSection}>
                    <Text style={styles.chartTitle}>Order Status Distribution</Text>
                    <View style={styles.chartCard}>
                        <PieChart
                            data={orderDistribution}
                            colors={['#4338ca', '#10b981', '#f59e0b', '#ef4444', '#64748b']}
                            size={180}
                        />
                    </View>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: '800',
        marginBottom: 20,
        color: '#1e293b',
        letterSpacing: -0.5,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -8,
        marginBottom: 30,
    },
    statCard: {
        width: '45.5%',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 18,
        margin: 8,
        borderLeftWidth: 4,
        shadowColor: '#4338ca',
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
    },
    statValue: {
        fontSize: 24,
        fontWeight: '800',
        color: '#1e293b',
    },
    statLabel: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 6,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    tapHint: {
        fontSize: 10,
        color: '#94a3b8',
        marginTop: 4,
        fontStyle: 'italic',
    },
    chartSection: {
        marginTop: 20,
    },
    chartTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 15,
        color: '#475569',
    },
    chartCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
});
