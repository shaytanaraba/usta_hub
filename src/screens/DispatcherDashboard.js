/**
 * Dispatcher Dashboard - v5 Enhanced
 * Features: Queue with filters, Grid/List view, Details Drawer, Master Assignment,
 * Draft saving, Recent Addresses, Internal Notes
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
    Modal, TextInput, ScrollView, ActivityIndicator, Alert, Platform,
    Dimensions, Clipboard, Linking, Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import authService from '../services/auth';
import ordersService, { ORDER_STATUS } from '../services/orders';
import { useToast } from '../contexts/ToastContext';
const LOG_PREFIX = '[DispatcherDashboard]';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Status colors
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

// Status filter options
// Status filter options
const STATUS_OPTIONS = [
    { id: 'All', label: 'All Orders' },
    { id: 'placed', label: 'Placed' },
    { id: 'claimed', label: 'Claimed' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'started', label: 'Started' },
    { id: 'completed', label: 'Completed (Unpaid)' },
    { id: 'Payment', label: 'Awaiting Payment' }, // Custom filter for completed but unpaid if needed, or handle via status
    { id: 'Disputed', label: 'Disputed' },
    { id: 'Canceled', label: 'Canceled' },
];

// Urgency filter options
const URGENCY_OPTIONS = [
    { id: 'all', label: 'All Urgency' },
    { id: 'emergency', label: 'Emergency' },
    { id: 'urgent', label: 'Urgent' },
    { id: 'planned', label: 'Planned' },
];

const ATTENTION_FILTER_OPTIONS = [
    { id: 'All', label: 'All Issues' },
    { id: 'Stuck', label: 'Stuck' },
    { id: 'Disputed', label: 'Disputed' },
    { id: 'Payment', label: 'Unpaid' },
    { id: 'Canceled', label: 'Canceled' },
];

// Dispatcher filter options
const DISPATCHER_OPTIONS = [
    { id: 'all', label: 'All Orders' },
    { id: 'me', label: 'My Orders' },
];

// Sort options
const SORT_OPTIONS = [
    { id: 'newest', label: 'Newest First' },
    { id: 'oldest', label: 'Oldest First' },
];

// Translations
const TRANSLATIONS = {
    en: {
        ordersQueue: 'Orders Queue',
        createOrder: 'Create Order',
        showFilters: 'Show Filters',
        hideFilters: 'Hide Filters',
        clear: 'Clear',
        selectOption: 'Select Option',
        cancel: 'Cancel',
        dispatcherPro: 'Dispatcher Pro',
        online: 'Online',
        exit: 'Exit',
        needsAttention: 'Needs Attention',
        statusActive: 'Active',
        statusPayment: 'Awaiting Payment',
        statusDisputed: 'Disputed',
        statusCanceled: 'Canceled',
        statusAll: 'All Orders',
        startToSeeAddress: 'Start to see address',
        actionClaim: 'Assign',
        actionStart: 'Start',
        actionComplete: 'Complete',
        actionCancel: 'Cancel',
        actionLocked: 'Locked',
        priceBase: ' base',
        currencySom: 'c',
        stuck: 'Stuck',
        unassigned: 'Unassigned',
        sectionClient: 'Client',
        sectionMaster: 'Master',
        sectionDetails: 'Order Details',
        sectionFinancials: 'Financials',
        sectionNote: 'Internal Note',
        labelCallout: 'Call-out:',
        labelInitial: 'Initial:',
        labelFinal: 'Final:',
        btnEdit: 'Edit',
        btnCancelEdit: 'Cancel Edit',
        btnClose: 'Close',
        btnPay: 'Pay',
        btnCopy: 'Copy',
        btnCall: 'Call',
        clientName: 'Client Name',
        clientPhone: 'Client Phone',
        address: 'Address',
        description: 'Description',
        // Create Order
        createClientDetails: 'Client Details',
        createPhone: 'Phone',
        createName: 'Name',
        createLocation: 'Location',
        createDistrict: 'District',
        createFullAddress: 'Full Address',
        createServiceType: 'Service Type',
        createProblemDesc: 'Problem Description',
        createPrice: 'Price',
        createInternalNote: 'Internal Note',
        createConfirm: 'Confirm Details',
        createClear: 'Clear',
        createPublish: 'Publish Order',
        createAnother: 'Create Another',
        createSuccess: 'Order Created!',
        createViewQueue: 'View in Queue',
        recentBtn: 'Recent',
        needsAttentionSort: 'Sort',
        sortNewest: 'Newest',
        sortOldest: 'Oldest',
        btnSaveChanges: 'Save Changes',
        titlePayment: 'Confirm Payment',
        labelAmount: 'Amount:',
        labelProof: 'Proof URL',
        titleSelectMaster: 'Select Master',
        labelRating: 'Rating',
        labelJobs: 'jobs',
        noMasters: 'No available masters',
        actionReopen: 'Reopen Order',
        actionPay: 'Pay',
        msgNoMatch: 'No items match filter'
    },
    ru: {
        ordersQueue: 'Очередь заказов',
        createOrder: 'Создать заказ',
        showFilters: 'Показать фильтры',
        hideFilters: 'Скрыть фильтры',
        clear: 'Очистить',
        selectOption: 'Выберите',
        cancel: 'Отмена',
        dispatcherPro: 'Диспетчер Pro',
        online: 'В сети',
        exit: 'Выход',
        needsAttention: 'Требует внимания',
        statusActive: 'Активные',
        statusPayment: 'Ожидает оплаты',
        statusDisputed: 'Спорные',
        statusCanceled: 'Отмененные',
        statusAll: 'Все заказы',
        startToSeeAddress: 'Начните для адреса',
        actionClaim: 'Назначить',
        actionStart: 'Начать',
        actionComplete: 'Завершить',
        actionCancel: 'Отменить',
        actionLocked: 'Заблок.',
        priceBase: ' фикс',
        currencySom: 'с',
        stuck: 'Застрял',
        unassigned: 'Не назначен',
        sectionClient: 'Клиент',
        sectionMaster: 'Мастер',
        sectionDetails: 'Детали заказа',
        sectionFinancials: 'Финансы',
        sectionNote: 'Внутренняя заметка',
        labelCallout: 'Выезд:',
        labelInitial: 'Начальная:',
        labelFinal: 'Итоговая:',
        btnEdit: 'Изменить',
        btnCancelEdit: 'Отмена',
        btnClose: 'Закрыть',
        btnPay: 'Оплатить',
        btnCopy: 'Копия',
        btnCall: 'Звонок',
        clientName: 'Имя клиента',
        clientPhone: 'Телефон клиента',
        address: 'Адрес',
        description: 'Описание',
        // Create Order
        createClientDetails: 'Данные клиента',
        createPhone: 'Телефон',
        createName: 'Имя',
        createLocation: 'Локация',
        createDistrict: 'Район',
        createFullAddress: 'Полный адрес',
        createServiceType: 'Тип услуги',
        createProblemDesc: 'Описание проблемы',
        createPrice: 'Цена',
        createInternalNote: 'Внутренняя заметка',
        createConfirm: 'Подтвердить детали',
        createClear: 'Очистить',
        createPublish: 'Опубликовать',
        createAnother: 'Создать еще',
        createSuccess: 'Заказ создан!',
        createViewQueue: 'Посмотреть в очереди',
        recentBtn: 'Недавние',
        needsAttentionSort: 'Сорт.',
        sortNewest: 'Сначала новые',
        sortOldest: 'Сначала старые',
        btnSaveChanges: 'Сохранить',
        titlePayment: 'Подтвердить оплату',
        labelAmount: 'Сумма:',
        labelProof: 'Ссылка на чек',
        titleSelectMaster: 'Выберите мастера',
        labelRating: 'Рейтинг',
        labelJobs: 'заказов',
        noMasters: 'Нет доступных мастеров',
        actionReopen: 'Переоткрыть',
        actionPay: 'Оплатить',
        msgNoMatch: 'Нет результатов'
    },
    kg: {
        ordersQueue: 'Буйрутмалар керзеги',
        createOrder: 'Буйрутма түзүү',
        showFilters: 'Фильтрлерди көрсөтүү',
        hideFilters: 'Фильтрлерди жашыруу',
        clear: 'Тазалоо',
        selectOption: 'Тандоо',
        cancel: 'Жокко чыгаруу',
        dispatcherPro: 'Диспетчер Pro',
        online: 'Онлайн',
        exit: 'Чыгуу',
        needsAttention: 'Көңүл буруңуз',
        statusActive: 'Активдүү',
        statusPayment: 'Төлөм күтүүдө',
        statusDisputed: 'Талаштуу',
        statusCanceled: 'Жокко чыгарылган',
        statusAll: 'Баардык буйрутмалар',
        startToSeeAddress: 'Даректи көрүү үчүн баштаңыз',
        actionClaim: 'Дайындоо',
        actionStart: 'Баштоо',
        actionComplete: 'Аяктоо',
        actionCancel: 'Жокко чыгаруу',
        actionLocked: 'Кулпуланган',
        priceBase: ' негиз',
        currencySom: 'с',
        stuck: 'Токтоп калды',
        unassigned: 'Дайындала элек',
        sectionClient: 'Кардар',
        sectionMaster: 'Уста',
        sectionDetails: 'Буйрутма чоо-жайы',
        sectionFinancials: 'Финансы',
        sectionNote: 'Ички белги',
        labelCallout: 'Чакыруу:',
        labelInitial: 'Баштапкы:',
        labelFinal: 'Акыркы:',
        btnEdit: 'Өзгөртүү',
        btnCancelEdit: 'Жокко чыгаруу',
        btnClose: 'Жабуу',
        btnPay: 'Төлөө',
        btnCopy: 'Көчүрүү',
        btnCall: 'Чалуу',
        clientName: 'Кардардын аты',
        clientPhone: 'Кардардын телефону',
        address: 'Дарек',
        description: 'Сүрөттөмө',
        // Create Order
        createClientDetails: 'Кардардын маалыматы',
        createPhone: 'Телефон',
        createName: 'Аты',
        createLocation: 'Жайгашкан жер',
        createDistrict: 'Район',
        createFullAddress: 'Толук дарек',
        createServiceType: 'Кызмат түрү',
        createProblemDesc: 'Көйгөйдүн сүрөттөлүшү',
        createPrice: 'Баасы',
        createInternalNote: 'Ички белги',
        createConfirm: 'Толуктоолорду ырастоо',
        createClear: 'Тазалоо',
        createPublish: 'Жарыялоо',
        createAnother: 'Дагы түзүү',
        createSuccess: 'Буйрутма түзүлдү!',
        createViewQueue: 'Кезекти көрүү',
        recentBtn: 'Акыркы',
        needsAttentionSort: 'Реттөө',
        sortNewest: 'Жаңылар',
        sortOldest: 'Эскилер'
    }
};

// Storage keys
const STORAGE_KEYS = { DRAFT: 'dispatcher_draft_order', RECENT_ADDR: 'dispatcher_recent_addresses' };

// Initial form state
const INITIAL_ORDER_STATE = {
    clientName: '', clientPhone: '', pricingType: 'unknown', initialPrice: '', calloutFee: '',
    serviceType: 'repair', urgency: 'planned', problemDescription: '',
    area: '', fullAddress: '', preferredDate: '', preferredTime: '', dispatcherNote: '',
};

// Helper: time ago
const getTimeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    return `${mins}m ago`;
};

// Helper: normalize phone
const normalizePhone = (input) => {
    let cleaned = input.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+996') && cleaned.length === 13) return cleaned;
    let digits = cleaned.replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('0')) return '+996' + digits.substring(1);
    if (digits.length === 12 && digits.startsWith('996')) return '+' + digits;
    if (digits.length === 9) return '+996' + digits;
    return input;
};

// Helper: validate phone
const isValidPhone = (phone) => /^(\+996)\d{9}$/.test(phone);

// Pagination Component
const Pagination = ({ current, total, onPageChange }) => {
    if (total <= 1) return null;
    return (
        <View style={styles.pagination}>
            {Array.from({ length: total }, (_, i) => i + 1).map(p => (
                <TouchableOpacity
                    key={p}
                    style={[styles.pageBtn, current === p && styles.pageBtnActive]}
                    onPress={() => onPageChange(p)}
                >
                    <Text style={[styles.pageBtnText, current === p && styles.pageBtnTextActive]}>{p}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

export default function DispatcherDashboard({ navigation, route }) {
    const { showToast } = useToast();

    // User & Data
    const [user, setUser] = useState(route.params?.user || null);
    const [orders, setOrders] = useState([]);
    const [masters, setMasters] = useState([]);
    const [recentAddresses, setRecentAddresses] = useState([]);

    // UI States
    const [activeTab, setActiveTab] = useState('queue');
    const [refreshing, setRefreshing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [language, setLanguage] = useState('en'); // 'en', 'ru', 'kg'
    const [isDark, setIsDark] = useState(true); // Theme state
    const [actionLoading, setActionLoading] = useState(false);
    const [page, setPage] = useState(1); // Pagination state

    // Picker modal state
    const [pickerModal, setPickerModal] = useState({ visible: false, options: [], value: '', onChange: null, title: '' });

    // Filters
    const [viewMode, setViewMode] = useState('compact');
    const [statusFilter, setStatusFilter] = useState('Active');
    const [searchQuery, setSearchQuery] = useState('');
    const [filterUrgency, setFilterUrgency] = useState('all');
    const [filterService, setFilterService] = useState('all');
    const [filterSort, setFilterSort] = useState('newest');
    const [filterDispatcher, setFilterDispatcher] = useState('all');
    const [showFilters, setShowFilters] = useState(false);
    const [showNeedsAttention, setShowNeedsAttention] = useState(false);
    const [sortOrder, setSortOrder] = useState('newest');
    const [filterAttentionType, setFilterAttentionType] = useState('All');

    // Order Details Drawer
    const [detailsOrder, setDetailsOrder] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({});

    // Modals
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentData, setPaymentData] = useState({ method: 'cash', proofUrl: '' });
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignTarget, setAssignTarget] = useState(null);

    // Create Order Form
    const [newOrder, setNewOrder] = useState(INITIAL_ORDER_STATE);
    const [phoneError, setPhoneError] = useState('');
    const [confirmChecked, setConfirmChecked] = useState(false);
    const [creationSuccess, setCreationSuccess] = useState(null);
    const [showRecentAddr, setShowRecentAddr] = useState(false);

    // ============================================
    // DATA LOADING
    // ============================================

    useEffect(() => {
        loadData();
        loadDraft();
        loadRecentAddresses();
    }, []);

    const loadData = async () => {
        if (!refreshing) setLoading(true);
        try {
            const currentUser = await authService.getCurrentUser();
            setUser(currentUser);
            if (currentUser) {
                const allOrders = await ordersService.getDispatcherOrders(currentUser.id);
                setOrders(allOrders);
            }
        } catch (error) {
            console.error(`${LOG_PREFIX} loadData error:`, error);
        } finally {
            setLoading(false);
        }
    };

    const loadDraft = async () => {
        try {
            const draft = await AsyncStorage.getItem(STORAGE_KEYS.DRAFT);
            if (draft) {
                const { timestamp, data } = JSON.parse(draft);
                if (Date.now() - timestamp < 24 * 60 * 60 * 1000) setNewOrder(data);
                else await AsyncStorage.removeItem(STORAGE_KEYS.DRAFT);
            }
        } catch (e) { console.error('Draft load error', e); }
    };

    const saveDraft = async (data) => {
        try {
            if (data.clientPhone || data.problemDescription) {
                await AsyncStorage.setItem(STORAGE_KEYS.DRAFT, JSON.stringify({ timestamp: Date.now(), data }));
            }
        } catch (e) { console.error('Draft save error', e); }
    };

    const loadRecentAddresses = async () => {
        try {
            const saved = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_ADDR);
            if (saved) setRecentAddresses(JSON.parse(saved));
        } catch (e) { }
    };

    const saveRecentAddress = async (area, fullAddress) => {
        const entry = { area, fullAddress };
        const filtered = recentAddresses.filter(a => a.fullAddress !== fullAddress);
        const updated = [entry, ...filtered].slice(0, 10);
        setRecentAddresses(updated);
        await AsyncStorage.setItem(STORAGE_KEYS.RECENT_ADDR, JSON.stringify(updated));
    };

    const loadMasters = async () => {
        const data = await ordersService.getAvailableMasters();
        setMasters(data);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    // ============================================
    // FILTERING
    // ============================================

    const needsActionOrders = useMemo(() => {
        const now = Date.now();
        return orders.filter(o => {
            if (o.is_disputed) return true;
            if (o.status === ORDER_STATUS.COMPLETED) return true;
            if (o.status === ORDER_STATUS.PLACED && (now - new Date(o.created_at).getTime()) > 15 * 60000) return true;
            if (o.status === ORDER_STATUS.CLAIMED && (now - new Date(o.updated_at).getTime()) > 30 * 60000) return true;
            return false;
        });
    }, [orders]);

    const filteredOrders = useMemo(() => {
        let res = [...orders];

        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            res = res.filter(o =>
                o.id?.toLowerCase().includes(q) ||
                o.client?.full_name?.toLowerCase().includes(q) ||
                o.client?.phone?.includes(q) ||
                o.full_address?.toLowerCase().includes(q) ||
                o.master?.full_name?.toLowerCase().includes(q)
            );
        }

        // Status tabs
        switch (statusFilter) {
            case 'Active':
                res = res.filter(o => ['placed', 'claimed', 'started'].includes(o.status) && !o.is_disputed);
                break;
            case 'Payment':
                res = res.filter(o => o.status === 'completed' && !o.is_disputed);
                break;
            case 'Disputed':
                res = res.filter(o => o.is_disputed);
                break;
            case 'Canceled':
                res = res.filter(o => o.status?.includes('canceled'));
                break;
        }

        // Dispatcher filter
        if (filterDispatcher === 'me') {
            res = res.filter(o => o.assigned_dispatcher_id === user?.id);
        } else if (filterDispatcher === 'unassigned') {
            res = res.filter(o => !o.assigned_dispatcher_id);
        }

        // Urgency
        if (filterUrgency !== 'all') res = res.filter(o => o.urgency === filterUrgency);

        // Service
        if (filterService !== 'all') res = res.filter(o => o.service_type === filterService);

        // Sort
        res.sort((a, b) => {
            const dateA = new Date(a.created_at).getTime();
            const dateB = new Date(b.created_at).getTime();
            return filterSort === 'newest' ? dateB - dateA : dateA - dateB;
        });

        return res;
    }, [orders, searchQuery, statusFilter, filterUrgency, filterService, filterSort, filterDispatcher, user]);

    // Reset pagination when filters change
    useEffect(() => {
        setPage(1);
    }, [searchQuery, statusFilter, filterUrgency, filterService, filterSort, filterDispatcher]);

    // ============================================
    // ACTIONS
    // ============================================

    const handleCreateOrder = async () => {
        if (!confirmChecked) { showToast?.('Please confirm details', 'error'); return; }
        if (!newOrder.clientPhone || !newOrder.problemDescription || !newOrder.area || !newOrder.fullAddress) {
            showToast?.('Please fill required fields', 'error'); return;
        }
        if (phoneError) { showToast?.('Fix phone format', 'error'); return; }

        setActionLoading(true);
        try {
            const result = await ordersService.createOrderExtended({
                clientId: user.id,
                pricingType: newOrder.pricingType === 'fixed' ? 'fixed' : 'unknown',
                initialPrice: newOrder.pricingType === 'fixed' ? parseFloat(newOrder.initialPrice) || null : null,
                calloutFee: parseFloat(newOrder.calloutFee) || null,
                serviceType: newOrder.serviceType,
                urgency: newOrder.urgency,
                problemDescription: newOrder.problemDescription,
                area: newOrder.area,
                fullAddress: newOrder.fullAddress,
                preferredDate: newOrder.preferredDate || null,
                preferredTime: newOrder.preferredTime || null,
                dispatcherNote: newOrder.dispatcherNote || null,
            }, user.id);

            if (result.success) {
                showToast?.('Order created!', 'success');
                await saveRecentAddress(newOrder.area, newOrder.fullAddress);
                await AsyncStorage.removeItem(STORAGE_KEYS.DRAFT);
                setCreationSuccess({ id: result.orderId });
                setConfirmChecked(false);
                await loadData();
            } else {
                showToast?.(result.message, 'error');
            }
        } catch (error) {
            showToast?.('Create failed', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handlePhoneBlur = () => {
        const val = normalizePhone(newOrder.clientPhone);
        setNewOrder(prev => ({ ...prev, clientPhone: val }));
        setPhoneError(val && !isValidPhone(val) ? 'Invalid format (+996...)' : '');
    };

    const handleConfirmPayment = async () => {
        if (!paymentData.method) { showToast?.('Select payment method', 'error'); return; }
        if (paymentData.method === 'transfer' && !paymentData.proofUrl) {
            showToast?.('Proof required for transfers', 'error'); return;
        }
        setActionLoading(true);
        try {
            const result = await ordersService.confirmPayment(detailsOrder.id, user.id, {
                paymentMethod: paymentData.method, paymentProofUrl: paymentData.proofUrl || null
            });
            if (result.success) {
                showToast?.('Payment confirmed!', 'success');
                setShowPaymentModal(false); setDetailsOrder(null);
                setPaymentData({ method: 'cash', proofUrl: '' });
                await loadData();
            } else { showToast?.(result.message, 'error'); }
        } catch (e) { showToast?.('Failed', 'error'); }
        finally { setActionLoading(false); }
    };

    const handleAssignMaster = async (master) => {
        const targetId = assignTarget?.id || detailsOrder?.id;
        Alert.alert('Assign Master', `Assign ${master.full_name} to this order?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Assign', onPress: async () => {
                    setActionLoading(true);
                    try {
                        const result = await ordersService.forceAssignMaster(targetId, master.id, 'Dispatcher assignment');
                        if (result.success) {
                            showToast?.('Master assigned!', 'success');
                            setShowAssignModal(false); setDetailsOrder(null);
                            await loadData();
                        } else { showToast?.(result.message, 'error'); }
                    } catch (e) { showToast?.('Assignment failed', 'error'); }
                    finally { setActionLoading(false); }
                }
            }
        ]);
    };

    const handleSaveEdit = async () => {
        setActionLoading(true);
        try {
            // Prepare updates - including client details
            const updates = {
                problem_description: editForm.problem_description,
                dispatcher_note: editForm.dispatcher_note,
                full_address: editForm.full_address,
                client: { // We need to update client info too if changed
                    full_name: editForm.client_name || detailsOrder.client?.full_name,
                    phone: editForm.client_phone || detailsOrder.client?.phone
                }
            };

            const result = await ordersService.updateOrderInline(detailsOrder.id, updates);
            if (result.success) {
                showToast?.('Updated!', 'success');
                setIsEditing(false);
                await loadData();
                setDetailsOrder(prev => ({
                    ...prev,
                    ...editForm,
                    client: {
                        ...prev.client,
                        full_name: editForm.client_name,
                        phone: editForm.client_phone
                    }
                }));
            } else { showToast?.('Update failed', 'error'); }
        } catch (e) { showToast?.('Error', 'error'); }
        finally { setActionLoading(false); }
    };

    const handleCancel = (orderId) => {
        Alert.alert('Cancel Order', 'Are you sure?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes', style: 'destructive', onPress: async () => {
                    const result = await ordersService.cancelByClient(orderId, user.id, 'client_request');
                    if (result.success) { showToast?.('Canceled', 'success'); await loadData(); }
                    else showToast?.(result.message, 'error');
                }
            }
        ]);
    };

    const handleReopen = async (orderId) => {
        const result = await ordersService.reopenOrder(orderId, user.id);
        if (result.success) { showToast?.('Reopened', 'success'); await loadData(); }
        else showToast?.(result.message, 'error');
    };

    const copyToClipboard = (text) => {
        if (!text) return;
        Clipboard.setString(text);
        showToast?.('Copied!', 'success');
    };

    const handleLogout = async () => {
        const doLogout = async () => {
            await authService.logoutUser();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        };
        if (Platform.OS === 'web') {
            if (window.confirm('Logout?')) await doLogout();
        } else {
            Alert.alert('Logout', 'Are you sure?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Logout', onPress: doLogout }
            ]);
        }
    };

    const clearForm = () => {
        setNewOrder(INITIAL_ORDER_STATE);
        setConfirmChecked(false); setPhoneError('');
        AsyncStorage.removeItem(STORAGE_KEYS.DRAFT);
        showToast?.('Form cleared', 'success');
    };

    // Save draft on change
    useEffect(() => {
        if (!creationSuccess) {
            const timer = setTimeout(() => saveDraft(newOrder), 1000);
            return () => clearTimeout(timer);
        }
    }, [newOrder, creationSuccess]);

    // Load masters when assign modal opens
    useEffect(() => {
        if (showAssignModal) loadMasters();
    }, [showAssignModal]);

    // ============================================
    // RENDER COMPONENTS
    // ============================================

    // Picker Modal Component
    const renderPickerModal = () => (
        <Modal visible={pickerModal.visible} transparent animationType="fade">
            <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setPickerModal(prev => ({ ...prev, visible: false }))}>
                <View style={styles.pickerContent}>
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>{pickerModal.title}</Text>
                        <TouchableOpacity onPress={() => setPickerModal(prev => ({ ...prev, visible: false }))}>
                            <Text style={styles.pickerClose}>✕</Text>
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
                                {pickerModal.value === opt.id && <Text style={styles.pickerCheck}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </TouchableOpacity>
        </Modal>
    );

    // Sidebar Component
    const renderSidebar = () => (
        <Modal visible={isSidebarOpen} transparent animationType="none">
            <View style={styles.sidebarOverlay}>
                {/* Sidebar Container - LEFT SIDE */}
                <Animated.View style={[styles.sidebarContainer, !isDark && styles.sidebarContainerLight]}>
                    {/* Sidebar Header */}
                    <View style={[styles.sidebarHeader, !isDark && styles.sidebarHeaderLight]}>
                        <Text style={[styles.sidebarTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].dispatcherPro}</Text>
                        <TouchableOpacity onPress={() => setIsSidebarOpen(false)} style={styles.sidebarClose}>
                            <Text style={styles.sidebarCloseText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Sidebar Navigation */}
                    <View style={styles.sidebarNav}>
                        <TouchableOpacity
                            style={[styles.sidebarNavItem, activeTab === 'create' && styles.sidebarNavItemActive]}
                            onPress={() => { setActiveTab('create'); setIsSidebarOpen(false); }}>
                            <Text style={[styles.sidebarNavText, activeTab === 'create' && styles.sidebarNavTextActive]}>+ {TRANSLATIONS[language].createOrder}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.sidebarNavItem, activeTab === 'queue' && styles.sidebarNavItemActive]}
                            onPress={() => { setActiveTab('queue'); setIsSidebarOpen(false); }}>
                            <Text style={[styles.sidebarNavText, activeTab === 'queue' && styles.sidebarNavTextActive]}>{TRANSLATIONS[language].ordersQueue}</Text>
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
                                onPress={() => setLanguage(prev => prev === 'en' ? 'ru' : prev === 'ru' ? 'kg' : 'en')}>
                                <Text style={[styles.sidebarLangText, !isDark && styles.textDark, { fontSize: 24 }]}>
                                    {language === 'en' ? '🇬🇧' : language === 'ru' ? '🇷🇺' : '🇰🇬'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* User Profile */}
                        <View style={[styles.sidebarUserCard, !isDark && styles.sidebarBtnLight]}>
                            <View style={styles.sidebarUserAvatar}>
                                <Text style={styles.sidebarUserAvatarText}>
                                    {user?.full_name ? user.full_name.split(' ').map(n => n[0]).join('').substring(0, 2) : 'DP'}
                                </Text>
                            </View>
                            <View style={styles.sidebarUserInfo}>
                                <Text style={[styles.sidebarUserName, !isDark && styles.textDark]} numberOfLines={1}>{user?.full_name || 'Dispatcher'}</Text>
                                <Text style={styles.sidebarUserStatus}>{TRANSLATIONS[language].online}</Text>
                            </View>
                            <TouchableOpacity onPress={handleLogout} style={styles.sidebarLogoutBtn}>
                                <Text style={styles.sidebarLogoutText}>{TRANSLATIONS[language].exit}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
                {/* Backdrop - RIGHT SIDE */}
                <TouchableOpacity style={styles.sidebarBackdrop} onPress={() => setIsSidebarOpen(false)} />
            </View>
        </Modal>
    );

    const renderHeader = () => (
        <View style={[styles.header, !isDark && styles.headerLight]}>
            <View style={styles.headerLeft}>
                <TouchableOpacity onPress={() => setIsSidebarOpen(true)} style={[styles.menuBtn, !isDark && styles.btnLight]}>
                    <Text style={[styles.menuBtnText, !isDark && styles.textDark]}>☰</Text>
                </TouchableOpacity>
                <Text style={[styles.headerTitle, !isDark && styles.textDark]}>{activeTab === 'queue' ? TRANSLATIONS[language].ordersQueue : TRANSLATIONS[language].createOrder}</Text>
            </View>
            <TouchableOpacity onPress={onRefresh} style={[styles.iconBtn, !isDark && styles.btnLight]}>
                <Text style={[styles.iconText, !isDark && styles.textDark]}>↻</Text>
            </TouchableOpacity>
        </View>
    );

    const renderFilters = () => (
        <View style={styles.filtersContainer}>
            {/* Search */}
            <View style={styles.searchRow}>
                <View style={[styles.searchInputWrapper, !isDark && styles.btnLight]}>
                    <Text style={styles.searchIcon}>⌕</Text>
                    <TextInput style={[styles.searchInput, !isDark && styles.textDark]} placeholder="Search..." placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                        value={searchQuery} onChangeText={setSearchQuery} />
                    {searchQuery ? (
                        <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.searchClear}>
                            <Text style={styles.searchClearText}>✕</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>

            {/* Filter Controls Row */}
            <View style={styles.filterControlsRow}>
                {/* Grid/List Toggle */}
                <TouchableOpacity
                    style={[styles.viewToggleBtn, !isDark && styles.btnLight]}
                    onPress={() => setViewMode(prev => prev === 'cards' ? 'compact' : 'cards')}>
                    <Text style={[styles.viewToggleBtnText, !isDark && styles.textDark]}>{viewMode === 'cards' ? '≡' : '⊞'}</Text>
                </TouchableOpacity>

                {/* Filter Toggle */}
                <TouchableOpacity
                    style={[styles.filterShowBtn, showFilters && styles.filterShowBtnActive, !isDark && !showFilters && styles.btnLight]}
                    onPress={() => setShowFilters(!showFilters)}>
                    <Text style={[styles.filterShowBtnText, showFilters && styles.filterShowBtnTextActive]}>
                        {showFilters ? TRANSLATIONS[language].hideFilters : TRANSLATIONS[language].showFilters}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Dropdown Filters (when shown) */}
            {showFilters && (
                <View style={styles.filterDropdownRow}>
                    {/* Status Content (now a dropdown) */}
                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: 'Status', options: STATUS_OPTIONS, value: statusFilter, onChange: setStatusFilter
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {STATUS_OPTIONS.find(o => o.id === statusFilter)?.label || statusFilter}
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: 'Dispatcher', options: DISPATCHER_OPTIONS, value: filterDispatcher, onChange: setFilterDispatcher
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {DISPATCHER_OPTIONS.find(o => o.id === filterDispatcher)?.label || filterDispatcher}
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: 'Urgency', options: URGENCY_OPTIONS, value: filterUrgency, onChange: setFilterUrgency
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {URGENCY_OPTIONS.find(o => o.id === filterUrgency)?.label || filterUrgency}
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: 'Service', options: [{ id: 'all', label: 'All Services' }, ...SERVICE_TYPES], value: filterService, onChange: setFilterService
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {filterService === 'all' ? 'All Services' : SERVICE_TYPES.find(s => s.id === filterService)?.label || filterService}
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.filterDropdown, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: 'Sort', options: SORT_OPTIONS, value: filterSort, onChange: setFilterSort
                    })}>
                        <Text style={[styles.filterDropdownText, !isDark && styles.textDark]}>
                            {SORT_OPTIONS.find(o => o.id === filterSort)?.label || filterSort}
                        </Text>
                        <Text style={styles.filterDropdownArrow}>▾</Text>
                    </TouchableOpacity>

                    {/* Clear Filters Button */}
                    <TouchableOpacity style={styles.clearFiltersBtn} onPress={() => {
                        setStatusFilter('Active');
                        setFilterDispatcher('all');
                        setFilterUrgency('all');
                        setFilterService('all');
                        setFilterSort('newest');
                    }}>
                        <Text style={styles.clearFiltersBtnText}>{TRANSLATIONS[language].clear}</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    const renderNeedsAttention = () => {
        if (needsActionOrders.length === 0) return null;

        // Filter Needs Attention
        const filteredAttention = needsActionOrders.filter(o => {
            if (filterAttentionType === 'All') return true;
            if (filterAttentionType === 'Stuck' && o.status !== 'completed' && !o.is_disputed) return true; // simplified logic for 'Stuck' based on exclusion
            if (filterAttentionType === 'Disputed' && o.is_disputed) return true;
            if (filterAttentionType === 'Payment' && o.status === 'completed') return true;
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
                        <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>! {TRANSLATIONS[language].needsAttention} ({needsActionOrders.length})</Text>
                    </TouchableOpacity>

                    {/* Filter Dropdown */}
                    <TouchableOpacity style={[styles.miniFilterBtn, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                        visible: true, title: 'Error Type', options: ATTENTION_FILTER_OPTIONS, value: filterAttentionType, onChange: setFilterAttentionType
                    })}>
                        <Text style={styles.miniFilterText}>{filterAttentionType}</Text>
                        <Text style={styles.miniFilterArrow}>▾</Text>
                    </TouchableOpacity>
                </View>
                <Text style={{ color: '#94a3b8', textAlign: 'center', padding: 10 }}>{TRANSLATIONS[language].msgNoMatch}</Text>
            </View>
        );

        return (
            <View style={styles.attentionContainer}>
                <View style={styles.attentionHeaderRow}>
                    <TouchableOpacity style={styles.attentionHeader} onPress={() => setShowNeedsAttention(!showNeedsAttention)}>
                        <Text style={[styles.attentionTitle, !isDark && { color: '#ef4444' }]}>! {TRANSLATIONS[language].needsAttention} ({needsActionOrders.length})</Text>
                        <Text style={[styles.attentionChevron, !isDark && styles.textSecondary]}>{showNeedsAttention ? '▲' : '▼'}</Text>
                    </TouchableOpacity>

                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {/* Attention Filter */}
                        {showNeedsAttention && (
                            <TouchableOpacity style={[styles.miniFilterBtn, !isDark && styles.btnLight]} onPress={() => setPickerModal({
                                visible: true, title: 'Error Type', options: ATTENTION_FILTER_OPTIONS, value: filterAttentionType, onChange: setFilterAttentionType
                            })}>
                                <Text style={styles.miniFilterText}>{filterAttentionType}</Text>
                                <Text style={styles.miniFilterArrow}>▾</Text>
                            </TouchableOpacity>
                        )}

                        {/* Sort Button - Redesigned */}
                        {showNeedsAttention && (
                            <TouchableOpacity style={styles.cleanSortBtn} onPress={() => setSortOrder(prev => prev === 'newest' ? 'oldest' : 'newest')}>
                                <Text style={styles.cleanSortText}>{sortOrder === 'newest' ? '↓ Newest' : '↑ Oldest'}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
                {showNeedsAttention && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attentionScroll}>
                        {sortedNeedsAction.map(o => (
                            <TouchableOpacity key={o.id} style={[styles.attentionCard, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(o)}>
                                <Text style={styles.attentionBadge}>{o.is_disputed ? 'Dispute' : o.status === 'completed' ? 'Unpaid' : 'Stuck'}</Text>
                                <Text style={[styles.attentionService, !isDark && styles.textDark]}>{o.service_type}</Text>
                                <Text style={[styles.attentionAddr, !isDark && styles.textSecondary]} numberOfLines={1}>{o.full_address}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>
        );
    };


    const renderCompactRow = ({ item }) => (
        <TouchableOpacity style={[styles.compactRow, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(item)}>
            {/* Status indicator */}
            <View style={[styles.compactStatusBadge, { backgroundColor: STATUS_COLORS[item.status] || '#64748b' }]}>
                <Text style={styles.compactStatusText}>{item.status?.replace(/_/g, ' ')}</Text>
            </View>
            {/* Main info */}
            <View style={styles.compactMain}>
                <View style={styles.compactTopRow}>
                    <Text style={[styles.compactId, !isDark && styles.textSecondary]}>#{item.id?.slice(-6)}</Text>
                    <Text style={[styles.compactService, !isDark && styles.textDark]}>{item.service_type}</Text>
                    {item.urgency && item.urgency !== 'planned' && (
                        <Text style={[styles.compactUrgency, item.urgency === 'emergency' && styles.compactUrgencyEmergency]}>
                            {item.urgency.toUpperCase()}
                        </Text>
                    )}
                </View>
                <Text style={[styles.compactAddr, !isDark && styles.textSecondary]} numberOfLines={1}>{item.full_address}</Text>
                <View style={styles.compactBottomRow}>
                    <Text style={[styles.compactClient, !isDark && styles.textDark]}>{item.client?.full_name || 'N/A'}</Text>
                    {item.master && <Text style={styles.compactMaster}>Master: {item.master.full_name}</Text>}
                    {item.final_price && <Text style={styles.compactPrice}>{item.final_price}c</Text>}
                </View>
            </View>
            {/* Right side */}
            <View style={styles.compactRight}>
                <Text style={styles.compactTime}>{getTimeAgo(item.created_at)}</Text>
                <Text style={[styles.compactChevron, !isDark && styles.textSecondary]}>›</Text>
            </View>
        </TouchableOpacity>
    );

    const renderCard = ({ item }) => (
        <TouchableOpacity style={[styles.orderCard, !isDark && styles.cardLight]} onPress={() => setDetailsOrder(item)}>
            <View style={styles.cardHeader}>
                <Text style={[styles.cardService, !isDark && styles.textDark]}>{item.service_type}</Text>
                <View style={[styles.cardStatus, { backgroundColor: STATUS_COLORS[item.status] }]}>
                    <Text style={styles.cardStatusText}>{item.status?.replace(/_/g, ' ')}</Text>
                </View>
            </View>
            <Text style={[styles.cardAddr, !isDark && styles.textSecondary]} numberOfLines={2}>{item.full_address}</Text>
            <View style={styles.cardFooter}>
                <Text style={[styles.cardClient, !isDark && styles.textDark]}>{item.client?.full_name || 'N/A'}</Text>
                <Text style={styles.cardTime}>{getTimeAgo(item.created_at)}</Text>
            </View>
            {item.status === 'completed' && (
                <TouchableOpacity style={styles.cardPayBtn} onPress={(e) => { e.stopPropagation?.(); setDetailsOrder(item); setShowPaymentModal(true); }}>
                    <Text style={styles.cardPayText}>Pay {item.final_price}c</Text>
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );

    const renderQueue = () => {
        const pageSize = viewMode === 'cards' ? 20 : 10;
        const totalPages = Math.ceil(filteredOrders.length / pageSize);
        const paginatedOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);

        return (
            <View style={styles.queueContainer}>
                {renderNeedsAttention()}
                {renderFilters()}
                <FlatList
                    data={paginatedOrders}
                    renderItem={viewMode === 'cards' ? renderCard : renderCompactRow}
                    keyExtractor={item => item.id}
                    numColumns={viewMode === 'cards' ? 2 : 1}
                    key={viewMode}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#3b82f6" : "#0f172a"} />}
                    ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyText, !isDark && { color: '#64748b' }]}>No orders found</Text></View>}
                    ListFooterComponent={<Pagination current={page} total={totalPages} onPageChange={setPage} />}
                />
            </View>
        );
    };

    const renderCreateOrder = () => (
        <View style={styles.createWrapper}>
            <ScrollView style={styles.createContainer} showsVerticalScrollIndicator={false} contentContainerStyle={styles.createScrollContent}>
                {creationSuccess ? (
                    <View style={styles.successContainer}>
                        <Text style={styles.successIcon}>✓</Text>
                        <Text style={styles.successTitle}>{TRANSLATIONS[language].createSuccess}</Text>
                        <Text style={styles.successId}>#{creationSuccess.id}</Text>
                        <TouchableOpacity style={styles.successBtn} onPress={() => { setActiveTab('queue'); setCreationSuccess(null); clearForm(); }}>
                            <Text style={styles.successBtnText}>{TRANSLATIONS[language].createViewQueue}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.successBtnAlt} onPress={() => { setCreationSuccess(null); clearForm(); }}>
                            <Text style={styles.successBtnAltText}>{TRANSLATIONS[language].createAnother}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {/* Client */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createClientDetails}</Text>
                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createPhone} *</Text>
                            <View style={styles.phoneRow}>
                                <TextInput style={[styles.input, styles.phoneInput, phoneError && styles.inputError, !isDark && styles.inputLight]} placeholder="+996..."
                                    value={newOrder.clientPhone} onChangeText={t => setNewOrder({ ...newOrder, clientPhone: t })}
                                    onBlur={handlePhoneBlur} keyboardType="phone-pad" placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />
                            </View>
                            {phoneError && <Text style={styles.errorText}>{phoneError}</Text>}
                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createName}</Text>
                            <TextInput style={[styles.input, !isDark && styles.inputLight]} placeholder={TRANSLATIONS[language].createName} value={newOrder.clientName}
                                onChangeText={t => setNewOrder({ ...newOrder, clientName: t })} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />
                        </View>

                        {/* Location */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <View style={styles.formSectionHeader}>
                                <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createLocation}</Text>
                            </View>

                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createDistrict} *</Text>
                            {/* Autocomplete-style District Input */}
                            <View style={{ zIndex: 10 }}>
                                <TextInput
                                    style={[styles.input, !isDark && styles.inputLight, { paddingRight: 40 }]}
                                    placeholder="e.g. Leninsky"
                                    value={newOrder.area}
                                    onChangeText={t => setNewOrder({ ...newOrder, area: t })}
                                    onFocus={() => setShowRecentAddr(true)}
                                    placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                />
                                {/* Dropdown Chevron */}
                                <TouchableOpacity style={styles.inputChevron} onPress={() => setShowRecentAddr(!showRecentAddr)}>
                                    <Text style={styles.inputChevronText}>▼</Text>
                                </TouchableOpacity>
                                {showRecentAddr && newOrder.area.length > 0 && (
                                    <View style={[styles.suggestionList, !isDark && styles.cardLight]}>
                                        {recentAddresses.filter(a => a.area.toLowerCase().includes(newOrder.area.toLowerCase())).slice(0, 3).map((a, i) => (
                                            <TouchableOpacity key={i} style={styles.suggestionItem} onPress={() => {
                                                setNewOrder({ ...newOrder, area: a.area, fullAddress: a.fullAddress }); // Also fill address if user picks distinct recent
                                                setShowRecentAddr(false);
                                            }}>
                                                <Text style={[styles.suggestionText, !isDark && styles.textDark]}>{a.area} - {a.fullAddress.substring(0, 20)}...</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>

                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createFullAddress} *</Text>
                            <TextInput style={[styles.input, !isDark && styles.inputLight]}
                                placeholder={TRANSLATIONS[language].createFullAddress}
                                value={newOrder.fullAddress}
                                onChangeText={t => setNewOrder({ ...newOrder, fullAddress: t })}
                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            />
                        </View>

                        {/* Service */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].createServiceType}</Text>
                            <View style={styles.serviceGrid}>
                                {SERVICE_TYPES.map(s => (
                                    <TouchableOpacity key={s.id} style={[styles.serviceBtn, newOrder.serviceType === s.id && styles.serviceBtnActive, !isDark && newOrder.serviceType !== s.id && styles.btnLight]}
                                        onPress={() => setNewOrder({ ...newOrder, serviceType: s.id })}>
                                        <Text style={[styles.serviceBtnText, !isDark && newOrder.serviceType !== s.id && styles.textDark, newOrder.serviceType === s.id && styles.serviceBtnTextActive]}>{s.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>Problem Description *</Text>
                            <TextInput style={[styles.input, styles.textArea, !isDark && styles.inputLight]} placeholder="Describe the issue..." value={newOrder.problemDescription}
                                onChangeText={t => setNewOrder({ ...newOrder, problemDescription: t })} multiline numberOfLines={3} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />
                        </View>

                        {/* Schedule */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>Schedule</Text>
                            <View style={styles.urgencyRow}>
                                {['planned', 'urgent', 'emergency'].map(u => (
                                    <TouchableOpacity key={u} style={[styles.urgencyBtn, newOrder.urgency === u && styles.urgencyBtnActive,
                                    u === 'emergency' && { borderColor: '#ef4444' }, !isDark && newOrder.urgency !== u && styles.btnLight]}
                                        onPress={() => setNewOrder({ ...newOrder, urgency: u })}>
                                        <Text style={[styles.urgencyText, !isDark && newOrder.urgency !== u && styles.textDark, newOrder.urgency === u && styles.urgencyTextActive]}>{u}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Pricing */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>Pricing</Text>
                            <View style={styles.pricingRow}>
                                <View style={styles.priceInputItem}>
                                    <Text style={[styles.inputLabel, !isDark && styles.textSecondary]}>Amount (KGS)</Text>
                                    <TextInput
                                        style={[styles.input, !isDark && styles.inputLight]}
                                        placeholder={TRANSLATIONS[language].createPrice}
                                        keyboardType="numeric"
                                        value={newOrder.price}
                                        onChangeText={t => setNewOrder({ ...newOrder, price: t })}
                                        placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                                    />
                                </View>
                            </View>
                        </View>

                        {/* Internal Note */}
                        <View style={[styles.formSection, !isDark && styles.formSectionLight]}>
                            <Text style={[styles.formSectionTitle, !isDark && styles.textDark]}>{TRANSLATIONS[language].sectionNote}</Text>
                            <TextInput
                                style={[styles.input, styles.textArea, !isDark && styles.inputLight]}
                                placeholder={TRANSLATIONS[language].createInternalNote}
                                value={newOrder.dispatcherNote}
                                onChangeText={t => setNewOrder({ ...newOrder, dispatcherNote: t })}
                                multiline
                                numberOfLines={2}
                                placeholderTextColor={isDark ? "#64748b" : "#94a3b8"}
                            />
                        </View>

                        {/* Spacer for fixed bottom bar */}
                        <View style={{ height: 120 }} />
                    </>
                )}
            </ScrollView>

            {/* Fixed Bottom Bar */}
            {
                !creationSuccess && (
                    <View style={[styles.fixedBottomBar, !isDark && styles.fixedBottomBarLight]}>
                        <TouchableOpacity style={styles.confirmRow} onPress={() => setConfirmChecked(!confirmChecked)}>
                            <View style={[styles.checkbox, confirmChecked && styles.checkboxChecked]}>
                                {confirmChecked && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                            <Text style={[styles.confirmLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].createConfirm}</Text>
                        </TouchableOpacity>
                        <View style={styles.bottomBarButtons}>
                            <TouchableOpacity style={[styles.bottomClearBtn, !isDark && styles.btnLight]} onPress={clearForm}>
                                <Text style={[styles.bottomClearBtnText, !isDark && styles.textSecondary]}>{TRANSLATIONS[language].createClear}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.bottomPublishBtn, (!confirmChecked || actionLoading) && styles.bottomPublishBtnDisabled]}
                                onPress={handleCreateOrder} disabled={!confirmChecked || actionLoading}>
                                {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.bottomPublishBtnText}>{TRANSLATIONS[language].createPublish}</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                )
            }
        </View >
    );

    // Details Drawer
    const renderDetailsDrawer = () => {
        if (!detailsOrder) return null;
        const handleSaveEdit = async () => {
            setActionLoading(true);
            try {
                // Prepare updates - including client details
                const updates = {
                    problem_description: editForm.problem_description,
                    dispatcher_note: editForm.dispatcher_note,
                    full_address: editForm.full_address,
                    client: { // We need to update client info too if changed
                        full_name: editForm.client_name || detailsOrder.client?.full_name,
                        phone: editForm.client_phone || detailsOrder.client?.phone
                    }
                };

                // For now, assume updateOrderInline handles these. Real implementation might need separate calls or JSONB updates.
                // We'll pass them as separate fields for now if the backend supports it, or just description/note.
                // Based on standard implementation, we might need a specific endpoint for client details.
                // Falling back to just order details if complex.

                // Pass the prepared updates object which includes client details and other fields
                const result = await ordersService.updateOrderInline(detailsOrder.id, updates);

                if (result.success) {
                    showToast?.('Order updated', 'success');
                    setIsEditing(false);
                    await loadData();
                    // Update local state to reflect changes immediately
                    setDetailsOrder(prev => ({
                        ...prev,
                        ...editForm,
                        client: {
                            ...prev.client,
                            full_name: editForm.client_name,
                            phone: editForm.client_phone
                        }
                    }));
                } else { showToast?.('Update failed', 'error'); }
            } catch (e) { showToast?.('Update error', 'error'); }
            finally { setActionLoading(false); }
        };

        return (
            <Modal visible={!!detailsOrder} transparent animationType="none">
                <View style={styles.drawerOverlay}>
                    <TouchableOpacity style={styles.drawerBackdrop} onPress={() => setDetailsOrder(null)} />
                    <View style={[styles.drawerContent, !isDark && styles.drawerContentLight]}>
                        <View style={[styles.drawerHeader, !isDark && styles.drawerHeaderLight]}>
                            <View>
                                <Text style={[styles.drawerTitle, !isDark && styles.textDark]}>Order #{detailsOrder.id.slice(0, 8)}</Text>
                                <Text style={styles.drawerDate}>{new Date(detailsOrder.created_at).toLocaleString()}</Text>
                            </View>
                            <View style={styles.drawerActions}>
                                {/* Edit Button */}
                                <TouchableOpacity
                                    style={[styles.editBtn, isEditing && styles.editBtnActive]}
                                    onPress={() => {
                                        if (isEditing) {
                                            // If canceling edit
                                            setIsEditing(false);
                                        } else {
                                            // Start editing
                                            setEditForm({
                                                ...detailsOrder,
                                                client_name: detailsOrder.client?.full_name,
                                                client_phone: detailsOrder.client?.phone
                                            });
                                            setIsEditing(true);
                                        }
                                    }}>
                                    <Text style={[styles.editBtnText, isEditing && styles.editBtnTextActive]}>
                                        {isEditing ? TRANSLATIONS[language].btnCancelEdit : TRANSLATIONS[language].btnEdit}
                                    </Text>
                                </TouchableOpacity>

                                {/* Close Drawer Button (X) - Always visible and distinct */}
                                <TouchableOpacity onPress={() => { setDetailsOrder(null); setIsEditing(false); }} style={{ padding: 8, marginLeft: 8 }}>
                                    <Text style={[styles.drawerActionText, !isDark && styles.textDark, { fontSize: 24 }]}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                        <ScrollView style={styles.drawerBody}>
                            {/* Status */}
                            <View style={styles.drawerSection}>
                                <View style={styles.drawerStatusRow}>
                                    <View style={[styles.drawerStatusBadge, { backgroundColor: STATUS_COLORS[detailsOrder.status] }]}>
                                        <Text style={styles.drawerStatusText}>{detailsOrder.status?.replace(/_/g, ' ')}</Text>
                                    </View>
                                    {detailsOrder.status === 'placed' && (
                                        <TouchableOpacity style={styles.drawerBtn} onPress={() => { setAssignTarget(detailsOrder); setDetailsOrder(null); setShowAssignModal(true); }}>
                                            <Text style={styles.drawerBtnText}>{TRANSLATIONS[language].actionClaim}</Text>
                                        </TouchableOpacity>
                                    )}
                                    {detailsOrder.status === 'completed' && (
                                        <TouchableOpacity style={[styles.drawerBtn, { backgroundColor: '#22c55e' }]} onPress={() => setShowPaymentModal(true)}>
                                            <Text style={styles.drawerBtnText}>{TRANSLATIONS[language].actionPay}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {isEditing ? (
                                <View style={styles.editSection}>
                                    {/* Client Editing */}
                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].clientName}</Text>
                                    <TextInput style={[styles.input, !isDark && styles.inputLight]} value={editForm.client_name || ''}
                                        onChangeText={t => setEditForm({ ...editForm, client_name: t })} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].clientPhone}</Text>
                                    <TextInput style={[styles.input, !isDark && styles.inputLight]} value={editForm.client_phone || ''}
                                        onChangeText={t => setEditForm({ ...editForm, client_phone: t })} keyboardType="phone-pad" placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    {/* Order Editing */}
                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].address}</Text>
                                    <TextInput style={[styles.input, !isDark && styles.inputLight]} value={editForm.full_address || ''}
                                        onChangeText={t => setEditForm({ ...editForm, full_address: t })} placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].description}</Text>
                                    <TextInput style={[styles.input, styles.textArea, !isDark && styles.inputLight]} value={editForm.problem_description || ''}
                                        onChangeText={t => setEditForm({ ...editForm, problem_description: t })} multiline placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    <Text style={[styles.inputLabel, !isDark && styles.textDark]}>{TRANSLATIONS[language].sectionNote}</Text>
                                    <TextInput style={[styles.input, styles.textArea, !isDark && styles.inputLight]} value={editForm.dispatcher_note || ''}
                                        onChangeText={t => setEditForm({ ...editForm, dispatcher_note: t })} multiline placeholderTextColor={isDark ? "#64748b" : "#94a3b8"} />

                                    <TouchableOpacity style={styles.saveEditBtn} onPress={handleSaveEdit} disabled={actionLoading}>
                                        {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveEditText}>{TRANSLATIONS[language].btnSaveChanges}</Text>}
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <>
                                    {/* Client */}
                                    <View style={styles.drawerSection}>
                                        <Text style={styles.drawerSectionTitle}>{TRANSLATIONS[language].sectionClient}</Text>
                                        <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                            <Text style={[styles.drawerCardTitle, !isDark && styles.textDark]}>{detailsOrder.client?.full_name || 'N/A'}</Text>
                                            <View style={styles.drawerRow}>
                                                <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{detailsOrder.client?.phone}</Text>
                                                <View style={styles.drawerRowBtns}>
                                                    <TouchableOpacity onPress={() => copyToClipboard(detailsOrder.client?.phone)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCopy}</Text></TouchableOpacity>
                                                    <TouchableOpacity onPress={() => Linking.openURL(`tel:${detailsOrder.client?.phone}`)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCall}</Text></TouchableOpacity>
                                                </View>
                                            </View>
                                            <View style={styles.drawerRow}>
                                                <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{detailsOrder.full_address}</Text>
                                                <TouchableOpacity onPress={() => copyToClipboard(detailsOrder.full_address)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCopy}</Text></TouchableOpacity>
                                            </View>
                                        </View>
                                    </View>
                                    {/* Master */}
                                    {detailsOrder.master && (
                                        <View style={styles.drawerSection}>
                                            <Text style={styles.drawerSectionTitle}>{TRANSLATIONS[language].sectionMaster}</Text>
                                            <View style={[styles.drawerCard, !isDark && styles.drawerCardLight]}>
                                                <Text style={[styles.drawerCardTitle, !isDark && styles.textDark]}>{detailsOrder.master.full_name}</Text>
                                                <View style={styles.drawerRow}>
                                                    <Text style={[styles.drawerRowText, !isDark && styles.textSecondary]}>{detailsOrder.master.phone}</Text>
                                                    <View style={styles.drawerRowBtns}>
                                                        <TouchableOpacity onPress={() => copyToClipboard(detailsOrder.master.phone)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCopy}</Text></TouchableOpacity>
                                                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${detailsOrder.master.phone}`)} style={styles.drawerIconBtn}><Text style={styles.drawerIconBtnText}>{TRANSLATIONS[language].btnCall}</Text></TouchableOpacity>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>
                                    )}
                                    {/* Details */}
                                    <View style={styles.drawerSection}>
                                        <Text style={styles.drawerSectionTitle}>{TRANSLATIONS[language].sectionDetails}</Text>
                                        <Text style={[styles.drawerDesc, !isDark && styles.textSecondary]}>{detailsOrder.problem_description}</Text>
                                    </View>
                                    {/* Financials */}
                                    <View style={styles.drawerSection}>
                                        <Text style={styles.drawerSectionTitle}>{TRANSLATIONS[language].sectionFinancials}</Text>
                                        <View style={styles.finRow}>
                                            <Text style={styles.finLabel}>{TRANSLATIONS[language].labelCallout}</Text>
                                            <Text style={[styles.finValue, !isDark && styles.textDark]}>{detailsOrder.guaranteed_payout || '-'}c</Text>
                                        </View>
                                        <View style={styles.finRow}>
                                            <Text style={styles.finLabel}>{detailsOrder.final_price ? TRANSLATIONS[language].labelFinal : TRANSLATIONS[language].labelInitial}</Text>
                                            <Text style={[styles.finValue, !isDark && styles.textDark, detailsOrder.final_price && { color: '#22c55e' }]}>
                                                {detailsOrder.final_price || detailsOrder.initial_price || 'Open'}c
                                            </Text>
                                        </View>
                                    </View>
                                    {/* Note */}
                                    {detailsOrder.dispatcher_note && (
                                        <View style={styles.drawerSection}>
                                            <Text style={[styles.drawerSectionTitle, { color: '#f59e0b' }]}>{TRANSLATIONS[language].sectionNote}</Text>
                                            <Text style={styles.drawerNote}>{detailsOrder.dispatcher_note}</Text>
                                        </View>
                                    )}
                                    {/* Actions */}
                                    {['canceled_by_master', 'canceled_by_client'].includes(detailsOrder.status) && (
                                        <TouchableOpacity style={styles.reopenBtn} onPress={() => { handleReopen(detailsOrder.id); setDetailsOrder(null); }}>
                                            <Text style={styles.reopenText}>↻ {TRANSLATIONS[language].actionReopen}</Text>
                                        </TouchableOpacity>
                                    )}
                                    {detailsOrder.status === 'placed' && (
                                        <TouchableOpacity style={styles.cancelBtn} onPress={() => { handleCancel(detailsOrder.id); setDetailsOrder(null); }}>
                                            <Text style={styles.cancelText}>Cancel Order</Text>
                                        </TouchableOpacity>
                                    )}
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        );
    };

    // Payment Modal
    const renderPaymentModal = () => (
        <Modal visible={showPaymentModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>{TRANSLATIONS[language].titlePayment}</Text>
                    <Text style={styles.modalAmount}>{TRANSLATIONS[language].labelAmount} {detailsOrder?.final_price}c</Text>
                    <View style={styles.paymentMethods}>
                        {['cash', 'transfer', 'card'].map(m => (
                            <TouchableOpacity key={m} style={[styles.paymentMethod, paymentData.method === m && styles.paymentMethodActive]}
                                onPress={() => setPaymentData({ ...paymentData, method: m })}>
                                <Text style={styles.paymentMethodText}>{m}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    {paymentData.method === 'transfer' && (
                        <TextInput style={styles.input} placeholder={TRANSLATIONS[language].labelProof} value={paymentData.proofUrl}
                            onChangeText={t => setPaymentData({ ...paymentData, proofUrl: t })} placeholderTextColor="#64748b" />
                    )}
                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={styles.modalCancel} onPress={() => setShowPaymentModal(false)}>
                            <Text style={styles.modalCancelText}>{TRANSLATIONS[language].cancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modalConfirm} onPress={handleConfirmPayment} disabled={actionLoading}>
                            {actionLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalConfirmText}>{TRANSLATIONS[language].createConfirm}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );

    // Assign Modal
    const renderAssignModal = () => (
        <Modal visible={showAssignModal} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <Text style={styles.modalTitle}>{TRANSLATIONS[language].titleSelectMaster}</Text>
                    <ScrollView style={styles.mastersList}>
                        {masters.map(m => (
                            <TouchableOpacity key={m.id} style={styles.masterItem} onPress={() => handleAssignMaster(m)}>
                                <Text style={styles.masterName}>{m.full_name}</Text>
                                <Text style={styles.masterInfo}>{TRANSLATIONS[language].labelRating}: {m.rating} • {m.active_jobs}/{m.max_active_jobs} {TRANSLATIONS[language].labelJobs}</Text>
                            </TouchableOpacity>
                        ))}
                        {masters.length === 0 && <Text style={styles.noMasters}>{TRANSLATIONS[language].noMasters}</Text>}
                    </ScrollView>
                    <TouchableOpacity style={styles.modalCancel} onPress={() => { setShowAssignModal(false); setAssignTarget(null); }}>
                        <Text style={styles.modalCancelText}>{TRANSLATIONS[language].cancel}</Text>
                    </TouchableOpacity>
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
        <LinearGradient colors={isDark ? ['#0f172a', '#1e293b'] : ['#f1f5f9', '#e2e8f0']} style={styles.container}>
            {renderSidebar()}
            {renderHeader()}
            {activeTab === 'queue' && renderQueue()}
            {activeTab === 'create' && renderCreateOrder()}
            {renderDetailsDrawer()}
            {renderPaymentModal()}
            {renderAssignModal()}
            {renderPickerModal()}
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    // Theme - Light Mode
    headerLight: { borderBottomColor: '#cbd5e1', backgroundColor: '#fff' },
    textDark: { color: '#0f172a' },
    btnLight: { backgroundColor: '#e2e8f0' },
    sidebarContainerLight: { backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#e2e8f0' },
    sidebarHeaderLight: { borderBottomColor: '#f1f5f9' },
    sidebarFooterLight: { borderTopColor: '#f1f5f9' },
    sidebarBtnLight: { backgroundColor: '#f1f5f9' },

    // Picker Modal Styles
    pickerContent: { width: '85%', maxHeight: '60%', backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.25, shadowRadius: 3.84, elevation: 5 },
    pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 12 },
    pickerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
    pickerClose: { fontSize: 18, color: '#94a3b8', padding: 4 },
    pickerScroll: { maxHeight: 400 },
    pickerOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
    pickerOptionActive: { backgroundColor: '#eff6ff', borderRadius: 8 },
    pickerOptionText: { fontSize: 16, color: '#334155' },
    pickerOptionTextActive: { color: '#3b82f6', fontWeight: '600' },
    pickerCheck: { color: '#3b82f6', fontSize: 16, fontWeight: '700' },

    // Header
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)' },
    headerLeft: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
    headerRight: { flexDirection: 'row', gap: 8 },
    iconBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    iconText: { fontSize: 18, color: '#94a3b8' },

    // Tabs
    tabsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
    tabBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)' },
    tabActive: { backgroundColor: '#3b82f6' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
    tabTextActive: { color: '#fff' },
    tabBadge: { marginLeft: 6, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    tabBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

    // Filters
    filtersContainer: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
    searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    searchInput: { flex: 1, backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14 },
    filterToggle: { width: 44, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    filterToggleActive: { backgroundColor: '#3b82f6' },
    filterToggleText: { fontSize: 16, color: '#94a3b8' },
    statusScroll: { marginBottom: 8 },
    statusTab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(71,85,105,0.3)', marginRight: 6 },
    statusTabActive: { backgroundColor: '#3b82f6' },
    statusTabText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
    statusTabTextActive: { color: '#fff' },
    dropdownFilters: { backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: 12, padding: 12, marginBottom: 8 },
    filterItem: { marginBottom: 8 },
    filterLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', marginBottom: 4, textTransform: 'uppercase' },
    filterOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    filterOpt: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(71,85,105,0.4)' },
    filterOptActive: { backgroundColor: '#3b82f6' },
    filterOptText: { fontSize: 11, fontWeight: '600', color: '#94a3b8', textTransform: 'capitalize' },
    filterOptTextActive: { color: '#fff' },
    viewModeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    viewModeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(71,85,105,0.4)', alignItems: 'center' },
    viewModeActive: { backgroundColor: '#3b82f6' },
    viewModeText: { fontSize: 12, fontWeight: '600', color: '#fff' },

    // Needs Attention
    attentionContainer: { margin: 16, marginTop: 8, marginBottom: 0, backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
    attentionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
    attentionTitle: { fontSize: 12, fontWeight: '700', color: '#ef4444' },
    attentionChevron: { fontSize: 12, color: '#ef4444' },
    attentionScroll: { paddingHorizontal: 12, paddingBottom: 12 },
    attentionCard: { width: 140, backgroundColor: 'rgba(30,41,59,0.9)', borderRadius: 10, padding: 10, marginRight: 8 },
    attentionBadge: { fontSize: 9, fontWeight: '700', color: '#fff', backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 6 },
    attentionService: { fontSize: 13, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
    attentionAddr: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

    // Queue
    queueContainer: { flex: 1 },
    listContent: { padding: 16, paddingBottom: 100 },
    empty: { alignItems: 'center', paddingVertical: 60 },
    emptyText: { fontSize: 16, color: '#64748b' },

    // Compact Row
    compactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: 10, padding: 12, marginBottom: 8 },
    compactLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
    compactService: { fontSize: 14, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
    compactAddr: { fontSize: 12, color: '#94a3b8', maxWidth: 200 },
    compactRight: { flexDirection: 'row', alignItems: 'center' },
    compactTime: { fontSize: 11, color: '#64748b', marginRight: 8 },
    compactChevron: { fontSize: 18, color: '#64748b' },

    // Order Card
    orderCard: { width: (SCREEN_WIDTH - 48) / 2, backgroundColor: 'rgba(30,41,59,0.9)', borderRadius: 12, padding: 12, marginBottom: 12, marginRight: 12 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    cardService: { fontSize: 14, fontWeight: '700', color: '#fff', textTransform: 'capitalize' },
    cardStatus: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    cardStatusText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
    cardAddr: { fontSize: 12, color: '#94a3b8', marginBottom: 8 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between' },
    cardClient: { fontSize: 11, color: '#64748b' },
    cardTime: { fontSize: 10, color: '#64748b' },
    cardPayBtn: { backgroundColor: '#22c55e', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
    cardPayText: { fontSize: 12, fontWeight: '700', color: '#fff' },

    // Create Form
    createContainer: { flex: 1, padding: 16 },
    formSection: { backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: 16, padding: 16, marginBottom: 12 },
    formSectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    formSectionTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 12 },
    inputLabel: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 4, marginTop: 8 },
    input: { backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14 },
    inputError: { borderWidth: 1, borderColor: '#ef4444' },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    phoneRow: { flexDirection: 'row', gap: 8 },
    phoneInput: { flex: 1 },
    errorText: { fontSize: 10, color: '#ef4444', marginTop: 4 },
    recentBtn: { fontSize: 11, color: '#3b82f6', fontWeight: '600' },
    recentList: { backgroundColor: 'rgba(30,41,59,0.95)', borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(71,85,105,0.5)' },
    recentItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)' },
    recentArea: { fontSize: 12, fontWeight: '600', color: '#fff' },
    recentAddr: { fontSize: 11, color: '#94a3b8' },
    serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    serviceBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(71,85,105,0.3)', borderWidth: 1, borderColor: 'transparent' },
    serviceBtnActive: { backgroundColor: '#8b5cf6', borderColor: '#8b5cf6' },
    serviceBtnText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
    serviceBtnTextActive: { color: '#fff' },
    urgencyRow: { flexDirection: 'row', gap: 8 },
    urgencyBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(71,85,105,0.3)', alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
    urgencyBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
    urgencyText: { fontSize: 12, fontWeight: '600', color: '#94a3b8', textTransform: 'capitalize' },
    urgencyTextActive: { color: '#fff' },
    pricingRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    pricingBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(71,85,105,0.3)', alignItems: 'center' },
    pricingBtnActive: { backgroundColor: '#22c55e' },
    pricingBtnText: { fontSize: 12, fontWeight: '600', color: '#fff' },
    createFooter: { backgroundColor: 'rgba(30,41,59,0.95)', borderRadius: 16, padding: 16 },
    confirmRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#64748b', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
    checkboxChecked: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
    checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
    confirmLabel: { fontSize: 13, fontWeight: '600', color: '#fff' },
    createButtons: { flexDirection: 'row', gap: 8 },
    clearBtn: { width: 50, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center', paddingVertical: 14 },
    clearBtnText: { fontSize: 18 },
    publishBtn: { flex: 1, borderRadius: 10, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center', paddingVertical: 14 },
    publishBtnDisabled: { backgroundColor: '#334155', opacity: 0.6 },
    publishBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    // Success
    successContainer: { alignItems: 'center', paddingVertical: 60 },
    successIcon: { fontSize: 64, color: '#22c55e', marginBottom: 16 },
    successTitle: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
    successId: { fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#94a3b8', marginBottom: 24 },
    successBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, marginBottom: 12 },
    successBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
    successBtnAlt: { paddingHorizontal: 24, paddingVertical: 14 },
    successBtnAltText: { fontSize: 14, fontWeight: '600', color: '#3b82f6' },

    // Drawer
    drawerOverlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
    drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    drawerContent: { width: SCREEN_WIDTH > 500 ? 400 : SCREEN_WIDTH * 0.85, backgroundColor: '#1e293b', height: '100%' },
    drawerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)' },
    drawerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    drawerDate: { fontSize: 11, color: '#64748b' },
    drawerActions: { flexDirection: 'row', gap: 12 },
    drawerActionText: { fontSize: 18, color: '#94a3b8' },
    drawerBody: { flex: 1, padding: 16 },
    drawerSection: { marginBottom: 16 },
    drawerStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    drawerStatusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    drawerStatusText: { fontSize: 12, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
    drawerBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#3b82f6' },
    drawerBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    drawerSectionTitle: { fontSize: 10, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 8 },
    drawerCard: { backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 10, padding: 12 },
    drawerCardTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 4 },
    drawerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
    drawerRowText: { fontSize: 13, color: '#94a3b8', flex: 1 },
    drawerRowBtns: { flexDirection: 'row', gap: 8 },
    drawerDesc: { fontSize: 13, color: '#94a3b8', lineHeight: 20 },
    finRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    finLabel: { fontSize: 12, color: '#64748b' },
    finValue: { fontSize: 14, fontWeight: '700', color: '#fff' },
    drawerNote: { fontSize: 13, color: '#f59e0b', fontStyle: 'italic', backgroundColor: 'rgba(245,158,11,0.1)', padding: 10, borderRadius: 8 },
    editSection: { marginBottom: 16 },
    saveEditBtn: { backgroundColor: '#3b82f6', paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 12 },
    saveEditText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    reopenBtn: { backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    reopenText: { fontSize: 13, fontWeight: '600', color: '#fff' },
    cancelBtn: { backgroundColor: '#ef4444', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
    cancelText: { fontSize: 13, fontWeight: '600', color: '#fff' },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', paddingHorizontal: 20 },
    modalContent: { backgroundColor: '#1e293b', borderRadius: 20, padding: 24 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 8 },
    modalAmount: { fontSize: 16, color: '#22c55e', fontWeight: '600', marginBottom: 16 },
    paymentMethods: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    paymentMethod: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.4)', alignItems: 'center' },
    paymentMethodActive: { backgroundColor: '#3b82f6' },
    paymentMethodText: { fontSize: 13, fontWeight: '600', color: '#fff', textTransform: 'capitalize' },
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 16 },
    modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.4)', alignItems: 'center' },
    modalCancelText: { fontSize: 14, fontWeight: '500', color: '#fff' },
    modalConfirm: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#22c55e', alignItems: 'center' },
    modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    mastersList: { maxHeight: 300, marginBottom: 16 },
    masterItem: { backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 10, padding: 12, marginBottom: 8 },
    masterName: { fontSize: 14, fontWeight: '700', color: '#fff' },
    masterInfo: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    noMasters: { fontSize: 14, color: '#64748b', textAlign: 'center', paddingVertical: 20 },

    // Sidebar
    sidebarOverlay: { flex: 1, flexDirection: 'row' },
    sidebarBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sidebarContainer: { width: 280, height: '100%', backgroundColor: '#1e293b', borderRightWidth: 1, borderRightColor: 'rgba(71,85,105,0.3)' },
    sidebarHeader: { height: 64, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)' },
    sidebarTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
    sidebarClose: { padding: 8 },
    sidebarCloseText: { fontSize: 16, color: '#94a3b8' },
    sidebarNav: { flex: 1, paddingVertical: 20, paddingHorizontal: 16 },
    sidebarNavItem: { paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, marginBottom: 4 },
    sidebarNavItemActive: { backgroundColor: '#3b82f6' },
    sidebarNavText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
    sidebarNavTextActive: { color: '#fff' },
    sidebarFooter: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(71,85,105,0.3)' },
    sidebarButtonRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    sidebarSmallBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    sidebarSmallBtnText: { fontSize: 18 },
    sidebarUserCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 12 },
    sidebarUserAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center' },
    sidebarUserAvatarText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    sidebarUserInfo: { flex: 1, marginLeft: 10 },
    sidebarUserName: { fontSize: 13, fontWeight: '700', color: '#fff' },
    sidebarUserStatus: { fontSize: 10, color: '#22c55e' },
    sidebarLogoutBtn: { padding: 8 },
    sidebarLogoutText: { fontSize: 16, color: '#ef4444' },

    // Menu Button (Header)
    menuBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    menuBtnText: { fontSize: 20, color: '#fff' },

    // Search Input Wrapper
    searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(71,85,105,0.3)', borderRadius: 12, paddingHorizontal: 12 },
    searchIcon: { fontSize: 16, color: '#64748b', marginRight: 8 },
    searchClear: { padding: 4 },
    searchClearText: { fontSize: 12, color: '#64748b' },

    // Filter Controls Row
    filterControlsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    viewToggleBtn: { width: 40, height: 34, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(71,85,105,0.5)' },
    viewToggleBtnText: { fontSize: 18, color: '#fff' },
    filterToggleBtn: { width: 40, height: 34, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(71,85,105,0.5)' },
    filterToggleBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
    filterToggleBtnText: { fontSize: 14, color: '#94a3b8' },
    filterDropdown: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 34, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', borderWidth: 1, borderColor: 'rgba(71,85,105,0.5)' },
    filterDropdownText: { fontSize: 12, fontWeight: '600', color: '#fff', marginRight: 4 },
    filterDropdownArrow: { fontSize: 10, color: '#64748b' },

    // Drawer Icon Buttons
    drawerIconBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: 'rgba(59,130,246,0.2)', borderRadius: 6 },
    drawerIconBtnText: { fontSize: 10, fontWeight: '600', color: '#3b82f6' },

    // Sidebar Language Button
    sidebarLangBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center' },
    sidebarLangText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    sidebarThemeIcon: { fontSize: 20, color: '#94a3b8' },

    // Filter Show/Hide Button
    filterShowBtn: { paddingHorizontal: 14, height: 34, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(71,85,105,0.5)' },
    filterShowBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
    filterShowBtnText: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
    filterShowBtnTextActive: { color: '#fff' },

    // Filter Dropdown Row
    filterDropdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },

    // Clear Filters Button
    clearFiltersBtn: { paddingHorizontal: 14, height: 34, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
    clearFiltersBtnText: { fontSize: 12, fontWeight: '600', color: '#ef4444' },

    // Compact List View (Enhanced)
    compactStatusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 10 },
    compactStatusText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase' },
    compactMain: { flex: 1 },
    compactTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    compactId: { fontSize: 11, fontWeight: '600', color: '#64748b', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    compactUrgency: { fontSize: 9, fontWeight: '700', color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.2)', paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
    compactUrgencyEmergency: { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.2)' },
    compactBottomRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    compactClient: { fontSize: 11, color: '#94a3b8' },
    compactMaster: { fontSize: 11, color: '#22c55e' },
    compactPrice: { fontSize: 11, fontWeight: '700', color: '#22c55e' },

    // Create Order Wrapper & Fixed Bottom Bar
    createWrapper: { flex: 1 },
    createScrollContent: { paddingBottom: 20 },
    fixedBottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1e293b', borderTopWidth: 1, borderTopColor: 'rgba(71,85,105,0.3)', padding: 12, paddingBottom: Platform.OS === 'ios' ? 28 : 12 },
    bottomBarButtons: { flexDirection: 'row', gap: 12 },
    bottomClearBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, backgroundColor: 'rgba(71,85,105,0.3)', alignItems: 'center' },
    bottomClearBtnText: { fontSize: 14, fontWeight: '600', color: '#94a3b8' },
    bottomPublishBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#3b82f6', alignItems: 'center' },
    bottomPublishBtnDisabled: { backgroundColor: '#475569', opacity: 0.7 },
    bottomPublishBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    // Pagination
    pagination: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
    pageBtn: { width: 32, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(71,85,105,0.3)' },
    pageBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
    pageBtnText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
    pageBtnTextActive: { color: '#fff' },

    // Light Theme specific overrides
    cardLight: { backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderWidth: 1, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    textSecondary: { color: '#64748b' },

    // Drawer Light
    drawerContentLight: { backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: '#e2e8f0' },
    drawerHeaderLight: { borderBottomColor: '#f1f5f9' },
    drawerCardLight: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1 },
    inputLight: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1, color: '#0f172a' },
    btnLight: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },

    // UX Improvements
    editBtn: {
        paddingVertical: 6,
        paddingHorizontal: 16,
        backgroundColor: '#e2e8f0',
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 80, // Ensure minimum width for symmetry
        borderWidth: 1,
        borderColor: '#cbd5e1'
    },
    editBtnText: { fontSize: 13, fontWeight: '600', color: '#3b82f6' },
    editBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
    editBtnTextActive: { color: '#fff' },

    // Form Light
    formSectionLight: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    priceInputItem: { flex: 1 },

    // Suggestion List
    suggestionList: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: '#1e293b', borderWidth: 1, borderColor: 'rgba(71,85,105,0.5)', borderRadius: 8, zIndex: 100, maxHeight: 150 },
    suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(71,85,105,0.3)' },
    suggestionText: { color: '#fff', fontSize: 13 },

    // Needs Attention Header
    attentionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    miniSortBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(59,130,246,0.2)' },
    miniSortText: { fontSize: 10, color: '#3b82f6', fontWeight: '600' },

    // Fixed Bottom Bar - Light Theme Fix
    fixedBottomBarLight: { backgroundColor: '#fff', borderTopColor: '#e2e8f0' },

    // Clean Sort Button
    cleanSortBtn: { paddingHorizontal: 4 },
    cleanSortText: { fontSize: 13, color: '#3b82f6', fontWeight: '500' },

    // Mini Filter Button
    miniFilterBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(71,85,105,0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    miniFilterText: { fontSize: 11, color: '#94a3b8', marginRight: 4 },
    miniFilterArrow: { fontSize: 10, color: '#94a3b8' },

    // Input Chevron
    inputChevron: { position: 'absolute', right: 10, top: 12, alignItems: 'center', justifyContent: 'center', zIndex: 11 },
    inputChevronText: { color: '#94a3b8', fontSize: 12 },
});
