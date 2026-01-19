/**
 * Admin Dashboard - V5 High Fidelity
 * Replicates the "Deep Navy" web dashboard look with sidebar navigation and rich charts.
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
    Dimensions,
    Platform,
    Image,
    SafeAreaView,
    Clipboard,
    Linking,
    Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BarChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';

// Services & Context
import authService from '../services/auth';
import ordersService, { ORDER_STATUS } from '../services/orders';
import earningsService from '../services/earnings';
import { useToast } from '../contexts/ToastContext';
import { useLocalization } from '../contexts/LocalizationContext';

// Components - Removed external Sidebar, using inline hamburger
import { StatCard } from '../components/ui/StatCard';
import { DateRangeFilter } from '../components/filters/DateRangeFilter';
import { Pagination } from '../components/ui/Pagination';
import { OrdersByService } from '../components/ui/OrdersByService';
import { StatusChart, CommissionWidget } from '../components/ui/DashboardCharts';

const LOG_PREFIX = '[AdminDashboard]';
const SCREEN_WIDTH = Dimensions.get('window').width;



// --- Ported from DispatcherDashboard ---
const STATUS_COLORS = {
    placed: '#3b82f6', claimed: '#f59e0b', started: '#8b5cf6',
    completed: '#f97316', confirmed: '#22c55e',
    canceled_by_master: '#ef4444', canceled_by_client: '#ef4444', reopened: '#3b82f6',
};

const SERVICE_TYPES = [
    { id: 'plumbing', label: 'Plumbing' }, { id: 'electrician', label: 'Electrician' },
    { id: 'cleaning', label: 'Cleaning' }, { id: 'carpenter', label: 'Carpenter' },
    { id: 'repair', label: 'Repair' }, { id: 'installation', label: 'Installation' },
    { id: 'maintenance', label: 'Maintenance' }, { id: 'other', label: 'Other' },
];

const INITIAL_ORDER_STATE = {
    clientName: '', clientPhone: '', pricingType: 'unknown', initialPrice: '', calloutFee: '',
    serviceType: 'repair', urgency: 'planned', problemDescription: '',
    area: '', fullAddress: '', preferredDate: '', preferredTime: '', dispatcherNote: '',
};
// ----------------------------------------

// --- Helpers Ported from DispatcherDashboard ---
const getTimeAgo = (date, lang) => {
    if (!date) return '';
    const now = new Date();
    const past = new Date(date);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return lang === 'ru' ? 'Только что' : 'Just now';
    if (diffMins < 60) return `${diffMins} ${lang === 'ru' ? 'мин' : 'm'} ago`;
    if (diffHours < 24) return `${diffHours} ${lang === 'ru' ? 'ч' : 'h'} ago`;
    return `${diffDays} ${lang === 'ru' ? 'д' : 'd'} ago`;
};

const getServiceLabel = (type, lang) => {
    if (!type) return 'Unknown';
    // Simplified mapping
    const labels = {
        plumbing: { en: 'Plumbing', ru: 'Сантехника' },
        electrician: { en: 'Electrician', ru: 'Электрика' },
        cleaning: { en: 'Cleaning', ru: 'Уборка' },
        carpenter: { en: 'Carpenter', ru: 'Плотник' },
        repair: { en: 'Repair', ru: 'Ремонт' },
        installation: { en: 'Installation', ru: 'Установка' },
        maintenance: { en: 'Maintenance', ru: 'Обслуживание' },
        other: { en: 'Other', ru: 'Другое' }
    };
    return labels[type]?.[lang] || labels[type]?.['en'] || type;
};

const getOrderStatusLabel = (status, lang) => {
    if (!status) return '';
    // Mapping or simple format
    return status.replace(/_/g, ' ').toUpperCase();
};
// -----------------------------------------------

export default function AdminDashboard({ navigation }) {
    const { showToast } = useToast();
    const { t: TRANSLATIONS, language, setLanguage } = useLocalization();

    // UI State
    const [activeTab, setActiveTab] = useState('overview');
    const [isDark, setIsDark] = useState(true);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState({});
    const [commissionStats, setCommissionStats] = useState({});

    // Data State
    const [orders, setOrders] = useState([]);
    const [masters, setMasters] = useState([]);
    const [dispatchers, setDispatchers] = useState([]);
    const [mastersWithDebt, setMastersWithDebt] = useState([]);
    const [settings, setSettings] = useState({});
    const [tempSettings, setTempSettings] = useState({});
    const [user, setUser] = useState(null);

    // Filter & Search State
    const [dashboardFilter, setDashboardFilter] = useState({ type: 'all' });
    const [searchQuery, setSearchQuery] = useState('');
    const [peopleView, setPeopleView] = useState('masters'); // 'masters' or 'staff'
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    // Modals
    const [selectedMaster, setSelectedMaster] = useState(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentData, setPaymentData] = useState({ amount: '', method: 'cash', reference: '' });

    // Sidebar State (hamburger menu)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // Orders View Mode
    const [viewMode, setViewMode] = useState('cards'); // 'cards' or 'compact'
    const [showFilters, setShowFilters] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all');
    const [serviceFilter, setServiceFilter] = useState('all');

    const [pickerModal, setPickerModal] = useState({ visible: false, options: [], value: '', onChange: null, title: '' });
    const [serviceTypes, setServiceTypes] = useState([]);
    const [serviceTypeModal, setServiceTypeModal] = useState({ visible: false, type: null });
    const [tempServiceType, setTempServiceType] = useState({});

    // Dynamic Filter Options
    const getStatusOptions = () => [
        { id: 'all', label: TRANSLATIONS.statusAll || 'All' },
        { id: 'active', label: TRANSLATIONS.statusActive || 'Active' },
        { id: 'placed', label: TRANSLATIONS.statusPlaced || 'Placed' },
        { id: 'claimed', label: TRANSLATIONS.statusClaimed || 'Claimed' },
        { id: 'started', label: TRANSLATIONS.statusStarted || 'Started' },
        { id: 'completed', label: TRANSLATIONS.statusCompleted || 'Completed' },
        { id: 'canceled_by_client', label: TRANSLATIONS.statusCanceledClient || 'Canceled (Client)' },
        { id: 'canceled_by_master', label: TRANSLATIONS.statusCanceledMaster || 'Canceled (Master)' },
    ];

    const getServiceFilterOptions = () => [
        { id: 'all', label: TRANSLATIONS.statusAll || 'All' },
        ...serviceTypes.map(st => ({ id: st.id, label: st[`name_${language}`] || st.name_en || st.id }))
    ];

    useEffect(() => {
        if (serviceTypeModal.visible) {
            setTempServiceType(serviceTypeModal.type ? { ...serviceTypeModal.type } : { is_active: true, sort_order: 99, icon: '🔧' });
        }
    }, [serviceTypeModal]);

    // --- Ported State ---
    const [detailsOrder, setDetailsOrder] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [newOrder, setNewOrder] = useState(INITIAL_ORDER_STATE);
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [creationSuccess, setCreationSuccess] = useState(null);
    const [phoneError, setPhoneError] = useState('');
    const [showRecentAddr, setShowRecentAddr] = useState(false); // For autocomplete if needed

    // Interactive Stats Modal
    const [statModalVisible, setStatModalVisible] = useState(false);
    const [statModalTitle, setStatModalTitle] = useState('');
    const [statFilteredOrders, setStatFilteredOrders] = useState([]);

    // --------------------
    const [actionLoading, setActionLoading] = useState(false);

    // Initial Load
    useEffect(() => {
        loadAllData();
    }, []);

    // Reload Stats on Filter Change (without full loading screen)
    useEffect(() => {
        // Skip the initial render (handled by loadAllData)
        if (!loading) {
            Promise.all([
                loadStats(),
                loadCommissionData()
            ]);
        }
    }, [dashboardFilter]);

    const loadAllData = async (skipLoadingScreen = false) => {
        if (!skipLoadingScreen) setLoading(true);
        // Load current user first
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
        } catch (e) {
            console.error('Failed to load current user', e);
        }
        await Promise.all([
            loadStats(),
            loadCommissionData(),
            loadOrders(),
            loadMasters(),
            loadDispatchers(), // Load dispatchers if available
            loadSettings(),
            loadServiceTypes(),
        ]);
        setLoading(false);
    };

    const loadStats = async () => {
        try {
            const data = await ordersService.getEnhancedPlatformStats(dashboardFilter);
            setStats(data || {});
        } catch (e) {
            console.error('Stats error', e);
        }
    };

    const loadCommissionData = async () => {
        try {
            const data = await earningsService.getCommissionStats(dashboardFilter);
            setCommissionStats(data || {});
            // Safe array check to prevent crash
            setMastersWithDebt(Array.isArray(data?.mastersWithDebt) ? data.mastersWithDebt : []);
        } catch (e) {
            console.error('Commission error', e);
            setMastersWithDebt([]);
        }
    };

    const loadOrders = async () => {
        const data = await ordersService.getAllOrders(); // Ensure this exists or use getAvailableOrders and filter
        setOrders(data || []);
    };

    const loadMasters = async () => {
        try {
            const data = await authService.getAllMasters();
            setMasters(data || []);
        } catch (e) { console.log(e); }
    };

    const loadDispatchers = async () => {
        // Implement if authService supports it, otherwise mock or skip
        try {
            if (authService.getAllDispatchers) {
                const data = await authService.getAllDispatchers();
                setDispatchers(data || []);
            }
        } catch (e) { }
    };

    const loadSettings = async () => {
        try {
            const s = await ordersService.getPlatformSettings();
            setSettings(s || {});
        } catch (e) { }
    };

    const loadServiceTypes = async () => {
        try {
            const data = await ordersService.getServiceTypes();
            setServiceTypes(data || []);
        } catch (e) { console.error(e); }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadAllData(true); // Skip loading screen for smooth refresh
        setRefreshing(false);
    }, [dashboardFilter]);

    // Handlers
    const handleLogout = async () => {
        await authService.signOut();
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    };

    const handleRecordPayment = async () => {
        setActionLoading(true);
        try {
            await earningsService.recordCommissionPayment({
                masterId: selectedMaster.id,
                amount: parseFloat(paymentData.amount),
                method: paymentData.method,
                reference: paymentData.reference
            });
            showToast('Payment recorded!', 'success');
            setShowPaymentModal(false);
            setPaymentData({ amount: '', method: 'cash', reference: '' });
            loadCommissionData();
        } catch (error) {
            showToast('Failed to record payment', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSaveServiceType = async (typeData) => {
        setActionLoading(true);
        try {
            if (typeData.id) {
                await ordersService.updateServiceType(typeData.id, typeData);
                showToast('Service type updated', 'success');
            } else {
                await ordersService.addServiceType(typeData);
                showToast('Service type added', 'success');
            }
            setServiceTypeModal({ visible: false, type: null });
            loadServiceTypes();
        } catch (e) {
            showToast('Error saving service type', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteServiceType = async (id) => {
        Alert.alert('Delete Type', 'Are you sure?', [
            { text: 'Cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await ordersService.deleteServiceType(id);
                        loadServiceTypes();
                    } catch (e) { showToast('Error deleting', 'error'); }
                }
            }
        ]);
    };

    // --- Ported Actions ---
    const handleCreateOrder = async () => {
        if (!confirmChecked) { showToast?.('Please confirm details', 'error'); return; }
        if (!newOrder.clientPhone || !newOrder.problemDescription || !newOrder.area || !newOrder.fullAddress) {
            showToast?.('Please fill required fields', 'error'); return;
        }

        setActionLoading(true);
        try {
            // Admin ID used as dispatcher ID for creation tracking
            const result = await ordersService.createOrderExtended({
                clientId: user?.id, // Or handle as "Guest" if needed, but here using Admin as proxy
                pricingType: newOrder.pricingType,
                initialPrice: parseFloat(newOrder.initialPrice) || null,
                calloutFee: parseFloat(newOrder.calloutFee) || null,
                serviceType: newOrder.serviceType,
                urgency: newOrder.urgency,
                problemDescription: newOrder.problemDescription,
                area: newOrder.area,
                fullAddress: newOrder.fullAddress,
                dispatcherNote: newOrder.dispatcherNote,
            }, user?.id);

            if (result.success) {
                showToast('Order created!', 'success');
                setCreationSuccess({ id: result.orderId });
                setConfirmChecked(false);
                loadOrders(); // Refresh list
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            showToast('Create failed', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleSaveEdit = async () => {
        setActionLoading(true);
        try {
            const updates = {
                problem_description: editForm.problem_description,
                dispatcher_note: editForm.dispatcher_note,
                full_address: editForm.full_address,
                client: {
                    full_name: editForm.client_name || detailsOrder.client?.full_name,
                    phone: editForm.client_phone || detailsOrder.client?.phone
                }
            };

            const result = await ordersService.updateOrderInline(detailsOrder.id, updates);
            if (result.success) {
                showToast('Order updated', 'success');
                setIsEditing(false);
                loadOrders();
                setDetailsOrder(prev => ({
                    ...prev,
                    ...editForm,
                    client: { ...prev.client, full_name: editForm.client_name, phone: editForm.client_phone }
                }));
            } else { showToast('Update failed', 'error'); }
        } catch (e) { showToast('Update error', 'error'); }
        finally { setActionLoading(false); }
    };

    const handleVerifyMaster = async (masterId, isVerified) => {
        setActionLoading(true);
        try {
            const res = isVerified
                ? await authService.unverifyMaster(masterId)
                : await authService.verifyMaster(masterId);

            if (res.success) {
                showToast(isVerified ? 'Master unverified' : 'Master verified', 'success');
                loadMasters();
            } else {
                showToast(res.message, 'error');
            }
        } catch (e) { showToast('Action failed', 'error'); }
        finally { setActionLoading(false); }
    };

    const handleToggleDispatcher = async (dispatcherId, isActive) => {
        setActionLoading(true);
        try {
            const res = await authService.toggleDispatcherActive(dispatcherId, !isActive);
            if (res.success) {
                showToast(res.message, 'success');
                loadDispatchers();
            } else {
                showToast(res.message, 'error');
            }
        } catch (e) { showToast('Action failed', 'error'); }
        finally { setActionLoading(false); }
    };
    // ----------------------

    // ============================================
    // RENDERERS
    // ============================================

    // Menu items for admin sidebar
    const MENU_ITEMS = [
        { key: 'overview', label: TRANSLATIONS.tabOverview || 'Overview', icon: 'bar-chart' },
        { key: 'orders', label: TRANSLATIONS.tabOrders || 'Orders', icon: 'list' },
        { key: 'people', label: TRANSLATIONS.tabPeople || 'People', icon: 'people' },
        { key: 'settings', label: TRANSLATIONS.tabSettings || 'Settings', icon: 'settings' },
    ];

    // Hamburger Sidebar (Modal-based like Dispatcher)
    const renderSidebar = () => (
        <Modal visible={isSidebarOpen} transparent animationType="none">
            <View style={styles.sidebarOverlay}>
                {/* Sidebar Container */}
                <Animated.View style={[styles.sidebarContainer, !isDark && styles.sidebarContainerLight]}>
                    {/* Sidebar Header */}
                    <View style={[styles.sidebarHeader, !isDark && styles.sidebarHeaderLight]}>
                        <Text style={[styles.sidebarTitle, !isDark && styles.textDark]}>{TRANSLATIONS.adminTitle || 'Admin Pro'}</Text>
                        <TouchableOpacity onPress={() => setIsSidebarOpen(false)} style={styles.sidebarClose}>
                            <Text style={styles.sidebarCloseText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Sidebar Navigation */}
                    <View style={styles.sidebarNav}>
                        {MENU_ITEMS.map(item => (
                            <TouchableOpacity
                                key={item.key}
                                style={[styles.sidebarNavItem, activeTab === item.key && styles.sidebarNavItemActive]}
                                onPress={() => { setActiveTab(item.key); setIsSidebarOpen(false); }}
                            >
                                <Ionicons name={item.icon} size={20} color={activeTab === item.key ? '#fff' : '#94a3b8'} style={{ marginRight: 12 }} />
                                <Text style={[styles.sidebarNavText, activeTab === item.key && styles.sidebarNavTextActive]}>
                                    {item.label}
                                </Text>
                            </TouchableOpacity>
                        ))}

                        {/* Create Order Button */}
                        <TouchableOpacity
                            style={[styles.sidebarNavItem, styles.createOrderBtn]}
                            onPress={() => { setActiveTab('create_order'); setIsSidebarOpen(false); }}
                        >
                            <Ionicons name="add-circle" size={20} color="#22c55e" style={{ marginRight: 12 }} />
                            <Text style={[styles.sidebarNavText, { color: '#22c55e' }]}>{TRANSLATIONS.createOrder || 'Create Order'}</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Sidebar Footer */}
                    <View style={[styles.sidebarFooter, !isDark && styles.sidebarFooterLight]}>
                        {/* Theme & Language Row */}
                        <View style={styles.sidebarButtonRow}>
                            <TouchableOpacity style={[styles.sidebarSmallBtn, !isDark && styles.sidebarBtnLight]} onPress={() => setIsDark(!isDark)}>
                                <Text style={[styles.sidebarThemeIcon, !isDark && styles.textDark]}>{isDark ? '☀' : '☾'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.sidebarLangBtn, !isDark && styles.sidebarBtnLight]}
                                onPress={() => setLanguage(language === 'en' ? 'ru' : language === 'ru' ? 'kg' : 'en')}>
                                <Text style={[styles.sidebarLangText, !isDark && styles.textDark, { fontSize: 24 }]}>
                                    {language === 'en' ? '🇬🇧' : language === 'ru' ? '🇷🇺' : '🇰🇬'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View style={[styles.sidebarUserCard, !isDark && styles.sidebarBtnLight]}>
                            <View style={styles.sidebarUserAvatar}>
                                <Text style={styles.sidebarUserAvatarText}>
                                    {user?.full_name ? user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2) : 'AD'}
                                </Text>
                            </View>
                            <View style={styles.sidebarUserInfo}>
                                <Text style={[styles.sidebarUserName, !isDark && styles.textDark]} numberOfLines={1}>{user?.full_name || 'Admin'}</Text>
                                <Text style={styles.sidebarUserStatus}>{TRANSLATIONS.online || 'Online'}</Text>
                            </View>
                            <TouchableOpacity onPress={handleLogout} style={styles.sidebarLogoutBtn}>
                                <Text style={styles.sidebarLogoutText}>{TRANSLATIONS.exit || 'Exit'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
                {/* Backdrop */}
                <TouchableOpacity style={styles.sidebarBackdrop} onPress={() => setIsSidebarOpen(false)} />
            </View>
        </Modal>
    );

    // Header with hamburger, title, search, and refresh (like Dispatcher)
    const renderHeader = (title) => (
        <View style={[styles.header, !isDark && styles.headerLight]}>
            <View style={styles.headerLeft}>
                <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={[styles.menuBtn, !isDark && styles.btnLight]}>
                    <Ionicons name="menu" size={24} color={isDark ? "#94a3b8" : "#0f172a"} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, !isDark && styles.textDark]}>{title}</Text>
            </View>
            <View style={styles.headerRight}>
                <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, !isDark && styles.btnLight]}>
                    <Ionicons name="refresh" size={20} color={isDark ? "#94a3b8" : "#0f172a"} />
                </TouchableOpacity>
            </View>
        </View>
    );




    // Search bar component (shared for non-Orders tabs)
    const renderSearchBar = () => (
        <View style={styles.searchRow}>
            <View style={styles.searchInputWrapper}>
                <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search..."
                    placeholderTextColor="#64748b"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
                        <Ionicons name="close-circle" size={16} color="#64748b" />
                    </TouchableOpacity>
                ) : null}
            </View>
        </View>
    );

    const renderOverview = () => {
        return (
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {renderHeader('Overview')}

                {/* Date Filter */}
                <DateRangeFilter
                    value={dashboardFilter}
                    onChange={setDashboardFilter}
                    isDark={isDark}
                />

                {/* Stats Grid */}
                <View style={styles.statsGrid}>
                    <StatCard
                        label="Total Orders"
                        value={stats.totalOrders || 0}
                        color="#3b82f6"
                        onPress={() => handleStatClick('total')}
                        isDark={isDark}
                    />
                    <StatCard
                        label="Active Jobs"
                        value={stats.activeJobs || 0}
                        color="#8b5cf6"
                        onPress={() => handleStatClick('active')}
                        isDark={isDark}
                    />
                    <StatCard
                        label="Pending"
                        value={stats.placedOrders || 0}
                        color="#f59e0b"
                        onPress={() => handleStatClick('pending')}
                        isDark={isDark}
                    />
                    <StatCard
                        label="Confirmed"
                        value={stats.confirmedOrders || 0}
                        color="#22c55e"
                        onPress={() => handleStatClick('confirmed')}
                        isDark={isDark}
                    />
                </View>

                {/* Main Charts Row */}
                <View style={styles.chartsRow}>
                    {/* Revenue Trend */}
                    <View style={[styles.chartCard, !isDark && styles.chartCardLight, { flex: 2, marginRight: 16 }]}>
                        <Text style={[styles.chartTitle, !isDark && styles.textDark]}>Revenue Trend</Text>
                        <Text style={styles.chartSubtitle}>Selected Period</Text>

                        <View style={{ alignItems: 'center' }}>
                            <BarChart
                                data={{
                                    labels: ['6d', '5d', '4d', '3d', '2d', 'Yest', 'Today'],
                                    datasets: [{
                                        data: stats.revenueData || [0, 0, 0, 0, 0, 0, 0]
                                    }]
                                }}
                                width={SCREEN_WIDTH > 1000 ? SCREEN_WIDTH * 0.45 : SCREEN_WIDTH - 80}
                                height={220}
                                yAxisLabel=""
                                yAxisSuffix=""
                                chartConfig={{
                                    backgroundColor: isDark ? '#1e293b' : '#ffffff',
                                    backgroundGradientFrom: isDark ? '#1e293b' : '#ffffff',
                                    backgroundGradientTo: isDark ? '#1e293b' : '#ffffff',
                                    decimalPlaces: 0,
                                    color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
                                    labelColor: (opacity = 1) => isDark ? `rgba(148, 163, 184, ${opacity})` : `rgba(15, 23, 42, ${opacity})`,
                                    barPercentage: 0.5,
                                    propsForBackgroundLines: {
                                        strokeWidth: 1,
                                        stroke: isDark ? '#334155' : '#e2e8f0',
                                        strokeDasharray: '0',
                                    },
                                }}
                                style={{
                                    marginVertical: 8,
                                    borderRadius: 0,
                                }}
                                withInnerLines={false}
                                showValuesOnTopOfBars={false}
                                fromZero
                            />
                        </View>
                    </View>

                    {/* Orders by Service */}
                    <View style={{ flex: 1, minWidth: 300 }}>
                        <OrdersByService data={stats.serviceBreakdown || {}} isDark={isDark} />
                    </View>
                </View>

                {/* Bottom Charts Row */}
                <View style={styles.chartsRow}>
                    {/* Order Status Bar Chart */}
                    <View style={{ flex: 1, marginRight: 16 }}>
                        <StatusChart data={stats.statusBreakdown || {}} isDark={isDark} />
                    </View>

                    {/* Commission Donut */}
                    <View style={{ flex: 1 }}>
                        <CommissionWidget
                            collected={commissionStats.totalCollected || 0}
                            outstanding={commissionStats.totalOutstanding || 0}
                            isDark={isDark}
                        />
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        );
    };

    // --- Interactive Stats Handler ---
    const handleStatClick = (type) => {
        let filtered = [];
        let title = '';

        switch (type) {
            case 'active':
                title = 'Active Jobs';
                filtered = orders.filter(o => ['claimed', 'started', 'wip'].includes(o.status));
                break;
            case 'pending':
                title = 'Pending Orders';
                filtered = orders.filter(o => ['placed', 'reopened'].includes(o.status));
                break;
            case 'confirmed':
                title = 'Confirmed Orders';
                filtered = orders.filter(o => o.status === 'confirmed');
                break;
            case 'total':
                setActiveTab('orders'); // Just go to orders tab for total
                return;
            default:
                return;
        }

        setStatModalTitle(title);
        setStatFilteredOrders(filtered);
        setStatModalVisible(true);
    };

    const renderStatDetailsModal = () => (
        <Modal
            visible={statModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setStatModalVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { width: 600, maxHeight: '80%' }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                        <Text style={styles.modalTitle}>{statModalTitle}</Text>
                        <TouchableOpacity onPress={() => setStatModalVisible(false)}>
                            <Ionicons name="close" size={24} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={statFilteredOrders}
                        keyExtractor={item => String(item.id)}
                        contentContainerStyle={{ gap: 10 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={styles.listItemCard}
                                onPress={() => {
                                    setStatModalVisible(false);
                                    setDetailsOrder(item);
                                }}
                            >
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <View>
                                        <Text style={styles.itemTitle}>{item.service_type || 'Service'}</Text>
                                        <Text style={styles.itemSubtitle}>{item.full_address}</Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#ccc' }]}>
                                        <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        )}
                        ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center' }}>No orders found.</Text>}
                    />
                </View>
            </View>
        </Modal>
    );



    const renderPickerModal = () => (
        <Modal visible={pickerModal.visible} transparent animationType="fade">
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerModal(prev => ({ ...prev, visible: false }))}>
                <View style={styles.pickerContent}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>{pickerModal.title}</Text>
                        <TouchableOpacity onPress={() => setPickerModal(prev => ({ ...prev, visible: false }))}>
                            <Ionicons name="close" size={24} color="#94a3b8" />
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.pickerScroll}>
                        {pickerModal.options.map(opt => (
                            <TouchableOpacity key={opt.id} style={[styles.pickerOption, pickerModal.value === opt.id && styles.pickerOptionActive]}
                                onPress={() => {
                                    if (pickerModal.onChange) pickerModal.onChange(opt.id);
                                    setPickerModal(prev => ({ ...prev, visible: false }));
                                }}>
                                <Text style={[styles.pickerOptionText, pickerModal.value === opt.id && styles.pickerOptionTextActive]}>
                                    {opt.label}
                                </Text>
                                {pickerModal.value === opt.id && <Ionicons name="checkmark" size={20} color="#3b82f6" />}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </TouchableOpacity>
        </Modal>
    );

    const renderFilters = () => {
        const statusOptions = getStatusOptions();
        const serviceOptions = getServiceFilterOptions();

        const currentStatusLabel = statusOptions.find(o => o.id === statusFilter)?.label || statusFilter;
        const currentServiceLabel = serviceOptions.find(o => o.id === serviceFilter)?.label || serviceFilter;

        return (
            <View style={styles.filtersContainer}>
                <View style={styles.filterControlsRow}>
                    <TouchableOpacity
                        style={[styles.viewToggleBtn, !isDark && styles.viewToggleBtnLight, viewMode === 'compact' && styles.viewToggleBtnActive]}
                        onPress={() => setViewMode(prev => prev === 'cards' ? 'compact' : 'cards')}>
                        <Ionicons name={viewMode === 'cards' ? "list" : "grid"} size={20} color={viewMode === 'compact' ? "#fff" : (isDark ? "#94a3b8" : "#64748b")} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.filterShowBtn, !isDark && styles.filterShowBtnLight, showFilters && styles.filterShowBtnActive]}
                        onPress={() => setShowFilters(!showFilters)}>
                        <Text style={[styles.filterShowBtnText, !isDark && styles.filterShowBtnTextLight, showFilters && styles.filterShowBtnTextActive]}>
                            {showFilters ? (TRANSLATIONS.hideFilters || 'Hide Filters') : (TRANSLATIONS.showFilters || 'Show Filters')}
                        </Text>
                    </TouchableOpacity>
                </View>

                {showFilters && (
                    <View style={styles.filterDropdownRow}>
                        {/* Status Filter */}
                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.filterDropdownLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.filterStatus || 'Status',
                            options: statusOptions,
                            value: statusFilter,
                            onChange: setStatusFilter
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.filterDropdownTextLight]}>{currentStatusLabel}</Text>
                            <Ionicons name="chevron-down" size={12} color="#64748b" />
                        </TouchableOpacity>

                        {/* Service Type Filter */}
                        <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.filterDropdownLight]} onPress={() => setPickerModal({
                            visible: true,
                            title: TRANSLATIONS.filterService || 'Service',
                            options: serviceOptions,
                            value: serviceFilter,
                            onChange: setServiceFilter
                        })}>
                            <Text style={[styles.filterDropdownText, !isDark && styles.filterDropdownTextLight]}>{currentServiceLabel}</Text>
                            <Ionicons name="chevron-down" size={12} color="#64748b" />
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const renderOrders = () => {
        // --- Order Renderers ---
        const renderCard = ({ item }) => (
            <TouchableOpacity style={[styles.orderCard, !isDark && styles.orderCardLight]} onPress={() => setDetailsOrder(item)}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, language)}</Text>
                    <View style={[styles.cardStatus, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
                        <Text style={styles.cardStatusText}>{getOrderStatusLabel(item.status, language)}</Text>
                    </View>
                </View>
                <Text style={styles.cardAddr} numberOfLines={2}>{item.full_address}</Text>
                <View style={styles.cardFooter}>
                    <Text style={styles.cardClient}>{item.client?.full_name || 'N/A'}</Text>
                    <Text style={styles.cardTime}>{getTimeAgo(item.created_at, language)}</Text>
                </View>
            </TouchableOpacity>
        );

        const renderCompactRow = ({ item }) => (
            <TouchableOpacity style={[styles.compactRow, !isDark && styles.compactRowLight]} onPress={() => setDetailsOrder(item)}>
                <View style={styles.compactLeft}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]} />
                    <View style={styles.compactMain}>
                        <View style={styles.compactTopRow}>
                            <Text style={styles.compactId}>#{item.id?.slice(-6)}</Text>
                            <Text style={[styles.compactService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, language)}</Text>
                        </View>
                        <Text style={styles.compactAddr} numberOfLines={1}>{item.full_address}</Text>
                        <View style={styles.compactBottomRow}>
                            <Text style={styles.compactClient}>{item.client?.full_name || 'N/A'}</Text>
                            <Text style={styles.compactClient}>•</Text>
                            <Text style={styles.compactClient}>{getTimeAgo(item.created_at, language)}</Text>
                        </View>
                    </View>
                </View>
                <View style={styles.compactRight}>
                    <View style={[styles.compactStatusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
                        <Text style={styles.compactStatusText}>{getOrderStatusLabel(item.status, language)}</Text>
                    </View>
                    <Text style={styles.compactChevron}>›</Text>
                </View>
            </TouchableOpacity>
        );

        // --- Filter Logic ---
        // --- Filter Logic ---
        const filtered = orders.filter(o => {
            // Service Filter
            if (serviceFilter !== 'all' && o.service_type !== serviceFilter) return false;

            // Status Filter
            if (statusFilter !== 'all') {
                if (statusFilter === 'active') {
                    // Active logic: placed, claimed, started
                    if (!['placed', 'claimed', 'started'].includes(o.status)) return false;
                } else if (statusFilter === 'completed') {
                    if (o.status !== 'completed') return false;
                } else if (statusFilter === 'canceled') {
                    // Catch-all cancelled
                    if (!o.status?.includes('canceled')) return false;
                } else {
                    // Exact match for other statuses like 'placed', 'claimed'
                    if (o.status !== statusFilter) return false;
                }
            }

            // Search Filter
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const idMatch = String(o.id).includes(q);
                const contentMatch = JSON.stringify(o).toLowerCase().includes(q);
                return idMatch || contentMatch;
            }
            return true;
        });

        // Pagination
        const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
        const totalPages = Math.ceil(filtered.length / itemsPerPage);

        return (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
                {renderHeader('Orders')}

                {/* Search */}
                <View style={styles.searchRow}>
                    <View style={[styles.searchInputWrapper, !isDark && styles.searchInputWrapperLight]}>
                        <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
                        <TextInput
                            style={[styles.searchInput, !isDark && styles.searchInputTextLight]}
                            placeholder="Search orders..."
                            placeholderTextColor="#64748b"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery ? (
                            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
                                <Ionicons name="close-circle" size={16} color="#64748b" />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>

                {/* Filters */}
                {renderFilters()}

                <FlatList
                    data={paginated}
                    keyExtractor={item => String(item.id)}
                    key={viewMode}
                    numColumns={viewMode === 'cards' ? 2 : 1}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    renderItem={viewMode === 'cards' ? renderCard : renderCompactRow}
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', marginTop: 40 }}>
                            <Text style={{ color: '#64748b' }}>No orders found</Text>
                        </View>
                    }
                    ListFooterComponent={
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                        />
                    }
                />
            </View>
        );
    };

    const renderMasters = () => {
        const filtered = masters.filter(m =>
            !searchQuery || m.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

        return (
            <View style={{ flex: 1 }}>
                {renderSearchBar()}
                <FlatList
                    data={paginated}
                    keyExtractor={item => String(item.id)}
                    contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
                    ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>No masters found</Text>}
                    renderItem={({ item }) => (
                        <View style={[styles.listItemCard, !isDark && styles.listItemCardLight]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={[styles.avatarCircle, { backgroundColor: item.is_verified ? '#22c55e' : '#64748b' }]}>
                                        <Text style={{ color: '#fff' }}>{item.full_name?.charAt(0)}</Text>
                                    </View>
                                    <View>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{item.full_name}</Text>
                                        <Text style={styles.itemSubtitle}>{item.phone}</Text>
                                    </View>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <View style={{ marginBottom: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: 4, borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                                        <Text style={{ fontSize: 11, color: '#f59e0b', fontWeight: '600' }}>
                                            DL: {item.total_commission_owed || 0} сом
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            onPress={() => { setSelectedMaster(item); setShowPaymentModal(true); }}
                                            style={[styles.miniActionBtn, { backgroundColor: '#334155', borderWidth: 1, borderColor: '#475569' }]}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#94a3b8' }}>TOP UP</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => handleVerifyMaster(item.id, item.is_verified)}
                                            style={[styles.miniActionBtn, { backgroundColor: item.is_verified ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: item.is_verified ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)' }]}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_verified ? '#ef4444' : '#22c55e' }}>
                                                {item.is_verified ? 'UNVERIFY' : 'VERIFY'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}
                    ListFooterComponent={
                        <Pagination
                            currentPage={currentPage}
                            totalPages={Math.ceil(filtered.length / itemsPerPage)}
                            onPageChange={setCurrentPage}
                        />
                    }
                />
            </View>
        );
    };



    const renderStaff = () => {
        const filtered = dispatchers.filter(d =>
            !searchQuery || d.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
        );
        const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

        return (
            <View style={{ flex: 1 }}>
                {renderSearchBar()}
                <FlatList
                    data={paginated}
                    keyExtractor={item => String(item.id)}
                    contentContainerStyle={{ gap: 8, paddingBottom: 20 }}
                    ListEmptyComponent={<Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>No dispatchers found</Text>}
                    renderItem={({ item }) => (
                        <View style={[styles.listItemCard, !isDark && styles.listItemCardLight]}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={[styles.avatarCircle, { backgroundColor: item.is_active ? '#3b82f6' : '#64748b' }]}>
                                        <Text style={{ color: '#fff' }}>{item.full_name?.charAt(0)}</Text>
                                    </View>
                                    <View>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{item.full_name}</Text>
                                        <Text style={styles.itemSubtitle}>{item.phone || item.email}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity
                                    onPress={() => handleToggleDispatcher(item.id, item.is_active)}
                                    style={[styles.miniActionBtn, { backgroundColor: item.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: item.is_active ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)' }]}
                                >
                                    <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_active ? '#22c55e' : '#ef4444' }}>
                                        {item.is_active ? 'ACTIVE' : 'INACTIVE'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                    ListFooterComponent={
                        <Pagination
                            currentPage={currentPage}
                            totalPages={Math.ceil(filtered.length / itemsPerPage)}
                            onPageChange={setCurrentPage}
                        />
                    }
                />
            </View>
        );
    };

    const renderSettingsPage = () => (
        <View style={{ flex: 1 }}>
            {renderHeader(TRANSLATIONS.settingsTitle || 'Platform Settings')}
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
                <View style={[styles.sectionHeader, !isDark && styles.sectionHeaderLight]}>
                    <Text style={[styles.sectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS.settingsTitle || 'Configuration'}</Text>
                    {isEditing ? (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity onPress={() => setIsEditing(false)} style={[styles.editBtn, { backgroundColor: isDark ? '#334155' : '#e2e8f0', borderColor: isDark ? '#475569' : '#cbd5e1' }]}>
                                <Text style={[styles.editBtnText, !isDark && styles.textDark]}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={async () => {
                                    setActionLoading(true);
                                    try {
                                        await ordersService.updatePlatformSettings({
                                            default_guaranteed_payout: parseFloat(tempSettings.default_guaranteed_payout) || 0,
                                            commission_rate: (parseFloat(tempSettings.commission_rate) || 0) / 100,
                                            price_deviation_threshold: (parseFloat(tempSettings.price_deviation_threshold) || 0) / 100,
                                            claim_timeout_minutes: parseInt(tempSettings.claim_timeout_minutes) || 30,
                                            order_expiry_hours: parseInt(tempSettings.order_expiry_hours) || 48
                                        });
                                        showToast('Settings saved', 'success');
                                        loadSettings();
                                        setIsEditing(false);
                                    } catch (error) {
                                        showToast('Error saving settings', 'error');
                                    } finally {
                                        setActionLoading(false);
                                    }
                                }}
                                style={[styles.editBtn, { backgroundColor: '#22c55e', borderColor: '#22c55e', minWidth: 80 }]}
                            >
                                {actionLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.editBtnTextActive}>Save</Text>}
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={() => {
                                setTempSettings({
                                    ...settings,
                                    default_guaranteed_payout: String(settings.default_guaranteed_payout || ''),
                                    commission_rate: settings.commission_rate ? (settings.commission_rate * 100).toFixed(0) : '',
                                    price_deviation_threshold: settings.price_deviation_threshold ? (settings.price_deviation_threshold * 100).toFixed(0) : '',
                                    claim_timeout_minutes: String(settings.claim_timeout_minutes || ''),
                                    order_expiry_hours: String(settings.order_expiry_hours || '')
                                });
                                setIsEditing(true);
                            }}
                            style={styles.editBtn}
                        >
                            <Text style={styles.editBtnText}>Edit</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* Settings Form Grid */}
                <View style={[styles.card, !isDark && styles.cardLight, { gap: 20 }]}>
                    <View style={{ flexDirection: 'row', gap: 20 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.inputLabel}>Base Payout (Standard Call-out)</Text>
                            {isEditing ? (
                                <TextInput style={[styles.input, !isDark && styles.inputLight]} keyboardType="numeric" value={tempSettings.default_guaranteed_payout} onChangeText={v => setTempSettings({ ...tempSettings, default_guaranteed_payout: v })} />
                            ) : (
                                <Text style={[styles.valueText, !isDark && styles.textDark]}>{settings.default_guaranteed_payout || 0} сом</Text>
                            )}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.inputLabel}>Commission Rate (%)</Text>
                            {isEditing ? (
                                <TextInput style={[styles.input, !isDark && styles.inputLight]} keyboardType="numeric" value={tempSettings.commission_rate} onChangeText={v => setTempSettings({ ...tempSettings, commission_rate: v })} />
                            ) : (
                                <Text style={[styles.valueText, !isDark && styles.textDark]}>{(settings.commission_rate * 100).toFixed(0)}%</Text>
                            )}
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 20 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.inputLabel}>Price Deviation Threshold (%)</Text>
                            {isEditing ? (
                                <TextInput style={[styles.input, !isDark && styles.inputLight]} keyboardType="numeric" value={tempSettings.price_deviation_threshold} onChangeText={v => setTempSettings({ ...tempSettings, price_deviation_threshold: v })} />
                            ) : (
                                <Text style={[styles.valueText, !isDark && styles.textDark]}>{(settings.price_deviation_threshold * 100).toFixed(0)}%</Text>
                            )}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.inputLabel}>Auto-Claim Timeout (min)</Text>
                            {isEditing ? (
                                <TextInput style={[styles.input, !isDark && styles.inputLight]} keyboardType="numeric" value={tempSettings.claim_timeout_minutes} onChangeText={v => setTempSettings({ ...tempSettings, claim_timeout_minutes: v })} />
                            ) : (
                                <Text style={[styles.valueText, !isDark && styles.textDark]}>{settings.claim_timeout_minutes || 30} m</Text>
                            )}
                        </View>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 20 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.inputLabel}>Order Expiry (hours)</Text>
                            {isEditing ? (
                                <TextInput style={[styles.input, !isDark && styles.inputLight]} keyboardType="numeric" value={tempSettings.order_expiry_hours} onChangeText={v => setTempSettings({ ...tempSettings, order_expiry_hours: v })} />
                            ) : (
                                <Text style={[styles.valueText, !isDark && styles.textDark]}>{settings.order_expiry_hours || 48} h</Text>
                            )}
                        </View>
                        <View style={{ flex: 1 }} />
                    </View>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 16 }}>
                    <Text style={[styles.sectionTitle, !isDark && styles.textDark]}>Service Types</Text>
                    <TouchableOpacity
                        onPress={() => setServiceTypeModal({ visible: true, type: null })}
                        style={{ backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 }}
                    >
                        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>+ Add Check</Text>
                    </TouchableOpacity>
                </View>

                {/* Service Types Grid */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {serviceTypes.map((type) => (
                        <View key={type.id} style={[styles.serviceCard, !isDark && styles.cardLight]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                <View style={[styles.serviceIcon, !isDark && styles.serviceIconLight]}>
                                    <Text style={{ fontSize: 18 }}>{type.icon || '🔧'}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.serviceName, !isDark && styles.textDark]} numberOfLines={1}>{type.name_en}</Text>
                                    <Text style={styles.serviceSubName} numberOfLines={1}>{type.name_ru}</Text>
                                </View>
                            </View>

                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <View style={[styles.statusBadge, { backgroundColor: type.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', paddingHorizontal: 6 }]}>
                                    <Text style={{ fontSize: 9, color: type.is_active ? '#22c55e' : '#ef4444', fontWeight: '700' }}>{type.is_active ? 'ON' : 'OFF'}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 4 }}>
                                    <TouchableOpacity onPress={() => setServiceTypeModal({ visible: true, type })} style={{ padding: 4 }}>
                                        <Ionicons name="pencil" size={14} color="#94a3b8" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => handleDeleteServiceType(type.id)} style={{ padding: 4 }}>
                                        <Ionicons name="trash" size={14} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );

    const renderPeople = () => (
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
            {renderHeader(TRANSLATIONS.tabPeople || 'People Management')}

            <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', backgroundColor: '#0f172a', padding: 4, borderRadius: 100, borderWidth: 1, borderColor: '#334155' }}>
                    <TouchableOpacity
                        style={[styles.tabBtn, peopleView === 'masters' && styles.tabBtnActive, { borderRadius: 100, paddingHorizontal: 20 }]}
                        onPress={() => setPeopleView('masters')}>
                        <Text style={[styles.tabBtnText, peopleView === 'masters' && styles.tabBtnTextActive]}>{TRANSLATIONS.peopleMasters || 'Masters'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabBtn, peopleView === 'staff' && styles.tabBtnActive, { borderRadius: 100, paddingHorizontal: 20 }]}
                        onPress={() => setPeopleView('staff')}>
                        <Text style={[styles.tabBtnText, peopleView === 'staff' && styles.tabBtnTextActive]}>{TRANSLATIONS.peopleDispatchers || 'Dispatchers'}</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {peopleView === 'masters' ? renderMasters() : renderStaff()}
        </View >
    );

    // --- Ported Renderers ---
    const renderCreateOrder = () => (
        <View style={styles.listViewContainer}>
            <View style={styles.headerRow}>
                <TouchableOpacity onPress={() => setActiveTab('orders')} style={{ marginRight: 10 }}>
                    <Text style={{ color: '#94a3b8', fontSize: 20 }}>←</Text>
                </TouchableOpacity>
                <Text style={[styles.pageTitle, !isDark && styles.textDark]}>Create New Order</Text>
            </View>
            <ScrollView style={{ flex: 1, marginTop: 20 }} showsVerticalScrollIndicator={false}>
                {/* Client */}
                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 5 }}>Client Phone *</Text>
                <TextInput style={[styles.input, !isDark && styles.inputLight, { marginBottom: 15 }]} placeholder="+996..." placeholderTextColor="#64748b"
                    value={newOrder.clientPhone} onChangeText={t => setNewOrder({ ...newOrder, clientPhone: t })} keyboardType="phone-pad" />

                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 5 }}>Client Name</Text>
                <TextInput style={[styles.input, !isDark && styles.inputLight, { marginBottom: 15 }]} placeholder="Name" placeholderTextColor="#64748b"
                    value={newOrder.clientName} onChangeText={t => setNewOrder({ ...newOrder, clientName: t })} />

                {/* Location */}
                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 5 }}>District *</Text>
                <TextInput style={[styles.input, !isDark && styles.inputLight, { marginBottom: 15 }]} placeholder="e.g. Leninsky" placeholderTextColor="#64748b"
                    value={newOrder.area} onChangeText={t => setNewOrder({ ...newOrder, area: t })} />

                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 5 }}>Full Address *</Text>
                <TextInput style={[styles.input, !isDark && styles.inputLight, { marginBottom: 15 }]} placeholder="Street, House, Apt" placeholderTextColor="#64748b"
                    value={newOrder.fullAddress} onChangeText={t => setNewOrder({ ...newOrder, fullAddress: t })} />

                {/* Service */}
                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 5 }}>Service Type</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
                    {SERVICE_TYPES.map(s => (
                        <TouchableOpacity key={s.id}
                            style={[
                                { padding: 8, borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#334155' : '#e2e8f0' },
                                newOrder.serviceType === s.id && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }
                            ]}
                            onPress={() => setNewOrder({ ...newOrder, serviceType: s.id })}>
                            <Text style={{ color: newOrder.serviceType === s.id ? '#fff' : (isDark ? '#fff' : '#0f172a') }}>{s.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 5 }}>Problem Description *</Text>
                <TextInput style={[styles.input, !isDark && styles.inputLight, { height: 80, textAlignVertical: 'top', marginBottom: 15 }]}
                    placeholder="Describe the issue..." placeholderTextColor="#64748b" multiline numberOfLines={3}
                    value={newOrder.problemDescription} onChangeText={t => setNewOrder({ ...newOrder, problemDescription: t })} />

                {/* Confirm */}
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }} onPress={() => setConfirmChecked(!confirmChecked)}>
                    <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: isDark ? '#fff' : '#0f172a', marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                        {confirmChecked && <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 12 }}>✓</Text>}
                    </View>
                    <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>Confirm Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionButton, { opacity: confirmChecked ? 1 : 0.5 }]}
                    disabled={!confirmChecked}
                    onPress={handleCreateOrder}>
                    {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonText}>Create Order</Text>}
                </TouchableOpacity>
                <View style={{ height: 50 }} />
            </ScrollView>
        </View>
    );

    const renderDetailsDrawer = () => {
        if (!detailsOrder) return null;
        return (
            <Modal visible={!!detailsOrder} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setDetailsOrder(null)} />
                    <View style={{ width: 500, backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View>
                                <Text style={[styles.pageTitle, !isDark && styles.textDark]}>Order #{detailsOrder.id.slice(0, 8)}</Text>
                                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[detailsOrder.status], alignSelf: 'flex-start', marginTop: 5 }]}>
                                    <Text style={styles.statusText}>{detailsOrder.status.toUpperCase()}</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setDetailsOrder(null)}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Client Info */}
                            <View style={[styles.card, !isDark && styles.cardLight]}>
                                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 10 }}>CLIENT</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <View style={[styles.avatarCircle, { backgroundColor: '#3b82f6' }]}>
                                        <Text style={{ color: '#fff' }}>{detailsOrder.client?.full_name?.charAt(0) || 'C'}</Text>
                                    </View>
                                    <View>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{detailsOrder.client?.full_name || 'Guest'}</Text>
                                        <Text style={[styles.itemSubtitle, !isDark && { color: '#64748b' }]}>{detailsOrder.client?.phone}</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Location */}
                            <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 10 }]}>
                                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 5 }}>ADDRESS</Text>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 16 }}>{detailsOrder.full_address}</Text>
                                <Text style={{ color: isDark ? '#64748b' : '#94a3b8' }}>{detailsOrder.area}</Text>
                            </View>

                            {/* Problem */}
                            <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 10 }]}>
                                <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 5 }}>PROBLEM</Text>
                                {isEditing ? (
                                    <TextInput style={[styles.input, !isDark && styles.inputLight, { height: 80 }]} multiline value={editForm.problem_description}
                                        onChangeText={t => setEditForm({ ...editForm, problem_description: t })} />
                                ) : (
                                    <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 16 }}>{detailsOrder.problem_description}</Text>
                                )}
                            </View>

                            {/* Edit Actions */}
                            <View style={{ marginTop: 20, flexDirection: 'row', gap: 10 }}>
                                {isEditing ? (
                                    <>
                                        <TouchableOpacity style={[styles.actionButton, { flex: 1, backgroundColor: '#22c55e' }]} onPress={handleSaveEdit}>
                                            <Text style={styles.actionButtonText}>Save Changes</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.actionButton, { flex: 1, backgroundColor: '#ef4444' }]} onPress={() => setIsEditing(false)}>
                                            <Text style={styles.actionButtonText}>Cancel</Text>
                                        </TouchableOpacity>
                                    </>
                                ) : (
                                    <TouchableOpacity style={[styles.actionButton, { flex: 1 }]} onPress={() => {
                                        setEditForm({ ...detailsOrder });
                                        setIsEditing(true);
                                    }}>
                                        <Text style={styles.actionButtonText}>Edit Details</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };



    const getStatusColor = (status) => {
        switch (status) {
            case 'placed': return '#3b82f6';
            case 'claimed': return '#f59e0b';
            case 'confirmed': return '#22c55e';
            case 'canceled': return '#ef4444';
            default: return '#64748b';
        }
    };

    // ============================================
    // MAIN LAYOUT
    // ============================================

    if (loading) {
        return (
            <View style={[styles.loadingContainer, !isDark && styles.loadingContainerLight]}>
                <ActivityIndicator size="large" color="#3b82f6" />
            </View>
        );
    }

    return (
        <LinearGradient colors={isDark ? ['#0f172a', '#1e293b'] : ['#f8fafc', '#f1f5f9']} style={styles.container}>
            {/* Hamburger Sidebar Modal */}
            {renderSidebar()}

            {/* Main Content Area */}
            <View style={[styles.mainContent, !isDark && styles.mainContentLight]}>
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'orders' && renderOrders()}
                {activeTab === 'people' && renderPeople()}
                {activeTab === 'create_order' && renderCreateOrder()}

                {activeTab === 'settings' && renderSettingsPage()}
            </View>

            {/* Payment Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showPaymentModal}
                onRequestClose={() => setShowPaymentModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Record Commission Payment</Text>
                        <Text style={{ color: '#94a3b8', marginBottom: 15 }}>
                            Master: {selectedMaster?.full_name}
                        </Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Amount (сом)"
                            placeholderTextColor="#64748b"
                            keyboardType="numeric"
                            value={paymentData.amount}
                            onChangeText={(text) => setPaymentData({ ...paymentData, amount: text })}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-end', gap: 10, marginTop: 20 }}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                onPress={() => setShowPaymentModal(false)}
                            >
                                <Text style={styles.actionButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={handleRecordPayment}
                                disabled={actionLoading}
                            >
                                <Text style={styles.actionButtonText}>{actionLoading ? 'Saving...' : 'Confirm Payment'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Service Type Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={serviceTypeModal.visible}
                onRequestClose={() => setServiceTypeModal({ visible: false, type: null })}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{serviceTypeModal.type ? 'Edit Service Type' : 'Add Service Type'}</Text>

                        <ScrollView style={{ maxHeight: 400 }}>
                            <View style={{ gap: 16 }}>
                                <View>
                                    <Text style={{ color: '#94a3b8', marginBottom: 5, fontSize: 12 }}>Code (Unique ID)</Text>
                                    <TextInput
                                        style={[styles.input, serviceTypeModal.type && { opacity: 0.5 }]}
                                        value={tempServiceType.code}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, code: v })}
                                        placeholder="e.g. plumbing"
                                        placeholderTextColor="#64748b"
                                        editable={!serviceTypeModal.type}
                                    />
                                </View>

                                <View>
                                    <Text style={{ color: '#94a3b8', marginBottom: 5, fontSize: 12 }}>Name (English)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={tempServiceType.name_en}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_en: v })}
                                        placeholder="Service Name"
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View>
                                    <Text style={{ color: '#94a3b8', marginBottom: 5, fontSize: 12 }}>Name (Russian)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={tempServiceType.name_ru}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_ru: v })}
                                        placeholder="Название услуги"
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View>
                                    <Text style={{ color: '#94a3b8', marginBottom: 5, fontSize: 12 }}>Name (Kyrgyz)</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={tempServiceType.name_kg}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_kg: v })}
                                        placeholder="Кызматтын аты"
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={{ flexDirection: 'row', gap: 16 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', marginBottom: 5, fontSize: 12 }}>Icon (Emoji)</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={tempServiceType.icon}
                                            onChangeText={v => setTempServiceType({ ...tempServiceType, icon: v })}
                                            placeholder="🔧"
                                            placeholderTextColor="#64748b"
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: '#94a3b8', marginBottom: 5, fontSize: 12 }}>Sort Order</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={String(tempServiceType.sort_order || '')}
                                            onChangeText={v => setTempServiceType({ ...tempServiceType, sort_order: parseInt(v) || 0 })}
                                            keyboardType="numeric"
                                            placeholder="0"
                                            placeholderTextColor="#64748b"
                                        />
                                    </View>
                                </View>

                                <TouchableOpacity
                                    onPress={() => setTempServiceType({ ...tempServiceType, is_active: !tempServiceType.is_active })}
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1e293b', padding: 12, borderRadius: 8, marginTop: 4 }}
                                >
                                    <Ionicons name={tempServiceType.is_active ? "checkbox" : "square-outline"} size={22} color={tempServiceType.is_active ? "#22c55e" : "#64748b"} />
                                    <Text style={{ color: '#fff' }}>Active Status</Text>
                                </TouchableOpacity>
                            </View>
                        </ScrollView>

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                onPress={() => setServiceTypeModal({ visible: false, type: null })}
                            >
                                <Text style={styles.actionButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => handleSaveServiceType(tempServiceType)}
                                disabled={actionLoading}
                            >
                                <Text style={styles.actionButtonText}>{actionLoading ? 'Saving...' : 'Save'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Ported Details Drawer */}
            {renderDetailsDrawer()}
            {renderPickerModal()}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#0b1120',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mainContent: {
        flex: 1,
        padding: 24,
        backgroundColor: '#0b1120',
    },
    scrollContent: {
        flex: 1,
    },
    listViewContainer: {
        flex: 1,
        paddingHorizontal: 8,
    },

    // Headers
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    pageTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1e293b',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#334155',
    },
    profileBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#334155',
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileText: {
        color: '#fff',
        fontWeight: '600',
    },

    // Stats
    statsGrid: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 24,
        flexWrap: 'wrap',
    },

    // Charts
    chartsRow: {
        flexDirection: 'row',
        marginBottom: 24,
        gap: 16,
        flexWrap: 'wrap',
    },
    chartCard: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: '#334155',
    },
    chartTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
    },
    chartSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 16,
        textTransform: 'uppercase',
    },

    // List Items
    filterSection: {
        marginBottom: 20,
    },
    listItemCard: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 8,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    itemTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    itemSubtitle: {
        color: '#94a3b8',
        fontSize: 12,
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        maxWidth: 120,
    },
    statusText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '700',
        textAlign: 'center',
    },
    avatarCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButton: {
        marginTop: 12,
        backgroundColor: '#22c55e',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
        lineHeight: 16,
    },

    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#1e293b',
        width: 400,
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: '#334155',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 20,
    },
    input: {
        backgroundColor: '#0f172a',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#334155',
        color: '#fff',
        padding: 12,
        marginBottom: 16,
    },
    cancelBtn: {
        flex: 1,
        backgroundColor: '#334155',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    confirmBtn: {
        flex: 1,
        backgroundColor: '#3b82f6',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    // --- Ported Styles ---
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
        marginBottom: 12,
    },
    drawerContent: {
        width: 500,
        backgroundColor: '#1e293b',
        height: '100%',
        padding: 24,
        borderLeftWidth: 1,
        borderLeftColor: '#334155',
        shadowColor: "#000",
        shadowOffset: { width: -2, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },

    // Hamburger Sidebar Styles
    sidebarOverlay: { flex: 1, flexDirection: 'row' },
    sidebarContainer: { width: 280, backgroundColor: '#0f172a', height: '100%', borderRightWidth: 1, borderRightColor: '#1e293b' },
    sidebarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b' },
    sidebarTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
    sidebarClose: { padding: 4 },
    sidebarCloseText: { fontSize: 18, color: '#94a3b8' },
    sidebarNav: { flex: 1, padding: 12 },
    sidebarNavItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10, marginBottom: 4 },
    sidebarNavItemActive: { backgroundColor: '#3b82f6' },
    sidebarNavIcon: { fontSize: 18, marginRight: 12, width: 24, textAlign: 'center' },
    sidebarNavText: { fontSize: 15, fontWeight: '500', color: '#94a3b8' },
    sidebarNavTextActive: { color: '#fff', fontWeight: '600' },
    createOrderBtn: { marginTop: 12, borderWidth: 1, borderColor: '#22c55e', borderStyle: 'dashed' },
    sidebarFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#1e293b' },
    sidebarUserCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 12, padding: 12 },
    sidebarUserAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    sidebarUserAvatarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    sidebarUserInfo: { flex: 1 },
    sidebarUserName: { fontSize: 14, fontWeight: '600', color: '#fff' },
    sidebarUserStatus: { fontSize: 11, color: '#22c55e' },
    sidebarLogoutBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(239,68,68,0.1)' },
    sidebarLogoutText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },
    sidebarBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sidebarButtonRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    sidebarSmallBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155' },
    sidebarThemeIcon: { fontSize: 20, color: '#f59e0b' },
    sidebarLangBtn: { width: 60, height: 44, borderRadius: 12, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#334155' },
    sidebarLangText: { fontSize: 24 },

    // Header Styles
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)', marginBottom: 16 },
    headerLeft: { flexDirection: 'row', alignItems: 'center' },
    headerRight: { flexDirection: 'row', gap: 8 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
    menuBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    menuBtnText: { fontSize: 22, color: '#94a3b8' },
    iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    iconText: { fontSize: 20, color: '#94a3b8' },

    // Search Bar Styles
    searchRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 12, paddingHorizontal: 14 },
    searchIcon: { fontSize: 16, color: '#64748b', marginRight: 8 },
    searchInput: { flex: 1, paddingVertical: 12, color: '#fff', fontSize: 14 },
    searchClear: { padding: 4 },
    searchClearText: { fontSize: 14, color: '#64748b' },
    viewToggleBtn: { width: 48, borderRadius: 12, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    viewToggleBtnActive: { backgroundColor: '#3b82f6' },
    viewToggleBtnText: { fontSize: 20, color: '#94a3b8' },

    // Order Card Styles (Dispatcher-style)
    orderCard: { width: (SCREEN_WIDTH - 80) / 2, backgroundColor: 'rgba(30,41,59,0.9)', borderRadius: 12, padding: 14, marginBottom: 12, marginRight: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    cardService: { fontSize: 14, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
    cardStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    cardStatusText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
    cardAddr: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    cardClient: { fontSize: 11, color: '#64748b' },
    cardTime: { fontSize: 10, color: '#64748b' },

    // Compact Row Styles
    compactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: 10, padding: 12, marginBottom: 8 },
    compactMain: { flex: 1, marginHorizontal: 12 },
    compactTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    compactId: { fontSize: 11, color: '#64748b', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    compactService: { fontSize: 14, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
    compactAddr: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    compactBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    compactClient: { fontSize: 12, color: '#64748b' },
    compactStatusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    compactStatusText: { fontSize: 10, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
    compactRight: { flexDirection: 'row', alignItems: 'center' },
    compactTime: { fontSize: 11, color: '#64748b', marginRight: 8 },
    compactChevron: { fontSize: 18, color: '#64748b' },

    // Filter Styles (Dispatcher-style)
    filtersContainer: { marginBottom: 16 },
    filterControlsRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    filterShowBtn: { paddingHorizontal: 14, height: 40, borderRadius: 12, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    filterShowBtnActive: { backgroundColor: '#3b82f6' },
    filterShowBtnText: { fontSize: 13, fontWeight: '600', color: '#94a3b8' },
    filterShowBtnTextActive: { color: '#fff' },

    filterDropdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    filterDropdown: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 40, borderRadius: 12, backgroundColor: 'rgba(71,85,105,0.3)', borderWidth: 1, borderColor: 'rgba(71,85,105,0.5)' },
    filterDropdownText: { fontSize: 13, fontWeight: '600', color: '#fff', marginRight: 8 },
    filterDropdownArrow: { fontSize: 12, color: '#64748b' },

    // Picker Modal Styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', paddingHorizontal: 20, zIndex: 9999 },
    pickerContent: { width: '85%', maxHeight: '60%', backgroundColor: '#1e293b', borderRadius: 16, padding: 20, alignSelf: 'center' },
    pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 12 },
    pickerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
    pickerClose: { fontSize: 20, color: '#94a3b8', padding: 4 },
    pickerScroll: { maxHeight: 400 },
    pickerOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#334155' },
    pickerOptionActive: { backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 8 },
    pickerOptionText: { fontSize: 16, color: '#cbd5e1' },
    pickerOptionTextActive: { color: '#3b82f6', fontWeight: '600' },
    pickerCheck: { color: '#3b82f6', fontSize: 16, fontWeight: '700' },
    statusTabText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
    statusTabTextActive: { color: '#fff' },
    filterTab: {
        // Legacy fallback if needed, but we'll switch to statusTab
        paddingVertical: 8,
        paddingHorizontal: 16,
        marginRight: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(71,85,105,0.3)',
        borderWidth: 1,
        borderColor: 'rgba(51,65,85,0.5)'
    },
    filterTabActive: {
        backgroundColor: '#3b82f6',
        borderColor: '#3b82f6',
    },
    filterTabText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#94a3b8',
    },
    filterTabTextActive: {
        color: '#fff',
        fontWeight: '600',
    },

    // Edit Button
    editBtn: {
        paddingVertical: 6,
        paddingHorizontal: 16,
        backgroundColor: '#e2e8f0',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 80,
        borderWidth: 1,
        borderColor: '#cbd5e1'
    },
    editBtnText: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },
    editBtnTextActive: { color: '#fff', fontWeight: '600' },

    // People Page Styles
    tabBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
    tabBtnActive: { backgroundColor: '#3b82f6' },
    tabBtnText: { color: '#94a3b8', fontWeight: '600', fontSize: 13 },
    tabBtnTextActive: { color: '#fff' },
    miniActionBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },

    // Light Mode Styles
    headerLight: { borderBottomColor: '#cbd5e1', backgroundColor: '#fff' },
    sidebarContainerLight: { backgroundColor: '#fff', borderRightColor: '#cbd5e1' },
    sidebarHeaderLight: { borderBottomColor: '#f1f5f9' },
    textDark: { color: '#0f172a' },
    btnLight: { backgroundColor: '#f1f5f9' },
    sidebarFooterLight: { borderTopColor: '#f1f5f9' },
    sidebarBtnLight: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
    cardLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
    sectionHeaderLight: { backgroundColor: '#fff', borderBottomColor: '#f1f5f9' },
    inputLight: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#0f172a' },
    serviceIconLight: { backgroundColor: '#f1f5f9' },
    mainContentLight: { backgroundColor: '#f8fafc' },
    loadingContainerLight: { backgroundColor: '#f8fafc' },

    // Light Mode Element Styles
    orderCardLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
    compactRowLight: { backgroundColor: '#fff' },
    listItemCardLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
    searchInputWrapperLight: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
    searchInputTextLight: { color: '#0f172a' },
    textLight: { color: '#0f172a' },
    chartCardLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
    filterDropdownLight: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
    filterDropdownTextLight: { color: '#0f172a' },
    viewToggleBtnLight: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
    filterShowBtnLight: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
    filterShowBtnTextLight: { color: '#64748b' },

    // Service Card Grid
    serviceCard: {
        width: '48%',
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#334155',
    },
    serviceIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#334155',
        alignItems: 'center',
        justifyContent: 'center',
    },
    serviceName: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 13,
    },
    serviceSubName: {
        color: '#94a3b8',
        fontSize: 11,
    },
    inputLabel: {
        color: '#94a3b8',
        fontSize: 12,
        marginBottom: 6,
    },
    valueText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
});
