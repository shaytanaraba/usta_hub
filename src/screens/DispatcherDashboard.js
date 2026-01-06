/**
 * Dispatcher Dashboard - v5
 * Tabs: Create Order, My Orders, Pending Confirmation
 * Premium dark theme with full dispatcher workflow
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
import { useToast } from '../contexts/ToastContext';

const LOG_PREFIX = '[DispatcherDashboard]';

// Status colors
const STATUS_COLORS = {
    placed: '#3b82f6',
    claimed: '#f59e0b',
    started: '#8b5cf6',
    completed: '#f97316',
    confirmed: '#22c55e',
    canceled_by_master: '#ef4444',
    canceled_by_client: '#ef4444',
};

export default function DispatcherDashboard({ navigation, route }) {
    const [user, setUser] = useState(route.params?.user || null);
    const [activeTab, setActiveTab] = useState('orders');
    const [orders, setOrders] = useState([]);
    const [pendingOrders, setPendingOrders] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);

    // Create order form
    const [newOrder, setNewOrder] = useState({
        clientName: '',
        clientPhone: '',
        pricingType: 'unknown',
        initialPrice: '',
        serviceType: 'repair',
        urgency: 'planned',
        problemDescription: '',
        area: '',
        fullAddress: '',
        preferredDate: '',
        preferredTime: '',
    });

    // Modals
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentData, setPaymentData] = useState({ method: 'cash', proofUrl: '' });
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
                await loadOrders(currentUser.id);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} loadData error:`, error);
        } finally {
            setLoading(false);
        }
    };

    const loadOrders = async (dispatcherId) => {
        const allOrders = await ordersService.getDispatcherOrders(dispatcherId);
        setOrders(allOrders);
        setPendingOrders(allOrders.filter(o => o.status === ORDER_STATUS.COMPLETED));
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    // ============================================
    // ORDER ACTIONS
    // ============================================

    const handleCreateOrder = async () => {
        console.log(`${LOG_PREFIX} Creating order...`);

        if (!newOrder.clientPhone || !newOrder.problemDescription || !newOrder.area || !newOrder.fullAddress) {
            showToast?.('Please fill all required fields', 'error');
            return;
        }

        setActionLoading(true);

        try {
            // For MVP, we create a "ghost" client or use existing
            // In production, this would lookup/create client by phone
            const clientId = user.id; // Placeholder - should be real client lookup

            const result = await ordersService.createOrder({
                clientId,
                pricingType: newOrder.pricingType,
                initialPrice: newOrder.pricingType === 'fixed' ? parseFloat(newOrder.initialPrice) : null,
                serviceType: newOrder.serviceType,
                urgency: newOrder.urgency,
                problemDescription: newOrder.problemDescription,
                area: newOrder.area,
                fullAddress: newOrder.fullAddress,
                preferredDate: newOrder.preferredDate || null,
                preferredTime: newOrder.preferredTime || null,
            }, user.id);

            if (result.success) {
                showToast?.('Order created!', 'success');
                setNewOrder({
                    clientName: '',
                    clientPhone: '',
                    pricingType: 'unknown',
                    initialPrice: '',
                    serviceType: 'repair',
                    urgency: 'planned',
                    problemDescription: '',
                    area: '',
                    fullAddress: '',
                    preferredDate: '',
                    preferredTime: '',
                });
                setActiveTab('orders');
                await loadData();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} createOrder error:`, error);
            showToast?.('Failed to create order', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleConfirmPayment = async () => {
        console.log(`${LOG_PREFIX} Confirming payment for: ${selectedOrder?.id}`);

        if (!paymentData.method) {
            showToast?.('Please select payment method', 'error');
            return;
        }

        if (paymentData.method === 'transfer' && !paymentData.proofUrl) {
            showToast?.('Proof required for bank transfers', 'error');
            return;
        }

        setActionLoading(true);

        try {
            const result = await ordersService.confirmPayment(selectedOrder.id, user.id, {
                paymentMethod: paymentData.method,
                paymentProofUrl: paymentData.proofUrl || null
            });

            if (result.success) {
                showToast?.('Payment confirmed!', 'success');
                setShowPaymentModal(false);
                setPaymentData({ method: 'cash', proofUrl: '' });
                await loadData();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} confirmPayment error:`, error);
            showToast?.('Failed to confirm payment', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelOrder = async (orderId) => {
        Alert.alert(
            'Cancel Order',
            'Are you sure you want to cancel this order?',
            [
                { text: 'No', style: 'cancel' },
                {
                    text: 'Yes, Cancel',
                    style: 'destructive',
                    onPress: async () => {
                        const result = await ordersService.cancelByClient(orderId, user.id, 'client_request');
                        if (result.success) {
                            showToast?.('Order canceled', 'success');
                            await loadData();
                        } else {
                            showToast?.(result.message, 'error');
                        }
                    }
                }
            ]
        );
    };

    const handleReopenOrder = async (orderId) => {
        const result = await ordersService.reopenOrder(orderId, user.id);
        if (result.success) {
            showToast?.('Order reopened and returned to pool', 'success');
            await loadData();
        } else {
            showToast?.(result.message, 'error');
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
    // RENDER COMPONENTS
    // ============================================

    const renderHeader = () => (
        <View style={styles.header}>
            <View>
                <Text style={styles.welcomeText}>Dispatcher</Text>
                <Text style={styles.userName}>{user?.full_name || 'Dispatcher'}</Text>
            </View>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
                <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
        </View>
    );

    const renderTabs = () => (
        <View style={styles.tabsContainer}>
            {[
                { key: 'create', label: '+ Create' },
                { key: 'orders', label: 'My Orders', count: orders.length },
                { key: 'pending', label: 'Pending', count: pendingOrders.length }
            ].map(tab => (
                <TouchableOpacity
                    key={tab.key}
                    style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                    onPress={() => setActiveTab(tab.key)}
                >
                    <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                        {tab.label}
                    </Text>
                    {tab.count !== undefined && tab.count > 0 && (
                        <View style={[styles.badge, activeTab === tab.key && styles.activeBadge]}>
                            <Text style={styles.badgeText}>{tab.count}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderCreateOrder = () => (
        <ScrollView style={styles.formContainer} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>New Order</Text>

            {/* Client Info */}
            <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Client Information</Text>

                <Text style={styles.inputLabel}>Client Name</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Enter client name"
                    placeholderTextColor="#64748b"
                    value={newOrder.clientName}
                    onChangeText={(text) => setNewOrder({ ...newOrder, clientName: text })}
                />

                <Text style={styles.inputLabel}>Phone Number *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="+996 XXX XXX XXX"
                    placeholderTextColor="#64748b"
                    keyboardType="phone-pad"
                    value={newOrder.clientPhone}
                    onChangeText={(text) => setNewOrder({ ...newOrder, clientPhone: text })}
                />
            </View>

            {/* Service Details */}
            <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Service Details</Text>

                <Text style={styles.inputLabel}>Service Type</Text>
                <View style={styles.optionRow}>
                    {['repair', 'installation', 'inspection', 'maintenance'].map(type => (
                        <TouchableOpacity
                            key={type}
                            style={[styles.optionButton, newOrder.serviceType === type && styles.optionSelected]}
                            onPress={() => setNewOrder({ ...newOrder, serviceType: type })}
                        >
                            <Text style={[styles.optionText, newOrder.serviceType === type && styles.optionTextSelected]}>
                                {type}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={styles.inputLabel}>Urgency</Text>
                <View style={styles.optionRow}>
                    {['planned', 'urgent', 'emergency'].map(urg => (
                        <TouchableOpacity
                            key={urg}
                            style={[
                                styles.optionButton,
                                newOrder.urgency === urg && styles.optionSelected,
                                urg === 'emergency' && { borderColor: '#ef4444' }
                            ]}
                            onPress={() => setNewOrder({ ...newOrder, urgency: urg })}
                        >
                            <Text style={[styles.optionText, newOrder.urgency === urg && styles.optionTextSelected]}>
                                {urg}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={styles.inputLabel}>Problem Description *</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe the problem..."
                    placeholderTextColor="#64748b"
                    multiline
                    numberOfLines={3}
                    value={newOrder.problemDescription}
                    onChangeText={(text) => setNewOrder({ ...newOrder, problemDescription: text })}
                />
            </View>

            {/* Location */}
            <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Location</Text>

                <Text style={styles.inputLabel}>Area/District *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g., Bishkek, South District"
                    placeholderTextColor="#64748b"
                    value={newOrder.area}
                    onChangeText={(text) => setNewOrder({ ...newOrder, area: text })}
                />

                <Text style={styles.inputLabel}>Full Address *</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Street, building, apartment"
                    placeholderTextColor="#64748b"
                    value={newOrder.fullAddress}
                    onChangeText={(text) => setNewOrder({ ...newOrder, fullAddress: text })}
                />
            </View>

            {/* Pricing */}
            <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Pricing</Text>

                <Text style={styles.inputLabel}>Pricing Type</Text>
                <View style={styles.optionRow}>
                    <TouchableOpacity
                        style={[styles.optionButton, newOrder.pricingType === 'unknown' && styles.optionSelected]}
                        onPress={() => setNewOrder({ ...newOrder, pricingType: 'unknown' })}
                    >
                        <Text style={[styles.optionText, newOrder.pricingType === 'unknown' && styles.optionTextSelected]}>
                            Master Quotes
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.optionButton, newOrder.pricingType === 'fixed' && styles.optionSelected]}
                        onPress={() => setNewOrder({ ...newOrder, pricingType: 'fixed' })}
                    >
                        <Text style={[styles.optionText, newOrder.pricingType === 'fixed' && styles.optionTextSelected]}>
                            Client Offers
                        </Text>
                    </TouchableOpacity>
                </View>

                {newOrder.pricingType === 'fixed' && (
                    <>
                        <Text style={styles.inputLabel}>Offered Price (сом)</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Enter price"
                            placeholderTextColor="#64748b"
                            keyboardType="numeric"
                            value={newOrder.initialPrice}
                            onChangeText={(text) => setNewOrder({ ...newOrder, initialPrice: text })}
                        />
                    </>
                )}
            </View>

            <TouchableOpacity
                style={[styles.createButton, actionLoading && styles.buttonDisabled]}
                onPress={handleCreateOrder}
                disabled={actionLoading}
            >
                {actionLoading ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.createButtonText}>CREATE ORDER</Text>
                )}
            </TouchableOpacity>

            <View style={{ height: 100 }} />
        </ScrollView>
    );

    const renderOrder = ({ item }) => (
        <View style={styles.orderCard}>
            <View style={styles.orderHeader}>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
                    <Text style={styles.statusText}>{item.status?.replace(/_/g, ' ').toUpperCase()}</Text>
                </View>
                <Text style={styles.orderType}>{item.service_type}</Text>
            </View>

            <View style={styles.orderDetails}>
                <Text style={styles.detailLabel}>📍 Address:</Text>
                <Text style={styles.detailValue}>{item.full_address}</Text>
            </View>

            <View style={styles.orderDetails}>
                <Text style={styles.detailLabel}>👤 Client:</Text>
                <Text style={styles.detailValue}>{item.client?.full_name || 'N/A'}</Text>
            </View>

            {item.master && (
                <View style={styles.orderDetails}>
                    <Text style={styles.detailLabel}>🔧 Master:</Text>
                    <Text style={styles.detailValue}>{item.master?.full_name}</Text>
                </View>
            )}

            {item.final_price && (
                <View style={styles.orderDetails}>
                    <Text style={styles.detailLabel}>💰 Final Price:</Text>
                    <Text style={styles.priceValue}>{item.final_price} сом</Text>
                </View>
            )}

            {/* Actions based on status */}
            {item.status === ORDER_STATUS.PLACED && (
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#ef4444' }]}
                    onPress={() => handleCancelOrder(item.id)}
                >
                    <Text style={styles.actionButtonText}>Cancel Order</Text>
                </TouchableOpacity>
            )}

            {item.status === ORDER_STATUS.COMPLETED && (
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#22c55e' }]}
                    onPress={() => { setSelectedOrder(item); setShowPaymentModal(true); }}
                >
                    <Text style={styles.actionButtonText}>✓ Confirm Payment</Text>
                </TouchableOpacity>
            )}

            {(item.status === ORDER_STATUS.CANCELED_BY_MASTER || item.status === ORDER_STATUS.CANCELED_BY_CLIENT) && (
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#3b82f6' }]}
                    onPress={() => handleReopenOrder(item.id)}
                >
                    <Text style={styles.actionButtonText}>↻ Reopen Order</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const renderPaymentModal = () => (
        <Modal visible={showPaymentModal} transparent animationType="slide">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>Confirm Payment</Text>
                    <Text style={styles.modalSubtitle}>
                        Amount: {selectedOrder?.final_price} сом
                    </Text>

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

                    {paymentData.method === 'transfer' && (
                        <>
                            <Text style={styles.inputLabel}>Proof URL (receipt) *</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Link to receipt/screenshot"
                                placeholderTextColor="#64748b"
                                value={paymentData.proofUrl}
                                onChangeText={(text) => setPaymentData({ ...paymentData, proofUrl: text })}
                            />
                        </>
                    )}

                    <View style={styles.modalButtons}>
                        <TouchableOpacity
                            style={styles.cancelButton}
                            onPress={() => setShowPaymentModal(false)}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.submitButton}
                            onPress={handleConfirmPayment}
                            disabled={actionLoading}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.submitButtonText}>Confirm</Text>
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

            {activeTab === 'create' && renderCreateOrder()}

            {activeTab === 'orders' && (
                <FlatList
                    data={orders}
                    renderItem={renderOrder}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>📋</Text>
                            <Text style={styles.emptyText}>No orders yet</Text>
                            <Text style={styles.emptySubtext}>Create your first order</Text>
                        </View>
                    }
                />
            )}

            {activeTab === 'pending' && (
                <FlatList
                    data={pendingOrders}
                    renderItem={renderOrder}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />}
                    ListEmptyComponent={
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyIcon}>✓</Text>
                            <Text style={styles.emptyText}>No pending confirmations</Text>
                        </View>
                    }
                />
            )}

            {renderPaymentModal()}
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
    formContainer: {
        flex: 1,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#ffffff',
        marginBottom: 16,
    },
    formSection: {
        backgroundColor: 'rgba(30, 41, 59, 0.8)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    formSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#3b82f6',
        marginBottom: 12,
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
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    optionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    optionButton: {
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#334155',
        backgroundColor: '#0f172a',
    },
    optionSelected: {
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.2)',
    },
    optionText: {
        fontSize: 13,
        color: '#94a3b8',
        textTransform: 'capitalize',
    },
    optionTextSelected: {
        color: '#ffffff',
    },
    createButton: {
        backgroundColor: '#22c55e',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 8,
    },
    buttonDisabled: {
        opacity: 0.6,
    },
    createButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
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
    actionButton: {
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
        fontSize: 16,
        color: '#22c55e',
        marginBottom: 16,
        fontWeight: '600',
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
