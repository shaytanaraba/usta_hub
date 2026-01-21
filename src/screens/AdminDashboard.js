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
    expired: '#6b7280',
};

// Urgency filter options
const URGENCY_OPTIONS = [
    { id: 'all', label: 'filterAllUrgency' },
    { id: 'emergency', label: 'urgencyEmergency' },
    { id: 'urgent', label: 'urgencyUrgent' },
    { id: 'planned', label: 'urgencyPlanned' },
];

// Sort options
const SORT_OPTIONS = [
    { id: 'newest', label: 'filterNewestFirst' },
    { id: 'oldest', label: 'filterOldestFirst' },
];

// Attention filter options for Needs Attention section
const ATTENTION_FILTER_OPTIONS = [
    { id: 'All', label: 'issueAllIssues' },
    { id: 'Stuck', label: 'issueStuck' },
    { id: 'Disputed', label: 'issueDisputed' },
    { id: 'Payment', label: 'issueUnpaid' },
    { id: 'Canceled', label: 'issueCanceled' },
];

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
    const [filterUrgency, setFilterUrgency] = useState('all');
    const [filterSort, setFilterSort] = useState('newest');

    // Needs Attention Section State
    const [showNeedsAttention, setShowNeedsAttention] = useState(true);
    const [filterAttentionType, setFilterAttentionType] = useState('All');
    const [sortOrder, setSortOrder] = useState('newest');

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

    // NEW: State for additional modals
    const [showBalanceModal, setShowBalanceModal] = useState(false);
    const [balanceData, setBalanceData] = useState({ amount: '', type: 'top_up', notes: '' });
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [availableMasters, setAvailableMasters] = useState([]);
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [depositAmount, setDepositAmount] = useState('');
    const [detailsPerson, setDetailsPerson] = useState(null); // For person details drawer (master/dispatcher)
    const [isEditingPerson, setIsEditingPerson] = useState(false);
    const [editPersonData, setEditPersonData] = useState({});
    const [showOrderHistoryModal, setShowOrderHistoryModal] = useState(false);
    const [masterOrderHistory, setMasterOrderHistory] = useState([]);

    // NEW: Add User Modal State
    const [showAddUserModal, setShowAddUserModal] = useState(false);
    const [addUserRole, setAddUserRole] = useState('master'); // 'master' or 'dispatcher'
    const [newUserData, setNewUserData] = useState({ email: '', password: '', full_name: '', phone: '', service_area: '', experience_years: '' });

    // Password Reset Modal State
    const [showPasswordResetModal, setShowPasswordResetModal] = useState(false);
    const [passwordResetTarget, setPasswordResetTarget] = useState(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

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
        await authService.logoutUser();
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

    // --- NEW: Missing Admin Handlers ---
    const handleReopenOrder = async (orderId) => {
        Alert.alert('Reopen Order', 'Return this order to the pool for new claims?', [
            { text: 'Cancel' },
            {
                text: 'Reopen',
                onPress: async () => {
                    setActionLoading(true);
                    try {
                        const result = await ordersService.reopenOrderAdmin(orderId, 'Reopened by admin');
                        if (result.success) {
                            showToast('Order reopened', 'success');
                            setDetailsOrder(null);
                            loadOrders();
                        } else {
                            showToast(result.message, 'error');
                        }
                    } catch (e) { showToast('Reopen failed', 'error'); }
                    finally { setActionLoading(false); }
                }
            }
        ]);
    };

    const handleExpireOrders = async () => {
        Alert.alert('Expire Old Orders', 'This will mark all expired orders. Continue?', [
            { text: 'Cancel' },
            {
                text: 'Expire',
                style: 'destructive',
                onPress: async () => {
                    setActionLoading(true);
                    try {
                        const result = await ordersService.expireOldOrders();
                        if (result.success) {
                            showToast(`${result.expiredCount} orders expired`, 'success');
                            loadOrders();
                            loadStats();
                        } else {
                            showToast(result.message, 'error');
                        }
                    } catch (e) { showToast('Expire failed', 'error'); }
                    finally { setActionLoading(false); }
                }
            }
        ]);
    };

    const handleForceAssignMaster = async (orderId, masterId, masterName) => {
        Alert.alert('Force Assign', `Assign this order to ${masterName}?`, [
            { text: 'Cancel' },
            {
                text: 'Assign',
                onPress: async () => {
                    setActionLoading(true);
                    try {
                        const result = await ordersService.forceAssignMasterAdmin(orderId, masterId, 'Admin assignment');
                        if (result.success) {
                            showToast(`Assigned to ${result.masterName}`, 'success');
                            setDetailsOrder(null);
                            setShowAssignModal(false);
                            loadOrders();
                        } else {
                            showToast(result.message, 'error');
                        }
                    } catch (e) { showToast('Assign failed', 'error'); }
                    finally { setActionLoading(false); }
                }
            }
        ]);
    };

    const handleVerifyPaymentProof = async (orderId, isValid) => {
        setActionLoading(true);
        try {
            const result = await ordersService.verifyPaymentProof(orderId, isValid, isValid ? 'Approved by admin' : 'Rejected by admin');
            if (result.success) {
                showToast(result.message, 'success');
                setDetailsOrder(null);
                loadOrders();
            } else {
                showToast(result.message, 'error');
            }
        } catch (e) { showToast('Verification failed', 'error'); }
        finally { setActionLoading(false); }
    };

    const handleAddMasterBalance = async (masterId, amount, type, notes) => {
        setActionLoading(true);
        try {
            const result = await earningsService.addMasterBalance(masterId, parseFloat(amount), type, notes);
            if (result.success) {
                showToast(result.message, 'success');
                setShowBalanceModal(false);
                setBalanceData({ amount: '', type: 'top_up', notes: '' });
                loadMasters();
                loadCommissionData();
            } else {
                showToast(result.message, 'error');
            }
        } catch (e) { showToast('Balance update failed', 'error'); }
        finally { setActionLoading(false); }
    };

    const handleSetInitialDeposit = async (masterId, amount) => {
        setActionLoading(true);
        try {
            const result = await authService.setMasterInitialDeposit(masterId, parseFloat(amount));
            if (result.success) {
                showToast(result.message, 'success');
                setShowDepositModal(false);
                loadMasters();
            } else {
                showToast(result.message, 'error');
            }
        } catch (e) { showToast('Deposit failed', 'error'); }
        finally { setActionLoading(false); }
    };
    // ----------------------

    // Handle save person profile
    const handleSavePersonProfile = async () => {
        setActionLoading(true);
        try {
            const updates = {
                full_name: editPersonData.full_name,
                phone: editPersonData.phone,
                email: editPersonData.email,
            };

            if (detailsPerson?.type === 'master') {
                updates.service_area = editPersonData.service_area;
                updates.experience_years = editPersonData.experience_years;
            }

            const result = await authService.updateProfile(detailsPerson?.id, updates);

            if (result.success) {
                showToast('Profile updated!', 'success');
                setIsEditingPerson(false);
                setDetailsPerson(null);
                if (detailsPerson?.type === 'master') loadMasters();
                else loadDispatchers();
            } else {
                showToast(result.message || 'Update failed', 'error');
            }
        } catch (e) {
            console.error('Profile update failed:', e);
            showToast('Update failed', 'error');
        }
        finally { setActionLoading(false); }
    };

    // Handle create new user (master/dispatcher)
    const handleCreateUser = async () => {
        if (!newUserData.email || !newUserData.password || !newUserData.full_name) {
            showToast('Email, password, and name are required', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const result = await authService.createUser({
                ...newUserData,
                role: addUserRole
            });

            if (result.success) {
                showToast(result.message, 'success');
                setShowAddUserModal(false);
                setNewUserData({ email: '', password: '', full_name: '', phone: '', service_area: '', experience_years: '' });
                if (addUserRole === 'master') loadMasters();
                else loadDispatchers();
            } else {
                showToast(result.message || 'Failed to create user', 'error');
            }
        } catch (e) {
            console.error('Create user failed:', e);
            showToast('Failed to create user', 'error');
        }
        finally { setActionLoading(false); }
    };

    // Handle password reset for master/dispatcher
    const handleResetPassword = async () => {
        if (!newPassword || newPassword.length < 6) {
            showToast('Password must be at least 6 characters', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast('Passwords do not match', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const result = await authService.resetUserPassword(passwordResetTarget?.id, newPassword);

            if (result.success) {
                showToast(result.message, 'success');
                setShowPasswordResetModal(false);
                setPasswordResetTarget(null);
                setNewPassword('');
                setConfirmPassword('');
            } else {
                showToast(result.message || 'Password reset failed', 'error');
            }
        } catch (e) {
            console.error('Password reset failed:', e);
            showToast('Password reset failed', 'error');
        }
        finally { setActionLoading(false); }
    };

    // Load order history when modal opens (works for both masters and dispatchers)
    const loadOrderHistory = async (person) => {
        try {
            let history;
            if (person?.type === 'dispatcher' || person?.role === 'dispatcher') {
                // Get orders created by this dispatcher
                history = await ordersService.getDispatcherOrderHistory(person.id);
            } else {
                // Get orders completed by this master
                history = await ordersService.getMasterOrderHistory(person.id);
            }
            setMasterOrderHistory(history || []);
        } catch (e) {
            console.error('Failed to load order history:', e);
            setMasterOrderHistory([]);
        }
    };

    useEffect(() => {
        if (showOrderHistoryModal && selectedMaster?.id) {
            loadOrderHistory(selectedMaster);
        }
    }, [showOrderHistoryModal, selectedMaster]);

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
        // Calculate balance stats from masters
        const totalMasterBalances = masters.reduce((sum, m) => sum + (m.prepaid_balance || 0), 0);
        const lowBalanceCount = masters.filter(m => (m.prepaid_balance || 0) < 500).length;

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

                {/* Balance Stats Row */}
                <View style={[styles.statsGrid, { marginTop: 8 }]}>
                    <StatCard
                        label="Total Balances"
                        value={`${totalMasterBalances.toLocaleString()} сом`}
                        color="#22c55e"
                        subtitle={`${masters.length} masters`}
                        isDark={isDark}
                    />
                    <StatCard
                        label="Low Balance"
                        value={lowBalanceCount}
                        color="#ef4444"
                        subtitle="Below 500 сом"
                        onPress={() => { setActiveTab('people'); setPeopleView('masters'); }}
                        isDark={isDark}
                    />
                </View>

                {/* Main Charts Row */}
                <View style={styles.chartsRow}>
                    {/* Revenue Trend */}
                    <View style={[styles.chartCard, !isDark && styles.chartCardLight, { flex: 2, marginRight: 16, minWidth: 350 }]}>
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
                                width={SCREEN_WIDTH > 768 ? SCREEN_WIDTH * 0.45 : SCREEN_WIDTH - 80}
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
                                    barPercentage: 0.7,
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
                                withInnerLines={true}
                                segments={4}
                                showValuesOnTopOfBars={true}
                                fromZero
                            />
                        </View>
                    </View>

                    {/* Orders by Service */}
                    <View style={{ flex: 1, minWidth: 320 }}>
                        <OrdersByService data={stats.serviceBreakdown || {}} isDark={isDark} />
                    </View>
                </View>

                {/* Bottom Charts Row */}
                <View style={styles.chartsRow}>
                    {/* Order Status Bar Chart */}
                    <View style={{ flex: 1, marginRight: 16, minWidth: 300 }}>
                        <StatusChart data={stats.statusBreakdown || {}} isDark={isDark} />
                    </View>

                    {/* Commission Donut */}
                    <View style={{ flex: 1, minWidth: 300 }}>
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
        const currentUrgencyLabel = URGENCY_OPTIONS.find(o => o.id === filterUrgency)?.label || filterUrgency;
        const currentSortLabel = SORT_OPTIONS.find(o => o.id === filterSort)?.label || filterSort;

        // Get screen width for responsive layout
        const screenWidth = Dimensions.get('window').width;
        const isSmallScreen = screenWidth < 600;

        return (
            <View style={styles.filtersContainer}>
                <View style={[styles.filterControlsRow, { flexWrap: 'wrap', gap: 8 }]}>
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

                    {/* Filters appear INLINE with the toggle button */}
                    {showFilters && (
                        <>
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

                            {/* Urgency Filter */}
                            <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.filterDropdownLight]} onPress={() => setPickerModal({
                                visible: true,
                                title: TRANSLATIONS.filterUrgency || 'Urgency',
                                options: URGENCY_OPTIONS.map(o => ({ ...o, label: TRANSLATIONS[o.label] || o.label })),
                                value: filterUrgency,
                                onChange: setFilterUrgency
                            })}>
                                <Text style={[styles.filterDropdownText, !isDark && styles.filterDropdownTextLight]}>{TRANSLATIONS[currentUrgencyLabel] || currentUrgencyLabel}</Text>
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

                            {/* Sort Filter */}
                            <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.filterDropdownLight]} onPress={() => setPickerModal({
                                visible: true,
                                title: TRANSLATIONS.filterSort || 'Sort',
                                options: SORT_OPTIONS.map(o => ({ ...o, label: TRANSLATIONS[o.label] || o.label })),
                                value: filterSort,
                                onChange: setFilterSort
                            })}>
                                <Text style={[styles.filterDropdownText, !isDark && styles.filterDropdownTextLight]}>{TRANSLATIONS[currentSortLabel] || currentSortLabel}</Text>
                                <Ionicons name="chevron-down" size={12} color="#64748b" />
                            </TouchableOpacity>

                            {/* Clear Filters Button */}
                            <TouchableOpacity style={styles.clearFiltersBtn} onPress={() => {
                                setStatusFilter('all');
                                setFilterUrgency('all');
                                setServiceFilter('all');
                                setFilterSort('newest');
                            }}>
                                <Text style={styles.clearFiltersBtnText}>{TRANSLATIONS.clear || 'Clear'}</Text>
                            </TouchableOpacity>
                        </>
                    )}

                </View>
            </View>
        );
    };

    const renderOrders = () => {
        // --- Needs Attention Orders ---
        const needsActionOrders = orders.filter(o =>
            o.is_disputed ||
            o.status === 'completed' || // Awaiting payment
            (o.status?.includes('canceled')) ||
            (['claimed', 'started'].includes(o.status) &&
                new Date() - new Date(o.updated_at) > 24 * 60 * 60 * 1000) // Stuck > 24h
        );

        // --- Needs Attention Section ---
        const renderNeedsAttention = () => {
            if (needsActionOrders.length === 0) return null;

            // Filter Needs Attention
            const filteredAttention = needsActionOrders.filter(o => {
                if (filterAttentionType === 'All') return true;
                if (filterAttentionType === 'Stuck' && !o.is_disputed && o.status !== 'completed' && !o.status?.includes('canceled')) return true;
                if (filterAttentionType === 'Disputed' && o.is_disputed) return true;
                if (filterAttentionType === 'Payment' && o.status === 'completed') return true;
                if (filterAttentionType === 'Canceled' && o.status?.includes('canceled')) return true;
                return false;
            });

            // Sort
            const sortedNeedsAction = [...filteredAttention].sort((a, b) => {
                const dateA = new Date(a.created_at).getTime();
                const dateB = new Date(b.created_at).getTime();
                return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
            });

            if (sortedNeedsAction.length === 0 && filterAttentionType !== 'All') return (
                <View style={styles.attentionContainer}>
                    <View style={styles.attentionHeaderRow}>
                        <TouchableOpacity style={styles.attentionHeader} onPress={() => setShowNeedsAttention(!showNeedsAttention)}>
                            <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>! {TRANSLATIONS.needsAttention || 'Needs Attention'} ({needsActionOrders.length})</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={{ color: '#94a3b8', textAlign: 'center', padding: 10 }}>{TRANSLATIONS.msgNoMatch || 'No matching orders'}</Text>
                </View>
            );

            return (
                <View style={styles.attentionContainer}>
                    <View style={styles.attentionHeaderRow}>
                        <TouchableOpacity style={styles.attentionHeader} onPress={() => setShowNeedsAttention(!showNeedsAttention)}>
                            <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>! {TRANSLATIONS.needsAttention || 'Needs Attention'} ({needsActionOrders.length})</Text>
                            <Text style={[styles.attentionChevron, !isDark && { color: '#64748b' }]}>{showNeedsAttention ? '▲' : '▼'}</Text>
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {/* Attention Filter */}
                            {showNeedsAttention && (
                                <TouchableOpacity style={[styles.miniFilterBtn, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                                    visible: true,
                                    title: TRANSLATIONS.filterIssueType || 'Issue Type',
                                    options: ATTENTION_FILTER_OPTIONS.map(o => ({ ...o, label: TRANSLATIONS[o.label] || o.label })),
                                    value: filterAttentionType,
                                    onChange: setFilterAttentionType
                                })}>
                                    <Text style={styles.miniFilterText}>{TRANSLATIONS[ATTENTION_FILTER_OPTIONS.find(o => o.id === filterAttentionType)?.label] || filterAttentionType}</Text>
                                    <Text style={styles.miniFilterArrow}>▾</Text>
                                </TouchableOpacity>
                            )}

                            {/* Sort Button */}
                            {showNeedsAttention && (
                                <TouchableOpacity style={styles.cleanSortBtn} onPress={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}>
                                    <Text style={styles.cleanSortText}>{sortOrder === 'newest' ? (TRANSLATIONS.btnSortNewest || '↓ Newest') : (TRANSLATIONS.btnSortOldest || '↑ Oldest')}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    {showNeedsAttention && (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attentionScroll}>
                            {sortedNeedsAction.map(o => (
                                <TouchableOpacity key={o.id} style={[styles.attentionCard, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(o)}>
                                    <Text style={styles.attentionBadge}>
                                        {o.is_disputed ? (TRANSLATIONS.badgeDispute || 'Dispute') :
                                            o.status === 'completed' ? (TRANSLATIONS.badgeUnpaid || 'Unpaid') :
                                                o.status?.includes('canceled') ? (TRANSLATIONS.badgeCanceled || 'Canceled') :
                                                    (TRANSLATIONS.badgeStuck || 'Stuck')}
                                    </Text>
                                    <Text style={[styles.attentionService, !isDark && styles.textDark]}>{getServiceLabel(o.service_type, language)}</Text>
                                    <Text style={[styles.attentionAddr, !isDark && { color: '#64748b' }]} numberOfLines={1}>{o.full_address}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>
            );
        };

        // --- Order Card Renderer (Enhanced) ---
        const renderCard = ({ item }) => (
            <TouchableOpacity style={[styles.orderCard, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(item)}>
                <View style={styles.cardHeader}>
                    <Text style={[styles.cardService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, language)}</Text>
                    <View style={[styles.cardStatus, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
                        <Text style={styles.cardStatusText}>{getOrderStatusLabel(item.status, language)}</Text>
                    </View>
                </View>
                <Text style={[styles.cardAddr, !isDark && { color: '#64748b' }]} numberOfLines={2}>{item.full_address}</Text>
                <View style={styles.cardFooter}>
                    <Text style={[styles.cardClient, !isDark && styles.textDark]}>{item.client?.full_name || 'N/A'}</Text>
                    <Text style={styles.cardTime}>{getTimeAgo(item.created_at, language)}</Text>
                </View>
                {/* Urgency Badge */}
                {item.urgency && item.urgency !== 'planned' && (
                    <View style={[styles.cardUrgencyBadge, item.urgency === 'emergency' && styles.cardUrgencyEmergency]}>
                        <Text style={styles.cardUrgencyText}>{TRANSLATIONS[`urgency${item.urgency.charAt(0).toUpperCase() + item.urgency.slice(1)}`] || item.urgency.toUpperCase()}</Text>
                    </View>
                )}
                {/* Pay Button for completed orders */}
                {item.status === 'completed' && item.final_price && (
                    <TouchableOpacity style={styles.cardPayBtn} onPress={(e) => { e.stopPropagation?.(); setDetailsOrder(item); setShowPaymentModal(true); }}>
                        <Text style={styles.cardPayText}>{TRANSLATIONS.btnPay || 'Pay'} {item.final_price}c</Text>
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        );

        // --- Compact Row Renderer (Enhanced - status on LEFT) ---
        const renderCompactRow = ({ item }) => (
            <TouchableOpacity style={[styles.compactRow, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(item)}>
                {/* Status indicator on LEFT */}
                <View style={[styles.compactStatusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
                    <Text style={styles.compactStatusText}>{getOrderStatusLabel(item.status, language)}</Text>
                </View>
                {/* Main info */}
                <View style={styles.compactMain}>
                    <View style={styles.compactTopRow}>
                        <Text style={[styles.compactId, !isDark && { color: '#64748b' }]}>#{item.id?.slice(-6)}</Text>
                        <Text style={[styles.compactService, !isDark && styles.textDark]}>{getServiceLabel(item.service_type, language)}</Text>
                        {item.urgency && item.urgency !== 'planned' && (
                            <Text style={[styles.compactUrgency, item.urgency === 'emergency' && styles.compactUrgencyEmergency]}>
                                {TRANSLATIONS[`urgency${item.urgency.charAt(0).toUpperCase() + item.urgency.slice(1)}`] || item.urgency.toUpperCase()}
                            </Text>
                        )}
                    </View>
                    <Text style={[styles.compactAddr, !isDark && { color: '#64748b' }]} numberOfLines={1}>{item.full_address}</Text>
                    <View style={styles.compactBottomRow}>
                        <Text style={[styles.compactClient, !isDark && styles.textDark]}>{item.client?.full_name || 'N/A'}</Text>
                        {item.master && <Text style={styles.compactMaster}>→ {item.master.full_name}</Text>}
                        {item.final_price && <Text style={styles.compactPrice}>{item.final_price}c</Text>}
                    </View>
                </View>
                {/* Right side */}
                <View style={styles.compactRight}>
                    <Text style={styles.compactTime}>{getTimeAgo(item.created_at, language)}</Text>
                    <Text style={[styles.compactChevron, !isDark && { color: '#64748b' }]}>›</Text>
                </View>
            </TouchableOpacity>
        );

        // --- Filter Logic (Enhanced with urgency and sort) ---
        const filtered = orders.filter(o => {
            // Service Filter
            if (serviceFilter !== 'all' && o.service_type !== serviceFilter) return false;

            // Urgency Filter
            if (filterUrgency !== 'all' && o.urgency !== filterUrgency) return false;

            // Status Filter
            if (statusFilter !== 'all') {
                if (statusFilter === 'active') {
                    if (!['placed', 'claimed', 'started'].includes(o.status)) return false;
                } else if (statusFilter === 'completed') {
                    if (o.status !== 'completed') return false;
                } else if (statusFilter === 'canceled') {
                    if (!o.status?.includes('canceled')) return false;
                } else {
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

        // Sort
        const sorted = [...filtered].sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return filterSort === 'newest' ? dateB - dateA : dateA - dateB;
        });

        // Pagination
        const paginated = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
        const totalPages = Math.ceil(sorted.length / itemsPerPage);

        return (
            <View style={{ flex: 1, paddingHorizontal: 16 }}>
                {renderHeader('Orders')}

                {/* Needs Attention Section */}
                {renderNeedsAttention()}

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
                            <Text style={{ color: '#64748b' }}>{TRANSLATIONS.emptyList || 'No orders found'}</Text>
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
                                <TouchableOpacity
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                                    onPress={() => setDetailsPerson({ ...item, type: 'master' })}
                                >
                                    <View style={[styles.avatarCircle, { backgroundColor: item.is_verified ? '#22c55e' : '#64748b' }]}>
                                        <Text style={{ color: '#fff' }}>{item.full_name?.charAt(0)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{item.full_name}</Text>
                                        <Text style={styles.itemSubtitle}>{item.phone}</Text>
                                    </View>
                                </TouchableOpacity>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <View style={{ marginBottom: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: (item.prepaid_balance || 0) >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: 4, borderWidth: 1, borderColor: (item.prepaid_balance || 0) >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)' }}>
                                        <Text style={{ fontSize: 11, color: (item.prepaid_balance || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
                                            {TRANSLATIONS.prepaidBalance || 'Balance'}: {item.prepaid_balance || 0} сом
                                        </Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            onPress={() => { setSelectedMaster(item); setShowBalanceModal(true); }}
                                            style={[styles.miniActionBtn, { backgroundColor: 'rgba(59,130,246,0.1)', borderWidth: 1, borderColor: 'rgba(59,130,246,0.2)' }]}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#3b82f6' }}>TOP UP</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            onPress={() => setDetailsPerson({ ...item, type: 'master' })}
                                            style={[styles.miniActionBtn, { backgroundColor: isDark ? '#334155' : '#e2e8f0', borderWidth: 1, borderColor: isDark ? '#475569' : '#cbd5e1' }]}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: isDark ? '#94a3b8' : '#475569' }}>EDIT</Text>
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
                                <TouchableOpacity
                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
                                    onPress={() => setDetailsPerson({ ...item, type: 'dispatcher' })}
                                >
                                    <View style={[styles.avatarCircle, { backgroundColor: item.is_active ? '#3b82f6' : '#64748b' }]}>
                                        <Text style={{ color: '#fff' }}>{item.full_name?.charAt(0)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{item.full_name}</Text>
                                        <Text style={styles.itemSubtitle}>{item.phone || item.email}</Text>
                                    </View>
                                </TouchableOpacity>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <View style={{ marginBottom: 6, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: item.is_active ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', borderRadius: 4, borderWidth: 1, borderColor: item.is_active ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)' }}>
                                        <Text style={{ fontSize: 11, color: item.is_active ? '#22c55e' : '#ef4444', fontWeight: '600' }}>
                                            {item.is_active ? 'Active' : 'Inactive'}
                                        </Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            onPress={() => setDetailsPerson({ ...item, type: 'dispatcher' })}
                                            style={[styles.miniActionBtn, { backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.2)' }]}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#8b5cf6' }}>EDIT</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleToggleDispatcher(item.id, item.is_active)}
                                            style={[styles.miniActionBtn, { backgroundColor: item.is_active ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderWidth: 1, borderColor: item.is_active ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)' }]}
                                        >
                                            <Text style={{ fontSize: 10, fontWeight: '600', color: item.is_active ? '#ef4444' : '#22c55e' }}>
                                                {item.is_active ? 'DEACTIVATE' : 'ACTIVATE'}
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

    const renderSettingsPage = () => (
        <View style={{ flex: 1 }}>
            {renderHeader(TRANSLATIONS.settingsTitle || 'Platform Settings')}
            <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>

                {/* ============================================ */}
                {/* CONFIGURATION SECTION */}
                {/* ============================================ */}
                <View style={[styles.settingsSection, !isDark && styles.settingsSectionLight]}>
                    {/* Section Header */}
                    <View style={styles.settingsSectionHeader}>
                        <View style={styles.settingsSectionTitleRow}>
                            <View style={[styles.settingsSectionIcon, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                                <Ionicons name="settings" size={20} color="#3b82f6" />
                            </View>
                            <View>
                                <Text style={[styles.settingsSectionTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.configurationTitle || 'Configuration'}
                                </Text>
                                <Text style={styles.settingsSectionSubtitle}>
                                    Platform-wide settings and parameters
                                </Text>
                            </View>
                        </View>

                        {/* Edit/Save Buttons - Now on the left within section flow */}
                        <View style={styles.settingsActionRow}>
                            {isEditing ? (
                                <View style={{ flexDirection: 'row', gap: 10 }}>
                                    <TouchableOpacity
                                        onPress={() => setIsEditing(false)}
                                        style={[styles.settingsBtn, styles.settingsBtnSecondary, !isDark && styles.settingsBtnSecondaryLight]}
                                    >
                                        <Ionicons name="close" size={16} color={isDark ? '#94a3b8' : '#64748b'} />
                                        <Text style={[styles.settingsBtnText, !isDark && { color: '#64748b' }]}>Cancel</Text>
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
                                        style={[styles.settingsBtn, styles.settingsBtnPrimary]}
                                        disabled={actionLoading}
                                    >
                                        {actionLoading ? (
                                            <ActivityIndicator color="#fff" size="small" />
                                        ) : (
                                            <>
                                                <Ionicons name="checkmark" size={16} color="#fff" />
                                                <Text style={[styles.settingsBtnText, { color: '#fff' }]}>Save Changes</Text>
                                            </>
                                        )}
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
                                    style={[styles.settingsBtn, styles.settingsBtnOutline, !isDark && styles.settingsBtnOutlineLight]}
                                >
                                    <Ionicons name="pencil" size={16} color="#3b82f6" />
                                    <Text style={[styles.settingsBtnText, { color: '#3b82f6' }]}>Edit Settings</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Configuration Grid */}
                    <View style={[styles.settingsCard, !isDark && styles.settingsCardLight]}>
                        <View style={styles.settingsGrid}>
                            {/* Row 1 */}
                            <View style={styles.settingsGridItem}>
                                <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>Base Payout</Text>
                                <Text style={styles.settingsFieldHint}>Standard Call-out Fee</Text>
                                {isEditing ? (
                                    <View style={styles.settingsInputWrapper}>
                                        <TextInput
                                            style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                            keyboardType="numeric"
                                            value={tempSettings.default_guaranteed_payout}
                                            onChangeText={v => setTempSettings({ ...tempSettings, default_guaranteed_payout: v })}
                                            placeholder="0"
                                            placeholderTextColor="#64748b"
                                        />
                                        <Text style={styles.settingsInputSuffix}>сом</Text>
                                    </View>
                                ) : (
                                    <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                        {settings.default_guaranteed_payout || 0} <Text style={styles.settingsFieldUnit}>сом</Text>
                                    </Text>
                                )}
                            </View>

                            <View style={styles.settingsGridItem}>
                                <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>Commission Rate</Text>
                                <Text style={styles.settingsFieldHint}>Platform commission percentage</Text>
                                {isEditing ? (
                                    <View style={styles.settingsInputWrapper}>
                                        <TextInput
                                            style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                            keyboardType="numeric"
                                            value={tempSettings.commission_rate}
                                            onChangeText={v => setTempSettings({ ...tempSettings, commission_rate: v })}
                                            placeholder="0"
                                            placeholderTextColor="#64748b"
                                        />
                                        <Text style={styles.settingsInputSuffix}>%</Text>
                                    </View>
                                ) : (
                                    <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                        {(settings.commission_rate * 100).toFixed(0)}<Text style={styles.settingsFieldUnit}>%</Text>
                                    </Text>
                                )}
                            </View>

                            {/* Row 2 */}
                            <View style={styles.settingsGridItem}>
                                <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>Price Deviation</Text>
                                <Text style={styles.settingsFieldHint}>Threshold for price alerts</Text>
                                {isEditing ? (
                                    <View style={styles.settingsInputWrapper}>
                                        <TextInput
                                            style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                            keyboardType="numeric"
                                            value={tempSettings.price_deviation_threshold}
                                            onChangeText={v => setTempSettings({ ...tempSettings, price_deviation_threshold: v })}
                                            placeholder="0"
                                            placeholderTextColor="#64748b"
                                        />
                                        <Text style={styles.settingsInputSuffix}>%</Text>
                                    </View>
                                ) : (
                                    <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                        {(settings.price_deviation_threshold * 100).toFixed(0)}<Text style={styles.settingsFieldUnit}>%</Text>
                                    </Text>
                                )}
                            </View>

                            <View style={styles.settingsGridItem}>
                                <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>Auto-Claim Timeout</Text>
                                <Text style={styles.settingsFieldHint}>Minutes before order expires</Text>
                                {isEditing ? (
                                    <View style={styles.settingsInputWrapper}>
                                        <TextInput
                                            style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                            keyboardType="numeric"
                                            value={tempSettings.claim_timeout_minutes}
                                            onChangeText={v => setTempSettings({ ...tempSettings, claim_timeout_minutes: v })}
                                            placeholder="30"
                                            placeholderTextColor="#64748b"
                                        />
                                        <Text style={styles.settingsInputSuffix}>min</Text>
                                    </View>
                                ) : (
                                    <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                        {settings.claim_timeout_minutes || 30} <Text style={styles.settingsFieldUnit}>min</Text>
                                    </Text>
                                )}
                            </View>

                            {/* Row 3 */}
                            <View style={styles.settingsGridItem}>
                                <Text style={[styles.settingsFieldLabel, !isDark && styles.textDark]}>Order Expiry</Text>
                                <Text style={styles.settingsFieldHint}>Hours until unclaimed orders expire</Text>
                                {isEditing ? (
                                    <View style={styles.settingsInputWrapper}>
                                        <TextInput
                                            style={[styles.settingsInput, !isDark && styles.settingsInputLight]}
                                            keyboardType="numeric"
                                            value={tempSettings.order_expiry_hours}
                                            onChangeText={v => setTempSettings({ ...tempSettings, order_expiry_hours: v })}
                                            placeholder="48"
                                            placeholderTextColor="#64748b"
                                        />
                                        <Text style={styles.settingsInputSuffix}>hours</Text>
                                    </View>
                                ) : (
                                    <Text style={[styles.settingsFieldValue, !isDark && styles.textDark]}>
                                        {settings.order_expiry_hours || 48} <Text style={styles.settingsFieldUnit}>hours</Text>
                                    </Text>
                                )}
                            </View>

                            <View style={[styles.settingsGridItem, { opacity: 0 }]} />
                        </View>
                    </View>
                </View>

                {/* Section Divider */}
                <View style={[styles.settingsDivider, !isDark && styles.settingsDividerLight]} />

                {/* ============================================ */}
                {/* SERVICE TYPES SECTION */}
                {/* ============================================ */}
                <View style={[styles.settingsSection, !isDark && styles.settingsSectionLight]}>
                    {/* Section Header */}
                    <View style={styles.settingsSectionHeader}>
                        <View style={styles.settingsSectionTitleRow}>
                            <View style={[styles.settingsSectionIcon, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                                <Ionicons name="construct" size={20} color="#22c55e" />
                            </View>
                            <View>
                                <Text style={[styles.settingsSectionTitle, !isDark && styles.textDark]}>
                                    {TRANSLATIONS.serviceTypesTitle || 'Service Types'}
                                </Text>
                                <Text style={styles.settingsSectionSubtitle}>
                                    Manage available service categories
                                </Text>
                            </View>
                        </View>

                        {/* Add Service Type Button */}
                        <TouchableOpacity
                            onPress={() => setServiceTypeModal({ visible: true, type: null })}
                            style={[styles.settingsBtn, styles.settingsBtnPrimary]}
                        >
                            <Ionicons name="add" size={18} color="#fff" />
                            <Text style={[styles.settingsBtnText, { color: '#fff' }]}>Add Service Type</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Service Types List (Responsive - works on all screen sizes) */}
                    <View style={styles.serviceTypesList}>
                        {serviceTypes.map((type) => (
                            <View key={type.id} style={[styles.serviceTypeRow, !isDark && styles.serviceTypeRowLight]}>
                                <View style={styles.serviceTypeRowInfo}>
                                    <Text style={[styles.serviceTypeRowName, !isDark && styles.textDark]} numberOfLines={1}>
                                        {type.name_en}
                                    </Text>
                                    <Text style={styles.serviceTypeRowMeta} numberOfLines={1}>
                                        {type.name_ru || type.name_kg || '—'} • Code: {type.code || type.id}
                                    </Text>
                                </View>
                                <View style={styles.serviceTypeRowActions}>
                                    <TouchableOpacity
                                        onPress={() => setServiceTypeModal({ visible: true, type })}
                                        style={[styles.serviceTypeRowBtn, styles.serviceTypeEditBtn, !isDark && styles.serviceTypeActionBtnLight]}
                                    >
                                        <Ionicons name="pencil" size={16} color="#3b82f6" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleDeleteServiceType(type.id)}
                                        style={[styles.serviceTypeRowBtn, styles.serviceTypeDeleteBtn]}
                                    >
                                        <Ionicons name="trash" size={16} color="#ef4444" />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}

                        {/* Empty State */}
                        {serviceTypes.length === 0 && (
                            <View style={[styles.settingsEmptyState, !isDark && styles.settingsEmptyStateLight]}>
                                <Ionicons name="construct-outline" size={48} color="#64748b" />
                                <Text style={styles.settingsEmptyText}>No service types configured</Text>
                                <Text style={styles.settingsEmptyHint}>Add your first service type to get started</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Service Type Sidebar Drawer */}
            {renderServiceTypeSidebar()}
        </View>
    );

    // Service Type Sidebar (Right-side drawer instead of modal)
    const renderServiceTypeSidebar = () => (
        <Modal
            visible={serviceTypeModal.visible}
            transparent
            animationType="none"
            onRequestClose={() => setServiceTypeModal({ visible: false, type: null })}
        >
            <View style={styles.sidebarDrawerOverlay}>
                {/* Backdrop */}
                <TouchableOpacity
                    style={styles.sidebarDrawerBackdrop}
                    activeOpacity={1}
                    onPress={() => setServiceTypeModal({ visible: false, type: null })}
                />

                {/* Sidebar Content */}
                <Animated.View style={[styles.sidebarDrawerContent, !isDark && styles.sidebarDrawerContentLight]}>
                    {/* Header */}
                    <View style={[styles.sidebarDrawerHeader, !isDark && styles.sidebarDrawerHeaderLight]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <View style={[styles.sidebarDrawerIconWrapper, { backgroundColor: serviceTypeModal.type ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)' }]}>
                                <Ionicons
                                    name={serviceTypeModal.type ? "pencil" : "add"}
                                    size={20}
                                    color={serviceTypeModal.type ? "#3b82f6" : "#22c55e"}
                                />
                            </View>
                            <View>
                                <Text style={[styles.sidebarDrawerTitle, !isDark && styles.textDark]}>
                                    {serviceTypeModal.type ? 'Edit Service Type' : 'Add Service Type'}
                                </Text>
                                <Text style={styles.sidebarDrawerSubtitle}>
                                    {serviceTypeModal.type ? 'Modify existing service' : 'Create a new service category'}
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            onPress={() => setServiceTypeModal({ visible: false, type: null })}
                            style={[styles.sidebarDrawerCloseBtn, !isDark && styles.sidebarDrawerCloseBtnLight]}
                        >
                            <Ionicons name="close" size={24} color={isDark ? '#94a3b8' : '#64748b'} />
                        </TouchableOpacity>
                    </View>

                    {/* Form Content */}
                    <ScrollView style={styles.sidebarDrawerBody} showsVerticalScrollIndicator={false}>
                        <View style={{ gap: 20 }}>
                            {/* Code Field */}
                            <View style={styles.sidebarFormGroup}>
                                <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                    Code (Unique ID) {serviceTypeModal.type && <Text style={{ color: '#64748b' }}>• Read-only</Text>}
                                </Text>
                                <TextInput
                                    style={[
                                        styles.sidebarFormInput,
                                        !isDark && styles.sidebarFormInputLight,
                                        serviceTypeModal.type && styles.sidebarFormInputDisabled
                                    ]}
                                    value={tempServiceType.code}
                                    onChangeText={v => setTempServiceType({ ...tempServiceType, code: v })}
                                    placeholder="e.g. plumbing, electrician"
                                    placeholderTextColor="#64748b"
                                    editable={!serviceTypeModal.type}
                                />
                            </View>

                            {/* Names Section */}
                            <View style={[styles.sidebarFormSection, !isDark && styles.sidebarFormSectionLight]}>
                                <Text style={styles.sidebarFormSectionTitle}>
                                    <Ionicons name="globe-outline" size={14} color="#64748b" /> Localized Names
                                </Text>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        English Name
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempServiceType.name_en}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_en: v })}
                                        placeholder="Service Name"
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        Russian Name
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempServiceType.name_ru}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_ru: v })}
                                        placeholder="Название услуги"
                                        placeholderTextColor="#64748b"
                                    />
                                </View>

                                <View style={styles.sidebarFormGroup}>
                                    <Text style={[styles.sidebarFormLabel, !isDark && { color: '#0f172a' }]}>
                                        Kyrgyz Name
                                    </Text>
                                    <TextInput
                                        style={[styles.sidebarFormInput, !isDark && styles.sidebarFormInputLight]}
                                        value={tempServiceType.name_kg}
                                        onChangeText={v => setTempServiceType({ ...tempServiceType, name_kg: v })}
                                        placeholder="Кызматтын аты"
                                        placeholderTextColor="#64748b"
                                    />
                                </View>
                            </View>


                        </View>
                    </ScrollView>

                    {/* Footer Actions */}
                    <View style={[styles.sidebarDrawerFooter, !isDark && styles.sidebarDrawerFooterLight]}>
                        <TouchableOpacity
                            style={[styles.sidebarDrawerBtn, styles.sidebarDrawerBtnSecondary, !isDark && styles.sidebarDrawerBtnSecondaryLight]}
                            onPress={() => setServiceTypeModal({ visible: false, type: null })}
                        >
                            <Text style={[styles.sidebarDrawerBtnText, { color: isDark ? '#94a3b8' : '#64748b' }]}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.sidebarDrawerBtn, styles.sidebarDrawerBtnPrimary]}
                            onPress={() => handleSaveServiceType(tempServiceType)}
                            disabled={actionLoading}
                        >
                            {actionLoading ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={[styles.sidebarDrawerBtnText, { color: '#fff' }]}>
                                    {serviceTypeModal.type ? 'Update Service' : 'Create Service'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );

    const renderPeople = () => (
        <View style={{ flex: 1, paddingHorizontal: 16 }}>
            {renderHeader(TRANSLATIONS.tabPeople || 'People Management')}

            {/* Header Row: Tabs on left, Add button on right */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                {/* Tab Toggle (left-aligned) */}
                <View style={{ flexDirection: 'row', backgroundColor: isDark ? '#0f172a' : '#e2e8f0', padding: 4, borderRadius: 100, borderWidth: 1, borderColor: isDark ? '#334155' : '#cbd5e1' }}>
                    <TouchableOpacity
                        style={[styles.tabBtn, peopleView === 'masters' && styles.tabBtnActive, !isDark && peopleView !== 'masters' && styles.tabBtnLight, { borderRadius: 100, paddingHorizontal: 20 }]}
                        onPress={() => setPeopleView('masters')}>
                        <Text style={[styles.tabBtnText, peopleView === 'masters' && styles.tabBtnTextActive, !isDark && peopleView !== 'masters' && styles.textDark]}>{TRANSLATIONS.peopleMasters || 'Masters'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.tabBtn, peopleView === 'staff' && styles.tabBtnActive, !isDark && peopleView !== 'staff' && styles.tabBtnLight, { borderRadius: 100, paddingHorizontal: 20 }]}
                        onPress={() => setPeopleView('staff')}>
                        <Text style={[styles.tabBtnText, peopleView === 'staff' && styles.tabBtnTextActive, !isDark && peopleView !== 'staff' && styles.textDark]}>{TRANSLATIONS.peopleDispatchers || 'Dispatchers'}</Text>
                    </TouchableOpacity>
                </View>

                {/* Add Button (right side) */}
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: peopleView === 'masters' ? '#22c55e' : '#3b82f6', paddingHorizontal: 16, paddingVertical: 10, marginTop: 0 }]}
                    onPress={() => { setAddUserRole(peopleView === 'masters' ? 'master' : 'dispatcher'); setShowAddUserModal(true); }}
                >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="person-add" size={16} color="#fff" />
                        <Text style={styles.actionButtonText}>{peopleView === 'masters' ? (TRANSLATIONS.addMaster || 'Add Master') : (TRANSLATIONS.addDispatcher || 'Add Dispatcher')}</Text>
                    </View>
                </TouchableOpacity>
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

                            {/* --- NEW: Admin Action Buttons --- */}
                            {/* Reopen Order (for canceled/expired) */}
                            {['canceled_by_master', 'canceled_by_client', 'expired'].includes(detailsOrder.status) && (
                                <TouchableOpacity
                                    style={[styles.actionButton, { backgroundColor: '#3b82f6', marginTop: 12 }]}
                                    onPress={() => handleReopenOrder(detailsOrder.id)}
                                    disabled={actionLoading}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="refresh" size={16} color="#fff" />
                                        <Text style={styles.actionButtonText}>
                                            {actionLoading ? 'Processing...' : 'Reopen Order'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            )}

                            {/* Force Assign Master (for placed/reopened orders) */}
                            {['placed', 'reopened'].includes(detailsOrder.status) && (
                                <TouchableOpacity
                                    style={[styles.actionButton, { backgroundColor: '#8b5cf6', marginTop: 12 }]}
                                    onPress={async () => {
                                        const mastersData = await ordersService.getAvailableMasters();
                                        setAvailableMasters(mastersData);
                                        setShowAssignModal(true);
                                    }}
                                    disabled={actionLoading}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                        <Ionicons name="person-add" size={16} color="#fff" />
                                        <Text style={styles.actionButtonText}>Force Assign Master</Text>
                                    </View>
                                </TouchableOpacity>
                            )}

                            {/* Verify Payment Proof (for completed orders with pending transfer proof) */}
                            {detailsOrder.status === 'completed' && detailsOrder.payment_method === 'transfer' && detailsOrder.payment_proof_url && (
                                <View style={{ marginTop: 12 }}>
                                    <Text style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>PAYMENT PROOF VERIFICATION</Text>
                                    <View style={{ flexDirection: 'row', gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { flex: 1, backgroundColor: '#22c55e' }]}
                                            onPress={() => handleVerifyPaymentProof(detailsOrder.id, true)}
                                            disabled={actionLoading}
                                        >
                                            <Text style={styles.actionButtonText}>✓ Approve</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { flex: 1, backgroundColor: '#ef4444' }]}
                                            onPress={() => handleVerifyPaymentProof(detailsOrder.id, false)}
                                            disabled={actionLoading}
                                        >
                                            <Text style={styles.actionButtonText}>✗ Reject</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
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
                    <View style={[styles.modalContent, !isDark && styles.modalContentLight]}>
                        <Text style={[styles.modalTitle, !isDark && styles.modalTitleLight]}>Record Commission Payment</Text>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 15 }}>
                            Master: {selectedMaster?.full_name}
                        </Text>

                        <TextInput
                            style={[styles.input, !isDark && styles.inputLight]}
                            placeholder="Amount (сом)"
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            keyboardType="numeric"
                            value={paymentData.amount}
                            onChangeText={(text) => setPaymentData({ ...paymentData, amount: text })}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
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



            {/* Ported Details Drawer */}
            {renderDetailsDrawer()}
            {renderPickerModal()}

            {/* Force Assign Master Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showAssignModal}
                onRequestClose={() => setShowAssignModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { maxHeight: 500 }]}>
                        <Text style={styles.modalTitle}>Force Assign Master</Text>
                        <Text style={{ color: '#94a3b8', marginBottom: 15 }}>
                            Select a master to assign this order to:
                        </Text>
                        <ScrollView style={{ maxHeight: 300 }}>
                            {availableMasters.length === 0 ? (
                                <Text style={{ color: '#64748b', textAlign: 'center', paddingVertical: 20 }}>
                                    No available masters found
                                </Text>
                            ) : (
                                availableMasters.map(master => (
                                    <TouchableOpacity
                                        key={master.id}
                                        style={[styles.listItemCard, { marginBottom: 8 }]}
                                        onPress={() => handleForceAssignMaster(detailsOrder?.id, master.id, master.full_name)}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            <View style={[styles.avatarCircle, { backgroundColor: master.is_verified ? '#22c55e' : '#64748b' }]}>
                                                <Text style={{ color: '#fff' }}>{master.full_name?.charAt(0)}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.itemTitle}>{master.full_name}</Text>
                                                <Text style={styles.itemSubtitle}>{master.phone} • Rating: {master.rating || 'N/A'}</Text>
                                            </View>
                                            <Ionicons name="chevron-forward" size={16} color="#64748b" />
                                        </View>
                                    </TouchableOpacity>
                                ))
                            )}
                        </ScrollView>
                        <TouchableOpacity
                            style={[styles.actionButton, { backgroundColor: '#334155', marginTop: 16 }]}
                            onPress={() => setShowAssignModal(false)}
                        >
                            <Text style={styles.actionButtonText}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Balance Management Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showBalanceModal}
                onRequestClose={() => setShowBalanceModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, !isDark && styles.modalContentLight]}>
                        <Text style={[styles.modalTitle, !isDark && styles.modalTitleLight]}>Add Master Balance</Text>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 15 }}>
                            Master: {selectedMaster?.full_name}
                        </Text>

                        <TextInput
                            style={[styles.input, !isDark && styles.inputLight]}
                            placeholder="Amount (сом)"
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            keyboardType="numeric"
                            value={balanceData.amount}
                            onChangeText={(text) => setBalanceData({ ...balanceData, amount: text })}
                        />

                        <TextInput
                            style={[styles.input, { height: 60 }, !isDark && styles.inputLight]}
                            placeholder="Notes (optional)"
                            placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            multiline
                            value={balanceData.notes}
                            onChangeText={(text) => setBalanceData({ ...balanceData, notes: text })}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                onPress={() => setShowBalanceModal(false)}
                            >
                                <Text style={styles.actionButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => handleAddMasterBalance(selectedMaster?.id, balanceData.amount, balanceData.type, balanceData.notes)}
                                disabled={actionLoading || !balanceData.amount}
                            >
                                <Text style={styles.actionButtonText}>{actionLoading ? 'Saving...' : 'Add Balance'}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Person Details Drawer (Master/Dispatcher) */}
            <Modal visible={!!detailsPerson} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setDetailsPerson(null)} />
                    <View style={{ width: 500, backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={[styles.avatarCircle, { width: 48, height: 48, borderRadius: 24, backgroundColor: detailsPerson?.type === 'master' ? (detailsPerson?.is_verified ? '#22c55e' : '#64748b') : (detailsPerson?.is_active ? '#3b82f6' : '#64748b') }]}>
                                    <Text style={{ color: '#fff', fontSize: 18 }}>{detailsPerson?.full_name?.charAt(0)}</Text>
                                </View>
                                <View>
                                    <Text style={[styles.pageTitle, !isDark && styles.textDark]}>{detailsPerson?.full_name}</Text>
                                    <View style={[styles.statusBadge, { backgroundColor: detailsPerson?.type === 'master' ? (detailsPerson?.is_verified ? '#22c55e' : '#64748b') : (detailsPerson?.is_active ? '#3b82f6' : '#64748b'), alignSelf: 'flex-start', marginTop: 4 }]}>
                                        <Text style={styles.statusText}>
                                            {detailsPerson?.type === 'master' ? (detailsPerson?.is_verified ? 'VERIFIED' : 'UNVERIFIED') : (detailsPerson?.is_active ? 'ACTIVE' : 'INACTIVE')}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => setDetailsPerson(null)}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Contact Info - Editable when isEditingPerson */}
                            <View style={[styles.card, !isDark && styles.cardLight]}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>CONTACT INFO</Text>
                                    {!isEditingPerson && (
                                        <TouchableOpacity onPress={() => { setIsEditingPerson(true); setEditPersonData({ ...detailsPerson }); }}>
                                            <Text style={{ color: '#3b82f6', fontSize: 12 }}>Edit</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {isEditingPerson ? (
                                    <View style={{ gap: 12 }}>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Full Name</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                value={editPersonData.full_name || ''}
                                                onChangeText={(text) => setEditPersonData({ ...editPersonData, full_name: text })}
                                                placeholderTextColor="#64748b"
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Phone</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                value={editPersonData.phone || ''}
                                                onChangeText={(text) => setEditPersonData({ ...editPersonData, phone: text })}
                                                placeholderTextColor="#64748b"
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Email</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                value={editPersonData.email || ''}
                                                onChangeText={(text) => setEditPersonData({ ...editPersonData, email: text })}
                                                placeholderTextColor="#64748b"
                                            />
                                        </View>
                                        {detailsPerson?.type === 'master' && (
                                            <>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Service Area</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        value={editPersonData.service_area || ''}
                                                        onChangeText={(text) => setEditPersonData({ ...editPersonData, service_area: text })}
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Experience (years)</Text>
                                                    <TextInput
                                                        style={[styles.input, !isDark && styles.inputLight]}
                                                        value={String(editPersonData.experience_years || '')}
                                                        onChangeText={(text) => setEditPersonData({ ...editPersonData, experience_years: text })}
                                                        keyboardType="numeric"
                                                        placeholderTextColor="#64748b"
                                                    />
                                                </View>
                                            </>
                                        )}
                                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                                            <TouchableOpacity
                                                style={[styles.actionButton, { backgroundColor: '#22c55e', flex: 1 }]}
                                                onPress={handleSavePersonProfile}
                                                disabled={actionLoading}
                                            >
                                                <Text style={styles.actionButtonText}>{actionLoading ? 'Saving...' : 'Save Changes'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.actionButton, { backgroundColor: isDark ? '#334155' : '#e2e8f0', flex: 1 }]}
                                                onPress={() => setIsEditingPerson(false)}
                                            >
                                                <Text style={[styles.actionButtonText, !isDark && { color: '#475569' }]}>Cancel</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : (
                                    <View style={{ gap: 8 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <Ionicons name="call" size={16} color="#3b82f6" />
                                            <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.phone || 'N/A'}</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <Ionicons name="mail" size={16} color="#3b82f6" />
                                            <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.email || 'N/A'}</Text>
                                        </View>
                                    </View>
                                )}
                            </View>

                            {/* Master-specific info */}
                            {detailsPerson?.type === 'master' && (
                                <>
                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <Text style={{ color: '#94a3b8', marginBottom: 10, fontSize: 12 }}>FINANCIALS</Text>
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>Balance:</Text>
                                                <Text style={{ color: (detailsPerson?.prepaid_balance || 0) >= 0 ? '#22c55e' : '#ef4444', fontWeight: '700' }}>{detailsPerson?.prepaid_balance || 0} сом</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>Initial Deposit:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.initial_deposit || 0} сом</Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <Text style={{ color: '#94a3b8', marginBottom: 10, fontSize: 12 }}>PERFORMANCE</Text>
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>Completed Jobs:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.completed_jobs || 0}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Master Actions */}
                                    <View style={{ marginTop: 20, gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#8b5cf6' }]}
                                            onPress={() => { setSelectedMaster(detailsPerson); setShowOrderHistoryModal(true); setDetailsPerson(null); }}
                                        >
                                            <Text style={styles.actionButtonText}>{TRANSLATIONS.sectionHistory || 'View Order History'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#3b82f6' }]}
                                            onPress={() => { setSelectedMaster(detailsPerson); setShowBalanceModal(true); setDetailsPerson(null); }}
                                        >
                                            <Text style={styles.actionButtonText}>Top Up Balance</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: detailsPerson?.is_verified ? '#ef4444' : '#22c55e' }]}
                                            onPress={() => { handleVerifyMaster(detailsPerson?.id, detailsPerson?.is_verified); setDetailsPerson(null); }}
                                        >
                                            <Text style={styles.actionButtonText}>{detailsPerson?.is_verified ? 'Unverify Master' : 'Verify Master'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}
                                            onPress={() => { setPasswordResetTarget(detailsPerson); setShowPasswordResetModal(true); setDetailsPerson(null); }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="key" size={16} color="#fff" />
                                                <Text style={styles.actionButtonText}>Reset Password</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}

                            {/* Dispatcher-specific info */}
                            {detailsPerson?.type === 'dispatcher' && (
                                <>
                                    <View style={[styles.card, !isDark && styles.cardLight, { marginTop: 12 }]}>
                                        <Text style={{ color: '#94a3b8', marginBottom: 10, fontSize: 12 }}>STATS</Text>
                                        <View style={{ gap: 8 }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>Status:</Text>
                                                <Text style={{ color: detailsPerson?.is_active ? '#22c55e' : '#ef4444', fontWeight: '600' }}>{detailsPerson?.is_active ? 'Active' : 'Inactive'}</Text>
                                            </View>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                                <Text style={{ color: '#64748b' }}>Created:</Text>
                                                <Text style={{ color: isDark ? '#fff' : '#0f172a' }}>{detailsPerson?.created_at ? new Date(detailsPerson.created_at).toLocaleDateString() : 'N/A'}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Dispatcher Actions */}
                                    <View style={{ marginTop: 20, gap: 10 }}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#8b5cf6' }]}
                                            onPress={() => { setSelectedMaster(detailsPerson); setShowOrderHistoryModal(true); setDetailsPerson(null); }}
                                        >
                                            <Text style={styles.actionButtonText}>{TRANSLATIONS.sectionHistory || 'View Order History'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: detailsPerson?.is_active ? '#ef4444' : '#22c55e' }]}
                                            onPress={() => { handleToggleDispatcher(detailsPerson?.id, detailsPerson?.is_active); setDetailsPerson(null); }}
                                        >
                                            <Text style={styles.actionButtonText}>{detailsPerson?.is_active ? 'Deactivate' : 'Activate'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}
                                            onPress={() => { setPasswordResetTarget(detailsPerson); setShowPasswordResetModal(true); setDetailsPerson(null); }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                <Ionicons name="key" size={16} color="#fff" />
                                                <Text style={styles.actionButtonText}>Reset Password</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Master Order History Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showOrderHistoryModal}
                onRequestClose={() => setShowOrderHistoryModal(false)}
            >
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowOrderHistoryModal(false)} />
                    <View style={{ width: 500, backgroundColor: isDark ? '#1e293b' : '#fff', padding: 20 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 }}>
                            <View>
                                <Text style={[styles.pageTitle, !isDark && styles.textDark]}>{TRANSLATIONS.sectionHistory || 'Order History'}</Text>
                                <Text style={{ color: '#64748b', marginTop: 4 }}>{selectedMaster?.full_name}</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowOrderHistoryModal(false)}>
                                <Text style={{ color: isDark ? '#fff' : '#0f172a', fontSize: 24 }}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {masterOrderHistory.length === 0 ? (
                                <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60 }}>
                                    <Ionicons name="document-text-outline" size={48} color="#64748b" />
                                    <Text style={{ color: '#64748b', marginTop: 12 }}>{TRANSLATIONS.noOrderHistory || 'No order history'}</Text>
                                </View>
                            ) : (
                                masterOrderHistory.map((order, idx) => {
                                    const statusColor = STATUS_COLORS[order.status] || '#64748b';
                                    return (
                                        <TouchableOpacity
                                            key={order.id || idx}
                                            style={[styles.card, !isDark && styles.cardLight, { marginBottom: 10 }]}
                                            onPress={() => {
                                                setShowOrderHistoryModal(false);
                                                setOrderDetails(order);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={[styles.itemTitle, !isDark && styles.textDark]}>{getServiceLabel(order.service_type, language)}</Text>
                                                    <Text style={styles.itemSubtitle}>{order.area || 'N/A'}</Text>
                                                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                                        {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A'}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end' }}>
                                                    <Text style={{ color: '#22c55e', fontWeight: '700', fontSize: 14 }}>
                                                        {order.final_price || order.initial_price || '-'} сом
                                                    </Text>
                                                    <View style={[styles.statusBadge, { backgroundColor: statusColor, marginTop: 6 }]}>
                                                        <Text style={styles.statusText}>{getOrderStatusLabel(order.status, language)}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: isDark ? '#334155' : '#e2e8f0' }}>
                                                <Ionicons name="chevron-forward" size={14} color="#64748b" />
                                                <Text style={{ color: '#64748b', fontSize: 11, marginLeft: 4 }}>Tap to view details</Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Add User Modal (Master/Dispatcher) */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showAddUserModal}
                onRequestClose={() => setShowAddUserModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { width: 450 }, !isDark && styles.modalContentLight]}>
                        <Text style={[styles.modalTitle, !isDark && styles.modalTitleLight]}>
                            {addUserRole === 'master' ? (TRANSLATIONS.addMaster || 'Add New Master') : (TRANSLATIONS.addDispatcher || 'Add New Dispatcher')}
                        </Text>
                        <Text style={{ color: isDark ? '#94a3b8' : '#64748b', marginBottom: 15 }}>
                            Create a new {addUserRole} account
                        </Text>

                        <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                            <View style={{ gap: 12 }}>
                                {/* Email */}
                                <View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Email *</Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder="email@example.com"
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={newUserData.email}
                                        onChangeText={(text) => setNewUserData({ ...newUserData, email: text })}
                                    />
                                </View>

                                {/* Password */}
                                <View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Password *</Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder="Minimum 6 characters"
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        secureTextEntry
                                        value={newUserData.password}
                                        onChangeText={(text) => setNewUserData({ ...newUserData, password: text })}
                                    />
                                </View>

                                {/* Full Name */}
                                <View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Full Name *</Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder="John Doe"
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        value={newUserData.full_name}
                                        onChangeText={(text) => setNewUserData({ ...newUserData, full_name: text })}
                                    />
                                </View>

                                {/* Phone */}
                                <View>
                                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Phone</Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder="+996..."
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                        keyboardType="phone-pad"
                                        value={newUserData.phone}
                                        onChangeText={(text) => setNewUserData({ ...newUserData, phone: text })}
                                    />
                                </View>

                                {/* Master-specific fields */}
                                {addUserRole === 'master' && (
                                    <>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Service Area</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                placeholder="e.g. Bishkek, Leninsky district"
                                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                                value={newUserData.service_area}
                                                onChangeText={(text) => setNewUserData({ ...newUserData, service_area: text })}
                                            />
                                        </View>
                                        <View>
                                            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Experience (years)</Text>
                                            <TextInput
                                                style={[styles.input, !isDark && styles.inputLight]}
                                                placeholder="0"
                                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                                keyboardType="numeric"
                                                value={newUserData.experience_years}
                                                onChangeText={(text) => setNewUserData({ ...newUserData, experience_years: text })}
                                            />
                                        </View>
                                    </>
                                )}
                            </View>
                        </ScrollView>

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                onPress={() => {
                                    setShowAddUserModal(false);
                                    setNewUserData({ email: '', password: '', full_name: '', phone: '', service_area: '', experience_years: '' });
                                }}
                            >
                                <Text style={styles.actionButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: addUserRole === 'master' ? '#22c55e' : '#3b82f6' }]}
                                onPress={handleCreateUser}
                                disabled={actionLoading || !newUserData.email || !newUserData.password || !newUserData.full_name}
                            >
                                <Text style={styles.actionButtonText}>
                                    {actionLoading ? 'Creating...' : `Create ${addUserRole === 'master' ? 'Master' : 'Dispatcher'}`}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Password Reset Modal */}
            <Modal
                animationType="fade"
                transparent={true}
                visible={showPasswordResetModal}
                onRequestClose={() => {
                    setShowPasswordResetModal(false);
                    setPasswordResetTarget(null);
                    setNewPassword('');
                    setConfirmPassword('');
                }}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { width: 400 }, !isDark && styles.modalContentLight]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#f59e0b20', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="key" size={22} color="#f59e0b" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.modalTitle, !isDark && styles.modalTitleLight]}>Reset Password</Text>
                                <Text style={{ color: isDark ? '#64748b' : '#334155', fontSize: 12 }}>
                                    {passwordResetTarget?.full_name}
                                </Text>
                            </View>
                        </View>

                        <View style={{ backgroundColor: '#f59e0b15', padding: 12, borderRadius: 8, marginBottom: 16, borderLeftWidth: 3, borderLeftColor: '#f59e0b' }}>
                            <Text style={{ color: '#f59e0b', fontSize: 12 }}>
                                ⚠️ This action will immediately change the user's password. They will need to use the new password to login.
                            </Text>
                        </View>

                        <View style={{ gap: 12 }}>
                            <View>
                                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>New Password *</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight]}
                                    placeholder="Minimum 6 characters"
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                    secureTextEntry
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                />
                            </View>
                            <View>
                                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Confirm Password *</Text>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight, confirmPassword && newPassword !== confirmPassword && { borderColor: '#ef4444' }]}
                                    placeholder="Re-enter password"
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                    secureTextEntry
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                />
                                {confirmPassword && newPassword !== confirmPassword && (
                                    <Text style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>Passwords do not match</Text>
                                )}
                            </View>
                        </View>

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#334155' }]}
                                onPress={() => {
                                    setShowPasswordResetModal(false);
                                    setPasswordResetTarget(null);
                                    setNewPassword('');
                                    setConfirmPassword('');
                                }}
                            >
                                <Text style={styles.actionButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.actionButton, { backgroundColor: '#f59e0b' }]}
                                onPress={handleResetPassword}
                                disabled={actionLoading || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword}
                            >
                                <Text style={styles.actionButtonText}>
                                    {actionLoading ? 'Resetting...' : 'Reset Password'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </LinearGradient >
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
    // Tab Buttons (People toggle)
    tabBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    tabBtnActive: {
        backgroundColor: '#3b82f6',
    },
    tabBtnLight: {
        backgroundColor: 'transparent',
    },
    tabBtnText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#94a3b8',
    },
    tabBtnTextActive: {
        color: '#fff',
        fontWeight: '600',
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
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        ...Platform.select({
            web: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 1000,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            },
            default: {
                ...StyleSheet.absoluteFillObject,
            }
        })
    },
    modalContent: {
        backgroundColor: '#1e293b',
        width: 400,
        maxWidth: '90%',
        borderRadius: 20,
        padding: 24,
        borderWidth: 1,
        borderColor: '#334155',
        ...Platform.select({
            web: {
                alignSelf: 'center',
                margin: 'auto',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            }
        })
    },
    modalContentLight: {
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 20,
    },
    modalTitleLight: {
        color: '#0f172a',
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
    inputLight: {
        backgroundColor: '#ffffff',
        borderColor: '#e2e8f0',
        color: '#0f172a',
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
    orderCard: { flex: 1, maxWidth: '48%', backgroundColor: 'rgba(30,41,59,0.9)', borderRadius: 12, padding: 14, marginBottom: 12, marginHorizontal: 4 },
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
    compactUrgency: { fontSize: 9, fontWeight: '700', color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
    compactUrgencyEmergency: { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.2)' },
    compactMaster: { fontSize: 11, color: '#22c55e' },
    compactPrice: { fontSize: 11, fontWeight: '700', color: '#22c55e' },

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

    // Clear Filters Button
    clearFiltersBtn: { paddingHorizontal: 14, height: 40, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
    clearFiltersBtnText: { fontSize: 13, fontWeight: '600', color: '#ef4444' },

    // Needs Attention Section Styles
    attentionContainer: { marginBottom: 16, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', padding: 12 },
    attentionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    attentionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    attentionTitle: { fontSize: 13, fontWeight: '700', color: '#ef4444' },
    attentionChevron: { fontSize: 12, color: '#ef4444' },
    attentionScroll: { marginTop: 8 },
    attentionCard: { width: 140, backgroundColor: 'rgba(30,41,59,0.9)', borderRadius: 10, padding: 10, marginRight: 8 },
    attentionBadge: { fontSize: 9, fontWeight: '700', color: '#fff', backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 6 },
    attentionService: { fontSize: 13, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
    attentionAddr: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

    // Mini Filter Button (for Needs Attention)
    miniFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(71,85,105,0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    miniFilterText: { fontSize: 11, color: '#94a3b8', marginRight: 4 },
    miniFilterArrow: { fontSize: 10, color: '#94a3b8' },

    // Clean Sort Button
    cleanSortBtn: { paddingHorizontal: 4 },
    cleanSortText: { fontSize: 13, color: '#3b82f6', fontWeight: '500' },

    // Card Urgency Badge
    cardUrgencyBadge: { marginTop: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(245,158,11,0.2)', borderRadius: 4, alignSelf: 'flex-start' },
    cardUrgencyEmergency: { backgroundColor: 'rgba(239,68,68,0.2)' },
    cardUrgencyText: { fontSize: 10, fontWeight: '700', color: '#f59e0b' },

    // Card Pay Button
    cardPayBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
    cardPayText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    // Light Mode Card Style
    cardLight: { backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },

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

    // ============================================
    // SETTINGS PAGE STYLES
    // ============================================
    settingsSection: {
        marginBottom: 8,
    },
    settingsSectionLight: {
        backgroundColor: 'transparent',
    },
    settingsSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
        flexWrap: 'wrap',
        gap: 16,
    },
    settingsSectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
    },
    settingsSectionIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingsSectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    settingsSectionSubtitle: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 2,
    },
    settingsActionRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    settingsBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
    },
    settingsBtnPrimary: {
        backgroundColor: '#22c55e',
    },
    settingsBtnSecondary: {
        backgroundColor: '#334155',
    },
    settingsBtnSecondaryLight: {
        backgroundColor: '#e2e8f0',
    },
    settingsBtnOutline: {
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#3b82f6',
    },
    settingsBtnOutlineLight: {
        backgroundColor: 'transparent',
        borderColor: '#3b82f6',
    },
    settingsBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#94a3b8',
    },
    settingsCard: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        borderWidth: 1,
        borderColor: '#334155',
    },
    settingsCardLight: {
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
    },
    settingsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 24,
    },
    settingsGridItem: {
        width: '48%',
        minWidth: 280,
    },
    settingsFieldHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    settingsFieldLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    settingsFieldHint: {
        fontSize: 12,
        color: '#64748b',
        marginBottom: 12,
    },
    settingsFieldValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
    },
    settingsFieldUnit: {
        fontSize: 14,
        fontWeight: '500',
        color: '#64748b',
    },
    settingsInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    settingsInput: {
        flex: 1,
        backgroundColor: '#0f172a',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#334155',
        color: '#fff',
        padding: 14,
        fontSize: 16,
        fontWeight: '600',
    },
    settingsInputLight: {
        backgroundColor: '#f8fafc',
        borderColor: '#e2e8f0',
        color: '#0f172a',
    },
    settingsInputSuffix: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
        minWidth: 40,
    },
    settingsDivider: {
        height: 1,
        backgroundColor: '#334155',
        marginVertical: 32,
    },
    settingsDividerLight: {
        backgroundColor: '#e2e8f0',
    },
    settingsEmptyState: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        backgroundColor: '#1e293b',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#334155',
        borderStyle: 'dashed',
    },
    settingsEmptyStateLight: {
        backgroundColor: '#f8fafc',
        borderColor: '#cbd5e1',
    },
    settingsEmptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#94a3b8',
        marginTop: 16,
    },
    settingsEmptyHint: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 4,
    },

    // Service Types Grid (New Design)
    serviceTypesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 16,
    },
    // Service Types List (Responsive alternative to grid)
    serviceTypesList: {
        gap: 8,
    },
    serviceTypeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    serviceTypeRowLight: {
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
    },
    serviceTypeRowInfo: {
        flex: 1,
        marginRight: 16,
    },
    serviceTypeRowName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 2,
    },
    serviceTypeRowMeta: {
        fontSize: 12,
        color: '#64748b',
    },
    serviceTypeRowActions: {
        flexDirection: 'row',
        gap: 8,
    },
    serviceTypeRowBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    serviceTypeCard: {
        width: 'calc(25% - 12px)',
        minWidth: 220,
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    serviceTypeCardLight: {
        backgroundColor: '#fff',
        borderColor: '#e2e8f0',
    },
    serviceTypeHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    serviceTypeIcon: {
        width: 52,
        height: 52,
        borderRadius: 14,
        backgroundColor: '#334155',
        alignItems: 'center',
        justifyContent: 'center',
    },
    serviceTypeIconLight: {
        backgroundColor: '#f1f5f9',
    },
    serviceTypeStatusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    serviceTypeStatusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    serviceTypeStatusText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    serviceTypeContent: {
        marginBottom: 16,
    },
    serviceTypeName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    serviceTypeSubName: {
        fontSize: 13,
        color: '#94a3b8',
        marginBottom: 6,
    },
    serviceTypeCode: {
        fontSize: 11,
        color: '#64748b',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    serviceTypeActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#334155',
    },
    serviceTypeActionBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    serviceTypeActionBtnLight: {
        backgroundColor: '#f1f5f9',
    },
    serviceTypeEditBtn: {
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
    },
    serviceTypeDeleteBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
    },

    // ============================================
    // SIDEBAR DRAWER STYLES (Service Type Form)
    // ============================================
    sidebarDrawerOverlay: {
        flex: 1,
        flexDirection: 'row',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sidebarDrawerBackdrop: {
        flex: 1,
    },
    sidebarDrawerContent: {
        width: 420,
        maxWidth: '100%', // Prevent overflow on small screens
        backgroundColor: '#0f172a',
        height: '100%',
        borderLeftWidth: 1,
        borderLeftColor: '#1e293b',
        shadowColor: '#000',
        shadowOffset: { width: -4, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 10,
    },
    sidebarDrawerContentLight: {
        backgroundColor: '#fff',
        borderLeftColor: '#e2e8f0',
    },
    sidebarDrawerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
    },
    sidebarDrawerHeaderLight: {
        borderBottomColor: '#f1f5f9',
    },
    sidebarDrawerIconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sidebarDrawerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    sidebarDrawerSubtitle: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 2,
    },
    sidebarDrawerCloseBtn: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(71, 85, 105, 0.3)',
    },
    sidebarDrawerCloseBtnLight: {
        backgroundColor: '#f1f5f9',
    },
    sidebarDrawerBody: {
        flex: 1,
        padding: 20,
    },
    sidebarFormGroup: {
        marginBottom: 0,
    },
    sidebarFormLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
    },
    sidebarFormInput: {
        backgroundColor: '#1e293b',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#334155',
        color: '#fff',
        padding: 14,
        fontSize: 15,
    },
    sidebarFormInputLight: {
        backgroundColor: '#f8fafc',
        borderColor: '#e2e8f0',
        color: '#0f172a',
    },
    sidebarFormInputDisabled: {
        opacity: 0.5,
        backgroundColor: '#0f172a',
    },
    sidebarFormSection: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
        gap: 16,
    },
    sidebarFormSectionLight: {
        backgroundColor: '#f8fafc',
        borderColor: '#e2e8f0',
    },
    sidebarFormSectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    sidebarFormToggle: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#334155',
    },
    sidebarFormToggleLight: {
        backgroundColor: '#f8fafc',
        borderColor: '#e2e8f0',
    },
    sidebarFormToggleIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sidebarFormToggleLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
    sidebarFormToggleHint: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    sidebarFormSwitch: {
        width: 52,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#334155',
        padding: 2,
        justifyContent: 'center',
    },
    sidebarFormSwitchActive: {
        backgroundColor: '#22c55e',
    },
    sidebarFormSwitchThumb: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#64748b',
    },
    sidebarFormSwitchThumbActive: {
        backgroundColor: '#fff',
        marginLeft: 24,
    },
    sidebarDrawerFooter: {
        flexDirection: 'row',
        gap: 12,
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#1e293b',
    },
    sidebarDrawerFooterLight: {
        borderTopColor: '#f1f5f9',
    },
    sidebarDrawerBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sidebarDrawerBtnPrimary: {
        backgroundColor: '#22c55e',
    },
    sidebarDrawerBtnSecondary: {
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
    },
    sidebarDrawerBtnSecondaryLight: {
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
    },
    sidebarDrawerBtnText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
