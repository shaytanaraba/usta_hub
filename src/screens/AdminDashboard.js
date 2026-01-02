/**
 * Admin Dashboard - Main Controller
 * Refactored to use modular tab components
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, RefreshControl, ScrollView, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import auth from '../services/auth';
import orderService from '../services/orders';
import settingsService from '../services/settings';
import { useToast } from '../contexts/ToastContext';

// Tab Components
import DashboardTab from '../components/admin/DashboardTab';
import OrdersTab from '../components/admin/OrdersTab';
import PlumbersTab from '../components/admin/PlumbersTab';
import ClientsTab from '../components/admin/ClientsTab';
import ComplianceTabContent from './ComplianceTabContent';

// Modals
import {
    EditClientModal,
    EditOrderModal,
    AddOrderModal,
    EditPlumberModal,
    DeleteConfirmModal,
    StatsDetailModal
} from '../components/admin/CrudModals';

export default function AdminDashboard({ navigation }) {
    const [user, setUser] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [refreshing, setRefreshing] = useState(false);

    // Data
    const [stats, setStats] = useState({});
    const [orders, setOrders] = useState([]);
    const [plumbers, setPlumbers] = useState([]);
    const [plumberStats, setPlumberStats] = useState({});
    const [clients, setClients] = useState([]);
    const [clientStats, setClientStats] = useState({});
    const [disputes, setDisputes] = useState([]);
    const [orderDistribution, setOrderDistribution] = useState({});
    const [settings, setSettings] = useState({ commissionRate: 0.15 });

    // UI State
    const [commissionInput, setCommissionInput] = useState('15');

    // Modals
    const [editClientModal, setEditClientModal] = useState(false);
    const [editOrderModal, setEditOrderModal] = useState(false);
    const [addOrderModal, setAddOrderModal] = useState(false);
    const [editPlumberModal, setEditPlumberModal] = useState(false);
    const [deleteModal, setDeleteModal] = useState(false);
    const [statsModal, setStatsModal] = useState(false);

    const [selectedClient, setSelectedClient] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [selectedPlumber, setSelectedPlumber] = useState(null);
    const [deleteItem, setDeleteItem] = useState(null);
    const [statsData, setStatsData] = useState({ title: '', data: [] });

    // Plumber details reused StatsDetailModal

    const { showToast } = useToast();

    useEffect(() => {
        loadUserData();
        loadData();
    }, []);

    const loadUserData = async () => {
        const currentUser = await auth.getCurrentUser();
        setUser(currentUser);
    };

    const loadData = async () => {
        try {
            const [
                platformStats,
                allOrders,
                allPlumbers,
                allClients,
                allDisputes,
                distribution,
                platformSettings,
            ] = await Promise.all([
                orderService.getPlatformStats(),
                orderService.getAllOrders(),
                auth.getAllPlumbers(),
                auth.getAllClients(),
                orderService.getAllDisputes(),
                orderService.getOrderStatusDistribution(),
                settingsService.getSettings(),
            ]);

            // Add dispute counts to stats
            const openDisputes = allDisputes.filter(d => d.status === 'open' || d.status === 'in_review').length;
            const resolvedDisputes = allDisputes.filter(d => d.status === 'resolved' || d.status === 'closed').length;

            setStats({ ...platformStats, openDisputes, resolvedDisputes });
            setOrders(allOrders);
            setPlumbers(allPlumbers);
            setClients(allClients);
            setDisputes(allDisputes);
            setOrderDistribution(distribution);
            setSettings(platformSettings);

            if (platformSettings.commissionRate) {
                setCommissionInput((platformSettings.commissionRate * 100).toString());
            }

            // Calculate plumber stats locally
            const pStats = {};
            allPlumbers.forEach(p => {
                const pOrders = allOrders.filter(o => o.assignedPlumber?.plumberId === p.id);
                const completed = pOrders.filter(o => o.status === 'verified').length;
                const earnings = pOrders
                    .filter(o => o.status === 'verified')
                    .reduce((sum, o) => sum + (Number(o.completion?.amountCharged) || 0), 0);
                pStats[p.id] = { completed, earnings };
            });
            setPlumberStats(pStats);

            // Calculate client stats locally (Fixed N+1 query issue)
            const cStats = {};
            allClients.forEach(c => {
                const cOrders = allOrders.filter(o => o.clientId === c.id);
                const completed = cOrders.filter(o => o.status === 'verified').length;
                const active = cOrders.filter(o => ['pending', 'claimed', 'in_progress', 'completed'].includes(o.status)).length;
                const totalSpent = cOrders
                    .filter(o => o.status === 'verified')
                    .reduce((sum, o) => sum + (Number(o.completion?.amountCharged) || 0), 0);

                cStats[c.id] = {
                    totalOrders: cOrders.length,
                    activeOrders: active,
                    completedOrders: completed,
                    totalSpent
                };
            });
            setClientStats(cStats);
        } catch (error) {
            console.error('Load data error:', error);
            showToast('Error loading data', 'error');
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    // Stat Click Handlers
    const handleStatClick = (statType) => {
        let title = '';
        let data = [];

        switch (statType) {
            case 'total_orders':
                title = 'All Orders';
                data = orders;
                break;
            case 'active_jobs':
                title = 'Active Jobs';
                data = orders.filter(o => ['claimed', 'in_progress'].includes(o.status));
                break;
            case 'open_disputes':
                title = 'Open Disputes';
                data = disputes.filter(d => d.status === 'open' || d.status === 'in_review');
                break;
            case 'resolved_disputes':
                title = 'Resolved Disputes';
                data = disputes.filter(d => d.status === 'resolved' || d.status === 'closed');
                break;
            case 'revenue':
            case 'commission':
                showToast('Feature coming soon', 'info');
                return;
            default:
                return;
        }

        setStatsData({ title, data });
        setStatsModal(true);
    };

    // Client Handlers
    const handleAddClient = () => {
        setSelectedClient(null);
        setEditClientModal(true);
    };

    const handleEditClient = (client) => {
        setSelectedClient(client);
        setEditClientModal(true);
    };

    const handleDeleteClient = (client) => {
        setDeleteItem({ type: 'client', item: client });
        setDeleteModal(true);
    };

    const handleSaveClient = async () => {
        setEditClientModal(false);
        await loadData();
        showToast('Client saved', 'success');
    };

    // Order Handlers
    const handleAddOrder = () => {
        setAddOrderModal(true);
    };

    const handleSaveNewOrder = async () => {
        setAddOrderModal(false);
        await loadData();
        showToast('Order created successfully', 'success');
    };

    const handleEditOrder = (order) => {
        setSelectedOrder(order);
        setEditOrderModal(true);
    };

    const handleDeleteOrder = (order) => {
        setDeleteItem({ type: 'order', item: order });
        setDeleteModal(true);
    };

    const handleSaveOrder = async () => {
        setEditOrderModal(false);
        await loadData();
        showToast('Order updated', 'success');
    };

    // Plumber Handlers
    const handleAddPlumber = () => {
        setSelectedPlumber(null);
        setEditPlumberModal(true);
    };

    const handleViewPlumberDetails = (plumber) => {
        const pOrders = orders.filter(o => o.assignedPlumber?.plumberId === plumber.id);
        setStatsData({
            title: `Orders for ${plumber.name}`,
            data: pOrders
        });
        setStatsModal(true);
    };

    const handleEditPlumber = (plumber) => {
        setSelectedPlumber(plumber);
        setEditPlumberModal(true);
    };

    const handleSavePlumber = async () => {
        setEditPlumberModal(false);
        await loadData();
        showToast('Plumber saved', 'success');
    };

    const handleDeletePlumber = (plumber) => {
        setDeleteItem({ type: 'plumber', item: plumber });
        setDeleteModal(true);
    };

    // Delete Handler
    const handleConfirmDelete = async () => {
        if (!deleteItem) return;

        const { type, item } = deleteItem;
        let result;

        try {
            switch (type) {
                case 'client':
                case 'plumber':
                    result = await auth.deleteUser(item.id);
                    break;
                case 'order':
                    result = await orderService.deleteOrder(item.id);
                    break;
                default:
                    return;
            }

            if (result.success) {
                showToast(result.message, 'success');
                setDeleteModal(false);
                setDeleteItem(null);
                await loadData();
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            showToast(error.message, 'error');
        }
    };

    // Plumber verification handlers
    const handleVerifyPlumber = async (plumber) => {
        const result = await auth.verifyPlumber(plumber.id);
        if (result.success) {
            showToast('Plumber verified', 'success');
            await loadData();
        } else {
            showToast(result.message, 'error');
        }
    };

    const handleUnverifyPlumber = async (plumber) => {
        const result = await auth.unverifyPlumber(plumber.id);
        if (result.success) {
            showToast('Plumber unverified', 'success');
            await loadData();
        } else {
            showToast(result.message, 'error');
        }
    };

    const handleViewClientDetails = (client) => {
        const cOrders = orders.filter(o => o.clientId === client.id);
        setStatsData({
            title: `Orders for ${client.name}`,
            data: cOrders
        });
        setStatsModal(true);
    };

    // Settings Handler
    const handleSaveSettings = async () => {
        const rate = parseFloat(commissionInput);
        if (isNaN(rate) || rate < 0 || rate > 100) {
            showToast('Invalid commission rate', 'error');
            return;
        }

        const result = await settingsService.updateSettings({ commissionRate: rate / 100 });
        if (result.success) {
            showToast('Settings saved', 'success');
            await loadData();
        } else {
            showToast(result.message, 'error');
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'dashboard':
                return (
                    <DashboardTab
                        stats={stats}
                        orderDistribution={orderDistribution}
                        onStatClick={handleStatClick}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                );

            case 'orders':
                return (
                    <OrdersTab
                        orders={orders}
                        onAddOrder={handleAddOrder}
                        onEditOrder={handleEditOrder}
                        onDeleteOrder={handleDeleteOrder}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                );

            case 'plumbers':
                return (
                    <PlumbersTab
                        plumbers={plumbers}
                        plumberStats={plumberStats}
                        onAddPlumber={handleAddPlumber}
                        onEditPlumber={handleEditPlumber}
                        onDeletePlumber={handleDeletePlumber}
                        onViewDetails={handleViewPlumberDetails}
                        onVerifyPlumber={handleVerifyPlumber}
                        onUnverifyPlumber={handleUnverifyPlumber}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                );

            case 'clients':
                return (
                    <ClientsTab
                        clients={clients}
                        clientStats={clientStats}
                        onAddClient={handleAddClient}
                        onEditClient={handleEditClient}
                        onDeleteClient={handleDeleteClient}
                        onViewDetails={handleViewClientDetails}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                );

            case 'compliance':
                return (
                    <ComplianceTabContent
                        disputes={disputes}
                        onReload={loadData}
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                    />
                );

            case 'settings':
                return (
                    <ScrollView
                        style={styles.content}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    >
                        <Text style={styles.sectionTitle}>Platform Settings</Text>

                        <View style={styles.settingCard}>
                            <Text style={styles.settingLabel}>Global Commission Rate (%)</Text>
                            <View style={styles.settingRow}>
                                <TextInput
                                    style={styles.settingInput}
                                    value={commissionInput}
                                    onChangeText={setCommissionInput}
                                    keyboardType="numeric"
                                    placeholder="15"
                                />
                                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveSettings}>
                                    <Text style={styles.saveBtnText}>Save</Text>
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.settingHelp}>
                                This rate applies to all new orders. Existing orders are not affected unless manually edited.
                            </Text>
                        </View>
                    </ScrollView>
                );
            default:
                return null;
        }
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Admin Panel</Text>
                <TouchableOpacity onPress={() => {
                    auth.logoutUser();
                    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                }}>
                    <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
            </View>

            {/* Tab Bar */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
                {['dashboard', 'orders', 'plumbers', 'clients', 'compliance', 'settings'].map(tab => (
                    <TouchableOpacity
                        key={tab}
                        style={[styles.tab, activeTab === tab && styles.activeTab]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={styles.contentContainer}>
                {renderTabContent()}
            </View>

            {/* Modals */}
            <EditClientModal
                visible={editClientModal}
                client={selectedClient}
                onClose={() => setEditClientModal(false)}
                onSave={handleSaveClient}
            />

            <EditOrderModal
                visible={editOrderModal}
                order={selectedOrder}
                onClose={() => setEditOrderModal(false)}
                onSave={handleSaveOrder}
            />

            <AddOrderModal
                visible={addOrderModal}
                onClose={() => setAddOrderModal(false)}
                onSave={handleSaveNewOrder}
                showToast={showToast}
            />

            <EditPlumberModal
                visible={editPlumberModal}
                plumber={selectedPlumber}
                onClose={() => setEditPlumberModal(false)}
                onSave={handleSavePlumber}
            />

            <DeleteConfirmModal
                visible={deleteModal}
                item={deleteItem?.item}
                itemType={deleteItem?.type}
                onClose={() => setDeleteModal(false)}
                onConfirm={handleConfirmDelete}
            />

            <StatsDetailModal
                visible={statsModal}
                title={statsData.title}
                data={statsData.data}
                onClose={() => setStatsModal(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        backgroundColor: '#1e293b',
        paddingTop: 50, // Status bar area
    },
    headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff' },
    logoutText: { color: '#94a3b8', fontWeight: '600' },
    tabBar: {
        maxHeight: 60,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e2e8f0',
    },
    tab: {
        paddingHorizontal: 20,
        justifyContent: 'center',
        height: 60,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: { borderBottomColor: '#4338ca' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
    activeTabText: { color: '#4338ca' },
    contentContainer: { flex: 1, padding: 0 },
    content: { padding: 20 },
    sectionTitle: { fontSize: 22, fontWeight: '800', marginBottom: 20, color: '#1e293b' },
    cardText: { fontSize: 14, color: '#64748b' },
    // Settings styles
    settingCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 10,
    },
    settingRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 10,
    },
    settingInput: {
        flex: 1,
        backgroundColor: '#f1f5f9',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#1e293b',
    },
    settingHelp: {
        fontSize: 13,
        color: '#94a3b8',
        fontStyle: 'italic',
    },
    saveBtn: {
        backgroundColor: '#4338ca',
        paddingHorizontal: 20,
        justifyContent: 'center',
        borderRadius: 8,
    },
    saveBtnText: {
        color: '#fff',
        fontWeight: '700',
    }
});
