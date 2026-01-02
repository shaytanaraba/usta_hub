/**
 * Compliance Tab Content - Extracted from old AdminDashboard
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import orderService from '../services/orders';
import { formatCurrency, formatDateTime } from '../utils/helpers';
import { useToast } from '../contexts/ToastContext';

export default function ComplianceTabContent({ disputes, onReload, refreshing, onRefresh }) {
    const [selectedDispute, setSelectedDispute] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [adminNotes, setAdminNotes] = useState('');
    const { showToast } = useToast();

    const openDisputes = disputes.filter(d => d.status === 'open' || d.status === 'in_review');
    const resolvedDisputes = disputes.filter(d => d.status === 'resolved' || d.status === 'closed');

    const openDisputeDetails = (dispute) => {
        setSelectedDispute(dispute);
        setAdminNotes(dispute.admin_notes || '');
        setModalVisible(true);
    };

    const handleUpdateStatus = async (status) => {
        if (!selectedDispute) return;

        const result = await orderService.updateDispute(
            selectedDispute.id,
            { status, adminNotes },
            'admin-user-id' // Use actual user ID
        );

        if (result.success) {
            showToast(`Dispute ${status}`, 'success');
            setModalVisible(false);
            onReload();
        } else {
            showToast(result.message, 'error');
        }
    };

    const handleCloseDispute = async () => {
        if (!selectedDispute) return;

        const result = await orderService.closeDispute(selectedDispute.id, 'admin-user-id', true);

        if (result.success) {
            showToast('Dispute closed', 'success');
            setModalVisible(false);
            onReload();
        } else {
            showToast(result.message, 'error');
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.sectionTitle}>Compliance & Disputes</Text>

            <View style={styles.disputeStats}>
                <View style={styles.disputeStatCard}>
                    <Text style={styles.disputeStatValue}>{openDisputes.length}</Text>
                    <Text style={styles.disputeStatLabel}>Open Cases</Text>
                </View>
                <View style={styles.disputeStatCard}>
                    <Text style={styles.disputeStatValue}>{resolvedDisputes.length}</Text>
                    <Text style={styles.disputeStatLabel}>Resolved</Text>
                </View>
            </View>

            <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <Text style={styles.subSectionTitle}>🔴 Open Disputes</Text>
                {openDisputes.length === 0 ? (
                    <Text style={styles.emptyText}>No open disputes</Text>
                ) : (
                    openDisputes.map(dispute => (
                        <View key={dispute.id} style={styles.disputeCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>Dispute #{dispute.id.slice(0, 8)}</Text>
                                <View style={[styles.statusBadge, { backgroundColor: '#f59e0b' }]}>
                                    <Text style={styles.statusText}>{dispute.status.toUpperCase()}</Text>
                                </View>
                            </View>

                            <Text style={styles.disputeText}>
                                <Text style={styles.label}>Order:</Text> #{dispute.order?.id.slice(0, 8)}
                            </Text>
                            <Text style={styles.disputeText}>
                                <Text style={styles.label}>Client:</Text> {dispute.client?.full_name} ({dispute.client?.phone})
                            </Text>
                            <Text style={styles.disputeText}>
                                <Text style={styles.label}>Plumber:</Text> {dispute.plumber?.full_name} ({dispute.plumber?.phone})
                            </Text>
                            <Text style={styles.disputeText}>
                                <Text style={styles.label}>Amount:</Text> {formatCurrency(dispute.order?.final_price || 0)}
                            </Text>

                            <View style={styles.reasonBox}>
                                <Text style={styles.reasonLabel}>Client's Reason:</Text>
                                <Text style={styles.reasonText}>{dispute.reason}</Text>
                            </View>

                            <TouchableOpacity
                                style={styles.reviewBtn}
                                onPress={() => openDisputeDetails(dispute)}
                            >
                                <Text style={styles.reviewBtnText}>Review & Resolve</Text>
                            </TouchableOpacity>
                        </View>
                    ))
                )}

                <Text style={[styles.subSectionTitle, { marginTop: 30 }]}>✅ Resolved Disputes</Text>
                {resolvedDisputes.length === 0 ? (
                    <Text style={styles.emptyText}>No resolved disputes</Text>
                ) : (
                    resolvedDisputes.slice(0, 5).map(dispute => (
                        <View key={dispute.id} style={styles.resolvedCard}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>#{dispute.id.slice(0, 8)}</Text>
                                <View style={[styles.statusBadge, { backgroundColor: '#10b981' }]}>
                                    <Text style={styles.statusText}>{dispute.status.toUpperCase()}</Text>
                                </View>
                            </View>
                            <Text style={styles.disputeText}>Order: #{dispute.order?.id.slice(0, 8)}</Text>
                            <Text style={styles.disputeText}>Resolved: {formatDateTime(dispute.resolved_at)}</Text>
                        </View>
                    ))
                )}
            </ScrollView>

            {/* Dispute Modal */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Dispute Resolution</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#333" />
                            </TouchableOpacity>
                        </View>

                        {selectedDispute && (
                            <ScrollView>
                                <View style={styles.infoSection}>
                                    <Text style={styles.infoLabel}>Dispute ID:</Text>
                                    <Text style={styles.infoVal}>#{selectedDispute.id.slice(0, 8)}</Text>

                                    <Text style={styles.infoLabel}>Status:</Text>
                                    <Text style={styles.infoVal}>{selectedDispute.status.toUpperCase()}</Text>
                                </View>

                                <View style={styles.contactSection}>
                                    <Text style={styles.subHeader}>Contact Information</Text>
                                    <View style={styles.contactCard}>
                                        <Text style={styles.contactRole}>👤 Client</Text>
                                        <Text style={styles.contactName}>{selectedDispute.client?.full_name}</Text>
                                        <Text style={styles.contactDetail}>📧 {selectedDispute.client?.email}</Text>
                                        <Text style={styles.contactDetail}>📞 {selectedDispute.client?.phone}</Text>
                                    </View>

                                    <View style={styles.contactCard}>
                                        <Text style={styles.contactRole}>🔧 Plumber</Text>
                                        <Text style={styles.contactName}>{selectedDispute.plumber?.full_name}</Text>
                                        <Text style={styles.contactDetail}>📧 {selectedDispute.plumber?.email}</Text>
                                        <Text style={styles.contactDetail}>📞 {selectedDispute.plumber?.phone}</Text>
                                    </View>
                                </View>

                                <View style={styles.notesSection}>
                                    <Text style={styles.subHeader}>Admin Notes</Text>
                                    <TextInput
                                        style={styles.notesInput}
                                        placeholder="Add resolution notes..."
                                        multiline
                                        numberOfLines={4}
                                        value={adminNotes}
                                        onChangeText={setAdminNotes}
                                    />
                                </View>

                                <View style={styles.actionButtons}>
                                    {selectedDispute.status === 'open' && (
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#3b82f6' }]}
                                            onPress={() => handleUpdateStatus('in_review')}
                                        >
                                            <Text style={styles.actionButtonText}>Mark In Review</Text>
                                        </TouchableOpacity>
                                    )}

                                    {(selectedDispute.status === 'open' || selectedDispute.status === 'in_review') && (
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#10b981' }]}
                                            onPress={() => handleUpdateStatus('resolved')}
                                        >
                                            <Text style={styles.actionButtonText}>Mark Resolved</Text>
                                        </TouchableOpacity>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.actionButton, { backgroundColor: '#64748b' }]}
                                        onPress={handleCloseDispute}
                                    >
                                        <Text style={styles.actionButtonText}>Close Case</Text>
                                    </TouchableOpacity>
                                </View>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    sectionTitle: { fontSize: 22, fontWeight: '800', marginBottom: 20, color: '#1e293b' },
    disputeStats: { flexDirection: 'row', gap: 15, marginBottom: 25 },
    disputeStatCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    disputeStatValue: { fontSize: 28, fontWeight: '800', color: '#1e293b' },
    disputeStatLabel: { fontSize: 12, color: '#64748b', marginTop: 4, fontWeight: '600' },
    subSectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 15, color: '#475569' },
    emptyText: { fontStyle: 'italic', color: '#94a3b8', textAlign: 'center', marginVertical: 20 },
    disputeCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 15,
        borderLeftWidth: 4,
        borderLeftColor: '#f59e0b',
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    resolvedCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 15,
        borderLeftWidth: 4,
        borderLeftColor: '#10b981',
        opacity: 0.7,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    cardTitle: { fontWeight: '800', color: '#94a3b8', fontSize: 12, letterSpacing: 1 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    statusText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    disputeText: { fontSize: 14, color: '#64748b', marginBottom: 6 },
    label: { fontWeight: '700', color: '#475569' },
    reasonBox: {
        backgroundColor: '#fef3c7',
        padding: 12,
        borderRadius: 10,
        marginTop: 12,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#fbbf24',
    },
    reasonLabel: { fontWeight: '700', color: '#92400e', fontSize: 12, marginBottom: 6 },
    reasonText: { color: '#78350f', fontSize: 14, lineHeight: 20 },
    reviewBtn: { backgroundColor: '#4338ca', padding: 12, borderRadius: 10, alignItems: 'center' },
    reviewBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 24,
        width: '100%',
        maxWidth: 500,
        maxHeight: '80%',
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b' },
    infoSection: { marginBottom: 20 },
    infoLabel: { fontSize: 13, fontWeight: '700', color: '#64748b', marginTop: 8 },
    infoVal: { fontSize: 15, color: '#1e293b', marginBottom: 4 },
    contactSection: { marginTop: 20 },
    subHeader: { fontSize: 16, fontWeight: '700', color: '#475569', marginBottom: 12 },
    contactCard: {
        backgroundColor: '#f8fafc',
        padding: 14,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    contactRole: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6 },
    contactName: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 4 },
    contactDetail: { fontSize: 13, color: '#475569', marginTop: 2 },
    notesSection: { marginTop: 20 },
    notesInput: {
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 14,
        fontSize: 14,
        height: 100,
        textAlignVertical: 'top',
    },
    actionButtons: { marginTop: 20, gap: 10 },
    actionButton: { padding: 14, borderRadius: 12, alignItems: 'center' },
    actionButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
