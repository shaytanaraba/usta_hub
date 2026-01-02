/**
 * Orders Tab - Orders list with filters
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDateTime, getStatusColor } from '../../utils/helpers';

const STATUS_OPTIONS = ['all', 'pending', 'claimed', 'in_progress', 'completed', 'verified'];

export default function OrdersTab({ orders, onAddOrder, onEditOrder, onDeleteOrder, refreshing, onRefresh }) {
    const [statusFilter, setStatusFilter] = useState('all');

    const filteredOrders = useMemo(() => {
        if (statusFilter === 'all') return orders;
        return orders.filter(o => o.status === statusFilter);
    }, [orders, statusFilter]);

    return (
        <View style={styles.container}>
            {/* Filters */}
            <View style={styles.filterSection}>
                <View style={styles.filterRow}>
                    <Text style={styles.filterLabel}>Status:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {STATUS_OPTIONS.map(status => (
                            <TouchableOpacity
                                key={status}
                                style={[
                                    styles.filterChip,
                                    statusFilter === status && styles.filterChipActive
                                ]}
                                onPress={() => setStatusFilter(status)}
                            >
                                <Text style={[
                                    styles.filterChipText,
                                    statusFilter === status && styles.filterChipTextActive
                                ]}>
                                    {status.replace('_', ' ')}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                <View style={styles.headerControls}>
                    <Text style={styles.resultCount}>
                        {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
                    </Text>

                    <TouchableOpacity style={styles.addBtn} onPress={onAddOrder}>
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={styles.addBtnText}>Add Order</Text>
                    </TouchableOpacity>
                </View>
            </View>


            {/* Orders List */}
            <ScrollView
                style={styles.ordersList}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {filteredOrders.map(order => (
                    <View
                        key={order.id}
                        style={[styles.orderCard, { borderLeftColor: getStatusColor(order.status) }]}
                    >
                        <View style={styles.orderHeader}>
                            <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
                            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(order.status) }]}>
                                <Text style={styles.statusText}>{order.status.toUpperCase()}</Text>
                            </View>
                        </View>

                        <Text style={styles.orderText}>
                            <Text style={styles.label}>Client:</Text> {order.clientName}
                        </Text>
                        <Text style={styles.orderText}>
                            <Text style={styles.label}>Service:</Text> {order.serviceDetails.serviceType}
                        </Text>
                        <Text style={styles.orderText}>
                            <Text style={styles.label}>Plumber:</Text> {order.assignedPlumber?.plumberName || 'Unassigned'}
                        </Text>
                        {order.completion?.amountCharged && (
                            <Text style={styles.orderText}>
                                <Text style={styles.label}>Amount:</Text> {formatCurrency(order.completion.amountCharged)}
                            </Text>
                        )}
                        <Text style={styles.orderDate}>{formatDateTime(order.createdAt)}</Text>

                        {/* Action Buttons */}
                        <View style={styles.actionRow}>
                            <TouchableOpacity
                                style={[styles.actionBtn, styles.editBtn]}
                                onPress={() => onEditOrder(order)}
                            >
                                <Ionicons name="create" size={16} color="#fff" />
                                <Text style={styles.actionBtnText}>Edit</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.actionBtn, styles.deleteBtn]}
                                onPress={() => onDeleteOrder(order)}
                            >
                                <Ionicons name="trash" size={16} color="#fff" />
                                <Text style={styles.actionBtnText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    filterSection: { marginBottom: 20 },
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    headerControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#4338ca',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        gap: 6
    },
    addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
    filterLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
        marginRight: 10,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    filterChipActive: {
        backgroundColor: '#4338ca',
        borderColor: '#4338ca',
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
        textTransform: 'capitalize',
    },
    filterChipTextActive: {
        color: '#fff',
    },
    resultCount: {
        fontSize: 13,
        color: '#94a3b8',
        fontWeight: '600',
    },
    ordersList: {
        flex: 1,
    },
    orderCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 15,
        borderLeftWidth: 4,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    orderId: {
        fontWeight: '800',
        color: '#94a3b8',
        fontSize: 12,
        letterSpacing: 1,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
    },
    orderText: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 6,
        lineHeight: 20,
    },
    label: {
        fontWeight: '700',
        color: '#475569',
    },
    orderDate: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 8,
        fontWeight: '500',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 15,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
    },
    editBtn: {
        backgroundColor: '#10b981',
    },
    deleteBtn: {
        backgroundColor: '#ef4444',
    },
    actionBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
});
