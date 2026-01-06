/**
 * Master Dashboard - v5
 * Three tabs: Pool (available orders), My Jobs, Finances
 * Premium dark theme with production-quality UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    Modal,
    TextInput,
    ScrollView,
    ActivityIndicator,
    Alert,
    Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import authService from '../services/auth';
import ordersService, { ORDER_STATUS, CANCEL_REASONS } from '../services/orders';
import earningsService from '../services/earnings';
import { useToast } from '../contexts/ToastContext';

const LOG_PREFIX = '[MasterDashboard]';

// Status colors
const STATUS_COLORS = {
    placed: '#3b82f6',
    claimed: '#f59e0b',
    started: '#8b5cf6',
    completed: '#f97316',
    confirmed: '#22c55e',
    canceled_by_master: '#ef4444',
};

// Urgency colors
const URGENCY_COLORS = {
    emergency: '#ef4444',
    urgent: '#f59e0b',
    planned: '#3b82f6',
};

export default function MasterDashboard({ navigation, route }) {
    const [user, setUser] = useState(route.params?.user || null);
    const [activeTab, setActiveTab] = useState('pool');
    const [availableOrders, setAvailableOrders] = useState([]);
    const [myOrders, setMyOrders] = useState([]);
    const [financials, setFinancials] = useState(null);
    const [earnings, setEarnings] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    // Modals
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showCompleteModal, setShowCompleteModal] = useState(false);
    const [showRefuseModal, setShowRefuseModal] = useState(false);
    const [completionData, setCompletionData] = useState({ finalPrice: '', workPerformed: '', hoursWorked: '' });
    const [refuseReason, setRefuseReason] = useState('');
    const [refuseNotes, setRefuseNotes] = useState('');
    const [actionLoading, setActionLoading] = useState(false);

    const { showToast } = useToast();

    useEffect(() => {
        console.log(`${LOG_PREFIX} Dashboard mounted`);
        loadData();
    }, []);

    const loadData = async () => {
        console.log(`${LOG_PREFIX} Loading data...`);
        setLoading(true);
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);

            if (currentUser) {
                await Promise.all([
                    loadAvailableOrders(),
                    loadMyOrders(currentUser.id),
                    loadFinancials(currentUser.id)
                ]);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} loadData error:`, error);
        } finally {
            setLoading(false);
        }
    };

    const loadAvailableOrders = async () => {
        const orders = await ordersService.getAvailableOrders();
        setAvailableOrders(orders);
    };

    const loadMyOrders = async (masterId) => {
        const orders = await ordersService.getMasterOrders(masterId);
        setMyOrders(orders);
    };

    const loadFinancials = async (masterId) => {
        const [summary, earningsData] = await Promise.all([
            earningsService.getMasterFinancialSummary(masterId),
            earningsService.getMasterEarnings(masterId)
        ]);
        setFinancials(summary);
        setEarnings(earningsData);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    // ============================================
    // ORDER ACTIONS
    // ============================================

    const handleClaimOrder = async (orderId) => {
        console.log(`${LOG_PREFIX} Claiming order: ${orderId}`);
        setActionLoading(true);

        try {
            const result = await ordersService.claimOrder(orderId, user.id);

            if (result.success) {
                showToast?.('Order claimed!', 'success');
                await loadData();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} claimOrder error:`, error);
            showToast?.('Failed to claim order', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleStartJob = async (orderId) => {
        console.log(`${LOG_PREFIX} Starting job: ${orderId}`);
        setActionLoading(true);

        try {
            const result = await ordersService.startJob(orderId, user.id);

            if (result.success) {
                showToast?.('Job started!', 'success');
                await loadData();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} startJob error:`, error);
            showToast?.('Failed to start job', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCompleteJob = async () => {
        console.log(`${LOG_PREFIX} Completing job: ${selectedOrder?.id}`);

        if (!completionData.finalPrice) {
            showToast?.('Please enter final price', 'error');
            return;
        }

        setActionLoading(true);

        try {
            const result = await ordersService.completeJob(selectedOrder.id, user.id, {
                finalPrice: parseFloat(completionData.finalPrice),
                workPerformed: completionData.workPerformed,
                hoursWorked: parseFloat(completionData.hoursWorked) || null
            });

            if (result.success) {
                showToast?.('Job completed! Awaiting confirmation.', 'success');
                setShowCompleteModal(false);
                setCompletionData({ finalPrice: '', workPerformed: '', hoursWorked: '' });
                await loadData();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} completeJob error:`, error);
            showToast?.('Failed to complete job', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRefuseJob = async () => {
        console.log(`${LOG_PREFIX} Refusing job: ${selectedOrder?.id}`);

        if (!refuseReason) {
            showToast?.('Please select a reason', 'error');
            return;
        }

        setActionLoading(true);

        try {
            const result = await ordersService.refuseJob(selectedOrder.id, user.id, refuseReason, refuseNotes);

            if (result.success) {
                showToast?.('Job canceled. Dispatcher notified.', 'success');
                setShowRefuseModal(false);
                setRefuseReason('');
                setRefuseNotes('');
                await loadData();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} refuseJob error:`, error);
            showToast?.('Failed to cancel job', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleLogout = async () => {
        const doLogout = async () => {
            await authService.logoutUser();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        };

        if (Platform.OS === 'web') {
            if (window.confirm('Are you sure you want to logout?')) {
                await doLogout();
            }
        } else {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', style: 'destructive', onPress: doLogout }
            ]);
        }
    };

    // ============================================
    // RENDER COMPONENTS
    // ============================================

    const renderHeader = () => (
        <View style={styles.header}>
            <View>
                <Text style={styles.welcomeText}>Welcome back,</Text>
                <Text style={styles.userName}>{user?.full_name || 'Master'}</Text>
            </View>
            <View style={styles.headerRight}>
                <View style={[styles.verificationBadge, user?.is_verified ? styles.verified : styles.unverified]}>
                    <Text style={styles.verificationText}>
                        {user?.is_verified ? '✓ Verified' : '✗ Unverified'}
                    </Text>
                </View>
                <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const renderTabs = () => (
        <View style={styles.tabsContainer}>
            {[
                { key: 'pool', label: 'Available', count: availableOrders.length },
                { key: 'jobs', label: 'My Jobs', count: myOrders.filter(o => o.status !== 'confirmed').length },
                { key: 'finances', label: 'Finances' }
            ].map(tab => (
                <TouchableOpacity
                    key={tab.key}
                    style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                    onPress={() => setActiveTab(tab.key)}
                >
                    <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                        {tab.label}
                    </Text>
                    {tab.count !== undefined && (
                        <View style={[styles.badge, activeTab === tab.key && styles.activeBadge]}>
                            <Text style={styles.badgeText}>{tab.count}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderPoolOrder = ({ item }) => (
        <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
                <View style={[styles.urgencyBadge, { backgroundColor: URGENCY_COLORS[item.urgency] }]}>
                    <Text style={styles.urgencyText}>{item.urgency?.toUpperCase()}</Text>
                </View>
                <Text style={styles.orderType}>{item.service_type}</Text>
            </View>

            <Text style={styles.orderDescription} numberOfLines={2}>
                {item.problem_description}
            </Text>

            <View style={styles.orderDetails}>
                <Text style={styles.detailLabel}>📍 Area:</Text>
                <Text style={styles.detailValue}>{item.area}</Text>
            </View>

            {item.pricing_type === 'fixed' && (
                <View style={styles.orderDetails}>
                    <Text style={styles.detailLabel}>💰 Offered:</Text>
                    <Text style={styles.priceValue}>{item.initial_price} сом</Text>
                </View>
            )}

            <View style={styles.orderDetails}>
                <Text style={styles.detailLabel}>🎁 Guaranteed:</Text>
                <Text style={styles.priceValue}>{item.guaranteed_payout} сом</Text>
            </View>

            <TouchableOpacity
                style={[styles.claimButton, !user?.is_verified && styles.buttonDisabled]}
                onPress={() => handleClaimOrder(item.id)}
                disabled={!user?.is_verified || actionLoading}
            >
                <Text style={styles.claimButtonText}>
                    {user?.is_verified ? 'CLAIM ORDER' : 'Verification Required'}
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderMyOrder = ({ item }) => {
        const isConfirmed = item.status === 'confirmed';

        return (
            <View style={[styles.orderCard, isConfirmed && styles.confirmedCard]}>
                <View style={styles.orderHeader}>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] }]}>
                        <Text style={styles.statusText}>{item.status?.replace('_', ' ').toUpperCase()}</Text>
                    </View>
                    <Text style={styles.orderType}>{item.service_type}</Text>
                </View>

                {!isConfirmed && (
                    <>
                        <View style={styles.orderDetails}>
                            <Text style={styles.detailLabel}>📍 Address:</Text>
                            <Text style={styles.detailValue}>{item.full_address}</Text>
                        </View>

                        <View style={styles.orderDetails}>
                            <Text style={styles.detailLabel}>👤 Client:</Text>
                            <Text style={styles.detailValue}>{item.client?.full_name}</Text>
                        </View>

                        <View style={styles.orderDetails}>
                            <Text style={styles.detailLabel}>📞 Phone:</Text>
                            <Text style={styles.detailValue}>{item.client?.phone}</Text>
                        </View>
                    </>
                )}

                {isConfirmed && (
                    <View style={styles.confirmedInfo}>
                        <Text style={styles.confirmedText}>✓ Completed & Confirmed</Text>
                        <Text style={styles.confirmedAmount}>Earned: {item.final_price} сом</Text>
                    </View>
                )}

                {/* Action Buttons */}
                {item.status === 'claimed' && (
                    <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => handleStartJob(item.id)}
                        disabled={actionLoading}
                    >
                        <Text style={styles.actionButtonText}>▶ START JOB</Text>
                    </TouchableOpacity>
                )}

                {item.status === 'started' && (
                    <View style={styles.actionRow}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.completeButton]}
                            onPress={() => { setSelectedOrder(item); setShowCompleteModal(true); }}
                        >
                            <Text style={styles.actionButtonText}>✓ COMPLETE</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.actionButton, styles.refuseButton]}
                            onPress={() => { setSelectedOrder(item); setShowRefuseModal(true); }}
                        >
                            <Text style={styles.actionButtonText}>✗ CANNOT COMPLETE</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {item.status === 'completed' && (
                    <View style={styles.pendingConfirmation}>
                        <Text style={styles.pendingText}>⏳ Awaiting payment confirmation</Text>
                    </View>
                )}
            </View>
        );
    };

    const renderFinances = () => (
        <ScrollView style={styles.financesContainer} showsVerticalScrollIndicator={false}>
            {/* Summary Cards */}
            <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { backgroundColor: '#22c55e' }]}>
                    <Text style={styles.summaryLabel}>Total Earned</Text>
                    <Text style={styles.summaryValue}>{financials?.totalEarnings?.toFixed(2) || '0.00'}</Text>
                    <Text style={styles.summaryCurrency}>сом</Text>
                </View>

                <View style={[styles.summaryCard, { backgroundColor: '#f59e0b' }]}>
                    <Text style={styles.summaryLabel}>Commission Owed</Text>
                    <Text style={styles.summaryValue}>{financials?.commissionOwed?.toFixed(2) || '0.00'}</Text>
                    <Text style={styles.summaryCurrency}>сом</Text>
                </View>
            </View>

            <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { backgroundColor: '#3b82f6' }]}>
                    <Text style={styles.summaryLabel}>Commission Paid</Text>
                    <Text style={styles.summaryValue}>{financials?.commissionPaid?.toFixed(2) || '0.00'}</Text>
                    <Text style={styles.summaryCurrency}>сом</Text>
                </View>

                <View style={[styles.summaryCard, { backgroundColor: '#8b5cf6' }]}>
                    <Text style={styles.summaryLabel}>Jobs Completed</Text>
                    <Text style={styles.summaryValue}>{financials?.completedJobs || 0}</Text>
                    <Text style={styles.summaryCurrency}>orders</Text>
                </View>
            </View>

            {/* Earnings History */}
            <Text style={styles.sectionTitle}>Recent Earnings</Text>

            {earnings.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No earnings yet</Text>
                </View>
            ) : (
                earnings.map((earning, index) => (
                    <View key={earning.id || index} style={styles.earningRow}>
                        <View style={styles.earningLeft}>
                            <Text style={styles.earningType}>{earning.order?.service_type || 'Service'}</Text>
                            <Text style={styles.earningArea}>{earning.order?.area}</Text>
                        </View>
                        <View style={styles.earningRight}>
                            <Text style={styles.earningAmount}>+{Number(earning.amount).toFixed(2)} сом</Text>
                            <Text style={[
                                styles.earningStatus,
                                { color: earning.status === 'paid' ? '#22c55e' : '#f59e0b' }
                            ]}>
                                {earning.status === 'paid' ? 'Commission Paid' : 'Commission Pending'}
                            </Text>
                        </View>
                    </View>
                ))
            )}
        </ScrollView>
    );

    // ============================================
    // MODALS
    // ============================================

    const renderCompleteModal = () => (
        <Modal visible={showCompleteModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Complete Job</Text>

                    <Text style={styles.inputLabel}>Final Price (сом) *</Text>
                    <TextInput
                        style={styles.modalInput}
                        placeholder="Enter final price"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={completionData.finalPrice}
                        onChangeText={(text) => setCompletionData({ ...completionData, finalPrice: text })}
                    />

                    <Text style={styles.inputLabel}>Work Performed</Text>
                    <TextInput
                        style={[styles.modalInput, styles.textArea]}
                        placeholder="Describe work completed"
                        placeholderTextColor="#64748b"
                        multiline
                        numberOfLines={3}
                        value={completionData.workPerformed}
                        onChangeText={(text) => setCompletionData({ ...completionData, workPerformed: text })}
                    />

                    <Text style={styles.inputLabel}>Hours Worked</Text>
                    <TextInput
                        style={styles.modalInput}
                        placeholder="e.g., 2.5"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={completionData.hoursWorked}
                        onChangeText={(text) => setCompletionData({ ...completionData, hoursWorked: text })}
                    />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => setShowCompleteModal(false)}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.submitButton}
                            onPress={handleCompleteJob}
                            disabled={actionLoading}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.submitButtonText}>Submit</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    const renderRefuseModal = () => (
        <Modal visible={showRefuseModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Cannot Complete Job</Text>
                    <Text style={styles.modalSubtitle}>Please select a reason:</Text>

                    {Object.entries(CANCEL_REASONS).map(([key, value]) => (
                        <TouchableOpacity
                            key={key}
                            style={[styles.reasonOption, refuseReason === value && styles.reasonSelected]}
                            onPress={() => setRefuseReason(value)}
                        >
                            <Text style={[styles.reasonText, refuseReason === value && styles.reasonTextSelected]}>
                                {key.replace(/_/g, ' ')}
                            </Text>
                        </TouchableOpacity>
                    ))}

                    <Text style={styles.inputLabel}>Additional Notes (optional)</Text>
                    <TextInput
                        style={[styles.modalInput, styles.textArea]}
                        placeholder="Any additional details..."
                        placeholderTextColor="#64748b"
                        multiline
                        numberOfLines={2}
                        value={refuseNotes}
                        onChangeText={setRefuseNotes}
                    />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => setShowRefuseModal(false)}
                        >
                            <Text style={styles.cancelButtonText}>Back</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.submitButton, { backgroundColor: '#ef4444' }]}
                            onPress={handleRefuseJob}
                            disabled={actionLoading}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.submitButtonText}>Confirm Refusal</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    // ============================================
    // MAIN RENDER
    // ============================================

    if (loading) {
        return (
            <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
            </LinearGradient>
        );
    }

    return (
        <LinearGradient colors={['#0f172a', '#1e293b']} style={styles.container}>
            {renderHeader()}
            {renderTabs()}

            {activeTab === 'pool' && (
                <FlatList
                    data={availableOrders}
                    renderItem={renderPoolOrder}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>📋</Text>
                            <Text style={styles.emptyText}>No available orders</Text>
                            <Text style={styles.emptySubtext}>Pull down to refresh</Text>
                        </View>
                    }
                />
            )}

            {activeTab === 'jobs' && (
                <FlatList
                    data={myOrders}
                    renderItem={renderMyOrder}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>🔧</Text>
                            <Text style={styles.emptyText}>No active jobs</Text>
                            <Text style={styles.emptySubtext}>Claim orders from the pool</Text>
                        </View>
                    }
                />
            )}

            {activeTab === 'finances' && renderFinances()}

            {renderCompleteModal()}
            {renderRefuseModal()}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 16,
    },
    welcomeText: {
        fontSize: 14,
        color: '#94a3b8',
    },
    userName: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
    },
    headerRight: {
        alignItems: 'flex-end',
    },
    verificationBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 8,
    },
    verified: {
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        borderWidth: 1,
        borderColor: '#22c55e',
    },
    unverified: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderWidth: 1,
        borderColor: '#ef4444',
    },
    verificationText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ffffff',
    },
    logoutButton: {
        paddingVertical: 4,
    },
    logoutText: {
        fontSize: 14,
        color: '#94a3b8',
    },
    tabsContainer: {
        flexDirection: 'row',
        marginHorizontal: 20,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 12,
        padding: 4,
        marginBottom: 16,
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 10,
    },
    activeTab: {
        backgroundColor: '#3b82f6',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#94a3b8',
    },
    activeTabText: {
        color: '#ffffff',
    },
    badge: {
        backgroundColor: '#334155',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 6,
    },
    activeBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#ffffff',
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    orderCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(71, 85, 105, 0.5)',
    },
    confirmedCard: {
        opacity: 0.7,
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    urgencyBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    urgencyText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#ffffff',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#ffffff',
    },
    orderType: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
        textTransform: 'capitalize',
    },
    orderDescription: {
        fontSize: 14,
        color: '#cbd5e1',
        marginBottom: 12,
        lineHeight: 20,
    },
    orderDetails: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    detailLabel: {
        fontSize: 13,
        color: '#94a3b8',
        width: 100,
    },
    detailValue: {
        fontSize: 13,
        color: '#ffffff',
        flex: 1,
    },
    priceValue: {
        fontSize: 14,
        color: '#22c55e',
        fontWeight: '600',
    },
    claimButton: {
        backgroundColor: '#3b82f6',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 12,
    },
    buttonDisabled: {
        backgroundColor: '#475569',
        opacity: 0.6,
    },
    claimButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#ffffff',
    },
    actionButton: {
        backgroundColor: '#3b82f6',
        borderRadius: 10,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 12,
    },
    actionButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 10,
    },
    completeButton: {
        flex: 2,
        backgroundColor: '#22c55e',
    },
    refuseButton: {
        flex: 1,
        backgroundColor: '#ef4444',
    },
    confirmedInfo: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    confirmedText: {
        fontSize: 14,
        color: '#22c55e',
        fontWeight: '600',
    },
    confirmedAmount: {
        fontSize: 18,
        color: '#ffffff',
        fontWeight: '700',
        marginTop: 4,
    },
    pendingConfirmation: {
        backgroundColor: 'rgba(249, 115, 22, 0.2)',
        borderRadius: 8,
        padding: 12,
        marginTop: 12,
        alignItems: 'center',
    },
    pendingText: {
        color: '#f97316',
        fontSize: 14,
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 18,
        color: '#94a3b8',
        fontWeight: '500',
    },
    emptySubtext: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 4,
    },
    // Finances
    financesContainer: {
        flex: 1,
        paddingHorizontal: 20,
    },
    summaryRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    summaryCard: {
        flex: 1,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    summaryLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
    },
    summaryCurrency: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
        marginTop: 20,
        marginBottom: 12,
    },
    earningRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    earningLeft: {
        flex: 1,
    },
    earningType: {
        fontSize: 14,
        fontWeight: '500',
        color: '#ffffff',
        textTransform: 'capitalize',
    },
    earningArea: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 2,
    },
    earningRight: {
        alignItems: 'flex-end',
    },
    earningAmount: {
        fontSize: 16,
        fontWeight: '600',
        color: '#22c55e',
    },
    earningStatus: {
        fontSize: 11,
        marginTop: 2,
    },
    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    modalContent: {
        backgroundColor: '#1e293b',
        borderRadius: 20,
        padding: 24,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 8,
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#94a3b8',
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        color: '#cbd5e1',
        marginBottom: 8,
        marginTop: 12,
    },
    modalInput: {
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        color: '#ffffff',
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    reasonOption: {
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 10,
        padding: 14,
        marginBottom: 8,
    },
    reasonSelected: {
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
    },
    reasonText: {
        fontSize: 14,
        color: '#94a3b8',
        textTransform: 'capitalize',
    },
    reasonTextSelected: {
        color: '#ffffff',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 24,
    },
    cancelButton: {
        flex: 1,
        backgroundColor: '#334155',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 16,
        color: '#ffffff',
        fontWeight: '500',
    },
    submitButton: {
        flex: 1,
        backgroundColor: '#22c55e',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
    },
    submitButtonText: {
        fontSize: 16,
        color: '#ffffff',
        fontWeight: '600',
    },
});
