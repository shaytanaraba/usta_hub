/**
 * Plumbers Tab - Card-based layout with filters
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Dimensions, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency } from '../../utils/helpers';

const { width } = Dimensions.get('window');
const numColumns = width > 1024 ? 3 : width > 768 ? 2 : 1;

export default function PlumbersTab({
    plumbers,
    plumberStats,
    onAddPlumber,
    onEditPlumber,
    onDeletePlumber,
    onViewDetails,
    onVerifyPlumber,
    onUnverifyPlumber,
    refreshing,
    onRefresh
}) {
    const [verificationFilter, setVerificationFilter] = useState('all');

    const filteredPlumbers = useMemo(() => {
        if (verificationFilter === 'all') return plumbers;
        return plumbers.filter(p =>
            verificationFilter === 'verified' ? p.is_verified : !p.is_verified
        );
    }, [plumbers, verificationFilter]);

    const renderPlumberCard = ({ item: plumber }) => {
        const stats = plumberStats[plumber.id] || { completed: 0, earnings: 0 };

        return (
            <View style={styles.plumberCard}>
                <View style={styles.cardHeader}>
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{plumber.name?.[0]?.toUpperCase() || 'P'}</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <View style={[
                            styles.verificationBadge,
                            plumber.is_verified ? styles.verified : styles.pending
                        ]}>
                            <Text style={styles.badgeText}>
                                {plumber.is_verified ? '✓ Verified' : 'Pending'}
                            </Text>
                        </View>

                        {/* Verify/Unverify Button */}
                        <TouchableOpacity
                            style={[
                                styles.toggleBtn,
                                plumber.is_verified ? styles.unverifyBtn : styles.verifyBtn
                            ]}
                            onPress={() => plumber.is_verified ? onUnverifyPlumber(plumber) : onVerifyPlumber(plumber)}
                        >
                            <Ionicons
                                name={plumber.is_verified ? "close-circle" : "checkmark-circle"}
                                size={18}
                                color="#fff"
                            />
                            <Text style={styles.toggleBtnText}>
                                {plumber.is_verified ? 'Unverify' : 'Verify'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                <Text style={styles.plumberName}>{plumber.name}</Text>
                <Text style={styles.plumberContact}>📧 {plumber.email}</Text>
                <Text style={styles.plumberContact}>📞 {plumber.phone || 'N/A'}</Text>

                <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>{stats.completed}</Text>
                        <Text style={styles.statLabel}>Jobs</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>⭐ {plumber.rating || 0}</Text>
                        <Text style={styles.statLabel}>Rating</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={[styles.statValue, { color: '#10b981' }]}>
                            {formatCurrency(stats.earnings)}
                        </Text>
                        <Text style={styles.statLabel}>Earned</Text>
                    </View>
                </View>

                <View style={styles.actionRow}>
                    <TouchableOpacity
                        style={[styles.actionBtn, styles.viewBtn]}
                        onPress={() => onViewDetails(plumber)}
                    >
                        <Ionicons name="eye" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>View</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, styles.editBtn]}
                        onPress={() => onEditPlumber(plumber)}
                    >
                        <Ionicons name="create" size={16} color="#fff" />
                        <Text style={styles.actionBtnText}>Edit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, styles.deleteBtn]}
                        onPress={() => onDeletePlumber(plumber)}
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
            {/* Filters */}
            <View style={styles.filterSection}>
                <View style={styles.filterRow}>
                    <TouchableOpacity
                        style={[styles.filterBtn, verificationFilter === 'all' && styles.filterBtnActive]}
                        onPress={() => setVerificationFilter('all')}
                    >
                        <Text style={[styles.filterBtnText, verificationFilter === 'all' && styles.filterBtnTextActive]}>
                            All
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterBtn, verificationFilter === 'verified' && styles.filterBtnActive]}
                        onPress={() => setVerificationFilter('verified')}
                    >
                        <Text style={[styles.filterBtnText, verificationFilter === 'verified' && styles.filterBtnTextActive]}>
                            Verified
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterBtn, verificationFilter === 'pending' && styles.filterBtnActive]}
                        onPress={() => setVerificationFilter('pending')}
                    >
                        <Text style={[styles.filterBtnText, verificationFilter === 'pending' && styles.filterBtnTextActive]}>
                            Pending
                        </Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.headerControls}>
                    <Text style={styles.resultCount}>
                        {filteredPlumbers.length} {filteredPlumbers.length === 1 ? 'plumber' : 'plumbers'}
                    </Text>

                    <TouchableOpacity style={styles.addBtn} onPress={onAddPlumber}>
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={styles.addBtnText}>Add Plumber</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <FlatList
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                data={filteredPlumbers}
                renderItem={renderPlumberCard}
                keyExtractor={(item) => item.id}
                numColumns={numColumns}
                key={numColumns}
                contentContainerStyle={styles.grid}
                columnWrapperStyle={numColumns > 1 ? styles.row : null}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    filterSection: { marginBottom: 20 },
    filterRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
    filterBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    filterBtnActive: { backgroundColor: '#4338ca', borderColor: '#4338ca' },
    filterBtnText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    filterBtnTextActive: { color: '#fff' },
    headerControls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    resultCount: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
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
    grid: { paddingBottom: 20 },
    row: { justifyContent: 'flex-start', gap: 15 },
    plumberCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 3,
        minWidth: width > 768 ? 300 : '100%',
        maxWidth: width > 1024 ? 350 : '100%',
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
    headerRight: { alignItems: 'flex-end', gap: 8 },
    avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#4338ca', justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
    verificationBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    verified: { backgroundColor: '#d1fae5' },
    pending: { backgroundColor: '#fed7aa' },
    badgeText: { fontSize: 11, fontWeight: '700', color: '#065f46' },
    toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, height: 26 },
    verifyBtn: { backgroundColor: '#10b981' },
    unverifyBtn: { backgroundColor: '#ef4444' },
    toggleBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    plumberName: { fontSize: 18, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
    plumberContact: { fontSize: 13, color: '#64748b', marginBottom: 4 },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 15,
        marginBottom: 15,
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    statItem: { alignItems: 'center' },
    statValue: { fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 4 },
    statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
    actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    actionBtn: { flex: 1, flexDirection: 'row', paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
    actionBtnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
    viewBtn: { backgroundColor: '#3b82f6' },
    editBtn: { backgroundColor: '#10b981' },
    deleteBtn: { backgroundColor: '#ef4444' },
});
