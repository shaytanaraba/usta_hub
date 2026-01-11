/**
 * Admin Dashboard - v5
 * Tabs: Overview, Orders, Masters, Commission, Settings
 * Full administrative control with premium dark theme
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
import ordersService, { ORDER_STATUS } from '../services/orders';
import earningsService from '../services/earnings';
import { supabase } from '../lib/supabase';
import { useToast } from '../contexts/ToastContext';

const LOG_PREFIX = '[AdminDashboard]';

// Status colors
const STATUS_COLORS = {
    placed: '#3b82f6',
    claimed: '#f59e0b',
    started: '#8b5cf6',
    completed: '#f97316',
    confirmed: '#22c55e',
    canceled_by_master: '#ef4444',
};

export default function AdminDashboard({ navigation, route }) {
    const [user, setUser] = useState(route.params?.user || null);
    const [activeTab, setActiveTab] = useState('overview');
    const [stats, setStats] = useState({});
    const [commissionStats, setCommissionStats] = useState({});
    const [orders, setOrders] = useState([]);
    const [masters, setMasters] = useState([]);
    const [mastersWithDebt, setMastersWithDebt] = useState([]);
    const [dispatchers, setDispatchers] = useState([]);
    const [settings, setSettings] = useState({});
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    // Modals
    const [selectedMaster, setSelectedMaster] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentData, setPaymentData] = useState({ amount: '', method: 'cash', reference: '' });
    const [showReassignModal, setShowReassignModal] = useState(false);
    const [reassignSource, setReassignSource] = useState(null);
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

            await Promise.all([
                loadStats(),
                loadOrders(),
                loadMasters(),
                loadDispatchers(),
                loadCommissionData(),
                loadSettings()
            ]);
        } catch (error) {
            console.error(`${LOG_PREFIX} loadData error:`, error);
        } finally {
            setLoading(false);
        }
    };

    const loadStats = async () => {
        const platformStats = await ordersService.getPlatformStats();
        setStats(platformStats);
    };

    const loadOrders = async () => {
        const allOrders = await ordersService.getAllOrders();
        setOrders(allOrders);
    };

    const loadMasters = async () => {
        const allMasters = await authService.getAllMasters();
        setMasters(allMasters);
    };

    const loadDispatchers = async () => {
        const allDispatchers = await authService.getDispatchersWithWorkload();
        setDispatchers(allDispatchers);
    };

    const loadCommissionData = async () => {
        const [commStats, debtors] = await Promise.all([
            earningsService.getCommissionStats(),
            earningsService.getCommissionCollectionStatus()
        ]);
        setCommissionStats(commStats);
        setMastersWithDebt(debtors);
    };

    const loadSettings = async () => {
        try {
            const { data } = await supabase.from('platform_settings').select('*').single();
            setSettings(data || {});
        } catch (error) {
            console.error(`${LOG_PREFIX} loadSettings error:`, error);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    // ============================================
    // ADMIN ACTIONS
    // ============================================

    const handleVerifyMaster = async (masterId, verify) => {
        console.log(`${LOG_PREFIX} ${verify ? 'Verifying' : 'Unverifying'} master: ${masterId}`);
        setActionLoading(true);

        try {
            const result = verify
                ? await authService.verifyMaster(masterId)
                : await authService.unverifyMaster(masterId);

            if (result.success) {
                showToast?.(verify ? 'Master verified!' : 'Master unverified', 'success');
                await loadMasters();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} verify error:`, error);
            showToast?.('Action failed', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRecordPayment = async () => {
        console.log(`${LOG_PREFIX} Recording payment for master: ${selectedMaster?.id}`);

        if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
            showToast?.('Please enter valid amount', 'error');
            return;
        }

        setActionLoading(true);

        try {
            const result = await earningsService.recordCommissionPayment(
                selectedMaster.id,
                {
                    amount: parseFloat(paymentData.amount),
                    paymentMethod: paymentData.method,
                    paymentReference: paymentData.reference,
                },
                user.id
            );

            if (result.success) {
                showToast?.(result.message, 'success');
                setShowPaymentModal(false);
                setPaymentData({ amount: '', method: 'cash', reference: '' });
                await loadCommissionData();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} recordPayment error:`, error);
            showToast?.('Failed to record payment', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleUpdateSettings = async (key, value) => {
        try {
            const updates = { [key]: value };
            const { error } = await supabase
                .from('platform_settings')
                .update(updates)
                .eq('id', 1);

            if (error) throw error;
            showToast?.('Settings updated', 'success');
            await loadSettings();
        } catch (error) {
            console.error(`${LOG_PREFIX} updateSettings error:`, error);
            showToast?.('Failed to update', 'error');
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
            Alert.alert('Logout', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', onPress: doLogout }
            ]);
        }
    };

    // ============================================
    // STAFF MANAGEMENT ACTIONS
    // ============================================

    const handleToggleDispatcherActive = async (dispatcher, newStatus) => {
        const action = newStatus ? 'activate' : 'deactivate';
        const confirmMessage = newStatus
            ? `Activate ${dispatcher.full_name}? They will be able to login again.`
            : `Deactivate ${dispatcher.full_name}? They will not be able to login.`;

        const doToggle = async () => {
            setActionLoading(true);
            try {
                const result = await authService.toggleDispatcherActive(dispatcher.id, newStatus);

                if (result.success) {
                    showToast?.(result.message, 'success');
                    await loadDispatchers();
                } else {
                    // Handle case where dispatcher has active orders
                    if (result.errorCode === 'ACTIVE_ORDERS_EXIST') {
                        if (Platform.OS === 'web') {
                            if (window.confirm(`${result.message}\n\nWould you like to reassign their orders now?`)) {
                                setReassignSource(dispatcher);
                                setShowReassignModal(true);
                            }
                        } else {
                            Alert.alert(
                                'Active Orders Exist',
                                `${result.message}\n\nReassign their orders first?`,
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    {
                                        text: 'Reassign Orders',
                                        onPress: () => {
                                            setReassignSource(dispatcher);
                                            setShowReassignModal(true);
                                        }
                                    }
                                ]
                            );
                        }
                    } else {
                        showToast?.(result.message, 'error');
                    }
                }
            } catch (error) {
                console.error(`${LOG_PREFIX} toggleDispatcher error:`, error);
                showToast?.('Action failed', 'error');
            } finally {
                setActionLoading(false);
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(confirmMessage)) {
                await doToggle();
            }
        } else {
            Alert.alert(
                `${action.charAt(0).toUpperCase() + action.slice(1)} Dispatcher`,
                confirmMessage,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: action.charAt(0).toUpperCase() + action.slice(1), onPress: doToggle }
                ]
            );
        }
    };

    const handleReassignOrders = async (targetDispatcher) => {
        if (!reassignSource || !targetDispatcher) return;

        setActionLoading(true);
        try {
            const result = await authService.reassignDispatcherOrders(
                reassignSource.id,
                targetDispatcher.id,
                `Orders reassigned from ${reassignSource.full_name} to ${targetDispatcher.full_name}`
            );

            if (result.success) {
                showToast?.(result.message, 'success');
                setShowReassignModal(false);
                setReassignSource(null);
                await loadDispatchers();
                await loadOrders();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} reassignOrders error:`, error);
            showToast?.('Failed to reassign orders', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // ============================================
    // RENDER COMPONENTS
    // ============================================

    const renderHeader = () => (
        <View style={styles.header}>
            <View>
                <Text style={styles.welcomeText}>Administrator</Text>
                <Text style={styles.userName}>{user?.full_name || 'Admin'}</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
        </View>
    );

    const renderTabs = () => (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
            <View style={styles.tabsContainer}>
                {[
                    { key: 'overview', label: '📊 Overview' },
                    { key: 'orders', label: '📋 Orders' },
                    { key: 'masters', label: '🔧 Masters' },
                    { key: 'staff', label: '👥 Staff' },
                    { key: 'commission', label: '💰 Commission' },
                    { key: 'settings', label: '⚙️ Settings' }
                ].map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                        onPress={() => setActiveTab(tab.key)}
                    >
                        <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </ScrollView>
    );

    const renderOverview = () => (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Platform Statistics</Text>

            <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: '#3b82f6' }]}>
                    <Text style={styles.statValue}>{stats.totalOrders || 0}</Text>
                    <Text style={styles.statLabel}>Total Orders</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#8b5cf6' }]}>
                    <Text style={styles.statValue}>{stats.activeJobs || 0}</Text>
                    <Text style={styles.statLabel}>Active Jobs</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#f59e0b' }]}>
                    <Text style={styles.statValue}>{stats.completedOrders || 0}</Text>
                    <Text style={styles.statLabel}>Awaiting Confirm</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#22c55e' }]}>
                    <Text style={styles.statValue}>{stats.confirmedOrders || 0}</Text>
                    <Text style={styles.statLabel}>Confirmed</Text>
                </View>
            </View>

            <Text style={styles.sectionTitle}>Financial Overview</Text>

            <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: '#22c55e' }]}>
                    <Text style={styles.statValue}>{stats.totalRevenue?.toFixed(0) || 0}</Text>
                    <Text style={styles.statLabel}>Total Revenue (сом)</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#f59e0b' }]}>
                    <Text style={styles.statValue}>{commissionStats.totalOutstanding?.toFixed(0) || 0}</Text>
                    <Text style={styles.statLabel}>Outstanding (сом)</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#3b82f6' }]}>
                    <Text style={styles.statValue}>{commissionStats.totalCollected?.toFixed(0) || 0}</Text>
                    <Text style={styles.statLabel}>Collected (сом)</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#ef4444' }]}>
                    <Text style={styles.statValue}>{commissionStats.mastersWithDebt || 0}</Text>
                    <Text style={styles.statLabel}>Masters with Debt</Text>
                </View>
            </View>

            <View style={{ height: 100 }} />
        </ScrollView>
    );

    const renderOrders = () => (
        <FlatList
            data={orders}
            renderItem={({ item }) => (
                <View style={styles.orderCard}>
                    <View style={styles.orderHeader}>
                        <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
                            <Text style={styles.statusText}>{item.status?.replace(/_/g, ' ').toUpperCase()}</Text>
                        </View>
                        <Text style={styles.orderType}>{item.service_type}</Text>
                    </View>

                    <View style={styles.orderRow}>
                        <Text style={styles.orderLabel}>Client:</Text>
                        <Text style={styles.orderValue}>{item.client?.full_name || 'N/A'}</Text>
                    </View>

                    <View style={styles.orderRow}>
                        <Text style={styles.orderLabel}>Master:</Text>
                        <Text style={styles.orderValue}>{item.master?.full_name || 'Unassigned'}</Text>
                    </View>

                    <View style={styles.orderRow}>
                        <Text style={styles.orderLabel}>Dispatcher:</Text>
                        <Text style={styles.orderValue}>{item.dispatcher?.full_name || 'N/A'}</Text>
                    </View>

                    {item.final_price && (
                        <View style={styles.orderRow}>
                            <Text style={styles.orderLabel}>Final Price:</Text>
                            <Text style={styles.priceValue}>{item.final_price} сом</Text>
                        </View>
                    )}
                </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
            ListEmptyComponent={
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No orders</Text>
                </View>
            }
        />
    );

    const renderMasters = () => (
        <FlatList
            data={masters}
            renderItem={({ item }) => (
                <View style={styles.masterCard}>
                    <View style={styles.masterHeader}>
                        <View>
                            <Text style={styles.masterName}>{item.full_name}</Text>
                            <Text style={styles.masterPhone}>{item.phone}</Text>
                        </View>
                        <View style={[
                            styles.verificationBadge,
                            item.is_verified ? styles.verified : styles.unverified
                        ]}>
                            <Text style={styles.verificationText}>
                                {item.is_verified ? '✓ Verified' : '✗ Unverified'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.masterStats}>
                        <View style={styles.masterStat}>
                            <Text style={styles.masterStatValue}>{item.completed_jobs_count || 0}</Text>
                            <Text style={styles.masterStatLabel}>Jobs</Text>
                        </View>
                        <View style={styles.masterStat}>
                            <Text style={styles.masterStatValue}>{Number(item.rating || 0).toFixed(1)}</Text>
                            <Text style={styles.masterStatLabel}>Rating</Text>
                        </View>
                        <View style={styles.masterStat}>
                            <Text style={styles.masterStatValue}>{item.refusal_count || 0}</Text>
                            <Text style={styles.masterStatLabel}>Refusals</Text>
                        </View>
                    </View>

                    <View style={styles.masterActions}>
                        {item.is_verified ? (
                            <TouchableOpacity
                                style={[styles.verifyButton, { backgroundColor: '#ef4444' }]}
                                onPress={() => handleVerifyMaster(item.id, false)}
                            >
                                <Text style={styles.verifyButtonText}>Unverify</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={[styles.verifyButton, { backgroundColor: '#22c55e' }]}
                                onPress={() => handleVerifyMaster(item.id, true)}
                            >
                                <Text style={styles.verifyButtonText}>Verify</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
            ListEmptyComponent={
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>No masters registered</Text>
                </View>
            }
        />
    );

    const renderCommission = () => (
        <FlatList
            data={mastersWithDebt}
            renderItem={({ item }) => (
                <View style={styles.debtCard}>
                    <View style={styles.debtHeader}>
                        <View>
                            <Text style={styles.debtName}>{item.full_name}</Text>
                            <Text style={styles.debtPhone}>{item.phone}</Text>
                        </View>
                        <View style={styles.debtAmount}>
                            <Text style={styles.debtValue}>{Number(item.total_commission_owed).toFixed(0)}</Text>
                            <Text style={styles.debtLabel}>сом owed</Text>
                        </View>
                    </View>

                    <View style={styles.debtStats}>
                        <Text style={styles.debtStat}>
                            Total Earned: {Number(item.total_earnings).toFixed(0)} сом
                        </Text>
                        <Text style={styles.debtStat}>
                            Already Paid: {Number(item.total_commission_paid).toFixed(0)} сом
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={styles.recordPaymentButton}
                        onPress={() => { setSelectedMaster(item); setShowPaymentModal(true); }}
                    >
                        <Text style={styles.recordPaymentText}>Record Payment</Text>
                    </TouchableOpacity>
                </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
            ListEmptyComponent={
                <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>✓</Text>
                    <Text style={styles.emptyText}>All commissions collected!</Text>
                </View>
            }
        />
    );

    const renderSettings = () => (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Platform Settings</Text>

            <View style={styles.settingCard}>
                <Text style={styles.settingLabel}>Commission Rate (%)</Text>
                <Text style={styles.settingValue}>{(Number(settings.commission_rate || 0) * 100).toFixed(0)}%</Text>
                <View style={styles.settingButtons}>
                    {[10, 15, 20, 25].map(rate => (
                        <TouchableOpacity
                            key={rate}
                            style={[
                                styles.settingButton,
                                settings.commission_rate === rate / 100 && styles.settingButtonActive
                            ]}
                            onPress={() => handleUpdateSettings('commission_rate', rate / 100)}
                        >
                            <Text style={styles.settingButtonText}>{rate}%</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.settingCard}>
                <Text style={styles.settingLabel}>Default Guaranteed Payout (сом)</Text>
                <Text style={styles.settingValue}>{settings.default_guaranteed_payout || 500} сом</Text>
                <View style={styles.settingButtons}>
                    {[300, 500, 700, 1000].map(amount => (
                        <TouchableOpacity
                            key={amount}
                            style={[
                                styles.settingButton,
                                settings.default_guaranteed_payout === amount && styles.settingButtonActive
                            ]}
                            onPress={() => handleUpdateSettings('default_guaranteed_payout', amount)}
                        >
                            <Text style={styles.settingButtonText}>{amount}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <View style={styles.settingCard}>
                <Text style={styles.settingLabel}>Claim Timeout (minutes)</Text>
                <Text style={styles.settingValue}>{settings.claim_timeout_minutes || 30} min</Text>
            </View>

            <View style={styles.settingCard}>
                <Text style={styles.settingLabel}>Order Expiry (hours)</Text>
                <Text style={styles.settingValue}>{settings.order_expiry_hours || 48} hours</Text>
            </View>

            <View style={{ height: 100 }} />
        </ScrollView>
    );

    const renderStaff = () => (
        <FlatList
            data={dispatchers}
            renderItem={({ item }) => (
                <View style={[styles.staffCard, !item.is_active && styles.staffCardInactive]}>
                    <View style={styles.staffHeader}>
                        <View style={styles.staffInfo}>
                            <Text style={styles.staffName}>{item.full_name}</Text>
                            <Text style={styles.staffContact}>{item.phone || item.email}</Text>
                        </View>
                        <View style={styles.staffBadges}>
                            <View style={[
                                styles.workloadBadge,
                                item.active_order_count > 0 ? styles.workloadActive : styles.workloadEmpty
                            ]}>
                                <Text style={styles.workloadText}>
                                    {item.active_order_count || 0} active
                                </Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.staffStats}>
                        <View style={styles.staffStat}>
                            <Text style={styles.staffStatValue}>{item.active_order_count || 0}</Text>
                            <Text style={styles.staffStatLabel}>Active Orders</Text>
                        </View>
                        <View style={styles.staffStat}>
                            <Text style={styles.staffStatValue}>{item.total_order_count || 0}</Text>
                            <Text style={styles.staffStatLabel}>Total Orders</Text>
                        </View>
                        <View style={styles.staffStat}>
                            <Text style={styles.staffStatValue}>{item.max_active_cases || 10}</Text>
                            <Text style={styles.staffStatLabel}>Max Cases</Text>
                        </View>
                    </View>

                    <View style={styles.staffActions}>
                        <TouchableOpacity
                            style={[
                                styles.statusToggle,
                                item.is_active ? styles.statusActive : styles.statusInactive
                            ]}
                            onPress={() => handleToggleDispatcherActive(item, !item.is_active)}
                            disabled={actionLoading}
                        >
                            <Text style={styles.statusToggleText}>
                                {item.is_active ? '✓ Active' : '✗ Inactive'}
                            </Text>
                        </TouchableOpacity>

                        {item.active_order_count > 0 && (
                            <TouchableOpacity
                                style={styles.reassignButton}
                                onPress={() => {
                                    setReassignSource(item);
                                    setShowReassignModal(true);
                                }}
                            >
                                <Text style={styles.reassignButtonText}>Reassign</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
            ListEmptyComponent={
                <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>👥</Text>
                    <Text style={styles.emptyText}>No staff members</Text>
                </View>
            }
            ListHeaderComponent={
                <View style={styles.staffListHeader}>
                    <Text style={styles.sectionTitle}>Staff Management</Text>
                    <Text style={styles.staffSubtitle}>
                        {dispatchers.filter(d => d.is_active).length} active of {dispatchers.length} total
                    </Text>
                </View>
            }
        />
    );

    const renderReassignModal = () => {
        const activeDispatchers = dispatchers.filter(
            d => d.is_active && d.id !== reassignSource?.id
        );

        return (
            <Modal visible={showReassignModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Reassign Orders</Text>
                        <Text style={styles.modalSubtitle}>
                            Moving {reassignSource?.active_order_count || 0} orders from {reassignSource?.full_name}
                        </Text>

                        <Text style={styles.inputLabel}>Select Target Dispatcher</Text>

                        <ScrollView style={styles.dispatcherList}>
                            {activeDispatchers.length === 0 ? (
                                <Text style={styles.noDispatchersText}>
                                    No other active dispatchers available
                                </Text>
                            ) : (
                                activeDispatchers.map(dispatcher => (
                                    <TouchableOpacity
                                        key={dispatcher.id}
                                        style={styles.dispatcherOption}
                                        onPress={() => handleReassignOrders(dispatcher)}
                                        disabled={actionLoading}
                                    >
                                        <View>
                                            <Text style={styles.dispatcherOptionName}>
                                                {dispatcher.full_name}
                                            </Text>
                                            <Text style={styles.dispatcherOptionInfo}>
                                                {dispatcher.active_order_count || 0} active orders
                                            </Text>
                                        </View>
                                        {actionLoading ? (
                                            <ActivityIndicator color="#3b82f6" size="small" />
                                        ) : (
                                            <Text style={styles.dispatcherOptionArrow}>→</Text>
                                        )}
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>

                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => {
                                setShowReassignModal(false);
                                setReassignSource(null);
                            }}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        );
    };

    const renderPaymentModal = () => (
        <Modal visible={showPaymentModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Record Commission Payment</Text>
                    <Text style={styles.modalSubtitle}>
                        {selectedMaster?.full_name} - Owes: {Number(selectedMaster?.total_commission_owed || 0).toFixed(0)} сом
                    </Text>

                    <Text style={styles.inputLabel}>Amount (сом)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Enter amount"
                        placeholderTextColor="#64748b"
                        keyboardType="numeric"
                        value={paymentData.amount}
                        onChangeText={(text) => setPaymentData({ ...paymentData, amount: text })}
                    />

                    <Text style={styles.inputLabel}>Payment Method</Text>
                    <View style={styles.optionRow}>
                        {['cash', 'transfer', 'card'].map(method => (
                            <TouchableOpacity
                                key={method}
                                style={[styles.optionButton, paymentData.method === method && styles.optionSelected]}
                                onPress={() => setPaymentData({ ...paymentData, method })}
                            >
                                <Text style={[styles.optionText, paymentData.method === method && styles.optionTextSelected]}>
                                    {method}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={styles.inputLabel}>Reference/Receipt #</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Optional reference"
                        placeholderTextColor="#64748b"
                        value={paymentData.reference}
                        onChangeText={(text) => setPaymentData({ ...paymentData, reference: text })}
                    />

                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => setShowPaymentModal(false)}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.submitButton}
                            onPress={handleRecordPayment}
                            disabled={actionLoading}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.submitButtonText}>Record</Text>
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

            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'orders' && renderOrders()}
            {activeTab === 'masters' && renderMasters()}
            {activeTab === 'staff' && renderStaff()}
            {activeTab === 'commission' && renderCommission()}
            {activeTab === 'settings' && renderSettings()}

            {renderPaymentModal()}
            {renderReassignModal()}
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
    logoutButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ef4444',
    },
    logoutText: {
        fontSize: 14,
        color: '#ef4444',
    },
    tabsScroll: {
        maxHeight: 50,
        marginBottom: 16,
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 8,
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
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
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    listContent: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#ffffff',
        marginBottom: 16,
        marginTop: 8,
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
    },
    statCard: {
        width: '47%',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 28,
        fontWeight: '700',
        color: '#ffffff',
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 4,
    },
    orderCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(71, 85, 105, 0.5)',
    },
    orderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
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
    orderRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    orderLabel: {
        fontSize: 13,
        color: '#94a3b8',
        width: 90,
    },
    orderValue: {
        fontSize: 13,
        color: '#ffffff',
        flex: 1,
    },
    priceValue: {
        fontSize: 14,
        color: '#22c55e',
        fontWeight: '600',
    },
    masterCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(71, 85, 105, 0.5)',
    },
    masterHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    masterName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    masterPhone: {
        fontSize: 13,
        color: '#94a3b8',
        marginTop: 2,
    },
    verificationBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
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
    masterStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#0f172a',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
    },
    masterStat: {
        alignItems: 'center',
    },
    masterStatValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
    },
    masterStatLabel: {
        fontSize: 11,
        color: '#94a3b8',
    },
    masterActions: {
        flexDirection: 'row',
        gap: 10,
    },
    verifyButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    verifyButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    debtCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#f59e0b',
    },
    debtHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    debtName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    debtPhone: {
        fontSize: 13,
        color: '#94a3b8',
    },
    debtAmount: {
        alignItems: 'flex-end',
    },
    debtValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#f59e0b',
    },
    debtLabel: {
        fontSize: 12,
        color: '#f59e0b',
    },
    debtStats: {
        marginBottom: 12,
    },
    debtStat: {
        fontSize: 13,
        color: '#94a3b8',
        marginBottom: 2,
    },
    recordPaymentButton: {
        backgroundColor: '#22c55e',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
    },
    recordPaymentText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    settingCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    settingLabel: {
        fontSize: 14,
        color: '#94a3b8',
        marginBottom: 8,
    },
    settingValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 12,
    },
    settingButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    settingButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
    },
    settingButtonActive: {
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
    },
    settingButtonText: {
        fontSize: 14,
        color: '#ffffff',
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
        color: '#f59e0b',
        marginBottom: 16,
    },
    inputLabel: {
        fontSize: 14,
        color: '#cbd5e1',
        marginBottom: 8,
        marginTop: 8,
    },
    input: {
        backgroundColor: '#0f172a',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        color: '#ffffff',
    },
    optionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    optionButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#334155',
        backgroundColor: '#0f172a',
        alignItems: 'center',
    },
    optionSelected: {
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
    },
    optionText: {
        fontSize: 14,
        color: '#94a3b8',
        textTransform: 'capitalize',
    },
    optionTextSelected: {
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
    // Staff Management Styles
    staffListHeader: {
        paddingHorizontal: 20,
        paddingBottom: 12,
    },
    staffSubtitle: {
        fontSize: 13,
        color: '#94a3b8',
        marginTop: 4,
    },
    staffCard: {
        backgroundColor: 'rgba(30, 41, 59, 0.9)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(71, 85, 105, 0.5)',
    },
    staffCardInactive: {
        opacity: 0.6,
        borderColor: '#ef4444',
    },
    staffHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    staffInfo: {
        flex: 1,
    },
    staffName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    staffContact: {
        fontSize: 13,
        color: '#94a3b8',
        marginTop: 2,
    },
    staffBadges: {
        flexDirection: 'row',
        gap: 8,
    },
    workloadBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    workloadActive: {
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
        borderWidth: 1,
        borderColor: '#3b82f6',
    },
    workloadEmpty: {
        backgroundColor: 'rgba(71, 85, 105, 0.2)',
        borderWidth: 1,
        borderColor: '#475569',
    },
    workloadText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#ffffff',
    },
    staffStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: '#0f172a',
        borderRadius: 10,
        padding: 12,
        marginBottom: 12,
    },
    staffStat: {
        alignItems: 'center',
    },
    staffStatValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#ffffff',
    },
    staffStatLabel: {
        fontSize: 11,
        color: '#94a3b8',
    },
    staffActions: {
        flexDirection: 'row',
        gap: 10,
    },
    statusToggle: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        borderWidth: 1,
    },
    statusActive: {
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        borderColor: '#22c55e',
    },
    statusInactive: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderColor: '#ef4444',
    },
    statusToggleText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    reassignButton: {
        flex: 1,
        backgroundColor: '#f59e0b',
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
    },
    reassignButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ffffff',
    },
    // Reassignment Modal
    dispatcherList: {
        maxHeight: 300,
        marginVertical: 12,
    },
    dispatcherOption: {
        backgroundColor: '#0f172a',
        borderRadius: 10,
        padding: 14,
        marginBottom: 8,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    dispatcherOptionName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    dispatcherOptionInfo: {
        fontSize: 13,
        color: '#94a3b8',
        marginTop: 2,
    },
    dispatcherOptionArrow: {
        fontSize: 24,
        color: '#3b82f6',
    },
    noDispatchersText: {
        fontSize: 14,
        color: '#94a3b8',
        textAlign: 'center',
        paddingVertical: 20,
    },
});
