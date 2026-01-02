/**
 * Clients Tab - Card-based layout
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Dimensions, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, formatDateTime } from '../../utils/helpers';

const { width } = Dimensions.get('window');
const numColumns = width > 1024 ? 3 : width > 768 ? 2 : 1;

export default function ClientsTab({
    clients,
    clientStats,
    onAddClient,
    onEditClient,
    onDeleteClient,
    onViewDetails,
    refreshing,
    onRefresh
}) {
    const [searchText, setSearchText] = useState('');

    const filteredClients = useMemo(() => {
        if (!searchText) return clients;
        return clients.filter(c =>
            c.name?.toLowerCase().includes(searchText.toLowerCase()) ||
            c.email?.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [clients, searchText]);

    const renderClientCard = ({ item: client }) => {
        const stats = clientStats[client.id] || {
            totalOrders: 0,
            completedOrders: 0,
            totalSpent: 0,
            lastOrderDate: null,
        };

        return (
            <View style={styles.clientCard}>
                {/* Header */}
                <View style={styles.cardHeader}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{client.name?.[0]?.toUpperCase() || 'C'}</Text>
                    </View>
                    <View style={styles.statusIndicator}>
                        <View style={[
                            styles.statusDot,
                            stats.totalOrders > 0 ? styles.activeDot : styles.inactiveDot
                        ]} />
                        <Text style={styles.statusText}>
                            {stats.totalOrders > 0 ? 'Active' : 'Inactive'}
                        </Text>
                    </View>
                </View>

                {/* Info */}
                <Text style={styles.clientName}>{client.name}</Text>
                <Text style={styles.clientContact}>📧 {client.email}</Text>
                <Text style={styles.clientContact}>📞 {client.phone || 'N/A'}</Text>

                {/* Stats Row */}
                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{stats.totalOrders}</Text>
                        <Text style={styles.statLabel}>Orders</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#10b981' }]}>
                            {formatCurrency(stats.totalSpent)}
                        </Text>
                        <Text style={styles.statLabel}>Spent</Text>
                    </View>
                </View>

                {stats.lastOrderDate && (
                    <Text style={styles.lastOrder}>
                        Last order: {formatDateTime(stats.lastOrderDate)}
                    </Text>
                )}

                {/* Actions */}
                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.viewBtn]}
                        onPress={() => onViewDetails(client)}
                    >
                        <Ionicons name="eye" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>View</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, styles.editBtn]}
                        onPress={() => onEditClient(client)}
                    >
                        <Ionicons name="create" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, styles.deleteBtn]}
                        onPress={() => onDeleteClient(client)}
                    >
                        <Ionicons name="trash" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Delete</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header with Add Button */}
            <View style={styles.headerRow}>
                <Text style={styles.title}>Clients ({filteredClients.length})</Text>
                <TouchableOpacity
                    style={styles.addBtn}
                    onPress={onAddClient}
                >
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addBtnText}>Add Client</Text>
                </TouchableOpacity>
            </View>

            {/* Clients Grid */}
            <FlatList
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                data={filteredClients}
                renderItem={renderClientCard}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                key={numColumns}
                contentContainerStyle={styles.grid}
                columnWrapperStyle={numColumns > 1 ? styles.row : null}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Ionicons name="people-outline" size={48} color="#cbd5e1" />
                        <Text style={styles.emptyText}>No clients yet</Text>
                    </View>
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 20,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1e293b',
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#4338ca',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        gap: 6,
    },
    addBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    grid: {
        paddingBottom: 20,
    },
    row: {
        justifyContent: 'flex-start',
        gap: 15,
    },
    clientCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 15,
        borderLeftWidth: 4,
        borderLeftColor: '#3b82f6',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
        minWidth: width > 768 ? 300 : '100%',
        maxWidth: width > 1024 ? 350 : '100%',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#3b82f6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '800',
    },
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    activeDot: {
        backgroundColor: '#10b981',
    },
    inactiveDot: {
        backgroundColor: '#94a3b8',
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748b',
    },
    clientName: {
        fontSize: 18,
        fontWeight: '800',
        color: '#1e293b',
        marginBottom: 8,
    },
    clientContact: {
        fontSize: 13,
        color: '#64748b',
        marginBottom: 4,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 15,
        marginBottom: 10,
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    statItem: {
        alignItems: 'center',
    },
    statValue: {
        fontSize: 16,
        fontWeight: '800',
        color: '#1e293b',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '600',
    },
    lastOrder: {
        fontSize: 11,
        color: '#94a3b8',
        marginTop: 5,
        fontStyle: 'italic',
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
    viewBtn: {
        backgroundColor: '#3b82f6',
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
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        color: '#94a3b8',
        marginTop: 12,
    },
});
